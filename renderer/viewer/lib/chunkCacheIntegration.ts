/**
 * Chunk Geometry Cache Integration
 *
 * This module provides integration between the chunk geometry cache
 * and the world renderer system. It handles:
 * - Computing block hashes for cache keys
 * - Checking cache before requesting geometry from workers
 * - Saving generated geometry to cache
 */

import type { MesherGeometryOutput } from './mesher/shared'

// Store for block state IDs by section for hash computation
const sectionBlockStates = new Map<string, Uint16Array>()

/**
 * Store block state IDs for a section (called when chunk data is loaded)
 */
export function storeSectionBlockStates (
  sectionKey: string,
  blockStateIds: Uint16Array | number[]
): void {
  const data = blockStateIds instanceof Uint16Array
    ? blockStateIds
    : new Uint16Array(blockStateIds)
  sectionBlockStates.set(sectionKey, data)
}

/**
 * Get stored block state IDs for a section
 */
export function getSectionBlockStates (sectionKey: string): Uint16Array | null {
  return sectionBlockStates.get(sectionKey) || null
}

/**
 * Clear block state data for a section
 */
export function clearSectionBlockStates (sectionKey: string): void {
  sectionBlockStates.delete(sectionKey)
}

/**
 * Clear all stored block state data
 */
export function clearAllBlockStates (): void {
  sectionBlockStates.clear()
}

/**
 * Compute a simple hash from block state IDs
 * Uses a fast non-cryptographic hash for performance
 */
export function computeBlockHash (blockStateIds: Uint16Array): string {
  // Use FNV-1a hash for fast hashing
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < blockStateIds.length; i++) {
    hash ^= blockStateIds[i]
    hash = Math.imul(hash, 16777619) // FNV prime
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Generate a simple hash from block state IDs (async version using crypto.subtle)
 * Use this for more secure hashing when persistent storage is used
 */
export async function computeBlockHashAsync (blockStateIds: Uint16Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buffer = await crypto.subtle.digest('SHA-256', blockStateIds.buffer)
      const hashArray = Array.from(new Uint8Array(buffer))
      // Use first 8 bytes for a shorter hash
      return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {
      // Fall back to simple hash
      return computeBlockHash(blockStateIds)
    }
  }
  return computeBlockHash(blockStateIds)
}

/**
 * Check if geometry data is valid and can be cached
 */
export function isGeometryCacheable (geometry: MesherGeometryOutput): boolean {
  // Don't cache empty geometry
  if (!geometry.positions || geometry.positions.length === 0) {
    return false
  }

  // Don't cache geometry with errors
  if (geometry.hadErrors) {
    return false
  }

  return true
}

/**
 * Get section coordinates from section key
 */
export function parseSectionKey (sectionKey: string): { x: number; y: number; z: number } | null {
  const parts = sectionKey.split(',')
  if (parts.length !== 3) return null
  const [x, y, z] = parts.map(Number)
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return null
  return { x, y, z }
}

/**
 * Create a section key from coordinates
 */
export function createSectionKey (x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/**
 * Create a chunk key from coordinates
 */
export function createChunkKey (x: number, z: number): string {
  return `${x},${z}`
}
