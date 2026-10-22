/**
 * Il computo di commessa come lo legge un tecnico: super-categoria › categoria ›
 * sotto-categoria, con subtotale e percentuale sul totale a ogni livello.
 */
export interface MisuraComputo {
  id?: string;
  ordine: number;
  descrizione: string | null;
  parti_uguali: number | null;
  lunghezza: number | null;
  larghezza: number | null;
  altezza_peso: number | null;
  quantita: number | null;
  formula: string | null;
}

export interface VoceComputo {
  id: string;
  ordine: number;
  numero_ordine: string | null;
  codice_voce: string | null;
  codice_tariffa: string | null;
  codice_prezzario: string | null;
  descrizione_breve: string;
  descrizione_estesa: string | null;
  unita_misura: string | null;
  quantita: number | null;
  prezzo_unitario_computo: number | null;
  importo_computo: number | null;
  super_categoria: string | null;
  categoria: string | null;
  sotto_categoria: string | null;
  is_sicurezza: boolean;
  is_detrazione: boolean;
  a_corpo: boolean;
  warnings: string[] | null;
  misure: MisuraComputo[];
  /** Lavori o somme a disposizione (null = proposta automatica). */
  quadro_voce?: "lavori" | "somme_a_disposizione" | null;
  /** Variante: la voce del contratto originario. */
  voce_origine_id?: string | null;
  /** Nuovo prezzo (NP) introdotto con una variante. */
  nuovo_prezzo?: boolean | null;
}

export interface NodoComputo {
  chiave: string;
  livello: number;
  nome: string;
  importo: number;
  percentuale: number;
  numeroVoci: number;
  figli: NodoComputo[];
  voci: VoceComputo[];
}

const cent = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
export const numeroVoce = (v: Pick<VoceComputo, "numero_ordine" | "codice_voce" | "ordine">) => v.numero_ordine || v.codice_voce || String(v.ordine);
export const tariffaVoce = (v: Pick<VoceComputo, "codice_tariffa" | "codice_prezzario">) => v.codice_tariffa || v.codice_prezzario || "";

const LIVELLI = ["super_categoria", "categoria", "sotto_categoria"] as const;
const SENZA = ["Senza super-categoria", "Senza categoria", "Senza sotto-categoria"];

/** Raggruppa le voci per livello; un livello vuoto per tutte le voci si salta. */
export function alberoComputo(voci: VoceComputo[], totaleRiferimento?: number): { nodi: NodoComputo[]; totale: number } {
  const ordinate = [...voci].sort((a, b) => a.ordine - b.ordine);
  const totaleVoci = cent(ordinate.reduce((s, v) => s + (Number(v.importo_computo) || 0), 0));
  // Con la ricerca attiva le percentuali restano sul totale del computo intero.
  const totale = totaleRiferimento ?? totaleVoci;
  const livelliUsati = LIVELLI.map((campo, i) => ({ campo, i })).filter(({ campo }) => ordinate.some(v => v[campo]));
  const costruisci = (gruppo: VoceComputo[], profondita: number, prefisso: string): NodoComputo[] => {
    const liv = livelliUsati[profondita];
    if (!liv) return [];
    const mappa = new Map<string, VoceComputo[]>();
    for (const v of gruppo) {
      const nome = v[liv.campo]?.trim() || SENZA[liv.i];
      mappa.set(nome, [...(mappa.get(nome) ?? []), v]);
    }
    return [...mappa.entries()].map(([nome, vociNodo]) => {
      const chiave = `${prefisso}/${nome}`;
      const importo = cent(vociNodo.reduce((s, v) => s + (Number(v.importo_computo) || 0), 0));
      let figli = costruisci(vociNodo, profondita + 1, chiave);
      // Un solo figlio «Senza …» non aggiunge niente: le voci stanno direttamente qui.
      if (figli.length === 1 && figli[0].nome.startsWith("Senza ") && !figli[0].figli.length) figli = [];
      return {
        chiave, livello: profondita, nome, importo, percentuale: totale ? (importo / totale) * 100 : 0,
        numeroVoci: vociNodo.length, figli, voci: figli.length ? [] : vociNodo,
      };
    });
  };
  if (!livelliUsati.length) {
    return { nodi: [{ chiave: "/tutto", livello: 0, nome: "Tutte le voci", importo: totaleVoci, percentuale: totale ? (totaleVoci / totale) * 100 : 0, numeroVoci: ordinate.length, figli: [], voci: ordinate }], totale: totaleVoci };
  }
  return { nodi: costruisci(ordinate, 0, ""), totale: totaleVoci };
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Ricerca su numero, codice, descrizione, capitoli e righe di misura. */
export function filtraVoci(voci: VoceComputo[], ricerca: string): VoceComputo[] {
  const parole = norm(ricerca).split(/\s+/).filter(Boolean);
  if (!parole.length) return voci;
  return voci.filter(v => {
    const testo = norm([numeroVoce(v), tariffaVoce(v), v.descrizione_estesa || v.descrizione_breve, v.super_categoria, v.categoria,
      v.sotto_categoria, v.unita_misura, ...v.misure.map(m => m.descrizione)].join(" "));
    return parole.every(p => testo.includes(p));
  });
}
