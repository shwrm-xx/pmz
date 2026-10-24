// Lecture pure du fichier live epicmaster (lot #136 : .vibe-agent/epicmaster-live.json) pour la
// bande au-dessus de la saisie (lot #137). Aucune E/S ici : le module reçoit le texte et l'heure.
//
// Schéma #136 (fait foi) : { v, updated_at, lots: { "<id>": { id, title, owner, status:
// running|done, started_at, done_at, updated_at, note } }, agents: { ... } }.
// Champs OPTIONNELS lus s'ils sont présents (extensions tolérées, jamais exigées) :
//   racine : epic (string | { title }), wave / waves (nombres) ou wave: { current, total },
//            to_decide (nombre ou liste), finished (booléen)
//   lot    : status pending|queued|waiting|failed, verify ('failed'|'red'|false), model, effort,
//            tokens (nombre), depends_on (liste d'ids)
// Fail-open : toute entrée inattendue -> null (la bande n'affiche rien), jamais d'exception.

export const LIVE_PATH = '.vibe-agent/epicmaster-live.json'
export const STALE_MS = 6 * 3600 * 1000 // même péremption que lib/epicmaster-live.js
const MAX_TEXT = 512 * 1024

export type LotStatus = 'done' | 'running' | 'pending' | 'failed'

export type LiveLot = {
  id: string
  title: string
  status: LotStatus
  model: string
  effort: string
  startedAt: number | null
  tokens: number | null
  dependsOn: string[]
  wave: number | null
  scope: string
}

// Une vague du plan : « Vague N (#a, #b) libellé », état agrégé de ses lots.
export type LiveWave = {
  index: number
  ids: string[]
  label: string
  parallel: boolean
  status: LotStatus
  startedAt: number | null
}

