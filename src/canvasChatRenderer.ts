import { getColorShadow, messageFormatStylesMap } from './react/MessageFormatted'
import { getCanvasChatMessages, getMessageOpacity, CanvasChatMessage } from './canvasChatMessages'
import type { MessageFormatPart } from './chatUtils'

export { ChatRenderCanvas } from './canvasChatMessages'

// Rendering constants
const BASE_FONT_SIZE = 16
const LINE_HEIGHT = 44
const PADDING_LEFT = 20
const PADDING_BOTTOM = 100 // Above hotbar
const MAX_VISIBLE_MESSAGES = 10
const SHADOW_OFFSET = 1

// Overlay canvas for 2D chat rendering (WebGL canvas can't use 2D context)
let overlayCanvas: HTMLCanvasElement | null = null
let overlayCtx: CanvasRenderingContext2D | null = null

// Image cache for provider logos
const logoCache = new Map<string, HTMLImageElement | 'loading' | 'failed'>()

function loadLogoImage (url: string): HTMLImageElement | null {
  const cached = logoCache.get(url)
  if (cached === 'loading' || cached === 'failed') return null
  if (cached) return cached

  // Start loading
  logoCache.set(url, 'loading')
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    logoCache.set(url, img)
  }
  img.onerror = () => {
    logoCache.set(url, 'failed')
  }
  img.src = url
  return null
}

// Preload all provider logos at startup
function preloadAllLogos (): void {
  for (const provider of PROVIDER_NAMES) {
    const url = providerLogo(provider)
    if (url) {
      loadLogoImage(url)
    }
  }
}

function getOrCreateOverlayCanvas (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const gameCanvas = document.getElementById('viewer-canvas') as HTMLCanvasElement
  if (!gameCanvas) return null

  if (!overlayCanvas) {
    overlayCanvas = document.createElement('canvas')
    overlayCanvas.id = 'chat-overlay-canvas'
    overlayCanvas.style.position = 'fixed'
    overlayCanvas.style.top = '0'
    overlayCanvas.style.left = '0'
    overlayCanvas.style.width = '100%'
    overlayCanvas.style.height = '100%'
    overlayCanvas.style.pointerEvents = 'none'
    overlayCanvas.style.zIndex = '1' // Above WebGL canvas but below UI
    document.body.appendChild(overlayCanvas)
    overlayCtx = overlayCanvas.getContext('2d')
  }

  // Sync size with game canvas
  if (overlayCanvas.width !== gameCanvas.width || overlayCanvas.height !== gameCanvas.height) {
    overlayCanvas.width = gameCanvas.width
    overlayCanvas.height = gameCanvas.height
  }

  if (!overlayCtx) return null
  return { canvas: overlayCanvas, ctx: overlayCtx }
}

// Color mapping from messageFormatStylesMap - extract hex values
const colorMap: Record<string, string> = {}
for (const [key, value] of Object.entries(messageFormatStylesMap)) {
  if (value.startsWith('color:')) {
    colorMap[key] = value.replace('color:', '')
  }
}

// Default color if not found
const DEFAULT_COLOR = '#FFFFFF'

// Provider names to detect (keys from providerLogo)
const PROVIDER_NAMES = [
  'google', 'gemini', 'anthropic', 'claude', 'openai', 'amazon', 'arcee-ai',
  'ai21', 'aion-labs', 'alfredpros', 'allenai', 'openrouter', 'baidu',
  'bytedance', 'deepcogito', 'cohere', 'deepseek', 'eva-unit-01', 'inception',
  'inflection', 'liquid', 'alpindale', 'anthracite-org', 'mancer', 'meituan',
  'meta-llama', 'microsoft', 'mistralai', 'moonshotai', 'gryphe', 'nvidia',
  'neversleep', 'nousresearch', 'perplexity', 'qwen', 'undi95', 'sao10k',
  'raifle', 'stepfun-ai', 'thudm', 'tngtech', 'tencent', 'thedrummer',
  'cognitivecomputations', 'z-ai', 'x-ai', 'grok'
]

