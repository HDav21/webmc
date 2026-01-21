/**
 * Chunk Geometry Cache Manager
 *
 * Provides long-term caching of chunk geometry to improve performance when revisiting areas.
 * - For servers that register chunk-cache channel: uses IndexedDB for persistent storage
 * - Otherwise: uses in-memory caching with hash comparison for quick access
 */

import type { MesherGeometryOutput } from '../renderer/viewer/lib/mesher/shared'

const DB_NAME = 'minecraft-web-client-chunk-cache'
const DB_VERSION = 1
const STORE_NAME = 'chunk-geometry'
const MAX_CACHE_SIZE = 500 // Maximum number of cached sections
const MAX_MEMORY_CACHE_SIZE = 100 // Maximum number of in-memory cached sections

export interface CachedGeometry {
  sectionKey: string           // "16,32,16"
  chunkKey: string             // "16,16"
  blockHash: string            // Hash of block state IDs
  geometry: SerializedGeometry
  lastAccessed: number         // Timestamp for LRU eviction
  serverAddress?: string       // Server identifier for scoping
}

// Serializable version of MesherGeometryOutput
export interface SerializedGeometry {
  sx: number
  sy: number
  sz: number
  positions: number[]
  normals: number[]
  colors: number[]
  uvs: number[]
  t_positions?: number[]
  t_normals?: number[]
  t_colors?: number[]
  t_uvs?: number[]
  indices: number[]
  indicesCount: number
  using32Array: boolean
  tiles: Record<string, any>
  heads: Record<string, any>
  signs: Record<string, any>
  banners: Record<string, any>
  hadErrors: boolean
  blocksCount: number
  customBlockModels?: Record<string, string>
}

class ChunkGeometryCache {
  private db: IDBDatabase | null = null
  private memoryCache = new Map<string, CachedGeometry>()
  private serverSupportsChannel = false
  private serverAddress: string | undefined
  private initPromise: Promise<void> | null = null

