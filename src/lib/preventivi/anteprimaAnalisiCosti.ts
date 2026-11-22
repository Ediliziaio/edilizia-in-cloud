import {
  analizzaPreventivo, centesimiCosto, costoCompletoVoce, numeroCosto, quoteCostiComuni,
  type AnalisiCosti, type PianoTempi, type RisorsaCosto, type StimaTempiSalvata, type VoceAnalisi,
} from "./analisiCosti";
import { confrontaStorico, unitaVerificata, type ModalitaEsecuzione, type RiferimentoStorico } from "./stimaCostiStorici";
import { riferimentiTempi, stimaTempiAggiornata, stimaTempistiche, tempisticheDaSalvare } from "./stimaTempistiche";
import type { GiornoLavorativo } from "@/lib/orders/sottofasi";

export type ModificaAnalisiProposta = {
  voce: VoceAnalisi;
  risorse?: RisorsaCosto[];
  tempistiche?: StimaTempiSalvata;
};

export function applicaModificheAnalisi(analisi: AnalisiCosti, modifiche: readonly ModificaAnalisiProposta[]): AnalisiCosti {
  const risorse = modifiche.flatMap(m => m.risorse?.length ? [[m.voce.id, m.risorse] as const] : []);
  const date = modifiche.flatMap(m => m.tempistiche ? [[m.voce.id, m.tempistiche] as const] : []);
  return {
    ...analisi,
    voci: risorse.length ? { ...analisi.voci, ...Object.fromEntries(risorse) } : analisi.voci,
    tempistiche: date.length ? { ...analisi.tempistiche, ...Object.fromEntries(date) } : analisi.tempistiche,
  };
}

type SituazioneVoce = {
  costo: number;
  completo: boolean;
  vendita: number | null;
  margine: number | null;
  date?: StimaTempiSalvata;
  dateDaRicalcolare: boolean;
};

function situazione(analisi: AnalisiCosti, voci: readonly VoceAnalisi[], imponibile: number) {
  const conto = analizzaPreventivo(analisi, voci, imponibile);
  const quote = quoteCostiComuni(conto);
  return new Map(conto.righe.map(riga => {
    const { voce } = riga;
    const quota = quote.get(voce.id);
    const importoCompleto = costoCompletoVoce(riga, quota);
    const vendita = voce.vendita === null ? null : centesimiCosto(voce.vendita);
    const salvata = analisi.tempistiche?.[voce.id];
    const dateDaRicalcolare = !!salvata && !stimaTempiAggiornata(salvata, voce);
    const r: SituazioneVoce = {
      costo: importoCompleto ?? (riga.costo ?? 0) + (quota?.preventivo ?? 0) + (quota?.fase ?? 0),
      completo: importoCompleto !== null,
      vendita,
      margine: importoCompleto !== null && vendita !== null ? vendita - importoCompleto : null,
      date: dateDaRicalcolare ? undefined : salvata,
      dateDaRicalcolare,
    };
    return [voce.id, r] as const;
  }));
}

function riepilogo(voci: SituazioneVoce[]) {
  let costo = 0;
  let vendita = 0;
  let completi = 0;
  let valorizzate = 0;
  let pianificate = 0;
  let fine: string | undefined;
  for (const r of voci) {
    costo += r.costo;
    vendita += r.vendita ?? 0;
    if (r.completo) completi++;
    if (r.vendita !== null) valorizzate++;
    if (r.date) {
      pianificate++;
      if (!fine || r.date.fine > fine) fine = r.date.fine;
    }
  }
  const totale = voci.length;
  return {
    costo, completi, totale, vendita: valorizzate === totale ? vendita : null,
    margine: totale > 0 && completi === totale && valorizzate === totale ? vendita - costo : null,
    fine, pianificate,
  };
}

export function confrontaAnalisiProposta(
  analisi: AnalisiCosti, voci: readonly VoceAnalisi[], selezione: readonly VoceAnalisi[], imponibile: number,
  modifiche: readonly ModificaAnalisiProposta[],
) {
  const attuale = situazione(analisi, voci, imponibile);
  const proposta = modifiche.length ? situazione(applicaModificheAnalisi(analisi, modifiche), voci, imponibile) : attuale;
  const righe = selezione.flatMap(voce => {
    const prima = attuale.get(voce.id);
    const dopo = proposta.get(voce.id);
    return prima && dopo ? [{ voce, prima, dopo }] : [];
  });
  const incluse = righe.filter(r => r.voce.inclusa);
  return { righe, prima: riepilogo(incluse.map(r => r.prima)), dopo: riepilogo(incluse.map(r => r.dopo)) };
}

export type ParametriDateProposta = Pick<PianoTempi, "partenza" | "operai" | "oreGiorno" | "attesaDitta" | "attesaMateriali" | "sabato">;

export function oreInterneDalleRisorse(risorse: readonly RisorsaCosto[], quantita: number | null): number | null {
  let totale = 0;
  for (const r of risorse) {
    if (r.tipo !== "manodopera" || r.base === "percentuale" || r.stima?.origine === "trasferta") continue;
    const q = numeroCosto(r.quantita);
    const persone = numeroCosto(r.fattore || "1");
    const scala = r.base === "unitaria" ? quantita : 1;
    if (unitaVerificata(r.unita) !== "h" || q === null || persone === null || !scala) return null;
    totale += q * persone * scala;
  }
  return totale > 0 ? totale : null;
}

export function proponiTempisticheLavorazione(
  voce: VoceAnalisi, risorse: readonly RisorsaCosto[], storico: readonly RiferimentoStorico[],
  parametri: ParametriDateProposta, lavorativo: GiornoLavorativo, tipoLavoro?: string,
) {
  if (voce.quantita === null || voce.quantita <= 0 || !unitaVerificata(voce.unita)) return { problemi: ["Quantità e unità della voce"] };
  const interne = risorse.some(r => r.tipo === "manodopera" && r.base !== "percentuale" && r.stima?.origine !== "trasferta");
  const ditta = risorse.some(r => r.tipo === "subappalto" && r.base !== "percentuale");
  const modalita: ModalitaEsecuzione | undefined = interne ? (ditta ? "mista" : "interna") : ditta ? "subappalto" : undefined;
  const campione = confrontaStorico(voce, storico, { tipoLavoro, esecuzione: modalita });
  const esecuzione = modalita ?? campione[0]?.esecuzione;
  if (!esecuzione) return { problemi: ["Modalità di esecuzione e durate"] };
  const ore = oreInterneDalleRisorse(risorse, voce.quantita);
  const piano: PianoTempi = {
    ...parametri, esecuzione, oreInterne: ore === null ? "" : String(Number(ore.toFixed(6))),
    durataDitta: "", minutiViaggio: "", coordinamento: "sequenza", riserva: "",
  };
  const esito = stimaTempistiche(piano, riferimentiTempi(campione, voce.quantita), lavorativo);
  return {
    stima: esito.previsione ? tempisticheDaSalvare(voce, piano, esito.previsione) ?? undefined : undefined,
    problemi: esito.mancanti,
  };
}
