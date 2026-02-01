import { useState, useEffect, useRef } from 'react'

export default function PointerLockHint () {
  const [hasPointerLock, setHasPointerLock] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement !== null
      setHasPointerLock(locked)

      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      if (locked) {
        setIsVisible(true)
        setIsFading(false)
        // Start fading after 8 seconds
        timerRef.current = window.setTimeout(() => {
          setIsFading(true)
          // Hide completely after fade completes
          timerRef.current = window.setTimeout(() => {
            setIsVisible(false)
          }, 1000)
        }, 8000)
      } else {
        setIsVisible(false)
        setIsFading(false)
      }
    }

    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  if (!hasPointerLock || !isVisible) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: '4px',
        fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        opacity: isFading ? 0 : 1,
        transition: 'opacity 1s ease',
        pointerEvents: 'none'
      }}
    >
      <span
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          padding: '2px 8px',
          borderRadius: '3px',
          fontWeight: 'bold',
          fontSize: '12px'
        }}
      >
        ESC
      </span>
      <span>to exit camera control</span>
    </div>
  )
}
