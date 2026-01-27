import { useEffect, useMemo, useRef, useState } from 'react'
import { useSnapshot } from 'valtio'
import { formatMessage } from '../chatUtils'
import { addCanvasChatMessage } from '../canvasChatMessages'
import { ChatRenderCanvas } from '../canvasChatRenderer'
import { getBuiltinCommandsList, tryHandleBuiltinCommand } from '../builtinCommands'
import { gameAdditionalState, hideCurrentModal, miscUiState } from '../globalState'
import { options } from '../optionsStorage'
import { viewerVersionState } from '../viewerConnector'
import Chat, { Message, fadeMessage } from './Chat'
import { useIsModalActive } from './utilsApp'
import { hideNotification, showNotification } from './NotificationProvider'
import { updateLoadedServerData } from './serversStorage'
import { lastConnectOptions } from './AppStatusProvider'

// Player chat translate keys (format: "<player> message" or "* player message")
const PLAYER_CHAT_TRANSLATE_KEYS = new Set([
  'chat.type.text', // <player> message
  'chat.type.emote', // * player message
  'chat.type.announcement', // [player] message (broadcasts)
  'chat.type.team.text', // team chat
  'chat.type.team.sent', // team chat sent
])

// System message translate key prefixes to exclude from canvas rendering
const EXCLUDED_TRANSLATE_PREFIXES = [
  'chat.type.advancement', // advancement messages
  'death.', // death messages
  'multiplayer.player.joined', // player joined
  'multiplayer.player.left', // player left
]

function isPlayerChatMessage (jsonMsg: any): boolean {
  const translate = jsonMsg?.translate || jsonMsg?.json?.translate

  // Exclude system messages by prefix
  if (translate) {
    for (const prefix of EXCLUDED_TRANSLATE_PREFIXES) {
      if (translate.startsWith(prefix)) {
        return false
      }
    }
  }

  if (translate && PLAYER_CHAT_TRANSLATE_KEYS.has(translate)) {
    return true
  }
  // Also check if message has 'with' array containing player info (common pattern)
  // Messages without translate but with text and clickEvent for player name are likely player chat
  if (jsonMsg?.with && Array.isArray(jsonMsg.with) && jsonMsg.with.length >= 2) {
    const firstWith = jsonMsg.with[0]
    // Player names often have clickEvent with suggest_command
    if (firstWith?.clickEvent?.action === 'suggest_command') {
      return true
    }
  }
  return false
}


export default () => {
  const [messages, setMessages] = useState([] as Message[])
  const isChatActive = useIsModalActive('chat')
  const { messagesLimit, chatOpacity, chatOpacityOpened } = options
  const lastMessageId = useRef(0)
  const usingTouch = useSnapshot(miscUiState).currentTouch
  const { chatSelect } = useSnapshot(options)
  const isUsingMicrosoftAuth = useMemo(() => !!lastConnectOptions.value?.authenticatedAccount, [])
  const { forwardChat } = useSnapshot(viewerVersionState)
  const { viewerConnection } = useSnapshot(gameAdditionalState)

  useEffect(() => {
    bot.addListener('message', (jsonMsg, position) => {
      if (position === 'game_info') return // ignore action bar messages, they are handled by the TitleProvider
      if (jsonMsg['unsigned']) {
        jsonMsg = jsonMsg['unsigned']
      }
      console.log('JTMC!! jsonMsg', jsonMsg)
      const parts = formatMessage(jsonMsg)

      // Only show player chat messages on canvas (not system messages)
      if (ChatRenderCanvas && isPlayerChatMessage(jsonMsg)) {
        addCanvasChatMessage(parts)
      }

      setMessages(m => {
        lastMessageId.current++
        const newMessage: Message = {
          parts,
          id: lastMessageId.current,
          faded: false,
        }
        fadeMessage(newMessage, true, () => {
          // eslint-disable-next-line max-nested-callbacks
          setMessages(m => [...m])
        })
        return [...m, newMessage].slice(-messagesLimit)
      })
    })
  }, [])

  return <Chat
    allowSelection={chatSelect}
    usingTouch={!!usingTouch}
    opacity={(isChatActive ? chatOpacityOpened : chatOpacity) / 100}
    messages={messages}
    opened={isChatActive}
    placeholder={forwardChat || !viewerConnection ? undefined : 'Chat forwarding is not enabled in the plugin settings'}
    sendMessage={(message) => {
      const builtinHandled = tryHandleBuiltinCommand(message)
      if (miscUiState.loadedServerIndex && (message.startsWith('/login') || message.startsWith('/register'))) {
        showNotification('Click here to save your password in browser for auto-login', undefined, false, undefined, () => {
          updateLoadedServerData((server) => {
            server.autoLogin ??= {}
            const password = message.split(' ')[1]
            server.autoLogin[bot.player.username] = password
            return server
          })
          hideNotification()
        })
      }
      if (!builtinHandled) {
        bot.chat(message)
      }
    }}
    onClose={() => {
      hideCurrentModal()
    }}
    fetchCompletionItems={async (triggerKind, completeValue) => {
      if ((triggerKind === 'explicit' || options.autoRequestCompletions)) {
        let items = [] as string[]
        try {
          items = await bot.tabComplete(completeValue, true, true)
        } catch (err) { }
        if (typeof items[0] === 'object') {
          // @ts-expect-error
          if (items[0].match) items = items.map(i => i.match)
        }
        if (completeValue === '/') {
          if (!items[0]?.startsWith('/')) {
            // normalize
            items = items.map(item => `/${item}`)
          }
          if (items.length) {
            items = [...items, ...getBuiltinCommandsList()]
          }
        }
        return items
      }
    }}
  />
}
