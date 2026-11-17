// Le record (gardé sur l'appareil) et le classement en ligne (l'API du site apphero.cloud).

export type Entry = { name: string; score: number; wave: number }
export type Record = { score: number; wave: number }

const RECORD = 'jetflight-record'
const NAME = 'jetflight-nom'
const API = '/api/jet/scores'

export function readRecord(): Record {
  try {
    const r = JSON.parse(localStorage.getItem(RECORD) || 'null')
    if (r && typeof r.score === 'number') return { score: r.score, wave: r.wave | 0 }
  } catch { /* stockage indisponible */ }
  return { score: 0, wave: 0 }
}
/** keeps the score if it beats the record; says whether it did */
export function saveRecord(score: number, wave: number) {
  const old = readRecord()
  if (score <= old.score) return false
  try { localStorage.setItem(RECORD, JSON.stringify({ score, wave })) } catch { /* stockage indisponible */ }
  return true
}

export function readName() {
  try { return (localStorage.getItem(NAME) || '').slice(0, 3) } catch { return '' }
}
export const cleanName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)

export async function fetchTop(): Promise<Entry[] | null> {
  try {
    const r = await fetch(API, { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json()
    return Array.isArray(j.scores) ? j.scores : null
  } catch {
    return null
  }
}

export async function sendScore(name: string, score: number, wave: number): Promise<{ ok: boolean; rank?: number; scores?: Entry[]; error?: string }> {
  try { localStorage.setItem(NAME, name) } catch { /* stockage indisponible */ }
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, score, wave }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j.error || 'Le classement ne répond pas.' }
    return { ok: true, rank: j.rank, scores: j.scores }
  } catch {
    return { ok: false, error: 'Pas de connexion au classement.' }
  }
}
