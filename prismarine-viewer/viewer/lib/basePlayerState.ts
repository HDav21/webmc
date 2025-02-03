import { Vec3 } from 'vec3'

export type MovementState = 'NOT_MOVING' | 'WALKING' | 'SPRINTING' | 'SNEAKING'

export interface IPlayerState {
  getEyeHeight(): number
  getMovementState(): MovementState
  getVelocity(): Vec3
  isOnGround(): boolean
  isSneaking(): boolean
  isFlying(): boolean
  isSprinting(): boolean
}

export class BasePlayerState implements IPlayerState {
  protected movementState: MovementState = 'NOT_MOVING'
  protected velocity = new Vec3(0, 0, 0)
  protected onGround = true
  protected sneaking = false
  protected flying = false
  protected sprinting = false

  getEyeHeight(): number {
    return 1.62
  }

  getMovementState (): MovementState {
    return this.movementState
  }

  getVelocity (): Vec3 {
    return this.velocity
  }

  isOnGround (): boolean {
    return this.onGround
  }

  isSneaking (): boolean {
    return this.sneaking
  }

  isFlying (): boolean {
    return this.flying
  }

  isSprinting (): boolean {
    return this.sprinting
  }

  // For testing purposes
  setState (state: Partial<{
    movementState: MovementState
    velocity: Vec3
    onGround: boolean
    sneaking: boolean
    flying: boolean
    sprinting: boolean
  }>) {
    Object.assign(this, state)
  }
}
