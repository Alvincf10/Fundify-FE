// app/api/state/route.ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function GET() {
  try {
    const [poolRes, membersRes, txRes] = await Promise.all([
      fetch(`${API}/pool`, { cache: 'no-store' }),
      fetch(`${API}/members`, { cache: 'no-store' }),
      fetch(`${API}/transactions`, { cache: 'no-store' }),
    ])
    if (!poolRes.ok) throw new Error(`Pool error: ${poolRes.status}`)
    if (!membersRes.ok) throw new Error(`Members error: ${membersRes.status}`)
    if (!txRes.ok) throw new Error(`Transactions error: ${txRes.status}`)

    const poolJson = await poolRes.json()
    const membersRaw = await membersRes.json()
    const txsRaw = await txRes.json()

    const pool =
      typeof poolJson?.pool === 'number'
        ? poolJson.pool
        : typeof poolJson === 'number'
          ? poolJson
          : poolJson?.pool ?? 0

    const members = (membersRaw ?? []).map((m: any) => ({
      id: m._id || m.id,
      name: m.name,
      balance: Number(m.balance) || 0,
    }))

    const transactions = (txsRaw ?? []).map((t: any) => ({
      id: t._id || t.id,
      type: t.type,
      source: t.source,
      amount: Number(t.amount) || 0,
      desc: t.desc,
      date: t.date,
      createdAt: t.createdAt,
    }))

    return NextResponse.json({ pool, members, transactions })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Proxy error' }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Gunakan endpoint spesifik (/members, /transactions, /pool).' },
    { status: 405 }
  )
}