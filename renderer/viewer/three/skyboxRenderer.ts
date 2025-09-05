import * as THREE from 'three'

export const DEFAULT_TEMPERATURE = 0.75

export class SkyboxRenderer {
  private texture: THREE.Texture | null = null
  private mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null
  private skyMesh: THREE.Mesh | null = null
  private voidMesh: THREE.Mesh | null = null

  // World state
  private worldTime = 0
  private partialTicks = 0
  private viewDistance = 4
  private temperature = DEFAULT_TEMPERATURE

  constructor (private readonly scene: THREE.Scene, public initialImage: string | null) {
    if (!initialImage) {
      this.createGradientSky()
    }
  }

  async init () {
    if (this.initialImage) {
      await this.setSkyboxImage(this.initialImage)
    }
  }

  async setSkyboxImage (imageUrl: string) {
    // Dispose old textures if they exist
    if (this.texture) {
      this.texture.dispose()
    }

    // Load the equirectangular texture
    const textureLoader = new THREE.TextureLoader()
    this.texture = await new Promise((resolve) => {
      textureLoader.load(
        imageUrl,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping
          texture.encoding = THREE.sRGBEncoding
          // Keep pixelated look
          texture.minFilter = THREE.NearestFilter
          texture.magFilter = THREE.NearestFilter
          texture.needsUpdate = true
          resolve(texture)
        }
      )
    })

