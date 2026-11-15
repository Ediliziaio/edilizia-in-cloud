/**
 * Il Cash flow per le categorie del catalogo (15/11/2026).
 *
 * Richiesta: «organizza la tabella del cash flow per le categorie dell'Excel».
 * Il rendiconto resta lo stesso (saldi, previsione, stime): qui ogni suo
 * movimento si rimette sotto area → categoria → voce del catalogo
 * dell'AZIENDA, quindi con i nomi e le categorie che l'azienda ha scelto in
 * Configurazione.
 *
 * Dove va un movimento:
 *  1. ha una voce scelta sul movimento di banca (o una quota di una
 *     ripartizione) → la sua voce e la sua categoria;
 *  2. altrimenti la riga del riassunto in cui è finito (dal testo della prima
 *     nota, dal tipo di scadenza, dal Previsionale) → la categoria che, nel
 *     catalogo, raccoglie più voci attive di quella riga in quel verso (per le
 *     uscite «Acquisti di materiali» → «Materiali e merci»). Sta sotto
 *     «Senza voce precisa»;
 *  3. «Da classificare» resta «Da classificare»; una riga che nessuna voce
 *     usa si vede col suo nome, in fondo.
 *
 * Nessun movimento si perde e nessuno si conta due volte: la somma delle
 * categorie è il flusso netto del rendiconto, mese per mese.
 */
import type { DettaglioCella, RendicontoCassa } from "./rendicontoCassa";
import { VOCE_PER_CHIAVE, type VoceCassa } from "./vociCassa";
import type { VoceCatalogo } from "@/lib/finance/cassaVoci";

export interface RigaVoceCassa {
  chiave: string;
  codice: string | null;
  nome: string;
  valori: number[];
  dettagli: DettaglioCella[];
}

export interface RigaCategoriaCassa {
  chiave: string;
  codice: string | null;
  nome: string;
  valori: number[];
  dettagli: DettaglioCella[];
  /** Le voci con un importo, più «Senza voce precisa» se serve. */
  voci: RigaVoceCassa[];
  daClassificare: boolean;
}

export interface AreaCassa {
  chiave: string;
  nome: string;
  valori: number[];
  categorie: RigaCategoriaCassa[];
}

export const SENZA_VOCE = "Senza voce precisa";
const DA_CLASSIFICARE = "__da_classificare";
const ALTRE = "__altre";
const zeri = () => Array.from({ length: 12 }, () => 0);
const ordina = (a: VoceCatalogo, b: VoceCatalogo) => a.ordine - b.ordine || a.codice.localeCompare(b.codice);

/** La categoria di una voce o sottovoce (o la voce stessa se è una categoria). */
function categoriaDi(v: VoceCatalogo, perId: Map<string, VoceCatalogo>): VoceCatalogo | null {
  if (v.livello === "categoria") return v;
  if (v.livello === "area") return null;
  const padre = v.parent_id ? perId.get(v.parent_id) : undefined;
  if (!padre) return null;
  return padre.livello === "categoria" ? padre : categoriaDi(padre, perId);
}

/**
 * Per ogni riga del riassunto e verso, la categoria che ne raccoglie più voci
 * (prima le attive; se nessuna è attiva, anche le spente). Chiave `in:riga` / `out:riga`.
 */
export function categoriaPerRiga(catalogo: VoceCatalogo[]): Map<string, VoceCatalogo> {
  const perId = new Map(catalogo.map((v) => [v.id, v]));
  const conta = (soloAttive: boolean) => {
    const c = new Map<string, Map<string, number>>();
    for (const v of catalogo) {
      if (v.livello !== "voce" && v.livello !== "sottovoce") continue;
      if (v.archiviata_il || (soloAttive && !v.attiva)) continue;
      const cat = categoriaDi(v, perId);
      if (!cat) continue;
      for (const [verso, riga] of [["in", v.voce_cassa_in], ["out", v.voce_cassa_out]] as const) {
        if (!riga) continue;
        const k = `${verso}:${riga}`;
        const m = c.get(k) ?? new Map<string, number>();
        m.set(cat.id, (m.get(cat.id) ?? 0) + 1);
        c.set(k, m);
      }
    }
    return c;
  };
  const out = new Map<string, VoceCatalogo>();
  for (const soloAttive of [true, false]) {
    for (const [k, m] of conta(soloAttive)) {
      if (out.has(k)) continue;
      const migliore = [...m.entries()]
        .map(([id, n]) => ({ cat: perId.get(id)!, n }))
        .sort((a, b) => b.n - a.n || ordina(a.cat, b.cat))[0];
      if (migliore) out.set(k, migliore.cat);
    }
  }
  return out;
}

