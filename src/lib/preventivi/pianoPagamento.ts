/**
 * Il piano di pagamento del PREVENTIVO (26/10/2026).
 *
 * Fino a oggi, nei preventivatori edili, «come paga il cliente» era una frase scritta una volta sola nel modello
 * dell'azienda (`payment_terms_text`): uguale per tutti i preventivi, senza importi, e un'azienda che non l'aveva
 * scritta mandava preventivi senza pagamenti. Ora il piano si decide sul singolo preventivo, in due modi:
 *
 *   · «rate»: le rate ai momenti del lavoro (alla firma, all'inizio, a fine lavori…);
 *   · «sal»:  le rate agli stati avanzamento lavori (SAL 1, SAL 2…), come si usa nei lavori lunghi.
 *
 * Le righe sono le stesse dei modelli di pagamento delle commesse (lib/orders/modelliPagamento): un preventivo
 * accettato diventa una commessa con quelle rate, senza riscriverle. Il piano si salva COPIATO sul preventivo, non
 * come rimando al modello: il modello cambia, il preventivo già mandato al cliente no.
 *
 * Modulo puro: niente React, niente Supabase. Gli importi li calcola solo questa funzione, per schermate e PDF.
 */
import { EVENTI_RATA, type EventoRata } from "@/lib/orders/rateEventi";
import type { ModelloPagamento, RataModello } from "@/lib/orders/modelliPagamento";

export type ModoPagamento = "rate" | "sal";

/** Gli eventi che una rata di un preventivo può avere: quelli del cantiere, non lo stato di una commessa che non esiste ancora. */
export type EventoRataPreventivo = Exclude<EventoRata, "stato_commessa">;

export interface RataPreventivo {
  nome: string;
  /** Percentuale sul totale IVA inclusa: da 0 a 100, due decimali. */
  percent: number;
  evento: EventoRataPreventivo;
  /** Solo per «al SAL numero…»: il numero del SAL. */
  numero: number | null;
}

export interface PianoPagamento {
  modo: ModoPagamento;
  righe: RataPreventivo[];
  /** Una frase in più sotto la tabella (bonifico, banca, tempi). */
  note: string | null;
}

export const MAX_RATE_PIANO = 12;
export const MAX_NOME_RATA_PIANO = 80;
const EVENTI_VALIDI = new Set<string>(EVENTI_RATA.map((e) => e.value).filter((v) => v !== "stato_commessa"));

const arrotonda2 = (n: number) => Math.round(n * 100) / 100;
const limita = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/** Il piano com'è salvato sul preventivo. Difensivo: dal database può arrivare qualunque cosa. */
export function leggiPianoPagamento(raw: unknown): PianoPagamento | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.righe)) return null;
  const modo: ModoPagamento = r.modo === "sal" ? "sal" : "rate";
  const righe = r.righe
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, MAX_RATE_PIANO)
    .map((x): RataPreventivo => {
      const evento = typeof x.evento === "string" && EVENTI_VALIDI.has(x.evento) ? (x.evento as EventoRataPreventivo) : "data_fissa";
      const numero = Number(x.numero);
      return {
        nome: String(x.nome ?? "").trim().slice(0, MAX_NOME_RATA_PIANO) || "Rata",
        percent: arrotonda2(limita(Number(x.percent) || 0, 0, 100)),
        evento,
        numero: evento === "sal_numero" && Number.isFinite(numero) && numero > 0 ? Math.round(numero) : null,
      };
    });
  if (righe.length === 0) return null;
  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim() : null;
  return { modo, righe, note };
}

/** La somma delle percentuali, arrotondata: un piano vale solo se fa 100. */
export function totalePercentuali(righe: readonly RataPreventivo[]): number {
  return arrotonda2(righe.reduce((s, r) => s + (Number(r.percent) || 0), 0));
}

export function pianoCompleto(piano: PianoPagamento | null | undefined): boolean {
  return !!piano && piano.righe.length > 0 && Math.abs(totalePercentuali(piano.righe) - 100) < 0.005;
}

export interface RataConImporto extends RataPreventivo { importo: number }

/**
 * Le rate con gli importi sul totale IVA inclusa. L'ultima assorbe l'arrotondamento, così la somma delle rate fa
 * esattamente il totale: al cliente non torna mai un centesimo in meno o in più del prezzo scritto sopra.
 */
export function rateConImporti(piano: PianoPagamento | null | undefined, totale: number): RataConImporto[] {
  if (!piano || piano.righe.length === 0) return [];
  const base = Math.max(0, Number(totale) || 0);
  const righe = piano.righe.map((r) => ({ ...r, importo: arrotonda2((base * (Number(r.percent) || 0)) / 100) }));
  if (base > 0) {
    const somma = arrotonda2(righe.reduce((s, r) => s + r.importo, 0));
    const scarto = arrotonda2(base - somma);
    // Solo se il piano copre tutto il prezzo: un piano incompleto non si "aggiusta" di nascosto.
    if (scarto !== 0 && pianoCompleto(piano)) {
      const ultima = righe[righe.length - 1];
      righe[righe.length - 1] = { ...ultima, importo: arrotonda2(ultima.importo + scarto) };
    }
  }
  return righe;
}

