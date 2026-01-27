/**
 * World loader for MCPR replay mode
 * Loads chunks from a world archive (zip or tar.gz) into bot.world
 */
import JSZip from 'jszip'
import fs from 'fs'
import * as browserfs from 'browserfs'
import { setLoadingScreenStatus } from '../appStatus'
import { getFixedFilesize } from '../react/simpleUtils'
import * as nbt from 'prismarine-nbt'

// Debug logging - disabled verbose console output to prevent crashes
const DEBUG_ENABLED = false
const debugLog = (msg: string, data?: any) => {
  if (!DEBUG_ENABLED) return
  const entry = { time: Date.now(), msg, data };
  (window as any)._worldLoadDebug = (window as any)._worldLoadDebug || [];
  (window as any)._worldLoadDebug.push(entry);
  console.log('[WorldLoader]', msg, data);
};

// Mount points for MCPR world - InMemory filesystem
const mcprMountPoints = {
  '/mcpr-world': { fs: 'InMemory' }
};

// Store region file data in memory for direct access
const regionFileData = new Map<string, Uint8Array>();

/**
 * Initialize BrowserFS with InMemory mount for MCPR world data
 */
async function initMcprFilesystem(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get existing mount points and add mcpr-world
    const defaultMountablePoints = {
      '/data': { fs: 'IndexedDB' },
      '/resourcepack': { fs: 'InMemory' },
      '/temp': { fs: 'InMemory' },
      '/mcpr-world': { fs: 'InMemory' }
    };

    browserfs.configure({
      fs: 'MountableFileSystem',
      options: defaultMountablePoints,
    }, (e) => {
      if (e) {
        debugLog('browserfs configure error', { error: e.message });
        reject(e);
      } else {
        debugLog('browserfs configured with mcpr-world mount');
        resolve();
      }
    });
  });
}

export interface WorldLoaderOptions {
  worldUrl: string
  version: string
  onProgress?: (message: string) => void
}

/**
 * Download a file with progress reporting
 */
async function downloadWithProgress(url: string, onProgress?: (message: string) => void): Promise<ArrayBuffer> {
  const response = await fetch(url)
  const contentLength = response.headers?.get('Content-Length')
  const size = contentLength ? +contentLength : undefined

  if (!response.body) {
    throw new Error('Server returned no response body')
  }

  let downloadedBytes = 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    downloadedBytes += value.byteLength

    const progress = size ? Math.floor((downloadedBytes / size) * 100) : '?'
    const message = `Downloading world: ${progress}% (${getFixedFilesize(downloadedBytes)}${size ? ` / ${getFixedFilesize(size)}` : ''})`
    onProgress?.(message)
    setLoadingScreenStatus(message, false, true)
  }

  // Combine chunks into single buffer
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result.buffer
}

/**
 * Parse tar archive and extract files
 * Tar format: 512-byte header + file content (padded to 512 bytes)
 */
function parseTar(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  const view = new Uint8Array(buffer)
  let offset = 0

  while (offset < view.length - 512) {
    // Read header
    const header = view.slice(offset, offset + 512)

    // Check for end of archive (two zero blocks)
    if (header.every(b => b === 0)) break

    // Extract filename (first 100 bytes, null-terminated)
    let nameEnd = 0
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++
    const name = new TextDecoder().decode(header.slice(0, nameEnd))

    // Extract size (bytes 124-135, octal string)
    const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim()
    const size = parseInt(sizeStr, 8) || 0

    // Extract file type (byte 156)
    const type = header[156]

    offset += 512 // Move past header

    // Only extract regular files (type 0 or '0' or empty)
    if (size > 0 && (type === 0 || type === 48 || type === 0x00)) {
      const content = view.slice(offset, offset + size)
      files.set(name, content)
    }

    // Move to next header (content + padding to 512 boundary)
    offset += Math.ceil(size / 512) * 512
  }

  return files
}

/**
 * Decompress gzip data
 */