function detectProviderInMessage (parts: MessageFormatPart[]): string | null {
  // Get full message text
  const fullText = parts.map(p => p.text || '').join('').toLowerCase()

  // Check if any provider name appears in the message
  for (const provider of PROVIDER_NAMES) {
    // Match provider name as a word (with word boundaries)
    const regex = new RegExp(`\\b${provider.replace('-', '[-]?')}\\b`, 'i')
    if (regex.test(fullText)) {
      return provider
    }
  }
  return null
}

function getColor (colorName: string | undefined): string {
  if (!colorName) return DEFAULT_COLOR
  // Handle direct hex colors
  if (colorName.startsWith('#')) return colorName
  // Look up named color
  return colorMap[colorName.toLowerCase()] ?? DEFAULT_COLOR
}

function buildFontString (part: MessageFormatPart, fontSize: number): string {
  const styles: string[] = []

  if (part.italic) {
    styles.push('italic')
  }
  if (part.bold) {
    styles.push('bold')
  }

  styles.push(`${fontSize}px`, 'mojangles, monospace')

  return styles.join(' ')
}

// eslint-disable-next-line max-params
function renderMessageLine (
  ctx: CanvasRenderingContext2D,
  parts: MessageFormatPart[],
  x: number,
  y: number,
  fontSize: number,
  opacity: number
): void {
  let currentX = x

  for (const part of parts) {
    if (!part.text) continue

    ctx.font = buildFontString(part, fontSize)
    const color = getColor(part.color)
    const shadowColor = getColorShadow(color)

    // Draw shadow first
    ctx.fillStyle = shadowColor
    ctx.globalAlpha = opacity
    ctx.fillText(part.text, currentX + SHADOW_OFFSET, y + SHADOW_OFFSET)

    // Draw main text
    ctx.fillStyle = color
    ctx.globalAlpha = opacity
    ctx.fillText(part.text, currentX, y)

    // Handle strikethrough
    if (part.strikethrough) {
      const textWidth = ctx.measureText(part.text).width
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(currentX, y - fontSize * 0.3)
      ctx.lineTo(currentX + textWidth, y - fontSize * 0.3)
      ctx.stroke()
    }

    // Handle underline
    if (part.underlined) {
      const textWidth = ctx.measureText(part.text).width
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(currentX, y + 2)
      ctx.lineTo(currentX + textWidth, y + 2)
      ctx.stroke()
    }

    currentX += ctx.measureText(part.text).width
  }

  ctx.globalAlpha = 1
}

export function renderChatOnCanvas (): void {
  const overlay = getOrCreateOverlayCanvas()
  if (!overlay) return

  const { canvas, ctx } = overlay
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height

  // Clear the overlay canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  const messages = getCanvasChatMessages()

  // Filter to only visible messages (opacity > 0)
  const visibleMessages: Array<{ msg: CanvasChatMessage; opacity: number }> = []
  for (const msg of messages) {
    const opacity = getMessageOpacity(msg)
    if (opacity > 0) {
      visibleMessages.push({ msg, opacity })
    }
  }

  // Take only the last N visible messages
  const messagesToRender = visibleMessages.slice(-MAX_VISIBLE_MESSAGES)

  if (messagesToRender.length === 0) return

  // Scale font size based on canvas size (baseline: 800px height)
  const scaleFactor = Math.max(1, canvasHeight / 800)
  const fontSize = Math.round(BASE_FONT_SIZE * scaleFactor)
  const lineHeight = Math.round(LINE_HEIGHT * scaleFactor)
  const paddingBottom = Math.round(PADDING_BOTTOM * scaleFactor)
  const paddingLeft = Math.round(PADDING_LEFT * scaleFactor)

  // Calculate starting Y position (bottom-up rendering)
  const startY = canvasHeight - paddingBottom - (messagesToRender.length - 1) * lineHeight

  ctx.textBaseline = 'top'

  const iconSize = Math.round(fontSize * 1.1)
  const iconPadding = Math.round(fontSize * 0.3)

  for (const [i, { msg, opacity }] of messagesToRender.entries()) {
    const y = startY + i * lineHeight
    let xOffset = paddingLeft

    // Check for provider logo
    const provider = detectProviderInMessage(msg.parts)
    if (provider) {
      const logoUrl = providerLogo(provider)
      if (logoUrl) {
        const logoImg = loadLogoImage(logoUrl)
        if (logoImg) {
          ctx.globalAlpha = opacity
          // Draw logo centered vertically with the text
          const logoY = y - (iconSize - fontSize) / 2
          const borderRadius = 2

          ctx.save()

          // Draw white rounded rectangle background
          ctx.fillStyle = '#FFFFFF'
          ctx.beginPath()
          ctx.roundRect(xOffset, logoY, iconSize, iconSize, borderRadius)
          ctx.fill()

          // Clip to rounded rectangle and draw logo
          ctx.beginPath()
          ctx.roundRect(xOffset, logoY, iconSize, iconSize, borderRadius)
          ctx.clip()
          ctx.drawImage(logoImg, xOffset, logoY, iconSize, iconSize)

          ctx.restore()

          xOffset += iconSize + iconPadding
        }
      }
    }

    renderMessageLine(ctx, msg.parts, xOffset, y, fontSize, opacity)
  }
}


