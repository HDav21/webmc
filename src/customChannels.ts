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
  registerMediaChannels()
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
      { name: 'rotation', type: 'u8' }, // 0-3 for 0°, 90°, 180°, 270° (3-6 is same but double side)
      { name: 'source', type: ['pstring', { countType: 'i16' }] },
      { name: 'loop', type: 'bool' },
      { name: '_volume', type: 'f32' }, // 0
      { name: '_aspectRatioMode', type: 'u8' }, // 0
      { name: '_background', type: 'u8' }, // 0
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
  const DESTROY_CHANNEL = 'minecraft-web-client:media-destroy'

  const controlPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] }
    ]
  ]

  const seekPacketStructure = [
    'container',
    [
      { name: 'id', type: ['pstring', { countType: 'i16' }] },
      { name: 'seconds', type: 'f32' }
    ]
  ]

  // Register channels
  bot._client.registerChannel(ADD_CHANNEL, addPacketStructure, true)
  bot._client.registerChannel(PLAY_CHANNEL, controlPacketStructure, true)
  bot._client.registerChannel(PAUSE_CHANNEL, controlPacketStructure, true)
  bot._client.registerChannel(SEEK_CHANNEL, seekPacketStructure, true)
  bot._client.registerChannel(DESTROY_CHANNEL, controlPacketStructure, true)

  // Handle media add
  bot._client.on(ADD_CHANNEL as any, (data) => {
    const { id, x, y, z, width, height, rotation, source, loop } = data
    const worldRenderer = viewer.world as WorldRendererThree

    // Destroy existing video if it exists
    worldRenderer.destroyVideo(id)

    // Add new video
    worldRenderer.addVideo(id, {
      position: { x, y, z },
      size: { width, height },
      side: 'towards',
      src: source,
      rotation: rotation as 0 | 1 | 2 | 3,
      doubleSide: false
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

  console.debug('Registered media channels')
}

const addTestVideo = (rotation = 0 as 0 | 1 | 2 | 3, scale = 1) => {
  const block = window.cursorBlockRel()
  if (!block) return
  const { position: startPosition } = block

  const worldRenderer = viewer.world as WorldRendererThree
  worldRenderer.destroyVideo('test-video')

  // Add video with proper positioning
  worldRenderer.addVideo('test-video', {
    position: {
      x: startPosition.x,
      y: startPosition.y,
      z: startPosition.z
    },
    size: {
      width: scale,
      height: scale
    },
    side: 'towards',
    src: 'video1.mp4',
    rotation,
    doubleSide: false
  })
}
window.addTestVideo = addTestVideo


// const registerMediaOpenChannel = () => {
//   const CHANNEL_NAME = 'minecraft-web-client:media-open'
//   const packetStructure = [
//     'container',
//     [
//       {
//         name: 'id',
