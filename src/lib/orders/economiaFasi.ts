/**
 * Economia delle lavorazioni di una commessa (06/10/2026).
 *
 * Per ogni fase tre numeri, come li ragiona un'impresa edile:
 * - VENDUTO: quanto paga il cliente per quella lavorazione. È l'importo
 *   scritto sulla fase dall'ufficio (importo_venduto); se manca, le righe del
 *   contratto collegate alla fase (order_items.phase_id) con un prezzo:
 *   prezzo × quantità, meno lo sconto di riga. Nelle commesse vere le righe
 *   collegate sono spesso materiali senza prezzo di vendita: senza l'importo
 *   sulla fase il venduto di una lavorazione non si potrebbe dire.
 * - COSTO PREVISTO: manodopera e ditte previste (cost_preventivo delle
 *   assegnazioni) più il costo d'acquisto delle righe collegate
 *   (purchase_price, altrimenti standard_cost). Dove nessuna assegnazione ha
 *   un costo previsto, vale quello delle voci del preventivo da cui è nata la
 *   fase (order_work_phase_voci: quantità × costo del listino, 29/10/2026);
 *   lo stesso per i materiali, se nessuna riga collegata ha un costo. Mai le
 *   due cose insieme: sarebbe lo stesso lavoro contato due volte.
 * - COSTO CONSUNTIVO: quello sostenuto. Manodopera e ditte registrate
 *   (total_cost, la fonte del conto economico) più acquisti e scarichi di
 *   magazzino delle righe della fase, con la regola di v_ordine_marginalita:
 *   lo scarico di una riga già coperta da un ordine d'acquisto non si conta
 *   due volte.
 * Quello che non sta in una fase (righe e persone senza fase) va in
 * `senzaFase`; provvigioni, errori, costi diretti e rimborsi restano del conto
 * economico della commessa.
 */

export interface RigaContrattoFase {
  id: string;
  phase_id: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  purchase_price: number | null;
  standard_cost: number | null;
}

export interface AssegnazioneFase {
  phase_id: string | null;
  /** employee = persona interna (order_employees), team = ditta (order_external_teams). */
  source: "employee" | "team";
  cost_preventivo: number;
  cost_consuntivo: number;
  /** Solo ditte: gli importi si scrivono IVA inclusa; qui si confrontano col venduto senza IVA. 22 se manca. */
  vat_rate?: number | null;
}

/** Voce prevista della lavorazione (order_work_phase_voci): unitari senza IVA. */
export interface VocePrevistaFase {
  phase_id: string;
  quantita: number;
  costo_manodopera: number;
  costo_materiali: number;
}

/** Riga di un ordine d'acquisto della commessa già emesso (inviato, confermato, parziale, ricevuto). */
export interface RigaAcquisto {
  order_item_id: string | null;
  quantity?: number | null;
  line_total: number | null;
}

/** Movimento di magazzino della commessa, col suo costo unitario. */
export interface MovimentoMagazzino {
  order_item_id: string | null;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  rientro_commessa?: boolean | null;
  notes?: string | null;
}

export interface VociCosto {
  manodopera: number;
  ditte: number;
  materiali: number;
}

/** Da dove viene il venduto: scritto sulla fase, dalle righe del contratto, o non c'è. */
export type FonteVenduto = "fase" | "righe" | null;

/**
 * Da dove viene il costo previsto. Lavoro: le assegnazioni (persone e ditte) o
 * le voci del preventivo. Materiali: le righe del contratto o le voci del
 * preventivo. «misto» solo nel totale, quando le fasi non vanno tutte uguali.
 */
export interface FontePrevisto {
  lavoro: "assegnazioni" | "preventivo" | "misto" | null;
  materiali: "righe" | "preventivo" | "misto" | null;
}

export interface EconomiaFase {
  venduto: number;
  fonteVenduto: FonteVenduto;
  /** Venduto delle righe del contratto collegate, anche quando sulla fase è scritto un altro importo. */
  vendutoRighe: number;
  costoPrevisto: number;
  costoConsuntivo: number;
  previsto: VociCosto;
  consuntivo: VociCosto;
  fontePrevisto: FontePrevisto;
  /** Voci del preventivo collegate alla fase. */
  vociPreviste: number;
  /** Consuntivo meno previsto: sopra zero il costo ha sforato. */
  scostamento: number;
  /** Margine % sul venduto; null senza venduto. */
  marginePrevistoPct: number | null;
  margineConsuntivoPct: number | null;
  /** Righe del contratto collegate alla fase, con o senza prezzo di vendita. */
  righe: number;
}

