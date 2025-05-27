import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { handleMobileButtonActionCommand, handleMobileButtonLongPress } from '../controls'
import { watchValue } from '../optionsStorage'
import { type MobileButtonConfig, type ActionHoldConfig, type ActionType, type CustomAction } from '../appConfig'
import { miscUiState } from '../globalState'
import PixelartIcon from './PixelartIcon'
import styles from './MobileTopButtons.module.css'

export default () => {
  const elRef = useRef<HTMLDivElement | null>(null)
  const { appConfig } = useSnapshot(miscUiState)
  const mobileButtonsConfig = appConfig?.mobileButtons

  const longPressTimerIdRef = useRef<number | null>(null)
  const actionToShortPressRef = useRef<ActionType | null>(null)

  const showMobileControls = (visible: boolean) => {
    if (elRef.current) {
      elRef.current.style.display = visible ? 'flex' : 'none'
    }
  }

  useEffect(() => {
    watchValue(miscUiState, o => {
      showMobileControls(Boolean(o.currentTouch))
    })
  }, [])

  const getButtonClassName = (action: ActionType): string => {
    if (typeof action === 'string') {
      switch (action) {
        case 'general.chat':
          return styles['chat-btn']
        case 'ui.back':
          return styles['pause-btn']
        case 'general.playersList':
          return styles['tab-btn']
        default:
          return styles['debug-btn']
      }
    }
    return styles['debug-btn']
  }

  const renderConfigButtons = () => {
    return mobileButtonsConfig?.map((button, index) => {
      const className = button.action ? getButtonClassName(button.action) : styles['debug-btn']
      let label: string | JSX.Element = button.icon || button.label || ''

      if (typeof label === 'string' && label.startsWith('pixelarticons:')) {
        const iconName = label.replace('pixelarticons:', '')
        label = <PixelartIcon iconName={iconName} />
      }

      const onPointerDown = (e: React.PointerEvent) => {
        const elem = e.currentTarget as HTMLElement
        elem.setPointerCapture(e.pointerId)

        if (longPressTimerIdRef.current) {
          clearTimeout(longPressTimerIdRef.current)
          longPressTimerIdRef.current = null
        }
        actionToShortPressRef.current = null

        const { actionHold, action } = button

        if (actionHold) {
          if (typeof actionHold === 'string' || (typeof actionHold === 'object' && !('command' in actionHold))) {
            handleMobileButtonActionCommand(actionHold, true)
          } else {
            const config = actionHold
            const { command, longPressAction, duration } = config

            if (longPressAction) {
              actionToShortPressRef.current = command
              longPressTimerIdRef.current = window.setTimeout(() => {
                handleMobileButtonLongPress(config)
                actionToShortPressRef.current = null
                longPressTimerIdRef.current = null
              }, duration || 500)
            } else {
              handleMobileButtonActionCommand(command, true)
            }
          }
        } else if (action) {
          handleMobileButtonActionCommand(action, true)
        }
      }

      const onPointerUp = (e: React.PointerEvent) => {
        const elem = e.currentTarget as HTMLElement
        elem.releasePointerCapture(e.pointerId)

        const { actionHold, action } = button
        let wasShortPress = false

        if (longPressTimerIdRef.current) {
          clearTimeout(longPressTimerIdRef.current)
          longPressTimerIdRef.current = null
          if (actionToShortPressRef.current) {
            handleMobileButtonActionCommand(actionToShortPressRef.current, true)
            handleMobileButtonActionCommand(actionToShortPressRef.current, false)
            wasShortPress = true
          }
        }

        if (!wasShortPress) {
          if (actionHold) {
            if (typeof actionHold === 'object' && 'longPressAction' in actionHold && actionHold.longPressAction) {
              if (actionToShortPressRef.current === null && typeof actionHold.longPressAction === 'string') {
                handleMobileButtonActionCommand(actionHold.longPressAction, false)
              }
            } else if (typeof actionHold === 'string') {
              handleMobileButtonActionCommand(actionHold, false)
            } else if (typeof actionHold === 'object' && 'command' in actionHold) {
              handleMobileButtonActionCommand(actionHold.command, false)
            }
          } else if (action) {
            handleMobileButtonActionCommand(action, false)
          }
        }
        actionToShortPressRef.current = null
      }

      return (
        <div
          key={index}
          className={className}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onLostPointerCapture={onPointerUp} // Important for when pointer leaves element while pressed
        >
          {label}
        </div>
      )
    })
  }

  // ios note: just don't use <button>
  return (
    <div ref={elRef} className={styles['mobile-top-btns']} id="mobile-top">
      {mobileButtonsConfig && mobileButtonsConfig.length > 0 ? renderConfigButtons() : null}
    </div>
  )
}
