export type RigaLavoriSalSub = {
  misura_id: string;
  quadro_id: string;
  revisione_quadro: number;
  voce_id: string;
  descrizione: string;
  base: string;
  unita: string;
  data_rilievo: string;
  quantita_dichiarata: number;
  quantita_riconosciuta: number;
  prezzo_unitario: number;
  importo: number;
  riferimento: string;
  nota_verifica: string;
  verificato_da: string;
  verificato_il: string;
};
export function verificaRigheLavoriSalSub(
  righe: RigaLavoriSalSub[],
  lordo: number,
  dal: string,
  al: string,
) {
  if (
    righe.length > 100 ||
    new Set(righe.map((r) => r.misura_id)).size !== righe.length
  ) throw Error("Fonti misurate duplicate o oltre il limite");
  let totale = 0;
  for (const r of righe) {
    const numeri = [
      r.quantita_dichiarata,
      r.quantita_riconosciuta,
      r.prezzo_unitario,
      r.importo,
    ].map(Number);
    if (
      numeri.some((n) => !Number.isFinite(n) || n < 0 || n > 1e11) ||
      r.quantita_riconosciuta > r.quantita_dichiarata ||
      !r.descrizione?.trim() || !r.unita?.trim() ||
      !["corpo", "misura", "ore"].includes(r.base) || !r.verificato_da ||
      !r.nota_verifica?.trim() || !Number.isFinite(Date.parse(r.verificato_il))
    ) throw Error("Misura riconosciuta incompleta o incoerente");
    if (r.data_rilievo < dal || r.data_rilievo > al) {
      throw Error(
        "Il periodo del verbale deve includere le date delle rilevazioni collegate",
      );
    }
    if (
      Math.abs(
        Math.round(r.quantita_riconosciuta * r.prezzo_unitario * 100) -
          Math.round(r.importo * 100),
      ) > 1
    ) {
      throw Error(
        "Importo della misura non coerente con quantità e prezzo acquisiti",
      );
    }
    totale += Math.round(r.importo * 100);
  }
  if (righe.length && Math.abs(totale - Math.round(lordo * 100)) > 1) {
    throw Error("Misure collegate e importo del SAL non coincidono");
  }
  return totale / 100;
}

export type VoceAvanzamentoSalSub = {
  id: string;
  descrizione: string;
  base: string;
  unita: string;
  quantita: number;
  prezzo: number;
};

type QuantitaRilevataSalSub = { id: string; voce_id: string; quantita_riconosciuta: number | null };

export type RigaAvanzamentoSalSub = {
  voce_id: string;
  descrizione: string;
  base: string;
  unita: string;
  affidata: number;
  prezzo: number;
  precedente: number | null;
  periodo: number;
  cumulata: number | null;
};

/** Il SAL è per periodo. Le misure precedenti entrano soltanto nell'avanzamento. */
export function avanzamentoVociSalSub(
  voci: readonly VoceAvanzamentoSalSub[],
  precedenti: readonly QuantitaRilevataSalSub[],
  periodo: readonly QuantitaRilevataSalSub[],
  storicoCompleto = true,
): RigaAvanzamentoSalSub[] {
  const centimillesimi = (n: unknown) => Math.round((Number(n) || 0) * 10000);
  const viste = new Set<string>();
  const somma = (misure: readonly QuantitaRilevataSalSub[]) => {
    const perVoce = new Map<string, number>();
    for (const misura of misure) {
      if (viste.has(misura.id)) continue;
      viste.add(misura.id);
      perVoce.set(misura.voce_id, (perVoce.get(misura.voce_id) ?? 0) + centimillesimi(misura.quantita_riconosciuta));
    }
    return perVoce;
  };
  // In caso di dati ripetuti si dà precedenza alla misura del periodo documentato.
  const attuali = somma(periodo);
  const passate = somma(precedenti);
  return voci.map(voce => {
    const prima = passate.get(voce.id) ?? 0;
    const ora = attuali.get(voce.id) ?? 0;
    return {
      voce_id: voce.id, descrizione: voce.descrizione, base: voce.base, unita: voce.unita,
      affidata: centimillesimi(voce.quantita) / 10000, prezzo: Number(voce.prezzo),
      precedente: storicoCompleto ? prima / 10000 : null,
      periodo: ora / 10000,
      cumulata: storicoCompleto ? (prima + ora) / 10000 : null,
    };
  });
}
