import { loadSkinToCanvas } from 'skinview-utils'
import * as THREE from 'three'
import stevePng from 'mc-assets/dist/other-textures/latest/entity/player/wide/steve.png'
import { appQueryParams } from '../../../../src/appParams'

// Molttown crab skins
import crab1 from '../../../../assets/molttown/crab_1.png'
import crab2 from '../../../../assets/molttown/crab_2.png'
import lobster1 from '../../../../assets/molttown/lobster_1.png'
import crabHawaiianRed from '../../../../assets/molttown/crab_hawaiian_red.png'
import crabHawaiianBlue from '../../../../assets/molttown/crab_hawaiian_blue.png'
import crabHawaiianGreen from '../../../../assets/molttown/crab_hawaiian_green.png'
import crabHawaiianPurple from '../../../../assets/molttown/crab_hawaiian_purple.png'
import crabHawaiianOrange from '../../../../assets/molttown/crab_hawaiian_orange.png'
import crabPirate from '../../../../assets/molttown/crab_pirate.png'
import crabNinjaBlack from '../../../../assets/molttown/crab_ninja_black.png'
import crabNinjaRed from '../../../../assets/molttown/crab_ninja_red.png'
import crabGolden from '../../../../assets/molttown/crab_golden.png'
import crabSilver from '../../../../assets/molttown/crab_silver.png'
import crabNeonPink from '../../../../assets/molttown/crab_neon_pink.png'
import crabNeonGreen from '../../../../assets/molttown/crab_neon_green.png'
import crabNeonCyan from '../../../../assets/molttown/crab_neon_cyan.png'
import crabTuxedo from '../../../../assets/molttown/crab_tuxedo.png'
import crabClown from '../../../../assets/molttown/crab_clown.png'
import crabDisco from '../../../../assets/molttown/crab_disco.png'
import crabCamoGreen from '../../../../assets/molttown/crab_camo_green.png'
import crabCamoDesert from '../../../../assets/molttown/crab_camo_desert.png'
import crabRainbow from '../../../../assets/molttown/crab_rainbow.png'
import crabZombie from '../../../../assets/molttown/crab_zombie.png'
import crabRobot from '../../../../assets/molttown/crab_robot.png'
import crabWizard from '../../../../assets/molttown/crab_wizard.png'
import crabChef from '../../../../assets/molttown/crab_chef.png'
import crabSuperhero from '../../../../assets/molttown/crab_superhero.png'
import crabBeach from '../../../../assets/molttown/crab_beach.png'

const crabSkins = [
  crab1,
  crabHawaiianRed,
  crabHawaiianBlue,
  crabHawaiianGreen,
  crabHawaiianPurple,
  crabHawaiianOrange,
  crabPirate,
  crabNinjaBlack,
  crabNinjaRed,
  crabGolden,
  crabSilver,
  crabNeonPink,
  crabNeonGreen,
  crabNeonCyan,
  crabTuxedo,
  crabClown,
  crabDisco,
  crabCamoGreen,
  crabCamoDesert,
  crabRainbow,
  crabZombie,
  crabRobot,
  crabWizard,
  crabChef,
  crabSuperhero,
  crabBeach,
]

const getRandomCrabSkin = () => crabSkins[Math.floor(Math.random() * crabSkins.length)]

const defaultSkin = appQueryParams.molttown ? crab1 : stevePng
export const stevePngUrl = defaultSkin
export const steveTexture = new THREE.TextureLoader().loadAsync(defaultSkin)

// Export for use when assigning skins to other players
export const isMolttown = !!appQueryParams.molttown
export { getRandomCrabSkin }

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
