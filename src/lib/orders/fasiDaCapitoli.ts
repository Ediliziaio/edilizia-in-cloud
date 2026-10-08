// src/lib/orders/fasiDaCapitoli.ts
/**
 * Dal computo di una ristrutturazione alle fasi della commessa (07/10/2026): un
 * capitolo = una fase, col suo «venduto». Il venduto di un capitolo è la sua parte
 * dell'imponibile della commessa: con uno sconto globale o un prezzo scritto a mano
 * le righe del computo non sommano all'imponibile, quindi si scala in proporzione e
 * l'ultimo capitolo prende il resto (la somma dei venduti fa sempre l'imponibile).
 * Modulo puro.
 */
export interface VoceComputo {
  capitolo_nome: string | null | undefined;
  importo: number | string | null | undefined;
}

export interface FaseDaCapitolo {
  nome: string;
  venduto: number;
}

/** Il limite della RPC aggiungi_fasi_commessa. */
export const MAX_FASI_DA_CAPITOLI = 60;

const arrotonda = (n: number): number => Math.round(n * 100) / 100;
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function fasiDaCapitoli(voci: ReadonlyArray<VoceComputo>, imponibile: number): FaseDaCapitolo[] {
  const somme = new Map<string, number>();
  for (const v of voci) {
    const nome = (v.capitolo_nome ?? "").trim().slice(0, 160) || "Generale";
    somme.set(nome, (somme.get(nome) ?? 0) + numero(v.importo));
  }
  let capitoli = [...somme.entries()].map(([nome, importo]) => ({ nome, importo: Math.max(0, importo) }));
  if (capitoli.length > MAX_FASI_DA_CAPITOLI) {
    const resto = capitoli.slice(MAX_FASI_DA_CAPITOLI - 1).reduce((s, c) => s + c.importo, 0);
    capitoli = [...capitoli.slice(0, MAX_FASI_DA_CAPITOLI - 1), { nome: "Altri capitoli", importo: resto }];
  }
  const totale = capitoli.reduce((s, c) => s + c.importo, 0);
  const target = Math.max(0, arrotonda(numero(imponibile)));
  if (totale <= 0 || target <= 0) return capitoli.map((c) => ({ nome: c.nome, venduto: 0 }));

  const ultimo = capitoli.reduce((last, c, i) => (c.importo > 0 ? i : last), -1);
  let assegnato = 0;
  return capitoli.map((c, i): FaseDaCapitolo => {
    if (i === ultimo) return { nome: c.nome, venduto: Math.max(0, arrotonda(target - assegnato)) };
    const venduto = arrotonda((c.importo * target) / totale);
    assegnato = arrotonda(assegnato + venduto);
    return { nome: c.nome, venduto };
  });
}
