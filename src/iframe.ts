// Setup iframe comms with kradle frontend

import { getThreeJsRendererMethods } from 'renderer/viewer/three/threeJsMethods'
import { options } from './optionsStorage'
import { musicSystem } from './sounds/musicSystem'
import { reestablishFollowing } from './follow'
import { toggleMic, toggleCamera, toggleRecording } from './controls'
import { audioTrackScheduler } from './sounds/audioTrackScheduler'

type IFrameSendablePayload =
  | {
    source: 'minecraft-web-client'; // Used to filter messages on the parent side
    action: 'gameLoaded'; // indicates the action to perform
  }
  | {
    source: 'minecraft-web-client';
    action: 'followingPlayer';
    username?: string;
  }
  | {
    source: 'minecraft-web-client';
    action: 'replayStatus';
    currentTime: string; // e.g. "00:01:37"
    progress: number; // 0.0 to 1.0
    percentage: number; // 0 to 100
    recordingName?: string; // e.g. "2025-07-04--00-41-17"
    isRecording: boolean;
    isPaused: boolean;
  }
  | {
    source: 'minecraft-web-client';
    action: 'connectionStatus';
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'kicked';
    message: string; // Human-readable status message
    errorDetails?: string; // Additional error information when applicable
    canReconnect: boolean; // Whether reconnection is possible
  }
  | {
    source: 'minecraft-web-client';
    action: 'pointerLockReleased';
  }
  | {
    source: 'minecraft-web-client';
    action: 'followingPlayerLost';
  }

type ReceivableActions = 'followPlayer' | 'command' | 'reconnect' | 'setAgentSkins' | 'releasePointerLock' | 'birdsEyeViewFollow'

let playerPaused = false

export function registerPauseHotkey () {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return

    // "P" key to toggle pause/unpause
    if (e.code === 'KeyP' && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault()

      if (playerPaused) {
        // Unpause
        bot.chat('/replay view unpause')
        void (async () => {
          const renderer = getThreeJsRendererMethods()
          if (!renderer) return

          playerPaused = false
          audioTrackScheduler.setPlaying(true)

          const playerObjects = await Promise.all(
            Object.values(bot.entities).map(entity => renderer.getPlayerObject(entity.id))
          )

          for (const playerObject of playerObjects) {
            if (playerObject?.animation) {
              playerObject.animation.paused = false
            }
          }
        })()
      } else {
      // Pause
        bot.chat('/replay view pause')
        void (async () => {
          const renderer = getThreeJsRendererMethods()
          if (!renderer) return

          playerPaused = true
          audioTrackScheduler.setPlaying(false)

          const playerObjects = await Promise.all(
            Object.values(bot.entities).map(entity => renderer.getPlayerObject(entity.id))
          )

          for (const playerObject of playerObjects) {
            if (playerObject?.animation) {
              playerObject.animation.paused = true
            }
          }
        })()
      }
    }
  }

  window.addEventListener('keydown', onKeyDown)

  // return cleanup/unregister function
  return () => {
    window.removeEventListener('keydown', onKeyDown)
  }
}

registerPauseHotkey()

