import { Vec3 } from 'vec3'
import * as THREE from 'three'
import { WorldRendererThree } from '../renderer/viewer/lib/worldrendererThree'
import { options } from './optionsStorage'

customEvents.on('mineflayerBotCreated', async () => {
  if (!options.customChannels) return
  await new Promise(resolve => {
    bot.once('login', () => {
      resolve(true)
    })
  })
  registerBlockModelsChannel()
  if (options.networkRelatedCustomChannels) {
    registerMediaChannels()
  }
})

const registerBlockModelsChannel = () => {
  const CHANNEL_NAME = 'minecraft-web-client:blockmodels'

  const packetStructure = [
    'container',
    [
      {
        name: 'worldName', // currently not used
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'x',
        type: 'i32'
      },
      {
        name: 'y',
        type: 'i32'
      },
      {
        name: 'z',
        type: 'i32'
      },
      {
        name: 'model',
        type: ['pstring', { countType: 'i16' }]
      }
    ]
  ]

  bot._client.registerChannel(CHANNEL_NAME, packetStructure, true)

  bot._client.on(CHANNEL_NAME as any, (data) => {
    const { worldName, x, y, z, model } = data

    const chunkX = Math.floor(x / 16) * 16
    const chunkZ = Math.floor(z / 16) * 16
    const chunkKey = `${chunkX},${chunkZ}`
    const blockPosKey = `${x},${y},${z}`

    const chunkModels = viewer.world.protocolCustomBlocks.get(chunkKey) || {}

    if (model) {
      chunkModels[blockPosKey] = model
    } else {
      delete chunkModels[blockPosKey]
    }

    if (Object.keys(chunkModels).length > 0) {
      viewer.world.protocolCustomBlocks.set(chunkKey, chunkModels)
    } else {
      viewer.world.protocolCustomBlocks.delete(chunkKey)
    }

    // Trigger update
    if (worldView) {
      const block = worldView.world.getBlock(new Vec3(x, y, z))
      if (block) {
        worldView.world.setBlockStateId(new Vec3(x, y, z), block.stateId)
      }
    }

  })

  console.debug(`registered custom channel ${CHANNEL_NAME} channel`)
}

const registeredJeiChannel = () => {
  const CHANNEL_NAME = 'minecraft-web-client:jei'
  // id - string, categoryTitle - string, items - string (json array)
  const packetStructure = [
    'container',
    [
      {
        name: 'id',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'categoryTitle',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'items',
        type: ['pstring', { countType: 'i16' }]
      },
    ]
  ]

  bot._client.registerChannel(CHANNEL_NAME, packetStructure, true)

  bot._client.on(CHANNEL_NAME as any, (data) => {
    const { id, categoryTitle, items } = data
    // ...
  })

  console.debug(`registered custom channel ${CHANNEL_NAME} channel`)
}

