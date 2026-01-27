/* eslint-disable no-await-in-loop */
import JSZip from 'jszip'
import { createDeserializer, states } from 'minecraft-protocol'
import { ParsedReplayPacket } from 'mcraft-fun-mineflayer/build/packetsLogger'
import { UserError } from '../mineflayer/userError'
import { setLoadingScreenStatus } from '../appStatus'

/**
 * MCPR metadata structure from metaData.json
 */
interface McprMetadata {
  singleplayer: boolean
  serverName: string
  duration: number // milliseconds
  date: number // unix timestamp in ms
  mcversion: string // e.g. "1.20.4"
  fileFormat: string // "MCPR"
  fileFormatVersion: number
  protocol: number // protocol version number
  generator: string // e.g. "ReplayMod v1.21.4-2.6.23"
  selfId: number
  players: string[] // UUIDs
}

/**
 * Parse an MCPR file (ZIP archive with binary recording) into ParsedReplayPacket format
 * @param buffer The MCPR file as ArrayBuffer
 * @returns Packets and header in the format expected by the replay system
 */
export async function parseMcprFile(
  buffer: ArrayBuffer
): Promise<{ packets: ParsedReplayPacket[]; header: any }> {
  // Step 1: Extract ZIP archive
  setLoadingScreenStatus('Extracting MCPR archive...')
  const { tmcprBuffer, metadata } = await extractMcprZip(buffer)

  // Step 2: Parse binary recording
  setLoadingScreenStatus('Parsing MCPR packets...')
  const packets = await parseBinaryRecording(tmcprBuffer, metadata)

  // Step 3: Return in expected format
  const header = {
    formatVersion: 1, // Our internal format version for MCPR imports
    minecraftVersion: metadata.mcversion,
    mcprMetadata: metadata // Keep original metadata for debugging
  }

  return { packets, header }
}

/**
 * Extract the MCPR ZIP archive and read its contents
 */
async function extractMcprZip(buffer: ArrayBuffer): Promise<{
  tmcprBuffer: Buffer
  metadata: McprMetadata
}> {
  try {
    const zip = new JSZip()
    const loaded = await zip.loadAsync(buffer)

    // Validate structure - MCPR must have these files
    const tmcprFile = loaded.file('recording.tmcpr')
    const metadataFile = loaded.file('metaData.json')

    if (!tmcprFile) {
      throw new UserError('Invalid MCPR file: missing recording.tmcpr')
    }
    if (!metadataFile) {
      throw new UserError('Invalid MCPR file: missing metaData.json')
    }

    // Extract files
    const [tmcprArrayBuffer, metadataText] = await Promise.all([
      tmcprFile.async('arraybuffer'),
      metadataFile.async('string')
    ])

    // Parse metadata
    const metadata: McprMetadata = JSON.parse(metadataText)

    // Validate metadata
    if (!metadata.mcversion) {
      throw new UserError('Invalid MCPR metadata: missing mcversion field')
    }

    return {
      tmcprBuffer: Buffer.from(tmcprArrayBuffer),
      metadata
    }
  } catch (err) {
    if (err instanceof UserError) throw err
    throw new UserError(`Failed to extract MCPR file: ${err.message}`)
  }
}

/**
 * Parse the binary recording.tmcpr file
 * Format: repeating [timestamp: 4 bytes BE, length: 4 bytes BE, packet data: N bytes]
 */
