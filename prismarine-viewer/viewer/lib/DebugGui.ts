// eslint-disable-next-line import/no-named-as-default
import GUI from 'lil-gui'

export interface ParamMeta {
  min?: number
  max?: number
  step?: number
}

export class DebugGui {
  private gui: GUI
  private readonly storageKey: string
  private target: any
  private readonly params: string[]
  private readonly paramsMeta: Record<string, ParamMeta>
  private _visible = true // New visibility state
  private readonly initialValues: Record<string, any> = {} // Store initial values

  constructor (id: string, target: any, params?: string[], paramsMeta?: Record<string, ParamMeta>) {
    this.gui = new GUI()
    this.storageKey = `debug_params_${id}`
    this.target = target
    this.paramsMeta = paramsMeta ?? {}

    // If params not provided, get all properties from target
    this.params = params ?? Object.keys(target)

    // Store initial values
    for (const param of this.params) {
      this.initialValues[param] = target[param]
    }

    // Load saved values from localStorage
    this.loadSavedValues()

    // Setup GUI controls
    this.setupControls()

    // Set initial visibility from localStorage if exists
    const savedVisibility = localStorage.getItem(`${this.storageKey}_visible`)
    if (savedVisibility !== null) {
      this.visible = savedVisibility === 'true'
    }

    // Save values when window unloads
    window.addEventListener('unload', () => {
      this.saveValues()
      this.saveVisibility()
    })
  }

  // Getter for visibility
  get visible (): boolean {
    return this._visible
  }

  // Setter for visibility
  set visible (value: boolean) {
    this._visible = value
    this.gui.domElement.style.display = value ? 'block' : 'none'
    this.saveVisibility()
  }

  private loadSavedValues () {
    try {
      const saved = localStorage.getItem(this.storageKey)
      if (saved) {
        const values = JSON.parse(saved)
        // Apply saved values to target
        for (const param of this.params) {
          if (param in values) {
            const value = values[param]
            if (value !== null) {
              this.target[param] = value
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load debug values:', e)
    }
  }

  private saveValues () {
    try {
      const values = {}
      for (const param of this.params) {
        values[param] = this.target[param]
      }
      localStorage.setItem(this.storageKey, JSON.stringify(values))
    } catch (e) {
      console.warn('Failed to save debug values:', e)
    }
  }

  private saveVisibility () {
    try {
      localStorage.setItem(`${this.storageKey}_visible`, this._visible.toString())
    } catch (e) {
      console.warn('Failed to save debug visibility:', e)
    }
  }

  private setupControls () {
    // Add visibility toggle at the top
    this.gui.add(this, 'visible').name('Show Controls')
    this.gui.add({ resetAll: () => {
      for (const param of this.params) {
        this.target[param] = this.initialValues[param]
      }
      this.saveValues()
      this.gui.destroy()
      this.gui = new GUI()
      this.setupControls()
    } }, 'resetAll').name('Reset All Parameters')

    for (const param of this.params) {
      const value = this.target[param]
      const meta = this.paramsMeta[param] ?? {}

      if (typeof value === 'number') {
        // For numbers, use meta values or calculate reasonable defaults
        const min = meta.min ?? value - Math.abs(value * 2)
        const max = meta.max ?? value + Math.abs(value * 2)
        const step = meta.step ?? Math.abs(value) / 100

        this.gui.add(this.target, param, min, max, step)
          .onChange(() => this.saveValues())
      } else if (typeof value === 'boolean') {
        // For booleans, create a checkbox
        this.gui.add(this.target, param)
          .onChange(() => this.saveValues())
      } else if (typeof value === 'string' && ['x', 'y', 'z'].includes(param)) {
        // Special case for xyz coordinates
        const min = meta.min ?? -10
        const max = meta.max ?? 10
        const step = meta.step ?? 0.1

        this.gui.add(this.target, param, min, max, step)
          .onChange(() => this.saveValues())
      } else if (Array.isArray(value)) {
        // For arrays, create a dropdown
        this.gui.add(this.target, param, value)
          .onChange(() => this.saveValues())
      }
    }
  }

  // Method to manually trigger save
  save () {
    this.saveValues()
    this.saveVisibility()
  }

  // Method to destroy the GUI and clean up
  destroy () {
    this.saveValues()
    this.saveVisibility()
    this.gui.destroy()
  }

  // Toggle visibility
  toggle () {
    this.visible = !this.visible
  }

  // Show the GUI
  show () {
    this.visible = true
  }

  // Hide the GUI
  hide () {
    this.visible = false
  }
}
