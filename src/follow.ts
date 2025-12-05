import { Vec3 } from 'vec3'

enum CameraMode {
  FIRST_PERSON = 'firstPerson', // Bot's eyes view
  THIRD_PERSON = 'thirdPerson', // Behind a followed player
  BIRDS_EYE_VIEW_FOLLOW = 'birdsEyeViewFollow' // Dynamic overhead view
}

let currentCameraMode: CameraMode = CameraMode.FIRST_PERSON

function handleMovement () {
  // Throttle the function to 60 updates per second
  const now = Date.now()
  if (now - appViewer.lastCamUpdate < 1000 / 60) {
    return
  }

  appViewer.lastCamUpdate = Date.now()

  // Handle birds eye follow mode
  if (currentCameraMode === CameraMode.BIRDS_EYE_VIEW_FOLLOW) {
    const { position, yaw, pitch } = getBirdsEyeCameraPosition()
    appViewer.backend?.updateCamera(position, yaw, pitch)
    void appViewer.worldView?.updatePosition(position)
    return
  }

  // handle losing the entity
  if (following && !following?.entity?.position) {
    // if the following entity cannot be found, switch back to following the bot itself
    console.log('The entity to follow could no longer be found (left/died/too far away/etc.)')
    console.log('Alerting parent app')
    customEvents.emit('followingPlayerLost')
    return
  }

  setThirdPersonCamera()
  void appViewer.worldView?.updatePosition(following.entity.position)
}

// Calculate the camera position and angle to follow the entity
export function getThirdPersonCameraPosition () {
  const targetPosition: Vec3 = following.entity.position

  // Calculate camera position 5 blocks behind and 2 block above target
  const { yaw } = following.entity
  const distance = 5
  const heightOffset = 2


  // Option 1: Calculate camera position behind the entity based on its yaw
  const dx = Math.sin(yaw) * distance
  const dz = Math.cos(yaw) * distance

  // Option 2: Camera position is always behind the entity on z axis
  // const dx = 0
  // const dz = -distance

  const cameraPosition = targetPosition.offset(dx, heightOffset, dz)
  const cameraYaw = yaw // Option 1: Use the entity's yaw
  // const cameraYaw = Math.PI // Option 2: Always look straight towards positive z axis
  const cameraPitch = -0.2 // always look slightly down at 20%

  return {
    position: cameraPosition,
    yaw: cameraYaw,
    pitch: cameraPitch
  }
}

// Cache for last valid birds eye position
let lastValidBirdsEyePosition: { position: Vec3, yaw: number, pitch: number } | null = null

// Calculate optimal birds eye camera position based on all players
export function getBirdsEyeCameraPosition () {
  // Get all player entities
  const players: Vec3[] = []
  const playerNames: string[] = []
  const excludedNames = new Set(['KradleWebViewer', 'watcher'])

  // Add the bot itself first (it's also a player) - unless it's one of the excluded
  if (bot.entity?.position && !excludedNames.has(bot.username || '')) {
    players.push(bot.entity.position)
    playerNames.push(bot.username || 'bot')
  }

  // Add all other player positions from bot.entities (excluding special entities)
  for (const entity of Object.values(bot.entities)) {
    if (entity.type === 'player' && entity.position && entity.username) {
      // Skip KradleWebViewer and watcher - they're not real players
      if (!excludedNames.has(entity.username)) {
        players.push(entity.position)
        playerNames.push(entity.username)
        // Debug: log actual Y position
        console.log(`[BirdsEye] Player ${entity.username} Y position: ${entity.position.y}`)
      }
    }
  }

  console.log(`[BirdsEye] Found ${players.length} real players (excluding watcher/viewer):`, playerNames)

  if (players.length === 0) {
    // Return last valid position if we have one
    if (lastValidBirdsEyePosition) {
      console.log('[BirdsEye] No players found, using cached position')
      return lastValidBirdsEyePosition
    }

    // Only use fallback if we've never had a valid position
    console.log('[BirdsEye] No players found and no cached position, using default')
    const fallbackY = bot.entity?.position?.y || 70
    return {
      position: new Vec3(bot.entity?.position?.x || 0, fallbackY + 12, (bot.entity?.position?.z || 0) + 12),
      yaw: 0,
      pitch: -Math.PI / 4 // 45 degrees looking down (negative for down)
    }
  }

  // Calculate center point of all players
  let centerX = 0
  let centerY = 0
  let centerZ = 0
  for (const pos of players) {
    centerX += pos.x
    centerY += pos.y
    centerZ += pos.z
  }
  const center = new Vec3(
    centerX / players.length,
    centerY / players.length,
    centerZ / players.length
  )

  // Calculate the maximum distance from center to determine height
  let maxDistance = 0
  for (const pos of players) {
    const distance = Math.hypot(
      pos.x - center.x,
      pos.z - center.z
    )
    if (distance > maxDistance) {
      maxDistance = distance
    }
  }

  // Calculate optimal height based on spread of players
  // For close players (< 8 blocks apart): 8 blocks above
  // For spread out players: scale up to max 12 blocks above
  const heightAbovePlayers = Math.min(12, Math.max(8, maxDistance * 0.4))

  // Calculate camera offset - move camera back (south) so 45° view captures all players
  // More spread = more offset needed
  const cameraOffset = Math.min(15, Math.max(10, maxDistance * 0.6))

  // Set camera position above and behind (south of) the center point
  const cameraY = center.y + heightAbovePlayers
  const cameraPosition = new Vec3(center.x, cameraY, center.z + cameraOffset)

  console.log('[BirdsEye] Center:', center, 'Height above:', heightAbovePlayers, 'Camera Y:', cameraY, 'Offset:', cameraOffset)

  // Cache this valid position
  const result = {
    position: cameraPosition,
    yaw: 0, // Always face north for consistency
    pitch: -Math.PI / 4 // 45 degrees looking down (negative for down)
  }

  lastValidBirdsEyePosition = result
  return result
}

