import type { ClmTemplatePdf, ClmProgetto, ClmComputoVoce, ClmProgettoMedia } from "@/types/climatizzazione";
import type { CoverPresetPatch as ClmCoverFields } from "@/components/climatizzazione/coverPresets";
import { CAPITOLI_EDILI } from "@/components/preventivi/pdf/ordineCapitoli";
import { calcTotaliComputo } from "@/lib/climatizzazione/calcoli";
import { CLM_EDITORIAL, type ClmEditorialPair } from "./clmEditorialContent";
export { CLM_EDITORIAL } from "./clmEditorialContent";

export const FULL_CLM_MODULES = ["monosplit", "multisplit", "canalizzato", "sostituzione", "manutenzione", "vmc"] as const;
export type FullClmModuleId = typeof FULL_CLM_MODULES[number];
export const isFullClmModuleId = (id: string): id is FullClmModuleId => FULL_CLM_MODULES.some(v => v === id);
export const CLM_MODULE_TITLES = Object.fromEntries(FULL_CLM_MODULES.map(id => [id, CLM_EDITORIAL[id].title])) as Record<FullClmModuleId, string>;
/** Route/catalog consumers can use these without duplicating module metadata. */
export const CLM_MODULE_COVERS = Object.fromEntries(FULL_CLM_MODULES.map(id => [id, CLM_EDITORIAL[id].cover])) as Record<FullClmModuleId, string>;

