/**
 * A che punto è ogni riga nata dal rilievo: misure, ordine al fornitore, arrivo
 * (piano sopralluoghi, lotto 5). I dati arrivano da `sopralluogo_stato_righe`, senza prezzi.
 */
export interface RigaDelRilievo {
  order_item_id: string;
  riferimento: string | null;
  nome: string;
  stato_misure: string | null;
  quantita: number | null;
  unita: string | null;
  oda_id: string | null;
  oda_numero: string | null;
  oda_stato: string | null;
  quantita_ordinata: number | null;
  quantita_arrivata: number | null;
}

export type Passo = "da_confermare" | "da_ordinare" | "ordinata" | "in_arrivo" | "arrivata";

export const ETICHETTA_PASSO: Record<Passo, string> = {
  da_confermare: "Misure da confermare",
  da_ordinare: "Da ordinare",
  ordinata: "In ordine (bozza)",
  in_arrivo: "Ordinata, in arrivo",
  arrivata: "Arrivata",
};

/** Una riga può stare su più ordini: si guarda il passo più avanti. */
export function passoRiga(righe: RigaDelRilievo[]): Passo {
  const prima = righe[0];
  if (!prima) return "da_confermare";
  if (prima.stato_misure === "da_rilevare" || prima.stato_misure === "rilevato") return "da_confermare";
  const ordini = righe.filter((r) => r.oda_id);
  if (!ordini.length) return "da_ordinare";
  const ordinata = ordini.reduce((t, r) => t + Number(r.quantita_ordinata ?? 0), 0);
  const arrivata = ordini.reduce((t, r) => t + Number(r.quantita_arrivata ?? 0), 0);
  if (ordinata > 0 && arrivata >= ordinata) return "arrivata";
  if (ordini.some((r) => r.oda_stato && r.oda_stato !== "bozza")) return "in_arrivo";
  return "ordinata";
}

/** Le righe raggruppate per riga di commessa, con il loro passo. */
export function righePerPasso(righe: RigaDelRilievo[]) {
  const gruppi = new Map<string, RigaDelRilievo[]>();
  for (const r of righe) gruppi.set(r.order_item_id, [...(gruppi.get(r.order_item_id) ?? []), r]);
  return [...gruppi.values()].map((g) => ({ riga: g[0], ordini: g.filter((r) => r.oda_id), passo: passoRiga(g) }));
}
