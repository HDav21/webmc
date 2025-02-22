import { createServer, ServerClient } from 'minecraft-protocol'
import { parseReplayContents } from 'mcraft-fun-mineflayer/build/packetsReplay'
import { WorldStateHeader } from 'mcraft-fun-mineflayer/build/worldState'
import { LocalServer } from './customServer'
import { UserError } from './mineflayer/userError'

const SUPPORTED_FORMAT_VERSION = 1

type ReplayDefinition = {
  minecraftVersion: string
  replayAgainst?: 'client' | 'server'
  serverIp?: string
}

export const startLocalReplayServer = (contents: string) => {
  const lines = contents.split('\n')
  const def: WorldStateHeader | ReplayDefinition = JSON.parse(lines[0])
  const packetsRaw = lines.slice(1).join('\n')
  const replayData = parseReplayContents(packetsRaw)
  if ('formatVersion' in def && def.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    throw new UserError(`Unsupported format version: ${def.formatVersion}`)
  }
  if ('replayAgainst' in def && def.replayAgainst === 'server') {
    throw new Error('not supported')
  }

  const server = createServer({
    Server: LocalServer as any,
    version: def.minecraftVersion,
    'online-mode': false
  })

  const ignoreClient: string[] = ['keep_alive', 'position', 'position_look', 'settings', 'custom_payload', 'teleport_confirm']

  server.on('login', async client => {
    console.log('login')

    await mainPacketsReplayer(client, replayData, true)
  })

  return {
    server,
    version: def.minecraftVersion
  }
}

const mainPacketsReplayer = async (client: ServerClient, replayData: ReturnType<typeof parseReplayContents>, ignoreClientPacketsWait: string[] | true = []) => {
  const writePacket = (name: string, data: any) => {
    data = restoreData(data)
    client.write(name, data)
  }

  const waitForPacketOnce = async (name: string, state: string) => {
    if (ignoreClientPacketsWait !== true && ignoreClientPacketsWait.includes(name)) {
      return
    }
    return new Promise(resolve => {
      const listener = (data, meta) => {
        if (meta.state !== state || meta.name !== name) {
          return
        }
        client.removeListener(name, listener)
        resolve(data)
      }
      client.on(name, listener)
    })
  }

  const playPackets = replayData.packets.filter(p => p.state === 'play')
  for (const packet of playPackets) {
    if (packet.isFromServer) {
      writePacket(packet.name, packet.params)
      await new Promise(resolve => setTimeout(resolve, packet.diff))
    } else if (ignoreClientPacketsWait !== true && !ignoreClientPacketsWait.includes(packet.name)) {
      await waitForPacketOnce(packet.name, packet.state)
    }
  }
}

interface PacketsWaiterOptions {
  unexpectedPacketReceived?: (name: string, params: any) => void
  expectedPacketReceived?: (name: string, params: any) => void
}

interface PacketsWaiter {
  addPacket(name: string, params: any): void
  waitForPackets(packets: string[]): Promise<void>
}

const createPacketsWaiter = (options: PacketsWaiterOptions = {}): PacketsWaiter => {
  let packetHandler: ((data: any, name: string) => void) | null = null
  const queuedPackets: Array<{ name: string, params: any }> = []
  let isWaiting = false

  const handlePacket = (data: any, name: string, waitingPackets: string[], resolve: () => void) => {
    if (waitingPackets.includes(name)) {
      waitingPackets.splice(waitingPackets.indexOf(name), 1)
      options.expectedPacketReceived?.(name, data)
    } else {
      options.unexpectedPacketReceived?.(name, data)
    }

    if (waitingPackets.length === 0) {
      resolve()
    }
  }

  return {
    addPacket (name: string, params: any) {
      if (packetHandler) {
        packetHandler(params, name)
      } else {
        queuedPackets.push({ name, params })
      }
    },

    async waitForPackets (packets: string[]) {
      if (isWaiting) {
        throw new Error('Already waiting for packets')
      }
      isWaiting = true

      try {
        await new Promise<void>(resolve => {
          const waitingPackets = [...packets]

          packetHandler = (data: any, name: string) => {
            handlePacket(data, name, waitingPackets, resolve)
          }

          // Process any queued packets
          for (const packet of queuedPackets) {
            handlePacket(packet.params, packet.name, waitingPackets, resolve)
          }
          queuedPackets.length = 0
        })
      } finally {
        isWaiting = false
        packetHandler = null
      }
    }
  }
}

const isArrayEqual = (a: any[], b: any[]) => {
  if (a.length !== b.length) return false
  for (const [i, element] of a.entries()) {
    if (element !== b[i]) return false
  }
  return true
}

const restoreData = (json: any) => {
  const keys = Object.keys(json)

  if (isArrayEqual(keys.sort(), ['data', 'type'].sort())) {
    if (json.type === 'Buffer') {
      return Buffer.from(json.data)
    }
  }

  if (typeof json === 'object' && json) {
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === 'object') {
        json[key] = restoreData(value)
      }
    }
  }

  return json
}
