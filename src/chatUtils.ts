// this should actually be moved to mineflayer / renderer

import { fromFormattedString, TextComponent } from '@xmcl/text-component'
import type { IndexedData } from 'minecraft-data'
import { versionToNumber } from 'renderer/viewer/common/utils'

export type MessageFormatPart = Pick<TextComponent, 'hoverEvent' | 'clickEvent'> & {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
}

type MessageInput = {
  text?: string
  translate?: string
  with?: Array<MessageInput | string>
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
  extra?: MessageInput[]
  json?: any
}

const global = globalThis as any

// todo move to sign-renderer, replace with prismarine-chat, fix mcData issue!
// Override formats that use angle brackets around player names
const translationOverrides: Record<string, string> = {
  'chat.type.text': '%s  %s', // Default is "<%s> %s"
  'chat.type.announcement': '[%s] %s' // Default is "[%s] %s" (keep as is but documented)
}

export const formatMessage = (message: MessageInput, mcData: IndexedData = global.loadedData) => {
  let msglist: MessageFormatPart[] = []

  const readMsg = (msg: MessageInput) => {
    const styles = {
      color: msg.color,
      bold: !!msg.bold,
      italic: !!msg.italic,
      underlined: !!msg.underlined,
      strikethrough: !!msg.strikethrough,
      obfuscated: !!msg.obfuscated
    }

    if (!msg.text && typeof msg.json?.[''] === 'string') msg.text = msg.json['']
    if (msg.text) {
      msglist.push({
        ...msg,
        text: msg.text,
        ...styles
      })
    } else if (msg.translate) {
      const tText = translationOverrides[msg.translate] ?? mcData?.language[msg.translate] ?? msg.translate

      if (msg.with) {
        const splitted = tText.split(/%s|%\d+\$s/g)

        let i = 0
        for (const [j, part] of splitted.entries()) {
          msglist.push({ text: part, ...styles })

          if (j + 1 < splitted.length) {
            if (msg.with[i]) {
              const msgWith = msg.with[i]
              if (typeof msgWith === 'string') {
                readMsg({
                  ...styles,
                  text: msgWith
                })
              } else {
                readMsg({
                  ...styles,
                  ...msgWith
                })
              }
            }
            i++
          }
        }
      } else {
        msglist.push({
          ...msg,
          text: tText,
          ...styles
        })
      }
    }

    if (msg.extra) {
      for (const ex of msg.extra) {
        readMsg({ ...styles, ...ex })
      }
    }
  }

  readMsg(message)

  const flat = (msg) => {
    return [msg, msg.extra?.flatMap(flat) ?? []]
  }

  msglist = msglist.map(msg => {
    // normalize §
    if (!msg.text.includes?.('§')) return msg
    const newMsg = fromFormattedString(msg.text)
    return flat(newMsg)
  }).flat(Infinity)

  // Post-process to strip angle brackets around player names at the START of the message only
  // For modern Minecraft (1.19+), the chat registry format includes <player> brackets
  // This strips them while preserving the rest of the message structure
  let foundOpenBracket = false
  let bracketStrippingDone = false
  msglist = msglist.map((msg, index) => {
    if (typeof msg.text !== 'string') return msg
    if (bracketStrippingDone) return msg // Only process at the start of the message

    let { text } = msg

    // Handle case where <PlayerName> is all in one segment at the start
    if (index === 0 && /^<[^>]+>/.test(text)) {
      text = text.replace(/^<([^>]+)>/, '$1')
      bracketStrippingDone = true
      return { ...msg, text }
    }

    // Handle case where brackets are split across segments
    // Strip leading < from first segment
    if (index === 0 && text === '<') {
      foundOpenBracket = true
      return { ...msg, text: '' }
    }
    if (index === 0 && text.startsWith('<')) {
      foundOpenBracket = true
      return { ...msg, text: text.slice(1) }
    }

    // Strip trailing > (with optional space) after player name - only if we found opening bracket
    if (foundOpenBracket && (text === '>' || text === '> ' || text.startsWith('> '))) {
      foundOpenBracket = false
      bracketStrippingDone = true
      return { ...msg, text: text.replace(/^>\s*/, '  ') }
    }
    if (foundOpenBracket && text.endsWith('>')) {
      // End of player name like "PlayerName>"
      foundOpenBracket = false
      bracketStrippingDone = true
      return { ...msg, text: text.slice(0, -1) }
    }

    // If we haven't found brackets in first few segments, stop looking
    if (index >= 2) {
      bracketStrippingDone = true
    }

    return msg
  }).filter(msg => msg.text !== '')

  return msglist
}

const blockToItemRemaps = {
  water: 'water_bucket',
  lava: 'lava_bucket',
  redstone_wire: 'redstone',
  tripwire: 'tripwire_hook'
}

export const getItemFromBlock = (block: import('prismarine-block').Block) => {
  const item = global.loadedData.itemsByName[blockToItemRemaps[block.name] ?? block.name]
  return item
}