export function createFullClmTemplate(base: ClmTemplatePdf, id: FullClmModuleId): ClmTemplatePdf {
  const c = CLM_EDITORIAL[id];
  const airDistribution = id === "canalizzato" || id === "vmc";
  const protectionPhoto = "/pdf-stock/comune/protezione-ambienti.jpg";
  const documentPhoto = "/pdf-stock/comune/consegna-documenti.jpg";
  const checksPhoto = airDistribution
    ? `/module-art/climatizzazione-${id}-editorial.jpg`
    : id === "manutenzione" ? "/pdf-stock/climatizzazione/unita-esterna.jpg" : "/pdf-stock/climatizzazione/controllo-collaudo.jpg";
  const processPhoto = airDistribution
    ? "/pdf-stock/comune/domande.jpg"
    : id === "manutenzione" ? "/pdf-stock/climatizzazione/controllo-collaudo.jpg" : "/pdf-stock/climatizzazione/installazione.jpg";
  // The production renderer suppresses a closing photo already used in a block.
  const closingPhoto = airDistribution ? "/pdf-stock/comune/giro-consegna.jpg" : "/pdf-stock/climatizzazione/estate.jpg";
  const items = (pairs: readonly ClmEditorialPair[]) => pairs.map(([titolo, descrizione]) => ({ titolo, descrizione }));
  const block = (titolo: string, intro: string, pairs: readonly ClmEditorialPair[], photo?: string, excluded: readonly ClmEditorialPair[] = []) => ({
    occhiello: CLM_MODULE_TITLES[id], titolo, intro, voci: pairs.map(([titolo, testo]) => ({ titolo, testo, icona: "verifica" })),
    escluse: excluded.map(([titolo, testo]) => ({ titolo, testo })), foto: photo ? [photo] : [], senzaFoto: !photo,
    nota: photo ? "Immagine illustrativa: non è un'installazione aziendale né uno schema esecutivo. Modello e dotazioni sono quelli dell'offerta." : null,
  });
  const result: ClmTemplatePdf & ClmCoverFields & { pdf_cover_hero: string | null; pdf_cover_subhero: string | null; pdf_cover_subhero_template: string | null; pdf_cover_eyebrow: string; pdf_blocchi: Record<string, unknown> } = {
    ...structuredClone(base), id: `local-climatizzazione-${id}`,
    cover_title: c.hero, cover_subtitle: c.subtitle, cover_image_url: c.cover,
    pdf_cover_hero: null, pdf_cover_subhero: null, pdf_cover_subhero_template: null, pdf_cover_image_url: c.cover,
    pdf_cover_eyebrow: CLM_MODULE_TITLES[id].toUpperCase(), pdf_cover_bg_color: "#263e3d", pdf_cover_text_color: "#ffffff",
    pdf_cover_overlay_opacity: id === "vmc" ? 45 : 70, pdf_cover_overlay_style: "gradient", pdf_cover_text_vertical: "bottom", pdf_cover_text_align: "left",
    pdf_cover_title_size: 35, pdf_cover_subtitle_size: 13, pdf_cover_eyebrow_size: 10, pdf_cover_decoration_style: "none", pdf_cover_logo_position: "top_left", pdf_cover_show_decoration: false, pdf_cover_show_client_card: true,
    color_primary: base.color_primary || "#264d4a", color_accent: base.color_accent || "#a77943",
    condizioni_legali_attivo: false, condizioni_legali_testo: null, modulo_recesso_attivo: false,
    default_iva_pct: 22, default_detrazione_pct: 0, default_validita_giorni: 30,
    show_chi_siamo: !!base.chi_siamo?.trim(), show_margine: false, show_garanzie: true, show_percorso: true, show_cronoprogramma: true,
    esigenze: items(c.specs.slice(0, 3)), soluzione: items(c.specs.slice(1)), usp: items([["Scelte documentate", c.specs[1][1]], ["Perimetro chiaro", c.scope], ["Consegna accompagnata", c.stages[3][1]]]),
    percorso: items(c.stages), cronoprogramma: c.stages.map(([fase, descrizione]) => ({ fase, descrizione, durata: "Da concordare" })),
    garanzie: items(id === "manutenzione"
      ? [["Unità identificate", c.specs[0][1]], ["Operazioni definite", c.specs[1][1]], ["Riscontri documentati", c.checks[3][1]], ["Attività successive concordate", "Riparazioni, ricambi e appuntamenti periodici richiedono un accordo specifico; il rapporto distingue ciò che è stato eseguito dalle raccomandazioni."]]
      : [["Prodotti riconoscibili", "Modelli e dotazioni elencati con documenti e condizioni applicabili."], ["Compatibilità prima dell'ordine", c.specs[2][1]], ["Verifica della fornitura", c.stages[3][1]], ["Assistenza definita", "Conserva contatti e documenti; manutenzione e servizi aggiuntivi sono quelli concordati."]]),
    faq: c.faq.map(([domanda, risposta]) => ({ domanda, risposta })), testimonianze: [], gallery_lavori: [], finanziamento_promo: null, pdf_pagine_libere: [],
    pdf_ordine_capitoli: CAPITOLI_EDILI.map(p => ({ chiave: p.chiave, visibile: true })),
    pdf_blocchi: {
      modulo_edizione: 2, modulo_intervento: id,
      modulo_foto: [...new Set([c.cover, c.detail, protectionPhoto, checksPhoto, documentPhoto, processPhoto, closingPhoto])].map(url => ({ url, nome: `${CLM_MODULE_TITLES[id]} · illustrativa` })),
      comeFunziona: block("La configurazione. *Scelta per te*.", c.subtitle, c.specs, c.detail),
      compreso: block("Un perimetro chiaro. *Voce per voce*.", c.scope, c.rows.map(([cap, text]) => [cap, text.replace("dimostrativa", "concordata")] as const), undefined, [["Opere non elencate", c.scope], ["Servizi successivi", "Manutenzione periodica, reperibilità e consumabili non sono compresi salvo indicazione esplicita."]]),
      protezione: block("Preparare gli spazi. *Organizzare i lavori*.", "Accessi e interruzioni si concordano prima di intervenire.", [["Passaggi e appoggi", "Identificare percorsi di movimentazione, aree interessate e superfici da proteggere."], ["Utenze", "Comunicare quali servizi saranno interrotti e concordare il programma."], ["Rimozioni", "Distinguere parti conservate, apparecchi rimossi e gestione dei materiali."], ["Ripristini", "Delimitare gli interventi su pareti, pavimenti e finiture nella proposta."]]),
      controlli: block("La consegna. *Funzione per funzione*.", "I riscontri riguardano componenti e lavorazioni effettivamente previsti.", c.checks, checksPhoto),
      documenti: block("Le informazioni. *Da conservare*.", "Documentazione riferita all'intervento effettivo, secondo applicabilità.", [["Fornitura", "Riepilogo di modelli, componenti e attività eseguite."], ["Uso", "Istruzioni dei produttori e spiegazione delle impostazioni concordate."], ["Intervento", "Documentazione tecnica e dichiarazioni applicabili alle opere effettuate."], ["Assistenza", "Condizioni di garanzia e contatti per segnalazioni e servizi concordati."]], documentPhoto),
      diario: block("Le fasi. *Rese riconoscibili*.", "Dalla preparazione alla consegna: l'immagine illustra il processo. Le foto del tuo intervento saranno raccolte solo se concordate; qui non sono mostrati lavori aziendali.", [["Prima", c.stages[0][1]], ["Durante", c.stages[2][1]], ["Dopo", c.stages[3][1]]], processPhoto),
      ...Object.fromEntries(["computo", "compreso", "percorso", "tempi", "garanzie", "domande", "chiusura", "investimento", "chiSiamo"].map(p => [`pagina_${p}`, { senzaFoto: true }])),
      pagina_chiusura: { foto: [closingPhoto], senzaFoto: false },
    } as Record<string, unknown>,
  };
  // Landscape photographs belong to the actual protection page, not a work gallery.
  result.pdf_blocchi.protezione = { ...(result.pdf_blocchi.protezione as Record<string, unknown>), foto: [protectionPhoto], senzaFoto: false, nota: "Immagine illustrativa: le protezioni effettive riguardano le aree concordate." };
  if (airDistribution) {
    result.pdf_blocchi.controlli = { ...(result.pdf_blocchi.controlli as Record<string, unknown>), nota: "Contesto illustrativo dei terminali e degli spazi da verificare: non documenta una misura di portata né un collaudo del tuo impianto. Componenti e accessi effettivi sono quelli del progetto." };
  }
  result.pdf_blocchi.modulo_defaults = structuredClone(result.pdf_blocchi);
  return result;
}

