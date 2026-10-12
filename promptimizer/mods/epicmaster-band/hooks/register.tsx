// Bande epicmaster au-dessus de la saisie (lot #137, variante C « compacte dépliable »).
// Une bande PAR SESSION : rien ne s'affiche tant que /epicmaster n'a pas été saisi dans la session
// (armedAt, état de session), et la bande ne suit qu'un plan semé après cet instant — celui du
// dossier de session, sinon la copie de SON projet sous <config>/promptimizer/epicmaster-live/,
// retenue (boundFile) pour le reste de la session. Jamais le plan d'une autre session ou d'un autre projet.
// Source : .vibe-agent/epicmaster-live.json (lot #136), lu par $.fs ; rafraîchie par un sondage
// léger (2 s) qui ne redessine que si le fichier change (+ une fois par minute pour les durées).
// Fail-open absolu : hors epicmaster, fichier absent / illisible / invalide -> next(e), rien d'affiché.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EpicmasterBandDismissed } from '../types'

import {
  LIVE_PATH, failedLabel, finishedLabel, parseLive, pendingLine, planMarkdown, runningLine, seededAt, waveLine,
  type LiveLot, type LiveView,
} from './live'

const expanded = atom({ plugin: 'epicmaster-band', key: 'expanded' } as const, false)
const armedAt = atom({ plugin: 'epicmaster-band', key: 'armedAt' } as const, null as number | null)
const boundFile = atom({ plugin: 'epicmaster-band', key: 'boundFile' } as const, null as string | null)
const dismissed = atom({ plugin: 'epicmaster-band', key: 'dismissed' } as const, null as EpicmasterBandDismissed)

const POLL_MS = 2000
const MINUTE_TICKS = 30 // 30 × 2 s : redessin périodique des temps écoulés
const MAX_SEGMENTS = 40
const ARM_MS = 15 * 60 * 1000 // l'attente « préparation du plan » expire seule
const PLAN_PANE = 'epicmaster-plan'
const SEED_SLACK_MS = 5000 // horloges du moteur et de node : même machine, marge de sûreté
const GLOBAL_DIR = 'promptimizer/epicmaster-live'
const CALL_RE = /^\s*\/(?:pmz:)?epicmaster(?![\w-])/

const WAVE_GLYPH: Record<LiveLot['status'], string> = { done: '✓', running: '⟳', pending: '⧗', failed: '✗' }
const SEG: Record<LiveLot['status'], { glyph: string; color: string }> = {
  done: { glyph: '■', color: 'success' },
  running: { glyph: '■', color: 'warning' },
  pending: { glyph: '□', color: 'inactive' },
  failed: { glyph: '■', color: 'error' },
}

type Fs = {
  read: (p: string) => Promise<unknown>
  list: (p?: string) => Promise<{ name: string; kind: string }[]>
}
type Env = { get: (n: string) => Promise<string | undefined> }
type Dollar = Parameters<typeof read>[0] & { fs: Fs; env: Env }

const asText = (t: unknown) => (typeof t === 'string' ? t : null)
// Plan semé après le /epicmaster de cette session ? Un fichier local sans seeded_at (antérieur au
// champ) est admis ; une copie globale doit le porter (sinon rien ne la rattache à la session).
const seededSince = (text: string, armed: number, required: boolean) => {
  const s = seededAt(text)
  return s === null ? !required : s >= armed - SEED_SLACK_MS
}

async function globalDir($: Dollar): Promise<string | null> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)
  if (cfg) return `${cfg}/${GLOBAL_DIR}`
  const home = await $.env.get('HOME').catch(() => undefined)
  return home ? `${home}/.claude/${GLOBAL_DIR}` : null
}

// Fichier live de CETTE session : null tant que /epicmaster n'y a pas été saisi. D'abord celui du
// dossier de session ; sinon la copie de projet déjà retenue ; sinon la première copie semée après
// le /epicmaster de la session (retenue ensuite, même si un autre projet sème plus tard).
async function readLive($: Dollar, now: number, bind = false): Promise<string | null> {
  const armed = await read($, armedAt)
  if (armed === null) return null
  const local = asText(await $.fs.read(LIVE_PATH).catch(() => null))
  if (local && parseLive(local, now) && seededSince(local, armed, false)) return local
  const bound = await read($, boundFile)
  if (bound) {
    const text = asText(await $.fs.read(bound).catch(() => null))
    return text && parseLive(text, now) ? text : null
  }
  const dir = await globalDir($)
  if (!dir) return null
  const entries = await $.fs.list(dir).catch(() => [])
  let best: { path: string; text: string; at: number } | null = null
  for (const ent of entries) {
    if (ent.kind !== 'file' || !ent.name.endsWith('.json')) continue
    const path = `${dir}/${ent.name}`
    const text = asText(await $.fs.read(path).catch(() => null))
    if (!text || !parseLive(text, now) || !seededSince(text, armed, true)) continue
    const at = seededAt(text) as number
    if (!best || at < best.at) best = { path, text, at }
  }
  if (!best) return null
  // Retenue hors dessin seulement (sondage, saisie) : un ui.render n'écrit pas d'état. Sans elle le
  // choix reste le même (la plus ancienne copie semée depuis le /epicmaster de la session).
  const chosen = best
  if (bind) await update($, boundFile, () => chosen.path).catch(() => undefined)
  return chosen.text
}

