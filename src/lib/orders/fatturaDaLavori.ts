/**
 * Cosa fatturare di una commessa: SAL, fasi e voci del computo (02/11/2026).
 *
 * Il già fatturato non sta in una tabella a parte: lo dicono le righe delle
 * fatture, che portano nell'id da dove vengono (`fase:<id>`, `fase:<id>:voce:<id>`,
 * `sal:<id>:…`). Così una bozza eliminata, una fattura annullata o stornata e una
 * riga corretta nell'editor contano subito per quello che sono, senza niente da
 * tenere allineato. Le fatture fatte prima, o con «Un importo», non sono divise
 * per fase, come quelle in archivio (`invoices`): finiscono in `senzaDettaglio` e il
 * popup lo dice.
 *
 * Gli importi di fasi, voci e SAL sono SENZA IVA, come il valore della commessa.
 * Modulo puro: niente React, niente Supabase.
 */
import type { RigaDocumento } from "@/types/fatturazione";
import { maturatoPrecedente, nettoSal, type SalPerNetto } from "./salNetto";
import { certificatoDelSal } from "./salCertificato";

const arrotonda = (n: number): number => Math.round(n * 100) / 100;
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const RIGA_FUORI_DALLE_FASI = "fuori-fasi";
const idFase = (faseId: string) => `fase:${faseId}`;
const idVoce = (faseId: string, voceId: string) => `fase:${faseId}:voce:${voceId}`;
const idSal = (salId: string, parte: string | number) => `sal:${salId}:${parte}`;

/** I documenti che fatturano davvero: niente note di credito, proforma, preventivi, DDT. */
const TIPI_FATTURA = new Set(["fattura", "fattura_pa", "acconto_fattura", "fattura_differita_b", "fattura_accompagnatoria"]);
/** Una fattura annullata o stornata del tutto non conta; una bozza sì, o la stessa quota finirebbe in due fatture. */
const STATI_NULLI = new Set(["annullata", "stornata"]);

export interface DocumentoPerFatturato {
  tipo: string | null;
  stato: string | null;
  deleted_at?: string | null;
  righe: unknown;
  totale_documento?: number | string | null;
  /** Quota assegnata a questa commessa, quando la fattura è su più commesse. */
  importo_associato?: number | string | null;
}

export interface Fatturato {
  perFase: Map<string, number>;
  perVoce: Map<string, number>;
  salFatturati: Set<string>;
  /** Fatturato sulla commessa non attribuibile a una fase (senza IVA). */
  senzaDettaglio: number;
  /** Tutto il fatturato sulla commessa (senza IVA). */
  totale: number;
}

/** Una fattura dell'archivio (importata o sincronizzata), riga di `invoices` senza gemello nei documenti. */
export interface FatturaArchivio {
  id: string;
  document_type: string | null;
  status: string | null;
  subtotal: number | string | null;
}

/**
 * Le fatture d'archivio non hanno righe per fase: valgono come fatturato senza
 * dettaglio, le note di credito col segno meno. Annullate, stornate, bozze e
 * proforma non sono fatturato. Quelle col gemello si tolgono prima: `invoices`
 * rispecchia i documenti del gestionale con lo stesso id.
 */
export function documentiDaArchivio(fatture: ReadonlyArray<FatturaArchivio>, giaLetti: ReadonlySet<string>): DocumentoPerFatturato[] {
  return fatture.flatMap((f): DocumentoPerFatturato[] => {
    if (giaLetti.has(f.id) || !["invoice", "credit_note"].includes(f.document_type ?? "")) return [];
    if (["cancelled", "credited", "draft"].includes(f.status ?? "")) return [];
    const imponibile = Math.abs(numero(f.subtotal)) * (f.document_type === "credit_note" ? -1 : 1);
    return [{ tipo: "fattura", stato: "emessa", righe: [{ id: `archivio:${f.id}`, imponibile }] }];
  });
}