    // Create or update the skybox
    if (this.mesh) {
      // Just update the texture on the existing material
      this.mesh.material.map = this.texture
      this.mesh.material.needsUpdate = true
    } else {
      // Create a large sphere geometry for the skybox
      const geometry = new THREE.SphereGeometry(500, 60, 40)
      // Flip the geometry inside out
      geometry.scale(-1, 1, 1)

      // Create material using the loaded texture
      const material = new THREE.MeshBasicMaterial({
        map: this.texture,
        side: THREE.FrontSide // Changed to FrontSide since we're flipping the geometry
      })

      // Create and add the skybox mesh
      this.mesh = new THREE.Mesh(geometry, material)
      this.scene.add(this.mesh)
    }
  }

  update (cameraPosition: THREE.Vector3, newViewDistance: number) {
    if (newViewDistance !== this.viewDistance) {
      this.viewDistance = newViewDistance
      this.updateSkyColors()
    }

    if (this.mesh) {
      // Update skybox position
      this.mesh.position.copy(cameraPosition)
    } else if (this.skyMesh) {
      // Update gradient sky position
      this.skyMesh.position.copy(cameraPosition)
      this.voidMesh?.position.copy(cameraPosition)
      this.updateSkyColors() // Update colors based on time of day
    }
  }

  // Update world time
  updateTime (timeOfDay: number, partialTicks = 0) {
    this.worldTime = timeOfDay
    this.partialTicks = partialTicks
    this.updateSkyColors()
  }

  // Update view distance
  updateViewDistance (viewDistance: number) {
    this.viewDistance = viewDistance
    this.updateSkyColors()
  }

  // Update temperature (for biome support)
  updateTemperature (temperature: number) {
    this.temperature = temperature
    this.updateSkyColors()
  }

  private createGradientSky () {
    const size = 64
    const scale = 256 / size + 2

    {
      const geometry = new THREE.PlaneGeometry(size * scale * 2, size * scale * 2)
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, 16, 0)

      const material = new THREE.MeshBasicMaterial({
        color: 0xff_ff_ff,
        side: THREE.DoubleSide,
        depthTest: false
      })

      this.skyMesh = new THREE.Mesh(geometry, material)
      this.scene.add(this.skyMesh)
    }

    {
      const geometry = new THREE.PlaneGeometry(size * scale * 2, size * scale * 2)
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, -16, 0)

      const material = new THREE.MeshBasicMaterial({
        color: 0xff_ff_ff,
        side: THREE.DoubleSide,
        depthTest: false
      })

      this.voidMesh = new THREE.Mesh(geometry, material)
      this.scene.add(this.voidMesh)
    }

    this.updateSkyColors()
  }

  private getFogColor (partialTicks = 0): THREE.Vector3 {
    const angle = this.getCelestialAngle(partialTicks)
    let rotation = Math.cos(angle * Math.PI * 2) * 2 + 0.5
    rotation = Math.max(0, Math.min(1, rotation))

    let x = 0.752_941_2
    let y = 0.847_058_83
    let z = 1

    x *= (rotation * 0.94 + 0.06)
    y *= (rotation * 0.94 + 0.06)
    z *= (rotation * 0.91 + 0.09)

    return new THREE.Vector3(x, y, z)
  }

  private getSkyColor (x = 0, z = 0, partialTicks = 0): THREE.Vector3 {
    const angle = this.getCelestialAngle(partialTicks)
    let brightness = Math.cos(angle * 3.141_593 * 2) * 2 + 0.5

    if (brightness < 0) brightness = 0
    if (brightness > 1) brightness = 1

    const temperature = this.getTemperature(x, z)
    const rgb = this.getSkyColorByTemp(temperature)

    const red = ((rgb >> 16) & 0xff) / 255
    const green = ((rgb >> 8) & 0xff) / 255
    const blue = (rgb & 0xff) / 255

    return new THREE.Vector3(
      red * brightness,
      green * brightness,
      blue * brightness
    )
  }

  private calculateCelestialAngle (time: number, partialTicks: number): number {
    const modTime = (time % 24_000)
    let angle = (modTime + partialTicks) / 24_000 - 0.25

    if (angle < 0) {
      angle++
    }
    if (angle > 1) {
      angle--
    }

    angle = 1 - ((Math.cos(angle * Math.PI) + 1) / 2)
    angle += (angle - angle) / 3

    return angle
  }

  private getCelestialAngle (partialTicks: number): number {
    return this.calculateCelestialAngle(this.worldTime, partialTicks)
  }

  private getTemperature (x: number, z: number): number {
    return this.temperature
  }

  private getSkyColorByTemp (temperature: number): number {
    temperature /= 3
    if (temperature < -1) temperature = -1
    if (temperature > 1) temperature = 1

    const hue = 0.622_222_2 - temperature * 0.05
    const saturation = 0.5 + temperature * 0.1
    const brightness = 1

    return this.hsbToRgb(hue, saturation, brightness)
  }

  private hsbToRgb (hue: number, saturation: number, brightness: number): number {
    let r = 0; let g = 0; let b = 0
    if (saturation === 0) {
      r = g = b = Math.floor(brightness * 255 + 0.5)
    } else {
      const h = (hue - Math.floor(hue)) * 6
      const f = h - Math.floor(h)
      const p = brightness * (1 - saturation)
      const q = brightness * (1 - saturation * f)
      const t = brightness * (1 - (saturation * (1 - f)))
      switch (Math.floor(h)) {
        case 0:
          r = Math.floor(brightness * 255 + 0.5)
          g = Math.floor(t * 255 + 0.5)
          b = Math.floor(p * 255 + 0.5)
          break
        case 1:
          r = Math.floor(q * 255 + 0.5)
          g = Math.floor(brightness * 255 + 0.5)
          b = Math.floor(p * 255 + 0.5)
          break
        case 2:
          r = Math.floor(p * 255 + 0.5)
          g = Math.floor(brightness * 255 + 0.5)
          b = Math.floor(t * 255 + 0.5)
          break
        case 3:
          r = Math.floor(p * 255 + 0.5)
          g = Math.floor(q * 255 + 0.5)
          b = Math.floor(brightness * 255 + 0.5)
          break
        case 4:
          r = Math.floor(t * 255 + 0.5)
          g = Math.floor(p * 255 + 0.5)
          b = Math.floor(brightness * 255 + 0.5)
          break
        case 5:
          r = Math.floor(brightness * 255 + 0.5)
          g = Math.floor(p * 255 + 0.5)
          b = Math.floor(q * 255 + 0.5)
          break
      }
    }
    return 0xff_00_00_00 | (r << 16) | (g << 8) | (Math.trunc(b))
  }

  private updateSkyColors () {
    if (!this.skyMesh || !this.voidMesh) return

    const viewDistance = this.viewDistance * 16
    const viewFactor = 1 - (0.25 + 0.75 * this.viewDistance / 32) ** 0.25

    const angle = this.getCelestialAngle(this.partialTicks)
    const skyColor = this.getSkyColor(0, 0, this.partialTicks)
    const fogColor = this.getFogColor(this.partialTicks)

    const brightness = Math.cos(angle * Math.PI * 2) * 2 + 0.5
    const clampedBrightness = Math.max(0, Math.min(1, brightness))

    const red = (fogColor.x + (skyColor.x - fogColor.x) * viewFactor) * clampedBrightness
    const green = (fogColor.y + (skyColor.y - fogColor.y) * viewFactor) * clampedBrightness
    const blue = (fogColor.z + (skyColor.z - fogColor.z) * viewFactor) * clampedBrightness

    this.scene.background = new THREE.Color(red, green, blue)
    this.scene.fog = new THREE.Fog(new THREE.Color(red, green, blue), 0.0025, viewDistance * 2)

    ;(this.skyMesh.material as THREE.MeshBasicMaterial).color.set(new THREE.Color(skyColor.x, skyColor.y, skyColor.z))
    ;(this.voidMesh.material as THREE.MeshBasicMaterial).color.set(new THREE.Color(
      skyColor.x * 0.2 + 0.04,
      skyColor.y * 0.2 + 0.04,
      skyColor.z * 0.6 + 0.1
    ))
  }

  dispose () {
    if (this.texture) {
      this.texture.dispose()
    }
    if (this.mesh) {
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
      this.scene.remove(this.mesh)
    }
    if (this.skyMesh) {
      this.skyMesh.geometry.dispose()
      ;(this.skyMesh.material as THREE.Material).dispose()
      this.scene.remove(this.skyMesh)
    }
    if (this.voidMesh) {
      this.voidMesh.geometry.dispose()
      ;(this.voidMesh.material as THREE.Material).dispose()
      this.scene.remove(this.voidMesh)
    }
  }
}
