const Jimp = require('jimp')
const path = require('path')

// Minecraft skin regions (64x64 format)
const REGIONS = {
  head: { x: 0, y: 0, w: 32, h: 16 },
  body: { x: 16, y: 16, w: 24, h: 16 },
  rightArm: { x: 40, y: 16, w: 16, h: 16 },
  leftArm: { x: 32, y: 48, w: 16, h: 16 },
  rightLeg: { x: 0, y: 16, w: 16, h: 16 },
  leftLeg: { x: 16, y: 48, w: 16, h: 16 },
  // Overlay layers
  headOverlay: { x: 32, y: 0, w: 32, h: 16 },
  bodyOverlay: { x: 16, y: 32, w: 24, h: 16 },
}

// Color themes for variations
const THEMES = [
  { name: 'hawaiian_red', hueShift: 0, satMult: 1.0, pattern: 'hawaiian', patternColor: 0xFFFF00FF },
  { name: 'hawaiian_blue', hueShift: 180, satMult: 1.0, pattern: 'hawaiian', patternColor: 0xFFFFFFFF },
  { name: 'hawaiian_green', hueShift: 90, satMult: 1.0, pattern: 'hawaiian', patternColor: 0xFF69B4FF },
  { name: 'hawaiian_purple', hueShift: 270, satMult: 1.0, pattern: 'hawaiian', patternColor: 0xFFD700FF },
  { name: 'hawaiian_orange', hueShift: 30, satMult: 1.0, pattern: 'hawaiian', patternColor: 0x00FF00FF },
  { name: 'pirate', hueShift: 0, satMult: 0.3, pattern: 'pirate', patternColor: 0x000000FF },
  { name: 'ninja_black', hueShift: 0, satMult: 0.0, pattern: 'ninja', patternColor: 0x333333FF },
  { name: 'ninja_red', hueShift: 0, satMult: 1.0, pattern: 'ninja', patternColor: 0xFF0000FF },
  { name: 'golden', hueShift: 45, satMult: 1.2, pattern: 'sparkle', patternColor: 0xFFD700FF },
  { name: 'silver', hueShift: 0, satMult: 0.1, pattern: 'sparkle', patternColor: 0xC0C0C0FF },
  { name: 'neon_pink', hueShift: 320, satMult: 1.5, pattern: 'stripes', patternColor: 0xFF00FFFF },
  { name: 'neon_green', hueShift: 120, satMult: 1.5, pattern: 'stripes', patternColor: 0x00FF00FF },
  { name: 'neon_cyan', hueShift: 180, satMult: 1.5, pattern: 'stripes', patternColor: 0x00FFFFFF },
  { name: 'tuxedo', hueShift: 0, satMult: 0.0, pattern: 'tuxedo', patternColor: 0xFFFFFFFF },
  { name: 'clown', hueShift: 0, satMult: 1.0, pattern: 'polkadots', patternColor: 0xFF0000FF },
  { name: 'disco', hueShift: 280, satMult: 1.3, pattern: 'checker', patternColor: 0xFFFF00FF },
  { name: 'camo_green', hueShift: 100, satMult: 0.7, pattern: 'camo', patternColor: 0x556B2FFF },
  { name: 'camo_desert', hueShift: 40, satMult: 0.5, pattern: 'camo', patternColor: 0xD2B48CFF },
  { name: 'rainbow', hueShift: 0, satMult: 1.0, pattern: 'rainbow', patternColor: 0xFF0000FF },
  { name: 'zombie', hueShift: 100, satMult: 0.6, pattern: 'zombie', patternColor: 0x228B22FF },
  { name: 'robot', hueShift: 200, satMult: 0.3, pattern: 'robot', patternColor: 0x808080FF },
  { name: 'wizard', hueShift: 260, satMult: 1.2, pattern: 'wizard', patternColor: 0xFFD700FF },
  { name: 'chef', hueShift: 0, satMult: 0.9, pattern: 'chef', patternColor: 0xFFFFFFFF },
  { name: 'superhero', hueShift: 240, satMult: 1.3, pattern: 'superhero', patternColor: 0xFF0000FF },
  { name: 'beach', hueShift: 30, satMult: 1.1, pattern: 'beach', patternColor: 0x87CEEBFF },
]

// Convert RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s, l]
}

