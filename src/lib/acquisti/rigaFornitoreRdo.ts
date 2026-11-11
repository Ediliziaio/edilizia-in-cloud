// ============================================================================
// La riga compatta di un fornitore nella richiesta d'offerta
// ----------------------------------------------------------------------------
// 11/11/2026 — In «A chi lo chiedi» ogni fornitore era una scheda alta 400 px
// con tutto aperto. Ora una riga: nome, stato, totale, consegna, «Scegli
// questo»; il resto si apre a richiesta. Qui le due regole della riga.
// ============================================================================

export type StatoRigaFornitore =
  | "da_inviare"
  | "in_attesa"
  | "sollecitare"
  | "ha_risposto"
  | "ha_declinato"
  | "scaduta";

export const STATO_RIGA_FORNITORE: Record<StatoRigaFornitore, { etichetta: string; colore: string }> = {
  da_inviare: { etichetta: "Da inviare", colore: "bg-muted text-muted-foreground" },
  in_attesa: { etichetta: "In attesa", colore: "bg-blue-100 text-blue-800" },
  sollecitare: { etichetta: "Da sollecitare", colore: "bg-amber-100 text-amber-800" },
  ha_risposto: { etichetta: "Ha risposto", colore: "bg-emerald-100 text-emerald-800" },
  ha_declinato: { etichetta: "Ha declinato", colore: "bg-slate-200 text-slate-600" },
  scaduta: { etichetta: "Scaduta", colore: "bg-amber-100 text-amber-800" },
};

/** Giorni di silenzio dopo i quali, senza una scadenza, conviene sollecitare. */
export const GIORNI_PRIMA_DEL_SOLLECITO = 5;

const giorni = (da: string, a: string) =>
  Math.floor((Date.parse(a.slice(0, 10)) - Date.parse(da.slice(0, 10))) / 86_400_000);

/**
 * In attesa diventa «da sollecitare» quando la scadenza delle offerte è
 * passata o, senza scadenza, dopo {@link GIORNI_PRIMA_DEL_SOLLECITO} giorni
 * dalla richiesta.
 */
export function statoRigaFornitore(
  f: { status: string; inviata_at?: string | null },
  scadenzaOfferte: string | null | undefined,
  oggi: string,
): StatoRigaFornitore {
  switch (f.status) {
    case "risposta":
      return "ha_risposto";
    case "rifiutata":
      return "ha_declinato";
    case "scaduta":
      return "scaduta";
    case "da_inviare":
      return "da_inviare";
    default: {
      if (scadenzaOfferte && scadenzaOfferte < oggi) return "sollecitare";
      if (!scadenzaOfferte && f.inviata_at && giorni(f.inviata_at, oggi) >= GIORNI_PRIMA_DEL_SOLLECITO)
        return "sollecitare";
      return "in_attesa";
    }
  }
}

/**
 * Il totale offerto da mostrare nel campo. Scritto a mano (o letto dall'AI dal
 * documento) vince sempre e non si tocca; altrimenti si propone la somma delle
 * voci del confronto, trasporto extra compreso — lo stesso numero che usano il
 * confronto (`confrontoOfferta`) e l'aggiudicazione (`rdo_aggiudica`) quando
 * `totale_offerto` è vuoto. La proposta non si salva: resta un suggerimento.
 */
export function totaleOffertoProposto(
  totaleScritto: number | null | undefined,
  totaleConfronto: number | null | undefined,
  trasportoExtra = 0,
): { valore: number; origine: "scritto" | "voci" | "voci_e_trasporto" } | null {
  if (totaleScritto != null) return { valore: Number(totaleScritto), origine: "scritto" };
  if (totaleConfronto == null) return null;
  return { valore: totaleConfronto, origine: trasportoExtra > 0 ? "voci_e_trasporto" : "voci" };
}
