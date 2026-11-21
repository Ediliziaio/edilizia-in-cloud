import type { CantierePrelievo } from "@/hooks/campo/useCampoPrelievo";

export const formatoQuantitaMagazzino = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 8 });

export function nomeCantierePrelievo(cantiere: CantierePrelievo) {
  return [cantiere.order_code, cantiere.description || cantiere.indirizzo_lavori]
    .filter(Boolean).join(" · ") || "Cantiere";
}

export function quantitaPrelievo(value: string) {
  const testo = value.trim();
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(testo)) return NaN;
  const numero = Number(testo.replace(",", "."));
  return Number.isFinite(numero) ? numero : NaN;
}