async function decompressGzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  // Try native DecompressionStream first (modern browsers)
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip')
    const writer = ds.writable.getWriter()
    writer.write(new Uint8Array(buffer))
    writer.close()

    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    return result.buffer
  }

  // Fallback to pako if DecompressionStream not available
  const pako = await import('pako')
  const decompressed = pako.ungzip(new Uint8Array(buffer))
  return decompressed.buffer
}

/**
 * Extract world archive (zip or tar.gz)
 */
async function extractWorldArchive(
  buffer: ArrayBuffer,
  filename: string,
  onProgress?: (message: string) => void
): Promise<Map<string, Uint8Array>> {
  const isGzip = filename.endsWith('.gz') || filename.endsWith('.tgz')
  const isTar = filename.endsWith('.tar') || filename.endsWith('.tar.gz') || filename.endsWith('.tgz')
  const isZip = filename.endsWith('.zip')

  onProgress?.('Extracting world archive...')
  setLoadingScreenStatus('Extracting world archive...', false, true)

  if (isZip) {
    // Handle zip files with JSZip
    const zip = await JSZip.loadAsync(buffer)
    const files = new Map<string, Uint8Array>()

    const entries = Object.entries(zip.files)
    for (let i = 0; i < entries.length; i++) {
      const [path, file] = entries[i]
      if (!file.dir) {
        const content = await file.async('uint8array')
        files.set(path, content)
      }
      if (i % 10 === 0) {
        const progress = Math.floor((i / entries.length) * 100)
        onProgress?.(`Extracting: ${progress}%`)
      }
    }

    return files
  }

  if (isGzip) {
    onProgress?.('Decompressing gzip...')
    debugLog('decompressing gzip', { originalSize: buffer.byteLength })
    buffer = await decompressGzip(buffer)
    debugLog('decompressed', { newSize: buffer.byteLength })
  }

  if (isTar || isGzip) {
    onProgress?.('Parsing tar archive...')
    debugLog('parsing tar')
    const files = parseTar(buffer)
    debugLog('tar parsed', { fileCount: files.size, firstFiles: Array.from(files.keys()).slice(0, 20) })
    return files
  }

  throw new Error(`Unsupported archive format: ${filename}`)
}

/**
 * Write extracted files to browserfs
 */
async function writeFilesToBrowserFs(
  files: Map<string, Uint8Array>,
  basePath: string,
  onProgress?: (message: string) => void
): Promise<string[]> {
  const regionFiles: string[] = []

  const allPaths = Array.from(files.keys())
  debugLog('writeFilesToBrowserFs', { fileCount: files.size, allPaths: allPaths.slice(0, 30) })

  // Check for .mca files specifically
  const mcaFiles = allPaths.filter(p => p.endsWith('.mca'))
  debugLog('mca files found', { count: mcaFiles.length, paths: mcaFiles })

  // Find region files and write them
  for (const [path, content] of files) {
    // Normalize path and find region files
    const normalizedPath = path.replace(/\\/g, '/')

    // Skip macOS AppleDouble files (._*)
    const filename = normalizedPath.split('/').pop() || ''
    if (filename.startsWith('._')) continue

    // Look for region files in various locations (also check for 'region' at start or just .mca files)
    const isRegionFile = (normalizedPath.includes('/region/') || normalizedPath.startsWith('region/')) && normalizedPath.endsWith('.mca')

    if (normalizedPath.endsWith('.mca')) {
      debugLog('checking mca file', { path: normalizedPath, isRegionFile, hasRegion: normalizedPath.includes('/region/'), contentSize: content?.length })
    }

    if (isRegionFile) {
      const regionFilename = normalizedPath.split('/').pop()!
      const targetPath = `${basePath}/region/${regionFilename}`

      debugLog('writing region file', { from: normalizedPath, to: targetPath })

      // Ensure directory exists
      try {
        await fs.promises.mkdir(`${basePath}/region`, { recursive: true })
        debugLog('mkdir success', { path: `${basePath}/region` })
      } catch (mkdirErr: any) {
        debugLog('mkdir error', { path: `${basePath}/region`, error: mkdirErr?.message || mkdirErr })
      }

      // Write region file and store in memory for direct access
      try {
        await fs.promises.writeFile(targetPath, Buffer.from(content))
        // Also store in memory map for direct parsing (avoids RegionFile fs.open issues)
        regionFileData.set(targetPath, content)
        debugLog('writeFile success', { path: targetPath, size: content.length })
        regionFiles.push(targetPath)
        onProgress?.(`Extracted: ${regionFilename}`)
      } catch (writeErr: any) {
        debugLog('writeFile error', { path: targetPath, error: writeErr?.message || writeErr })
      }
    }
  }

  console.log('writeFilesToBrowserFs: Found', regionFiles.length, 'region files')
  return regionFiles
}

