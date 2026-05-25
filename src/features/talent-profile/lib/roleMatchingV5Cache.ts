/**
 * Sistema di Cache per Role Matching V5
 * 
 * Implementa memoizzazione LRU per ottimizzare calcoli ripetuti:
 * - Cache per singolo ruolo (calculateRoleMatchingV5)
 * - Cache per tutti i ruoli (calculateAllRolesCompatibilityV5)
 * - Invalidazione automatica per profili modificati
 */

import {
  calculateRoleMatchingV5,
  calculateAllRolesCompatibilityV5,
  RoleMatchResultV5,
  AllRolesCompatibilityV5,
} from './roleMatchingV5';
import { TraitScores } from './syndromes';

// ============================================
// CONFIGURAZIONE CACHE
// ============================================

const CACHE_CONFIG = {
  /** Numero massimo di entry per la cache singolo ruolo */
  MAX_SINGLE_ROLE_ENTRIES: 500,
  /** Numero massimo di entry per la cache tutti i ruoli */
  MAX_ALL_ROLES_ENTRIES: 200,
  /** TTL in millisecondi (5 minuti) */
  TTL_MS: 5 * 60 * 1000,
} as const;

// ============================================
// TIPI INTERNI
// ============================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

interface CacheStats {
  singleRoleHits: number;
  singleRoleMisses: number;
  allRolesHits: number;
  allRolesMisses: number;
  evictions: number;
}

// ============================================
// GENERAZIONE CHIAVE CACHE
// ============================================

/**
 * Genera una chiave hash stabile per i tratti
 * Usa solo i valori numerici ordinati per consistenza
 */
function generateTraitsKey(traits: TraitScores): string {
  const orderedKeys = Object.keys(traits).sort() as (keyof TraitScores)[];
  return orderedKeys.map(k => `${k}:${traits[k]}`).join('|');
}

/**
 * Genera chiave cache per singolo ruolo
 */
function generateSingleRoleCacheKey(
  ruolo: string,
  traits: TraitScores,
  candidateAge?: number
): string {
  const traitsKey = generateTraitsKey(traits);
  return `${ruolo}::${traitsKey}::${candidateAge ?? 'na'}`;
}

/**
 * Genera chiave cache per tutti i ruoli
 */
function generateAllRolesCacheKey(
  ruoloRichiesto: string,
  traits: TraitScores,
  candidateAge?: number
): string {
  const traitsKey = generateTraitsKey(traits);
  return `all::${ruoloRichiesto}::${traitsKey}::${candidateAge ?? 'na'}`;
}

// ============================================
// CACHE CLASS
// ============================================

class RoleMatchingCache {
  private singleRoleCache = new Map<string, CacheEntry<RoleMatchResultV5>>();
  private allRolesCache = new Map<string, CacheEntry<AllRolesCompatibilityV5>>();
  private stats: CacheStats = {
    singleRoleHits: 0,
    singleRoleMisses: 0,
    allRolesHits: 0,
    allRolesMisses: 0,
    evictions: 0,
  };

