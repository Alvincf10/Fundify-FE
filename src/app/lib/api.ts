// src/app/lib/api.ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function getMembers() {
  const res = await fetch(`${API}/members`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch members')
  return res.json()
}

export async function createMember(input: { name: string; balance?: number }) {
  const res = await fetch(`${API}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to create member')
  return res.json()
}

export async function getTransactions(params?: Record<string, string | number>) {
  const qs = params ? '?' + new URLSearchParams(params as any).toString() : ''
  const res = await fetch(`${API}/transactions${qs}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch transactions')
  return res.json()
}

export async function addTransaction(input: {
  type: 'income' | 'expense'
  source: { kind: 'pool' } | { kind: 'personal'; memberId: string }
  amount: number
  desc: string
  date: string // YYYY-MM-DD
}) {
  const res = await fetch(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to create transaction')
  return res.json()
}

export async function getPool() {
  const res = await fetch(`${API}/pool`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch pool')
  return res.json() // { pool: number }
}

export async function setPool(pool: number) {
  const res = await fetch(`${API}/pool`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pool }),
  })
  if (!res.ok) throw new Error('Failed to set pool')
  return res.json()
}
