// ============================================================================
// bonusFiscali — ripartizione di UNA commessa su PIÙ bonus edilizi
// ============================================================================
// Perché esiste: un contratto serramenti da 20.000 € può valere 10.000 € di
// Ecobonus infissi e 10.000 € di misure antintrusione (art. 16-bis lett. f).
// Sono DUE pratiche distinte, quindi DUE bonifici parlanti con causali diverse:
// se il cliente ne fa uno solo, una delle due detrazioni salta.
//
// Basi di calcolo (sono diverse, ed è la fonte di tutti gli errori):
//  • RITENUTA 11% (art. 25 D.L. 78/2010) → sul lordo del bonifico scorporato
//    con l'IVA CONVENZIONALE del 22%, non con quella della fattura: la banca
//    l'aliquota vera non la conosce (circolare AdE 40/E/2010). La trattiene su
//    ogni bonifico parlante; l'impresa la recupera in dichiarazione, ma in
//    cassa entra il netto.
//  • DETRAZIONE del cliente → sulla spesa effettivamente sostenuta, quindi
//    IVA INCLUSA, entro il tetto per unità immobiliare.
//
// Modulo puro: nessun import da React/Supabase, così è testabile a secco.
import { arrotondaCentesimi } from "@/lib/numberUtils";
// ============================================================================
import { DETRAZIONI_EDILIZIE, type DetrazionePreset } from "@/lib/fatturazione/detrazioniEdilizie";

/**
 * Ritenuta d'acconto trattenuta dalla banca sui bonifici parlanti.
 * 11% dal 1° marzo 2024 (L. 213/2023 art. 1 c. 88, che modifica l'art. 25
 * D.L. 78/2010); prima era l'8%.
 */
export const RITENUTA_BONIFICO_PARLANTE = 0.11;

/**
 * IVA con cui la BANCA scorpora l'imponibile dal bonifico. NON è l'IVA della
 * fattura: l'istituto non la conosce e non può leggerla, quindi per prassi
 * (circolare Agenzia delle Entrate 40/E del 2010) scorpora SEMPRE con
 * l'aliquota ordinaria più alta, il 22%, qualunque sia quella applicata.
 *
 * È il punto in cui questo modulo sbagliava: calcolava l'11% sull'imponibile
 * VERO. Su un lavoro con IVA al 10% — il caso normale in ristrutturazione —
 * la trattenuta risultava più alta di circa un decimo, e l'incasso previsto
 * più basso del dovuto: su 11.000 € il conto dava 1.100 € invece di 991,80 €.
 * Coincidono solo quando l'IVA della fattura è davvero il 22%.
 */
export const IVA_SCORPORO_BANCA = 0.22;

/** La ritenuta che la banca trattiene su un bonifico parlante di importo lordo. */
export function ritenutaSuLordo(lordo: number): number {
  return round2((num(lordo) / (1 + IVA_SCORPORO_BANCA)) * RITENUTA_BONIFICO_PARLANTE);
}

/** Tolleranza in € entro cui la ripartizione si considera quadrata (arrotondamenti). */
export const TOLLERANZA_QUADRATURA = 0.01;

// Stessa regola della fatturazione: l'epsilon qui non bastava.
const round2 = arrotondaCentesimi;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface BonusLine {
  /** Presente solo per righe già salvate su order_bonus_lines. */
  id?: string;
  position: number;
  /** id del preset in DETRAZIONI_EDILIZIE; null = agevolazione scritta a mano. */
  presetId: string | null;
  label: string;
  /** Quota di IMPONIBILE assegnata a questo bonus (stessa base di orders.total_amount). */
  imponibile: number;
  /** Aliquota di DETRAZIONE (50, 65, 75…), non l'IVA. */
  aliquotaDetrazione: number | null;
  /** Causale del bonifico parlante, editabile dall'utente. */
  causale: string;
  note?: string | null;
}

export function getPreset(presetId: string | null | undefined): DetrazionePreset | null {
  if (!presetId) return null;
  return DETRAZIONI_EDILIZIE.find((p) => p.id === presetId) ?? null;
}

/** Riga nuova a partire da un preset (label, aliquota e causale precompilate). */
export function bonusLineFromPreset(
  presetId: string,
  position: number,
  imponibile = 0,
): BonusLine {
  const preset = getPreset(presetId);
  return {
    position,
    presetId: preset ? presetId : null,
    label: preset?.label ?? "Agevolazione",
    imponibile: round2(num(imponibile)),
    aliquotaDetrazione: preset?.aliquotaNum ?? null,
    causale: preset?.clausola ?? "",
  };
}

/** Riga vuota (agevolazione da scegliere). */
export function bonusLineVuota(position: number, imponibile = 0): BonusLine {
  return {
    position,
    presetId: null,
    label: "",
    imponibile: round2(num(imponibile)),
    aliquotaDetrazione: null,
    causale: "",
  };
}