  /**
   * Verifica se un'entry è ancora valida (non scaduta)
   */
  private isValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_CONFIG.TTL_MS;
  }

  /**
   * Evict entry meno usate quando la cache è piena (LRU-like)
   */
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, maxSize: number): void {
    if (cache.size < maxSize) return;

    // Trova e rimuovi le entry con meno hits e più vecchie
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => {
      // Prima per hits (meno hits = da rimuovere)
      if (a[1].hits !== b[1].hits) return a[1].hits - b[1].hits;
      // Poi per timestamp (più vecchio = da rimuovere)
      return a[1].timestamp - b[1].timestamp;
    });

    // Rimuovi il 20% delle entry
    const toRemove = Math.ceil(maxSize * 0.2);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      cache.delete(entries[i][0]);
      this.stats.evictions++;
    }
  }

  /**
   * Calcolo singolo ruolo con cache
   */
  getSingleRole(
    ruolo: string,
    traits: TraitScores,
    candidateAge?: number
  ): RoleMatchResultV5 {
    const key = generateSingleRoleCacheKey(ruolo, traits, candidateAge);
    const cached = this.singleRoleCache.get(key);

    if (this.isValid(cached)) {
      cached.hits++;
      this.stats.singleRoleHits++;
      return cached.value;
    }

    // Cache miss - calcola
    this.stats.singleRoleMisses++;
    this.evictIfNeeded(this.singleRoleCache, CACHE_CONFIG.MAX_SINGLE_ROLE_ENTRIES);

    const result = calculateRoleMatchingV5(ruolo, traits, candidateAge);
    this.singleRoleCache.set(key, {
      value: result,
      timestamp: Date.now(),
      hits: 1,
    });

    return result;
  }

  /**
   * Calcolo tutti i ruoli con cache
   */
  getAllRoles(
    ruoloRichiesto: string,
    traits: TraitScores,
    candidateAge?: number
  ): AllRolesCompatibilityV5 {
    const key = generateAllRolesCacheKey(ruoloRichiesto, traits, candidateAge);
    const cached = this.allRolesCache.get(key);

    if (this.isValid(cached)) {
      cached.hits++;
      this.stats.allRolesHits++;
      return cached.value;
    }

    // Cache miss - calcola
    this.stats.allRolesMisses++;
    this.evictIfNeeded(this.allRolesCache, CACHE_CONFIG.MAX_ALL_ROLES_ENTRIES);

    const result = calculateAllRolesCompatibilityV5(ruoloRichiesto, traits, candidateAge);
    this.allRolesCache.set(key, {
      value: result,
      timestamp: Date.now(),
      hits: 1,
    });

    return result;
  }

  /**
   * Invalida cache per un candidato specifico (quando i tratti cambiano)
   */
  invalidateForTraits(traits: TraitScores): void {
    const traitsKey = generateTraitsKey(traits);
    
    // Rimuovi tutte le entry che contengono questi tratti
    for (const key of this.singleRoleCache.keys()) {
      if (key.includes(traitsKey)) {
        this.singleRoleCache.delete(key);
      }
    }
    
    for (const key of this.allRolesCache.keys()) {
      if (key.includes(traitsKey)) {
        this.allRolesCache.delete(key);
      }
    }
  }

  /**
   * Pulisce tutta la cache
   */
  clear(): void {
    this.singleRoleCache.clear();
    this.allRolesCache.clear();
  }

  /**
   * Restituisce statistiche cache
   */
  getStats(): CacheStats & { 
    singleRoleSize: number; 
    allRolesSize: number;
    hitRateSingleRole: string;
    hitRateAllRoles: string;
  } {
    const singleTotal = this.stats.singleRoleHits + this.stats.singleRoleMisses;
    const allTotal = this.stats.allRolesHits + this.stats.allRolesMisses;
    
    return {
      ...this.stats,
      singleRoleSize: this.singleRoleCache.size,
      allRolesSize: this.allRolesCache.size,
      hitRateSingleRole: singleTotal > 0 
        ? `${((this.stats.singleRoleHits / singleTotal) * 100).toFixed(1)}%` 
        : 'N/A',
      hitRateAllRoles: allTotal > 0 
        ? `${((this.stats.allRolesHits / allTotal) * 100).toFixed(1)}%` 
        : 'N/A',
    };
  }

  /**
   * Pulisce entry scadute (garbage collection manuale)
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.singleRoleCache.entries()) {
      if (now - entry.timestamp >= CACHE_CONFIG.TTL_MS) {
        this.singleRoleCache.delete(key);
        removed++;
      }
    }

    for (const [key, entry] of this.allRolesCache.entries()) {
      if (now - entry.timestamp >= CACHE_CONFIG.TTL_MS) {
        this.allRolesCache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const roleMatchingCache = new RoleMatchingCache();

// ============================================
// FUNZIONI WRAPPER CACHED
// ============================================

/**
 * Versione cached di calculateRoleMatchingV5
 */
export function calculateRoleMatchingV5Cached(
  ruolo: string,
  traits: TraitScores,
  candidateAge?: number
): RoleMatchResultV5 {
  return roleMatchingCache.getSingleRole(ruolo, traits, candidateAge);
}

/**
 * Versione cached di calculateAllRolesCompatibilityV5
 */
export function calculateAllRolesCompatibilityV5Cached(
  ruoloRichiesto: string,
  traits: TraitScores,
  candidateAge?: number
): AllRolesCompatibilityV5 {
  return roleMatchingCache.getAllRoles(ruoloRichiesto, traits, candidateAge);
}

// ============================================
// HOOK PER REACT
// ============================================

import { useMemo } from 'react';

/**
 * Hook React per calcolo role matching con cache automatica
 */
export function useCachedRoleMatching(
  ruolo: string,
  traits: TraitScores | null | undefined,
  candidateAge?: number
): RoleMatchResultV5 | null {
  return useMemo(() => {
    if (!traits) return null;
    return calculateRoleMatchingV5Cached(ruolo, traits, candidateAge);
  }, [ruolo, traits, candidateAge]);
}

/**
 * Hook React per calcolo tutti i ruoli con cache automatica
 */
export function useCachedAllRolesCompatibility(
  ruoloRichiesto: string,
  traits: TraitScores | null | undefined,
  candidateAge?: number
): AllRolesCompatibilityV5 | null {
  return useMemo(() => {
    if (!traits) return null;
    return calculateAllRolesCompatibilityV5Cached(ruoloRichiesto, traits, candidateAge);
  }, [ruoloRichiesto, traits, candidateAge]);
}
