/**
 * Il modo di pagamento di una scadenza, in parole e a gruppi (16/11/2026). Nel database è testo
 * libero: «riba», «MP12», «Bonifico Vista Fattura», «bank_transfer», «MP05»… Qui diventa RiBa,
 * Bonifico, Contanti… e ogni gruppo ha il filtro che il server sa applicare.
 */
export type GruppoMetodo = "riba" | "bonifico" | "rid" | "contanti" | "assegno" | "carta" | "altro";

export const GRUPPI_METODO: Array<{ value: GruppoMetodo; label: string }> = [
  { value: "riba", label: "RiBa" },
  { value: "bonifico", label: "Bonifico" },
  { value: "rid", label: "RID / SDD" },
  { value: "contanti", label: "Contanti" },
  { value: "assegno", label: "Assegno" },
  { value: "carta", label: "Carta" },
];

const CODICI: Record<string, GruppoMetodo> = {
  MP01: "contanti", MP02: "assegno", MP03: "assegno", MP05: "bonifico", MP08: "carta",
  MP09: "rid", MP10: "rid", MP11: "rid", MP12: "riba", MP19: "rid", MP20: "rid", MP21: "rid",
};

/** Il gruppo di un metodo scritto in un modo qualsiasi; null se non c'è. */
export function gruppoMetodo(raw: string | null | undefined): GruppoMetodo | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const codice = CODICI[t.toUpperCase()];
  if (codice) return codice;
  const l = t.toLowerCase();
  if (/ri\.?ba|ricevuta bancaria/.test(l)) return "riba";
  if (/bonific|bank_transfer|transfer|sepa ct/.test(l)) return "bonifico";
  if (/\brid\b|sdd|addebito/.test(l)) return "rid";
  if (/contant|cash/.test(l)) return "contanti";
  if (/assegn/.test(l)) return "assegno";
  if (/carta|card|pos\b/.test(l)) return "carta";
  return "altro";
}

export function etichettaMetodo(raw: string | null | undefined): string | null {
  const g = gruppoMetodo(raw);
  if (!g) return null;
  return GRUPPI_METODO.find((x) => x.value === g)?.label ?? raw!.trim();
}

/** Il filtro PostgREST («or») che prende tutte le scritture di un gruppo. */
export function filtroMetodo(g: GruppoMetodo): string {
  const codici = Object.entries(CODICI).filter(([, v]) => v === g).map(([k]) => `payment_method.eq.${k}`);
  const parole: Record<GruppoMetodo, string[]> = {
    riba: ["*riba*", "*ri.ba*", "*ricevuta bancaria*"],
    bonifico: ["*bonific*", "*bank_transfer*"],
    rid: ["rid", "*sdd*", "*addebito*"],
    contanti: ["*contant*", "*cash*"],
    assegno: ["*assegn*"],
    carta: ["*carta*", "*card*"],
    altro: [],
  };
  return [...codici, ...parole[g].map((p) => `payment_method.ilike.${p}`)].join(",");
}
