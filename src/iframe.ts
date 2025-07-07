// Setup iframe comms with kradle frontend

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
  }
  | {
    source: 'minecraft-web-client';
    action: 'connectionStatus';
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'kicked';
    message: string; // Human-readable status message
    errorDetails?: string; // Additional error information when applicable
    canReconnect: boolean; // Whether reconnection is possible
  }

type ReceivableActions = 'followPlayer' | 'command' | 'reconnect'

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
  customEvents.on('kradle:command', (data) => {
    const { command } = data
    if (!command) {
      console.error('No command provided')
      return
    }

    const formattedCommand = `/${command.replace(/^\//, '')}`
    console.log('[packet-monitor] Sending command to bot:', formattedCommand)
    bot.chat(formattedCommand)
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
    } else {
      console.error(
        '[iframe-rpc] No connection options available for reconnect'
      )
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

      // Create status object from stored values
      const replayStatus = {
        currentTime: storedCurrentTime,
        progress: storedProgress,
        percentage: storedPercentage,
        recordingName: storedRecordingName,
      }

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