/**
 * Parse a region file from memory and extract chunk NBT data
 * Region file format:
 * - First 4KB: Chunk location table (1024 entries, 4 bytes each)
 * - Next 4KB: Chunk timestamp table (1024 entries, 4 bytes each)
 * - Rest: Chunk data sectors (4KB each)
 */
async function parseRegionFile(data: Uint8Array): Promise<Map<string, any>> {
  const chunks = new Map<string, any>()
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Read chunk locations (first 4KB = 1024 entries of 4 bytes)
  for (let localZ = 0; localZ < 32; localZ++) {
    for (let localX = 0; localX < 32; localX++) {
      const index = localX + localZ * 32
      const locationOffset = index * 4

      // Read 4-byte location entry (3 bytes offset, 1 byte sector count)
      const locationValue = view.getUint32(locationOffset, false) // big-endian
      const sectorOffset = (locationValue >> 8) & 0xFFFFFF
      const sectorCount = locationValue & 0xFF

      if (sectorOffset === 0 || sectorCount === 0) continue // Empty chunk

      const byteOffset = sectorOffset * 4096
      if (byteOffset >= data.length) continue

      try {
        // Read chunk header (4 bytes length + 1 byte compression type)
        const chunkLength = view.getUint32(byteOffset, false)
        const compressionType = data[byteOffset + 4]

        if (chunkLength <= 1 || byteOffset + 5 + chunkLength - 1 > data.length) continue

        // Extract compressed data
        const compressedData = data.slice(byteOffset + 5, byteOffset + 4 + chunkLength)

        // Decompress based on compression type (1=gzip, 2=zlib)
        let decompressed: Uint8Array
        if (compressionType === 1) {
          // Gzip - use DecompressionStream
          const ds = new DecompressionStream('gzip')
          const writer = ds.writable.getWriter()
          writer.write(compressedData)
          writer.close()
          const reader = ds.readable.getReader()
          const chunks: Uint8Array[] = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
          }
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
          decompressed = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of chunks) {
            decompressed.set(chunk, offset)
            offset += chunk.length
          }
        } else if (compressionType === 2) {
          // Zlib - use DecompressionStream with 'deflate-raw' or fallback to pako
          try {
            const ds = new DecompressionStream('deflate')
            const writer = ds.writable.getWriter()
            writer.write(compressedData)
            writer.close()
            const reader = ds.readable.getReader()
            const chunks: Uint8Array[] = []
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
            }
            const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
            decompressed = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of chunks) {
              decompressed.set(chunk, offset)
              offset += chunk.length
            }
          } catch {
            // Fallback to pako for zlib
            const pako = await import('pako')
            decompressed = pako.inflate(compressedData)
          }
        } else {
          continue // Unknown compression type
        }

        // Parse NBT
        const { parsed } = await nbt.parse(Buffer.from(decompressed))
        chunks.set(`${localX},${localZ}`, parsed)
      } catch {
        // Failed to parse this chunk, skip
      }
    }
  }

  return chunks
}

/**
 * Load chunks from region files into the world
 */
