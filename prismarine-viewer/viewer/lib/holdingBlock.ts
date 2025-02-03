import * as THREE from 'three'
import * as tweenJs from '@tweenjs/tween.js'
import worldBlockProvider from 'mc-assets/dist/worldBlockProvider'
import { GUI } from 'lil-gui'
import { getThreeBlockModelGroup, renderBlockThree, setBlockPosition } from './mesher/standaloneRenderer'
import { getMyHand } from './hand'
import { IPlayerState } from './basePlayerState'

export type HandItemBlock = {
  name?
  properties?
  type: 'block' | 'item' | 'hand'
  id?: number
}

class AnimationController {
  private currentAnimation: tweenJs.Group | null = null
  private isAnimating = false
  private cancelRequested = false
  private completionCallbacks: Array<() => void> = []

  async startAnimation (createAnimation: () => tweenJs.Group): Promise<void> {
    if (this.isAnimating) {
      await this.cancelCurrentAnimation()
    }

    return new Promise((resolve) => {
      this.isAnimating = true
      this.cancelRequested = false
      this.currentAnimation = createAnimation()

      this.completionCallbacks.push(() => {
        this.isAnimating = false
        this.currentAnimation = null
        resolve()
      })
    })
  }

  async cancelCurrentAnimation (): Promise<void> {
    if (!this.isAnimating) return

    return new Promise((resolve) => {
      this.cancelRequested = true
      this.completionCallbacks.push(() => {
        resolve()
      })
    })
  }

  forceFinish () {
    if (!this.isAnimating) return

    if (this.currentAnimation) {
      this.currentAnimation.removeAll()
      this.currentAnimation = null
    }

    this.isAnimating = false
    this.cancelRequested = false

    const callbacks = [...this.completionCallbacks]
    this.completionCallbacks = []
    for (const cb of callbacks) cb()
  }

  update () {
    if (this.currentAnimation) {
      this.currentAnimation.update()
    }
  }

  get isActive () {
    return this.isAnimating
  }

  get shouldCancel () {
    return this.cancelRequested
  }
}

export default class HoldingBlock {
  // TODO refactor with the tree builder for better visual understanding
  holdingBlock: THREE.Object3D | undefined = undefined
  blockSwapAnimation: {
    tween: tweenJs.Group
    hidden: boolean
  } | undefined = undefined
  cameraGroup = new THREE.Mesh()
  objectOuterGroup = new THREE.Group() // 3
  objectInnerGroup = new THREE.Group() // 4
  holdingBlockInnerGroup = new THREE.Group() // 5
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
  stopUpdate = false
  lastHeldItem: HandItemBlock | undefined
  toBeRenderedItem: HandItemBlock | undefined
  isSwinging = false
  nextIterStopCallbacks: Array<() => void> | undefined
  rightSide = true
  idleAnimator: HandIdleAnimator | undefined

  debug = {} as Record<string, any>

  private readonly swingController = new AnimationController()

  constructor (public playerState: IPlayerState) {
    this.initCameraGroup()
  }

  initCameraGroup () {
    this.cameraGroup = new THREE.Mesh()
  }

  async startSwing () {
    if (this.swingController.isActive) return

    await this.swingController.startAnimation(() => {
      const group = new tweenJs.Group()
      // const DURATION = 1000 * 0.35 / 2
      // const DURATION = 1000
      const DURATION = 1000 * 0.35 / 2
      const { position, rotation, object } = this.getFinalSwingPositionRotation()
      const initialPos = {
        x: object.position.x,
        y: object.position.y,
        z: object.position.z
      }
      const initialRot = {
        x: object.rotation.x,
        y: object.rotation.y,
        z: object.rotation.z
      }

      const mainAnim = new tweenJs.Tween(object.position, group)
        .to(position, DURATION)
        // .easing(tweenJs.Easing.Quadratic.Out)
        .yoyo(true)
        .repeat(Infinity)
        .start()

      let i = 0
      mainAnim.onRepeat(() => {
        i++
        if (i % 2 === 0) {
          if (this.swingController.shouldCancel) {
            object.position.set(initialPos.x, initialPos.y, initialPos.z)
            // object.rotation.set(initialRot.x, initialRot.y, initialRot.z)
            Object.assign(object.rotation, initialRot)
            this.swingController.forceFinish()
          }
        }
      })

      new tweenJs.Tween(object.rotation, group)
        .to(rotation, DURATION)
        // .easing(tweenJs.Easing.Quadratic.Out)
        .yoyo(true)
        .repeat(Infinity)
        .start()

      return group
    })
  }

