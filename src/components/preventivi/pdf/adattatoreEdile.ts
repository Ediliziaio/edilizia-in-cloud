/**
 * Dal modulo al documento condiviso.
 *
 * Gli otto moduli hanno progetti, modelli e computi con la stessa forma, salvo
 * tre differenze vere: i nomi dei campi di copertina (`pdf_cover_*` per sei
 * moduli, `cover_*` per i tetti, misti per le piscine), la scala dell'opacità
 * (0–100 oppure 0–1) e qualche dato d'intervento in più (falde, punti luce,
 * tipo di piscina). Qui si leggono tutte le varianti, così il documento non
 * deve sapere da quale modulo arrivano i dati.
 */
import { applicaMergeTagModulo } from "@/lib/mergeTagsModuli";
import { renderTemplateText, buildStandardReplacements } from "@/lib/pdf/renderTemplateText";
import { coloreDelDocumento as coloreDocumento } from "../../../../supabase/functions/_shared/temaColori";
import { condizioniStandard, type SettoreCondizioni } from "@/lib/condizioniStandard";
import { tipografiaDaModello } from "./temaDocumento";
import { leggiOrdine, leggiPagineLibere } from "./ordineCapitoli";
import { testiPerPdf } from "../../../../supabase/functions/_shared/testoPerPdf";
import type {
  DocEdileCapitolo, DocEdileDati, DocEdileFoto, DocEdileModello, DocEdileModulo,
  DocEdileOpzioniComputo, DocEdileTotali, DocEdileVoceElenco, DocEdileFaq, DocEdileFase,
  DocEdileTestimonianza,
} from "./documentoEdileTipi";

type Grezzo = Record<string, unknown>;

const stringa = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const unoDi = <T extends string>(v: unknown, ammessi: readonly T[], ripiego: T): T =>
  typeof v === "string" && (ammessi as readonly string[]).includes(v) ? (v as T) : ripiego;
const elenco = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Legge `pdf_cover_<chiave>` e, se manca, `cover_<chiave>` (tetti, campi storici). */
function cover(t: Grezzo, chiave: string): unknown {
  const nuovo = t[`pdf_cover_${chiave}`];
  return nuovo !== undefined && nuovo !== null && nuovo !== "" ? nuovo : t[`cover_${chiave}`];
}

export interface ProgettoComune {
  code: string | null;
  tipo_intervento: string | null;
  cliente_nome: string | null;
  cliente_cognome: string | null;
  cantiere_indirizzo: string | null;
  cantiere_citta: string | null;
  cantiere_provincia: string | null;
  cantiere_cap: string | null;
  immobile_tipo: string | null;
  immobile_superficie_mq: number | null;
  immobile_anno: number | null;
  immobile_piani: number | null;
  mostra_finanziamento?: boolean | null;
  created_at?: string | null;
}

export interface VoceComune {
  id: string;
  descrizione: string | null;
  unita_misura: string | null;
  quantita: number;
  prezzo_unitario: number;
  importo: number;
  costo_materiali?: number | null;
  costo_manodopera?: number | null;
  fonte?: string | null;
}

export interface AziendaComune {
  name?: string | null;
  ragione_sociale?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  email?: string | null;
  partita_iva?: string | null;
  website?: string | null;
  logo_url?: string | null;
  /** Kit del marchio dell'azienda (Brand & Azienda). */
  colore_marca?: string | null;
  logo_chiaro_url?: string | null;
}

/** Il colore con cui nascono i modelli degli otto moduli: non è una scelta dell'azienda. */
export const COLORE_DI_FABBRICA_MODELLO = "#1E3A5F";

/**
 * Il colore del documento: quello scelto nel modello e, se il modello è rimasto
 * al colore di fabbrica, quello del kit del marchio. La regola è una per tutti i
 * documenti (PDF edili, Serramenti, Fotovoltaico) e sta in `temaColori`.
 */
export function coloreDelDocumento(delModello: string | null, delMarchio: string | null): string | null {
  return coloreDocumento(delModello, delMarchio, COLORE_DI_FABBRICA_MODELLO);
}

