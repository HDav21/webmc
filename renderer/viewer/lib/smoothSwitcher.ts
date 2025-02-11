import * as tweenJs from '@tweenjs/tween.js'
import { AnimationController } from './animationController'

export type StateProperties = Record<string, number>

// Speed in units per second for each property type
const DEFAULT_SPEEDS = {
  x: 3000, // pixels/units per second
  y: 3000,
  z: 3000,
  rotation: Math.PI, // radians per second
  scale: 1, // scale units per second
  default: 3000 // default speed for unknown properties
}

export class SmoothSwitcher {
  private readonly propertyKeys: string[]
  private readonly animationController = new AnimationController()
  private readonly currentState: StateProperties = {}
  private readonly defaultState: StateProperties
  private _stableState: StateProperties | null = null
  private readonly speeds: Record<string, number>
  public stateName = ''

  constructor (
    public targetObject: Record<string, number>,
    propertyKeys?: string[],
    speeds?: Partial<Record<string, number>>
  ) {
    // If no property keys provided, use all numeric properties from the target object
    this.propertyKeys = propertyKeys ?? Object.entries(targetObject)
      .filter(([_, value]) => typeof value === 'number')
      .map(([key]) => key)

    // Initialize speeds with defaults and overrides
    this.speeds = { ...DEFAULT_SPEEDS }
    if (speeds) {
      Object.assign(this.speeds, speeds)
    }

    // Store initial values
    this.defaultState = this.captureCurrentState()
    this._stableState = { ...this.defaultState }

    // Initialize current state
    for (const key of this.propertyKeys) {
      this.currentState[key] = targetObject[key]
    }
  }

  /**
   * Captures the current state of the target object
   */
  private captureCurrentState (): StateProperties {
    const state: StateProperties = {}
    for (const key of this.propertyKeys) {
      state[key] = this.targetObject[key]
    }
    return state
  }

  /**
   * Calculate transition duration based on the largest property change
   */
  private calculateDuration (newState: Partial<StateProperties>): number {
    let maxDuration = 0

    for (const [key, targetValue] of Object.entries(newState)) {
      const currentValue = this.currentState[key]
      const diff = Math.abs(targetValue! - currentValue)
      const speed = this.getPropertySpeed(key)
      const duration = (diff / speed) * 1000 // Convert to milliseconds

      maxDuration = Math.max(maxDuration, duration)
    }

    // Ensure minimum duration of 50ms and maximum of 2000ms
    return Math.min(Math.max(maxDuration, 200), 2000)
  }

  private getPropertySpeed (property: string): number {
    // Check for specific property speed
    if (property in this.speeds) {
      return this.speeds[property]
    }

    // Check for property type (rotation, scale, etc.)
    if (property.toLowerCase().includes('rotation')) return this.speeds.rotation
    if (property.toLowerCase().includes('scale')) return this.speeds.scale
    if (property.toLowerCase() === 'x' || property.toLowerCase() === 'y' || property.toLowerCase() === 'z') {
      return this.speeds[property]
    }

    return this.speeds.default
  }

  /**
   * Start a transition to a new state
   * @param newState Partial state - only need to specify properties that change
   * @param easing Easing function to use
   */
  startTransition (
    newState: Partial<StateProperties>,
    stateName?: string,
    easing: (amount: number) => number = tweenJs.Easing.Linear.None
  ): void {
    if (this.isTransitioning) {
      this.animationController.forceFinish()
    }

    // Merge current state with new state
    const targetState = { ...this.currentState, ...newState }
    this._stableState = null

    const duration = this.calculateDuration(newState)
    // console.log('duration', duration, JSON.stringify(this.targetObject), JSON.stringify(targetState))

    void this.animationController.startAnimation(() => {
      const group = new tweenJs.Group()
      new tweenJs.Tween(this.targetObject, group)
        .to(targetState, duration)
        .easing(easing)
        .onUpdate(() => {
          // Apply current state to target object
          // for (const key of this.propertyKeys) {
          //   if (key in this.currentState) {
          //     this.targetObject[key] = this.currentState[key]
          //   }
          // }
        })
        .onComplete(() => {
          this.animationController.forceFinish()
          this._stableState = { ...this.currentState }
          this.stateName = stateName ?? ''
        })
        .start()
      return group
    })
  }

  /**
   * Reset to default state
   */
  reset (): void {
    this.startTransition(this.defaultState)
  }

  /**
   * Get the current stable state (null if transitioning)
   */
  get stableState (): StateProperties | null {
    return this._stableState
  }

  /**
   * Update the animation (should be called in your render/update loop)
   */
  update (updateFn?: (targetObject: Record<string, number>) => void): void {
    this.animationController.update()
    if (updateFn) {
      updateFn(this.targetObject)
    }
  }

  /**
   * Force finish the current transition
   */
  forceFinish (): void {
    this.animationController.forceFinish()
    this._stableState = { ...this.currentState }
  }

  /**
   * Start a new transition to the specified state
   */
  transitionTo (newState: Partial<StateProperties>, stateName?: string): void {
    this.startTransition(newState, stateName)
  }

  /**
   * Get the current value of a property
   */
  getCurrentValue (property: string): number {
    return this.currentState[property]
  }

  /**
   * Check if currently transitioning
   */
  get isTransitioning (): boolean {
    return this.animationController.isActive
  }
}