  getFinalSwingPositionRotation (origPosition?: THREE.Vector3) {
    const object = this.objectInnerGroup
    if (this.lastHeldItem?.type === 'block') {
      origPosition ??= object.position
      return {
        position: { y: origPosition.y - this.objectInnerGroup.scale.y / 2 },
        rotation: { z: THREE.MathUtils.degToRad(90), x: -THREE.MathUtils.degToRad(90) },
        object
      }
    }
    if (this.lastHeldItem?.type === 'item') {
      const object = this.holdingBlockInnerGroup
      origPosition ??= object.position
      return {
        position: {
          y: origPosition.y - object.scale.y * 2,
          // z: origPosition.z - window.zFinal,
          // x: origPosition.x - window.xFinal,
        },
        // rotation: { z: THREE.MathUtils.degToRad(90), x: -THREE.MathUtils.degToRad(90) }
        rotation: {
          // z: THREE.MathUtils.degToRad(window.zRotationFinal ?? 0),
          // x: THREE.MathUtils.degToRad(window.xRotationFinal ?? 0),
          // y: THREE.MathUtils.degToRad(window.yRotationFinal ?? 0),
          x: THREE.MathUtils.degToRad(-120)
        },
        object
      }
    }
    if (this.lastHeldItem?.type === 'hand') {
      const object = this.holdingBlockInnerGroup
      origPosition ??= object.position
      return {
        position: {
          y: origPosition.y - (window.yFinal ?? 0.15),
          z: origPosition.z - window.zFinal,
          x: origPosition.x - window.xFinal,
        },
        rotation: {
          x: THREE.MathUtils.degToRad(window.xRotationFinal || -14.7),
          y: THREE.MathUtils.degToRad(window.yRotationFinal || 33.95),
          z: THREE.MathUtils.degToRad(window.zRotationFinal || -28),
        },
        object
      }
    }
    return {
      position: {},
      rotation: {},
      object
    }
  }

  async stopSwing () {
    await this.swingController.cancelCurrentAnimation()
  }

  render (originalCamera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, ambientLight: THREE.AmbientLight, directionalLight: THREE.DirectionalLight) {
    if (!this.lastHeldItem) return
    this.swingController.update()
    this.blockSwapAnimation?.tween.update()

    const scene = new THREE.Scene()
    scene.add(this.cameraGroup)
    // if (this.camera.aspect !== originalCamera.aspect) {
    //   this.camera.aspect = originalCamera.aspect
    //   this.camera.updateProjectionMatrix()
    // }
    this.updateCameraGroup()
    scene.add(ambientLight.clone())
    scene.add(directionalLight.clone())

    const viewerSize = renderer.getSize(new THREE.Vector2())
    const minSize = Math.min(viewerSize.width, viewerSize.height)

    renderer.autoClear = false
    renderer.clearDepth()
    if (this.rightSide) {
      const x = viewerSize.width - minSize
      // if (x) x -= x / 4
      renderer.setViewport(x, 0, minSize, minSize)
    } else {
      renderer.setViewport(0, 0, minSize, minSize)
    }
    renderer.render(scene, this.camera)
    renderer.setViewport(0, 0, viewerSize.width, viewerSize.height)
  }

  // worldTest () {
  //   const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: 0x00_00_ff, transparent: true, opacity: 0.5 }))
  //   mesh.position.set(0.5, 0.5, 0.5)
  //   const group = new THREE.Group()
  //   group.add(mesh)
  //   group.position.set(-0.5, -0.5, -0.5)
  //   const outerGroup = new THREE.Group()
  //   outerGroup.add(group)
  //   outerGroup.position.set(this.camera.position.x, this.camera.position.y, this.camera.position.z)
  //   this.scene.add(outerGroup)

