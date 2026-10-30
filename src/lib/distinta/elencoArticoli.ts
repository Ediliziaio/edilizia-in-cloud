/**
 * L'elenco unico degli articoli della commessa (vista per fase): filtri e
 * ordinamento che c'erano nel vecchio «Articoli della Commessa», applicati
 * dentro ogni fase. Regole pure.
 */

/** Le righe che si comprano: le lavorazioni e le descrizioni no. */
export const eMateriale = (m: { natura_riga?: string | null }) => (m.natura_riga ?? "materiale") === "materiale";

export type FiltroFonte = "tutti" | "giacenza" | "fornitore";
export type Ordinamento = "posizione" | "nome" | "stato" | "fornitore";

export const ETICHETTA_ORDINAMENTO: Record<Ordinamento, string> = {
  posizione: "Inserimento",
  nome: "Nome",
  stato: "Stato",
  fornitore: "Fornitore",
};

/** Ordine degli stati di riga, dal primo passo all'ultimo. */
const ORDINE_STATI = ["da_ordinare", "ordinato", "in_produzione", "in_lavorazione", "in_arrivo", "in_magazzino", "installato"];

export interface RigaElenco {
  name: string;
  status?: string | null;
  stock_item_id?: string | null;
  supplier_id?: string | null;
  position?: number | null;
}

export function filtraPerFonte<T extends RigaElenco>(righe: T[], filtro: FiltroFonte): T[] {
  if (filtro === "giacenza") return righe.filter((r) => !!r.stock_item_id);
  if (filtro === "fornitore") return righe.filter((r) => !r.stock_item_id);
  return righe;
}

export function ordinaRighe<T extends RigaElenco>(
  righe: T[],
  ordine: Ordinamento,
  nomeFornitore: (id: string | null) => string | null = () => null,
  /** Il posto della riga sulla scala degli stati mostrata (se manca, lo stato scritto sulla riga). */
  rangoStato?: (r: T) => number,
): T[] {
  const copia = [...righe];
  const perPosizione = (a: T, b: T) => (a.position ?? 0) - (b.position ?? 0);
  if (ordine === "posizione") return copia.sort(perPosizione);
  if (ordine === "nome") return copia.sort((a, b) => a.name.localeCompare(b.name, "it") || perPosizione(a, b));
  if (ordine === "stato") {
    const i = rangoStato ?? ((r: T) => { const k = ORDINE_STATI.indexOf(r.status ?? "da_ordinare"); return k < 0 ? ORDINE_STATI.length : k; });
    return copia.sort((a, b) => i(a) - i(b) || perPosizione(a, b));
  }
  // Fornitore: quelli senza fornitore in fondo.
  return copia.sort((a, b) => {
    const fa = nomeFornitore(a.supplier_id ?? null);
    const fb = nomeFornitore(b.supplier_id ?? null);
    if (!fa !== !fb) return fa ? -1 : 1;
    return (fa ?? "").localeCompare(fb ?? "", "it") || perPosizione(a, b);
  });
}

/** Quante righe per stato (le «pastiglie» in alto del vecchio elenco). */
export function conteggioStati(righe: RigaElenco[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of righe) m.set(r.status || "da_ordinare", (m.get(r.status || "da_ordinare") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => ORDINE_STATI.indexOf(a[0]) - ORDINE_STATI.indexOf(b[0]));
}

/** Una riga si toglie da qui solo se non è mai entrata negli acquisti né in magazzino. */
export function eliminabile(r: { stato: string; status?: string | null; stock_item_id?: string | null }): boolean {
  return r.stato === "da_ordinare" && !r.stock_item_id && (!r.status || r.status === "da_ordinare");
}

/**
 * L'allegato dell'ordine d'acquisto tra quelli della riga: lo stesso criterio
 * del vecchio elenco (nome che inizia con «ODA» o contiene «oda»).
 */
export function allegatoOda<T extends { file_name: string }>(allegati: T[] | null | undefined): T | null {
  return (allegati ?? []).find((a) => a.file_name.startsWith("ODA") || a.file_name.toLowerCase().includes("oda")) ?? null;
}

/** Acconto e saldo di una riga pagata a rate (50/50 o 30/70): null se non ci sono importi. */
export function dettaglioAccontoSaldo(m: {
  payment_method?: string | null; deposit_amount?: number | null; deposit_paid?: boolean | null;
  balance_amount?: number | null; balance_paid?: boolean | null; balance_expected_date?: string | null;
}): { acconto: number; accontoPagato: boolean; saldo: number; saldoPagato: boolean; saldoPrevisto: string | null } | null {
  if (m.payment_method !== "50_50" && m.payment_method !== "30_70") return null;
  if (!m.deposit_amount && !m.balance_amount) return null;
  return {
    acconto: Number(m.deposit_amount ?? 0),
    accontoPagato: !!m.deposit_paid,
    saldo: Number(m.balance_amount ?? 0),
    saldoPagato: !!m.balance_paid,
    saldoPrevisto: m.balance_paid ? null : m.balance_expected_date ?? null,
  };
}

/** Il nome come si confronta: senza accenti, maiuscole, punteggiatura e spazi doppi. */
export const nomeConfrontabile = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface RigaDoppione {
  id?: string;
  name: string;
  phase_id?: string | null;
  article_template_id?: string | null;
  natura_riga?: string | null;
  unita_misura?: string | null;
  stock_item_id?: string | null;
  posizioni?: unknown[] | null;
}

/**
 * La riga che c'è già e che il nuovo articolo raddoppierebbe: stessa fase
 * (anche «nessuna fase») e stesso articolo del listino o stesso nome. Le
 * lavorazioni e le descrizioni non contano: si ripetono di proposito.
 */
export function trovaDoppione<T extends RigaDoppione>(nuovo: RigaDoppione, righe: T[]): T | null {
  if (!eMateriale(nuovo)) return null;
  const nome = nomeConfrontabile(nuovo.name);
  if (!nome) return null;
  return righe.find((r) =>
    r !== nuovo
    && (!nuovo.id || r.id !== nuovo.id)
    && eMateriale(r)
    && (r.phase_id ?? null) === (nuovo.phase_id ?? null)
    && ((!!nuovo.article_template_id && r.article_template_id === nuovo.article_template_id) || nomeConfrontabile(r.name) === nome),
  ) ?? null;
}

/**
 * Le due quantità si sommano solo se misurano la stessa cosa: stessa unità,
 * niente distinta di posizioni (la quantità lì è la loro somma) e niente
 * prelievo dal magazzino (quello ha già scalato la giacenza).
 */
export function quantitaSommabili(a: RigaDoppione, b: RigaDoppione): boolean {
  const unita = (u: string | null | undefined) => (u ?? "").trim().toLowerCase() || "pz";
  return unita(a.unita_misura) === unita(b.unita_misura)
    && !a.stock_item_id && !b.stock_item_id
    && !(a.posizioni?.length) && !(b.posizioni?.length);
}
