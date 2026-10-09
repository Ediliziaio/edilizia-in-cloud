/** Catalogo della singola famiglia/linea. Nessuna disponibilità o tariffa del fornitore inventata. */
import { z } from "zod";
import type { AxisValue } from "@/types/articleFamily";
import { vociDi } from "@/lib/listino/scelteVariante";
import { sceltaPerIlPrezzo, testiColori, type AsseColore, type ColoriDentroFuori, type LatoColore } from "./coloriDentroFuori";

export const CHIAVE_CATALOGO_COLORI = "serramenti_catalogo_colori_v1";
const campioneSchema = z.object({
  chiave: z.string().min(1), codice: z.string().max(100), finitura: z.string().max(100),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i).or(z.literal("")),
  lati: z.array(z.enum(["interno", "esterno"])).max(2),
  attivo: z.boolean(), confermato: z.boolean(),
});
export const catalogoColoriSchema = z.object({
  versione: z.literal(1),
  modalita: z.enum(["fascia_piu_cara", "combinazioni"]),
  campioni: z.array(campioneSchema).max(1000),
  combinazioni: z.array(z.object({ interno: z.string().min(1), esterno: z.string().min(1), fasciaId: z.string().min(1) })).max(1000),
}).superRefine((c, ctx) => {
  if (new Set(c.campioni.map(v => v.chiave)).size !== c.campioni.length)
    ctx.addIssue({ code: "custom", message: "Ogni colore deve comparire una sola volta nel catalogo." });
  if (new Set(c.combinazioni.map(v => JSON.stringify([v.interno, v.esterno]))).size !== c.combinazioni.length)
    ctx.addIssue({ code: "custom", message: "Ogni combinazione interno/esterno deve avere una sola fascia." });
});
export type CatalogoColori = z.infer<typeof catalogoColoriSchema>;
export type CampioneColore = CatalogoColori["campioni"][number];
export const catalogoVuoto = (): CatalogoColori => ({ versione: 1, modalita: "fascia_piu_cara", campioni: [], combinazioni: [] });
export function coloriDentroFuoriAbilitati(family: { vertical?: string; disegno_tipologia?: string | null; custom_field_values?: Record<string, unknown> | null }): boolean {
  return /^serrament/i.test(family.vertical ?? "") || !!family.disegno_tipologia || family.custom_field_values?.[CHIAVE_CATALOGO_COLORI] != null;
}
export function leggiCatalogoColori(custom: Record<string, unknown> | null | undefined): CatalogoColori | null {
  const parsed = catalogoColoriSchema.safeParse(custom?.[CHIAVE_CATALOGO_COLORI]);
  return parsed.success ? parsed.data : null;
}
/** La chiave include la fascia: lo stesso RAL può avere prezzi diversi in fasce diverse. */
export const chiaveColore = (valueId: string, voce: string | null) => JSON.stringify([valueId, voce]);
export function elencoColori(asse: AsseColore) {
  return asse.values.flatMap(v => {
    const voci = vociDi(v);
    return (voci.length ? voci : [null]).map(voce => ({
      chiave: chiaveColore(v.id, voce), valueId: v.id, voce, nome: voce ?? v.label,
      fascia: v.label, attivo: v.attivo !== false,
    }));
  });
}
export function coloreDisponibile(catalogo: CatalogoColori | null | undefined, chiave: string, lato: LatoColore): boolean {
  const c = catalogo?.campioni.find(v => v.chiave === chiave);
  return !c || (c.attivo && c.lati.includes(lato));
}
/** Solo le scelte attive e ammesse sul lato; quelle storiche si mostrano comunque come non disponibili. */
export function valoriPerLato(values: AxisValue[], catalogo: CatalogoColori | null | undefined, lato: LatoColore): AxisValue[] {
  return values.map(v => {
    const voci = vociDi(v);
    if (!voci.length) return { ...v, attivo: v.attivo && coloreDisponibile(catalogo, chiaveColore(v.id, null), lato) };
    const ammesse = voci.filter(voce => coloreDisponibile(catalogo, chiaveColore(v.id, voce), lato));
    return { ...v, opzioni: ammesse, attivo: v.attivo && ammesse.length > 0 };
  });
}
export function verificaColori(asse: AsseColore, colori: ColoriDentroFuori, catalogo: CatalogoColori | null | undefined) {
  const avvisi: string[] = [];
  let blocca = false;
  const chiavi: Partial<Record<LatoColore, string>> = {};
  for (const lato of ["interno", "esterno"] as const) {
    const s = colori[lato];
    const v = asse.values.find(v => v.id === s.valueId);
    if (s.scritto) { avvisi.push(`Colore ${lato} scritto a mano: disponibilità e prezzo da verificare col fornitore.`); continue; }
    if (!v || (vociDi(v).length > 0 && !s.voce)) { avvisi.push(`Colore ${lato} da scegliere.`); continue; }
    const chiave = chiaveColore(v.id, s.voce);
    const esiste = vociDi(v).length ? vociDi(v).includes(s.voce ?? "") : !s.voce;
    if (v.attivo === false || !esiste || !coloreDisponibile(catalogo, chiave, lato)) {
      avvisi.push(`Colore ${lato} non disponibile su questa linea.`); blocca = true; continue;
    }
    chiavi[lato] = chiave;
    if (catalogo && catalogo.campioni.find(c => c.chiave === chiave)?.confermato !== true)
      avvisi.push(`Colore ${lato}: disponibilità da confermare col fornitore.`);
  }
  let fasciaId: string | null = null;
  if (catalogo?.modalita === "combinazioni") {
    const regola = catalogo.combinazioni.find(c => c.interno === chiavi.interno && c.esterno === chiavi.esterno);
    if (regola && asse.values.some(v => v.id === regola.fasciaId && v.attivo !== false)) fasciaId = regola.fasciaId;
    else { blocca = true; avvisi.push("Combinazione interno/esterno da quotare: manca una fascia fornitore valida."); }
  }
  return { avvisi, blocca, fasciaId };
}
/** La regola esplicita usa la fascia già configurata, con acquisto e vendita distinti. Legacy invariato. */
export function guidaPrezzoColori(asse: AsseColore, colori: ColoriDentroFuori, catalogo: CatalogoColori | null | undefined,
  prezzo: (id: string) => number | null | undefined) {
  const stato = verificaColori(asse, colori, catalogo);
  if (catalogo?.modalita === "combinazioni") return stato.fasciaId ? { valueId: stato.fasciaId, voce: null } : null;
  return sceltaPerIlPrezzo(colori, prezzo);
}

