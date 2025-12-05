import React, { useEffect, useState } from 'react'
import { Vec3 } from 'vec3'
import { setFollowingPlayer, setBirdsEyeFollowMode, getBirdsEyeCameraPosition, getThirdPersonCameraPosition } from '../follow'
import { pointerLock } from '../utils'

export default function FollowerClickOverlay () {
  const [selectedParticipant, setSelectedParticipant] = useState<string | undefined>(undefined)
  const [isHovered, setIsHovered] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)


  useEffect(() => {
    const handler = async (data: any) => {
      const { username } = data
      setSelectedParticipant(username)
      setShowOverlay(true)
      await setFollowingPlayer(username)

      // The overlay might have stolen focus when it rendered
      // Return focus to the canvas/document
      const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement
      if (canvas) {
        // Canvas elements need tabIndex to be focusable
        if (!canvas.hasAttribute('tabindex')) {
          canvas.setAttribute('tabindex', '-1')
        }
        canvas.focus()
      } else {
        document.documentElement.focus()
      }
    }

    customEvents.on('kradle:followPlayer', handler)
    return () => {
      customEvents.off('kradle:followPlayer', handler)
    }
  }, [])

  useEffect(() => {
    const handler = async () => {
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
    const handler = async () => {
      // Go directly into free roam mode - no overlay needed
      // Switch to first person mode and enable controls
      void setFollowingPlayer(undefined)

      // Request pointer lock for mouse capture
      void pointerLock.requestPointerLock()

      // Ensure keyboard focus is on the canvas
      setTimeout(() => {
        const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement
        if (canvas) {
          // Canvas elements need tabIndex to be focusable
          if (!canvas.hasAttribute('tabindex')) {
            canvas.setAttribute('tabindex', '-1')
          }
          canvas.focus()
        } else {
          document.documentElement.focus()
        }
      }, 50)
    }
    customEvents.on('kradle:freeRoamMode', handler)
    return () => {
      customEvents.off('kradle:freeRoamMode', handler)
    }
  }, [])

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement !== null

      if (!locked) {
        // Pointer lock released — user hit ESC, return to birds eye view
        customEvents.emit('pointerLockReleased')

        // Return to birds eye follow mode
        setSelectedParticipant('birdsEyeViewFollow')
        setShowOverlay(true)
        setBirdsEyeFollowMode()
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
  }

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Get camera position based on current mode
    let cameraPosition: { position: Vec3; yaw: number; pitch: number; } | null = null
    if (selectedParticipant === 'birdsEyeViewFollow') {
      cameraPosition = getBirdsEyeCameraPosition()
    } else if (selectedParticipant) {
      // Following a specific player
      cameraPosition = getThirdPersonCameraPosition()
    }

    // Teleport bot to camera position and set view direction
    if (cameraPosition?.position) {
      const { position, yaw, pitch } = cameraPosition
      const teleportCommand = `/tp @s ${position.x} ${position.y} ${position.z}`
      bot.chat(teleportCommand)

      // Set the bot's view direction to match camera exactly (with small delay)
      setTimeout(() => {
        bot.look(yaw, pitch).catch(() => {})
      }, 50)
    }

    // Hide overlay first before requesting pointer lock
    setShowOverlay(false)
    setSelectedParticipant(undefined)

    void pointerLock.requestPointerLock()

    // Switch to first person mode and enable controls
    void setFollowingPlayer(undefined)

    // Ensure keyboard focus is on the game after taking control
    // This prevents spacebar from scrolling the page and ensures keyboard events are captured
    setTimeout(() => {
      // Try to focus the canvas element where the game is rendered
      const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement
      if (canvas) {
        // Canvas elements need tabIndex to be focusable
        if (!canvas.hasAttribute('tabindex')) {
          canvas.setAttribute('tabindex', '-1')
        }
        canvas.focus()
      } else {
        // Fallback to focusing the document element
        document.documentElement.focus()
      }

    }, 100)
  }

  if (!selectedParticipant || !showOverlay) return null

  return (
    <div
      onPointerDownCapture={onPointerDownCapture}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
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
        <div>{selectedParticipant === 'birdsEyeViewFollow' ? 'You are in bird\'s eye view mode' : `You are following ${selectedParticipant}`}</div>
        <div>Click to enter spectator mode and control camera</div>
      </div>
    </div>
  )
}
