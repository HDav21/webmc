import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { f3Keybinds, contro } from '../controls'
import { watchValue } from '../optionsStorage'
import { MobileButtonConfig, ActionHoldConfig } from '../appConfig'
import { showModal, miscUiState, activeModalStack, hideCurrentModal, gameAdditionalState } from '../globalState'
import { showOptionsModal } from './SelectOption'
import styles from './MobileTopButtons.module.css'

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

  const onF3LongPress = async () => {
    const select = await showOptionsModal('', f3Keybinds.filter(f3Keybind => {
      return f3Keybind.mobileTitle && (f3Keybind.enabled?.() ?? true)
    }).map(f3Keybind => {
      return `${f3Keybind.mobileTitle}${f3Keybind.key ? ` (F3+${f3Keybind.key})` : ''}`
    }))
    if (!select) return
    const f3Keybind = f3Keybinds.find(f3Keybind => f3Keybind.mobileTitle === select)
    if (f3Keybind) void f3Keybind.action()
  }

  const onChatLongPress = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
  }

  const onChatClick = () => {
    if (activeModalStack.at(-1)?.reactType === 'chat') {
      hideCurrentModal()
    } else {
      showModal({ reactType: 'chat' })
    }
  }

  const handleCommand = (command: string | ActionHoldConfig, isDown: boolean) => {
    const commandString = typeof command === 'string' ? command : command.command

    if (isDown) {
      switch (commandString) {
        case 'chat':
          onChatClick()
          break
        case 'pause':
          showModal({ reactType: 'pause-screen' })
          break
        default:
          if (commandString.startsWith('general.')) {
            if (commandString === 'general.inventory') {
              if (activeModalStack.at(-1)?.reactType?.startsWith?.('player_win:')) {
                hideCurrentModal()
              } else {
                document.exitPointerLock?.()
                contro.emit('trigger', { command: commandString } as any)
              }
            } else {
              contro.emit('trigger', { command: commandString } as any)
            }
          }
      }
    } else {
      switch (commandString) {
        case 'chat':
        case 'pause':
        case 'general.inventory':
        case 'general.drop':
          // No release action needed
          break
        default:
          if (commandString.startsWith('general.')) {
            contro.emit('release', { command: commandString } as any)
          }
      }
    }
  }

  const renderConfigButtons = () => {
    return mobileButtonsConfig?.map((button, index) => {
      let className = styles['debug-btn']
      let label = button.label || button.icon || '?'

      if (button.action === 'chat') {
        className = styles['chat-btn']
        label = ''
      } else if (button.action === 'pause') {
        className = styles['pause-btn']
        label = ''
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

        // Очищаем таймер long press если он есть
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