export type LiveView = {
  epic: string
  wave: { current: number; total: number } | null
  lots: LiveLot[]
  done: number
  running: number
  pending: number
  failed: LiveLot[]
  finished: boolean
  toDecide: number
  waves: LiveWave[]
  signature: string
}

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, n = 120): string => {
  if (typeof v !== 'string' && typeof v !== 'number') return ''
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

function lotStatus(l: Rec, now: number): LotStatus | null {
  const s = typeof l.status === 'string' ? l.status.toLowerCase() : ''
  const red = s === 'failed' || s === 'red' || l.verify === 'failed' || l.verify === 'red' || l.verify === false
  if (red) return 'failed'
  if (s === 'done') return 'done'
  if (s === 'running') {
    const u = time(l.updated_at) ?? time(l.started_at)
    return u !== null && now - u > STALE_MS ? null : 'running' // « en cours » périmé : présumé mort
  }
  if (s === 'pending' || s === 'queued' || s === 'waiting' || s === 'todo') return 'pending'
  return null
}

function readWave(raw: Rec): LiveView['wave'] {
  const w = raw.wave
  if (isRec(w)) {
    const c = num(w.current), t = num(w.total)
    return c !== null && t !== null && t > 0 ? { current: c, total: t } : null
  }
  const c = num(w), t = num(raw.waves)
  return c !== null && t !== null && t > 0 ? { current: c, total: t } : null
}

function byId(a: LiveLot, b: LiveLot): number {
  const x = Number(a.id), y = Number(b.id)
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : a.id.localeCompare(b.id)
}

// Instant (ms) où le plan a été semé (`seeded_at`, lib/epicmaster-live.js seedFromPlan), ou null
// (fichier antérieur au champ, illisible). Sert à lier la bande au /epicmaster de SA session.
export function seededAt(text: unknown): number | null {
  try {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
    const raw: unknown = JSON.parse(text)
    return isRec(raw) ? time(raw.seeded_at) : null
  } catch (_) {
    return null
  }
}

// État d'une vague : rouge si un lot l'est, en cours si un lot tourne ou si elle est entamée sans
// être finie, faite si tous ses lots le sont, sinon en attente.
function waveStatus(lots: LiveLot[]): LotStatus {
  if (lots.some((l) => l.status === 'failed')) return 'failed'
  if (lots.every((l) => l.status === 'done')) return 'done'
  if (lots.some((l) => l.status === 'running' || l.status === 'done')) return 'running'
  return 'pending'
}

// Vagues du plan (`wave_plan`, semé par lib/epicmaster-live.js) ; à défaut, regroupées par le champ
// `wave` des lots (libellé : titre du lot seul ou « N US en parallèle ») ; aucune -> [].
function readWaves(raw: Rec, lots: LiveLot[]): LiveWave[] {
  const byLot = new Map(lots.map((l) => [l.id, l]))
  const plan: { index: number; ids: string[]; label: string }[] = []
  if (Array.isArray(raw.wave_plan)) {
    for (const w of raw.wave_plan) {
      if (!isRec(w) || num(w.index) === null || !Array.isArray(w.ids)) continue
      plan.push({ index: num(w.index) as number, ids: w.ids.map((x) => str(x, 20)).filter(Boolean), label: str(w.label, 80) })
    }
  } else {
    const groups = new Map<number, string[]>()
    for (const l of lots) if (l.wave !== null) groups.set(l.wave, [...(groups.get(l.wave) ?? []), l.id])
    for (const [index, ids] of groups) plan.push({ index, ids, label: '' })
  }
  return plan
    .map((w) => {
      const members = w.ids.map((id) => byLot.get(id)).filter((l): l is LiveLot => !!l)
      if (!members.length) return null
      const label = w.label || (members.length === 1 ? members[0].title : `${members.length} US en parallèle`)
      const starts = members.map((l) => l.startedAt).filter((t): t is number => t !== null)
      return {
        index: w.index, ids: members.map((l) => l.id), label, parallel: members.length > 1,
        status: waveStatus(members), startedAt: starts.length ? Math.min(...starts) : null,
      }
    })
    .filter((w): w is LiveWave => w !== null)
    .sort((a, b) => a.index - b.index)
}

export function parseLive(text: unknown, now: number): LiveView | null {
  try {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
    const raw: unknown = JSON.parse(text)
    if (!isRec(raw)) return null
    const updated = time(raw.updated_at)
    if (updated !== null && now - updated > STALE_MS) return null // session maître éteinte
    const src = Array.isArray(raw.lots) ? raw.lots : isRec(raw.lots) ? Object.values(raw.lots) : null
    if (!src) return null
    const lots: LiveLot[] = []
    for (const l of src) {
      if (!isRec(l) || l.id === undefined || l.id === null) continue
      const status = lotStatus(l, now)
      if (!status) continue
      lots.push({
        id: str(l.id, 20),
        title: str(l.title),
        status,
        model: str(l.model, 30),
        effort: str(l.effort, 20),
        startedAt: time(l.started_at),
        tokens: num(l.tokens),
        dependsOn: Array.isArray(l.depends_on) ? l.depends_on.map((d) => str(d, 20)).filter(Boolean) : [],
        wave: num(l.wave),
        scope: str(l.scope, 300),
      })
    }
    if (!lots.length) return null
    lots.sort(byId)
    const count = (s: LotStatus) => lots.filter((l) => l.status === s).length
    const running = count('running'), pending = count('pending')
    const failed = lots.filter((l) => l.status === 'failed')
    const explicit = typeof raw.finished === 'boolean' ? raw.finished : null
    const finished = explicit ?? (running === 0 && pending === 0)
    const td = raw.to_decide ?? raw.a_trancher
    const toDecide = Array.isArray(td) ? td.length : num(td) ?? 0
    const epicRaw = isRec(raw.epic) ? raw.epic.title : raw.epic
    return {
      epic: str(epicRaw, 60) || 'epicmaster',
      wave: readWave(raw),
      lots,
      done: count('done'),
      running,
      pending,
      failed,
      finished,
      toDecide,
      waves: readWaves(raw, lots),
      signature: `${str(raw.updated_at, 40)}|${lots.map((l) => l.id + l.status[0]).join(',')}`,
    }
  } catch (_) {
    return null
  }
}

export function elapsed(from: number | null, now: number): string {
  if (from === null) return '?'
  const m = Math.max(0, Math.round((now - from) / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function tokensLabel(n: number | null): string {
  if (n === null) return ''
  return n >= 1000 ? `~${Math.round(n / 1000)}k tokens` : `~${n} tokens`
}

// Ligne d'un lot en vol : « #id titre · modèle·effort · temps écoulé · ~tokens ».
export function runningLine(l: LiveLot, now: number): string {
  const bits = [`#${l.id} ${l.title}`.trim()]
  const me = [l.model, l.effort].filter(Boolean).join('·')
  if (me) bits.push(me)
  bits.push(elapsed(l.startedAt, now))
  const tk = tokensLabel(l.tokens)
  if (tk) bits.push(tk)
  return bits.join(' · ')
}

export function pendingLine(l: LiveLot): string {
  const dep = l.dependsOn.length ? ` · attend ${l.dependsOn.map((d) => '#' + d).join(', ')}` : ''
  return `#${l.id} ${l.title}`.trim() + dep
}

export function failedLabel(failed: LiveLot[]): string {
  return `${failed.length} ✗ verify rouge ${failed.map((l) => '#' + l.id).join(', ')}`
}

export function finishedLabel(v: LiveView): string {
  return `◆ epicmaster terminé · ${v.done}/${v.lots.length} ✓ · ${v.toDecide} à trancher`
}

// Ligne d'une vague : « Vague N (#a, #b) · libellé » (+ temps écoulé si elle tourne).
export function waveLine(w: LiveWave, now: number): string {
  const ids = w.ids.map((id) => '#' + id).join(', ')
  const run = w.status === 'running' ? ` · ${elapsed(w.startedAt, now)}` : ''
  return `Vague ${w.index} (${ids}) · ${w.label}${run}`
}

const STATE_LABEL: Record<LotStatus, string> = { done: 'fait', running: 'en cours', pending: 'à lancer', failed: 'verify rouge' }
const STATE_GLYPH: Record<LotStatus, string> = { done: '✓', running: '⟳', pending: '⧗', failed: '✗' }

// Plan complet en Markdown (panneau « Plan ») : une section par vague, une puce par lot avec
// modèle·effort, état, tokens et « fait quand ». Sans vagues : une seule liste de lots.
export function planMarkdown(v: LiveView, now: number): string {
  const L: string[] = []
  L.push(`## ◆ ${v.epic}${v.wave ? ` — vague ${v.wave.current}/${v.wave.total}` : ''}`)
  L.push('')
  L.push(`✓ ${v.done} fait · ⟳ ${v.running} en cours · ⧗ ${v.pending} à lancer · ✗ ${v.failed.length} rouge · ${v.toDecide} à trancher`)
  const lotBlock = (l: LiveLot) => {
    const me = [l.model, l.effort].filter(Boolean).join(' · ')
    const bits = [me ? `\`${me}\`` : '', STATE_LABEL[l.status]]
    if (l.status === 'running') bits.push(elapsed(l.startedAt, now))
    const tk = tokensLabel(l.tokens)
    if (tk) bits.push(tk)
    if (l.dependsOn.length && l.status === 'pending') bits.push(`après ${l.dependsOn.map((d) => '#' + d).join(', ')}`)
    L.push(`- ${STATE_GLYPH[l.status]} **#${l.id} ${l.title}** — ${bits.filter(Boolean).join(' · ')}`)
    if (l.scope) L.push(`  Fait quand : ${l.scope}`)
  }
  const byId = new Map(v.lots.map((l) => [l.id, l]))
  if (v.waves.length) {
    for (const w of v.waves) {
      L.push('')
      L.push(`### ${STATE_GLYPH[w.status]} Vague ${w.index} — ${w.label}`)
      L.push(`_${w.parallel ? `${w.ids.length} US en parallèle` : 'série'} · ${STATE_LABEL[w.status]}_`)
      L.push('')
      for (const id of w.ids) { const l = byId.get(id); if (l) lotBlock(l) }
    }
  } else {
    L.push('')
    for (const l of v.lots) lotBlock(l)
  }
  L.push('')
  L.push('_Durées et tokens : estimation indicative._')
  return L.join('\n')
}
