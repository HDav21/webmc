import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { appQueryParams } from '../appParams'
import molttownBg from '../../assets/loading-bg.jpg'

interface Props {
  title: JSX.Element | string
  children: React.ReactNode
  backdrop?: boolean | 'dirt'
  style?: React.CSSProperties
  className?: string
  titleSelectable?: boolean
  titleMarginTop?: number
}

export const loadingPhrases = [
  // Simple & clean
  'Casting lines…',
  'Preparing the catch…',
  'Setting the traps…',
  'Hauling in gear…',
  'Checking the nets…',
  'Scanning the reef…',
  'Sounding the depths…',
  'Docking the boat…',
  'Tying off at the pier…',

  // Playful / personality
  'Crabs are getting ready…',
  'The crew is hauling it in…',
  'Something good is in the net…',
  'Sorting today\'s catch…',
  'The lobsters are plotting…',
  'Untangling the fishing lines…',
  'Sharpening the claws…',
  'Shells in position…',

  // Smooth / subtle
  'Bringing things ashore…',
  'Coming in with the tide…',
  'Preparing your haul…',
  'Charting the waters…',
  'Aligning the currents…',
  'Navigating the coast…',
  'Readying the harbor…',
  'Approaching the dock…',
]


export default ({ title, children, backdrop = true, style, className = '', titleSelectable, titleMarginTop }: Props) => {
  const isMolttown = appQueryParams.molttown === true || appQueryParams.molttown === 'true' as any
  const loadingPhrase = useMemo(() => loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)], [])

  const renderBackdrop = () => {
    if (!backdrop) return null

    if (isMolttown) {
      return createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            zIndex: 10
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10, color: 'white', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', padding: '10px' }}>
            <div>{loadingPhrase}</div>
          </div>
          <img
            src={molttownBg}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center'
            }}
          />
        </div>,
        document.body
      )
    }

    if (backdrop === 'dirt') {
      return <div className='dirt-bg' />
    }

    return <div className="backdrop" />
  }

  return (
    <>
      {renderBackdrop()}
      <div className={`fullscreen ${className}`} style={{ overflow: 'auto', ...style }}>
        <div className="screen-content" style={titleMarginTop === undefined ? {} : { marginTop: titleMarginTop }}>
          <div className={`screen-title ${titleSelectable ? 'text-select' : ''}`}>{title}</div>
          {children}
        </div>
      </div>
    </>
  )
}
