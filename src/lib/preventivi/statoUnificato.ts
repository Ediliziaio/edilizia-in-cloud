/**
 * Mappature di stato cross-modulo per i preventivi → 5 stati unificati.
 *
 * SINGLE SOURCE OF TRUTH lato client. La vista DB `v_preventivi_unificati`
 * (migration 20270915000000) rispecchia ESATTAMENTE queste mappe nelle sue
 * espressioni CASE: se modifichi una mappa qui, aggiorna anche la vista (e il
 * test `preventiviUnificati.test.ts` lo verifica).
 *
 * Stati unificati: bozza | in_corso | vinto | perso | altro
 */
export type UnifiedStato = "bozza" | "in_corso" | "vinto" | "perso" | "altro";

/** quotes.status — valori italiani correnti + legacy inglesi/misti (robustezza). */
export function mapClassicoStato(s: string | null | undefined): UnifiedStato {
  switch (s) {
    case "bozza":
    case "draft":
      return "bozza";
    case "inviata":
    case "sent":
    case "viewed":
    case "visualizzata":
    case "pending":
      return "in_corso";
    case "accettata":
    case "accepted":
    case "firmata":
    case "signed":
    case "convertita":
      return "vinto";
    case "rifiutata":
    case "rejected":
    case "scaduta":
    case "expired":
      return "perso";
    default:
      return "altro";
  }
}

/** sr_progetti.stato (enum sr_stato_progetto). */
export function mapSerramentiStato(s: string | null | undefined): UnifiedStato {
  switch (s) {
    case "bozza":
      return "bozza";
    case "da_consegnare":
    case "consegnato":
    case "in_valutazione":
      return "in_corso";
    case "accettato":
      return "vinto";
    case "rifiutato":
    case "scaduto":
      return "perso";
    default:
      return "altro";
  }
}

/** rst_progetti.stato (CHECK constraint, stessi valori di sr_stato_progetto). */
export function mapRistrutturazioneStato(s: string | null | undefined): UnifiedStato {
  switch (s) {
    case "bozza":
      return "bozza";
    case "da_consegnare":
    case "consegnato":
    case "in_valutazione":
      return "in_corso";
    case "accettato":
      return "vinto";
    case "rifiutato":
    case "scaduto":
      return "perso";
    default:
      return "altro";
  }
}

/** fv_progetti.stato (enum). */
export function mapFotovoltaicoStato(s: string | null | undefined): UnifiedStato {
  switch (s) {
    case "bozza":
      return "bozza";
    case "configurato":
    case "emesso":
      return "in_corso";
    case "firmato":
      return "vinto";
    case "annullato":
      return "perso";
    default:
      return "altro";
  }
}