  //   new tweenJs.Tween(group.rotation).to({ z: THREE.MathUtils.degToRad(90) }, 1000).yoyo(true).repeat(Infinity).start()
  // }

  async playBlockSwapAnimation () {
    // if (this.blockSwapAnimation) return
    this.blockSwapAnimation ??= {
      tween: new tweenJs.Group(),
      hidden: false
    }
    const DURATION = 1000 * 0.35 / 2
    const tween = new tweenJs.Tween(this.objectInnerGroup.position, this.blockSwapAnimation.tween).to({
      y: this.objectInnerGroup.position.y + (this.objectInnerGroup.scale.y * 1.5 * (this.blockSwapAnimation.hidden ? 1 : -1))
    }, DURATION).start()
    return new Promise<void>((resolve) => {
      tween.onComplete(() => {
        if (this.blockSwapAnimation!.hidden) {
          this.blockSwapAnimation = undefined
        } else {
          this.blockSwapAnimation!.hidden = !this.blockSwapAnimation!.hidden
        }
        resolve()
      })
    })
  }

  isDifferentItem (block: HandItemBlock | undefined) {
    return this.lastHeldItem && (this.lastHeldItem.name !== block?.name || JSON.stringify(this.lastHeldItem.properties) !== JSON.stringify(block?.properties ?? '{}'))
  }

  updateCameraGroup () {
    if (this.stopUpdate) return
    const { camera } = this
    this.cameraGroup.position.copy(camera.position)
    this.cameraGroup.rotation.copy(camera.rotation)

    // const viewerSize = viewer.renderer.getSize(new THREE.Vector2())
    // const aspect = viewerSize.width / viewerSize.height
    const aspect = 1


    // Adjust the position based on the aspect ratio
    const { position, scale: scaleData } = this.getHandHeld3d()
    const distance = -position.z
    const side = this.rightSide ? 1 : -1
    this.objectOuterGroup.position.set(
      distance * position.x * aspect * side,
      distance * position.y,
      -distance
    )

    // const scale = Math.min(0.8, Math.max(1, 1 * aspect))
    const scale = scaleData * 2.22 * 0.2
    this.objectOuterGroup.scale.set(scale, scale, scale)

    if (!this.swingController.isActive && !this.blockSwapAnimation) {
      this.idleAnimator?.update()
    }
  }

