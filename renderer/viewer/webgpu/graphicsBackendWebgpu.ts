import { WorldRendererWebgpu } from 'renderer/viewer/webgpu/worldrendererWebgpu'
import { updateLocalServerSettings } from 'src/integratedServer/main'
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
      const onSettingsUpdate = () => {
        displayOptions.worldView.allowPositionUpdate = initOptions.rendererSpecificSettings.allowChunksViewUpdate ?? false
        updateLocalServerSettings({
          stopLoad: !displayOptions.worldView.allowPositionUpdate
        })
      }
      onSettingsUpdate()

      worldRenderer = new WorldRendererWebgpu(initOptions, displayOptions)
      await worldRenderer.readyPromise
    },
    disconnect () {

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
