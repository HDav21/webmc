/**
 * Chunk Packet Cache Manager
 *
 * Stores raw map_chunk packet data for server-side chunk caching protocol.
 * This enables bandwidth savings when the server supports the chunk-cache channel
 * by allowing clients to reuse previously received chunk data.
 *
 * Protocol:
 * 1. On login, client sends array of cached chunks {x, z, hash} to server
 * 2. Server responds with:
 *    - {x, z, cacheHit: true} - client should use cached data
 *    - {x, z, hash: "..."} - server will send map_chunk, client should cache it
 * 3. For cache hits, client emits cached map_chunk packet data locally
 */

const DB_NAME = 'minecraft-web-client-chunk-packet-cache'
const DB_VERSION = 1
const STORE_NAME = 'chunk-packets'
const MAX_CACHE_SIZE = 1000 // Store more chunks since packet data is smaller than geometry

export interface CachedChunkPacket {
  chunkKey: string // "x,z"
  hash: string
  packetData: ArrayBuffer // Raw map_chunk packet data
  lastAccessed: number
  serverAddress: string
}

export interface CachedChunkInfo {
  x: number
  z: number
  hash: string
}

class ChunkPacketCache {
  private db: IDBDatabase | null = null
  private readonly memoryCache = new Map<string, CachedChunkPacket>()
  private serverAddress = 'unknown'
  private initPromise: Promise<void> | null = null
  private serverSupportsChannel = false

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
        console.warn('Failed to open chunk packet cache database:', request.error)
        resolve()
      }

      request.onsuccess = () => {
        this.db = request.result
        console.debug('Chunk packet cache database opened successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'chunkKey' })
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          store.createIndex('serverAddress', 'serverAddress', { unique: false })
          console.debug('Chunk packet cache object store created')
        }
      }
    })
  }

  /**
   * Set server address and channel support status
   */
  setServerInfo (serverAddress: string, supportsChannel: boolean): void {
    this.serverAddress = serverAddress
    this.serverSupportsChannel = supportsChannel
    console.debug(`Chunk packet cache: server=${serverAddress}, supportsChannel=${supportsChannel}`)
  }

  /**
   * Get full cache key including server address
   */
  private getCacheKey (x: number, z: number): string {
    return `${this.serverAddress}:${x},${z}`
  }

  /**
   * Compute hash from map_chunk packet data using FNV-1a
   * This hash algorithm should be reproducible in Java for server-side implementation
   */
  computePacketHash (packetData: ArrayBuffer): string {
    const data = new Uint8Array(packetData)
    let hash = 2_166_136_261 // FNV offset basis (32-bit)

    for (const byte of data) {
      hash ^= byte
      hash = Math.imul(hash, 16_777_619) // FNV prime
    }

    // Convert to unsigned 32-bit and then to hex (8 chars)
    return (hash >>> 0).toString(16).padStart(8, '0')
  }

  /**
   * Get all cached chunks for current server (for sending to server on login)
   */
  async getCachedChunksInfo (): Promise<CachedChunkInfo[]> {
    const result: CachedChunkInfo[] = []

    // First check memory cache
    const serverPrefix = `${this.serverAddress}:`
    for (const [key, cached] of this.memoryCache.entries()) {
      if (key.startsWith(serverPrefix)) {
        const [x, z] = cached.chunkKey.split(',').map(Number)
        result.push({ x, z, hash: cached.hash })
      }
    }

    // Then check IndexedDB if available
    if (this.db) {
      try {
        const dbChunks = await this.getChunksFromIndexedDB()
        for (const cached of dbChunks) {
          // Avoid duplicates from memory cache
          const exists = result.some(c => c.x === Number(cached.chunkKey.split(',')[0])
            && c.z === Number(cached.chunkKey.split(',')[1]))
          if (!exists) {
            const [x, z] = cached.chunkKey.split(',').map(Number)
            result.push({ x, z, hash: cached.hash })
          }
        }
      } catch (error) {
        console.warn('Failed to get cached chunks from IndexedDB:', error)
      }
    }

    return result
  }

  private async getChunksFromIndexedDB (): Promise<CachedChunkPacket[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([])
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('serverAddress')
      const request = index.getAll(IDBKeyRange.only(this.serverAddress))

      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cached packet data for a chunk
   */
  async get (x: number, z: number): Promise<{ packetData: ArrayBuffer; hash: string } | null> {
    const cacheKey = this.getCacheKey(x, z)
    const chunkKey = `${x},${z}`

    // Check memory cache first
    const memCached = this.memoryCache.get(cacheKey)
    if (memCached) {
      memCached.lastAccessed = Date.now()
      return { packetData: memCached.packetData, hash: memCached.hash }
    }

    // Check IndexedDB if available
    if (this.db) {
      try {
        const cached = await this.getFromIndexedDB(chunkKey)
        if (cached && cached.serverAddress === this.serverAddress) {
          // Update last accessed and add to memory cache
          cached.lastAccessed = Date.now()
          await this.saveToIndexedDB(cached)
          this.addToMemoryCache(cacheKey, cached)
          return { packetData: cached.packetData, hash: cached.hash }
        }
      } catch (error) {
        console.warn('Failed to get packet from IndexedDB:', error)
      }
    }

    return null
  }

  /**
   * Store packet data in cache
   */
  async set (x: number, z: number, packetData: ArrayBuffer, hash?: string): Promise<void> {
    const cacheKey = this.getCacheKey(x, z)
    const chunkKey = `${x},${z}`
    const computedHash = hash || this.computePacketHash(packetData)

    const cached: CachedChunkPacket = {
      chunkKey,
      hash: computedHash,
      packetData,
      lastAccessed: Date.now(),
      serverAddress: this.serverAddress
    }

    // Always add to memory cache
    this.addToMemoryCache(cacheKey, cached)

    // Persist to IndexedDB if server supports channel
    if (this.serverSupportsChannel && this.db) {
      try {
        await this.saveToIndexedDB(cached)
        await this.evictOldEntries()
      } catch (error) {
        console.warn('Failed to save packet to IndexedDB:', error)
      }
    }
  }

  /**
   * Check if a chunk is cached with the given hash
   */
  async hasValidCache (x: number, z: number, expectedHash: string): Promise<boolean> {
    const cached = await this.get(x, z)
    return cached !== null && cached.hash === expectedHash
  }

  /**
   * Invalidate cache for a specific chunk
   */
  async invalidate (x: number, z: number): Promise<void> {
    const cacheKey = this.getCacheKey(x, z)
    const chunkKey = `${x},${z}`

    this.memoryCache.delete(cacheKey)

    if (this.db) {
      try {
        await this.deleteFromIndexedDB(chunkKey)
      } catch (error) {
        console.warn('Failed to delete packet from IndexedDB:', error)
      }
    }
  }

  /**
   * Clear all cached packets for current server
   */
  async clear (): Promise<void> {
    const serverPrefix = `${this.serverAddress}:`
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(serverPrefix)) {
        this.memoryCache.delete(key)
      }
    }

    if (this.db) {
      try {
        await this.clearIndexedDBForServer()
      } catch (error) {
        console.warn('Failed to clear IndexedDB:', error)
      }
    }
  }

  private addToMemoryCache (key: string, entry: CachedChunkPacket): void {
    this.memoryCache.set(key, entry)

    // Evict oldest entries if cache is full
    if (this.memoryCache.size > MAX_CACHE_SIZE / 2) {
      const entries = [...this.memoryCache.entries()]
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

      const toRemove = Math.floor(entries.length * 0.2)
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0])
      }
    }
  }

  private async getFromIndexedDB (chunkKey: string): Promise<CachedChunkPacket | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null)
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(chunkKey)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  private async saveToIndexedDB (entry: CachedChunkPacket): Promise<void> {
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

  private async deleteFromIndexedDB (chunkKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(chunkKey)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private async clearIndexedDBForServer (): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve()
        return
      }

      const transaction = this.db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('serverAddress')
      const cursorRequest = index.openCursor(IDBKeyRange.only(this.serverAddress))

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }

      cursorRequest.onerror = () => reject(cursorRequest.error)
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

        const index = store.index('lastAccessed')
        const cursorRequest = index.openCursor()
        let deleted = 0
        const toDelete = count - MAX_CACHE_SIZE + Math.floor(MAX_CACHE_SIZE * 0.1)

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
  getStats (): { memorySize: number; supportsChannel: boolean; serverAddress: string } {
    return {
      memorySize: this.memoryCache.size,
      supportsChannel: this.serverSupportsChannel,
      serverAddress: this.serverAddress
    }
  }
}

// Singleton instance
export const chunkPacketCache = new ChunkPacketCache()

export { ChunkPacketCache }
