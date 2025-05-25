import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { stringStartsWith } from 'contro-max/build/stringUtils'
import { f3Keybinds, contro, onF3LongPress } from '../controls'
import { watchValue } from '../optionsStorage'
import { MobileButtonConfig, ActionHoldConfig } from '../appConfig'
import { showModal, miscUiState, activeModalStack, hideCurrentModal, gameAdditionalState } from '../globalState'
import { showOptionsModal } from './SelectOption'
import styles from './MobileTopButtons.module.css'
import PixelartIcon from './PixelartIcon'

interface ExtendedActionHoldConfig extends ActionHoldConfig {
  longPressAction?: string;
}

export default () => {
  const elRef = useRef<HTMLDivElement | null>(null)
  const { appConfig } = useSnapshot(miscUiState)
  const mobileButtonsConfig = appConfig?.mobileButtons

  const showMobileControls = (bl) => {
    if (elRef.current) elRef.current.style.display = bl ? 'flex' : 'none'
  }

  useEffect(() => {
    watchValue(miscUiState, o => {
      showMobileControls(o.currentTouch)
    })
  }, [])

  const handleCommand = (command: string | ActionHoldConfig, isDown: boolean) => {
    const commandString = typeof command === 'string' ? command : command.command

    if (!stringStartsWith(commandString, 'custom')) {
      if (isDown) {
        contro.emit('trigger', { command: commandString } as any)
      } else {
        contro.emit('release', { command: commandString } as any)
      }
    }
  }

  const renderConfigButtons = () => {
    return mobileButtonsConfig?.map((button, index) => {
      let className = styles['debug-btn']
      let label: string | JSX.Element = button.icon || button.label || '?'

      if (typeof label === 'string' && label.startsWith('pixelarticons:')) {
        const iconName = label.replace('pixelarticons:', '')
        label = <PixelartIcon iconName={iconName}/>
      }

      switch (button.action) {
        case 'general.chat':
          className = styles['chat-btn']
          label = ''
          break
        case 'ui.back':
          className = styles['pause-btn']
          label = ''
          break
        case 'general.playersList':
          className = styles['tab-btn']
          break
      }

      const onPointerDown = (e) => {
        const elem = e.currentTarget as HTMLElement
        elem.setPointerCapture(e.pointerId)

        if (button.actionHold) {
          const actionHold = button.actionHold as ExtendedActionHoldConfig
          if (actionHold.longPressAction) {
            const timerId = window.setTimeout(() => {
              if (actionHold.longPressAction === 'onF3LongPress') {
                void onF3LongPress()
              }
            }, 500)
            elem.dataset.longPressTimer = String(timerId)
            handleCommand(actionHold.command, true)
          } else {
            handleCommand(button.actionHold, true)
          }
        } else {
          handleCommand(button.action, true)
        }
      }

      const onPointerUp = (e) => {
        const elem = e.currentTarget as HTMLElement
        elem.releasePointerCapture(e.pointerId)

        const timerId = elem.dataset.longPressTimer
        if (timerId) {
          clearTimeout(parseInt(timerId, 10))
          delete elem.dataset.longPressTimer
        }

        if (button.actionHold) {
          const actionHold = button.actionHold as ExtendedActionHoldConfig
          if (actionHold.longPressAction) {
            handleCommand(actionHold.command, false)
          } else {
            handleCommand(button.actionHold, false)
          }
        } else {
          handleCommand(button.action, false)
        }
      }

      return (
        <div
          key={index}
          className={className}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onLostPointerCapture={onPointerUp}
        >
          {label}
        </div>
      )
    })
  }

  // ios note: just don't use <button>
  return <div ref={elRef} className={styles['mobile-top-btns']} id="mobile-top">
    {mobileButtonsConfig && mobileButtonsConfig.length > 0 ? renderConfigButtons() : ''}
  </div>
}