// Convert HSL to RGB
function hslToRgb(h, s, l) {
  h /= 360
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

// Apply hue shift and saturation multiplier to a color
function shiftColor(color, hueShift, satMult) {
  const r = (color >> 24) & 0xFF
  const g = (color >> 16) & 0xFF
  const b = (color >> 8) & 0xFF
  const a = color & 0xFF

  if (a === 0) return color // Keep transparent pixels

  let [h, s, l] = rgbToHsl(r, g, b)
  h = (h + hueShift) % 360
  if (h < 0) h += 360
  s = Math.min(1, Math.max(0, s * satMult))

  const [nr, ng, nb] = hslToRgb(h, s, l)
  return Jimp.rgbaToInt(nr, ng, nb, a)
}

// Pattern drawing functions
const patterns = {
  hawaiian: (img, color, region) => {
    // Draw flower patterns on the body
    const flowers = [[20, 20], [28, 22], [24, 26], [32, 24]]
    flowers.forEach(([fx, fy]) => {
      if (fx < img.getWidth() && fy < img.getHeight()) {
        // Simple 3x3 flower
        img.setPixelColor(color, fx, fy)
        if (fx > 0) img.setPixelColor(color, fx - 1, fy)
        if (fx < img.getWidth() - 1) img.setPixelColor(color, fx + 1, fy)
        if (fy > 0) img.setPixelColor(color, fx, fy - 1)
        if (fy < img.getHeight() - 1) img.setPixelColor(color, fx, fy + 1)
      }
    })
  },

  stripes: (img, color, region) => {
    // Horizontal stripes on body
    for (let y = 20; y < 32; y += 2) {
      for (let x = 20; x < 36; x++) {
        if (img.getPixelColor(x, y) & 0xFF) { // If not transparent
          img.setPixelColor(color, x, y)
        }
      }
    }
  },

  polkadots: (img, color, region) => {
    const dots = [[22, 21], [26, 23], [30, 21], [24, 27], [28, 25], [32, 27]]
    dots.forEach(([x, y]) => {
      if (x < img.getWidth() && y < img.getHeight() && (img.getPixelColor(x, y) & 0xFF)) {
        img.setPixelColor(color, x, y)
      }
    })
  },

  checker: (img, color, region) => {
    for (let y = 20; y < 32; y++) {
      for (let x = 20; x < 36; x++) {
        if ((x + y) % 2 === 0 && (img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(color, x, y)
        }
      }
    }
  },

  pirate: (img, color, region) => {
    // Eye patch on head (around x:8-12, y:8-12 area)
    for (let y = 9; y < 12; y++) {
      for (let x = 10; x < 14; x++) {
        img.setPixelColor(color, x, y)
      }
    }
    // Bandana line
    for (let x = 8; x < 24; x++) {
      if ((img.getPixelColor(x, 6) & 0xFF)) {
        img.setPixelColor(0x8B0000FF, x, 6)
        img.setPixelColor(0x8B0000FF, x, 7)
      }
    }
  },

  ninja: (img, color, region) => {
    // Mask covering most of head except eyes
    for (let y = 8; y < 16; y++) {
      for (let x = 8; x < 24; x++) {
        if (y < 10 || y > 12) { // Leave eye slit
          if ((img.getPixelColor(x, y) & 0xFF)) {
            img.setPixelColor(color, x, y)
          }
        }
      }
    }
  },

  sparkle: (img, color, region) => {
    // Random sparkle dots
    const sparkles = [[10, 10], [20, 22], [14, 6], [28, 24], [8, 20], [32, 20]]
    sparkles.forEach(([x, y]) => {
      if (x < img.getWidth() && y < img.getHeight()) {
        img.setPixelColor(color, x, y)
      }
    })
  },

  tuxedo: (img, color, region) => {
    // White shirt front on body
    for (let y = 20; y < 32; y++) {
      for (let x = 24; x < 28; x++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(color, x, y)
        }
      }
    }
    // Bow tie
    img.setPixelColor(0xFF0000FF, 25, 20)
    img.setPixelColor(0xFF0000FF, 26, 20)
  },

  camo: (img, color, region) => {
    // Random camo blotches
    const blotches = [[21, 21], [25, 24], [29, 22], [23, 27], [31, 26], [27, 29]]
    const colors = [color, 0x6B8E23FF, 0x556B2FFF]
    blotches.forEach(([x, y], i) => {
      const c = colors[i % colors.length]
      if (x < img.getWidth() - 1 && y < img.getHeight() - 1) {
        img.setPixelColor(c, x, y)
        img.setPixelColor(c, x + 1, y)
        img.setPixelColor(c, x, y + 1)
      }
    })
  },

  rainbow: (img, color, region) => {
    const rainbowColors = [0xFF0000FF, 0xFF7F00FF, 0xFFFF00FF, 0x00FF00FF, 0x0000FFFF, 0x8B00FFFF]
    for (let y = 20; y < 32; y++) {
      const colorIndex = Math.floor((y - 20) / 2) % rainbowColors.length
      for (let x = 20; x < 36; x++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(rainbowColors[colorIndex], x, y)
        }
      }
    }
  },

  zombie: (img, color, region) => {
    // Tattered look - random dark spots
    const spots = [[9, 9], [12, 11], [22, 23], [26, 21], [30, 25], [15, 7]]
    spots.forEach(([x, y]) => {
      if (x < img.getWidth() && y < img.getHeight()) {
        img.setPixelColor(0x1A1A1AFF, x, y)
      }
    })
  },

  robot: (img, color, region) => {
    // Circuit pattern lines
    for (let x = 20; x < 36; x += 4) {
      for (let y = 20; y < 32; y++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(0x00FFFFFF, x, y)
        }
      }
    }
    for (let y = 20; y < 32; y += 4) {
      for (let x = 20; x < 36; x++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(0x00FFFFFF, x, y)
        }
      }
    }
  },

  wizard: (img, color, region) => {
    // Stars and moons
    const stars = [[22, 22], [28, 24], [32, 21], [25, 28]]
    stars.forEach(([x, y]) => {
      if (x < img.getWidth() && y < img.getHeight()) {
        img.setPixelColor(color, x, y)
        if (x > 0) img.setPixelColor(color, x - 1, y)
        if (x < img.getWidth() - 1) img.setPixelColor(color, x + 1, y)
        if (y > 0) img.setPixelColor(color, x, y - 1)
        if (y < img.getHeight() - 1) img.setPixelColor(color, x, y + 1)
      }
    })
  },

  chef: (img, color, region) => {
    // Chef hat (white top of head)
    for (let y = 0; y < 8; y++) {
      for (let x = 8; x < 24; x++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(color, x, y)
        }
      }
    }
  },

  superhero: (img, color, region) => {
    // Cape pattern on back/body, logo on chest
    // Simple "S" shape logo area
    for (let y = 21; y < 26; y++) {
      for (let x = 24; x < 28; x++) {
        if ((img.getPixelColor(x, y) & 0xFF)) {
          img.setPixelColor(color, x, y)
        }
      }
    }
  },

  beach: (img, color, region) => {
    // Sunglasses
    for (let y = 10; y < 12; y++) {
      for (let x = 8; x < 14; x++) {
        img.setPixelColor(0x000000FF, x, y)
      }
      for (let x = 18; x < 24; x++) {
        img.setPixelColor(0x000000FF, x, y)
      }
    }
    // Bridge
    for (let x = 14; x < 18; x++) {
      img.setPixelColor(0x000000FF, x, 10)
    }
  },
}

async function generateVariations() {
  const basePath = path.join(__dirname, 'crab_1.png')
  const baseImage = await Jimp.read(basePath)

  console.log(`Loaded base image: ${baseImage.getWidth()}x${baseImage.getHeight()}`)
  console.log(`Generating ${THEMES.length} variations...\n`)

  for (const theme of THEMES) {
    // Clone the base image
    const img = baseImage.clone()

    // Apply color transformation to all pixels
    img.scan(0, 0, img.getWidth(), img.getHeight(), function(x, y, idx) {
      const color = this.getPixelColor(x, y)
      const newColor = shiftColor(color, theme.hueShift, theme.satMult)
      this.setPixelColor(newColor, x, y)
    })

    // Apply pattern if exists
    if (theme.pattern && patterns[theme.pattern]) {
      patterns[theme.pattern](img, theme.patternColor, REGIONS.body)
    }

    // Save the variation
    const outputPath = path.join(__dirname, `crab_${theme.name}.png`)
    await img.writeAsync(outputPath)
    console.log(`Created: crab_${theme.name}.png`)
  }

  console.log(`\nDone! Generated ${THEMES.length} crab variations.`)
}

generateVariations().catch(console.error)