  async initHandObject (material: THREE.Material, blockstatesModels: any, blocksAtlases: any, handItem?: HandItemBlock) {
    let animatingCurrent = false
    if (!this.swingController.isActive && !this.blockSwapAnimation && this.isDifferentItem(handItem)) {
      animatingCurrent = true
      await this.playBlockSwapAnimation()
      this.holdingBlock?.removeFromParent()
      this.holdingBlock = undefined
    }

    this.lastHeldItem = handItem
    if (!handItem) {
      this.holdingBlock?.removeFromParent()
      this.holdingBlock = undefined
      this.swingController.forceFinish()
      this.blockSwapAnimation = undefined
      return
    }
    const blockProvider = worldBlockProvider(blockstatesModels, blocksAtlases, 'latest')
    let blockInner
    if (handItem.type === 'block') {
      const models = blockProvider.getAllResolvedModels0_1({
        name: handItem.name,
        properties: handItem.properties ?? {}
      }, true)
      blockInner = getThreeBlockModelGroup(material, models, undefined, 'plains', loadedData)
    } else if (handItem.type === 'item') {
      const { mesh: itemMesh } = viewer.entities.getItemMesh({
        itemId: handItem.id,
      })!
      itemMesh.position.set(0.5, 0.5, 0.5)
      blockInner = itemMesh
    } else {
      blockInner = await getMyHand()
    }
    blockInner.name = 'holdingBlock'
    const blockOuterGroup = new THREE.Group()
    this.holdingBlockInnerGroup.removeFromParent()
    this.holdingBlockInnerGroup = new THREE.Group()
    this.holdingBlockInnerGroup.add(blockInner)
    blockOuterGroup.add(this.holdingBlockInnerGroup)
    this.holdingBlock = blockInner
    this.objectInnerGroup = new THREE.Group()
    this.objectInnerGroup.add(blockOuterGroup)
    this.objectInnerGroup.position.set(-0.5, -0.5, -0.5)
    // todo cleanup
    if (animatingCurrent) {
      this.objectInnerGroup.position.y -= this.objectInnerGroup.scale.y * 1.5
    }
    Object.assign(blockOuterGroup.position, { x: 0.5, y: 0.5, z: 0.5 })

    this.objectOuterGroup = new THREE.Group()
    this.objectOuterGroup.add(this.objectInnerGroup)

    this.cameraGroup.add(this.objectOuterGroup)
    const rotationDeg = this.getHandHeld3d().rotation
    let origPosition
    const setRotation = () => {
      const final = this.getFinalSwingPositionRotation(origPosition)
      origPosition ??= final.object.position.clone()
      if (this.debug.displayFinal) {
        Object.assign(final.object.position, final.position)
        Object.assign(final.object.rotation, final.rotation)
      } else if (this.debug.displayFinal === false) {
        final.object.rotation.set(0, 0, 0)
      }

      this.holdingBlock!.rotation.x = THREE.MathUtils.degToRad(rotationDeg.x)
      this.holdingBlock!.rotation.y = THREE.MathUtils.degToRad(rotationDeg.y)
      this.holdingBlock!.rotation.z = THREE.MathUtils.degToRad(rotationDeg.z)
      this.objectOuterGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg.yOuter)
    }
    // const gui = new GUI()
    // gui.add(rotationDeg, 'x', -180, 180, 0.1)
    // gui.add(rotationDeg, 'y', -180, 180, 0.1)
    // gui.add(rotationDeg, 'z', -180, 180, 0.1)
    // gui.add(rotationDeg, 'yOuter', -180, 180, 0.1)
    // Object.assign(window, { xFinal: 0, yFinal: 0, zFinal: 0, xRotationFinal: 0, yRotationFinal: 0, zRotationFinal: 0, displayFinal: true })
    // gui.add(window, 'xFinal', -10, 10, 0.05)
    // gui.add(window, 'yFinal', -10, 10, 0.05)
    // gui.add(window, 'zFinal', -10, 10, 0.05)
    // gui.add(window, 'xRotationFinal', -180, 180, 0.05)
    // gui.add(window, 'yRotationFinal', -180, 180, 0.05)
    // gui.add(window, 'zRotationFinal', -180, 180, 0.05)
    // gui.add(window, 'displayFinal')
    // gui.onChange(setRotation)
    setRotation()

    if (animatingCurrent) {
      await this.playBlockSwapAnimation()
    }
    this.idleAnimator = new HandIdleAnimator(this.holdingBlockInnerGroup, this.playerState)
  }

  getHandHeld3d () {
    const type = this.lastHeldItem?.type ?? 'hand'
    const { debug } = this

    let scale = type === 'item' ? 0.68 * 1.15 : 0.45 * 1.15

    const position = {
      x: debug.x ?? 0.4,
      y: debug.y ?? -0.7,
      z: -0.45
    }

    if (type === 'item') {
      position.x = -0.05
      // position.y -= 3.2 / 10
      // position.z += 1.13 / 10
    }

    if (type === 'hand') {
      // position.x = viewer.camera.aspect > 1 ? 0.7 : 1.1
      position.y = -0.8
      scale = 0.8 * 1.15
    }

    const rotations = {
      block: {
        x: 0,
        y: -45 + 90,
        z: 0,
        yOuter: 0
      },
      // hand: {
      //   x: 166.7,
      //   // y: -180,
      //   y: -165.2,
      //   // z: -156.3,
      //   z: -134.2,
      //   yOuter: -81.1
      // },
      hand: {
        x: -32.4,
        // y: 25.1
        y: 42.8,
        z: -41.3,
        yOuter: 0
      },
      // item: {
      //   x: -174,
      //   y: 47.3,
      //   z: -134.2,
      //   yOuter: -41.2
      // }
      item: {
        // x: -174,
        // y: 47.3,
        // z: -134.2,
        // yOuter: -41.2
        x: 0,
        // y: -90, // todo thats the correct one but we don't make it look too cheap because of no depth
        y: -70,
        z: window.z ?? 25,
        yOuter: 0
      }
    }

    return {
      rotation: rotations[type],
      position,
      scale
    }
  }
}

