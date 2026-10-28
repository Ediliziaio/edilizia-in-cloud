export type VoceSub = {
  id: string;
  fase_id: string | null;
  descrizione: string;
  base: "corpo" | "misura" | "ore";
  unita: string;
  quantita: number;
  prezzo: number;
  importo?: number;
};
export type QuadroSub = {
  id: string;
  revisione: number;
  voci: VoceSub[];
  maturazione: "saldo" | "sal_periodici" | "traguardi";
  giorni_pagamento: number | null;
  importo_lavori: number;
  motivo: string;
  created_at: string;
};
export type MisuraSub = {
  id: string;
  quadro_id: string;
  voce_id: string;
  data_rilievo: string;
  quantita_dichiarata: number;
  quantita_riconosciuta: number | null;
  prezzo_unitario: number;
  importo_riconosciuto: number | null;
  stato: "dichiarata" | "riconosciuta" | "annullata";
  riferimento: string;
  nota_verifica: string | null;
  nota_annullamento: string | null;
  revisione: number;
  sal_id: string | null;
  created_at: string;
  verificato_il: string | null;
};
export const euroSub = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export const quantitaSub = (
  n: number,
  voce: Pick<VoceSub, "base" | "unita">,
) =>
  voce.base === "corpo"
    ? `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`
    : `${n.toLocaleString("it-IT", { maximumFractionDigits: 4 })} ${voce.unita}`;
export const importoVociSub = (voci: VoceSub[]) =>
  voci.reduce((s, v) => s + Math.round(v.quantita * v.prezzo * 100), 0) / 100;
export function riepilogoVoceSub(voce: VoceSub, misure: MisuraSub[]) {
  const righe = misure.filter(
    (m) => m.voce_id === voce.id && m.stato === "riconosciuta",
  );
  const riconosciuta = righe.reduce(
    (s, m) => s + Number(m.quantita_riconosciuta),
    0,
  );
  return {
    riconosciuta,
    residua: Math.max(0, voce.quantita - riconosciuta),
    daVerificare: misure.filter(
      (m) => m.voce_id === voce.id && m.stato === "dichiarata",
    ).length,
    importoRiconosciuto:
      righe.reduce(
        (s, m) => s + Math.round(Number(m.importo_riconosciuto) * 100),
        0,
      ) / 100,
    nonContabilizzato:
      righe
        .filter((m) => !m.sal_id)
        .reduce(
          (s, m) => s + Math.round(Number(m.importo_riconosciuto) * 100),
          0,
        ) / 100,
  };
}
export function misurePerSalSub(misure: MisuraSub[], ids: string[]) {
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error("Seleziona almeno una misura distinta");
  const righe = ids.map((id) => misure.find((m) => m.id === id));
  if (righe.some((m) => !m || m.stato !== "riconosciuta" || m.sal_id))
    throw Error("Seleziona solo misure riconosciute non ancora contabilizzate");
  const importo =
    righe.reduce(
      (s, m) => s + Math.round(Number(m!.importo_riconosciuto) * 100),
      0,
    ) / 100;
  if (!(importo > 0))
    throw Error("Il totale delle misure deve essere positivo");
  return { importo, numero: righe.length };
}
