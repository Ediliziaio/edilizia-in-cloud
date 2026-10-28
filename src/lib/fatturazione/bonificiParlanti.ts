/** Monetary amounts are rounded only at their final cent. No invoice VAT is changed. */
export interface BonificoForm {
  ritenuta: string;
  commissioni: string;
  netto: string;
  banca: string;
  confermato: boolean;
  richiesta: string;
}
export const nuovoBonificoForm = (): BonificoForm => ({
  ritenuta: "",
  commissioni: "0",
  netto: "",
  banca: "",
  confermato: false,
  richiesta: crypto.randomUUID(),
});

export function aliquotaBonifico(data: string): number | null {
  const parsed = new Date(`${data}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== data
  )
    return null;
  // Older regimes require an explicit historical review; never silently use today's rate.
  if (data < "2015-01-01") return null;
  return data < "2024-03-01" ? 8 : 11;
}
export const centesimi = (value: number) =>
  Math.round((value + Number.EPSILON) * 100);
export function previsioneBonifico(lordo: number, data: string) {
  const aliquota = aliquotaBonifico(data);
  if (aliquota === null || !Number.isFinite(lordo) || lordo <= 0) return null;
  const ritenuta = centesimi(((lordo / 1.22) * aliquota) / 100) / 100;
  return {
    aliquota,
    base: lordo / 1.22,
    ritenuta,
    netto: (centesimi(lordo) - centesimi(ritenuta)) / 100,
  };
}
export function validaBonifico(input: {
  lordo: number;
  ritenuta: number;
  commissioni: number;
  netto: number;
  data: string;
  riferimento: string;
  banca: string;
  confermato: boolean;
}) {
  if (
    [input.lordo, input.ritenuta, input.commissioni, input.netto].some(
      (n) =>
        !Number.isFinite(n) ||
        n < 0 ||
        n > 1e9 ||
        Math.abs(n * 100 - Math.round(n * 100)) > 0.00001,
    ) ||
    input.lordo <= 0 ||
    input.ritenuta <= 0 ||
    input.netto <= 0
  )
    return "Inserisci importi effettivi validi, con massimo due decimali.";
  if (
    centesimi(input.netto) +
      centesimi(input.ritenuta) +
      centesimi(input.commissioni) !==
    centesimi(input.lordo)
  )
    return "Il lordo deve corrispondere a netto + ritenuta + commissioni.";
  if (aliquotaBonifico(input.data) === null)
    return "Data non supportata: serve una verifica del regime storico.";
  if (input.riferimento.trim().length < 5 || input.banca.trim().length < 2)
    return "Indica banca e riferimento univoco della contabile (TRN/CRO).";
  if (!input.confermato)
    return "Conferma gli importi confrontati con la contabile bancaria.";
  return null;
}
export interface RitenutaBonifico {
  id: string;
  company_id: string;
  documento_id: string;
  movimento_id: string | null;
  lordo: number;
  ritenuta: number;
  commissioni: number;
  netto: number;
  aliquota_prevista: number;
  ritenuta_prevista: number;
  data_accredito: string;
  banca: string;
  riferimento: string;
  numero_fattura: string;
  stato: "verificata" | "certificata" | "stornata";
  certificazione: string | null;
  revisione: number;
  motivo_storno: string | null;
}
