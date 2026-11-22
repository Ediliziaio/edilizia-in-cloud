import { dettaglioRisorse, type AnalisiCosti, type RisorsaCosto, type VoceAnalisi } from "./analisiCosti";
import { confrontaStorico, stimaLavorazione, unitaVerificata, type RiferimentoStorico } from "./stimaCostiStorici";

export type PropostaAnalisiCosti = {
  voce: VoceAnalisi;
  risorse: RisorsaCosto[];
  fonti: string[];
  esito: string;
};

export function motivoVoceDaCompletare(analisi: AnalisiCosti, voce: VoceAnalisi) {
  if (analisi.voci[voce.id]?.length || voce.costoUnitario !== null) return "Costo già presente";
  if (!voce.quantita || voce.quantita <= 0 || !unitaVerificata(voce.unita) || !voce.descrizione.trim()) {
    return "Completa quantità, unità e descrizione";
  }
  return null;
}

export function proponiCostiDaiConsuntivi(voce: VoceAnalisi, storico: readonly RiferimentoStorico[], tipoLavoro?: string): PropostaAnalisiCosti {
  const campione = confrontaStorico(voce, storico, { tipoLavoro });
  const stima = stimaLavorazione(campione, voce.quantita ?? 0, voce.unita);
  const fonti = campione.map(r => r.numero || r.commessaId);
  if (!stima?.risorse.length || stima.costo <= 0) return { voce, risorse: [], fonti, esito: "Nessun consuntivo confrontabile" };
  return {
    voce, fonti, esito: campione.length === 1 ? "Un solo consuntivo · da verificare" : "Dai consuntivi",
    risorse: stima.risorse.map(r => ({ ...r, id: crypto.randomUUID(), stima: { ...r.stima, calcolataIl: new Date().toISOString() } })),
  };
}

export function risorseReplicabili(analisi: AnalisiCosti, voce: VoceAnalisi) {
  return (analisi.voci[voce.id] ?? []).filter(r => r.base !== "totale" && r.tipo !== "logistica" && r.stima?.origine !== "trasferta");
}

export function copiaComposizioneCosti(origine: VoceAnalisi, voce: VoceAnalisi, risorse: RisorsaCosto[]): PropostaAnalisiCosti {
  const fonti = [origine.descrizione];
  const unita = unitaVerificata(origine.unita);
  if (!unita || unita !== unitaVerificata(voce.unita)) return { voce, risorse: [], fonti, esito: "Unità diversa dalla voce di origine" };
  const dettaglio = dettaglioRisorse(risorse, voce.quantita);
  if (dettaglio.incompleto || !risorse.some(r => r.base === "unitaria")) {
    return { voce, risorse: [], fonti, esito: "Composizione unitaria da completare" };
  }
  return { voce, fonti, esito: "Composizione copiata", risorse: risorse.map(r => ({
    ...r, id: crypto.randomUUID(), fonte: [`Copiata da ${origine.descrizione}`, r.fonte].filter(Boolean).join(" · ").slice(0, 500),
  })) };
}

export function datiVocePerProposta(voce: VoceAnalisi) {
  return [
    voce.id, voce.descrizione, voce.unita, voce.quantita, voce.codice, voce.tariffaId, voce.inclusa,
    voce.fase, voce.costoUnitario, voce.prezzo, voce.vendita, voce.venditaLorda,
  ];
}
