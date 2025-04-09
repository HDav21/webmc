import { useWorkerProxy } from 'renderer/playground/workerProxy'
import { options } from '../optionsStorage'
import { chatInputValueGlobal } from '../react/Chat'
import { showModal } from '../globalState'
import { showNotification } from '../react/NotificationProvider'
import { fsState } from '../loadSave'
import { setLoadingScreenStatus } from '../appStatus'
import type { workerProxyType, BackEvents, CustomAppSettings } from './worker'
import { createLocalServerClientImpl } from './customClient'
import { getMcDataForWorker } from './workerMcData.mjs'

Error.stackTraceLimit = 100

// eslint-disable-next-line import/no-mutable-exports
export let serverChannel: typeof workerProxyType['__workerProxy'] | undefined
let worker: Worker | undefined
let lastOptions: any
let lastCustomSettings: CustomAppSettings = {
  autoSave: true,
  stopLoad: true,
}

const addEventListener = <T extends keyof BackEvents> (type: T, listener: (data: BackEvents[T]) => void) => {
  if (!worker) throw new Error('Worker not started yet')
  worker.addEventListener('message', e => {
    if (e.data.type === type) {
      listener(e.data.data)
    }
  })
}

export const getLocalServerOptions = () => {
  return lastOptions
}

const restorePatchedDataDeep = (data) => {
  // add _isBuffer to Uint8Array
  if (data instanceof Uint8Array) {
    return Buffer.from(data)
  }
  if (typeof data === 'object' && data !== null) {
    // eslint-disable-next-line guard-for-in
    for (const key in data) {
      data[key] = restorePatchedDataDeep(data[key])
    }
  }
  return data
}

export const updateLocalServerSettings = (settings: Partial<CustomAppSettings>) => {
  lastCustomSettings = { ...lastCustomSettings, ...settings }
  serverChannel?.updateSettings(settings)
}

export const startLocalServerMain = async (serverOptions: { version: any, worldFolder? }) => {
  worker = new Worker('./integratedServer.js')
  serverChannel = useWorkerProxy<typeof workerProxyType>(worker, true)
  const readyPromise = new Promise<void>((resolve, reject) => {
    addEventListener('ready', () => {
      resolve()
    })
    worker!.addEventListener('error', (err) => {
      reject(err.error ?? 'Unknown error with the worker, check that integratedServer.js could be loaded from the server')
    })
  })

  fsState.inMemorySavePath = serverOptions.worldFolder ?? ''
  void serverChannel.start({
    options: serverOptions,
    mcData: await getMcDataForWorker(serverOptions.version),
    settings: lastCustomSettings,
    fsState: structuredClone(fsState)
  })

  await readyPromise

  const CustomClient = createLocalServerClientImpl((data) => {
    if (!serverChannel) console.warn(`Server is destroyed (trying to send ${data.name} packet)`)
    serverChannel?.packet(data)
  }, (processData) => {
    addEventListener('packet', (data) => {
      const restored = restorePatchedDataDeep(data)
      // incorrect flying squid packet on pre 1.13
      if (data.name === 'custom_payload' && data.params.channel === 'MC|Brand') {
        return
      }
      processData(restored)
      if (data.name === 'map_chunk') {
        addStatPerSec('map_chunk')
      }
    })
  }, options.excludeCommunicationDebugEvents)
  setupEvents()
  return {
    CustomClient
  }
}

const setupEvents = () => {
  addEventListener('loadingStatus', (newStatus) => {
    setLoadingScreenStatus(newStatus, false, false, true)
  })
  addEventListener('notification', ({ message, title, isError, suggestCommand }) => {
    const clickAction = () => {
      if (suggestCommand) {
        chatInputValueGlobal.value = suggestCommand
        showModal({ reactType: 'chat' })
      }
    }

    showNotification(title, message, isError ?? false, 'label-alt', clickAction)
  })
}

export const destroyLocalServerMain = async (throwErr = true) => {
  if (!worker) {
    if (throwErr) {
      throw new Error('Worker not started yet')
    }
    return
  }

  void serverChannel!.quit()
  await Promise.race([
    new Promise<void>(resolve => {
      addEventListener('quit', () => {
        resolve()
      })
    }),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Server quit timeout after 5s')), 5000)
    })
  ])
  worker.terminate()
  worker = undefined
  lastOptions = undefined
}
