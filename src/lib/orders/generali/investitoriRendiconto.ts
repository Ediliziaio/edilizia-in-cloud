// src/lib/orders/generali/investitoriRendiconto.ts
// I numeri del rendiconto per un investitore, pronti per il PDF e per lo storico
// (generale_rendiconti.numeri): avanzamento, vendite, incassi, previsto contro stima,
// capitale, rendimento atteso e quanto gli spetta. Solo conti, niente React.
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import {
  NOMI_FONTE, aCapitale, arrotonda, spiegaRegola,
  type Colonne, type ContiInvestitori, type TipoFonte,
} from "@/lib/orders/generali/investitoriConti";
import type { VenditeUnita } from "@/lib/orders/generali/investitoriLettura";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

export interface DatiRendiconto {
  /** «2027-03-15». */
  data: string;
  operazione: { nome: string; codice: string | null; modello: string; unitaNome: string };
  azienda: { nome: string; partitaIva: string | null; indirizzo: string | null; email: string | null; telefono: string | null; logo: string | null };
  investitore: { nome: string; tipo: TipoFonte; tipoNome: string; email: string | null };
  /** Media dell'avanzamento delle commesse dentro, pesata sull'importo (o semplice, senza importi). */
  avanzamento: number | null;
  figlie: number;
  vendite: VenditeUnita | null;
  incassato: number | null;
  economia: {
    ricavi: { previsto: number; stima: number };
    costi: { previsto: number; stima: number };
    margine: { previsto: number; stima: number };
    tirAnnuo: number | null;
    durataMesi: number | null;
  } | null;
  capitale: { massimo: number; meseMassimo: string | null; investitoOggi: number; raccolto: number; impegni: number } | null;
  conto: {
    capitale: Colonne;
    rendimento: Colonne;
    rendimentoNome: string;
    interessiMaturati: number | null;
    quotaPct: number | null;
    spettaAFine: number;
    rendimentoPct: number | null;
    /** TIR annuo dal suo punto di vista. */
    tir: number | null;
    /** Solo per chi presta: le spese del finanziamento e il costo effettivo annuo. */
    spese: number | null;
    costoAnnuo: number | null;
    regola: string;
    fine: string;
    movimenti: { data: string; tipo: string; importo: number }[];
  };
  regole: string[];
  note: string | null;
}

const NOMI_MOV: Record<string, string> = {
  versamento: "Versamento",
  rimborso: "Rimborso del capitale",
  distribuzione: "Utile distribuito",
  interessi: "Interessi pagati",
  spese: "Spese pagate",
  accollo: "Accollo all'acquirente",
};

/** Avanzamento medio delle figlie, pesato sull'importo quando chi guarda lo vede. */
export function avanzamentoMedio(figlie: RiepilogoGenerale["figlie"]): number | null {
  if (figlie.length === 0) return null;
  const pesate = figlie.filter((f) => (f.importo ?? 0) > 0);
  if (pesate.length === figlie.length) {
    const tot = pesate.reduce((t, f) => t + (f.importo ?? 0), 0);
    return Math.round(pesate.reduce((t, f) => t + f.avanzamento * (f.importo ?? 0), 0) / tot);
  }
  return Math.round(figlie.reduce((t, f) => t + f.avanzamento, 0) / figlie.length);
}

export function datiRendiconto(input: {
  oggi: string;
  riepilogo: RiepilogoGenerale;
  numeri: NumeriInvestitori | null;
  conti: ContiInvestitori;
  fonteId: string;
  vendite: VenditeUnita | null;
  azienda: DatiRendiconto["azienda"];
  unitaNome: string;
  note?: string | null;
}): DatiRendiconto | null {
  const { riepilogo, numeri, conti } = input;
  const c = conti.fonti.find((f) => f.fonte.id === input.fonteId);
  if (!c) return null;
  const incassi = riepilogo.figlie.map((f) => f.incassato);
  const incassato = riepilogo.permessi.importi && incassi.some((v) => v !== null)
    ? arrotonda(incassi.reduce<number>((t, v) => t + (v ?? 0), 0))
    : null;
  return {
    data: input.oggi,
    operazione: {
      nome: riepilogo.generale.nome,
      codice: riepilogo.generale.codice,
      modello: riepilogo.generale.modello,
      unitaNome: input.unitaNome,
    },
    azienda: input.azienda,
    investitore: { nome: c.fonte.nome, tipo: c.fonte.tipo, tipoNome: NOMI_FONTE[c.fonte.tipo].nome, email: c.fonte.email },
    avanzamento: avanzamentoMedio(riepilogo.figlie),
    figlie: riepilogo.figlie.length,
    vendite: input.vendite,
    incassato,
    economia: numeri
      ? {
          ricavi: { previsto: numeri.previsto.ricavi, stima: numeri.stimaFinale.ricavi },
          costi: { previsto: numeri.previsto.costi, stima: numeri.stimaFinale.costi },
          margine: { previsto: numeri.previsto.margine, stima: numeri.stimaFinale.margine },
          tirAnnuo: numeri.tirAnnuo,
          durataMesi: numeri.durataMesi,
        }
      : null,
    capitale: numeri
      ? {
          massimo: numeri.capitaleMassimoImpegnato,
          meseMassimo: numeri.meseCapitaleMassimo,
          investitoOggi: numeri.capitaleInvestitoOggi,
          raccolto: conti.totali.dentro,
          impegni: conti.totali.impegno,
        }
      : null,
    conto: {
      capitale: c.capitale,
      rendimento: c.rendimento,
      rendimentoNome: aCapitale(c.fonte.tipo) ? "Utile" : "Interessi",
      interessiMaturati: c.interessiMaturati,
      quotaPct: c.quota ? c.quota.stima : null,
      spettaAFine: c.spettaAFine,
      rendimentoPct: c.rendimentoPct,
      tir: c.tir,
      spese: c.spese ? c.spese.stima : null,
      costoAnnuo: c.costoAnnuo,
      regola: c.regola,
      fine: c.fineConteggio,
      movimenti: c.movimenti.map((m) => ({ data: m.data, tipo: NOMI_MOV[m.tipo] ?? m.tipo, importo: m.importo })),
    },
    regole: spiegaRegola(conti),
    note: input.note?.trim() || null,
  };
}

/** Il nome del file: «Rendiconto Residenza Via Roma - Mario Rossi 2027-03-15.pdf», senza caratteri strani. */
export function nomeFileRendiconto(d: Pick<DatiRendiconto, "operazione" | "investitore" | "data">): string {
  const pulito = (s: string) => s.replace(/[^\p{L}\p{N} .,_-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `Rendiconto ${pulito(d.operazione.nome)} - ${pulito(d.investitore.nome)} ${d.data}.pdf`;
}
