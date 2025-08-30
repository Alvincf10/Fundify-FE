export const fmtIDR = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

export const todayISO = () => new Date().toISOString().slice(0, 10)