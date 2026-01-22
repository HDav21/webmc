import type { MessageFormatPart } from './chatUtils'

// Config flag - set to true to render chat on canvas for recordings
export const ChatRenderCanvas = true

// Timing constants (same as React chat)
const VISIBLE_DURATION = 5000 // 5 seconds fully visible
const FADE_DURATION = 2000 // 3 seconds fade out

export interface CanvasChatMessage {
  parts: MessageFormatPart[]
  id: number
  timestamp: number
}

let lastMessageId = 0
const messages: CanvasChatMessage[] = []
const MAX_MESSAGES = 100 // Keep a reasonable buffer

export function addCanvasChatMessage (parts: MessageFormatPart[]): void {
  lastMessageId++
  messages.push({
    parts,
    id: lastMessageId,
    timestamp: Date.now()
  })

  // Trim old messages
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES)
  }
}

export function getCanvasChatMessages (): CanvasChatMessage[] {
  return messages
}

/**
 * Calculate opacity for a message based on time elapsed.
 * Returns 1 during visible period, fades from 1 to 0 during fade period, 0 after.
 */
export function getMessageOpacity (msg: CanvasChatMessage): number {
  const elapsed = Date.now() - msg.timestamp

  if (elapsed < VISIBLE_DURATION) {
    return 1
  }

  const fadeElapsed = elapsed - VISIBLE_DURATION
  if (fadeElapsed >= FADE_DURATION) {
    return 0
  }

  // Linear fade from 1 to 0
  return 1 - (fadeElapsed / FADE_DURATION)
}
