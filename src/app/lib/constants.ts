import type { AppState } from './types'

export const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const DEFAULT_STATE: AppState = {
  pool: 1_600_000,
  members: [
    { id: newId(), name: 'Leo', balance: 0 },
    { id: newId(), name: 'wowo', balance: 0 },
    { id: newId(), name: 'Alvin', balance: 800_000 }, // default: yang sudah ambil 800rb
  ],
  transactions: [],
}

export const STORAGE_KEY = 'kas-bareng-tracker:v1'