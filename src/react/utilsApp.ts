import { proxy, useSnapshot } from 'valtio'
import { useEffect, useMemo } from 'react'
import { useMedia } from 'react-use'
import { activeModalStack, miscUiState } from '../globalState'
import { currentScaling } from '../scaleInterface'

export const watchedModalsFromHooks = proxy({
  value: new Set<string>()
})
// todo should not be there
export const hardcodedKnownModals = [
  'player_win:',
  'full-map' // todo
]

export const useUsingTouch = () => {
  return useSnapshot(miscUiState).currentTouch
}
export const useIsModalActive = (modal: string, useIncludes = false) => {
  useMemo(() => {
    watchedModalsFromHooks.value.add(modal)
  }, [])
  useEffect(() => {
    // watchedModalsFromHooks.add(modal)
    return () => {
      watchedModalsFromHooks.value.delete(modal)
    }
  }, [])

  const allStack = useSnapshot(activeModalStack)
  return useIncludes ? allStack.some(x => x.reactType === modal) : allStack.at(-1)?.reactType === modal
}

export const useIsWidgetActive = (name: string) => {
  return useIsModalActive(`widget-${name}`)
}

export const useIsSmallWidth = () => {
  return useMedia('(max-width: 550px)')
}

export const usePassesScaledDimensions = (minWidth: number | null = null, minHeight: number | null = null) => {
  const { scale } = useSnapshot(currentScaling)
  const conditions: string[] = []

  if (minWidth !== null) {
    conditions.push(`(min-width: ${minWidth * scale}px)`)
  }
  if (minHeight !== null) {
    conditions.push(`(min-height: ${minHeight * scale}px)`)
  }

  const media = conditions.join(' and ') || 'all'
  return useMedia(media)
}
