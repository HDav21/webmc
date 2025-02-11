import * as THREE from 'three'
import * as tweenJs from '@tweenjs/tween.js'
import worldBlockProvider from 'mc-assets/dist/worldBlockProvider'
import { BlockModel } from 'mc-assets'
import { getThreeBlockModelGroup, renderBlockThree, setBlockPosition } from './mesher/standaloneRenderer'
import { getMyHand } from './hand'
import { IPlayerState, MovementState } from './basePlayerState'
import { DebugGui } from './DebugGui'
import { SmoothSwitcher } from './smoothSwitcher'
import { watchProperty } from './utils/proxy'
import { disposeObject } from './threeJsUtils'

export type HandItemBlock = {
  name?
  properties?
  fullItem?
  type: 'block' | 'item' | 'hand'
  id?: number
}

const rotationPositionData = {
  itemRight: {
    'rotation': [
      0,
      -90,
      25
    ],
    'translation': [
      1.13,
      3.2,
      1.13
    ],
    'scale': [
      0.68,
      0.68,
      0.68
    ]
  },
  itemLeft: {
    'rotation': [
      0,
      90,
      -25
    ],
    'translation': [
      1.13,
      3.2,
      1.13
    ],
    'scale': [
      0.68,
      0.68,
      0.68
    ]
  },
  blockRight: {
    'rotation': [
      0,
      45,
      0
    ],
    'translation': [
      0,
      0,
      0
    ],
    'scale': [
      0.4,
      0.4,
      0.4
    ]
  },
  blockLeft: {
    'rotation': [
      0,
      225,
      0
    ],
    'translation': [
      0,
      0,
      0
    ],
    'scale': [
      0.4,
      0.4,
      0.4
    ]
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
  isSwinging = false
  nextIterStopCallbacks: Array<() => void> | undefined
  idleAnimator: HandIdleAnimator | undefined
  ready = false
  lastUpdate = 0
  playerHand: THREE.Object3D | undefined

  swingAnimator: HandSwingAnimator | undefined

  constructor (public playerState: IPlayerState, public offHand = false) {
    this.initCameraGroup()

    this.playerState.events.on('heldItemChanged', (_, isOffHand) => {
      if (this.offHand !== isOffHand) return
      this.updateItem()
    })

    if (!this.offHand) {
      // watch over my hand
      watchProperty(
        async () => {
          return getMyHand(this.playerState.reactive.playerSkin, this.playerState.onlineMode ? this.playerState.username : undefined)
        },
        this.playerState.reactive,
        'playerSkin',
        (newHand) => {
          this.playerHand = newHand
        },
        (oldHand) => {
          disposeObject(oldHand, true)
        }
      )
    }
  }

  updateItem () {
    if (!this.ready || !this.playerState.getHeldItem) return
    const item = this.playerState.getHeldItem(this.offHand)
    if (item) {
      void this.setNewItem(item)
    } else if (!this.offHand) {
      void this.setNewItem({
        type: 'hand',
      })
    }
  }

  initCameraGroup () {
    this.cameraGroup = new THREE.Mesh()
  }

  async startSwing () {
    this.idleAnimator?.destroy()
    this.idleAnimator = undefined
    this.swingAnimator?.startSwing()
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
    this.swingAnimator?.stopSwing()
  }

  render (originalCamera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, ambientLight: THREE.AmbientLight, directionalLight: THREE.DirectionalLight) {
    if (!this.lastHeldItem) return
    const now = performance.now()
    if (this.lastUpdate && now - this.lastUpdate > 50) { // one tick
      void this.replaceItemModel(this.lastHeldItem)
    }

    // Only update idle animation if not swinging
    if (this.swingAnimator?.isCurrentlySwinging()) {
      this.swingAnimator?.update()
    } else {
      this.idleAnimator?.update()
    }

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
    if (this.offHand) {
      renderer.setViewport(0, 0, minSize, minSize)
    } else {
      const x = viewerSize.width - minSize
      // if (x) x -= x / 4
      renderer.setViewport(x, 0, minSize, minSize)
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
    const side = this.offHand ? -1 : 1
    this.objectOuterGroup.position.set(
      distance * position.x * aspect * side,
      distance * position.y,
      -distance
    )

    // const scale = Math.min(0.8, Math.max(1, 1 * aspect))
    const scale = scaleData * 2.22 * 0.2
    this.objectOuterGroup.scale.set(scale, scale, scale)
  }

  private async createItemModel (handItem: HandItemBlock): Promise<{ model: THREE.Object3D; type: 'hand' | 'block' | 'item' } | undefined> {
    this.lastUpdate = performance.now()
    if (!handItem || (handItem.type === 'hand' && !this.playerHand)) return undefined

    let blockInner: THREE.Object3D
    if (handItem.type === 'item' || handItem.type === 'block') {
      const { mesh: itemMesh, isBlock } = viewer.entities.getItemMesh({
        ...handItem.fullItem,
        itemId: handItem.id,
      }, {
        'minecraft:display_context': 'firstperson',
        'minecraft:use_duration': this.playerState.getItemUsageTicks?.(),
        'minecraft:using_item': !!this.playerState.getItemUsageTicks?.(),
      })!
      if (isBlock) {
        blockInner = itemMesh
        handItem.type = 'block'
      } else {
        itemMesh.position.set(0.5, 0.5, 0.5)
        blockInner = itemMesh
        handItem.type = 'item'
      }
    } else {
      blockInner = this.playerHand!
    }
    blockInner.name = 'holdingBlock'

    const rotationDeg = this.getHandHeld3d().rotation
    blockInner.rotation.x = THREE.MathUtils.degToRad(rotationDeg.x)
    blockInner.rotation.y = THREE.MathUtils.degToRad(rotationDeg.y)
    blockInner.rotation.z = THREE.MathUtils.degToRad(rotationDeg.z)

    return { model: blockInner, type: handItem.type }
  }

  async replaceItemModel (handItem?: HandItemBlock): Promise<void> {
    if (!handItem) {
      this.holdingBlock?.removeFromParent()
      this.holdingBlock = undefined
      this.swingAnimator?.stopSwing()
      this.swingAnimator = undefined
      this.idleAnimator = undefined
      return
    }

    const result = await this.createItemModel(handItem)
    if (!result) return

    // Update the model without changing the group structure
    this.holdingBlock?.removeFromParent()
    this.holdingBlock = result.model
    this.holdingBlockInnerGroup.add(result.model)


  }

  async setNewItem (handItem?: HandItemBlock) {
    let animatingCurrent = false
    if (!this.blockSwapAnimation && this.isDifferentItem(handItem)) {
      animatingCurrent = true
      await this.playBlockSwapAnimation()
      this.holdingBlock?.removeFromParent()
      this.holdingBlock = undefined
    }

    this.lastHeldItem = handItem
    if (!handItem) {
      this.holdingBlock?.removeFromParent()
      this.holdingBlock = undefined
      this.swingAnimator?.stopSwing()
      this.swingAnimator = undefined
      this.idleAnimator = undefined
      this.blockSwapAnimation = undefined
      return
    }

    const result = await this.createItemModel(handItem)
    if (!result) return

    const blockOuterGroup = new THREE.Group()
    this.holdingBlockInnerGroup.removeFromParent()
    this.holdingBlockInnerGroup = new THREE.Group()
    this.holdingBlockInnerGroup.add(result.model)
    blockOuterGroup.add(this.holdingBlockInnerGroup)
    this.holdingBlock = result.model
    this.objectInnerGroup = new THREE.Group()
    this.objectInnerGroup.add(blockOuterGroup)
    this.objectInnerGroup.position.set(-0.5, -0.5, -0.5)
    if (animatingCurrent) {
      this.objectInnerGroup.position.y -= this.objectInnerGroup.scale.y * 1.5
    }
    Object.assign(blockOuterGroup.position, { x: 0.5, y: 0.5, z: 0.5 })

    this.objectOuterGroup = new THREE.Group()
    this.objectOuterGroup.add(this.objectInnerGroup)

    this.cameraGroup.add(this.objectOuterGroup)
    const rotationDeg = this.getHandHeld3d().rotation
    this.objectOuterGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg.yOuter)

    if (animatingCurrent) {
      await this.playBlockSwapAnimation()
    }

    this.swingAnimator = new HandSwingAnimator(this.holdingBlockInnerGroup)
    this.swingAnimator.type = result.type
    this.idleAnimator = new HandIdleAnimator(this.holdingBlockInnerGroup, this.playerState)
  }

  getHandHeld3d () {
    const type = this.lastHeldItem?.type ?? 'hand'

    let scale = type === 'item' ? 0.68 * 1.15 : 0.45 * 1.15

    const position = {
      x: 0.4,
      y: -0.7,
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
  currentState: MovementState
  targetState: MovementState
  defaultPosition: { x: number; y: number; z: number; rotationX: number; rotationY: number; rotationZ: number }
  private readonly idleOffset = { y: 0, rotationZ: 0 }
  private readonly tween = new tweenJs.Group()
  private idleTween: tweenJs.Tween<{ y: number; rotationZ: number }> | null = null
  private readonly stateSwitcher: SmoothSwitcher

  // Debug parameters
  private readonly debugParams = {
    // Transition durations for different state changes
    walkingSpeed: 7,
    sprintingSpeed: 10,
    walkingAmplitude: { x: 1 / 30, y: 1 / 10, rotationZ: 0.25 },
    sprintingAmplitude: { x: 1 / 30, y: 1 / 10, rotationZ: 0.4 }
  }

  private readonly debugGui: DebugGui

  constructor (public handMesh: THREE.Object3D, public playerState: IPlayerState) {
    this.handMesh = handMesh
    this.globalTime = 0
    this.currentState = 'NOT_MOVING'
    this.targetState = 'NOT_MOVING'

    this.defaultPosition = {
      x: handMesh.position.x,
      y: handMesh.position.y,
      z: handMesh.position.z,
      rotationX: handMesh.rotation.x,
      rotationY: handMesh.rotation.y,
      rotationZ: handMesh.rotation.z
    }

    // Initialize state switcher with appropriate speeds
    this.stateSwitcher = new SmoothSwitcher(
      () => {
        return {
          x: this.handMesh.position.x,
          y: this.handMesh.position.y,
          z: this.handMesh.position.z,
          rotationX: this.handMesh.rotation.x,
          rotationY: this.handMesh.rotation.y,
          rotationZ: this.handMesh.rotation.z
        }
      },
      (property, value) => {
        switch (property) {
          case 'x': this.handMesh.position.x = value; break
          case 'y': this.handMesh.position.y = value; break
          case 'z': this.handMesh.position.z = value; break
          case 'rotationX': this.handMesh.rotation.x = value; break
          case 'rotationY': this.handMesh.rotation.y = value; break
          case 'rotationZ': this.handMesh.rotation.z = value; break
        }
      },
      {
        x: 2, // units per second
        y: 2,
        z: 2,
        rotation: Math.PI // radians per second
      }
    )

    // Initialize debug GUI
    this.debugGui = new DebugGui('idle_animator', this.debugParams)
    this.debugGui.visible = false
  }

  private startIdleAnimation () {
    if (this.idleTween) {
      this.idleTween.stop()
    }

    // Start from current position for smooth transition
    this.idleOffset.y = this.handMesh.position.y - this.defaultPosition.y
    this.idleOffset.rotationZ = this.handMesh.rotation.z - this.defaultPosition.rotationZ

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

  private getStateTransform (state: MovementState, time: number) {
    switch (state) {
      case 'NOT_MOVING':
      case 'SNEAKING':
        return {
          x: this.defaultPosition.x,
          y: this.defaultPosition.y,
          z: this.defaultPosition.z,
          rotationX: this.defaultPosition.rotationX,
          rotationY: this.defaultPosition.rotationY,
          rotationZ: this.defaultPosition.rotationZ
        }
      case 'WALKING':
      case 'SPRINTING': {
        const speed = state === 'SPRINTING' ? this.debugParams.sprintingSpeed : this.debugParams.walkingSpeed
        const amplitude = state === 'SPRINTING' ? this.debugParams.sprintingAmplitude : this.debugParams.walkingAmplitude

        return {
          x: this.defaultPosition.x + Math.sin(time * speed) * amplitude.x,
          y: this.defaultPosition.y - Math.abs(Math.cos(time * speed)) * amplitude.y,
          z: this.defaultPosition.z,
          rotationX: this.defaultPosition.rotationX,
          rotationY: this.defaultPosition.rotationY,
          // rotationZ: this.defaultPosition.rotationZ + Math.sin(time * speed) * amplitude.rotationZ
          rotationZ: this.defaultPosition.rotationZ
        }
      }
    }
  }

  setState (newState: MovementState) {
    if (newState === this.targetState) return

    this.targetState = newState
    const noTransition = false
    if (this.currentState !== newState) {
      // Stop idle animation during state transitions
      this.stopIdleAnimation()

      // Calculate new state transform
      if (!noTransition) {
        // this.globalTime = 0
        const stateTransform = this.getStateTransform(newState, this.globalTime)

        // Start transition to new state
        this.stateSwitcher.transitionTo(stateTransform, newState)
        // this.updated = false
      }
      this.currentState = newState
    }
  }

  updated = false
  update () {
    this.stateSwitcher.update()

    const now = performance.now()
    const deltaTime = (now - this.lastTime) / 1000
    this.lastTime = now

    // Update global time based on current state
    if (!this.stateSwitcher.isTransitioning) {
      switch (this.currentState) {
        case 'NOT_MOVING':
        case 'SNEAKING':
          this.globalTime = Math.PI / 4
          break
        case 'SPRINTING':
        case 'WALKING':
          this.globalTime += deltaTime
          break
      }
    }

    // Check for state changes from player state
    if (this.playerState) {
      const newState = this.playerState.getMovementState()
      if (newState !== this.targetState) {
        this.setState(newState)
      }
    }

    // If we're not transitioning between states and in a stable state that should have idle animation
    if (!this.stateSwitcher.isTransitioning &&
      (this.currentState === 'NOT_MOVING' || this.currentState === 'SNEAKING')) {
      // Start idle animation if not already running
      if (!this.idleTween?.isPlaying()) {
        this.startIdleAnimation()
      }
      // Update idle animation
      this.tween.update()

      // Apply idle offsets
      this.handMesh.position.y = this.defaultPosition.y + this.idleOffset.y
      this.handMesh.rotation.z = this.defaultPosition.rotationZ + this.idleOffset.rotationZ
    }

    // If we're in a movement state and not transitioning, update the movement animation
    if (!this.stateSwitcher.isTransitioning &&
      (this.currentState === 'WALKING' || this.currentState === 'SPRINTING')) {
      const stateTransform = this.getStateTransform(this.currentState, this.globalTime)
      Object.assign(this.handMesh.position, stateTransform)
      Object.assign(this.handMesh.rotation, {
        x: stateTransform.rotationX,
        y: stateTransform.rotationY,
        z: stateTransform.rotationZ
      })
      // this.stateSwitcher.transitionTo(stateTransform, this.currentState)
    }
  }

  getCurrentState () {
    return this.currentState
  }

  destroy () {
    this.stopIdleAnimation()
    this.stateSwitcher.forceFinish()
  }
}

class HandSwingAnimator {
  private readonly PI = Math.PI
  private animationTimer = 0
  private lastTime = 0
  private isAnimating = false
  private stopRequested = false
  private readonly originalRotation: THREE.Euler
  private readonly originalPosition: THREE.Vector3
  private readonly originalScale: THREE.Vector3

  // Debug parameters for both animation styles
  private readonly debugParams = {
    // Classic swing parameters
    classicRotationMax: 60,
    classicPositionX: 0.2,
    classicPositionY: 0.6,
    classicPositionZ: 0.3,
    classicScaleReduction: 0.2,

    // New swing parameters
    newRotationX: -0.513_126_800_086_333, // Hand rotation
    newRotationZ: 1.591_740_277_818_83, // Hand rotation
    newRotationBlockX: -1.539_380_400_258_999_2, // Block/item rotation
    newRotationBlockZ: 0.620_778_708_349_344, // Block/item rotation
    newPositionX: -0.1,
    newPositionY: -0.1,
    newPositionZ: 0.2,
    // Item specific position
    newPositionItemX: 0.1,
    newPositionItemY: -1.02,
    newPositionItemZ: 0.648,

    // Shared parameters
    animationTime: 250,
    animationStage: 0,
    useClassicSwing: true
  }

  private readonly debugGui: DebugGui

  public type: 'hand' | 'block' | 'item' = 'hand'

  constructor (public handMesh: THREE.Object3D) {
    this.handMesh = handMesh
    // Store initial transforms
    this.originalRotation = handMesh.rotation.clone()
    this.originalPosition = handMesh.position.clone()
    this.originalScale = handMesh.scale.clone()

    // Initialize debug GUI
    this.debugGui = new DebugGui('hand_animator', this.debugParams, undefined, {
      animationStage: {
        min: 0,
        max: 1,
        step: 0.01
      }
    })
    this.debugGui.visible = false
  }

  update () {
    if (!this.isAnimating && !this.debugParams.animationStage) {
      // If not animating, ensure we're at original position
      this.handMesh.rotation.copy(this.originalRotation)
      this.handMesh.position.copy(this.originalPosition)
      this.handMesh.scale.copy(this.originalScale)
      return
    }

    const now = performance.now()
    const deltaTime = (now - this.lastTime) / 1000
    this.lastTime = now

    // Update animation progress
    this.animationTimer += deltaTime * 1000 // Convert to ms

    // Calculate animation stage (0 to 1)
    const stage = this.debugParams.animationStage || Math.min(this.animationTimer / this.debugParams.animationTime, 1)

    if (stage >= 1) {
      // Animation complete
      if (this.stopRequested) {
        // If stop was requested, actually stop now that we've completed a swing
        this.isAnimating = false
        this.stopRequested = false
        this.animationTimer = 0
        this.handMesh.rotation.copy(this.originalRotation)
        this.handMesh.position.copy(this.originalPosition)
        this.handMesh.scale.copy(this.originalScale)
        return
      }
      // Otherwise reset timer and continue
      this.animationTimer = 0
      return
    }

    // Start from original transforms
    this.handMesh.rotation.copy(this.originalRotation)
    this.handMesh.position.copy(this.originalPosition)
    this.handMesh.scale.copy(this.originalScale)

    if (this.debugParams.useClassicSwing) {
      // Classic Minecraft-style swing animation
      const rotationAngle = Math.min(90 * stage, this.debugParams.classicRotationMax)
      this.handMesh.rotation.z += THREE.MathUtils.degToRad(rotationAngle)

      // Complex positional movement
      this.handMesh.position.x += Math.cos(stage * this.PI) * this.debugParams.classicPositionX - stage * 0.5
      this.handMesh.position.y += Math.sin(stage * this.PI) * this.debugParams.classicPositionY - 0.3
      this.handMesh.position.z += Math.sin(stage * this.PI) * this.debugParams.classicPositionZ

      // Scale variation
      const scale = 1 - stage * this.debugParams.classicScaleReduction
      this.handMesh.scale.multiplyScalar(scale)
    } else {
      // New smooth swing animation
      const swingStage = stage < 0.5 ? stage * 2 : 2 - (stage * 2)

      // Forward and down motion
      const isBlock = this.type === 'block'
      const rotX = isBlock ? this.debugParams.newRotationBlockX : this.debugParams.newRotationX
      const rotZ = isBlock ? this.debugParams.newRotationBlockZ : this.debugParams.newRotationZ

      this.handMesh.rotation.x += rotX * swingStage
      // Add leftward motion
      this.handMesh.rotation.z += rotZ * swingStage

      // Add position offset during swing
      const posOffset = new THREE.Vector3(
        this.debugParams.newPositionX,
        this.debugParams.newPositionY,
        this.debugParams.newPositionZ
      )

      // Use item-specific position if it's an item
      if (this.type === 'item') {
        posOffset.set(
          this.debugParams.newPositionItemX,
          this.debugParams.newPositionItemY,
          this.debugParams.newPositionItemZ
        )
      }

      posOffset.multiplyScalar(swingStage)
      this.handMesh.position.add(posOffset)
    }
  }

  startSwing () {
    if (this.isAnimating) return

    this.isAnimating = true
    this.stopRequested = false
    this.animationTimer = 0
    this.lastTime = performance.now()
  }

  stopSwing () {
    if (!this.isAnimating) return
    this.stopRequested = true
  }

  isCurrentlySwinging () {
    return this.isAnimating
  }
}

export const getBlockMeshFromModel = (material: THREE.Material, model: BlockModel, name: string) => {
  const blockProvider = worldBlockProvider(viewer.world.blockstatesModels, viewer.world.blocksAtlasParser!.atlas, 'latest')
  const worldRenderModel = blockProvider.transformModel(model, {
    name,
    properties: {}
  })
  return getThreeBlockModelGroup(material, [[worldRenderModel]], undefined, 'plains', loadedData)
}

addEventListener('keydown', (e) => {
  window.playerState.disableStateUpdates = true
  if (e.code === 'KeyR') {
    //@ts-expect-error
    viewer.world.holdingBlock.handAnimator.startSwing(true)
  }
  if (e.code === 'ArrowLeft') {
    window.playerState.movementState = 'SNEAKING'
  }
  if (e.code === 'ArrowDown') {
    window.playerState.movementState = 'WALKING'
  }
  if (e.code === 'ArrowUp') {
    window.playerState.movementState = 'SPRINTING'
  }
})

setTimeout(() => {
  //@ts-expect-error
  window.holdingBlock = viewer.world.holdingBlock
})