class HandIdleAnimator {
  globalTime = 0
  lastTime = 0
  currentState: 'NOT_MOVING' | 'WALKING' | 'SPRINTING' | 'SNEAKING'
  defaultPosition: { x: number; y: number; z: number; rotationX: number; rotationY: number; rotationZ: number }
  private idleTween: tweenJs.Tween<{ y: number; rotationZ: number }> | null = null
  private readonly idleOffset = { y: 0, rotationZ: 0 }
  private readonly tween = new tweenJs.Group()

  constructor (public handMesh: THREE.Object3D, public playerState: IPlayerState) {
    this.handMesh = handMesh
    this.globalTime = 0

    this.defaultPosition = {
      x: handMesh.position.x,
      y: handMesh.position.y,
      z: handMesh.position.z,
      rotationX: handMesh.rotation.x,
      rotationY: handMesh.rotation.y,
      rotationZ: handMesh.rotation.z
    }
  }

  private startIdleAnimation () {
    if (this.idleTween) {
      this.idleTween.stop()
    }

    this.idleOffset.y = 0
    this.idleOffset.rotationZ = 0

    this.idleTween = new tweenJs.Tween(this.idleOffset, this.tween)
      .to({
        y: 0.05,
        rotationZ: 0.05
      }, 3000)
      .easing(tweenJs.Easing.Sinusoidal.InOut)
      .yoyo(true)
      .repeat(Infinity)
      .start()
  }

  private stopIdleAnimation () {
    if (this.idleTween) {
      this.idleTween.stop()
      this.idleOffset.y = 0
      this.idleOffset.rotationZ = 0
    }
  }

  setState (state: 'NOT_MOVING' | 'WALKING' | 'SPRINTING' | 'SNEAKING') {
    this.currentState = state

    if (state === 'NOT_MOVING' || state === 'SNEAKING') {
      this.startIdleAnimation()
    } else {
      this.stopIdleAnimation()
    }
  }

  update () {
    const now = performance.now()
    const deltaTime = (now - this.lastTime) / 1000
    this.lastTime = now

    // Update tweens for idle animation
    this.tween.update()

    // Get current state from viewer's player state
    if (this.playerState) {
      const newState = this.playerState.getMovementState()
      if (newState !== this.currentState) {
        this.setState(newState)
      }
    }

    // Update global time based on player state
    switch (this.currentState) {
      case 'NOT_MOVING':
      case 'SNEAKING':
        this.globalTime = Math.PI / 4 // Fixed value: 3.14f / 4
        // Idle animation handled by Tween
        break
      case 'SPRINTING':
        this.globalTime += deltaTime * 10 // time * 10
        break
      case 'WALKING':
        this.globalTime += deltaTime * 7 // time * 7
        break
    }

    if (this.currentState === 'NOT_MOVING' || this.currentState === 'SNEAKING') {
      // Use smooth idle animation
      this.handMesh.position.x = this.defaultPosition.x
      this.handMesh.position.y = this.defaultPosition.y + this.idleOffset.y
      this.handMesh.position.z = this.defaultPosition.z
      this.handMesh.rotation.x = this.defaultPosition.rotationX
      this.handMesh.rotation.y = this.defaultPosition.rotationY
      this.handMesh.rotation.z = this.defaultPosition.rotationZ + this.idleOffset.rotationZ
    } else {
      // Use Minecraft-style vertex shader animation for walking/sprinting
      const offsetX = Math.sin(this.globalTime) / 30
      const offsetY = -Math.abs(Math.cos(this.globalTime) / 10)

      this.handMesh.position.x = this.defaultPosition.x + offsetX
      this.handMesh.position.y = this.defaultPosition.y + offsetY
      this.handMesh.position.z = this.defaultPosition.z
      this.handMesh.rotation.x = this.defaultPosition.rotationX
      this.handMesh.rotation.y = this.defaultPosition.rotationY
      this.handMesh.rotation.z = this.defaultPosition.rotationZ
    }
  }

  getCurrentState () {
    return this.currentState
  }
}