export interface EconomiaFasi {
  perFase: Map<string, EconomiaFase>;
  /** Righe e assegnazioni della commessa che non stanno in nessuna fase. */
  senzaFase: EconomiaFase;
  /** Somma delle fasi, senza `senzaFase`. */
  totaleFasi: EconomiaFase;
  /** Fasi senza venduto: né scritto sulla fase né dalle righe del contratto. */
  fasiSenzaVenduto: number;
}

const numero = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const centesimi = (v: number) => Math.round(v * 100) / 100;

interface Somme {
  /** Venduto scritto sulla fase; null = dalle righe. */
  importo: number | null;
  vendutoRighe: number;
  righePrezzate: number;
  previsto: VociCosto;
  consuntivo: VociCosto;
  righe: number;
  fonte: FontePrevisto;
  /** La fase ha almeno una ditta: il lavoro del preventivo va alle ditte. */
  haDitta: boolean;
  voci: { n: number; lavoro: number; materiali: number };
}

const vuote = (importo: number | null = null): Somme => ({
  importo,
  vendutoRighe: 0,
  righePrezzate: 0,
  previsto: { manodopera: 0, ditte: 0, materiali: 0 },
  consuntivo: { manodopera: 0, ditte: 0, materiali: 0 },
  righe: 0,
  fonte: { lavoro: null, materiali: null },
  haDitta: false,
  voci: { n: 0, lavoro: 0, materiali: 0 },
});

/** Unisce le fonti delle fasi nel totale. */
function unisci<T extends string>(a: T | "misto" | null, b: T | "misto" | null): T | "misto" | null {
  if (a === null) return b;
  if (b === null || a === b) return a;
  return "misto";
}

/** L'importo scritto sulla fase, se è un numero valido (mai sotto zero). */
const importoFase = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
};

function vendutoDi(s: Somme): { venduto: number; fonte: FonteVenduto } {
  if (s.importo != null) return { venduto: s.importo, fonte: "fase" };
  return { venduto: s.vendutoRighe, fonte: s.righePrezzate > 0 ? "righe" : null };
}

const VOCI = ["manodopera", "ditte", "materiali"] as const;

/** Prezzo di vendita della riga del contratto, sconto di riga compreso. */
export function vendutoRiga(r: Pick<RigaContrattoFase, "quantity" | "unit_price" | "discount_percent">): number {
  const sconto = Math.min(100, Math.max(0, numero(r.discount_percent)));
  return numero(r.quantity) * numero(r.unit_price) * (1 - sconto / 100);
}

/** Costo previsto della riga: costo d'acquisto, altrimenti costo standard. */
export function costoPrevistoRiga(r: Pick<RigaContrattoFase, "quantity" | "purchase_price" | "standard_cost">): number {
  const unitario = numero(r.purchase_price) > 0 ? numero(r.purchase_price) : numero(r.standard_cost);
  return numero(r.quantity) * unitario;
}

/**
 * Costo sostenuto per ogni riga del contratto: le righe degli ordini
 * d'acquisto emessi, più gli scarichi di magazzino (meno i resi, mai sotto
 * zero) delle righe che nessun acquisto copre, come in v_ordine_marginalita.
 */
export function costoConsuntivoRighe(
  acquisti: ReadonlyArray<RigaAcquisto>,
  movimenti: ReadonlyArray<MovimentoMagazzino>,
): Map<string, number> {
  const costo = new Map<string, number>();
  const coperte = new Set<string>();
  const quantitaOda = new Map<string, number>();
  for (const a of acquisti) {
    if (!a.order_item_id) continue;
    coperte.add(a.order_item_id);
    costo.set(a.order_item_id, (costo.get(a.order_item_id) ?? 0) + numero(a.line_total));
    quantitaOda.set(a.order_item_id, (quantitaOda.get(a.order_item_id) ?? 0) + numero(a.quantity));
  }
  // Riga coperta da un ordine al fornitore: la merce che rientra in magazzino esce dal costo, in
  // proporzione a quanto è tornato (la stessa regola di v_ordine_marginalita).
  const scaricato = new Map<string, number>();
  const rientrato = new Map<string, number>();
  for (const m of movimenti) {
    if (!m.order_item_id || !coperte.has(m.order_item_id)) continue;
    const q = numero(m.quantity);
    const divisione = (m.notes ?? "").startsWith("Divisione tra le fasi:");
    if (m.movement_type === "scarico") scaricato.set(m.order_item_id, (scaricato.get(m.order_item_id) ?? 0) + q);
    else if (m.movement_type === "carico" && m.rientro_commessa) {
      if (divisione) scaricato.set(m.order_item_id, (scaricato.get(m.order_item_id) ?? 0) - q);
      else rientrato.set(m.order_item_id, (rientrato.get(m.order_item_id) ?? 0) + q);
    }
  }
  for (const [id, tornato] of rientrato) {
    if (tornato <= 0) continue;
    const base = Math.max(scaricato.get(id) ?? 0, quantitaOda.get(id) ?? 0, tornato);
    const valore = costo.get(id) ?? 0;
    costo.set(id, valore - valore * Math.min(1, tornato / base));
  }
  const magazzino = new Map<string, number>();
  for (const m of movimenti) {
    if (!m.order_item_id || coperte.has(m.order_item_id)) continue;
    const valore = numero(m.quantity) * numero(m.unit_cost);
    const delta = m.movement_type === "scarico" ? valore : m.movement_type === "carico" ? -valore : 0;
    magazzino.set(m.order_item_id, (magazzino.get(m.order_item_id) ?? 0) + delta);
  }
  for (const [id, valore] of magazzino) costo.set(id, (costo.get(id) ?? 0) + Math.max(0, valore));
  return costo;
}

