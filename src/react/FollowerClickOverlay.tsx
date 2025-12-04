import React, { useEffect, useState } from 'react'
import { setFollowingPlayer, setBirdsEyeFollowMode, getCurrentCameraMode, getBirdsEyeCameraPosition, getThirdPersonCameraPosition } from '../follow'
import { pointerLock } from '../utils'

export default function FollowerClickOverlay () {
  const [selectedParticipant, setSelectedParticipant] = useState<string | undefined>(undefined)
  const [isHovered, setIsHovered] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)

  useEffect(() => {
    const handler = async (data: any) => {
      const { username } = data
      console.log('[Overlay] follow requested:', username)
      setSelectedParticipant(username)
      setShowOverlay(true)
      await setFollowingPlayer(username)
    }

    customEvents.on('kradle:followPlayer', handler)
    return () => {
      customEvents.off('kradle:followPlayer', handler)
    }
  }, [])

  useEffect(() => {
    const handler = async () => {
      console.log('[Overlay] birdsEyeViewFollow')
      setSelectedParticipant('birdsEyeViewFollow')
      setShowOverlay(true)
      setBirdsEyeFollowMode()
    }
    customEvents.on('kradle:birdsEyeViewFollow', handler)
    return () => {
      customEvents.off('kradle:birdsEyeViewFollow', handler)
    }
  }, [])

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement !== null

      if (!locked) {
        // Pointer lock released — user hit ESC, return to birds eye view
        customEvents.emit('pointerLockReleased')

        // Return to birds eye follow mode
        setBirdsEyeFollowMode()
        setSelectedParticipant('birdsEyeViewFollow')
        setShowOverlay(true)
      }
    }

    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }
  }, [])

  const onPointerDownCapture = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation?.()
    console.log('[Overlay] pointerdown capture: stopped propagation')
  }

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log(`[Overlay] click handler fired (trusted gesture) ${selectedParticipant}`)

    // If we're in birds eye mode, teleport bot to exact camera position and switch to first person
    if (selectedParticipant === 'birdsEyeViewFollow') {
      console.log(`[Overlay] getCurrentCameraMode ${getCurrentCameraMode()}`)
      if (getCurrentCameraMode() === 'birdsEyeViewFollow') {
        const { position, yaw, pitch } = getBirdsEyeCameraPosition()
        console.log('[Overlay] Teleporting bot to exact birds eye camera position:', position)

        // Teleport the bot to the exact camera position
        if (position) {
          const teleportCommand = `/tp @s ${position.x} ${position.y} ${position.z}`
          console.log('[Overlay] Executing teleport:', teleportCommand)
          bot.chat(teleportCommand)

          // Set the bot's view direction to match camera exactly (with small delay for first time)
          setTimeout(() => {
            bot.look(yaw, pitch).catch((err) => {
              console.log('[Overlay] Error setting look direction:', err)
            })
          }, 50)
        }

        void pointerLock.requestPointerLock()

        setShowOverlay(false)
        setSelectedParticipant(undefined)
        void setFollowingPlayer(undefined) // This switches to first person mode and enables controls
        return // Early return to avoid the normal flow
      }
    }

    // If we're following a player, teleport bot to exact camera position
    if (selectedParticipant && selectedParticipant !== 'birdsEyeViewFollow') {
      const { position, yaw, pitch } = getThirdPersonCameraPosition()
      console.log('[Overlay] Teleporting bot to exact camera position:', position)

      if (position) {
        const teleportCommand = `/tp @s ${position.x} ${position.y} ${position.z}`
        console.log('[Overlay] Executing teleport:', teleportCommand)
        bot.chat(teleportCommand)

        // Set the bot's view direction to match camera exactly (with small delay for first time)
        setTimeout(() => {
          bot.look(yaw, pitch).catch((err) => {
            console.log('[Overlay] Error setting look direction:', err)
          })
        }, 50)
      }
    }

    void pointerLock.requestPointerLock()

    setShowOverlay(false)
    setSelectedParticipant(undefined)
    void setFollowingPlayer(undefined) // This switches to first person mode and enables controls
  }

  if (!selectedParticipant || !showOverlay) return null

  return (
    <div
      onPointerDownCapture={onPointerDownCapture}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        opacity: isHovered ? 1 : 0,
        cursor: 'pointer',
        transition: 'opacity 0.3s ease',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ textAlign: 'center', color: 'white', pointerEvents: 'none', fontSize: 10 }}>
        <div>{selectedParticipant === 'birdsEyeViewFollow' ? "You are in bird's eye view mode" : `You are following ${selectedParticipant}`}</div>
        <div>Click to enter spectator mode and control camera</div>
      </div>
    </div>
  )
}
