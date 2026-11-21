import type { BaseArticleTemplateSeed } from "@/data/baseArticleTemplates";
import type { WndTemplateSeed } from "@/data/wndArticleTemplates";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { areaStandard, type SlotFotovoltaico } from "./areeStandard";
import { etichettaSlug, type ProdottoLibreria } from "./prodottiLibreria";

type VoceCatalogo = BaseArticleTemplateSeed | WndTemplateSeed;

export type CatalogoPronto = {
  id: string;
  nome: string;
  settore: string;
  descrizione: string;
  fonte: "base" | "fornitore";
  prezziIndicativi?: boolean;
  carica: () => Promise<VoceCatalogo[]>;
};

export const CATALOGHI_PRONTI: CatalogoPronto[] = [
  { id: "base-edilizia", nome: "Edilizia e cartongesso", settore: "ristrutturazione", descrizione: "Lastre, profili, malte, leganti, laterizi e isolanti.", fonte: "base", carica: async () => (await import("@/data/altriCataloghiBase")).CATALOGO_EDILIZIA },
  { id: "base-piastrelle", nome: "Pavimenti e rivestimenti", settore: "pavimenti", descrizione: "Gres, rivestimenti, mosaici, klinker e battiscopa.", fonte: "base", prezziIndicativi: true, carica: async () => (await import("@/data/baseArticleTemplates")).BASE_PIASTRELLE_TEMPLATES },
  { id: "base-porte", nome: "Porte e portoncini", settore: "porte", descrizione: "Porte interne, scorrevoli, in vetro, tagliafuoco e blindate.", fonte: "base", prezziIndicativi: true, carica: async () => (await import("@/data/baseArticleTemplates")).BASE_PORTE_TEMPLATES },
  { id: "base-bagno", nome: "Bagno e sanitari", settore: "bagno", descrizione: "Sanitari, docce, rubinetteria, mobili e scaldasalviette.", fonte: "base", prezziIndicativi: true, carica: async () => (await import("@/data/baseArticleTemplates")).BASE_BAGNO_TEMPLATES },
  { id: "base-elettrico", nome: "Elettrico e domotica", settore: "elettrico", descrizione: "Punti, placche, quadri, LED, cavi e tubi.", fonte: "base", prezziIndicativi: true, carica: async () => (await import("@/data/baseArticleTemplates")).BASE_ELETTRICO_TEMPLATES },
  { id: "base-termoidraulica", nome: "Termoidraulica e climatizzazione", settore: "termoidraulico", descrizione: "Tubi, raccordi, valvole, ricambi, pompe di calore e climatizzatori.", fonte: "base", carica: async () => (await import("@/data/altriCataloghiBase")).CATALOGO_TERMOIDRAULICA },
  { id: "base-fotovoltaico", nome: "Fotovoltaico", settore: "fotovoltaico", descrizione: "Moduli, inverter, accumuli, ottimizzatori, strutture e cavi.", fonte: "base", carica: async () => (await import("@/data/altriCataloghiBase")).CATALOGO_FOTOVOLTAICO },
  { id: "base-tetti", nome: "Tetti e lattoneria", settore: "tetti", descrizione: "Tegole, colmi, membrane, gronde, pluviali e finestre da tetto.", fonte: "base", carica: async () => (await import("@/data/altriCataloghiBase")).CATALOGO_TETTI },
  { id: "base-isolamento", nome: "Facciate e isolamento", settore: "cappotto", descrizione: "Isolanti, collanti, rasanti, reti, tasselli e profili.", fonte: "base", carica: async () => (await import("@/data/altriCataloghiBase")).CATALOGO_ISOLAMENTO },
  { id: "wnd", nome: "WnD · Serramenti", settore: "serramenti", descrizione: "Listino fornitore con griglie per misura estratte dai suoi PDF.", fonte: "fornitore", carica: async () => (await import("@/data/wndArticleTemplates")).WND_ARTICLE_TEMPLATES },
];

const normalizza = (testo: string | null) => (testo ?? "").trim().normalize("NFC").toLocaleLowerCase("it");

async function idStabile(chiave: string[]) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(chiave)))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export async function caricaCatalogo(catalogo: CatalogoPronto) {
  const voci = await catalogo.carica();
  return Promise.all(voci.map(async (voce) => {
    // I codici WnD possono essere condivisi da più finiture con griglie diverse.
    const codice = catalogo.fonte === "base" && voce.tipologia
      ? [voce.tipologia]
      : [voce.tipologia, voce.nome];
    const id = await idStabile(["edilizia-in-cloud/cataloghi-pronti", catalogo.id, ...codice.map(normalizza)]);
    return { ...voce, id, sort_order: "sort_order" in voce ? voce.sort_order : 0 };
  }));
}

export type VocePronta = Awaited<ReturnType<typeof caricaCatalogo>>[number];

