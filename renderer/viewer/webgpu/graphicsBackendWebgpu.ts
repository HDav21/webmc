import { WorldRendererWebgpu } from 'renderer/viewer/webgpu/worldrendererWebgpu'
import { updateLocalServerSettings } from 'src/integratedServer/main'
import { defaultWebgpuRendererParams } from 'renderer/playground/webgpuRendererShared'
import { GraphicsBackend, GraphicsInitOptions } from '../../../src/appViewer'

export type WebgpuInitOptions = GraphicsInitOptions<{
  allowChunksViewUpdate?: boolean
}>

const createWebgpuBackend = (initOptions: WebgpuInitOptions) => {
  let worldRenderer: WorldRendererWebgpu | undefined

  const backend: GraphicsBackend = {
    id: 'webgpu',
    startPanorama () {

    },
    async startWorld (displayOptions) {
      initOptions.rendererSpecificSettings.allowChunksViewUpdate ??= defaultWebgpuRendererParams.allowChunksViewUpdate
      const onSettingsUpdate = () => {
        displayOptions.worldView.allowPositionUpdate = initOptions.rendererSpecificSettings.allowChunksViewUpdate!
        updateLocalServerSettings({
          stopLoad: !displayOptions.worldView.allowPositionUpdate
        })
      }
      onSettingsUpdate()

      worldRenderer = new WorldRendererWebgpu(initOptions, displayOptions)
      globalThis.world = worldRenderer
      await worldRenderer.readyPromise
    },
    disconnect () {
      globalThis.world = undefined
      worldRenderer?.destroy()
    },
    soundSystem: undefined,
    setRendering (rendering) {

    },
    updateCamera (pos, yaw, pitch) {
      worldRenderer?.setFirstPersonCamera(pos, yaw, pitch)
    },
    backendMethods: {}
  }
  return backend
}

createWebgpuBackend.id = 'webgpu'
export default createWebgpuBackend
