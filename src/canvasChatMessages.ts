import type { MessageFormatPart } from './chatUtils'
import { isGamePaused } from './iframe'

// Layout types
export type ChatLayout = 'minecraft' | 'stacked'
let currentLayout: ChatLayout = 'minecraft'

export function setChatLayout (layout: ChatLayout): void {
  currentLayout = layout
}

export function getChatLayout (): ChatLayout {
  return currentLayout
}

// Timing constants (same as React chat)
const APPEAR_DELAY = 750 // delay before showing
const FADE_IN_DURATION = 600 // fade in over 600ms
const VISIBLE_DURATION = 7000 // 7 seconds fully visible
const FADE_DURATION = 2000 // 2 seconds fade out

// Animation constants for stacked layout
const SLIDE_ANIMATION_DURATION = 750 // ms for slide animation

// Ease-out cubic: fast start, slow end
function easeOutCubic (t: number): number {
  return 1 - ((1 - t) ** 3)
}

export interface CanvasChatMessage {
  parts: MessageFormatPart[]
  id: number
  timestamp: number
  pausedDuration: number // Total time spent paused since message was created
  lastPauseCheck: number // Last time we checked pause state
  // Animation state for stacked layout
  currentY: number | null // Current animated Y position (null = not yet positioned)
  targetY: number | null // Target Y position for animation
  animationStartY: number | null // Y position when animation started
  animationStartTime: number // When the current animation started
  animationPausedDuration: number // Time spent paused during animation
}

let lastMessageId = 0
const messages: CanvasChatMessage[] = []
const MAX_MESSAGES = 100 // Keep a reasonable buffer

export function addCanvasChatMessage (parts: MessageFormatPart[]): void {
  lastMessageId++
  const now = Date.now()
  messages.push({
    parts,
    id: lastMessageId,
    timestamp: now,
    pausedDuration: 0,
    lastPauseCheck: now,
    currentY: null,
    targetY: null,
    animationStartY: null,
    animationStartTime: now,
    animationPausedDuration: 0
  })

  // Trim old messages
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES)
  }
}

/**
 * Update animation state for a message (for stacked layout).
 * Uses time-based animation with ease-out curve.
 * Returns the Y position to render at.
 */
export function updateMessageAnimation (msg: CanvasChatMessage, targetY: number): number {
  const now = Date.now()
  const paused = isGamePaused()

  // First time positioning - snap to target
  if (msg.currentY === null) {
    msg.currentY = targetY
    msg.targetY = targetY
    msg.animationStartY = targetY
    msg.animationStartTime = now
    return targetY
  }

  // Track pause time for animation
  if (paused) {
    msg.animationPausedDuration += now - (msg.lastPauseCheck || now)
    msg.lastPauseCheck = now
    return msg.currentY
  }

  // If target changed, start a new animation
  if (msg.targetY !== targetY) {
    msg.animationStartY = msg.currentY
    msg.targetY = targetY
    msg.animationStartTime = now
    msg.animationPausedDuration = 0
  }

  // Calculate animation progress (0 to 1)
  const elapsed = now - msg.animationStartTime - msg.animationPausedDuration
  const progress = Math.min(1, elapsed / SLIDE_ANIMATION_DURATION)

  // Apply ease-out curve
  const easedProgress = easeOutCubic(progress)

  // Interpolate between start and target
  const startY = msg.animationStartY ?? targetY
  msg.currentY = startY + (targetY - startY) * easedProgress

  return msg.currentY
}

export function getCanvasChatMessages (): CanvasChatMessage[] {
  return messages
}

export function clearCanvasChatMessages (): void {
  messages.length = 0
  lastMessageId = 0
}

/**
 * Calculate opacity for a message based on time elapsed.
 * Returns 1 during visible period, fades from 1 to 0 during fade period, 0 after.
 * Pauses fade-out when game is paused.
 */
export function getMessageOpacity (msg: CanvasChatMessage): number {
  const now = Date.now()
  const paused = isGamePaused()

  // Accumulate paused time
  if (paused) {
    msg.pausedDuration += now - msg.lastPauseCheck
  }
  msg.lastPauseCheck = now

  // Calculate effective elapsed time (excluding time spent paused)
  const elapsed = now - msg.timestamp - msg.pausedDuration

  // Don't show during initial delay
  if (elapsed < APPEAR_DELAY) {
    return 0
  }

  // Adjust elapsed time to account for delay
  const visibleElapsed = elapsed - APPEAR_DELAY

  // Fade in over FADE_IN_DURATION
  if (visibleElapsed < FADE_IN_DURATION) {
    return visibleElapsed / FADE_IN_DURATION
  }

  if (visibleElapsed < VISIBLE_DURATION) {
    return 1
  }

  const fadeElapsed = visibleElapsed - VISIBLE_DURATION
  if (fadeElapsed >= FADE_DURATION) {
    return 0
  }

  // Linear fade from 1 to 0
  return 1 - (fadeElapsed / FADE_DURATION)
}
