import type { Vec3 } from 'vec3'

function handleMovement () {
  // Throttle the function to 60 updates per second
  const now = Date.now()
  if (now - appViewer.lastCamUpdate < 1000 / 60) {
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

  appViewer.lastCamUpdate = Date.now()
  setThirdPersonCamera()
  void appViewer.worldView?.updatePosition(following.entity.position)
}

// Calculate the camera position and angle to follow the entity
function getThirdPersonCameraPosition () {
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

  // tell the watcher to keep us in range of the target player
  // via teleporting to the target player
  bot.whisper('watcher', `follow ${username}`)


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

  // disable keyboard control of bot
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
          doFollowPlayer(username);
        } else {
          retryCount++
          setTimeout(retryFollow, 2000)
        }
      }

      setTimeout(retryFollow, 2000)
      return
    }

    doFollowPlayer(username);
  } else {
    // stop following
    console.log(`Following self (main bot)`)

    // tell the watcher to stop following
    if (following !== bot && following?.entity?.position) {
      // unfollow and move to current camera position
      const { position, yaw, pitch } = getThirdPersonCameraPosition()
      bot.whisper('watcher', `unfollow ${position.x} ${position.y} ${position.z}`)
      // wait a bit so the teleport is complete before switching the camera
      await new Promise(resolve => { setTimeout(resolve, 500) })
      bot.look(yaw, pitch).catch(() => { }) // maintain camera position
    } else {
      // simply unfollow
      bot.whisper('watcher', 'unfollow')
    }

    // set the following player to the main bot
    window.following = bot

    // enable keyboard control of bot
    controMax.enabled = true

    // notify any listeners
    customEvents.emit('followingPlayer', undefined)
  }
}