export async function loadChunksFromRegionFiles(
  regionPaths: string[],
  world: any,
  version: string,
  onProgress?: (message: string) => void
): Promise<number> {
  debugLog('loadChunksFromRegionFiles starting', { regionCount: regionPaths.length, version })
  let chunksLoaded = 0

  for (const regionPath of regionPaths) {
    const filename = regionPath.split('/').pop()!
    onProgress?.(`Loading chunks from ${filename}...`)
    setLoadingScreenStatus(`Loading chunks from ${filename}...`, false, true)

    // Get region data from memory map
    const regionData = regionFileData.get(regionPath)
    if (!regionData) {
      debugLog('region file not in memory', { path: regionPath })
      continue
    }

    try {
      debugLog('parsing region file', { path: regionPath, size: regionData.length })

      // Extract region coordinates from filename (r.X.Z.mca)
      const match = filename.match(/r\.(-?\d+)\.(-?\d+)\.mca/)
      if (!match) {
        debugLog('invalid region filename', { filename })
        continue
      }

      const regionX = parseInt(match[1], 10)
      const regionZ = parseInt(match[2], 10)

      // Parse the region file
      const chunks = await parseRegionFile(regionData)
      debugLog('region parsed', { path: regionPath, chunkCount: chunks.size })

      // Load each chunk into the world
      for (const [localKey, nbtData] of chunks) {
        const [localXStr, localZStr] = localKey.split(',')
        const localX = parseInt(localXStr, 10)
        const localZ = parseInt(localZStr, 10)
        const chunkX = regionX * 32 + localX
        const chunkZ = regionZ * 32 + localZ

        try {
          const Chunk = require('prismarine-chunk')(version)
          const chunk = new Chunk()

          // NBT structure from prismarine-nbt for 1.18+:
          // Compound: { value: { fieldName: { type, value }, ... } }
          // List: { type: 'list', value: { type: elementType, value: [...] } }
          const rootData = nbtData.value ?? nbtData

          // Helper to get NBT value, handling both wrapped and unwrapped formats
          const getNbtValue = (obj: any): any => {
            if (!obj) return obj
            if (typeof obj !== 'object') return obj
            // List tags have value: { type, value: [] }
            if (obj.type === 'list' && obj.value?.value) return obj.value.value
            // Other tags have direct value
            if ('value' in obj) return obj.value
            return obj
          }

          const sectionsTag = rootData.sections
          const sections = getNbtValue(sectionsTag) ?? []

          if (chunksLoaded < 3) {
            debugLog('chunk nbt structure', {
              chunkX, chunkZ,
              hasValue: !!nbtData.value,
              keys: Object.keys(rootData).slice(0, 10),
              sectionsTagType: sectionsTag?.type,
              sectionsCount: Array.isArray(sections) ? sections.length : 'not array',
              firstSection: sections[0] ? Object.keys(getNbtValue(sections[0]) ?? sections[0]).slice(0, 10) : 'none'
            })
          }

          // Load each section using prismarine-chunk's loadSection method
          for (const section of sections) {
            const sectionData = getNbtValue(section)
            const sectionY = getNbtValue(sectionData.Y) ?? 0

            // Get block_states (1.18+ format)
            const blockStates = getNbtValue(sectionData.block_states)
            const biomes = getNbtValue(sectionData.biomes)

            if (!blockStates?.palette && !getNbtValue(blockStates?.palette)) continue // Skip empty sections

            // Get palette array (handling NBT list structure)
            const blockPalette = getNbtValue(blockStates.palette) ?? []
            const blockData = getNbtValue(blockStates.data) ?? []

            // Prepare block states data
            const blockStatesData = {
              data: blockData,
              palette: blockPalette.map((p: any) => {
                const palEntry = getNbtValue(p) ?? p
                const name = getNbtValue(palEntry.Name) ?? 'minecraft:air'
                const props = getNbtValue(palEntry.Properties)
                // Convert property values from NBT format
                const convertedProps = props ? Object.fromEntries(
                  Object.entries(props).map(([k, v]) => [k, getNbtValue(v)])
                ) : undefined
                return convertedProps ? { Name: name, Properties: convertedProps } : { Name: name }
              })
            }

            // Prepare biomes data
            const biomePalette = biomes ? getNbtValue(biomes.palette) ?? [] : []
            const biomeData = biomes ? getNbtValue(biomes.data) ?? [] : []
            const biomesData = {
              data: biomeData,
              palette: biomePalette.length > 0
                ? biomePalette.map((b: any) => {
                    const biomeStr = getNbtValue(b) ?? b
                    return typeof biomeStr === 'string' ? biomeStr.replace('minecraft:', '') : 'plains'
                  })
                : ['plains']
            }

            // Get light data if available
            const blockLight = getNbtValue(sectionData.BlockLight)
            const skyLight = getNbtValue(sectionData.SkyLight)

            if (chunksLoaded < 2 && sectionY === 0) {
              debugLog('section data', {
                sectionY,
                blockPaletteCount: blockStatesData.palette.length,
                firstBlockPalette: blockStatesData.palette.slice(0, 3),
                biomePaletteCount: biomesData.palette.length,
                hasBlockData: blockData.length > 0,
                hasBiomeData: biomeData.length > 0
              })
            }

            try {
              chunk.loadSection(sectionY, blockStatesData, biomesData, blockLight, skyLight)
            } catch (sectionErr: any) {
              if (chunksLoaded < 3) {
                debugLog('section load error', { sectionY, error: sectionErr?.message })
              }
            }
          }

          // Use setColumn if available, otherwise add directly to columns
          if (typeof world.setColumn === 'function') {
            world.setColumn(chunkX, chunkZ, chunk)
          } else if (world.columns) {
            const key = `${chunkX},${chunkZ}`
            world.columns[key] = chunk
          }
          chunksLoaded++
          if (chunksLoaded <= 5 || chunksLoaded % 100 === 0) {
            debugLog('chunk loaded', { chunkX, chunkZ, total: chunksLoaded })
          }
        } catch (chunkErr: any) {
          if (chunksLoaded < 10) {
            debugLog('chunk load error', { chunkX, chunkZ, error: chunkErr?.message || chunkErr })
          }
        }
      }
    } catch (err: any) {
      debugLog('region file error', { path: regionPath, error: err?.message || err })
    }
  }

  debugLog('loadChunksFromRegionFiles complete', { chunksLoaded })
  return chunksLoaded
}

