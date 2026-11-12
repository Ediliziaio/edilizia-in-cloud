import {
  CATEGORIE_PIANO,
  CHIAVI_REALI,
  type CategoriaPiano,
} from "./pianoCategorie";

export interface CategoriaGrafico {
  id: string;
  nome: string;
  valore: number;
  colore: string;
  categorie: string[];
}
const COLORI = [
  "rgb(var(--brand-navy-deep, 23 59 103))",
  "rgb(var(--brand-accent, 249 115 22))",
  "#0d9488",
  "#6395c3",
  "#d9a441",
  "#94a3b8",
];
const PER_CATEGORIA: Record<string, string> = {
  costruzione: COLORI[0],
  materiali: COLORI[0],
  terreno: COLORI[1],
  oneri: COLORI[2],
  progettazione: COLORI[3],
  commercializzazione: COLORI[4],
  manodopera: COLORI[2],
  subappalti: COLORI[1],
  finanziari: COLORI[3],
  imprevisti: COLORI[4],
};

/** Somma categorie della stessa colonna. Le rettifiche restano con il loro segno. */
export function composizioneCosti(
  righe: readonly { categoria: string; valore: number }[],
) {
  const perCategoria = new Map<string, number>();
  for (const r of righe) {
    if (!Number.isFinite(r.valore)) continue;
    perCategoria.set(
      r.categoria,
      (perCategoria.get(r.categoria) ?? 0) + r.valore,
    );
  }
  const tutte = [...perCategoria]
    .map(([id, valore]) => ({
      id,
      categorie: [id],
      valore: Math.round(valore * 100) / 100,
      nome:
        CATEGORIE_PIANO[id as CategoriaPiano]?.nome ??
        CHIAVI_REALI[id] ??
        "Altri costi",
    }))
    .filter((r) => r.valore !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.valore) - Math.abs(a.valore) || a.id.localeCompare(b.id),
    );
  const totale =
    Math.round(tutte.reduce((s, r) => s + r.valore, 0) * 100) / 100;
  // Con valori negativi la torta non rappresenta il netto: mostrare l'elenco firmato.
  const conRettifiche = tutte.some((r) => r.valore < 0);
  const visibili =
    conRettifiche || tutte.length <= 6
      ? tutte
      : [
          ...tutte.slice(0, 5),
          {
            id: "altre-categorie",
            categorie: tutte.slice(5).map((r) => r.id),
            nome: "Altri costi",
            valore:
              Math.round(
                tutte.slice(5).reduce((s, r) => s + r.valore, 0) * 100,
              ) / 100,
          },
        ];
  return {
    totale,
    conRettifiche,
    categorie: visibili.map(
      (r): CategoriaGrafico => ({
        ...r,
        colore: PER_CATEGORIA[r.id] ?? COLORI[5],
      }),
    ),
  };
}

/** SAL e residuo sono parti esclusive. Uno sforamento non viene nascosto tagliando la fetta. */
export function composizioneSal(contratto: number | null, aSal: number) {
  if (
    contratto === null ||
    !Number.isFinite(contratto) ||
    contratto <= 0 ||
    !Number.isFinite(aSal) ||
    aSal < 0
  )
    return null;
  const residuo = Math.round((contratto - aSal) * 100) / 100;
  return {
    contratto,
    aSal,
    residuo,
    oltre: residuo < 0,
    percentuale: Math.round((aSal / contratto) * 100),
  };
}