export function setThirdPersonCamera (directionOnly = false) {
  // TODO: we can also be smarter about the camera to avoid obstacles coming in between.
  // and also handling special situations like water, lava, ladders, etc.

  // if the bot itself is being followed, just use first person camera normally
  if (following === bot) {
    const { position, yaw, pitch } = bot.entity
    appViewer.backend?.updateCamera(directionOnly ? null : position, yaw, pitch)
    return
  }

  // if the followed entity position cannot be found, just return. This will get retried later
  if (!following?.entity?.position) {
    console.warn('Cannot set third person camera. The followed entity position could not be found')
    return
  }

  // update the third person camera
  const { position, yaw, pitch } = getThirdPersonCameraPosition()
  appViewer.backend?.updateCamera(directionOnly ? null : position, yaw, pitch)
}

export function trackFollowerMovement () {
  bot.on('move', () => handleMovement())
  bot.on('forcedMove', () => handleMovement())

  // Handle Entity Changes
  bot.on('entityElytraFlew', () => handleMovement())
  bot.on('entityAttributes', () => handleMovement())
  bot.on('entitySpawn', () => handleMovement())
  bot.on('entityGone', () => handleMovement())
  bot.on('entityMoved', () => handleMovement())
  bot.on('entityUpdate', () => handleMovement())

  handleMovement()
}

async function doFollowPlayer (username: string) {
  // start following player
  console.log(`Following player '${username}'`)

  let target = bot.players[username]

  // check if the player exists, and wait sec if it doesn't
  if (!target) {
    await new Promise(resolve => { setTimeout(resolve, 1000) })
    target = bot.players[username]
  }

  // if there's still no target, give up
  if (!target) {
    // It still hasn't loaded, give up on following
    console.error(`Failed to follow player '${username}' - player not found`)
    return
  }

  // check if the target entity position is loaded, otherwise wait a bit
  if (!target?.entity?.position) {
    await new Promise(resolve => { setTimeout(resolve, 1000) })
  }

  // if there's still no target, give up
  if (!target?.entity?.position) {
    // It still hasn't loaded, give up on following
    console.error(`Failed to follow player '${username}' - could not find entity position`)
    return
  }
  // set the following player
  window.following = target
  currentCameraMode = CameraMode.THIRD_PERSON

  // disable keyboard control of bot
  console.log(`[Follow] Disabling controMax for following player ${username}`)
  controMax.enabled = false

  // notify any listeners
  customEvents.emit('followingPlayer', username)
}

export async function setFollowingPlayer (username?: string) {
  if (username) {
    if (!bot.players[username]) {
      console.log(`setFollowingPlayer bot.players[${username}] not found, will retry...`)
      // Retry every 2 seconds for up to 30 seconds
      const maxRetries = 15
      let retryCount = 0

      const retryFollow = () => {
        if (retryCount >= maxRetries) {
          console.error(`setFollowingPlayer Failed to follow player '${username}' after ${maxRetries} retries`)
          customEvents.emit('followingPlayerLost')
          return
        }

        if (bot.players[username]) {
          // Player found, continue with follow logic
          console.log(`setFollowingPlayer Player ${username} found after ${retryCount} retries`)
          // Continue with existing follow logic...
          void doFollowPlayer(username)
        } else {
          retryCount++
          setTimeout(retryFollow, 2000)
        }
      }

      setTimeout(retryFollow, 2000)
      return
    }

    void doFollowPlayer(username)
  } else {
    // stop following
    console.log(`Following self (main bot)`)

    // set the following player to the main bot
    window.following = bot
    currentCameraMode = CameraMode.FIRST_PERSON

    // enable keyboard control of bot
    controMax.enabled = true

    // notify any listeners
    customEvents.emit('followingPlayer', undefined)
  }
}

// Set camera to birds eye follow mode
export function setBirdsEyeFollowMode () {
  console.log('Setting birds eye follow mode')
  currentCameraMode = CameraMode.BIRDS_EYE_VIEW_FOLLOW

  // Disable keyboard control since we're in spectator mode
  console.log('[Follow] Disabling controMax for birds eye follow mode')
  controMax.enabled = false

  // Clear the following player since we're not following a specific entity
  window.following = bot // Keep bot as default but camera won't use it

  // Initial camera positioning
  const { position, yaw, pitch } = getBirdsEyeCameraPosition()
  appViewer.backend?.updateCamera(position, yaw, pitch)
  void appViewer.worldView?.updatePosition(position)

  // Notify listeners that we're in birds eye mode
  customEvents.emit('followingPlayer', 'birdsEyeViewFollow')
}

// Get current camera mode (useful for debugging)
export function getCurrentCameraMode () {
  return currentCameraMode
}