/**
 * Main entry point: Load world from URL for MCPR replay
 */
export async function loadWorldForMcprReplay(
  options: WorldLoaderOptions
): Promise<{ regionPaths: string[], chunksLoaded: number }> {
  const { worldUrl, onProgress } = options

  try {
    // Initialize BrowserFS with mcpr-world mount
    debugLog('initializing browserfs for mcpr-world')
    await initMcprFilesystem()

    // Download world archive
    debugLog('downloading world', { url: worldUrl })
    setLoadingScreenStatus('Downloading world archive...', false, true)
    const buffer = await downloadWithProgress(worldUrl, onProgress)
    debugLog('downloaded', { bytes: buffer.byteLength })

    // Extract archive
    const filename = worldUrl.split('/').pop() || 'world.tar.gz'
    console.log('[WorldLoader] Extracting archive:', filename)
    const files = await extractWorldArchive(buffer, filename, onProgress)
    console.log('[WorldLoader] Extracted', files.size, 'files from world archive')

    // Write region files to browserfs
    const basePath = '/mcpr-world'
    console.log('[WorldLoader] Writing region files to:', basePath)
    const regionPaths = await writeFilesToBrowserFs(files, basePath, onProgress)
    console.log('[WorldLoader] Found', regionPaths.length, 'region files:', regionPaths)

    return { regionPaths, chunksLoaded: 0 }
  } catch (err) {
    console.error('[WorldLoader] Error loading world:', err)
    throw err
  }
}
