import { Vec3 } from 'vec3'
import { IPlayerState, MovementState } from 'prismarine-viewer/viewer/lib/basePlayerState'
import { gameAdditionalState } from '../globalState'

export class PlayerStateManager implements IPlayerState {
  private lastVelocity = new Vec3(0, 0, 0)
  private movementState: MovementState = 'NOT_MOVING'
  private static instance: PlayerStateManager

  static getInstance (): PlayerStateManager {
    if (!this.instance) {
      this.instance = new PlayerStateManager()
    }
    return this.instance
  }

  private constructor () {
    // Initialize state tracking
    this.updateState = this.updateState.bind(this)
    customEvents.on('mineflayerBotCreated', () => {
      this.botCreated()
    })
  }

  private botCreated () {
    bot.on('move', this.updateState)
  }

  getEyeHeight (): number {
    return bot.controlState.sneak ? 1.27 : bot.entity?.['eyeHeight'] ?? 1.62
  }

  private updateState () {
    if (!bot.player?.entity) return

    const { velocity } = bot.player.entity
    const isOnGround = bot.entity.onGround
    const VELOCITY_THRESHOLD = 0.01
    const SPRINTING_VELOCITY = 0.18

    // Store velocity for comparison
    this.lastVelocity = velocity

    // Determine movement state
    if (!isOnGround) {
      // Keep current state if in air
      return
    }

    if (gameAdditionalState.isSneaking) {
      this.movementState = 'SNEAKING'
    } else if (Math.abs(velocity.x) > VELOCITY_THRESHOLD || Math.abs(velocity.z) > VELOCITY_THRESHOLD) {
      this.movementState = 'WALKING'
      if (Math.abs(velocity.x) > SPRINTING_VELOCITY || Math.abs(velocity.z) > SPRINTING_VELOCITY) {
        this.movementState = 'SPRINTING'
      }
    } else {
      this.movementState = 'NOT_MOVING'
    }
  }

  getMovementState (): MovementState {
    return this.movementState
  }

  getVelocity (): Vec3 {
    return this.lastVelocity
  }

  isOnGround (): boolean {
    return bot?.entity?.onGround ?? true
  }

  isSneaking (): boolean {
    return gameAdditionalState.isSneaking
  }

  isFlying (): boolean {
    return gameAdditionalState.isFlying
  }

  isSprinting (): boolean {
    return gameAdditionalState.isSprinting
  }
}

export const playerState = PlayerStateManager.getInstance()
