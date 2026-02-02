import React, { useEffect, useState } from 'react'
import { Vec3 } from 'vec3'
import { setFollowingPlayer, setBirdsEyeFollowMode, getBirdsEyeCameraPosition, getThirdPersonCameraPosition, setSpectatorCameraPosition } from '../follow'
import { pointerLock } from '../utils'
import { toggleFly } from '../controls'
import { appQueryParams } from '../appParams'

// Helper function to focus the canvas for keyboard input
function focusCanvas () {
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
      focusCanvas()
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
      // Don't allow free roam mode in playback
      if (appQueryParams.isPlayback === 'true') return

      // Go directly into free roam mode - no overlay needed

      // Get current camera position (from birds eye or wherever we are)
      const cameraPosition = getBirdsEyeCameraPosition()
      if (cameraPosition?.position) {
        const { position, yaw, pitch } = cameraPosition

        // Set spectator camera to current view position
        setSpectatorCameraPosition(position)

        // Enable flying for spectator mode
        toggleFly(true)

        // Set the bot's view direction
        setTimeout(() => {
          bot.look(yaw, pitch).catch(() => {})
        }, 50)
      }

      // Switch to first person mode and enable controls
      void setFollowingPlayer(undefined)

      // Request pointer lock for mouse capture
      void pointerLock.requestPointerLock()

      // Ensure keyboard focus is on the canvas
      setTimeout(focusCanvas, 50)
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

        // In playback mode (non-live), don't auto-return to birdseye - let the user stay in spectator mode
        // In live mode, always return to birds eye view
        if (appQueryParams.isPlayback === 'true' && !appQueryParams.live) {
          return
        }

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

    // Don't allow taking control in playback mode
    // if (appQueryParams.isPlayback === 'true') return

    // Get camera position based on current mode
    let cameraPosition: { position: Vec3; yaw: number; pitch: number; } | null = null
    if (selectedParticipant === 'birdsEyeViewFollow') {
      cameraPosition = getBirdsEyeCameraPosition()
    } else if (selectedParticipant) {
      // Following a specific player
      cameraPosition = getThirdPersonCameraPosition()
    }

    // Set spectator camera position to match current camera
    if (cameraPosition?.position) {
      const { position, yaw, pitch } = cameraPosition

      // Store the camera position for spectator mode
      setSpectatorCameraPosition(position)

      // Enable flying for spectator camera control
      toggleFly(true)

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
    setTimeout(focusCanvas, 100)
  }

  // Playback mode blocking overlay - prevents all interactions
  // if (appQueryParams.isPlayback === 'true') {
  //   return (
  //     <div
  //       style={{
  //         position: 'absolute',
  //         inset: 0,
  //         zIndex: 3000, // Higher than game overlay
  //         cursor: 'default',
  //         pointerEvents: 'auto', // Capture all events
  //       }}
  //       onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.() }}
  //       onClick={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.() }}
  //       onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
  //       onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.() }}
  //       onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation() }}
  //     />
  //   )
  // }

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