export function buildClmModulePreview(companyId: string, template: ClmTemplatePdf, id: FullClmModuleId) {
  const c = CLM_EDITORIAL[id];
  const progetto: ClmProgetto = { id: "preview", company_id: companyId, code: "CLM-DEMO", stato: "bozza", tipo_intervento: CLM_MODULE_TITLES[id], tipologia_impianto: id === "monosplit" || id === "multisplit" || id === "canalizzato" ? id : null, numero_unita_interne: id === "monosplit" || id === "sostituzione" ? 1 : id === "multisplit" || id === "manutenzione" ? 2 : null,
    cliente_nome: "Cliente", cliente_cognome: "dimostrativo", cliente_email: null, cliente_telefono: null,
    cantiere_indirizzo: null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, massimale_detrazione: null,
    opportunita_id: null, cliente_id: null, template_id: null, sconto_pct: 0, iva_pct: 22, detrazione_pct: 0, totale_imponibile: 0, totale: 0, mostra_finanziamento: false,
    note: "ANTEPRIMA DIMOSTRATIVA: prodotti, prezzi e IVA sono esempi da definire. Non è un'offerta da inviare." };
  const computo: ClmComputoVoce[] = c.rows.map(([capitolo_nome, descrizione, price], i): ClmComputoVoce => ({ id: `demo-${i}`, progetto_id: "preview", company_id: companyId, ordine: i, capitolo_nome, descrizione, unita_misura: "corpo", quantita: 1, prezzo_unitario: price, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: price, margine_eur: price, margine_pct: 100, listino_voce_id: null }));
  const totals = calcTotaliComputo(computo, { sconto_pct: progetto.sconto_pct, iva_pct: progetto.iva_pct });
  progetto.totale_imponibile = totals.imponibile;
  progetto.totale = totals.totale;
  return { progetto, computo, media: [] as ClmProgettoMedia[], template, localOnly: true as const };
}