export function vistaPerCategorie(r: RendicontoCassa, catalogo: VoceCatalogo[]): AreaCassa[] {
  const perId = new Map(catalogo.map((v) => [v.id, v]));
  const perCodice = new Map(catalogo.map((v) => [v.codice, v]));
  const predefinita = categoriaPerRiga(catalogo);

  type Cat = RigaCategoriaCassa & { area: string; ordine: [number, string]; perVoce: Map<string, RigaVoceCassa & { ordine: string }> };
  const aree = new Map<string, { nome: string; ordine: [number, string] }>();
  const categorie = new Map<string, Cat>();

  const cella = (
    chiave: string, nome: string, codice: string | null, area: { chiave: string; nome: string; ordine: [number, string] },
    ordine: [number, string], daClassificare: boolean,
  ): Cat => {
    if (!aree.has(area.chiave)) aree.set(area.chiave, { nome: area.nome, ordine: area.ordine });
    let c = categorie.get(chiave);
    if (!c) {
      c = { chiave, codice, nome, valori: zeri(), dettagli: [], voci: [], daClassificare, area: area.chiave, ordine, perVoce: new Map() };
      categorie.set(chiave, c);
    }
    return c;
  };

  for (const [k, lista] of r.dettagli) {
    const sep = k.lastIndexOf(":");
    const riga = k.slice(0, sep) as VoceCassa;
    const mese = Number(k.slice(sep + 1));
    const daClassificare = !!VOCE_PER_CHIAVE.get(riga)?.daClassificare;
    for (const d of lista) {
      const scelta = d.codiceCassa ? perCodice.get(d.codiceCassa) : undefined;
      const voce = scelta && (scelta.livello === "voce" || scelta.livello === "sottovoce") ? scelta : undefined;
      const categoria = (scelta ? categoriaDi(scelta, perId) : null)
        ?? (daClassificare ? null : predefinita.get(`${d.cents >= 0 ? "in" : "out"}:${riga}`) ?? null);

      let c: Cat;
      if (categoria) {
        const area = categoria.parent_id ? perId.get(categoria.parent_id) : undefined;
        c = cella(
          categoria.id, categoria.nome, categoria.codice,
          area ? { chiave: area.id, nome: area.nome, ordine: [area.ordine, area.codice] } : { chiave: ALTRE, nome: "Altre righe", ordine: [Number.MAX_SAFE_INTEGER - 1, ""] },
          [categoria.ordine, categoria.codice], false,
        );
      } else if (daClassificare) {
        c = cella(DA_CLASSIFICARE, "Movimenti da classificare", null,
          { chiave: DA_CLASSIFICARE, nome: "Da classificare", ordine: [Number.MAX_SAFE_INTEGER, ""] }, [0, ""], true);
      } else {
        c = cella(`__riga:${riga}`, VOCE_PER_CHIAVE.get(riga)?.label ?? riga, null,
          { chiave: ALTRE, nome: "Altre righe", ordine: [Number.MAX_SAFE_INTEGER - 1, ""] }, [0, riga], false);
      }
      c.valori[mese - 1] += d.cents;
      c.dettagli.push(d);
      const chiaveVoce = voce ? voce.id : "__senza_voce";
      let v = c.perVoce.get(chiaveVoce);
      if (!v) {
        v = { chiave: chiaveVoce, codice: voce?.codice ?? null, nome: voce?.nome ?? SENZA_VOCE, valori: zeri(), dettagli: [], ordine: voce?.codice ?? "￿" };
        c.perVoce.set(chiaveVoce, v);
      }
      v.valori[mese - 1] += d.cents;
      v.dettagli.push(d);
    }
  }

  const confronta = (a: [number, string], b: [number, string]) => a[0] - b[0] || a[1].localeCompare(b[1]);
  return [...aree.entries()]
    .sort((a, b) => confronta(a[1].ordine, b[1].ordine))
    .map(([chiave, a]) => {
      const cats = [...categorie.values()]
        .filter((c) => c.area === chiave)
        .sort((x, y) => confronta(x.ordine, y.ordine))
        .map(({ area: _a, ordine: _o, perVoce, ...c }) => ({
          ...c,
          voci: [...perVoce.values()].sort((x, y) => x.ordine.localeCompare(y.ordine)).map(({ ordine: _v, ...v }) => v),
        }));
      const valori = zeri();
      for (const c of cats) c.valori.forEach((x, i) => (valori[i] += x));
      return { chiave, nome: a.nome, valori, categorie: cats };
    });
}

