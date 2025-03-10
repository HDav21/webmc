function handleMovement () {
  // Throttle the function to 30 updates per second
  const now = Date.now()
  if (now - viewer.world.lastCamUpdate < 1000 / 30) {
    return
  }
  viewer.world.lastCamUpdate = now

  // handle losing the entity
  if (following && !following.entity) {
    // if the following entity cannot be found, switch back to following the bot itself
    console.log('The entity to follow could no longer be found (left/died/too far away/etc.)')
    console.log('Switching back to following the bot itself')
    window.following = bot.entity
    customEvents.emit('followingPlayer', undefined)
    return
  }

  setThirdPersonCamera()
  void worldView!.updatePosition(following.entity.position)
}

// Calculate the camera position and angle to follow the entity
function getThirdPersonCameraPosition () {
  const targetPosition = following.entity.position

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

  // if the following entity is not loaded yet, use the bot's entity here
  const entity = following.entity || bot.entity

  // if the bot itself is being followed, just use first person camera normally
  if (entity === bot.entity) {
    viewer.setFirstPersonCamera(directionOnly ? null : following.entity.position, following.entity.yaw, following.entity.pitch)
    return
  }

  // update the third person camera
  const { position, yaw, pitch } = getThirdPersonCameraPosition()
  viewer.setFirstPersonCamera(directionOnly ? null : position, yaw, pitch)
}

// Have the bot stay right behind the followed entity
// so it's always in sight, and control can be switched back to the bot easily
let lastMoveTime = 0
function moveTowardsFollowedEntity () {
  // Throttle to twice per second (500ms)
  const now = Date.now()
  if (now - lastMoveTime < 500) return
  lastMoveTime = now

  // We want the bot to stay close to the followed entity so we
  // always remain in sight of the player.

  // ignore if we're following ourselves
  if (bot === following) return

  // ignore if we can't see the entity
  if (!following.entity) return

  const { position: targetPosition } = getThirdPersonCameraPosition()

  // Don't move if we're near the target position
  const distance = bot.entity.position.distanceTo(targetPosition)
  if (distance <= 3) return

  console.log(`Moving towards target position: ${distance} blocks away (${targetPosition})`)
  // move towards the target position...
  void bot.creative.flyTo(targetPosition)
  // ...and look at the entity
  void bot.lookAt(following.entity.position)
}

export function trackFollowerMovement () {
  bot.on('move', () => handleMovement())

  // Handle Entity Changes
  bot.on('entityElytraFlew', () => handleMovement())
  bot.on('entityAttributes', () => handleMovement())
  bot.on('entitySpawn', () => handleMovement())
  bot.on('entityGone', () => handleMovement())
  bot.on('entityMoved', () => handleMovement())
  bot.on('entityUpdate', () => handleMovement())

  // Keep the bot close to the followed entity
  bot.on('entityMoved', () => moveTowardsFollowedEntity())
}

export function setFollowingPlayer (username?: string) {
  if (!username) {
    // stop following
    window.following = bot
    controMax.enabled = true
    customEvents.emit('followingPlayer', undefined)
    console.log(`Following self (main bot)`)
    return
  }

  // start following player
  window.following = bot.players[username]
  controMax.enabled = false
  customEvents.emit('followingPlayer', username)
  console.log(`Following player '${username}'`)
}

// Handle Kradle Custom Events
customEvents.on('kradle:followPlayer', async (data) => {
  const { username } = data

  console.log(`Follow player '${username}' requested`)

  // undefined means following self
  if (!username) {
    setFollowingPlayer()
    return
  }

  // check if the player exists
  if (!bot.players[username]) {
    // Give it a second to see if it loads eventually
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!bot.players[username]) {
      // It still hasn't loaded, give up on following
      console.error(`Failed to follow player '${username}' in the game (not found)`)

      // Switch to following self
      setFollowingPlayer()
      return
    }
  }

  // check if the entity has been loaded
  // TODO: this will return false even if the entity exists but is simply too far away to be rendered
  // we need to fix this so it works no matter where the player is located. maybe teleport the bot to the player?
  if (!bot.players[username].entity) {
    // Give it a second to see if it loads eventually
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!bot.players[username].entity) {
      // It still hasn't loaded, give up on following
      console.error(`'${username}' found but it's position could not be determined`)

      // Switch to following self
      setFollowingPlayer()
      return
    }
  }

  // Follow the player
  setFollowingPlayer(username)
})