export function providerLogo (provider: string): string | null {
  const providerLogoURLs: Record<string, string> = {
    google: 'https://openrouter.ai/images/icons/GoogleGemini.svg',
    gemini: 'https://openrouter.ai/images/icons/GoogleGemini.svg',
    anthropic:
      'https://firebasestorage.googleapis.com/v0/b/kradle-prod-storage/o/public%2Fdefaults%2Fanthropic.svg?alt=media',
    claude:
      'https://firebasestorage.googleapis.com/v0/b/kradle-prod-storage/o/public%2Fdefaults%2Fanthropic.svg?alt=media',
    openai: 'https://openrouter.ai/images/icons/OpenAI.svg',
    amazon: 'https://openrouter.ai/images/icons/Bedrock.svg',
    'arcee-ai':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://arcee.ai/&size=256',
    ai21: 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://ai21.com/&size=256',
    'aion-labs':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.aionlabs.ai/&size=256',
    alfredpros:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    allenai:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://allenai.org/&size=256',
    openrouter:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://openrouter.ai/&size=256',
    baidu:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.baidu.com/&size=256',
    bytedance:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    deepcogito:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.deepcogito.com/&size=256',
    cohere: 'https://openrouter.ai/images/icons/Cohere.png',
    deepseek: 'https://openrouter.ai/images/icons/DeepSeek.png',
    'eva-unit-01': 'https://openrouter.ai/images/icons/Qwen.png',
    inception:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.inceptionlabs.ai/&size=256',
    inflection:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://inflection.ai/&size=256',
    liquid:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.liquid.ai/&size=256',
    alpindale:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    'anthracite-org':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    mancer:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    meituan:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    'meta-llama':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://ai.meta.com/&size=256',
    microsoft: 'https://openrouter.ai/images/icons/Microsoft.svg',
    mistralai: 'https://openrouter.ai/images/icons/Mistral.png',
    moonshotai:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://moonshot.ai&size=256',
    gryphe:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    nvidia:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://nvidia.com/&size=256',
    neversleep:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    nousresearch:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://nousresearch.com/&size=256',
    perplexity: 'https://openrouter.ai/images/icons/Perplexity.svg',
    qwen: 'https://openrouter.ai/images/icons/Qwen.png',
    undi95:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://nousresearch.com/&size=256',
    sao10k:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    raifle:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    'stepfun-ai':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    thudm:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://z.ai/&size=256',
    tngtech:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    tencent:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    thedrummer: 'https://openrouter.ai/images/icons/TheDrummer.png',
    cognitivecomputations:
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://huggingface.co/&size=256',
    'z-ai':
      'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://z.ai/&size=256',
    'x-ai': 'https://firebasestorage.googleapis.com/v0/b/kradle-prod-storage/o/public%2Fdefaults%2Fxai.svg?alt=media',
    grok: 'https://firebasestorage.googleapis.com/v0/b/kradle-prod-storage/o/public%2Fdefaults%2Fxai.svg?alt=media'
  }

  try {
    return providerLogoURLs[provider]
  } catch {
    return null
  }
}

// Preload all logos on module load
preloadAllLogos()
