import { STORAGE_KEY } from './constants'
import type { AppState } from './types'

export function loadState(): AppState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppState
  } catch (e) {
    console.warn('loadState error', e)
    return null
  }
}

export function saveState(state: AppState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('saveState error', e)
  }
}