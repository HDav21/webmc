import { loadSkinToCanvas } from 'skinview-utils'
import * as THREE from 'three'
import stevePng from 'mc-assets/dist/other-textures/latest/entity/player/wide/steve.png'

// eslint-disable-next-line unicorn/prefer-export-from
export const stevePngUrl = stevePng
export const steveTexture = new THREE.TextureLoader().loadAsync(stevePng)

export async function loadImageFromUrl (imageUrl: string): Promise<HTMLImageElement> {
  const img = new Image()

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Image load timeout: ${imageUrl}`))
    }, 10_000) // 10 second timeout

    img.onload = () => {
      clearTimeout(timeout)
      resolve(img)
    }

    img.onerror = (error) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to load image: ${imageUrl}. Error: ${error instanceof Event ? error.type : String(error)}`))
    }

    img.onabort = () => {
      clearTimeout(timeout)
      reject(new Error(`Image load aborted: ${imageUrl}`))
    }

    // Enable CORS if needed
    img.crossOrigin = 'anonymous'

    // Set the source last to start loading
    img.src = imageUrl
  })
}

export function getLookupUrl (username: string, type: 'skin' | 'cape'): string {
  return `https://mulv.tycrek.dev/api/lookup?username=${username}&type=${type}`
}

export async function loadSkinImage (skinUrl: string): Promise<{ canvas: HTMLCanvasElement, image: HTMLImageElement }> {
  const image = await loadImageFromUrl(skinUrl)
  const skinCanvas = document.createElement('canvas')
  loadSkinToCanvas(skinCanvas, image)
  return { canvas: skinCanvas, image }
}