function chiudi(s: Somme, { venduto: lordo, fonte }: { venduto: number; fonte: FonteVenduto }): EconomiaFase {
  const previsto = { manodopera: centesimi(s.previsto.manodopera), ditte: centesimi(s.previsto.ditte), materiali: centesimi(s.previsto.materiali) };
  const consuntivo = { manodopera: centesimi(s.consuntivo.manodopera), ditte: centesimi(s.consuntivo.ditte), materiali: centesimi(s.consuntivo.materiali) };
  const costoPrevisto = centesimi(s.previsto.manodopera + s.previsto.ditte + s.previsto.materiali);
  const costoConsuntivo = centesimi(s.consuntivo.manodopera + s.consuntivo.ditte + s.consuntivo.materiali);
  const venduto = centesimi(lordo);
  const margine = (costo: number) => (venduto > 0 ? Math.round(((venduto - costo) / venduto) * 1000) / 10 : null);
  return {
    venduto,
    fonteVenduto: fonte,
    vendutoRighe: centesimi(s.vendutoRighe),
    costoPrevisto,
    costoConsuntivo,
    previsto,
    consuntivo,
    fontePrevisto: { ...s.fonte },
    vociPreviste: s.voci.n,
    scostamento: centesimi(costoConsuntivo - costoPrevisto),
    marginePrevistoPct: margine(costoPrevisto),
    margineConsuntivoPct: margine(costoConsuntivo),
    righe: s.righe,
  };
}