/** La rata ha già la sua fattura: rifarla sarebbe fatturarla due volte. */
export function rataGiaFatturata(rata: { documento_fiscale_id?: string | null } | null | undefined): boolean {
  return !!rata?.documento_fiscale_id;
}

/** La prima rata da proporre: non pagata e non ancora fatturata. */
export function primaRataDaFatturare<T extends { is_paid: boolean; documento_fiscale_id?: string | null }>(rate: ReadonlyArray<T>): T | undefined {
  return rate.find((r) => !r.is_paid && !rataGiaFatturata(r));
}

function imponibileRiga(r: Partial<RigaDocumento>): number {
  if (r.imponibile != null && Number.isFinite(Number(r.imponibile))) return numero(r.imponibile);
  return arrotonda(numero(r.quantita) * numero(r.prezzo_unitario));
}

export function fatturatoDaDocumenti(documenti: ReadonlyArray<DocumentoPerFatturato>): Fatturato {
  const esito: Fatturato = { perFase: new Map(), perVoce: new Map(), salFatturati: new Set(), senzaDettaglio: 0, totale: 0 };
  const somma = (m: Map<string, number>, k: string, v: number) => m.set(k, arrotonda((m.get(k) ?? 0) + v));

  for (const d of documenti) {
    if (d.deleted_at || !TIPI_FATTURA.has(d.tipo ?? "") || STATI_NULLI.has(d.stato ?? "")) continue;
    const righe = Array.isArray(d.righe) ? (d.righe as Array<Partial<RigaDocumento>>) : [];
    // Fattura su più commesse: della parte senza dettaglio conta solo la quota di questa.
    const totaleDoc = numero(d.totale_documento);
    const associato = numero(d.importo_associato);
    const quota = totaleDoc > 0 && associato > 0 && associato < totaleDoc ? associato / totaleDoc : 1;

    for (const r of righe) {
      const id = String(r.id ?? "");
      if (id.startsWith("trattenuta-")) continue; // la garanzia non cambia quanto è stato fatturato
      const imponibile = imponibileRiga(r);
      const voce = /^fase:([^:]+):voce:(.+)$/.exec(id);
      const fase = /^fase:([^:]+)$/.exec(id);
      const sal = /^sal:([^:]+):/.exec(id);
      if (voce) {
        somma(esito.perFase, voce[1], imponibile);
        somma(esito.perVoce, voce[2], imponibile);
      } else if (fase) {
        somma(esito.perFase, fase[1], imponibile);
      } else if (sal) {
        esito.salFatturati.add(sal[1]);
      } else {
        esito.senzaDettaglio = arrotonda(esito.senzaDettaglio + imponibile * quota);
      }
      esito.totale = arrotonda(esito.totale + (voce || fase || sal ? imponibile : imponibile * quota));
    }
  }
  return esito;
}

/** Quanto c'è da fatturare ora di una fase o di una voce: il maturato col suo avanzamento, meno il già fatturato. */
export function quotaDaFatturare(venduto: number, avanzamento: number, giaFatturato: number): number {
  return Math.max(0, arrotonda((numero(venduto) * Math.min(100, Math.max(0, numero(avanzamento)))) / 100 - numero(giaFatturato)));
}

/**
 * Le quote proposte non superano quanto resta del contratto: una fattura fatta
 * prima senza dettaglio per fase ha già consumato una parte del contratto, e la
 * proposta non può fatturarla di nuovo. Si riempiono le fasi nel loro ordine.
 */
export function quoteDentroIlContratto(quote: ReadonlyArray<number>, residuo: number): number[] {
  let resta = Math.max(0, residuo);
  return quote.map((q) => {
    const presa = Math.min(q, resta);
    resta = arrotonda(resta - presa);
    return arrotonda(presa);
  });
}