export function giaInLibreria(catalogo: CatalogoPronto, voce: VocePronta, presenti: ProdottoLibreria[]) {
  const tagFonte = catalogo.fonte === "base" ? "base" : "wnd";
  return presenti.some((riga) => riga.id === voce.id || (
    riga.tags?.some((tag) => normalizza(tag) === tagFonte) &&
    normalizza(riga.vertical_slug) === normalizza(voce.vertical_slug) &&
    normalizza(riga.categoria_slug) === normalizza(voce.categoria_slug) &&
    normalizza(riga.tipologia) === normalizza(voce.tipologia) &&
    ((catalogo.fonte === "base" && !!voce.tipologia) || normalizza(riga.nome) === normalizza(voce.nome))
  ));
}

export function preparaVoce(voce: VocePronta, visibile: boolean, conPrezzi: boolean) {
  return {
    ...voce,
    is_active: visibile,
    prezzo_base_vendita: conPrezzi ? voce.prezzo_base_vendita : null,
    griglia_default: conPrezzi ? voce.griglia_default : null,
    assi_default: voce.assi_default.map((asse) => ({
      ...asse,
      values: asse.values.map((valore) => conPrezzi
        ? valore
        : { ...valore, maggiorazione_tipo: "none", maggiorazione_valore: 0 }),
    })),
  };
}

const FV_CATEGORIE: Partial<Record<string, SlotFotovoltaico>> = {
  moduli: "pannello", inverter: "inverter", accumulo: "accumulo", ottimizzatori: "ottimizzatore", strutture: "struttura",
};

const TIPI_CATALOGO: Record<string, string> = {
  cartongesso: "Sistemi a secco",
  murature: "Murature e divisori",
  "malte-e-leganti": "Leganti e sottofondi",
  "tubi-e-raccordi": "Reti idrico-sanitarie",
  piastrelle: "Ceramica e gres",
  coperture: "Manti di copertura",
  membrane: "Membrane e teli",
  moduli: "Moduli fotovoltaici",
  accumulo: "Accumuli",
  strutture: "Strutture di montaggio",
};

/** Crea lo stesso snapshot letto dalla RPC di installazione dei modelli di area. */
export async function preparaModelloArea(
  catalogo: CatalogoPronto, voci: VocePronta[], pubblicato: boolean, conPrezzi: boolean,
): Promise<TablesInsert<"listino_modelli_area">> {
  if (catalogo.fonte !== "base" || !voci.length) throw new Error("Scegli almeno una voce di un catalogo base");
  const area = catalogo.settore === "bagno" ? "bagni" : catalogo.settore;
  const verticale = areaStandard(area)?.verticale ?? catalogo.settore;
  const perCategoria = new Map<string, ReturnType<typeof preparaVoce>[]>();
  for (const voce of voci) {
    const riga = preparaVoce(voce, pubblicato, conPrezzi);
    const categoria = voce.categoria_slug || catalogo.settore;
    const gruppo = perCategoria.get(categoria) ?? [];
    gruppo.push(riga);
    perCategoria.set(categoria, gruppo);
  }

  const tipologie = [...perCategoria.entries()].map(([categoria, righe], index) => ({
    chiave: categoria,
    nome: TIPI_CATALOGO[categoria] ?? etichettaSlug(categoria),
    verticali_abilitati: [verticale],
    sort_order: index * 10,
    fv_categoria: area === "fotovoltaico" ? FV_CATEGORIE[categoria] ?? null : null,
    prodotti: righe.map<Json>((riga) => ({
      chiave: riga.id,
      vertical: verticale,
      nome: riga.nome,
      codice: riga.tipologia,
      descrizione: riga.descrizione,
      immagine_url: riga.image_url,
      pdf_scheda_url: null,
      documenti: [],
      modalita_prezzo_base: riga.modalita_prezzo_base,
      prezzo_base_vendita: riga.prezzo_base_vendita,
      vat_rate: riga.vat_rate,
      unit_of_measure: riga.unit_of_measure,
      sort_order: riga.sort_order ?? 0,
      assi: riga.assi_default.map(({ values, ...asse }) => ({
        ...asse,
        valori: values.map((valore) => ({ ...valore, chiave: `${asse.codice}:${valore.valore}` })),
      })),
    })),
  }));

  return {
    id: await idStabile(["edilizia-in-cloud/modelli-di-area", catalogo.id]),
    nome: catalogo.nome,
    descrizione: catalogo.descrizione,
    area,
    origine_nome: "Cataloghi base",
    pubblicato,
    con_prezzi_vendita: conPrezzi,
    contenuto: { versione: 1, tipologie },
    riepilogo: {
      tipologie: tipologie.length,
      prodotti: voci.length,
      varianti: voci.reduce((totale, voce) => totale + voce.assi_default.reduce((n, asse) => n + asse.values.length, 0), 0),
      con_foto: voci.filter((voce) => voce.image_url).length,
      fotovoltaico: tipologie.some((tipologia) => tipologia.fv_categoria),
      nomi_tipologie: tipologie.map((tipologia) => tipologia.nome),
      copertina: voci.find((voce) => voce.image_url)?.image_url ?? null,
    },
  };
}
