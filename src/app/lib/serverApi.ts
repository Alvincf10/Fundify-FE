// src/app/lib/serverApi.ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Aggregated state dari proxy Next.js
export async function fetchState() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

// Transactions
export async function addTransaction(input: {
  type: 'income' | 'expense';
  source: { kind: 'pool' } | { kind: 'personal'; memberId: string };
  amount: number;
  desc: string;
  date: string;
}) {
  const res = await fetch(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTransaction(id: string) {
  const res = await fetch(`${API}/transactions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Pool
export async function setPool(pool: number) {
  const res = await fetch(`${API}/pool`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pool }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Members
export async function updateMember(id: string, patch: { name?: string; balance?: number }) {
  const res = await fetch(`${API}/members/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