/** La differenza tra contratto e fasi, quando le fasi non arrivano al contratto. */
export function fuoriDalleFasi(contrattoNetto: number, fasi: ReadonlyArray<{ venduto: number }>): number {
  if (contrattoNetto <= 0) return 0;
  const differenza = arrotonda(contrattoNetto - fasi.reduce((s, f) => s + f.venduto, 0));
  // Un euro di scarto è l'arrotondamento delle righe, non lavoro fuori dalle fasi.
  return differenza > 1 ? differenza : 0;
}

function rigaACorpo(id: string, descrizione: string, imponibile: number, aliquota: number): RigaDocumento {
  return {
    id,
    numero_linea: 0,
    descrizione,
    quantita: 1,
    unita_misura: "a corpo",
    prezzo_unitario: arrotonda(imponibile),
    imponibile: 0,
    aliquota_iva: String(Math.max(0, aliquota)),
    imposta: 0,
    totale_riga: 0,
  };
}

export function rigaFase(fase: { id: string; nome: string; avanzamento: number }, imponibile: number, aliquota: number): RigaDocumento {
  const stato = fase.avanzamento > 0 ? ` — avanzamento lavori ${fase.avanzamento}%` : "";
  return rigaACorpo(idFase(fase.id), `${fase.nome}${stato}`, imponibile, aliquota);
}

export function rigaFuoriDalleFasi(imponibile: number, aliquota: number): RigaDocumento {
  return rigaACorpo(RIGA_FUORI_DALLE_FASI, "Altri lavori come da contratto", imponibile, aliquota);
}

export function rigaVoce(
  faseId: string,
  nomeFase: string,
  voce: { id: string; descrizione: string; quantita: number | null; unita: string | null; importo: number },
  imponibile: number,
  aliquota: number,
): RigaDocumento {
  const misura = voce.quantita && voce.unita ? ` (${String(voce.quantita).replace(".", ",")} ${voce.unita})` : "";
  const parziale = voce.importo > 0 && Math.abs(imponibile - voce.importo) > 0.01
    ? ` — quota del ${String(arrotonda((imponibile / voce.importo) * 100)).replace(".", ",")}%`
    : "";
  return rigaACorpo(idVoce(faseId, voce.id), `${nomeFase}: ${voce.descrizione}${misura}${parziale}`, imponibile, aliquota);
}

export interface SalPerFattura extends SalPerNetto {
  installment_id?: string | null;
  data_emissione?: string | null;
  sal_voci?: ReadonlyArray<{ id?: string; descrizione: string | null; importo_sal: number | null }> | null;
  /** Il certificato di pagamento, se c'è: si fattura il suo netto, non la differenza dei cumulativi. */
  sal_certificati?: unknown;
}

/** Quanto si fattura per un SAL: il netto del certificato, altrimenti la quota nuova del verbale. */
function quotaSal(sal: SalPerFattura, tutti: ReadonlyArray<SalPerFattura>): number {
  const certificato = certificatoDelSal(sal.sal_certificati);
  if (certificato) return numero(certificato.netto);
  return nettoSal(numero(sal.importo_totale), maturatoPrecedente(sal, tutti)).daFatturare;
}

const STATI_FATTURABILI = new Set(["emesso", "approvato", "firmato"]);

export type StatoSalInFattura = "da_fatturare" | "gia_fatturato" | "senza_quota";

/** Un SAL è già fatturato se una fattura ne porta le righe, o se la sua rata ha già la sua fattura. */
export function salInFattura(
  sal: SalPerFattura,
  tutti: ReadonlyArray<SalPerFattura>,
  fatturato: Pick<Fatturato, "salFatturati">,
  rate: ReadonlyArray<{ id?: string | null; documento_fiscale_id?: string | null }>,
): { stato: StatoSalInFattura; quota: number } {
  const quota = quotaSal(sal, tutti);
  const rata = sal.installment_id ? rate.find((r) => r.id === sal.installment_id) : undefined;
  if (fatturato.salFatturati.has(sal.id) || rata?.documento_fiscale_id) return { stato: "gia_fatturato", quota };
  return { stato: quota > 0 ? "da_fatturare" : "senza_quota", quota };
}