/** Righe per l'Excel della vista per categorie (euro interi). */
export function righeEsportazioneCategorie(
  r: RendicontoCassa,
  aree: AreaCassa[],
): { voce: string; valori: (number | null)[]; totale: number | null }[] {
  const euro = (c: number | null) => (c == null ? null : Math.round(c / 100));
  const somma = (a: number[]) => a.reduce((s, c) => s + c, 0);
  const out: { voce: string; valori: (number | null)[]; totale: number | null }[] = [];
  out.push({ voce: "Saldo di cassa a inizio mese", valori: r.saldoInizio.map(euro), totale: euro(r.saldoInizio[0]) });
  for (const a of aree) {
    out.push({ voce: a.nome.toUpperCase(), valori: a.valori.map((): number | null => null), totale: null });
    for (const c of a.categorie) {
      out.push({ voce: `  ${c.codice ? `${c.codice} ` : ""}${c.nome}`, valori: c.valori.map(euro), totale: euro(somma(c.valori)) });
      if (c.voci.length > 1 || (c.voci[0] && c.voci[0].codice))
        for (const v of c.voci) out.push({ voce: `      ${v.codice ? `${v.codice} ` : ""}${v.nome}`, valori: v.valori.map(euro), totale: euro(somma(v.valori)) });
    }
    out.push({ voce: `Totale ${a.nome}`, valori: a.valori.map(euro), totale: euro(somma(a.valori)) });
  }
  out.push({ voce: "FLUSSO NETTO DEL MESE", valori: r.flussoNetto.map(euro), totale: euro(somma(r.flussoNetto)) });
  out.push({ voce: "SALDO DI CASSA A FINE MESE", valori: r.saldoFine.map(euro), totale: euro(r.saldoFine[11]) });
  return out;
}

/**
 * Quanto del CONSUNTIVO è classificato bene (in valore assoluto):
 *  - `precisa`: con una voce scelta sul movimento (o da una regola, dalla
 *    fattura confermata, da una ripartizione);
 *  - `stimata`: messo in categoria dalla riga della prima nota o del tipo di
 *    scadenza, senza una voce scelta;
 *  - `daClassificare`: senza alcuna indicazione.
 */
export function qualitaClassificazione(r: RendicontoCassa): { precisa: number; stimata: number; daClassificare: number; totale: number } {
  const q = { precisa: 0, stimata: 0, daClassificare: 0, totale: 0 };
  for (const [k, lista] of r.dettagli) {
    const riga = k.slice(0, k.lastIndexOf(":")) as VoceCassa;
    const daClassificare = !!VOCE_PER_CHIAVE.get(riga)?.daClassificare;
    for (const d of lista) {
      if (d.tipo !== "registrato") continue;
      const a = Math.abs(d.cents);
      q.totale += a;
      if (d.codiceCassa) q.precisa += a;
      else if (daClassificare) q.daClassificare += a;
      else q.stimata += a;
    }
  }
  return q;
}

/** Totale dell'anno per categoria e per area, chiave come nella vista (id della voce del catalogo). */
export function totaliPerChiave(aree: AreaCassa[]): Map<string, number> {
  const out = new Map<string, number>();
  const somma = (a: number[]) => a.reduce((s, c) => s + c, 0);
  for (const a of aree) {
    out.set(`area:${a.chiave}`, somma(a.valori));
    for (const c of a.categorie) out.set(c.chiave, somma(c.valori));
  }
  return out;
}