// ── Quadratura ──────────────────────────────────────────────────────────────

export function totaleImponibileBonus(lines: BonusLine[]): number {
  return round2(lines.reduce((s, l) => s + num(l.imponibile), 0));
}

/**
 * Quanto resta da assegnare alle righe-bonus perché la somma torni col totale
 * commessa. Positivo = manca, negativo = assegnato più del contratto.
 */
export function residuoBonus(totaleCommessa: number, lines: BonusLine[]): number {
  return round2(num(totaleCommessa) - totaleImponibileBonus(lines));
}

/**
 * Riparte il totale sulle righe lasciando che l'ULTIMA assorba il resto:
 * la somma torna sempre esatta, senza derive da arrotondamento.
 * Le righe già valorizzate a mano restano intatte; l'ultima fa da valvola.
 */
export function assorbiResiduoSullUltima(totaleCommessa: number, lines: BonusLine[]): BonusLine[] {
  if (lines.length === 0) return lines;
  const testa = lines.slice(0, -1);
  const usato = totaleImponibileBonus(testa);
  const resto = Math.max(0, round2(num(totaleCommessa) - usato));
  return [...testa, { ...lines[lines.length - 1], imponibile: resto }];
}

// ── Numeri per riga ─────────────────────────────────────────────────────────

/** Importo lordo (IVA inclusa) del bonifico relativo a questa riga. */
export function lordoRiga(line: BonusLine, vatRate: number | null | undefined): number {
  const iva = num(vatRate);
  return round2(num(line.imponibile) * (1 + (iva > 0 ? iva / 100 : 0)));
}

/**
 * Ritenuta trattenuta dalla banca su questa riga.
 * Base: il LORDO del bonifico scorporato al 22% convenzionale — è quello che
 * fa la banca, non l'imponibile di fattura.
 */
export function ritenutaRiga(line: BonusLine, vatRate: number | null | undefined): number {
  const preset = getPreset(line.presetId);
  // Bonus mobili/verde non passano dal bonifico parlante → nessuna ritenuta.
  if (preset && preset.richiedeBonificoParlante === false) return 0;
  return ritenutaSuLordo(lordoRiga(line, vatRate));
}

/** Quanto entra davvero in banca per questa riga (lordo − ritenuta). */
export function nettoIncassatoRiga(line: BonusLine, vatRate: number | null | undefined): number {
  return round2(lordoRiga(line, vatRate) - ritenutaRiga(line, vatRate));
}

/**
 * Detrazione stimata per il cliente: sulla spesa IVA INCLUSA, entro il tetto
 * del preset. È una stima commerciale, non una consulenza fiscale.
 */
export function detrazioneRiga(line: BonusLine, vatRate: number | null | undefined): number {
  const aliquota = num(line.aliquotaDetrazione);
  if (aliquota <= 0) return 0;
  const lordo = lordoRiga(line, vatRate);
  const tetto = getPreset(line.presetId)?.tettoSpesa;
  const base = tetto != null ? Math.min(lordo, tetto) : lordo;
  return round2(base * (aliquota / 100));
}

/** Vero se la spesa della riga sfora il tetto del suo preset. */
export function sforaTetto(line: BonusLine, vatRate: number | null | undefined): boolean {
  const tetto = getPreset(line.presetId)?.tettoSpesa;
  if (tetto == null) return false;
  return lordoRiga(line, vatRate) > tetto + TOLLERANZA_QUADRATURA;
}

export interface TotaliBonus {
  imponibile: number;
  lordo: number;
  ritenuta: number;
  netto: number;
  detrazione: number;
}

export function totaliBonus(lines: BonusLine[], vatRate: number | null | undefined): TotaliBonus {
  const t = lines.reduce(
    (acc, l) => ({
      imponibile: acc.imponibile + num(l.imponibile),
      lordo: acc.lordo + lordoRiga(l, vatRate),
      ritenuta: acc.ritenuta + ritenutaRiga(l, vatRate),
      detrazione: acc.detrazione + detrazioneRiga(l, vatRate),
    }),
    { imponibile: 0, lordo: 0, ritenuta: 0, detrazione: 0 },
  );
  return {
    imponibile: round2(t.imponibile),
    lordo: round2(t.lordo),
    ritenuta: round2(t.ritenuta),
    netto: round2(t.lordo - t.ritenuta),
    detrazione: round2(t.detrazione),
  };
}

// ── Validazione ─────────────────────────────────────────────────────────────

export interface EsitoValidazione {
  ok: boolean;
  residuo: number;
  errori: string[];
  avvisi: string[];
}