const registerMediaChannels = () => {
  // Media Add Channel
  const ADD_CHANNEL = 'minecraft-web-client:media-add'
  const addPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'x', type: 'i32' },
      { name: 'y', type: 'i32' },
      { name: 'z', type: 'i32' },
      { name: 'width', type: 'f32' },
      { name: 'height', type: 'f32' },
      { name: '_rotation', type: 'u8' }, // 0: 0° - towards positive z, 1: 90° - positive x, 2: 180° - negative z, 3: 270° - negative x (3-6 is same but double side)
      { name: 'source', type: ['pstring', { countType: 'i16' }] },
      { name: 'loop', type: 'bool' },
      { name: '_volume', type: 'f32' }, // 0
      { name: '_aspectRatioMode', type: 'u8' }, // 0
      { name: '_background', type: 'u8' }, // 0
      { name: '_opacity', type: 'u8' }, // 1
      { name: '_cropXStart', type: 'f32' }, // 0
      { name: '_cropYStart', type: 'f32' }, // 0
      { name: '_cropXEnd', type: 'f32' }, // 0
      { name: '_cropYEnd', type: 'f32' }, // 0
    ]
  ]

  // Media Control Channels
  const PLAY_CHANNEL = 'minecraft-web-client:media-play'
  const PAUSE_CHANNEL = 'minecraft-web-client:media-pause'
  const SEEK_CHANNEL = 'minecraft-web-client:media-seek'
  const VOLUME_CHANNEL = 'minecraft-web-client:media-volume'
  const SPEED_CHANNEL = 'minecraft-web-client:media-speed'
  const DESTROY_CHANNEL = 'minecraft-web-client:media-destroy'

  const noDataPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] }
    ]
  ]

  const setNumberPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'seconds', type: 'f32' }
    ]
  ]

  // Register channels
  bot._client.registerChannel(ADD_CHANNEL, addPacketStructure, true)
  bot._client.registerChannel(PLAY_CHANNEL, noDataPacketStructure, true)
  bot._client.registerChannel(PAUSE_CHANNEL, noDataPacketStructure, true)
  bot._client.registerChannel(SEEK_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(VOLUME_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(SPEED_CHANNEL, setNumberPacketStructure, true)
  bot._client.registerChannel(DESTROY_CHANNEL, noDataPacketStructure, true)

  // Handle media add
  bot._client.on(ADD_CHANNEL as any, (data) => {
    const { id, x, y, z, width, height, rotation, source, loop, background, opacity } = data

    if (source.endsWith('.png') || source.endsWith('.jpg') || source.endsWith('.jpeg')) {
      throw new Error('Image files are not supported yet, please use Minecraft maps instead')
    }

    const worldRenderer = viewer.world as WorldRendererThree

    // Destroy existing video if it exists
    worldRenderer.destroyVideo(id)

    // Add new video
    worldRenderer.addVideo(id, {
      position: { x, y, z },
      size: { width, height },
      side: 'towards',
      src: source,
      // rotation: rotation as 0 | 1 | 2 | 3,
      rotation: 0,
      doubleSide: false,
      background,
      opacity: opacity / 100
    })

    // Set loop state
    if (!loop) {
      const videoData = worldRenderer.customVideos.get(id)
      if (videoData) {
        videoData.video.loop = false
      }
    }
  })

  // Handle media play
  bot._client.on(PLAY_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoPlaying(id, true)
  })

  // Handle media pause
  bot._client.on(PAUSE_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoPlaying(id, false)
  })

  // Handle media seek
  bot._client.on(SEEK_CHANNEL as any, (data) => {
    const { id, seconds } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoSeeking(id, seconds)
  })

  // Handle media destroy
  bot._client.on(DESTROY_CHANNEL as any, (data) => {
    const { id } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.destroyVideo(id)
  })

  // Handle media volume
  bot._client.on(VOLUME_CHANNEL as any, (data) => {
    const { id, volume } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoVolume(id, volume)
  })

  // Handle media speed
  bot._client.on(SPEED_CHANNEL as any, (data) => {
    const { id, speed } = data
    const worldRenderer = viewer.world as WorldRendererThree
    worldRenderer.setVideoSpeed(id, speed)
  })

  // ---

  // Video interaction channel
  const interactionPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'x', type: 'f32' },
      { name: 'y', type: 'f32' },
      { name: 'isRightClick', type: 'bool' }
    ]
  ]

  bot._client.registerChannel(MEDIA_INTERACTION_CHANNEL, interactionPacketStructure, true)

  console.debug('Registered media channels')
}

const MEDIA_INTERACTION_CHANNEL = 'minecraft-web-client:media-interaction'

export const sendVideoInteraction = (id: string, x: number, y: number, isRightClick: boolean) => {
  bot._client.writeChannel(MEDIA_INTERACTION_CHANNEL, { id, x, y, isRightClick })
}

export const videoCursorInteraction = () => {
  const worldRenderer = viewer.world as WorldRendererThree
  const { camera } = worldRenderer
  const raycaster = new THREE.Raycaster()

  // Get mouse position at center of screen
  const mouse = new THREE.Vector2(0, 0)

  // Update the raycaster
  raycaster.setFromCamera(mouse, camera)

  // Check intersection with all video meshes
  for (const [id, videoData] of worldRenderer.customVideos.entries()) {
    // Get the actual mesh (first child of the group)
    const mesh = videoData.mesh.children[0] as THREE.Mesh
    if (!mesh) continue

    const intersects = raycaster.intersectObject(mesh, false)
    if (intersects.length > 0) {
      const intersection = intersects[0]
      const { uv } = intersection
      if (!uv) return null

      return {
        id,
        x: uv.x,
        y: uv.y
      }
    }
  }

  return null
}
window.videoCursorInteraction = videoCursorInteraction

const addTestVideo = (rotation = 0 as 0 | 1 | 2 | 3, scale = 1, towards = true) => {
  const block = window.cursorBlockRel()
  if (!block) return
  const { position: startPosition } = block

  const worldRenderer = viewer.world as WorldRendererThree
  worldRenderer.destroyVideo('test-video')

  // Add video with proper positioning
  worldRenderer.addVideo('test-video', {
    position: {
      x: startPosition.x,
      y: startPosition.y + 1,
      z: startPosition.z
    },
    size: {
      width: scale,
      height: scale
    },
    side: towards ? 'towards' : 'away',
    src: 'https://bucket.mcraft.fun/test_video.mp4',
    rotation,
    // doubleSide: true,
    background: 0x00_00_00, // Black color
    // TODO broken
    // uvMapping: {
    //   startU: 0,
    //   endU: 1,
    //   startV: 0,
    //   endV: 1
    // },
    opacity: 1
  })
}
window.addTestVideo = addTestVideo
