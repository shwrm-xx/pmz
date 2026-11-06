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
// « interrompu » (dérivé, jamais écrit) : lot `running` dont tous les sous-agents rattachés
// (agents[].lot) sont arrêtés depuis plus de STOP_GRACE_MS sans clôture, ou « en cours » périmé.
// Fail-open : toute entrée inattendue -> null (la bande n'affiche rien), jamais d'exception.

export const LIVE_PATH = '.vibe-agent/epicmaster-live.json'
export const STALE_MS = 6 * 3600 * 1000 // même péremption que lib/epicmaster-live.js
const MAX_TEXT = 512 * 1024
export const STOP_GRACE_MS = 2 * 60 * 1000 // délai laissé au maître pour clôturer après l'arrêt de l'agent

export type LotStatus = 'done' | 'running' | 'interrupted' | 'pending' | 'failed'

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

// Phase de consolidation du maître (US#185/#188) : `waves` (défaut) ou review|arbitrage|settle|done.
export type LivePhase = 'waves' | 'review' | 'arbitrage' | 'settle' | 'done'
const PHASES: LivePhase[] = ['waves', 'review', 'arbitrage', 'settle', 'done']
// Sous-agent actif : US rattachée (`lot`) ou phase de consolidation (`kind`), et son type.
export type LiveAgent = { type: string; lot: string | null; kind: string }