export function validaBonusLines(
  totaleCommessa: number,
  lines: BonusLine[],
  vatRate: number | null | undefined,
): EsitoValidazione {
  const errori: string[] = [];
  const avvisi: string[] = [];
  const residuo = residuoBonus(totaleCommessa, lines);

  if (lines.length === 0) {
    errori.push("Aggiungi almeno un'agevolazione o spegni il bonus edilizio.");
  }
  lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.presetId && !l.label.trim()) errori.push(`Riga ${n}: scegli l'agevolazione.`);
    if (num(l.imponibile) <= 0) errori.push(`Riga ${n}: l'importo deve essere maggiore di zero.`);
    if (sforaTetto(l, vatRate)) {
      const tetto = getPreset(l.presetId)?.tettoSpesa ?? 0;
      avvisi.push(
        `Riga ${n} (${l.label || "agevolazione"}): la spesa supera il tetto indicativo di € ${tetto.toLocaleString("it-IT")} — la detrazione si ferma lì.`,
      );
    }
  });

  // Due righe sullo stesso preset = una sola pratica spezzata per errore.
  const visti = new Set<string>();
  lines.forEach((l, i) => {
    if (!l.presetId) return;
    if (visti.has(l.presetId)) {
      avvisi.push(`Riga ${i + 1}: stessa agevolazione già usata sopra — di solito va accorpata.`);
    }
    visti.add(l.presetId);
  });

  if (Math.abs(residuo) > TOLLERANZA_QUADRATURA) {
    errori.push(
      residuo > 0
        ? `Mancano € ${residuo.toLocaleString("it-IT", { minimumFractionDigits: 2 })} da assegnare.`
        : `Hai assegnato € ${Math.abs(residuo).toLocaleString("it-IT", { minimumFractionDigits: 2 })} in più del totale commessa.`,
    );
  }

  return { ok: errori.length === 0, residuo, errori, avvisi };
}

// ── Causale del bonifico parlante ───────────────────────────────────────────

export interface DatiCausale {
  /** Codice fiscale di chi porta in detrazione (il cliente). */
  cfBeneficiario?: string | null;
  /** P.IVA (o CF) dell'impresa che esegue i lavori. */
  pivaImpresa?: string | null;
  /** Riferimento fattura, se già emessa. */
  numeroFattura?: string | null;
  dataFattura?: string | null;
}

/**
 * Testo pronto da incollare nella causale del bonifico parlante. Senza il
 * riferimento normativo + CF + P.IVA la banca applica comunque la ritenuta ma
 * l'Agenzia può contestare la detrazione.
 */
export function causaleBonificoParlante(line: BonusLine, dati: DatiCausale = {}): string {
  const preset = getPreset(line.presetId);
  if (preset && preset.richiedeBonificoParlante === false) {
    return `Pagamento ${line.label || preset.label} — pagamento tracciabile (non richiede bonifico parlante).`;
  }
  const pezzi: string[] = [];
  pezzi.push(`Pagamento per lavori con detrazione fiscale — ${line.label || preset?.label || "agevolazione edilizia"}`);
  if (preset?.norma) pezzi.push(preset.norma);
  if (dati.numeroFattura) {
    pezzi.push(`fattura n. ${dati.numeroFattura}${dati.dataFattura ? ` del ${dati.dataFattura}` : ""}`);
  }
  if (dati.cfBeneficiario) pezzi.push(`C.F. beneficiario detrazione ${dati.cfBeneficiario}`);
  if (dati.pivaImpresa) pezzi.push(`P.IVA impresa ${dati.pivaImpresa}`);
  return `${pezzi.join(" — ")}.`;
}

// ── Serializzazione (DB ⇄ UI) ───────────────────────────────────────────────

type RigaDb = {
  id?: string | null;
  position?: number | null;
  preset_id?: string | null;
  label?: string | null;
  imponibile?: number | string | null;
  aliquota_detrazione?: number | string | null;
  causale?: string | null;
  note?: string | null;
};

/** Legge le righe da order_bonus_lines o dal jsonb quotes.bonus_lines. */
export function parseBonusLines(raw: unknown): BonusLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is RigaDb => !!r && typeof r === "object")
    .map((r, i) => ({
      id: r.id ?? undefined,
      position: r.position ?? i,
      presetId: r.preset_id ?? null,
      label: r.label ?? "",
      imponibile: round2(num(r.imponibile)),
      aliquotaDetrazione: r.aliquota_detrazione != null ? num(r.aliquota_detrazione) : null,
      causale: r.causale ?? "",
      note: r.note ?? null,
    }))
    .sort((a, b) => a.position - b.position)
    .map((r, i) => ({ ...r, position: i }));
}

/** Payload per l'insert su order_bonus_lines / quotes.bonus_lines. */
export function serializeBonusLines(lines: BonusLine[]): RigaDb[] {
  return lines.map((l, i) => ({
    position: i,
    preset_id: l.presetId,
    label: l.label || getPreset(l.presetId)?.label || "Agevolazione",
    imponibile: round2(num(l.imponibile)),
    aliquota_detrazione: l.aliquotaDetrazione,
    causale: l.causale || null,
    note: l.note || null,
  }));
}