export function setupIframeComms () {
  // Handle incoming messages from kradle frontend
  window.addEventListener('message', (event) => {
    const { data } = event
    if (data.source === 'kradle-frontend') {
      console.log('[iframe-rpc] [minecraft-web-client] Received message', data)
      customEvents.emit(`kradle:${data.action as ReceivableActions}`, data)
    }
  })

  // Handle outgoing messages to kradle frontend
  function sendMessageToKradle (
    payload: Omit<IFrameSendablePayload, 'source'>
  ) {
    if (window !== window.parent) {
      window.parent.postMessage({
        ...payload,
        source: 'minecraft-web-client'
      }, '*')
    }
  }
  customEvents.on('gameLoaded', () => {
    sendMessageToKradle({
      action: 'gameLoaded'
    })
  })
  customEvents.on('followingPlayer', (username) => {
    sendMessageToKradle({
      action: 'followingPlayer',
      // @ts-expect-error TODO fix this type
      username
    })
  })
  customEvents.on('pointerLockReleased', () => {
    sendMessageToKradle({
      action: 'pointerLockReleased'
    })
  })
  customEvents.on('followingPlayerLost', () => {
    sendMessageToKradle({
      action: 'followingPlayerLost'
    })
  })
  customEvents.on('kradle:sendRecordingMessageList', (data) => {
    console.log('[iframe-rpc] Recording message list received from parent', data)
    if (data?.data && Array.isArray(data.data)) {
      void audioTrackScheduler.loadTracks(data.data)
    }
  })

  customEvents.on('kradle:command', (data) => {
    const { command } = data
    if (!command) {
      console.error('No command provided')
      return
    }

    const formattedCommand = `/${command.replace(/^\//, '')}`
    console.log('[packet-monitor] Sending command to bot:', formattedCommand)
    bot.chat(formattedCommand)

    // Check if this is a seek command and re-establish following after a delay
    if (command.includes('replay view jump to timestamp')) {
      // Wait a bit for the seek to complete and entities to spawn
      setTimeout(() => {
        void reestablishFollowing()
      }, 1000)
    }

    console.log('[packet-monitor] Command received:', command)

    if (command === 'replay view pause') {
      // Pause all player animations when replay is paused
      void (async () => {

        const renderer = getThreeJsRendererMethods()
        if (!renderer) return

        playerPaused = true
        audioTrackScheduler.setPlaying(false)

        const playerObjects = await Promise.all(
          Object.values(bot.entities).map(entity => renderer.getPlayerObject(entity.id))
        )

        for (const playerObject of playerObjects) {
          if (playerObject?.animation) {
            playerObject.animation.paused = true
          }
        }
      })()
    }

    if (command === 'replay view unpause' || command === 'replay view resume' || command === 'replay view play') {
      // Resume all player animations when replay is resumed
      void (async () => {

        const renderer = getThreeJsRendererMethods()
        if (!renderer) return

        playerPaused = false
        audioTrackScheduler.setPlaying(true)

        const playerObjects = await Promise.all(
          Object.values(bot.entities).map(entity => renderer.getPlayerObject(entity.id))
        )

        for (const playerObject of playerObjects) {
          if (playerObject?.animation) {
            playerObject.animation.paused = false
          }
        }
      })()
    }

    if (command === 'replay recording toggle') {
      void toggleRecording()
    }

    if (command === 'replay mic toggle') {
      void toggleMic()
    }

    if (command === 'replay camera toggle') {
      void toggleCamera()
    }

  })

  // Handle reconnect command from parent app
  customEvents.on('kradle:reconnect', (data) => {
    console.log('[iframe-rpc] Reconnect command received from parent', data)
    if (window?.lastConnectOptions?.value) {
      // Use existing reconnect functionality
      window.dispatchEvent(
        new window.CustomEvent('connect', {
          detail: window.lastConnectOptions.value,
        })
      )

      // Re-establish following after reconnection
      setTimeout(() => {
        void reestablishFollowing()
      }, 2000) // Wait longer for reconnection to complete
    } else {
      console.error(
        '[iframe-rpc] No connection options available for reconnect'
      )
    }
  })

  // Handle agent skin data from parent app
  customEvents.on('kradle:setAgentSkins', (data) => {
    console.log('[iframe-rpc] Agent skin data received from parent', data)
    // Store agent skin data globally for use by entities
    if (window.agentSkinMap) {
      window.agentSkinMap.clear()
    } else {
      window.agentSkinMap = new Map()
    }

    if (data.agentSkins) {
      for (const agentSkin of data.agentSkins) {
        if (agentSkin.username && agentSkin.skinUrl) {
          // Primary mapping: username -> skinUrl
          window.agentSkinMap.set(agentSkin.username, agentSkin.skinUrl)
        }
      }
    }

    // Emit event to notify that agent skins have been updated
    console.log('[iframe-rpc] Emitting agentSkinsUpdated event, map size:', window.agentSkinMap.size)
    customEvents.emit('agentSkinsUpdated')
  })

  // Handle pointer lock release request from parent app
  customEvents.on('kradle:releasePointerLock', () => {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock()
    }
  })

  // Handle connection status reporting
  customEvents.on('connectionStatus', (statusData) => {
    sendMessageToKradle({
      action: 'connectionStatus',
      ...statusData,
    })
  })

  // Setup packet monitoring for replay information
  function setupPacketMonitoring () {
    if (!bot || !bot._client) {
      console.log('[packet-monitor] Bot not ready yet, retrying in 1s')
      setTimeout(setupPacketMonitoring, 1000)
      return
    }

    console.log(
      '[packet-monitor] Setting up packet monitoring for replay data'
    )

    // Monitor boss_bar packets for replay progress and broadcast to parent
    let lastReplayStatus: any = null
    let storedProgress = 0
    let storedPercentage = 0
    let storedCurrentTime = ''
    let storedRecordingName = ''
    let storedIsRecording = false
    let storedIsMicEnabled = false
    let storedIsCameraEnabled = false

    customEvents.on('recordingUpdate', (data) => {
      console.log('[packet-monitor] Custom payload received:', data)
      if (data.isRecording !== undefined) {
        storedIsRecording = data.isRecording
      }
      if (data.isMicEnabled !== undefined) {
        storedIsMicEnabled = data.isMicEnabled
      }
      if (data.isCameraEnabled !== undefined) {
        storedIsCameraEnabled = data.isCameraEnabled
      }

      const replayStatus = {
        currentTime: storedCurrentTime,
        progress: storedProgress,
        percentage: storedPercentage,
        recordingName: storedRecordingName,
        isPaused: playerPaused,
        isRecording: storedIsRecording,
        isMicEnabled: storedIsMicEnabled,
        isCameraEnabled: storedIsCameraEnabled,
      }

      if (storedCurrentTime && window !== window.parent) {
        sendMessageToKradle({
          action: 'replayStatus',
          ...replayStatus,
        })
      }
    })

    bot._client.on('boss_bar', (data) => {
      // Extract progress percentage (action 2)
      if (data.health !== undefined) {
        storedProgress = data.health
        storedPercentage = Math.round(data.health * 100)
      }

      // Extract time and recording name from title (action 3)
      if (
        data.title?.value?.extra?.value?.value
      ) {
        try {
          const extraItems = data.title.value.extra.value.value
          for (const item of extraItems) {
            if (item.text?.value) {
              const text = item.text.value
              if (/\d{2}:\d{2}:\d{2}/.test(text)) {
                storedCurrentTime = text
              } else if (/\d{4}-\d{2}-\d{2}--\d{2}-\d{2}-\d{2}/.test(text)) {
                storedRecordingName = text
              }
            }
          }
        } catch (e) {
          console.log('[replay-parse-error]', e.message)
        }
      }

      // Update audio track scheduler with current time
      if (storedCurrentTime) {
        audioTrackScheduler.updateCurrentTime(storedCurrentTime)
      }

      // Create status object from stored values
      const replayStatus = {
        currentTime: storedCurrentTime,
        progress: storedProgress,
        percentage: storedPercentage,
        recordingName: storedRecordingName,
        isPaused: playerPaused,
        isRecording: storedIsRecording,
        isMicEnabled: storedIsMicEnabled,
        isCameraEnabled: storedIsCameraEnabled,
      }

      console.log('[boss-monitor] Replay status:', replayStatus)

      // Only send if data has changed and we have minimum required data
      const statusChanged =
        JSON.stringify(replayStatus) !== JSON.stringify(lastReplayStatus)
      if (statusChanged && storedCurrentTime && window !== window.parent) {
        sendMessageToKradle({
          action: 'replayStatus',
          ...replayStatus,
        })

        lastReplayStatus = replayStatus
      }
    })
  }

  // Start monitoring when bot is ready
  if (window?.customEvents) {
    window.customEvents.on('mineflayerBotCreated', () => {
      console.log('[packet-monitor] Bot created, setting up packet monitoring')
      setTimeout(setupPacketMonitoring, 1000) // Give bot time to initialize
    })
  }
}
