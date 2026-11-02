/** La parte di calcolo della scelta delle voci dal listino: quantità, totale, voci già presenti. */
export interface VoceScelta {
  descrizione: string; unita_misura: string; unita_originale?: string | null; prezzo_unitario: number;
  costo_materiali: number; costo_manodopera: number; capitolo_nome?: string; listino_voce_id?: string | null;
  fonte?: string | null; codice_tariffa?: string | null; famiglia_id?: string | null; immagine_url?: string | null;
  descrizione_estesa?: string | null; quantita?: number;
}

export interface RigaScelta {
  chiave: string; descrizione: string; meta?: string; immagine?: string | null; prezzo: number; unitaLabel: string;
  /** Prodotto al metro quadro: la quantità va scritta, non vale 1. */
  chiedeQuantita?: boolean;
  voce: VoceScelta;
}

/** «2,5» e «2.5» sono la stessa quantità. Null se non è un numero positivo. */
export function leggiQuantita(testo: string): number | null {
  const n = Number(testo.trim().replace(",", "."));
  return testo.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Le voci pronte da aggiungere, il totale, e quante aspettano ancora una quantità valida. */
export function totaleScelte(scelte: readonly { riga: RigaScelta; quantita: string }[]) {
  const voci: VoceScelta[] = [];
  let totale = 0;
  let mancanti = 0;
  for (const s of scelte) {
    const q = leggiQuantita(s.quantita);
    if (q === null) { mancanti++; continue; }
    voci.push({ ...s.riga.voce, quantita: q });
    totale += s.riga.prezzo * q;
  }
  return { voci, totale: Math.round(totale * 100) / 100, mancanti };
}

const normalizza = (t: string) => t.split("\n")[0].trim().toLowerCase();

export function voceGiaPresente(descrizione: string, presenti: readonly string[]): boolean {
  const d = normalizza(descrizione);
  return !!d && presenti.some((p) => normalizza(p) === d);
}

export function rigaVoceLibera(testo: string, capitolo?: string): VoceScelta {
  return { descrizione: testo.trim() || "Nuova voce", unita_misura: "cad", prezzo_unitario: 0, costo_materiali: 0, costo_manodopera: 0, capitolo_nome: capitolo, quantita: 1 };
}
