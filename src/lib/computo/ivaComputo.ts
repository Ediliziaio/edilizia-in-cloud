import { arrotondaDecimale } from "./editorNativo";

export type ImpostazioniIvaComputo = {
  ivaModalita?: "da-definire" | "applicata" | "non-applicabile";
  ivaAliquota?: string;
  ivaNota?: string;
};

export function calcolaIvaComputo(imponibile: number | null, opzioni: ImpostazioniIvaComputo) {
  const base = imponibile == null ? null : arrotondaDecimale(imponibile);
  const modalita = opzioni.ivaModalita ?? "da-definire";
  const raw = (opzioni.ivaAliquota ?? "22").trim();
  const aliquota = /^\d+(?:[.,]\d{1,4})?$/.test(raw) ? Number(raw.replace(",", ".")) : NaN;
  const errore = modalita === "applicata" && (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100)
    ? "Inserisci un'aliquota IVA valida tra 0 e 100." : "";
  const iva = modalita === "non-applicabile" ? 0 : modalita === "applicata" && !errore && base != null ? arrotondaDecimale(base * aliquota / 100) : null;
  return { imponibile: base, aliquota: Number.isFinite(aliquota) ? aliquota : null, iva,
    totale: base != null && iva != null ? arrotondaDecimale(base + iva) : null, errore, modalita };
}
