'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Member, Tx, TxType, Source } from '../lib/types'
import { DEFAULT_STATE, newId } from '../lib/constants'
import { fmtIDR, todayISO } from '../lib/format'
import { loadState, saveState } from '../lib/storage'
import {
  fetchState,
  addTransaction as apiAddTx,
  deleteTransaction as apiDelTx,
  setPool as apiSetPool,
  updateMember as apiUpdateMember,
} from '../lib/serverApi'

// helper narrowing aman untuk memberId
type Personal = Extract<Source, { kind: 'personal' }>
const isPersonalSource = (s: Source): s is Personal => s.kind === 'personal'

export default function Tracker() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE)
  const [editing, setEditing] = useState(false)

  // Hydrate dari backend; fallback ke localStorage kalau error
  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const remote = await fetchState()
        if (!canceled) setState(remote)
      } catch {
        const local = loadState()
        if (!canceled && local) setState(local)
      }
    })()
    return () => { canceled = true }
  }, [])

  // Cache lokal untuk offline
  useEffect(() => { saveState(state) }, [state])

  const totalPersonal = useMemo(
    () => state.members.reduce((acc, m) => acc + (Number(m.balance) || 0), 0),
    [state.members]
  )
  const grandTotal = useMemo(() => state.pool + totalPersonal, [state.pool, totalPersonal])

  // Form transaksi
  const [txType, setTxType] = useState<TxType>('expense')
  const [sourceKind, setSourceKind] = useState<string>('pool') // 'pool' | memberId
  const [amount, setAmount] = useState<number>(0)
  const [desc, setDesc] = useState<string>('')
  const [date, setDate] = useState<string>(todayISO())

  const currentSourceBalance = useMemo(() => {
    if (sourceKind === 'pool') return state.pool
    const m = state.members.find((x) => x.id === sourceKind)
    return m ? m.balance : 0
  }, [sourceKind, state])

  const sourceOptions = [
    { value: 'pool', label: 'Kas Bersama' },
    ...state.members.map((m) => ({ value: m.id, label: `Dompet ${m.name}` })),
  ]

  function resetTxForm() {
    setTxType('expense'); setSourceKind('pool'); setAmount(0); setDesc(''); setDate(todayISO())
  }

  // === ADD TRANSACTION (optimistic + sync server) ===
  async function addTx() {
    const amt = Math.floor(Number(amount) || 0)
    if (!amt || amt <= 0) return alert('Nominal harus > 0')

    const optimisticTx: Tx = {
      id: newId(), // sementara, nanti diganti _id dari server
      type: txType,
      source: sourceKind === 'pool' ? { kind: 'pool' } : { kind: 'personal', memberId: sourceKind },
      amount: amt,
      desc,
      date,
      createdAt: new Date().toISOString(),
    }

    const prevSnapshot = state

    // optimistic update
    setState((prev) => {
      let pool = prev.pool
      const members: Member[] = prev.members.map((m) => ({ ...m }))
      const src = optimisticTx.source

      if (optimisticTx.type === 'expense') {
        if (src.kind === 'pool') {
          if (pool < amt) { alert('Saldo kas tidak cukup.'); return prev }
          pool -= amt
        } else if (src.kind === 'personal') {
          const idx = members.findIndex((m) => m.id === src.memberId)
          if (idx >= 0) {
            if (members[idx].balance < amt) { alert(`Saldo ${members[idx].name} tidak cukup.`); return prev }
            members[idx].balance -= amt
          }
        }
      } else {
        if (src.kind === 'pool') {
          pool += amt
        } else if (src.kind === 'personal') {
          const idx = members.findIndex((m) => m.id === src.memberId)
          if (idx >= 0) members[idx].balance += amt
        }
      }

      const transactions = [optimisticTx, ...prev.transactions]
      return { ...prev, pool, members, transactions }
    })

    resetTxForm()

    // sync ke server
    try {
      const created = await apiAddTx({
        type: optimisticTx.type,
        source: optimisticTx.source,
        amount: optimisticTx.amount,
        desc: optimisticTx.desc,
        date: optimisticTx.date,
      })
      const serverId = created._id || created.id
      if (serverId) {
        setState((s) => ({
          ...s,
          transactions: s.transactions.map((t) => t.id === optimisticTx.id ? { ...t, id: serverId } : t),
        }))
      }
    } catch (e: any) {
      alert(`Gagal simpan transaksi: ${e?.message || e}`)
      setState(prevSnapshot) // rollback
    }
  }

  // === DELETE TRANSACTION (optimistic + sync server) ===
  async function deleteTx(txId: string) {
    const tx = state.transactions.find((t) => t.id === txId)
    if (!tx) return

    const prevSnapshot = state

    setState((prev) => {
      let pool = prev.pool
      const members = prev.members.map((m) => ({ ...m }))
      const amt = tx.amount
      const src = tx.source

      if (tx.type === 'expense') {
        if (src.kind === 'pool') pool += amt
        else if (src.kind === 'personal') {
          const idx = members.findIndex((m) => m.id === src.memberId)
          if (idx >= 0) members[idx].balance += amt
        }
      } else {
        if (src.kind === 'pool') pool -= amt
        else if (src.kind === 'personal') {
          const idx = members.findIndex((m) => m.id === src.memberId)
          if (idx >= 0) members[idx].balance -= amt
        }
      }

      const transactions = prev.transactions.filter((t) => t.id !== txId)
      return { ...prev, pool, members, transactions }
    })

    try {
      await apiDelTx(txId)
    } catch (e: any) {
      alert(`Gagal hapus transaksi: ${e?.message || e}`)
      setState(prevSnapshot) // rollback
    }
  }

  // === UPDATE POOL (debounced PATCH) ===
  const poolSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function updatePool(val: number | string) {
    const v = Math.max(0, Math.floor(Number(val) || 0))
    setState((prev) => ({ ...prev, pool: v }))

    if (poolSaveTimer.current) clearTimeout(poolSaveTimer.current)
    poolSaveTimer.current = setTimeout(async () => {
      try { await apiSetPool(v) } catch (e: any) { console.error('setPool error', e) }
    }, 500)
  }

  // === UPDATE MEMBER (debounced PATCH) ===
  const memberSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  function scheduleSaveMember(id: string, patch: { name?: string; balance?: number }) {
    const existing = memberSaveTimers.current[id]
    if (existing) clearTimeout(existing)
    memberSaveTimers.current[id] = setTimeout(async () => {
      try { await apiUpdateMember(id, patch) } catch (e: any) { console.error('updateMember error', e) }
    }, 500)
  }

  function updateMemberName(id: string, name: string) {
    setState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, name } : m)) }))
    scheduleSaveMember(id, { name })
  }

  function updateMemberBalance(id: string, balance: number | string) {
    const val = Math.max(0, Math.floor(Number(balance) || 0))
    setState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, balance: val } : m)) }))
    scheduleSaveMember(id, { balance: val })
  }

  // Quick action
  function addTermin(amount = 4_000_000) {
    setTxType('income'); setSourceKind('pool'); setAmount(amount); setDesc('Termin cair ke Kas'); setDate(todayISO())
  }

  // sorted & filtered
  const sortedTx = useMemo(() => {
    return [...state.transactions].sort((a, b) => {
      const d = b.date.localeCompare(a.date)
      if (d !== 0) return d
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
  }, [state.transactions])

  const [activeTab, setActiveTab] = useState<string>('all')
  const tabs = [
    { id: 'all', label: 'Semua' },
    { id: 'pool', label: 'Kas Bersama' },
    ...state.members.map((m) => ({ id: m.id, label: m.name })),
  ]

  const filteredTx = useMemo(() => {
    if (activeTab === 'all') return sortedTx
    if (activeTab === 'pool') return sortedTx.filter((t) => t.source.kind === 'pool')
    return sortedTx.filter((t) => isPersonalSource(t.source) && t.source.memberId === activeTab)
  }, [activeTab, sortedTx])

  // Reset UI (local only)
  function resetTxFormOnly() { resetTxForm() }
  function resetAll() {
    if (!confirm('Reset semua data di tampilan ke default? (Tidak mengubah data di server)')) return
    setState(DEFAULT_STATE)
    resetTxForm()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Kas Bareng – L / P / A</h1>
        <div className="flex gap-2">
          <button onClick={() => setEditing((v) => !v)} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm">
            {editing ? 'Selesai' : 'Edit Setup'}
          </button>
          <button onClick={() => addTermin()} className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm">Termin Cair +4jt</button>
          <button onClick={resetAll} className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm">Reset</button>
        </div>
      </header>

      {/* Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 rounded-2xl p-4 shadow">
          <div className="text-slate-400 text-sm">Kas Bersama</div>
          <div className="text-2xl font-bold">{fmtIDR(state.pool)}</div>
        </div>
        {state.members.map((m) => (
          <div key={m.id} className="bg-slate-900 rounded-2xl p-4 shadow">
            <div className="text-slate-400 text-sm">Dompet {m.name}</div>
            <div className="text-2xl font-bold">{fmtIDR(m.balance)}</div>
          </div>
        ))}
        <div className="bg-slate-900 rounded-2xl p-4 shadow sm:col-span-4">
          <div className="text-slate-400 text-sm">Total (Kas + Semua Dompet)</div>
          <div className="text-xl font-semibold">{fmtIDR(grandTotal)}</div>
        </div>
      </section>

      {/* Setup */}
      {editing && (
        <section className="bg-slate-900 rounded-2xl p-4 shadow space-y-4">
          <h2 className="text-lg font-semibold">Setup Awal</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Kas Bersama</label>
              <input type="number" value={state.pool} onChange={(e) => updatePool(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-slate-300 font-medium">Anggota & Saldo Awal</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {state.members.map((m) => (
                <div key={m.id} className="bg-slate-800 rounded-xl p-3 space-y-2">
                  <input value={m.name} onChange={(e) => updateMemberName(m.id, e.target.value)} className="w-full bg-slate-700 rounded-lg px-2 py-1 outline-none" />
                  <div className="text-xs text-slate-400">Saldo Dompet {m.name}</div>
                  <input type="number" value={m.balance} onChange={(e) => updateMemberBalance(m.id, e.target.value)} className="w-full bg-slate-700 rounded-lg px-2 py-1 outline-none" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Form transaksi */}
      <section className="bg-slate-900 rounded-2xl p-4 shadow space-y-4">
        <h2 className="text-lg font-semibold">Tambah Transaksi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-sm text-slate-300 mb-1">Tipe</label>
            <select value={txType} onChange={(e) => setTxType(e.target.value as TxType)} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none">
              <option value="expense">Pengeluaran (−)</option>
              <option value="income">Pemasukan (+)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Sumber / Tujuan</label>
            <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none">
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="text-xs text-slate-400 mt-1">Saldo saat ini: <span className="font-semibold">{fmtIDR(currentSourceBalance)}</span></div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Nominal</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none" placeholder="cth: 150000" />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-sm text-slate-300 mb-1">Deskripsi</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none" placeholder="cth: makan bareng, transport, dll" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-800 rounded-xl px-3 py-2 outline-none" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={addTx} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-medium">Simpan</button>
          <button onClick={resetTxFormOnly} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700">Clear</button>
        </div>
      </section>

      {/* Riwayat */}
      <section className="bg-slate-900 rounded-2xl p-4 shadow">
        <h2 className="text-lg font-semibold mb-3">Riwayat Transaksi</h2>

        <div className="flex gap-2 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-lg text-sm ${
                activeTab === tab.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredTx.length === 0 ? (
          <div className="text-slate-400 text-sm">Belum ada transaksi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-800">
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Tipe</th>
                  <th className="py-2 pr-3">Sumber/Tujuan</th>
                  <th className="py-2 pr-3">Deskripsi</th>
                  <th className="py-2 pr-3">Nominal</th>
                  <th className="py-2 pr-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((t) => {
                  const src = t.source
                  let sourceLabel = 'Kas Bersama'
                  if (src.kind === 'personal') {
                    const member = state.members.find((m) => m.id === src.memberId)
                    sourceLabel = `Dompet ${member?.name ?? '?'}`
                  }
                  return (
                    <tr key={t.id} className="border-b border-slate-800 hover:bg-slate-800/60">
                      <td className="py-2 pr-3 align-top whitespace-nowrap">{t.date}</td>
                      <td className="py-2 pr-3 align-top">
                        <span className={'px-2 py-1 rounded-lg text-xs font-semibold ' + (t.type === 'expense' ? 'bg-red-900/60 text-red-200' : 'bg-emerald-900/60 text-emerald-200')}>
                          {t.type === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 align-top">{sourceLabel}</td>
                      <td className="py-2 pr-3 align-top">{t.desc || '-'}</td>
                      <td className="py-2 pr-3 align-top font-medium">{t.type === 'expense' ? '-' : '+'} {fmtIDR(t.amount)}</td>
                      <td className="py-2 pr-3 align-top">
                        <button onClick={() => deleteTx(t.id)} className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Hapus</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tips */}
      <section className="text-xs text-slate-400">
        <ul className="list-disc pl-5 space-y-1">
          <li>Data otomatis disimpan di server (Mongo) + cache di browser (localStorage).</li>
          <li>Gunakan tab untuk melihat riwayat per sumber.</li>
        </ul>
      </section>
    </div>
  )
}