export type LiveView = {
  phase: LivePhase | null
  agents: LiveAgent[]
  epic: string
  wave: { current: number; total: number } | null
  lots: LiveLot[]
  done: number
  running: number
  pending: number
  interrupted: number
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

// Arrêt du dernier sous-agent du lot si TOUS ses agents sont arrêtés ; null sinon (aucun, ou un actif).
function agentsStoppedAt(agents: Rec[], id: unknown): number | null {
  const mine = agents.filter((a) => a.lot !== undefined && a.lot !== null && String(a.lot) === String(id))
  if (!mine.length) return null
  const stops = mine.map((a) => time(a.stopped_at))
  return stops.some((t) => t === null) ? null : Math.max(...(stops as number[]))
}

function lotStatus(l: Rec, now: number, agents: Rec[]): LotStatus | null {
  const s = typeof l.status === 'string' ? l.status.toLowerCase() : ''
  const red = s === 'failed' || s === 'red' || l.verify === 'failed' || l.verify === 'red' || l.verify === false
  if (red) return 'failed'
  if (s === 'done') return 'done'
  if (s === 'running') {
    const u = time(l.updated_at) ?? time(l.started_at)
    if (u !== null && now - u > STALE_MS) return 'interrupted' // « en cours » périmé : présumé mort
    const stop = agentsStoppedAt(agents, l.id)
    return stop !== null && now - stop > STOP_GRACE_MS ? 'interrupted' : 'running'
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

// État d'une vague : rouge si un lot l'est, faite si tous ses lots le sont, en cours si un lot tourne,
// interrompue si un lot l'est (et aucun ne tourne), en cours si elle est entamée, sinon en attente.
function waveStatus(lots: LiveLot[]): LotStatus {
  if (lots.some((l) => l.status === 'failed')) return 'failed'
  if (lots.every((l) => l.status === 'done')) return 'done'
  if (lots.some((l) => l.status === 'running')) return 'running'
  if (lots.some((l) => l.status === 'interrupted')) return 'interrupted'
  if (lots.some((l) => l.status === 'done')) return 'running'
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
    const agents = isRec(raw.agents) ? Object.values(raw.agents).filter(isRec) : []
    const lots: LiveLot[] = []
    for (const l of src) {
      if (!isRec(l) || l.id === undefined || l.id === null) continue
      const status = lotStatus(l, now, agents)
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
    const running = count('running'), pending = count('pending'), interrupted = count('interrupted')
    const failed = lots.filter((l) => l.status === 'failed')
    const explicit = typeof raw.finished === 'boolean' ? raw.finished : null
    const phase = typeof raw.phase === 'string' && (PHASES as string[]).includes(raw.phase) ? (raw.phase as LivePhase) : null
    // Une phase de consolidation en cours (relecture, arbitrage, solde) n'est JAMAIS « terminé ».
    const finished = phase && phase !== 'done' ? false : explicit ?? (phase === 'done' ? true : running === 0 && pending === 0 && interrupted === 0)
    const liveAgents: LiveAgent[] = agents
      .filter((a) => !a.stopped_at)
      .map((a) => ({ type: str(a.type, 40), lot: a.lot === undefined || a.lot === null ? null : str(a.lot, 20), kind: str(a.kind, 20) }))
    const td = raw.to_decide ?? raw.a_trancher
    const toDecide = Array.isArray(td) ? td.length : num(td) ?? 0
    const epicRaw = isRec(raw.epic) ? raw.epic.title : raw.epic
    return {
      phase,
      agents: liveAgents,
      epic: str(epicRaw, 60) || 'epicmaster',
      wave: readWave(raw),
      lots,
      done: count('done'),
      running,
      pending,
      interrupted,
      failed,
      finished,
      toDecide,
      waves: readWaves(raw, lots),
      signature: `${str(raw.updated_at, 40)}|${phase ?? ''}|${lots.map((l) => l.id + l.status[0]).join(',')}`,
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

// Ligne d'un lot interrompu : « #id titre · interrompu · temps depuis le lancement ».
export function interruptedLine(l: LiveLot, now: number): string {
  return `#${l.id} ${l.title}`.trim() + ` · interrompu · ${elapsed(l.startedAt, now)}`
}

export function pendingLine(l: LiveLot): string {
  const dep = l.dependsOn.length ? ` · attend ${l.dependsOn.map((d) => '#' + d).join(', ')}` : ''
  return `#${l.id} ${l.title}`.trim() + dep
}

export function failedLabel(failed: LiveLot[]): string {
  return `${failed.length} ☠️ verify rouge ${failed.map((l) => '#' + l.id).join(', ')}`
}

export function finishedLabel(v: LiveView): string {
  return `◆ epicmaster terminé · ${v.done}/${v.lots.length} ✅ · ${v.toDecide} à trancher`
}

// Ligne d'une vague : « Vague N (#a, #b) · libellé » (+ temps écoulé si elle tourne).
export function waveLine(w: LiveWave, now: number): string {
  const ids = w.ids.map((id) => '#' + id).join(', ')
  const run = w.status === 'running' ? ` · ${elapsed(w.startedAt, now)}` : ''
  return `Vague ${w.index} (${ids}) · ${w.label}${run}`
}

const STATE_LABEL: Record<LotStatus, string> = { done: 'fait', running: 'en cours', interrupted: 'interrompu', pending: 'à lancer', failed: 'verify rouge' }
const STATE_GLYPH: Record<LotStatus, string> = { done: '✅', running: '👉', interrupted: '⏳', pending: '⏳', failed: '☠️' }

// Plan complet en Markdown (panneau « Plan ») : une section par vague, une puce par lot avec
// modèle·effort, état, tokens et « fait quand ». Sans vagues : une seule liste de lots.
export function planMarkdown(v: LiveView, now: number): string {
  const L: string[] = []
  L.push(`## ◆ ${v.epic}${v.wave ? ` — vague ${v.wave.current}/${v.wave.total}` : ''}`)
  L.push('')
  L.push(`✅ ${v.done} fait · 👉 ${v.running} en cours · ⏳ ${v.interrupted} interrompu · ⏳ ${v.pending} à lancer · ☠️ ${v.failed.length} rouge · ${v.toDecide} à trancher`)
  const lotBlock = (l: LiveLot) => {
    const me = [l.model, l.effort].filter(Boolean).join(' · ')
    const bits = [me ? `\`${me}\`` : '', STATE_LABEL[l.status]]
    if (l.status === 'running' || l.status === 'interrupted') bits.push(elapsed(l.startedAt, now))
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

// ── Surface « où se passe quoi » (US#188) ───────────────────────────────────────────────────
const PHASE_LABEL: Record<string, string> = { review: 'relecture', arbitrage: 'arbitrage', settle: 'solde' }

// Libellé de la phase de consolidation (« relecture » / « arbitrage » / « solde »), '' sinon.
export function phaseLabel(v: LiveView): string {
  return v.phase ? PHASE_LABEL[v.phase] ?? '' : ''
}

// Une ligne par sous-agent actif : « ⚙ #N type » (US rattachée) ou « ⚙ phase type » (consolidation).
export function agentLine(a: LiveAgent): string {
  const where = a.lot !== null ? `#${a.lot}` : a.kind ? (PHASE_LABEL[a.kind] ?? a.kind) : 'non rattaché'
  return `⚙ ${where} ${a.type || 'agent'}`.trim()
}

// Vagues D3 (fleet.json) : « D3 · 2 US en vol (#7 en cours, #8 prêt) » ; null si aucune vague active.
export const FLEET_PATH = '.vibe-agent/fleet.json'
export type FleetView = { waveId: string; lots: { id: string; state: string }[] }
export function parseFleet(text: unknown): FleetView | null {
  try {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return null
    const raw: unknown = JSON.parse(text)
    if (!isRec(raw) || !Array.isArray(raw.lots)) return null
    const lots = raw.lots.filter(isRec).filter((l) => num(l.id) !== null)
      .map((l) => ({ id: str(l.id, 20), state: str(l.state, 20) || 'en cours' }))
    return lots.length ? { waveId: str(raw.wave_id, 40), lots } : null
  } catch (_) {
    return null
  }
}
export function fleetLabel(f: FleetView): string {
  return `D3 · ${f.lots.length} US en vol (${f.lots.map((l) => `#${l.id} ${l.state}`).join(', ')})`
}

// Tête de bande en texte : « ◆ epic · vague 1/2 · relecture » (testable sans rendu).
export function bandHead(v: LiveView): string {
  const ph = phaseLabel(v)
  return `◆ ${v.epic}${v.wave ? ` · vague ${v.wave.current}/${v.wave.total}` : ''}${ph ? ` · ${ph}` : ''} `
}

// Tableau « sessions » (bouton Sessions) : mêmes colonnes que `backlog.js sessions`, calculé ici
// depuis session-roles.json + live + fleet.json (la bande n'exécute aucun script).
export const ROLES_PATH = '.vibe-agent/session-roles.json'
export function sessionsText(rolesText: unknown, liveText: unknown, fleetText: unknown, now: number): string {
  type Row = { sid6: string; title: string; role: string; epic: string; us: string[]; state: string; last: number | null }
  const rows = new Map<string, Row>()
  const row = (sid: string): Row => {
    let r = rows.get(sid)
    if (!r) { r = { sid6: sid.replace(/[^A-Za-z0-9]/g, '').slice(0, 6), title: '', role: '-', epic: '', us: [], state: '-', last: null }; rows.set(sid, r) }
    return r
  }
  const bump = (r: Row, t: number | null) => { if (t !== null && (r.last === null || t > r.last)) r.last = t }
  try {
    const roles: unknown = JSON.parse(String(rolesText))
    if (isRec(roles)) for (const [sid, e] of Object.entries(roles)) {
      if (!isRec(e)) continue
      const r = row(sid)
      r.title = str(e.title, 60); r.role = str(e.role, 12) || '-'; r.epic = str(e.epic, 40); bump(r, num(e.at))
    }
  } catch (_) { /* absent */ }
  try {
    const raw: unknown = JSON.parse(String(liveText))
    if (isRec(raw) && typeof raw.master_session_id === 'string') {
      const r = row(raw.master_session_id)
      r.role = 'master'
      if (!r.epic) r.epic = str(isRec(raw.epic) ? raw.epic.title : raw.epic, 40)
      const lots = isRec(raw.lots) ? Object.values(raw.lots).filter(isRec) : []
      const running = lots.filter((l) => l.status === 'running').map((l) => num(l.id)).filter((n): n is number => n !== null).sort((a, b) => a - b)
      r.us.push(...running.map((n) => `US#${n}`))
      const ag = (isRec(raw.agents) ? Object.values(raw.agents).filter(isRec) : []).filter((a) => !a.stopped_at).length
      r.state = `${typeof raw.phase === 'string' ? raw.phase : 'waves'}${running.length ? ` · ${running.length} en cours` : ''}${ag ? ` · ${ag} agent${ag > 1 ? 's' : ''}` : ''}`
      bump(r, time(raw.updated_at))
    }
  } catch (_) { /* absent */ }
  try {
    const raw: unknown = JSON.parse(String(fleetText))
    if (isRec(raw) && Array.isArray(raw.lots)) for (const l of raw.lots) {
      if (!isRec(l) || typeof l.session_owner !== 'string' || num(l.id) === null) continue
      const r = row(l.session_owner)
      if (r.role === '-') r.role = 'fille'
      if (!r.us.includes(`US#${l.id}`)) r.us.push(`US#${l.id}`)
      r.state = `D3 ${str(l.state, 20) || 'en cours'}`
      bump(r, time(raw.updated_at))
    }
  } catch (_) { /* absent */ }
  if (!rows.size) return 'Aucune session connue.'
  const date = (t: number | null) => {
    if (t === null) return '—'
    const d = new Date(t), p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const lines = ['titre | rôle | sid6 | vivante | epic | US | état | dernier événement']
  for (const r of [...rows.values()].sort((a, b) => (b.last ?? 0) - (a.last ?? 0))) {
    const alive = r.last === null ? '?' : now - r.last < STALE_MS ? 'oui' : 'non'
    lines.push([r.title || '—', r.role, r.sid6, alive, r.epic || '—', r.us.join(',') || '—', r.state, date(r.last)].join(' | '))
  }
  return lines.join('\n')
}
