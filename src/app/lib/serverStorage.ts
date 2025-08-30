// lib/serverStorage.ts
import { AppState } from './types'

export async function fetchServerState(): Promise<AppState | null> {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as AppState
  } catch {
    return null
  }
}

export async function saveServerState(state: AppState): Promise<boolean> {
  try {
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    return res.ok
  } catch {
    return false
  }
}