const arm = async ($: Dollar, now: number) => {
  await update($, armedAt, () => now)
  await update($, boundFile, () => null) // nouveau /epicmaster : on relie au prochain plan semé
}

// Segments de la barre groupés par vague (une espace entre deux vagues) ; sans vagues : à plat.
function segmentsByWave(view: LiveView, shown: LiveLot[]): (LiveLot | string | null)[] {
  if (!view.waves.length) return shown
  const keep = new Set(shown.map(l => l.id))
  const byId = new Map(shown.map(l => [l.id, l]))
  const out: (LiveLot | string | null)[] = []
  view.waves.forEach((w, i) => {
    const lots = w.ids.filter(id => keep.has(id)).map(id => byId.get(id) as LiveLot)
    if (!lots.length) return
    if (out.length) out.push(`seg-gap-${i}`)
    out.push(...lots)
  })
  return out
}

// Détail déplié par vague : « ✓ Vague 1 (#9) · libellé », la vague en cours détaille ses lots en vol
// et ses verify rouges (une ligne indentée chacun).
const WAVE_COLOR: Record<LiveLot['status'], string | undefined> = { done: 'success', running: 'warning', pending: undefined, failed: 'error' }
function waveRows(view: LiveView, now: number, Text: any): unknown[] {
  const byId = new Map(view.lots.map(l => [l.id, l]))
  const rows: unknown[] = []
  for (const w of view.waves) {
    const color = WAVE_COLOR[w.status]
    rows.push(
      <Text key={`wave-${w.index}`} {...(color ? { color } : { dimColor: true })} wrap="truncate">
        {`  ${WAVE_GLYPH[w.status]} ${waveLine(w, now)}`}
      </Text>,
    )
    if (w.status !== 'running' && w.status !== 'failed') continue
    for (const id of w.ids) {
      const l = byId.get(id)
      if (!l) continue
      if (l.status === 'running') rows.push(<Text key={`run-${l.id}`} color="warning" wrap="truncate">{'      ⟳ ' + runningLine(l, now)}</Text>)
      if (l.status === 'failed') rows.push(<Text key={`red-${l.id}`} color="error" wrap="truncate">{`      ✗ #${l.id} ${l.title} · verify rouge`}</Text>)
    }
  }
  return rows
}

