import { loadOrPlaySound, stopAllSounds } from '../basicSounds'
import { options } from '../optionsStorage'

class MusicSystem {
  private currentMusic: string | null = null
  private currentMusicStop: (() => void) | null = null

  async playMusic (url: string, musicVolume = 1) {
    if (!options.enableMusic || this.currentMusic) return

    try {
      const result = await loadOrPlaySound(url, 0.5 * musicVolume, 5000)
      if (!result?.onEnded) return

      this.currentMusic = url

      // Store a reference to stop the music
      this.currentMusicStop = () => {
        this.currentMusic = null
        this.currentMusicStop = null
      }

      result.onEnded(() => {
        this.currentMusic = null
        this.currentMusicStop = null
      })
    } catch (err) {
      console.warn('Failed to play music:', err)
      this.currentMusic = null
      this.currentMusicStop = null
    }
  }

  stopMusic () {
    if (this.currentMusic) {
      console.log('[musicSystem] Stopping current music')
      this.currentMusic = null
      this.currentMusicStop = null
      // Stop all sounds to ensure music stops
      stopAllSounds()
    }
  }
}

export const musicSystem = new MusicSystem()
