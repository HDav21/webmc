import React, { useEffect, useState } from 'react'
import { setFollowingPlayer } from '../follow'
import { pointerLock } from '../utils'

export default function FollowerClickOverlay() {
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
    return () => customEvents.off('kradle:followPlayer', handler)
  }, [])

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement != null;

      if (!locked) {
        // Pointer lock released — likely user hit ESC
        customEvents.emit('pointerLockReleased');
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  const onPointerDownCapture = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation?.()
    console.log('[Overlay] pointerdown capture: stopped propagation')
  }

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[Overlay] click handler fired (trusted gesture)')

    pointerLock.requestPointerLock()

    setTimeout(() => {
      setShowOverlay(false)
      setSelectedParticipant(undefined)
      setFollowingPlayer(undefined)
    }, 0)
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
        <div>You are following {selectedParticipant}</div>
        <div>Click to enter spectator mode and control camera</div>
      </div>
    </div>
  )
}