/** I verbali che valgono per una fattura: emessi o approvati, dal più recente. */
export function salFatturabili<T extends SalPerNetto>(tutti: ReadonlyArray<T>): T[] {
  return tutti.filter((s) => STATI_FATTURABILI.has(s.stato)).sort((a, b) => b.numero_sal - a.numero_sal);
}

const chiaveVoce = (d: string | null | undefined) => (d ?? "").trim().toLowerCase();

/**
 * Le righe della quota nuova di un SAL. I verbali sono cumulativi: ogni voce vale
 * la sua differenza col SAL precedente. Se le voci non tornano col totale (nomi
 * cambiati da un verbale all'altro) resta una riga sola: conta l'importo giusto.
 */
export function righeSal(sal: SalPerFattura, tutti: ReadonlyArray<SalPerFattura>, aliquota: number): RigaDocumento[] {
  const quota = quotaSal(sal, tutti);
  if (quota <= 0) return [];
  const titolo = `SAL n. ${sal.numero_sal}`;
  if (certificatoDelSal(sal.sal_certificati)) {
    return [rigaACorpo(idSal(sal.id, 0), `Certificato di pagamento n. ${sal.numero_sal} — ${titolo}`, quota, aliquota)];
  }
  const precedente = tutti
    .filter((s) => s.numero_sal < sal.numero_sal && STATI_FATTURABILI.has(s.stato))
    .reduce<SalPerFattura | null>((u, s) => (!u || s.numero_sal > u.numero_sal ? s : u), null);
  const prima = new Map<string, number>();
  for (const v of precedente?.sal_voci ?? []) prima.set(chiaveVoce(v.descrizione), numero(v.importo_sal));

  const voci = (sal.sal_voci ?? [])
    .map((v) => ({ descrizione: (v.descrizione ?? "").trim(), importo: arrotonda(numero(v.importo_sal) - (prima.get(chiaveVoce(v.descrizione)) ?? 0)) }))
    .filter((v) => v.importo !== 0);
  const somma = arrotonda(voci.reduce((s, v) => s + v.importo, 0));
  if (voci.length === 0 || Math.abs(somma - quota) > 0.01) {
    return [rigaACorpo(idSal(sal.id, 0), `${titolo} — lavori eseguiti`, quota, aliquota)];
  }
  // La fattura deve fare ESATTAMENTE la quota del SAL. Le voci sono arrotondate una per
  // una, quindi la loro somma può restare indietro o avanti di qualche centesimo: lo
  // scarto va sull'ultima voce. Prima passava nella fattura (04/11/2026), e il SAL e la
  // fattura che lo incassa non tornavano.
  const scarto = arrotonda(quota - somma);
  const finali = scarto === 0
    ? voci
    : voci.map((v, i) => (i === voci.length - 1 ? { ...v, importo: arrotonda(v.importo + scarto) } : v));
  return finali.map((v, i) => rigaACorpo(idSal(sal.id, i), `${titolo} — ${v.descrizione || "lavori eseguiti"}`, v.importo, aliquota));
}

export type ModoFattura = "sal" | "fasi" | "articoli" | "importo";

/**
 * Da dove partire. Le fatture vere (4.548 di 5 aziende, 02/11/2026) sono per il 56%
 * di una riga sola: acconto, saldo o SAL con i lavori descritti. Le fasi si propongono
 * solo senza una rata da fatturare; gli articoli solo se li si sceglie.
 */
export function modoSuggerito(p: {
  salDaFatturare: boolean;
  fasiConQuota: boolean;
  rataDaFatturare: boolean;
}): ModoFattura {
  if (p.salDaFatturare) return "sal";
  if (p.rataDaFatturare) return "importo";
  return p.fasiConQuota ? "fasi" : "importo";
}