/** Il testo commerciale conserva anche codice e finitura; il calcolo continua a usare gli ID. */
export function testiColoriCatalogo(asse: AsseColore, colori: ColoriDentroFuori, catalogo: CatalogoColori | null | undefined) {
  const testi = testiColori(asse, colori);
  for (const lato of ["interno", "esterno"] as const) {
    const scelta = colori[lato];
    if (scelta.scritto || !scelta.valueId || !testi[lato]) continue;
    const campione = catalogo?.campioni.find(c => c.chiave === chiaveColore(scelta.valueId!, scelta.voce));
    const extra = [campione?.codice ? `cod. ${campione.codice}` : "", campione?.finitura].filter(Boolean);
    if (extra.length) testi[lato] += ` · ${extra.join(" · ")}`;
  }
  return testi;
}

/** Copie di prodotto: gli ID delle varianti cambiano, anche tutti i riferimenti del catalogo. */
export function rimappaCatalogoColori(catalogo: CatalogoColori, ids: Map<string, string>): CatalogoColori {
  const cambiaId = (id: string) => {
    const nuovo = ids.get(id);
    if (!nuovo) throw new Error("Il catalogo colori contiene una variante non più presente. Controllalo prima di duplicare il prodotto.");
    return nuovo;
  };
  const cambiaChiave = (chiave: string) => {
    const s: unknown = JSON.parse(chiave);
    if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== "string" || !(s[1] === null || typeof s[1] === "string")) throw new Error("Riferimento colore non valido");
    return chiaveColore(cambiaId(s[0]), s[1]);
  };
  return { ...catalogo,
    campioni: catalogo.campioni.map(c => ({ ...c, chiave: cambiaChiave(c.chiave) })),
    combinazioni: catalogo.combinazioni.map(c => ({ interno: cambiaChiave(c.interno), esterno: cambiaChiave(c.esterno), fasciaId: cambiaId(c.fasciaId) })),
  };
}
