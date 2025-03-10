// Setup iframe comms with kradle frontend


type IFrameSendablePayload = {
  source: 'minecraft-web-client'; // Used to filter messages on the parent side
  action: 'gameLoaded'; // indicates the action to perform
} | {
  source: 'minecraft-web-client';
  action: 'followingPlayer';
  username?: string;
}

export function setupIframeComms () {
  // Handle incoming messages from kradle frontend
  window.addEventListener('message', (event) => {
    const { data } = event
    if (data.source === 'kradle-frontend') {
      console.log('[iframe-rpc] [minecraft-web-client] Received message', data)
      customEvents.emit(`kradle:${data.action as 'followPlayer'}`, data)
    }
  })

  // Handle outgoing messages to kradle frontend
  function sendMessageToKradle (
    payload: Omit<IFrameSendablePayload, 'source'>
  ) {
    if (window !== window.parent) {
      console.log('[iframe-rpc] [minecraft-web-client] Posting message', payload);
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
}
