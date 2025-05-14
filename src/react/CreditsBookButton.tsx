import { showModal } from '../globalState'
import PixelartIcon, { pixelartIcons } from './PixelartIcon'
import styles from './CreditsBookButton.module.css'

export default () => {
  const handleClick = () => {
    showModal({ reactType: 'credits-about' })
  }

  return (
    <button
      className={styles.creditsButton}
      onClick={handleClick}
      aria-label="Credits"
      title="Credits"
    >
      <PixelartIcon
        iconName={pixelartIcons.loader}
        width={24}
      />
    </button>
  )
}
