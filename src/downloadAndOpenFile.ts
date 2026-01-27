import prettyBytes from 'pretty-bytes'
import { decode } from '@msgpack/msgpack'
import { openWorldFromHttpDir, openWorldZip } from './browserfs'
import { getResourcePackNames, installResourcepackPack, resourcePackState, updateTexturePackInstalledState } from './resourcePack'
import { setLoadingScreenStatus } from './appStatus'
import { appQueryParams, appQueryParamsArray } from './appParams'
import { openFile, openParsedReplay } from './packetsReplay/replayPackets'
import { createFullScreenProgressReporter } from './core/progressReporter'
import { loadWorldForMcprReplay } from './packetsReplay/worldLoader'

export const getFixedFilesize = (bytes: number) => {
  return prettyBytes(bytes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Debug tracking
(window as any)._worldLoadDebug = []
const debugLog = (msg: string, data?: any) => {
  const entry = { time: Date.now(), msg, data };
  (window as any)._worldLoadDebug.push(entry)
  console.log('[downloadAndOpenFile]', msg, data)
}

const inner = async () => {

  // Handle pre-parsed replay from URL (gzipped msgpack)
  const { replayUrl } = appQueryParams
  if (replayUrl) {
    debugLog('entering replayUrl block')
    debugLog('starting replay download')
    setLoadingScreenStatus('Downloading replay data')
    const response = await fetch(replayUrl)
    const contentLength = response.headers?.get('Content-Length')
    const size = contentLength ? +contentLength : undefined
    const filename = replayUrl.split('/').pop() ?? 'replay'

    let downloadedBytes = 0
    const compressedBuffer = await new Response(new ReadableStream({
      async start (controller) {
        if (!response.body) throw new Error('Server returned no response!')
        const reader = response.body.getReader()

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read() // eslint-disable-line no-await-in-loop

          if (done) {
            controller.close()
            break
          }

          downloadedBytes += value.byteLength

          const progress = size ? (downloadedBytes / size) * 100 : undefined
          setLoadingScreenStatus(`Download replay: ${progress === undefined ? '?' : Math.floor(progress)}% (${getFixedFilesize(downloadedBytes)} / ${size && getFixedFilesize(size)})`, false, true)

          controller.enqueue(value)
        }
      },
    })).arrayBuffer()

    // Decompress gzip
    setLoadingScreenStatus('Decompressing replay data...')
    debugLog('decompressing gzip', { compressedSize: compressedBuffer.byteLength })
    const decompressedStream = new Response(
      new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    )
    const decompressedBuffer = await decompressedStream.arrayBuffer()
    debugLog('decompressed', { decompressedSize: decompressedBuffer.byteLength })

    // Decode msgpack
    setLoadingScreenStatus('Decoding replay data...')
    const replayData = decode(new Uint8Array(decompressedBuffer)) as { packets: any[], header?: any, headers?: any }
    debugLog('decoded msgpack', { packetCount: replayData.packets?.length, keys: Object.keys(replayData) })

    // Handle both 'header' and 'headers' (in case of typo)
    const header = replayData.header ?? replayData.headers
    if (!replayData.packets || !header) {
      throw new Error(`Invalid replay data format. Expected {packets, header}, got keys: ${Object.keys(replayData).join(', ')}`)
    }

    // Open the replay with pre-parsed packets
    await openParsedReplay(replayData.packets, header, filename, size)
    return true
  }

  // Handle regular JSON replay file from URL
  const { replayFileUrl } = appQueryParams
  if (replayFileUrl) {
    setLoadingScreenStatus('Downloading replay file')
    const response = await fetch(replayFileUrl)
    const contentLength = response.headers?.get('Content-Length')
    const size = contentLength ? +contentLength : undefined
    const filename = replayFileUrl.split('/').pop()

    let downloadedBytes = 0
    const buffer = await new Response(new ReadableStream({
      async start (controller) {
        if (!response.body) throw new Error('Server returned no response!')
        const reader = response.body.getReader()

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read() // eslint-disable-line no-await-in-loop

          if (done) {
            controller.close()
            break
          }

          downloadedBytes += value.byteLength

          // Calculate download progress as a percentage
          const progress = size ? (downloadedBytes / size) * 100 : undefined
          setLoadingScreenStatus(`Download replay file progress: ${progress === undefined ? '?' : Math.floor(progress)}% (${getFixedFilesize(downloadedBytes)} / ${size && getFixedFilesize(size)})`, false, true)

          // Pass the received data to the controller
          controller.enqueue(value)
        }
      },
    })).arrayBuffer()

    // Convert buffer to text, handling any compression automatically
    const decoder = new TextDecoder()
    const contents = decoder.decode(buffer)

    openFile({
      contents,
      filename,
      filesize: size
    })
    return true
  }

  const mapUrlDir = appQueryParamsArray.mapDir ?? []
  const mapUrlDirGuess = appQueryParams.mapDirGuess
  const mapUrlDirBaseUrl = appQueryParams.mapDirBaseUrl
  if (mapUrlDir.length) {
    await openWorldFromHttpDir(mapUrlDir, mapUrlDirBaseUrl ?? undefined)
    return true
  }
  if (mapUrlDirGuess) {
    // await openWorldFromHttpDir(undefined, mapUrlDirGuess)
    return true
  }
  let mapUrl = appQueryParams.map
  const { texturepack } = appQueryParams
  // fixme
  if (texturepack) mapUrl = texturepack
  if (!mapUrl) return false

  if (texturepack) {
    await updateTexturePackInstalledState()
    if (resourcePackState.resourcePackInstalled) {
      if (!confirm(`You are going to install a new resource pack, which will REPLACE the current one: ${await getResourcePackNames()[0]} Continue?`)) return
    }
  }
  const name = mapUrl.slice(mapUrl.lastIndexOf('/') + 1).slice(-25)
  const downloadThing = texturepack ? 'texturepack' : 'world'
  setLoadingScreenStatus(`Downloading ${downloadThing} ${name}...`)

  const response = await fetch(mapUrl)
  const contentType = response.headers.get('Content-Type')
  if (!contentType || !contentType.startsWith('application/zip')) {
    alert('Invalid map file')
  }
  const contentLengthStr = response.headers?.get('Content-Length')
  const contentLength = contentLengthStr && +contentLengthStr
  setLoadingScreenStatus(`Downloading ${downloadThing} ${name}: have to download ${contentLength && getFixedFilesize(contentLength)}...`)

  let downloadedBytes = 0
  const buffer = await new Response(new ReadableStream({
    async start (controller) {
      if (!response.body) throw new Error('Server returned no response!')
      const reader = response.body.getReader()

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read() // eslint-disable-line no-await-in-loop

        if (done) {
          controller.close()
          break
        }

        downloadedBytes += value.byteLength

        // Calculate download progress as a percentage
        const progress = contentLength ? (downloadedBytes / contentLength) * 100 : undefined
        setLoadingScreenStatus(`Download ${downloadThing} progress: ${progress === undefined ? '?' : Math.floor(progress)}% (${getFixedFilesize(downloadedBytes)} / ${contentLength && getFixedFilesize(contentLength)})`, false, true)


        // Pass the received data to the controller
        controller.enqueue(value)
      }
    },
  })).arrayBuffer()
  if (texturepack) {
    const name = mapUrl.slice(mapUrl.lastIndexOf('/') + 1).slice(-30)
    await installResourcepackPack(buffer, createFullScreenProgressReporter(), name)
  } else {
    await openWorldZip(buffer)
  }
}

export default async () => {
  try {
    return await inner()
  } catch (err) {
    console.error('[downloadAndOpenFile] Error:', err)
    setLoadingScreenStatus(`Failed to load. ${err.message}`)
    return true
  }
}
