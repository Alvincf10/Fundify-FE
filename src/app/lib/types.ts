// src/app/lib/types.ts (atau path types kamu)

// Sumber transaksi
export type PoolSource = { kind: 'pool' };
export type PersonalSource = { kind: 'personal'; memberId: string };

// Union yang benar
export type Source = PoolSource | PersonalSource;

export type TxType = 'income' | 'expense';

export interface Tx {
  id: string;
  type: TxType;
  source: Source;
  amount: number;
  desc: string;
  date: string;
  createdAt?: string;
}

export interface Member {
  id: string;
  name: string;
  balance: number;
}

export interface AppState {
  pool: number;
  members: Member[];
  transactions: Tx[];
}