/** «Alla firma del contratto», «Al SAL 2»: come si legge la riga nel preventivo e nel PDF. */
export function quandoSiPaga(rata: Pick<RataPreventivo, "evento" | "numero">): string {
  if (rata.evento === "sal_numero") return rata.numero ? `Al SAL ${rata.numero}` : "Al SAL";
  return EVENTI_RATA.find((e) => e.value === rata.evento)?.label ?? "A una data precisa";
}

/** Un modello di pagamento dell'azienda diventa il piano di questo preventivo (copiato, non collegato). */
export function pianoDaModello(modello: Pick<ModelloPagamento, "righe">): PianoPagamento {
  const righe: RataPreventivo[] = modello.righe.slice(0, MAX_RATE_PIANO).map((r: RataModello) => ({
    nome: r.nome,
    percent: arrotonda2(limita(Number(r.percent) || 0, 0, 100)),
    evento: (EVENTI_VALIDI.has(r.evento) ? r.evento : "data_fissa") as EventoRataPreventivo,
    numero: r.evento === "sal_numero" ? (r.numero ?? 1) : null,
  }));
  const modo: ModoPagamento = righe.some((r) => r.evento === "sal_numero") ? "sal" : "rate";
  return { modo, righe, note: null };
}

/** Il piano di partenza quando non c'è niente: acconto alla firma e saldo a fine lavori. */
export function pianoRateDiPartenza(): PianoPagamento {
  return {
    modo: "rate",
    righe: [
      { nome: "Acconto alla firma", percent: 30, evento: "firma_contratto", numero: null },
      { nome: "Saldo a fine lavori", percent: 70, evento: "fine_lavori", numero: null },
    ],
    note: null,
  };
}

/**
 * Un piano a SAL con l'acconto e il saldo: l'acconto alla firma, i SAL in parti uguali, il saldo a fine lavori.
 * I decimali vanno sull'ultimo SAL, così la somma fa 100 esatto.
 */
export function pianoSalDiPartenza(quantiSal = 3, accontoPct = 20, saldoPct = 10): PianoPagamento {
  const sal = limita(Math.round(quantiSal) || 1, 1, MAX_RATE_PIANO - 2);
  const acconto = arrotonda2(limita(accontoPct, 0, 100));
  const saldo = arrotonda2(limita(saldoPct, 0, 100 - acconto));
  const perSal = arrotonda2((100 - acconto - saldo) / sal);
  const righe: RataPreventivo[] = [
    { nome: "Acconto alla firma", percent: acconto, evento: "firma_contratto", numero: null },
    ...Array.from({ length: sal }, (_, i) => ({
      nome: `SAL ${i + 1}`, percent: perSal, evento: "sal_numero" as const, numero: i + 1,
    })),
    { nome: "Saldo a fine lavori", percent: saldo, evento: "fine_lavori" as const, numero: null },
  ];
  const scarto = arrotonda2(100 - totalePercentuali(righe));
  if (scarto !== 0) righe[sal].percent = arrotonda2(righe[sal].percent + scarto);
  return { modo: "sal", righe, note: null };
}

/**
 * Il piano quando si cambia modo: le rate dell'altro modo non si buttano via a caso. Da «rate» a «sal» si tiene
 * l'acconto e il saldo e si mettono i SAL in mezzo; da «sal» a «rate» restano acconto e saldo.
 */
export function cambiaModo(piano: PianoPagamento, modo: ModoPagamento): PianoPagamento {
  if (piano.modo === modo) return piano;
  if (modo === "sal") {
    const acconto = arrotonda2(limita(piano.righe.find((r) => r.evento === "firma_contratto")?.percent ?? 20, 0, 90));
    const saldoScelto = arrotonda2(piano.righe.find((r) => r.evento === "fine_lavori")?.percent ?? 10);
    // Senza spazio per i SAL (acconto e saldo si prendono tutto) il saldo lascia metà del resto ai SAL:
    // l'acconto resta quello scelto dal venditore, che è la cifra che ha davvero in mano.
    const saldo = arrotonda2(100 - acconto - saldoScelto) > 0 ? saldoScelto : arrotonda2((100 - acconto) / 2);
    return { ...pianoSalDiPartenza(3, acconto, saldo), note: piano.note };
  }
  const acconto = piano.righe.find((r) => r.evento === "firma_contratto");
  const base = pianoRateDiPartenza();
  const primo = acconto ? arrotonda2(limita(acconto.percent, 0, 100)) : base.righe[0].percent;
  return {
    modo: "rate",
    righe: [
      { ...base.righe[0], nome: acconto?.nome ?? base.righe[0].nome, percent: primo },
      { ...base.righe[1], percent: arrotonda2(100 - primo) },
    ],
    note: piano.note,
  };
}