export function leggiModello(
  t: Grezzo,
  contesto: {
    progetto: ProgettoComune;
    azienda: AziendaComune | null;
    sostituzioniExtra?: Record<string, string>;
    /** Il settore decide il testo di base delle condizioni, quando l'azienda non ne ha scritte. */
    settore?: SettoreCondizioni;
    /** Il totale del preventivo, per {{preventivo.totale}} dentro le condizioni. */
    totale?: number | null;
  },
): DocEdileModello {
  const { progetto: p, azienda } = contesto;
  // I segnaposto inseriti dall'editor ({cliente_nome}, {citta}…) vanno espansi:
  // senza, uscivano LETTERALI nel PDF del cliente.
  const sostituzioni = buildStandardReplacements(p, contesto.sostituzioniExtra ?? {});
  const espandi = (v: unknown): string | null => {
    const s = stringa(v);
    return s ? (renderTemplateText(s, sostituzioni) || null) : null;
  };

  const opacita = (() => {
    const v = numero(cover(t, "overlay_opacity"));
    if (v == null) return null;
    return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
  })();

  const condizioniAttive = t.condizioni_legali_attivo !== false;
  // Un preventivo firmato è il contratto: se l'azienda non ha scritto le proprie
  // condizioni, il documento esce con quelle di base del suo settore invece che
  // senza niente. L'editor le mostra e le fa adattare; l'interruttore le toglie.
  const testoCondizioni = String(t.condizioni_legali_testo ?? "").trim()
    || condizioniStandard(contesto.settore ?? "generico");
  const condizioniLegali = !condizioniAttive
    ? []
    : applicaMergeTagModulo(testoCondizioni, {
        companyName: azienda?.ragione_sociale ?? azienda?.name ?? null,
        companyVat: azienda?.partita_iva ?? null,
        clienteNome: p.cliente_nome,
        clienteCognome: p.cliente_cognome,
        cantiereIndirizzo: [p.cantiere_indirizzo, p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(", ") || null,
        cantiereCitta: p.cantiere_citta ?? null,
        numero: p.code,
        dataDocumento: p.created_at ?? null,
        pianoPagamenti: stringa(t.payment_terms_text),
        // Senza questi, {{preventivo.totale}} e {{azienda.email}} uscivano vuoti
        // proprio dentro le condizioni, dove contano.
        totale: contesto.totale ?? null,
        companyEmail: stringa(t.email) || azienda?.email || null,
        companyPhone: stringa(t.telefono) || azienda?.telefono || null,
        companyAddress: stringa(t.indirizzo_completo) || azienda?.indirizzo || null,
      })
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((riga) => riga.trim())
        .filter(Boolean)
        .map((riga) => {
          const h = /^(#{1,3})\s+(.+)$/.exec(riga);
          if (h) return { tipo: h[1].length === 1 ? ("h1" as const) : ("h2" as const), testo: h[2] };
          const li = /^[-*]\s+(.+)$/.exec(riga);
          if (li) return { tipo: "li" as const, testo: li[1] };
          return { tipo: "p" as const, testo: riga };
        });

  return {
    tipografia: tipografiaDaModello(t.font_family),
    colorePrimario: coloreDelDocumento(stringa(t.color_primary), azienda?.colore_marca ?? null),
    coloreSecondario: stringa(t.color_secondary),
    coloreAccento: stringa(t.color_accent),
    copertina: {
      occhiello: espandi(cover(t, "eyebrow")),
      // Dove esiste, il campo nuovo (`pdf_cover_hero`) vince su quello storico: come nei PDF di prima.
      titolo: espandi(stringa(t.pdf_cover_hero) ?? t.cover_title),
      sottotitolo: espandi(stringa(t.pdf_cover_subhero_template) ?? stringa(t.pdf_cover_subhero) ?? t.cover_subtitle),
      immagineUrl: stringa(cover(t, "image_url")),
      logoUrl: stringa(cover(t, "logo_url")),
      coloreFondo: stringa(cover(t, "bg_color")),
      coloreTesto: stringa(cover(t, "text_color")),
      opacitaVelo: opacita,
      stileVelo: unoDi(cover(t, "overlay_style"), ["flat", "gradient", "gradient_diag", "vignette"] as const, "gradient"),
      allineamento: unoDi(cover(t, "text_align"), ["left", "center"] as const, "left"),
      verticale: unoDi(cover(t, "text_vertical"), ["top", "center", "bottom"] as const, "bottom"),
      posizioneLogo: unoDi(cover(t, "logo_position"), ["top_left", "top_center", "top_right", "hidden"] as const, "top_left"),
      scalaLogo: (() => {
        const v = numero(cover(t, "logo_size"));
        return v != null ? Math.max(60, Math.min(160, v)) / 100 : 1;
      })(),
      decorazione: unoDi(cover(t, "decoration_style"), ["square", "circle", "line", "pattern", "none"] as const, "square"),
      mostraDecorazione: cover(t, "show_decoration") !== false,
      mostraScheda: cover(t, "show_client_card") !== false,
      corpoOcchiello: numero(cover(t, "eyebrow_size")),
      // Il campo storico `cover_title_size` nasce a 30 per chiunque (non è una scelta):
      // 30 tondo dal campo storico vale «non impostato», e il titolo prende il corpo del documento.
      corpoTitolo: numero(t.pdf_cover_title_size) ?? (numero(t.cover_title_size) === 30 ? null : numero(t.cover_title_size)),
      corpoSottotitolo: numero(cover(t, "subtitle_size")),
    },
    chiSiamoHtml: stringa(t.chi_siamo),
    chiSiamoFotoUrl: stringa(t.chi_siamo_foto_url),
    mostraChiSiamo: t.show_chi_siamo !== false,
    esigenze: elenco<DocEdileVoceElenco>(t.esigenze).filter((x) => stringa(x?.titolo)),
    soluzione: elenco<DocEdileVoceElenco>(t.soluzione).filter((x) => stringa(x?.titolo)),
    usp: elenco<DocEdileVoceElenco>(t.usp).filter((x) => stringa(x?.titolo)),
    percorso: elenco<DocEdileVoceElenco>(t.percorso).filter((x) => stringa(x?.titolo)),
    mostraPercorso: t.show_percorso !== false,
    garanzie: elenco<DocEdileVoceElenco>(t.garanzie).filter((x) => stringa(x?.titolo)),
    faq: elenco<DocEdileFaq>(t.faq).filter((x) => stringa(x?.domanda)),
    mostraGaranzie: t.show_garanzie !== false,
    testimonianze: elenco<DocEdileTestimonianza>(t.testimonianze).filter((x) => stringa(x?.testo)),
    cronoprogramma: elenco<DocEdileFase>(t.cronoprogramma).filter((x) => stringa(x?.fase)),
    mostraCronoprogramma: t.show_cronoprogramma !== false,
    galleriaLavori: elenco<DocEdileFoto>(t.gallery_lavori).filter((x) => stringa(x?.url)),
    pagamentoHtml: stringa(t.payment_terms_text),
    testoValidita: stringa(t.validity_text),
    giorniValidita: numero(t.default_validita_giorni),
    testoPiePagina: stringa(t.footer_text),
    mostraPieVersione: t.show_footer_version !== false,
    mostraPieLegale: t.show_footer_legal === true,
    mostraMargine: t.show_margine === true,
    finanziamentoPromo: t.finanziamento_promo ?? null,
    condizioniLegali,
    ordineCapitoli: leggiOrdine(t.pdf_ordine_capitoli),
    pagineLibere: leggiPagineLibere(t.pdf_pagine_libere).map((p) => ({
      ...p,
      titolo: espandi(p.titolo) ?? p.titolo,
      occhiello: p.occhiello ? espandi(p.occhiello) : null,
    })),
    clausoleDaApprovare: clausoleDaApprovare(condizioniLegali),
    // Il modulo di recesso lo accende l'azienda nel modello (spento di serie dal
    // 21/09/2026): serve a chi firma con un privato a casa sua o a distanza.
    conRecesso: t.modulo_recesso_attivo === true,
  };
}

/**
 * Le clausole che il Committente approva con una seconda firma: sono le voci
 * elencate sotto il titolo «Clausole da approvare specificamente» (art. 1341
 * c.c.). Si leggono dal testo, così valgono anche per le condizioni scritte
 * dall'azienda — se quel titolo non c'è, la seconda firma non si stampa.
 */
function clausoleDaApprovare(righe: DocEdileModello["condizioniLegali"]): string[] {
  const inizio = righe.findIndex(
    (r) => (r.tipo === "h1" || r.tipo === "h2") && /1341|approvare specificamente/i.test(r.testo),
  );
  if (inizio < 0) return [];
  const voci: string[] = [];
  for (const r of righe.slice(inizio + 1)) {
    if (r.tipo === "h1" || r.tipo === "h2") break;
    if (r.tipo === "li") voci.push(r.testo);
  }
  return voci;
}

const intero = (n: number | null | undefined): string | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;

/** I fatti dell'immobile comuni a tutti i moduli; ogni modulo aggiunge i suoi. */
export function schedaComune(p: ProgettoComune): Array<{ etichetta: string; valore: string }> {
  const righe: Array<{ etichetta: string; valore: string | null }> = [
    { etichetta: "Intervento", valore: stringa(p.tipo_intervento) },
    { etichetta: "Immobile", valore: stringa(p.immobile_tipo) },
    { etichetta: "Superficie", valore: intero(p.immobile_superficie_mq) ? `${intero(p.immobile_superficie_mq)} mq` : null },
    { etichetta: "Anno di costruzione", valore: intero(p.immobile_anno) },
    { etichetta: "Piani", valore: intero(p.immobile_piani) },
  ];
  return righe.filter((r): r is { etichetta: string; valore: string } => Boolean(r.valore));
}

export function costruisciDatiEdile(input: {
  modulo: DocEdileModulo;
  progetto: ProgettoComune;
  template: Grezzo;
  azienda: AziendaComune | null;
  capitoli: Array<{ nome: string; voci: VoceComune[]; subtotale: number }>;
  totali: DocEdileTotali;
  media: Array<{ id: string; url: string; caption?: string | null }>;
  opzioniComputo?: Partial<DocEdileOpzioniComputo> | null;
  /** Fatti in più del modulo («Falde» → «2», «Tipo di piscina» → «Interrata»). */
  schedaModulo?: Array<{ etichetta: string; valore: string | null | undefined }>;
  /** Segnaposto in più del modulo per i testi di copertina ({superficie_mq}, {tipo_piscina}…). */
  sostituzioniExtra?: Record<string, string>;
}): DocEdileDati {
  const { modulo, progetto: p, template: t, azienda } = input;
  const modello = leggiModello(t, {
    progetto: p, azienda, sostituzioniExtra: input.sostituzioniExtra,
    settore: modulo.chiave as SettoreCondizioni, totale: input.totali?.totale ?? null,
  });

  const nomeAzienda = stringa(t.ragione_sociale) || azienda?.ragione_sociale || azienda?.name || "La tua azienda";
  const capitoli: DocEdileCapitolo[] = input.capitoli.map((c) => ({
    nome: c.nome,
    subtotale: Number(c.subtotale) || 0,
    voci: c.voci.map((v) => {
      const importo = Number(v.importo) || 0;
      const costo = ((Number(v.costo_materiali) || 0) + (Number(v.costo_manodopera) || 0)) * (Number(v.quantita) || 0);
      return {
        id: v.id,
        descrizione: v.descrizione || "—",
        unitaMisura: v.unita_misura,
        quantita: Number(v.quantita) || 0,
        prezzoUnitario: Number(v.prezzo_unitario) || 0,
        importo,
        fonte: v.fonte ?? null,
        margineEur: importo - costo,
      };
    }),
  }));

  const fotoProgetto: DocEdileFoto[] = input.media
    .filter((m) => Boolean(m.url))
    .map((m) => ({ id: m.id, url: m.url, didascalia: m.caption ?? null }));

  const schedaModulo = (input.schedaModulo ?? [])
    .filter((r): r is { etichetta: string; valore: string } => Boolean(stringa(r.valore)));

  const oc = input.opzioniComputo ?? {};
  // Tutti i testi passano dal filtro dei caratteri stampabili: Helvetica conosce
  // solo l'alfabeto WinAnsi, e una freccia o un'emoji incollate dall'azienda
  // uscivano come caratteri a caso (e in copertina si mangiavano il resto del titolo).
  return testiPerPdf({
    modulo,
    codice: p.code,
    cliente: [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim() || "Gentile Cliente",
    clienteNome: stringa(p.cliente_nome),
    cantiere: [p.cantiere_indirizzo, [p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(" "), p.cantiere_provincia]
      .filter(Boolean).join(", ").trim(),
    localita: stringa(p.cantiere_citta),
    tipoIntervento: stringa(p.tipo_intervento),
    scheda: [...schedaComune(p), ...schedaModulo],
    azienda: {
      nome: nomeAzienda,
      indirizzo: stringa(t.indirizzo_completo) || azienda?.indirizzo || null,
      telefono: stringa(t.telefono) || azienda?.telefono || null,
      email: stringa(t.email) || azienda?.email || null,
      partitaIva: stringa(t.partita_iva) || azienda?.partita_iva || null,
      sito: azienda?.website ?? null,
      logoUrl: stringa(t.logo_url) || azienda?.logo_url || null,
      logoChiaroUrl: azienda?.logo_chiaro_url ?? null,
    },
    modello,
    capitoli,
    totali: input.totali,
    fotoProgetto,
    opzioniComputo: {
      livello: oc.livello ?? "dettagliato",
      mostraPrezzi: oc.mostraPrezzi !== false,
      mostraQta: oc.mostraQta !== false,
      mostraSubtotali: oc.mostraSubtotali !== false,
    },
    mostraFinanziamento: p.mostra_finanziamento !== false,
  });
}