export function economiaFasi(input: {
  fasi: ReadonlyArray<{ id: string; importo_venduto?: number | null }>;
  righe: ReadonlyArray<RigaContrattoFase>;
  assegnazioni: ReadonlyArray<AssegnazioneFase>;
  acquisti?: ReadonlyArray<RigaAcquisto>;
  movimenti?: ReadonlyArray<MovimentoMagazzino>;
  /**
   * Quanto di ogni riga il cantiere ha posato su ogni fase (rapportini
   * approvati, consumiMateriali). Lo stesso articolo si usa su più fasi: il
   * suo costo sostenuto va a ognuna per la parte posata lì. Quello che non è
   * ancora posato né rientrato in magazzino resta alla fase della riga.
   */
  posaPerFase?: ReadonlyMap<string, ReadonlyMap<string | null, number>>;
  /** Voci del preventivo da cui sono nate le fasi: il previsto dove le assegnazioni non ne hanno. */
  vociPreviste?: ReadonlyArray<VocePrevistaFase>;
}): EconomiaFasi {
  const somme = new Map<string, Somme>();
  for (const f of input.fasi) somme.set(f.id, vuote(importoFase(f.importo_venduto)));
  const fuori = vuote();
  const di = (faseId: string | null) => (faseId && somme.get(faseId)) || fuori;

  const consuntivoRighe = costoConsuntivoRighe(input.acquisti ?? [], input.movimenti ?? []);
  // Quanto di ogni riga è stato comprato (ordini emessi) o preso dal magazzino, e quanto è rientrato:
  // la stessa base di costoConsuntivoRighe e di v_ordine_marginalita, non la quantità scritta sulla riga.
  const rientrati = new Map<string, number>();
  const scaricati = new Map<string, number>();
  for (const m of input.movimenti ?? []) {
    if (!m.order_item_id) continue;
    const divisione = (m.notes ?? "").startsWith("Divisione tra le fasi:");
    if (m.movement_type === "scarico") scaricati.set(m.order_item_id, (scaricati.get(m.order_item_id) ?? 0) + numero(m.quantity));
    else if (m.movement_type === "carico" && m.rientro_commessa) {
      if (divisione) scaricati.set(m.order_item_id, (scaricati.get(m.order_item_id) ?? 0) - numero(m.quantity));
      else rientrati.set(m.order_item_id, (rientrati.get(m.order_item_id) ?? 0) + numero(m.quantity));
    }
  }
  const ordinati = new Map<string, number>();
  for (const a of input.acquisti ?? []) {
    if (a.order_item_id) ordinati.set(a.order_item_id, (ordinati.get(a.order_item_id) ?? 0) + numero(a.quantity));
  }
  for (const r of input.righe) {
    const s = di(r.phase_id);
    const prezzo = vendutoRiga(r);
    s.vendutoRighe += prezzo;
    if (prezzo > 0) s.righePrezzate += 1;
    s.previsto.materiali += costoPrevistoRiga(r);
    s.righe += 1;
    const costo = consuntivoRighe.get(r.id) ?? 0;
    const posa = input.posaPerFase?.get(r.id);
    const posati = posa ? [...posa.values()].reduce((n, q) => n + q, 0) : 0;
    if (!posa || posati <= 0 || costo === 0) {
      s.consuntivo.materiali += costo;
      continue;
    }
    // Il costo vale per quanto è ancora fuori dal magazzino: si divide tra le fasi in proporzione
    // al posato; la parte non ancora posata resta alla fase della riga.
    const comprati = Math.max(ordinati.get(r.id) ?? 0, scaricati.get(r.id) ?? 0) || numero(r.quantity);
    const fuori = Math.max(posati, comprati - (rientrati.get(r.id) ?? 0));
    let assegnato = 0;
    for (const [fase, q] of posa) {
      const parte = (costo * q) / fuori;
      // Posato senza fase, o su una fase che non c'è più: resta alla fase della riga.
      di(fase && somme.has(fase) ? fase : r.phase_id).consuntivo.materiali += parte;
      assegnato += parte;
    }
    s.consuntivo.materiali += costo - assegnato;
  }
  for (const a of input.assegnazioni) {
    const s = di(a.phase_id);
    const voce = a.source === "team" ? "ditte" : "manodopera";
    // Le ditte sono scritte IVA inclusa (come in v_ordine_marginalita): senza IVA contro il venduto.
    const iva = a.source === "team" ? 1 + (a.vat_rate == null || !Number.isFinite(Number(a.vat_rate)) ? 22 : Number(a.vat_rate)) / 100 : 1;
    s.previsto[voce] += numero(a.cost_preventivo) / iva;
    s.consuntivo[voce] += numero(a.cost_consuntivo) / iva;
    if (a.source === "team") s.haDitta = true;
  }
  for (const v of input.vociPreviste ?? []) {
    const s = somme.get(v.phase_id);
    if (!s) continue;
    const q = Math.max(0, numero(v.quantita));
    s.voci.n += 1;
    s.voci.lavoro += q * Math.max(0, numero(v.costo_manodopera));
    s.voci.materiali += q * Math.max(0, numero(v.costo_materiali));
  }
  for (const s of [...somme.values(), fuori]) {
    if (s.previsto.manodopera + s.previsto.ditte > 0) s.fonte.lavoro = "assegnazioni";
    else if (s.voci.lavoro > 0) {
      // Senza IVA, come sul preventivo: non si divide come i costi scritti sulle ditte.
      s.previsto[s.haDitta ? "ditte" : "manodopera"] += s.voci.lavoro;
      s.fonte.lavoro = "preventivo";
    }
    if (s.previsto.materiali > 0) s.fonte.materiali = "righe";
    else if (s.voci.materiali > 0) {
      s.previsto.materiali += s.voci.materiali;
      s.fonte.materiali = "preventivo";
    }
  }

  const perFase = new Map<string, EconomiaFase>();
  const totale = vuote();
  let vendutoTotale = 0;
  const fonti = new Set<FonteVenduto>();
  let fasiSenzaVenduto = 0;
  for (const [id, s] of somme) {
    const v = vendutoDi(s);
    perFase.set(id, chiudi(s, v));
    vendutoTotale += v.venduto;
    fonti.add(v.fonte);
    if (v.fonte === null) fasiSenzaVenduto += 1;
    totale.vendutoRighe += s.vendutoRighe;
    totale.righePrezzate += s.righePrezzate;
    totale.righe += s.righe;
    totale.voci.n += s.voci.n;
    totale.fonte = { lavoro: unisci(totale.fonte.lavoro, s.fonte.lavoro), materiali: unisci(totale.fonte.materiali, s.fonte.materiali) };
    for (const voce of VOCI) {
      totale.previsto[voce] += s.previsto[voce];
      totale.consuntivo[voce] += s.consuntivo[voce];
    }
  }
  const fonteTotale: FonteVenduto = fonti.has("fase") ? "fase" : fonti.has("righe") ? "righe" : null;
  return {
    perFase,
    senzaFase: chiudi(fuori, vendutoDi(fuori)),
    totaleFasi: chiudi(totale, { venduto: vendutoTotale, fonte: fonteTotale }),
    fasiSenzaVenduto,
  };
}
