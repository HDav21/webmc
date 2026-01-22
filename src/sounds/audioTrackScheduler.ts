import { loadSound, playSound } from '../basicSounds'

interface AudioTrack {
  id: string
  message: string
  timestamp: number // in ms
  url: string
}

class AudioTrackScheduler {
  private tracks: AudioTrack[] = []
  private playedTrackIds = new Set<string>()
  private isPlaying = false
  private currentTimeMs = 0
  private isLoading = false


  async loadTracks (trackData: AudioTrack[]) {
    this.tracks = trackData.sort((a, b) => a.timestamp - b.timestamp)
    this.playedTrackIds.clear()
    this.isLoading = true

    console.log(`[audio-scheduler] Loading ${this.tracks.length} audio tracks...`)

    // Preload all MP3s in parallel
    const loadPromises = this.tracks.map(async (track) => {
      try {
        console.log(`[audio-scheduler] Loading: ${track.id} from ${track.url}`)
        const result = await loadSound(track.url)
        console.log(`[audio-scheduler] Loaded: ${track.id} (${track.timestamp}ms) - result:`, result)
      } catch (err) {
        console.error(`[audio-scheduler] Failed to load ${track.id}:`, err)
      }
    })

    await Promise.all(loadPromises)
    this.isLoading = false
    console.log(`[audio-scheduler] All tracks loaded and ready`)

    // DEBUG: Play each track with a delay to verify audio works
    // console.log(`[audio-scheduler] DEBUG: Playing all tracks for testing...`)
    // for (let i = 0; i < this.tracks.length; i++) {
    //   const track = this.tracks[i]
    //   setTimeout(async () => {
    //     console.log(`[audio-scheduler] DEBUG: Playing track ${i + 1}/${this.tracks.length}: "${track.message}" - URL: ${track.url}`)
    //     try {
    //       const result = await playSound(track.url, 1)
    //       console.log(`[audio-scheduler] DEBUG: playSound returned:`, result)
    //     } catch (err) {
    //       console.error(`[audio-scheduler] DEBUG: Error playing track:`, err)
    //     }
    //   }, i * 2000) // 2 second delay between each track
    // }
  }

  setPlaying (playing: boolean) {
    this.isPlaying = playing
    console.log(`[audio-scheduler] Playing state: ${playing}`)
  }

  updateCurrentTime (timeStr: string) {
    // Convert "HH:MM:SS" to milliseconds
    const parts = timeStr.split(':')
    if (parts.length !== 3) return

    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)
    const seconds = parseInt(parts[2], 10)

    const newTimeMs = (hours * 3600 + minutes * 60 + seconds) * 1000
    const previousTimeMs = this.currentTimeMs
    this.currentTimeMs = newTimeMs

    // Detect seek (jump backwards or large jump forward)
    const timeDiff = newTimeMs - previousTimeMs
    if (timeDiff < 0 || timeDiff > 5000) {
      // Reset played tracks that are now in the future
      this.handleSeek(newTimeMs)
    }

    // Check and play any tracks that should play now
    if (this.isPlaying && !this.isLoading) {
      this.checkAndPlayTracks()
    }
  }

  private handleSeek (newTimeMs: number) {
    // On seek, reset played status for tracks that are now in the future
    // and mark tracks in the past as played (so they don't replay)
    this.playedTrackIds.clear()

    for (const track of this.tracks) {
      if (track.timestamp < newTimeMs) {
        // Track is in the past after seek, mark as played
        this.playedTrackIds.add(track.id)
      }
    }

    console.log(`[audio-scheduler] Seek to ${newTimeMs}ms, reset track states`)
  }

  private checkAndPlayTracks () {
    // Find tracks that should play (within a 1-second window of current time)
    for (const track of this.tracks) {
      if (this.playedTrackIds.has(track.id)) continue

      // Play if we're within 1 second past the timestamp
      const timeSinceTrack = this.currentTimeMs - track.timestamp
      if (timeSinceTrack >= 0 && timeSinceTrack < 1000) {
        this.playTrack(track)
      }
    }
  }

  private playTrack (track: AudioTrack) {
    if (this.playedTrackIds.has(track.id)) return

    this.playedTrackIds.add(track.id)
    console.log(`[audio-scheduler] Playing: "${track.message}" at ${track.timestamp}ms`)

    void playSound(track.url, 1, 'chat')
  }

  clear () {
    this.tracks = []
    this.playedTrackIds.clear()
    this.currentTimeMs = 0
    this.isPlaying = false
    console.log('[audio-scheduler] Cleared all tracks')
  }
}

export const audioTrackScheduler = new AudioTrackScheduler()