  /**
   * Initialize the cache system
   */
  async init (): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.openDatabase()
    return this.initPromise
  }

  private async openDatabase (): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.warn('Failed to open chunk cache database:', request.error)
        // Fall back to memory-only cache
        resolve()
      }

      request.onsuccess = () => {
        this.db = request.result
        console.debug('Chunk cache database opened successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'sectionKey' })
          store.createIndex('chunkKey', 'chunkKey', { unique: false })
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          store.createIndex('serverAddress', 'serverAddress', { unique: false })
          console.debug('Chunk cache object store created')
        }
      }
    })
  }

  /**
   * Set whether the server supports the chunk-cache channel
   */
  setServerSupportsChannel (supports: boolean, serverAddress?: string): void {
    this.serverSupportsChannel = supports
    this.serverAddress = serverAddress
    console.debug(`Server ${supports ? 'supports' : 'does not support'} chunk-cache channel`)
  }

  /**
   * Generate a hash for chunk block data
   */
  async generateBlockHash (blockStateIds: Uint16Array | number[]): Promise<string> {
    const data = blockStateIds instanceof Uint16Array
      ? blockStateIds
      : new Uint16Array(blockStateIds)

    const buffer = await crypto.subtle.digest('SHA-256', data.buffer)
    const hashArray = Array.from(new Uint8Array(buffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Create a cache key from section coordinates
   */
  private getCacheKey (x: number, y: number, z: number): string {
    return `${this.serverAddress || 'local'}:${x},${y},${z}`
  }

  /**
   * Serialize geometry for storage
   */
  private serializeGeometry (geometry: MesherGeometryOutput): SerializedGeometry {
    return {
      sx: geometry.sx,
      sy: geometry.sy,
      sz: geometry.sz,
      positions: Array.from(geometry.positions),
      normals: Array.from(geometry.normals),
      colors: Array.from(geometry.colors),
      uvs: Array.from(geometry.uvs),
      t_positions: geometry.t_positions,
      t_normals: geometry.t_normals,
      t_colors: geometry.t_colors,
      t_uvs: geometry.t_uvs,
      indices: Array.from(geometry.indices),
      indicesCount: geometry.indicesCount,
      using32Array: geometry.using32Array,
      tiles: geometry.tiles,
      heads: geometry.heads,
      signs: geometry.signs,
      banners: geometry.banners,
      hadErrors: geometry.hadErrors,
      blocksCount: geometry.blocksCount,
      customBlockModels: geometry.customBlockModels
    }
  }

  /**
   * Deserialize geometry from storage
   */
  deserializeGeometry (serialized: SerializedGeometry): MesherGeometryOutput {
    return {
      sx: serialized.sx,
      sy: serialized.sy,
      sz: serialized.sz,
      positions: new Float32Array(serialized.positions),
      normals: new Float32Array(serialized.normals),
      colors: new Float32Array(serialized.colors),
      uvs: new Float32Array(serialized.uvs),
      t_positions: serialized.t_positions,
      t_normals: serialized.t_normals,
      t_colors: serialized.t_colors,
      t_uvs: serialized.t_uvs,
      indices: serialized.using32Array
        ? new Uint32Array(serialized.indices)
        : new Uint16Array(serialized.indices),
      indicesCount: serialized.indicesCount,
      using32Array: serialized.using32Array,
      tiles: serialized.tiles,
      heads: serialized.heads,
      signs: serialized.signs,
      banners: serialized.banners,
      hadErrors: serialized.hadErrors,
      blocksCount: serialized.blocksCount,
      customBlockModels: serialized.customBlockModels
    }
  }

  /**
   * Get cached geometry by section key and block hash
   */
  async get (x: number, y: number, z: number, blockHash: string): Promise<MesherGeometryOutput | null> {
    const cacheKey = this.getCacheKey(x, y, z)
    const sectionKey = `${x},${y},${z}`

    // Check memory cache first
    const memCached = this.memoryCache.get(cacheKey)
    if (memCached && memCached.blockHash === blockHash) {
      memCached.lastAccessed = Date.now()
      return this.deserializeGeometry(memCached.geometry)
    }

    // For servers with channel support, check IndexedDB
    if (this.serverSupportsChannel && this.db) {
      try {
        const cached = await this.getFromIndexedDB(sectionKey)
        if (cached && cached.blockHash === blockHash) {
          // Update last accessed time
          cached.lastAccessed = Date.now()
          await this.saveToIndexedDB(cached)

          // Also cache in memory for faster access
          this.addToMemoryCache(cacheKey, cached)

          return this.deserializeGeometry(cached.geometry)
        }
      } catch (error) {
        console.warn('Failed to get geometry from IndexedDB:', error)
      }
    }

    return null
  }

  /**
   * Store geometry in cache
   */
  async set (
    x: number,
    y: number,
    z: number,
    blockHash: string,
    geometry: MesherGeometryOutput
  ): Promise<void> {
    const cacheKey = this.getCacheKey(x, y, z)
    const sectionKey = `${x},${y},${z}`
    const chunkKey = `${x},${z}`

    const cachedGeometry: CachedGeometry = {
      sectionKey,
      chunkKey,
      blockHash,
      geometry: this.serializeGeometry(geometry),
      lastAccessed: Date.now(),
      serverAddress: this.serverAddress
    }

    // Always add to memory cache
    this.addToMemoryCache(cacheKey, cachedGeometry)

    // For servers with channel support, also persist to IndexedDB
    if (this.serverSupportsChannel && this.db) {
      try {
        await this.saveToIndexedDB(cachedGeometry)
        await this.evictOldEntries()
      } catch (error) {
        console.warn('Failed to save geometry to IndexedDB:', error)
      }
    }
  }

  /**
   * Invalidate cache for a specific section
   */
  async invalidate (x: number, y: number, z: number): Promise<void> {
    const cacheKey = this.getCacheKey(x, y, z)
    const sectionKey = `${x},${y},${z}`

    // Remove from memory cache
    this.memoryCache.delete(cacheKey)

    // Remove from IndexedDB if available
    if (this.serverSupportsChannel && this.db) {
      try {
        await this.deleteFromIndexedDB(sectionKey)
      } catch (error) {
        console.warn('Failed to delete geometry from IndexedDB:', error)
      }
    }
  }

  /**
   * Clear all cached geometry for the current server
   */
  async clear (): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear()

    // Clear IndexedDB entries for current server
    if (this.db) {
      try {
        await this.clearIndexedDB()
      } catch (error) {
        console.warn('Failed to clear IndexedDB:', error)
      }
    }
  }

  /**
   * Add entry to memory cache with LRU eviction
   */
  private addToMemoryCache (key: string, entry: CachedGeometry): void {
    this.memoryCache.set(key, entry)

    // Evict oldest entries if cache is full
    if (this.memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
      const entries = Array.from(this.memoryCache.entries())
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

      // Remove oldest 20% of entries
      const toRemove = Math.floor(MAX_MEMORY_CACHE_SIZE * 0.2)
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.memoryCache.delete(entries[i][0])
      }
    }
  }

  private getFromIndexedDB (sectionKey: string): Promise<CachedGeometry | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null)
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(sectionKey)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  private saveToIndexedDB (entry: CachedGeometry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(entry)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private deleteFromIndexedDB (sectionKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(sectionKey)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private clearIndexedDB (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private async evictOldEntries (): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const countRequest = store.count()

      countRequest.onsuccess = () => {
        const count = countRequest.result
        if (count <= MAX_CACHE_SIZE) {
          resolve()
          return
        }

        // Get all entries sorted by lastAccessed
        const index = store.index('lastAccessed')
        const cursorRequest = index.openCursor()
        let deleted = 0
        const toDelete = count - MAX_CACHE_SIZE + Math.floor(MAX_CACHE_SIZE * 0.1) // Remove extra 10%

        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor && deleted < toDelete) {
            cursor.delete()
            deleted++
            cursor.continue()
          } else {
            resolve()
          }
        }

        cursorRequest.onerror = () => reject(cursorRequest.error)
      }

      countRequest.onerror = () => reject(countRequest.error)
    })
  }

  /**
   * Get cache statistics
   */
  getStats (): { memorySize: number; supportsChannel: boolean } {
    return {
      memorySize: this.memoryCache.size,
      supportsChannel: this.serverSupportsChannel
    }
  }
}

// Singleton instance
export const chunkGeometryCache = new ChunkGeometryCache()

// Export for testing
export { ChunkGeometryCache }