export const register: Register = on => {
  let lastText: string | null = null
  let ticks = 0

  // Sondage : seule façon d'être réveillé par un fichier modifié hors session (pas de watch fs).
  on('session.start', async ($, e, next) => {
    try {
      if (e.surface !== null) {
        $.clock.every(POLL_MS, () => {
          $.clock.now()
            .then(now => readLive($, now, true))
            .then(text => {
              ticks = (ticks + 1) % MINUTE_TICKS
              if (text !== lastText || (text !== null && ticks === 0)) {
                lastText = text
                $.ui.invalidate('ui.render')
              }
            })
            .catch(() => undefined)
        })
      }
    } catch (_) { /* fail-open */ }
    return next(e)
  })

  // Critère 6 : le récap « terminé » disparaît à la saisie suivante.
  on('prompt.submit', async ($, e, next) => {
    try {
      const now = await $.clock.now()
      const view = parseLive(await readLive($, now), now)
      if (view && view.finished) {
        await update($, dismissed, () => view.signature)
        await update($, expanded, () => false)
      }
      // /epicmaster saisi : la bande s'affiche tout de suite (plan en préparation), sans attendre le fichier.
      if (CALL_RE.test(e.text)) await arm($, now)
    } catch (_) { /* fail-open */ }
    return next(e)
  }).catch(($, e, next) => next(e)) // jamais de refus : la saisie passe toujours

  // /epicmaster est une commande : elle passe par command.run (et non toujours par prompt.submit).
  // On arme la bande à cet instant puis on laisse la commande tourner, inchangée.
  for (const command of ['epicmaster', 'pmz:epicmaster']) {
    on('command.run', { command }, async ($, e, next) => {
      try { await arm($, await $.clock.now()) } catch (_) { /* fail-open */ }
      return next(e)
    }).catch(($, e, next) => next(e))
  }

  // Panneau « Plan » : le plan complet de la session (vagues, lots, fait quand), suivi en direct.
  on('ui.render', { component: 'Pane', requestId: PLAN_PANE }, async ($, e, next) => {
    try {
      const now = await $.clock.now()
      const view = parseLive(await readLive($, now), now)
      const { Box, Text, Markdown } = $.ui.resolve(e)
      if (!view) {
        return (
          <Box key="em-plan" flexDirection="column">
            <Text key="em-plan-none" dimColor>Aucun plan epicmaster actif dans cette session.</Text>
          </Box>
        )
      }
      return (
        <Box key="em-plan" flexDirection="column">
          <Markdown key="em-plan-md" text={planMarkdown(view, now)} />
        </Box>
      )
    } catch (_) {
      return next(e)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) return next(e)
      const now = await $.clock.now()
      const view = parseLive(await readLive($, now), now)
      if (!view) {
        const armed = await read($, armedAt)
        if (armed === null || now - armed > ARM_MS) return next(e)
        const { Box, Text } = $.ui.resolve(e)
        return (
          <Box key="em-band" flexDirection="row">
            <Text key="em-wait" bold wrap="truncate">{'◆ epicmaster · plan en préparation… '}</Text>
            <Text key="em-wait-bar" dimColor>□□□</Text>
          </Box>
        )
      }
      if (view.finished && (await read($, dismissed)) === view.signature) return next(e)
      const isOpen = !view.finished && (await read($, expanded))
      const { Box, Text, Button } = $.ui.resolve(e)
      const planButton = (
        <Button key="em-plan" label="Plan" onPress={() => $.ui.open({ id: PLAN_PANE, title: `Plan epicmaster · ${view.epic}` })} />
      )

      if (view.finished) {
        return (
          <Box key="em-band" flexDirection="row">
            <Text key="em-done" color="success" wrap="truncate">{finishedLabel(view)}</Text>
            {view.failed.length ? <Text key="em-failed" color="error" wrap="truncate">{'  ' + failedLabel(view.failed)}</Text> : null}
            <Text key="em-gap"> </Text>
            {planButton}
          </Box>
        )
      }

      const shown = view.lots.slice(0, MAX_SEGMENTS)
      const more = view.lots.length - shown.length
      const head = `◆ ${view.epic}${view.wave ? ` · vague ${view.wave.current}/${view.wave.total}` : ''} `
      const counts = ` ✓${view.done} ⟳${view.running} ⧗${view.pending}`

      const line = (
        <Box key="em-line" flexDirection="row">
          <Text key="em-head" bold wrap="truncate">{head}</Text>
          <Text key="em-bar">
            {segmentsByWave(view, shown).map(x => x === null
              ? null
              : typeof x === 'string'
                ? <Text key={x}> </Text>
                : <Text key={`seg-${x.id}`} color={SEG[x.status].color}>{SEG[x.status].glyph}</Text>)}
            {more > 0 ? <Text key="seg-more" dimColor>{`+${more}`}</Text> : null}
          </Text>
          <Text key="em-counts">{counts}</Text>
          {view.failed.length ? <Text key="em-failed" color="error" bold>{'  ' + failedLabel(view.failed)}</Text> : null}
          <Text key="em-gap"> </Text>
          {planButton}
          <Text key="em-gap2"> </Text>
          <Button
            key="em-toggle"
            label={isOpen ? 'Masquer' : 'Détails'}
            onPress={() => update($, expanded, v => !v)}
          />
        </Box>
      )
      if (!isOpen) return line

      const rows = view.waves.length ? waveRows(view, now, Text) : [
        ...view.lots.filter(l => l.status === 'running').map(l => (
          <Text key={`run-${l.id}`} color="warning" wrap="truncate">{'  ⟳ ' + runningLine(l, now)}</Text>
        )),
        ...view.failed.map(l => (
          <Text key={`red-${l.id}`} color="error" wrap="truncate">{`  ✗ #${l.id} ${l.title} · verify rouge`}</Text>
        )),
        ...view.lots.filter(l => l.status === 'pending').map(l => (
          <Text key={`wait-${l.id}`} dimColor wrap="truncate">{'  ⧗ ' + pendingLine(l)}</Text>
        )),
      ]
      return (
        <Box key="em-band" flexDirection="column">
          {line}
          {rows}
          <Text key="em-note" dimColor wrap="truncate">  durées et tokens : estimation indicative</Text>
        </Box>
      )
    } catch (_) {
      return next(e)
    }
  })
}

