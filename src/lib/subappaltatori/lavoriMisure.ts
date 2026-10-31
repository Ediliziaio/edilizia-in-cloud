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

/**
 * Le voci del quadro lavori a partire dall'Allegato A del contratto (elenco_lavori), così «Imposta elenco
 * lavori» non riparte da una sola riga a corpo da ridigitare. A corpo → una quota; ore → «h»; il resto a
 * misura. Null se l'elenco manca o non torna all'importo del contratto (il database lo rifiuterebbe).
 */
export function vociDaAllegato(
  elenco: unknown,
  importoContratto: number,
  nuovoId: () => string = () => crypto.randomUUID(),
): VoceSub[] | null {
  if (!Array.isArray(elenco) || elenco.length === 0 || elenco.length > 100) return null;
  const voci: VoceSub[] = [];
  for (const r of elenco as Array<Record<string, unknown>>) {
    const descrizione = String(r?.descrizione ?? "").trim();
    const unita = String(r?.unita ?? "").trim().toLowerCase();
    const quantita = Math.round(Number(r?.quantita) * 10000) / 10000;
    const prezzo = Math.round(Number(r?.prezzo) * 100) / 100;
    if (descrizione.length < 2 || !(quantita > 0) || !(prezzo >= 0)) return null;
    const testo = descrizione.slice(0, 2000);
    if (/corpo/.test(unita)) {
      const importo = Math.round(quantita * prezzo * 100) / 100;
      voci.push({ id: nuovoId(), fase_id: null, descrizione: testo, base: "corpo", unita: "quota", quantita: 1, prezzo: importo });
    } else if (/^(h|ore|ora)$/.test(unita)) {
      voci.push({ id: nuovoId(), fase_id: null, descrizione: testo, base: "ore", unita: "h", quantita, prezzo });
    } else {
      voci.push({ id: nuovoId(), fase_id: null, descrizione: testo, base: "misura", unita: (unita || "cad").slice(0, 15), quantita, prezzo });
    }
  }
  const totale = voci.reduce((s, v) => s + Math.round(v.quantita * v.prezzo * 100) / 100, 0);
  return Math.abs(Math.round(totale * 100) / 100 - Number(importoContratto)) < 0.005 ? voci : null;
}
