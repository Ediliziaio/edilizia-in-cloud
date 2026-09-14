/**
 * Il listino come lo pensa chi vende: area → tipologia → linea → prodotti.
 *
 *   Area Serramenti → Tapparelle → PVC → Tapparella PVC pesante, 48 €/mq
 *   Area Serramenti → Serramenti → PVC Salamander 76 → Finestra 1 Anta, 520 €/mq
 *   Area Bagni      → Vasche → Linea vasca tipo 1 → Vasca ovale
 *
 * Nessuno di questi livelli è una tabella a sé: si ricompongono da quello che
 * le aziende hanno già.
 *  - Area: i verticali abilitati della macrocategoria, cioè il valore con cui
 *    il preventivatore sceglie i prodotti; se mancano, il verticale degli
 *    articoli (vedi areeStandard.ts).
 *  - Tipologia: la macrocategoria; dove l'azienda non ne ha, la categoria.
 *  - Linea: l'asse «Linea» (la stessa Finestra 1 Anta vale in ogni linea con
 *    uno scostamento di prezzo, e compare dentro ciascuna), oppure una
 *    categoria dentro la macrocategoria (tapparelle in PVC e in alluminio,
 *    che sono prodotti diversi).
 *
 * Le categorie create in automatico insieme a un articolo, che ne portano il
 * nome e contengono solo lui (Ser Style, Ke Bei), non diventano linee:
 * farebbero cento cartelle da un prodotto.
 */
import type { AxisValue, FamilyAxis, FamilyWithAxes } from "@/types/articleFamily";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import {
  areaDiVerticale,
  areaStandard,
  chiaveTesto,
  nomeArea,
  riconosciTipologiaStandard,
  type AreaStandard,
  type TipologiaStandard,
} from "./areeStandard";

import { eAsseLinea } from "./schedeLinea";

export { chiaveTesto };

export interface MacroListino {
  id: string;
  nome: string;
  sort_order?: number | null;
  verticali_abilitati?: string[] | null;
  tipologia?: string | null;
  categoria_tipo?: string | null;
  fv_categoria?: string | null;
  immagine_url?: string | null;
  attivo?: boolean | null;
}

export interface CategoriaListino {
  id: string;
  nome: string;
  macrocategoria_id: string | null;
  sort_order?: number | null;
}

/** Da dove viene la linea: l'asse «Linea», una categoria, o nessuna delle due. */
export type FonteLinea = "asse" | "categoria" | "altri";

export type FonteTipologia = "macrocategoria" | "categoria" | "senza";

/**
 * Se la tipologia arriva al preventivatore:
 *  - "area": è etichettata per la sua area e compare nel preventivatore di quell'area;
 *  - "tutte": non ha etichette e compare in ogni preventivatore;
 *  - "nessuno": il preventivatore non la propone (la trova solo la ricerca).
 */
export type CollegamentoTipologia = "area" | "tutte" | "nessuno";

export interface RigaListino {
  /** Univoca nella pagina: una tipologia con più linee compare una volta per linea. */
  chiave: string;
  famiglia: FamilyWithAxes;
  /** Il valore dell'asse Linea che questa riga rappresenta, se la linea viene dall'asse. */
  linea: AxisValue | null;
  asseCodice: string | null;
}

export interface LineaListino {
  chiave: string;
  nome: string;
  fonte: FonteLinea;
  /** Solo per le linee da asse: scostamento dal prezzo base (−8, 0, +35). Null se a cifra fissa. */
  scostamentoPct: number | null;
  /** La linea di riferimento di un asse: quella a scostamento zero. */
  base: boolean;
  categoriaId: string | null;
  righe: RigaListino[];
}

export interface TipologiaListino {
  chiave: string;
  nome: string;
  fonte: FonteTipologia;
  macrocategoriaId: string | null;
  categoriaId: string | null;
  immagineUrl: string | null;
  accessorio: boolean;
  /**
   * Come la tratta il preventivatore, dal database: un «accessorio» si aggiunge
   * alla finestra, un «principale» sta da solo. Null se non è una macrocategoria.
   */
  categoriaTipo: "principale" | "accessorio" | null;
  collegamento: CollegamentoTipologia;
  /** Spenta (attivo = false): resta nel listino, ma i preventivatori non la propongono. */
  attiva: boolean;
  /** La tipologia standard che rappresenta, se la si riconosce. */
  standard: TipologiaStandard | null;
  /** Articoli distinti: una tipologia presente in due linee conta una volta. */
  articoli: number;
  linee: LineaListino[];
}

