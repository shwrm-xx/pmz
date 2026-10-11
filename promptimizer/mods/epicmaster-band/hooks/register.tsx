// Bande epicmaster au-dessus de la saisie (lot #137, variante C « compacte dépliable »).
// Source : .vibe-agent/epicmaster-live.json (lot #136), lu par $.fs ; rafraîchie par un sondage
// léger (2 s) qui ne redessine que si le fichier change (+ une fois par minute pour les durées).
// Fail-open absolu : hors epicmaster, fichier absent / illisible / invalide -> next(e), rien d'affiché.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EpicmasterBandDismissed } from '../types'

import {
  LIVE_PATH, failedLabel, finishedLabel, parseLive, pendingLine, runningLine,
  type LiveLot,
} from './live'

const expanded = atom({ plugin: 'epicmaster-band', key: 'expanded' } as const, false)
const armedAt = atom({ plugin: 'epicmaster-band', key: 'armedAt' } as const, null as number | null)
const dismissed = atom({ plugin: 'epicmaster-band', key: 'dismissed' } as const, null as EpicmasterBandDismissed)

const POLL_MS = 2000
const MINUTE_TICKS = 30 // 30 × 2 s : redessin périodique des temps écoulés
const MAX_SEGMENTS = 40
const ARM_MS = 15 * 60 * 1000 // l'attente « préparation du plan » expire seule
const CALL_RE = /^\s*\/(?:pmz:)?epicmaster(?![\w-])/

const SEG: Record<LiveLot['status'], { glyph: string; color: string }> = {
  done: { glyph: '■', color: 'success' },
  running: { glyph: '■', color: 'warning' },
  pending: { glyph: '□', color: 'inactive' },
  failed: { glyph: '■', color: 'error' },
}

type Fs = { read: (p: string) => Promise<unknown> }
type Env = { get: (n: string) => Promise<string | undefined> }

// Fichier live : celui du dossier de session, sinon la copie globale (<config>/promptimizer/…)
// écrite par backlog.js — la bande marche alors quel que soit le dossier où la session est ouverte.
async function readLive($: { fs: Fs; env: Env }, now: number): Promise<string | null> {
  const asText = (t: unknown) => (typeof t === 'string' ? t : null)
  const local = asText(await $.fs.read(LIVE_PATH).catch(() => null))
  if (parseLive(local, now)) return local
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)
  const home = cfg || ((await $.env.get('HOME').catch(() => undefined)) ?? '') + '/.claude'
  if (!cfg && home === '/.claude') return local
  const global = asText(await $.fs.read(`${home}/promptimizer/epicmaster-live.json`).catch(() => null))
  return parseLive(global, now) ? global : local
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
            .then(now => readLive($, now))
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
      if (CALL_RE.test(e.text)) await update($, armedAt, () => now)
    } catch (_) { /* fail-open */ }
    return next(e)
  }).catch(($, e, next) => next(e)) // jamais de refus : la saisie passe toujours

  // /epicmaster est une commande : elle passe par command.run (et non toujours par prompt.submit).
  // On arme la bande à cet instant puis on laisse la commande tourner, inchangée.
  for (const command of ['epicmaster', 'pmz:epicmaster']) {
    on('command.run', { command }, async ($, e, next) => {
      try { const now = await $.clock.now(); await update($, armedAt, () => now) } catch (_) { /* fail-open */ }
      return next(e)
    }).catch(($, e, next) => next(e))
  }

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

      if (view.finished) {
        return (
          <Box key="em-band" flexDirection="row">
            <Text key="em-done" color="success" wrap="truncate">{finishedLabel(view)}</Text>
            {view.failed.length ? <Text key="em-failed" color="error" wrap="truncate">{'  ' + failedLabel(view.failed)}</Text> : null}
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
            {shown.map(l => <Text key={`seg-${l.id}`} color={SEG[l.status].color}>{SEG[l.status].glyph}</Text>)}
            {more > 0 ? <Text key="seg-more" dimColor>{`+${more}`}</Text> : null}
          </Text>
          <Text key="em-counts">{counts}</Text>
          {view.failed.length ? <Text key="em-failed" color="error" bold>{'  ' + failedLabel(view.failed)}</Text> : null}
          <Text key="em-gap"> </Text>
          <Button
            key="em-toggle"
            label={isOpen ? 'Masquer' : 'Détails'}
            onPress={() => update($, expanded, v => !v)}
          />
        </Box>
      )
      if (!isOpen) return line

      const rows = [
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

