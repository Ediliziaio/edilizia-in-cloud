// ============================================================================
// Collegamenti di una bolla — che cosa si può cambiare, e che cosa mostrare
// ----------------------------------------------------------------------------
// Una bolla si lega a quattro cose: l'ordine al fornitore, il fornitore, la
// commessa e la destinazione (magazzino o cantiere). Nessuna è obbligatoria:
// una bolla senza ordine e senza commessa è una bolla valida (11/11/2026).
//
// Più commesse: la testata ha UNA commessa, quella proposta a ogni riga. Le
// righe confermate nelle consegne (`ddt_consegne.order_id`) portano ciascuna la
// propria: una bolla per due cantieri si divide lì, riga per riga, senza
// tabelle nuove. Qui si mettono insieme le due fonti per farle vedere.
//
// Le protezioni (11/11/2026, scheda «Collegamenti»):
//   - bolla verificata: non si cambia niente, prima si riapre;
//   - merce già registrata (consegne, ricezioni, arrivo sull'ordine, carico a
//     magazzino): fornitore, ordine e destinazione restano quelli. La commessa
//     della testata invece si cambia sempre: ogni consegna già fatta conserva
//     la sua, e la nuova vale solo per le righe ancora da confermare.
// ============================================================================

export type CampoCollegamento = "ordine" | "fornitore" | "commessa" | "destinazione";

export interface StatoBolla {
  stato: string;
  /** Righe già confermate nelle consegne (tabella ddt_consegne). */
  consegne: number;
  /** Ricezioni per articolo (goods_receipts) legate alla bolla. */
  ricezioni: number;
  /** Almeno una riga con l'arrivo registrato sull'ordine o un movimento. */
  arrivoRegistrato: boolean;
  /** La merce è entrata in giacenza da questa bolla. */
  caricataAMagazzino: boolean;
}

/** Perché un collegamento non si può cambiare; `null` se si può. */
export function bloccoCollegamento(campo: CampoCollegamento, s: StatoBolla): string | null {
  if (s.stato === "verificato")
    return "La bolla è verificata. Per cambiarla rimettila «Ricevuto» con Modifica.";
  const merceEntrata = s.consegne > 0 || s.ricezioni > 0 || s.arrivoRegistrato;
  switch (campo) {
    case "commessa":
      return null;
    case "fornitore":
      return merceEntrata ? "La merce è già registrata con questo fornitore." : null;
    case "ordine":
      return merceEntrata ? "L'arrivo è già registrato su quest'ordine." : null;
    case "destinazione":
      if (merceEntrata || s.caricataAMagazzino)
        return "La merce è già entrata: la destinazione si sceglie riga per riga nelle consegne.";
      return null;
  }
}

export interface CommessaCollegata {
  id: string;
  codice: string | null;
  /** È la commessa della testata, proposta alle righe ancora da confermare. */
  principale: boolean;
  /** Quante consegne confermate vanno su questa commessa. */
  consegne: number;
}

/**
 * Le commesse di una bolla: quella della testata per prima, poi quelle delle
 * consegne confermate, ognuna una volta sola.
 */
export function commesseDellaBolla(
  principale: { id: string; codice: string | null } | null,
  consegne: ReadonlyArray<{ order_id: string | null; tipo?: string }>,
  codici: ReadonlyMap<string, string>,
): CommessaCollegata[] {
  const conta = new Map<string, number>();
  for (const c of consegne) {
    if (!c.order_id || c.tipo === "reso") continue;
    conta.set(c.order_id, (conta.get(c.order_id) ?? 0) + 1);
  }
  const out: CommessaCollegata[] = [];
  if (principale)
    out.push({
      id: principale.id,
      codice: principale.codice ?? codici.get(principale.id) ?? null,
      principale: true,
      consegne: conta.get(principale.id) ?? 0,
    });
  for (const [id, n] of conta) {
    if (principale?.id === id) continue;
    out.push({ id, codice: codici.get(id) ?? null, principale: false, consegne: n });
  }
  return out;
}

/**
 * Lo scarto fra il totale scritto in testata e la somma delle righe, se c'è
 * da dirlo. Una testata a zero non è uno scarto: è un campo che nessuno ha
 * compilato (11/11/2026: «la quantità in testata è 0, la somma delle righe è
 * 1» compariva su bolle perfettamente in ordine).
 */
export function avvisoQuantitaTestata(
  testata: number | null | undefined,
  sommaRighe: number,
  unitaDiverse: number,
): string | null {
  if (testata == null || !(testata > 0) || !(sommaRighe > 0) || unitaDiverse !== 1) return null;
  const scarto = Math.round((testata - sommaRighe) * 1000) / 1000;
  if (scarto === 0) return null;
  const n = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 3 });
  return `In testata c'è scritto ${n(testata)}, ma le righe fanno ${n(sommaRighe)}. Contano le righe.`;
}

/** Nome leggibile di chi ha registrato la bolla. */
export function nomePersona(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const nome = [p.first_name, p.last_name].map((s) => s?.trim()).filter(Boolean).join(" ");
  return nome || p.email?.trim() || null;
}

export type StatoCarico =
  | { tipo: "caricata"; il: string }
  | { tipo: "da_caricare"; righe: number }
  | { tipo: "non_confermato" };

/**
 * A che punto è il carico in magazzino di una bolla (12/11/2026).
 *
 * La data sta in `caricata_a_magazzino_at`, che fino al 12/11 scriveva solo la
 * vecchia strada (bolla_carica_magazzino, mai chiamata): le bolle confermate
 * dalle consegne restavano «Carico non ancora confermato» a merce già in
 * giacenza. Qui contano anche gli ingressi in magazzino delle consegne, così è
 * giusto pure per le bolle confermate prima della correzione.
 *
 * Una bolla per il magazzino con righe ancora aperte ha merce da caricare:
 * lo si dice prima di tutto, anche se una parte è già entrata.
 */
export function statoCaricoMagazzino(p: {
  destinazione: string | null | undefined;
  caricataIl: string | null | undefined;
  consegne: ReadonlyArray<{ destinazione: string; tipo: string; created_at?: string | null }>;
  righeAperte: number;
}): StatoCarico {
  if (p.destinazione === "magazzino" && p.righeAperte > 0) return { tipo: "da_caricare", righe: p.righeAperte };
  if (p.caricataIl) return { tipo: "caricata", il: p.caricataIl };
  const ingressi = p.consegne
    .filter((c) => c.destinazione === "magazzino" && c.tipo === "ingresso" && c.created_at)
    .map((c) => c.created_at as string)
    .sort();
  if (ingressi.length > 0) return { tipo: "caricata", il: ingressi[ingressi.length - 1] };
  return { tipo: "non_confermato" };
}