export interface AreaListino {
  chiave: string;
  nome: string;
  standard: AreaStandard | null;
  articoli: number;
  tipologie: TipologiaListino[];
  /** Le tipologie standard dell'area che l'azienda non ha ancora. */
  mancanti: TipologiaStandard[];
}

export interface EconomiaRiga {
  /** Prezzo di vendita di un'unità nella linea; null quando senza misure non si calcola (griglia). */
  vendita: number | null;
  /** Costo di un'unità; null se manca. */
  acquisto: number | null;
  /** Margine sul prezzo di vendita; null senza costo o senza prezzo. */
  marginePct: number | null;
  /** "mq", "pz", "ml"… */
  unita: string;
  griglia: boolean;
}

type Ordine = [number, number, string];

function confronta(a: Ordine, b: Ordine): number {
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

function piuFrequente(conteggi: Map<string, number>): string | null {
  let migliore: string | null = null;
  let volte = -1;
  for (const [chiave, n] of [...conteggi.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (n > volte) {
      migliore = chiave;
      volte = n;
    }
  }
  return migliore;
}

function conta(chiavi: Array<string | null>): Map<string, number> {
  const conteggi = new Map<string, number>();
  for (const chiave of chiavi) {
    if (chiave) conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
  }
  return conteggi;
}

function etichettaValore(valore: AxisValue): string {
  return (valore.label || valore.valore || "").trim();
}

/** Scostamento di un valore di linea in percentuale; null se è una cifra fissa. */
function scostamentoValore(valore: AxisValue): number | null {
  if (valore.maggiorazione_tipo === "percentuale") return Number(valore.maggiorazione_valore) || 0;
  if (!valore.maggiorazione_tipo || valore.maggiorazione_tipo === "none") return 0;
  return null;
}

type AsseConValori = FamilyAxis & { values: AxisValue[] };

/**
 * L'asse che fa da linea di prodotto, con i soli valori attivi e senza
 * doppioni di nome. Null se non c'è o se tutte le sue linee sono spente: le
 * linee tolte si disattivano, non si cancellano, perché i preventivi vecchi
 * le nominano.
 */
export function asseLinea(famiglia: FamilyWithAxes): { asse: AsseConValori; valori: AxisValue[] } | null {
  const asse = (famiglia.axes ?? []).find(
    (a) => eAsseLinea(a),
  );
  if (!asse) return null;
  const visti = new Set<string>();
  const valori = (asse.values ?? []).filter((v) => {
    if (v.attivo === false) return false;
    const chiave = chiaveTesto(etichettaValore(v));
    if (chiave === "" || visti.has(chiave)) return false;
    visti.add(chiave);
    return true;
  });
  return valori.length > 0 ? { asse, valori } : null;
}

/** Categoria creata insieme a un articolo: il nome dell'articolo comincia col suo. */
function nataConArticolo(nomeCategoria: string, nomeArticolo: string): boolean {
  const categoria = chiaveTesto(nomeCategoria);
  const articolo = chiaveTesto(nomeArticolo);
  return articolo === categoria || articolo.startsWith(`${categoria}_`);
}

interface LineaInCostruzione {
  chiave: string;
  nome: string;
  fonte: FonteLinea;
  categoriaId: string | null;
  righe: RigaListino[];
  ordine: Ordine;
  scostamenti: Map<string, number>;
}

function costruisciLinee(
  articoli: FamilyWithAxes[],
  macro: MacroListino | null,
  categorie: CategoriaListino[],
  nomeTipologia: string,
): LineaListino[] {
  const linee = new Map<string, LineaInCostruzione>();
  const lineaDi = (chiave: string, crea: () => Omit<LineaInCostruzione, "righe" | "scostamenti">) => {
    let linea = linee.get(chiave);
    if (!linea) {
      linea = { ...crea(), righe: [], scostamenti: new Map() };
      linee.set(chiave, linea);
    }
    return linea;
  };

  // Le categorie di questa macrocategoria che sono davvero linee, anche vuote:
  // una linea appena creata deve vedersi prima di avere prodotti.
  const categorieLinea = new Set<string>();
  if (macro) {
    const perCategoria = new Map<string, FamilyWithAxes[]>();
    for (const a of articoli) {
      if (!a.categoria_id) continue;
      const lista = perCategoria.get(a.categoria_id) ?? [];
      lista.push(a);
      perCategoria.set(a.categoria_id, lista);
    }
    const chiaveMacro = chiaveTesto(macro.nome);
    for (const categoria of categorie) {
      const suoi = perCategoria.get(categoria.id) ?? [];
      const dellaMacro = categoria.macrocategoria_id === macro.id || (!categoria.macrocategoria_id && suoi.length > 0);
      if (!dellaMacro) continue;
      const chiave = chiaveTesto(categoria.nome);
      // «Fotovoltaico» dentro FOTOVOLTAICO non aggiunge niente.
      if (chiave === "" || chiave === chiaveMacro) continue;
      if (suoi.length === 1 && nataConArticolo(categoria.nome, suoi[0].nome)) continue;
      if (suoi.length === 0 && articoli.some((a) => nataConArticolo(categoria.nome, a.nome))) continue;
      categorieLinea.add(categoria.id);
      lineaDi(`cat:${categoria.id}`, () => ({
        chiave: `cat:${categoria.id}`,
        nome: categoria.nome,
        fonte: "categoria",
        categoriaId: categoria.id,
        ordine: [1, Number(categoria.sort_order) || 0, chiave],
      }));
    }
  }

  for (const f of articoli) {
    const assi = asseLinea(f);
    if (assi) {
      for (const valore of assi.valori) {
        const nome = etichettaValore(valore);
        const chiave = `linea:${chiaveTesto(nome)}`;
        const ordineValore = Number(valore.sort_order) || 0;
        const linea = lineaDi(chiave, () => ({
          chiave,
          nome,
          fonte: "asse",
          categoriaId: null,
          ordine: [0, ordineValore, chiaveTesto(nome)],
        }));
        linea.ordine[1] = Math.min(linea.ordine[1], ordineValore);
        const scostamento = scostamentoValore(valore);
        const chiaveScostamento = scostamento === null ? "fisso" : String(scostamento);
        linea.scostamenti.set(chiaveScostamento, (linea.scostamenti.get(chiaveScostamento) ?? 0) + 1);
        linea.righe.push({ chiave: `${f.id}:${valore.id}`, famiglia: f, linea: valore, asseCodice: assi.asse.codice });
      }
      continue;
    }
    const riga: RigaListino = { chiave: f.id, famiglia: f, linea: null, asseCodice: null };
    const lineaCategoria = f.categoria_id && categorieLinea.has(f.categoria_id) ? linee.get(`cat:${f.categoria_id}`) : undefined;
    if (lineaCategoria) {
      lineaCategoria.righe.push(riga);
      continue;
    }
    lineaDi("altri", () => ({ chiave: "altri", nome: "", fonte: "altri", categoriaId: null, ordine: [9, 0, ""] })).righe.push(riga);
  }

  const ordinate = [...linee.values()].sort((a, b) => confronta(a.ordine, b.ordine));
  return ordinate.map((l) => {
    let scostamentoPct: number | null = null;
    if (l.fonte === "asse") {
      const prevalente = piuFrequente(l.scostamenti);
      scostamentoPct = prevalente === null || prevalente === "fisso" ? null : Number(prevalente);
    }
    return {
      chiave: l.chiave,
      nome: l.fonte === "altri" ? (ordinate.length > 1 ? "Altri articoli" : nomeTipologia) : l.nome,
      fonte: l.fonte,
      scostamentoPct,
      base: l.fonte === "asse" && scostamentoPct === 0,
      categoriaId: l.categoriaId,
      righe: l.righe,
    };
  });
}

interface TipologiaInArea {
  area: string;
  ordine: Ordine;
  tipologia: TipologiaListino;
}

/** Ricompone il listino in aree → tipologie → linee → righe. Non filtra: gli articoli spenti restano. */
export function costruisciListino(
  famiglie: FamilyWithAxes[],
  macrocategorie: MacroListino[],
  categorie: CategoriaListino[],
): AreaListino[] {
  const macroPerId = new Map(macrocategorie.map((m) => [m.id, m] as const));
  const categoriaPerId = new Map(categorie.map((c) => [c.id, c] as const));

  // Dove sta ogni articolo: la sua macrocategoria, la categoria se l'azienda
  // non usa macrocategorie, altrimenti «senza tipologia» nell'area del suo verticale.
  const articoliPer = new Map<string, FamilyWithAxes[]>();
  for (const f of famiglie) {
    const categoria = f.categoria_id ? categoriaPerId.get(f.categoria_id) : undefined;
    const macroId = f.macrocategoria_id ?? categoria?.macrocategoria_id ?? null;
    const chiave =
      macroId && macroPerId.has(macroId)
        ? `macro:${macroId}`
        : categoria && !categoria.macrocategoria_id
          ? `cat:${categoria.id}`
          : `senza:${areaDiVerticale(f.vertical) ?? "generale"}`;
    const lista = articoliPer.get(chiave) ?? [];
    lista.push(f);
    articoliPer.set(chiave, lista);
  }

  const areaDegliArticoli = (articoli: FamilyWithAxes[]): string | null =>
    piuFrequente(conta(articoli.map((a) => areaDiVerticale(a.vertical))));

  const tipologie: TipologiaInArea[] = [];

  for (const macro of macrocategorie) {
    const articoli = articoliPer.get(`macro:${macro.id}`) ?? [];
    const etichette = (macro.verticali_abilitati ?? []).filter((v) => chiaveTesto(v) !== "");
    const esplicita =
      etichette.map((v) => areaDiVerticale(v)).find((a): a is string => !!a) ??
      areaDiVerticale(macro.tipologia) ??
      (macro.fv_categoria ? "fotovoltaico" : null);
    // Vuota e senza un'area dichiarata: un resto di prove o di modelli, non si mostra.
    if (articoli.length === 0 && !esplicita) continue;
    const area = esplicita ?? areaDegliArticoli(articoli) ?? "generale";
    const standardArea = areaStandard(area);
    const standard = standardArea ? riconosciTipologiaStandard(standardArea, macro.nome, macro.fv_categoria) : null;
    const accessorio = macro.categoria_tipo === "accessorio" || !!standard?.accessorio;
    const collegamento: CollegamentoTipologia =
      etichette.length === 0 ? "tutte" : etichette.some((v) => areaDiVerticale(v) === area) ? "area" : "nessuno";
    tipologie.push({
      area,
      ordine: [accessorio ? 2 : 0, Number(macro.sort_order) || 0, chiaveTesto(macro.nome)],
      tipologia: {
        chiave: `macro:${macro.id}`,
        nome: macro.nome,
        fonte: "macrocategoria",
        macrocategoriaId: macro.id,
        categoriaId: null,
        immagineUrl: macro.immagine_url ?? null,
        accessorio,
        categoriaTipo: macro.categoria_tipo === "accessorio" ? "accessorio" : "principale",
        collegamento,
        attiva: macro.attivo !== false,
        standard,
        articoli: articoli.length,
        linee: costruisciLinee(articoli, macro, categorie, macro.nome),
      },
    });
  }

  for (const categoria of categorie) {
    const articoli = articoliPer.get(`cat:${categoria.id}`);
    if (!articoli || articoli.length === 0) continue;
    const area = areaDegliArticoli(articoli) ?? "generale";
    const standardArea = areaStandard(area);
    const standard = standardArea ? riconosciTipologiaStandard(standardArea, categoria.nome, null) : null;
    tipologie.push({
      area,
      ordine: [standard?.accessorio ? 2 : 1, Number(categoria.sort_order) || 0, chiaveTesto(categoria.nome)],
      tipologia: {
        chiave: `cat:${categoria.id}`,
        nome: categoria.nome,
        fonte: "categoria",
        macrocategoriaId: null,
        categoriaId: categoria.id,
        immagineUrl: null,
        accessorio: !!standard?.accessorio,
        categoriaTipo: null,
        collegamento: "nessuno",
        attiva: true,
        standard,
        articoli: articoli.length,
        linee: costruisciLinee(articoli, null, categorie, categoria.nome),
      },
    });
  }

  for (const [chiave, articoli] of articoliPer) {
    if (!chiave.startsWith("senza:")) continue;
    tipologie.push({
      area: chiave.slice("senza:".length),
      ordine: [3, 0, ""],
      tipologia: {
        chiave,
        nome: "Senza tipologia",
        fonte: "senza",
        macrocategoriaId: null,
        categoriaId: null,
        immagineUrl: null,
        accessorio: false,
        categoriaTipo: null,
        collegamento: "nessuno",
        attiva: true,
        standard: null,
        articoli: articoli.length,
        linee: costruisciLinee(articoli, null, categorie, "Senza tipologia"),
      },
    });
  }

  const perArea = new Map<string, TipologiaInArea[]>();
  for (const t of tipologie) {
    const lista = perArea.get(t.area) ?? [];
    lista.push(t);
    perArea.set(t.area, lista);
  }

  const aree: AreaListino[] = [];
  for (const [chiave, lista] of perArea) {
    const standard = areaStandard(chiave);
    const ordinate = [...lista].sort((a, b) => confronta(a.ordine, b.ordine)).map((t) => t.tipologia);
    const presenti = new Set(ordinate.flatMap((t) => (t.standard ? [t.standard.nome] : [])));
    aree.push({
      chiave,
      nome: nomeArea(chiave),
      standard,
      articoli: ordinate.reduce((n, t) => n + t.articoli, 0),
      tipologie: ordinate,
      mancanti: standard ? standard.tipologie.filter((t) => !presenti.has(t.nome)) : [],
    });
  }

  return aree.sort(
    (a, b) =>
      Number(a.chiave === "generale") - Number(b.chiave === "generale") ||
      b.articoli - a.articoli ||
      a.nome.localeCompare(b.nome, "it"),
  );
}

/** Tiene solo le righe che passano il filtro; linee, tipologie e aree rimaste vuote spariscono. */
export function filtraListino(aree: AreaListino[], tieni: (riga: RigaListino) => boolean): AreaListino[] {
  const risultato: AreaListino[] = [];
  for (const area of aree) {
    const tipologie: TipologiaListino[] = [];
    for (const tipologia of area.tipologie) {
      const famiglie = new Set<string>();
      const linee: LineaListino[] = [];
      for (const linea of tipologia.linee) {
        const righe = linea.righe.filter((r) => tieni(r));
        if (righe.length === 0) continue;
        for (const r of righe) famiglie.add(r.famiglia.id);
        linee.push(righe.length === linea.righe.length ? linea : { ...linea, righe });
      }
      if (linee.length > 0) tipologie.push({ ...tipologia, linee, articoli: famiglie.size });
    }
    if (tipologie.length > 0) {
      risultato.push({ ...area, tipologie, articoli: tipologie.reduce((n, t) => n + t.articoli, 0) });
    }
  }
  return risultato;
}

/** La linea di riferimento di una tipologia con più linee da asse (quella a scostamento zero). */
export function lineaDiRiferimento(tipologia: TipologiaListino): LineaListino | null {
  const daAsse = tipologia.linee.filter((l) => l.fonte === "asse");
  if (daAsse.length < 2) return null;
  return daAsse.find((l) => l.base) ?? null;
}

/**
 * Prezzo di un'unità della riga nella sua linea, con lo stesso motore del
 * preventivatore: al metro quadro per chi si vende a mq, al pezzo per gli
 * altri. Le altre variabili (colore, vetro) restano quelle base.
 */
export function economiaRiga(riga: RigaListino): EconomiaRiga {
  const f = riga.famiglia;
  const unita = f.modalita_prezzo_base === "mq" ? "mq" : f.unit_of_measure || "pz";
  if (f.modalita_prezzo_base === "griglia") {
    return { vendita: null, acquisto: null, marginePct: null, unita, griglia: true };
  }
  const prezzo = calcolaPrezzoFamiglia({
    family: f,
    selections: riga.linea && riga.asseCodice ? { [riga.asseCodice]: riga.linea.id } : {},
    quantita: 1,
    ...(f.modalita_prezzo_base === "mq" ? { larghezza_mm: 1000, altezza_mm: 1000 } : {}),
  });
  const vendita = Number(prezzo.unit_price_vendita) || 0;
  const acquisto = Number(prezzo.unit_price_acquisto) > 0 ? Number(prezzo.unit_price_acquisto) : null;
  const marginePct = acquisto != null && vendita > 0 ? ((vendita - acquisto) / vendita) * 100 : null;
  return { vendita, acquisto, marginePct, unita, griglia: false };
}

export interface SelezioneListino {
  area?: string | null;
  tipologia?: string | null;
  linea?: string | null;
}

/**
 * Cosa mostrare: la selezione richiesta se esiste ancora, altrimenti la prima
 * area, la prima tipologia con prodotti e la sua prima linea. Serve quando un
 * filtro svuota la tipologia scelta o l'indirizzo punta a una linea che non
 * c'è più.
 */
export function risolviSelezione(
  aree: AreaListino[],
  richiesta: SelezioneListino,
): { area: AreaListino | null; tipologia: TipologiaListino | null; linea: LineaListino | null } {
  const area = aree.find((a) => a.chiave === richiesta.area) ?? aree[0] ?? null;
  const tipologia = area
    ? area.tipologie.find((t) => t.chiave === richiesta.tipologia) ??
      area.tipologie.find((t) => t.articoli > 0) ??
      area.tipologie[0] ??
      null
    : null;
  const linea = tipologia ? tipologia.linee.find((l) => l.chiave === richiesta.linea) ?? tipologia.linee[0] ?? null : null;
  return { area, tipologia, linea };
}