async function parseBinaryRecording(
  buffer: Buffer,
  metadata: McprMetadata
): Promise<ParsedReplayPacket[]> {
  const packets: ParsedReplayPacket[] = []
  let offset = 0
  let previousTimestamp = 0
  // For 1.20.2+, MCPR files may start with configuration state packets
  // We'll determine the actual state during deserialization
  const currentState = 'unknown' as PacketState
  let packetCount = 0

  // Estimate total packets for progress reporting
  const estimatedPacketCount = Math.floor(buffer.length / 100) // rough estimate

  while (offset < buffer.length) {
    try {
      // Ensure we have enough bytes for the header
      if (offset + 8 > buffer.length) {
        console.warn(`Truncated packet at offset ${offset}: not enough bytes for header`)
        break
      }

      // Read packet header
      const timestamp = buffer.readUInt32BE(offset)
      const length = buffer.readUInt32BE(offset + 4)
      offset += 8

      // Validate length
      if (length === 0) {
        console.warn(`Zero-length packet at timestamp ${timestamp}, skipping`)
        continue
      }
      if (offset + length > buffer.length) {
        console.warn(`Truncated packet at offset ${offset}: expected ${length} bytes but only ${buffer.length - offset} available`)
        break
      }

      // Extract packet data
      const packetData = buffer.slice(offset, offset + length)
      offset += length

      // For now, we'll store the raw packet data
      // Deserialization will happen in a second pass to avoid blocking
      packets.push({
        name: 'unknown', // Will be filled in during deserialization
        params: packetData, // Store raw bytes for now
        state: currentState,
        diff: timestamp - previousTimestamp,
        isFromServer: true
      })

      previousTimestamp = timestamp
      packetCount++

      // Progress reporting every 1000 packets
      if (packetCount % 1000 === 0) {
        const progress = Math.min(100, Math.floor((offset / buffer.length) * 100))
        setLoadingScreenStatus(`Parsing MCPR packets: ${progress}% (${packetCount} packets)`, false, true)
      }
    } catch (err) {
      console.error(`Error parsing packet at offset ${offset}:`, err)
      // Skip malformed packet and continue
      break
    }
  }

  setLoadingScreenStatus(`Parsed ${packetCount} packets, deserializing...`, false, true)

  // Step 2: Deserialize all packets
  const deserializedPackets = await deserializePackets(packets, metadata)

  setLoadingScreenStatus(`Loaded ${deserializedPackets.length} packets`)

  return deserializedPackets
}

/**
 * Deserialize binary packet data using minecraft-protocol
 */
