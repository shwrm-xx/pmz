// Fin de plan (US#179, contrat US#177 « piste 3 ») : en session PMZ en mode plan, le mod pose
// lui-même la question avant la carte native d'ExitPlanMode — « Scope » ou
// « Approuver le plan ». Scope refuse ExitPlanMode (la session reste en mode plan, rien n'est
// implémenté) et dicte l'appel de /pmz:scope --plan <fichier plan natif> ; Approuver laisse la
// carte native (Accepter, Accepter et continuer, Réviser, Refuser) intacte.
// Fail-open absolu : exception, garde non remplie, question fermée ou -p -> next(e), comportement vanilla.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

export const HEADER = 'Fin du plan'
export const QUESTION = 'Plan prêt : le découper en US avec Scope, ou l\'approuver ?'
export const SCOPE = 'Scope'
export const APPROVE = 'Approuver le plan'

// Chemin inconnu (rappel du mode plan intercepté par un autre plugin) : le modèle connaît son fichier
// plan par le rappel système du mode plan — on le lui fait nommer.
// Réponse plus rapide qu'un humain (v2.17.2) : la question n'a pas été vue (réponse automatique
// d'un autre composant, observée en session desktop sans aucun clic) -> jamais de Scope forcé,
// carte native d'ExitPlanMode à la place.
export const MIN_HUMAN_MS = 1000

export const PLAN_HINT = '<chemin absolu du fichier plan indiqué par le rappel du mode plan>'
// Le refus est le seul canal sûr : l'app l'affiche « Échec » (rendu d'un deny, non réglable), mais
// substituer un résultat ferait lire au modèle « plan approuvé, commence à coder ». Texte court, lisible
// par l'utilisateur d'abord : ce n'est pas une erreur, c'est son choix.
export const denyScope = (p: string | null): string =>
  `Pas une erreur : Scope choisi, le plan sera découpé en US (rien n'est implémenté). Consigne : invoque le skill pmz:scope avec « --plan ${p || PLAN_HINT} », sans rappeler ExitPlanMode ni rien implémenter, puis termine ton tour.`
export const denyRevise = (t: string): string =>
  `L'utilisateur demande une révision du plan : ${t}. Reste en mode plan, révise le plan, puis rappelle ExitPlanMode.`

const planFile = atom({ plugin: 'pmz', key: 'planFile' } as const, null as string | null)

export const registerPlanScope = (on: Parameters<Register>[0]): void => {
  // Chemin du plan natif, appris au rappel du mode plan.
  on('prompt.attachment', async ($, e, next) => {
    try {
      const a = e as { type?: unknown; attachment?: { type?: unknown }; detail?: { planFilePath?: unknown } }
      const type = String(a.type ?? a.attachment?.type ?? '')
      const p = a.detail?.planFilePath
      if ((type === 'plan_mode' || type === 'plan_mode_reentry') && typeof p === 'string' && p !== '') {
        await update($, planFile, () => p)
      }
    } catch (_) { /* fail-open */ }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    try {
      if ((e as { agentId?: unknown }).agentId !== undefined) return next(e)
      // Le chemin du plan n'est PLUS une garde (fix v2.16.1) : un autre plugin peut consommer le
      // rappel prompt.attachment avant ce mod. Ordre : entrée d'ExitPlanMode, puis atom, sinon indice.
      // Pas de garde backlog non plus : la fin de plan précède souvent le 1er /scope (backlog absent) ;
      // ce mod n'est chargé que par le plugin PMZ, ce qui suffit à dire « session PMZ ».
      const fromInput = (e as { planFilePath?: unknown }).planFilePath
      const p = typeof fromInput === 'string' && fromInput !== '' ? fromInput : await read($, planFile)
      let answer: string
      try {
        const askedAt = await $.clock.now()
        answer = String(await $.ui.ask(QUESTION, { header: HEADER, options: [SCOPE, APPROVE] }))
        if ((await $.clock.now()) - askedAt < MIN_HUMAN_MS) {
          $.ui.log(`pmz: réponse « ${answer} » trop rapide pour un humain, carte native gardée`, { to: 'debug' })
          return next(e)
        }
      } catch (_) { return next(e) } // question fermée ou -p
      if (answer === SCOPE) return { deny: denyScope(p) }
      if (answer === APPROVE) return next(e)
      return { deny: denyRevise(answer) }
    } catch (_) { return next(e) }
  }).catch(($, e, next) => next(e))
}
