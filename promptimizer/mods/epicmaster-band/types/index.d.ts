// Contrat d'état de la bande epicmaster (lot #137) : seules valeurs gardées dans $.state.
/** Signature du plan terminé déjà vu à une saisie (il ne s'affiche plus), ou null. */
export type EpicmasterBandDismissed = string | null

declare module 'claude-code' {
  interface PluginState {
    'epicmaster-band': {
      /** Bande dépliée (« Détails ») ou repliée (« Masquer »). */
      expanded: boolean
      dismissed: EpicmasterBandDismissed
      /** Instant (ms) où /epicmaster a été saisi : la bande s'affiche aussitôt, même sans fichier live. */
      armedAt: number | null
      /** Copie globale de projet (<config>/promptimizer/epicmaster-live/<slug>.json) suivie par cette session, ou null. */
      boundFile: string | null
    }
  }
}