async function deserializePackets(
  packets: ParsedReplayPacket[],
  metadata: McprMetadata
): Promise<ParsedReplayPacket[]> {
  // Try to get version from metadata
  let version = metadata.mcversion

  // Fallback: if the exact version fails, use a compatible version with same protocol
  // Protocol 765 is shared by 1.20.3 and 1.20.4
  const versionFallbacks: Record<string, string> = {
    '1.20.4': '1.20.3', // Both use protocol 765
  }

  const deserializedPackets: ParsedReplayPacket[] = []

  console.log('MCPR Metadata:', metadata)
  console.log('Attempting version:', version)

  // IMPORTANT: Load minecraft-data before creating deserializer
  // This is required for browser environment
  if (typeof window !== 'undefined' && (window as any)._LOAD_MC_DATA) {
    console.log('Loading minecraft-data...')
    await (window as any)._LOAD_MC_DATA()
    console.log('Minecraft-data loaded successfully')
  }

  // Determine initial state based on version
  // For 1.20.2+, MCPR files typically start with configuration state
  const MinecraftData = require('minecraft-data')
  let mcData: any
  try {
    mcData = MinecraftData(version)
  } catch {
    mcData = null
  }
  const hasConfigurationState = mcData?.supportFeature?.('hasConfigurationState') ?? false
  let currentState: PacketState = hasConfigurationState ? states.CONFIGURATION : states.PLAY

  console.log(`Initial state for ${version}: ${currentState} (hasConfigurationState: ${hasConfigurationState})`)
  console.log(`states.CONFIGURATION value: "${states.CONFIGURATION}", states.PLAY value: "${states.PLAY}"`)

  // Create deserializer
  let deserializer: any
  let lastError: any
  let deserializerVersion: string = version

  const createDeserializerForState = (state: PacketState, ver: string) => {
    return createDeserializer({
      state,
      isServer: false, // We're receiving server packets
      version: ver,
      customPackets: undefined,
      compiled: true // Use compiled mode (faster and avoids nbt.addTypesToInterperter typo issue)
    } as any)
  }

  // Try the primary version first
  for (const attemptVersion of [version, versionFallbacks[version]].filter(Boolean)) {
    try {
      console.log(`Trying to create deserializer with version: ${attemptVersion}, state: ${currentState}`)
      deserializer = createDeserializerForState(currentState, attemptVersion)
      deserializerVersion = attemptVersion
      console.log(`Successfully created deserializer with version: ${attemptVersion}, state: ${currentState}`)
      break // Success!
    } catch (err) {
      console.warn(`Failed with version ${attemptVersion}:`, err)
      lastError = err
      // Continue to next fallback
    }
  }

  if (!deserializer) {
    throw new UserError(`Unsupported Minecraft version ${version}: ${lastError.message}. Try updating minecraft-protocol package.`)
  }

  let successCount = 0
  let failCount = 0

  for (const [index, packet] of packets.entries()) {
    try {
      // Get the raw packet buffer
      const rawBuffer = packet.params as Buffer

      if (index < 5) {
        console.log(`Packet ${index} buffer (first 20 bytes):`, rawBuffer.slice(0, 20))
      }

      // Try to parse the packet
      // MCPR packets should already have the packet ID in the buffer
      const parsed = deserializer.parsePacketBuffer(rawBuffer)

      if (parsed && parsed.data) {
        const packetName = parsed.data.name

        deserializedPackets.push({
          name: packetName,
          params: parsed.data.params,
          state: currentState, // Use actual current state
          diff: packet.diff,
          isFromServer: true
        })
        successCount++

        // Track state transitions
        // finish_configuration: transition from configuration to play
        // start_configuration: transition from play to configuration (rare in MCPR)
        if (currentState === states.CONFIGURATION && packetName === 'finish_configuration') {
          console.log(`State transition: ${currentState} -> ${states.PLAY} (packet: ${packetName})`)
          currentState = states.PLAY
          // Recreate deserializer for new state
          deserializer = createDeserializerForState(currentState, deserializerVersion)
        } else if (currentState === states.PLAY && packetName === 'start_configuration') {
          console.log(`State transition: ${currentState} -> ${states.CONFIGURATION} (packet: ${packetName})`)
          currentState = states.CONFIGURATION
          // Recreate deserializer for new state
          deserializer = createDeserializerForState(currentState, deserializerVersion)
        }
      } else {
        // Failed to parse, keep raw data with a placeholder name
        console.warn(`Failed to parse packet ${index}: no data returned`)
        deserializedPackets.push({
          ...packet,
          name: 'unknown',
          params: {}, // Empty params to avoid issues
          state: currentState
        })
        failCount++
      }

      // Progress reporting every 1000 packets
      if ((index + 1) % 1000 === 0) {
        const progress = Math.floor(((index + 1) / packets.length) * 100)
        setLoadingScreenStatus(`Deserializing packets: ${progress}% (${index + 1}/${packets.length}, ${successCount} ok, ${failCount} failed)`, false, true)
      }
    } catch (err) {
      // On deserialization error, skip this packet with a warning
      if (failCount < 10) {
        console.warn(`Failed to deserialize packet ${index}:`, err)
      }
      failCount++
      // Keep the packet with placeholder data
      deserializedPackets.push({
        name: 'unknown',
        params: {},
        state: packet.state,
        diff: packet.diff,
        isFromServer: true
      })
    }
  }

  console.log(`Deserialization complete: ${successCount} succeeded, ${failCount} failed out of ${packets.length} total`)

  if (successCount === 0 && packets.length > 0) {
    throw new UserError('Failed to deserialize any packets. The MCPR file format may not be compatible.')
  }

  // Log state distribution for debugging
  const stateDistribution = deserializedPackets.reduce((acc, p) => {
    acc[p.state] = (acc[p.state] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log('Packet state distribution:', stateDistribution)
  console.log('First 10 deserialized packets:', deserializedPackets.slice(0, 10).map(p => ({ name: p.name, state: p.state })))

  // Save all packets to window for debugging
  ;(window as any).mcprAllPackets = deserializedPackets.map(p => ({ name: p.name, params: p.params }))
  console.log(`Saved ${deserializedPackets.length} packets to window.mcprAllPackets`)

  // Also log unique packet names
  const uniqueNames = [...new Set(deserializedPackets.map(p => p.name))].sort()
  console.log('Unique packet names:', uniqueNames)

  return deserializedPackets
}
