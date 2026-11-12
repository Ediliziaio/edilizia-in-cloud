export interface ConsegnaRiepilogo {
  tipo: "ingresso" | "reso" | "servizio";
  destinazione: "cantiere" | "magazzino";
  quantita: number;
  unita_misura: string;
  warehouses?: { name: string } | null;
}
interface Documento {
  ricezione_esplicita?: boolean;
  quantita_ricevuta?: number | null;
  destinazione?: string;
  warehouses?: { name: string } | null;
  consegne?: ConsegnaRiepilogo[];
}
/** La precisione delle quantità è sei decimali, come nel confronto ordini. */
export function quantitaResiduaDDT(totale: number | null, registrata: number): number {
  const residuo = Number(totale) - registrata;
  return Number.isFinite(residuo) ? Math.max(0, Math.round(residuo * 1e6) / 1e6) : 0;
}
export function riepilogoQuantitaDDT(d: Documento): string {
  if (!d.ricezione_esplicita && !d.consegne?.length)
    return Number(d.quantita_ricevuta ?? 0).toLocaleString("it-IT", {
      maximumFractionDigits: 6,
    });
  const gruppi = new Map<string, { nome: string; um: string; q: number }>();
  for (const c of d.consegne ?? []) {
    const nome =
      c.tipo === "servizio"
        ? "Servizi"
        : `${c.tipo === "reso" ? "Reso " : ""}${c.destinazione === "cantiere" ? "Cantiere" : "Magazzino"}`;
    const key = `${nome}:${c.unita_misura}`;
    const g = gruppi.get(key) ?? { nome, um: c.unita_misura, q: 0 };
    g.q += Number(c.quantita);
    gruppi.set(key, g);
  }
  return (
    [...gruppi.values()]
      .map(
        (g) =>
          `${g.nome}: ${g.q.toLocaleString("it-IT", { maximumFractionDigits: 6 })} ${g.um}`,
      )
      .join(" · ") || "Consegne da confermare"
  );
}
export function destinazioneConsegneDDT(d: Documento): string {
  const destinazioni = new Set(
    d.consegne?.filter((c) => c.tipo !== "servizio").map((c) => c.destinazione),
  );
  if (destinazioni.size > 1) return "Cantiere e magazzino";
  return (destinazioni.values().next().value ?? d.destinazione) === "cantiere"
    ? "In cantiere"
    : "In magazzino";
}
export function magazziniConsegneDDT(d: Documento): string {
  const nomi = [
    ...new Set(
      d.consegne?.flatMap((c) =>
        c.destinazione === "magazzino" && c.warehouses?.name
          ? [c.warehouses.name]
          : [],
      ) ?? [],
    ),
  ];
  if (nomi.length) return nomi.join(" · ");
  if (destinazioneConsegneDDT(d) === "In cantiere")
    return "Consegna diretta in cantiere";
  return d.warehouses?.name ?? "Magazzino non indicato";
}
