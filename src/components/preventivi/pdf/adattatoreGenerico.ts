import { costruisciDatiEdile, type ProgettoComune } from "./adattatoreEdile";
import type { DocEdileDati } from "./documentoEdileTipi";
import { righeRiepilogoIva } from "../../../../supabase/functions/_shared/riepilogoIvaPreventivo";
import { agevolazioniPreventivo } from "../../../../supabase/functions/_shared/prezziPreventivo";
import { testiPerPdf } from "../../../../supabase/functions/_shared/testoPerPdf";
import { coloreDelBlocco } from "../../../../supabase/functions/_shared/blocchiModelloPreventivo";
import { nomeLeggibile } from "../../../../supabase/functions/_shared/impaginaPreventivo";
import { formatCurrency } from "@/lib/formatters";
import { CAPITOLI_EDILI } from "./ordineCapitoli";

/** I soli capitoli del preventivo classico: la tabella e il prezzo con le modalità di pagamento. */
export const ORDINE_PREVENTIVO_CLASSICO = CAPITOLI_EDILI.map((c) => ({ chiave: c.chiave, visibile: c.chiave === "piano" || c.chiave === "investimento" }));

type Riga = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;

/** Dati già autorizzati e letti da generate-quote-pdf; nessuna lettura DB nel renderer. */
export function datiGenerici(input: { quote: Riga; items: Riga[]; righePerIva?: Riga[]; company: Riga | null; template: Riga & { composed_terms?: Riga | null } }): DocEdileDati {
  const { quote: q, items, company: c, template: t } = input;
  const progetto: ProgettoComune = {
    code: str(q.quote_number), tipo_intervento: str(q.title), cliente_nome: str(q.client_name), cliente_cognome: null,
    cantiere_indirizzo: str(q.work_address || q.client_address), cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, created_at: str(q.created_at), mostra_finanziamento: false,
    // Le fasi del cantiere scritte sul preventivo (31/10/2026): il documento le stampa come nei preventivatori edili.
    cronoprogramma: q.cronoprogramma ?? null,
  };
  const capitoli = new Map<string, typeof items>();
  for (const r of items) {
    const categoria = r.is_optional ? "Opzioni escluse dal totale" : str(r.category || r.category_name) || "Lavorazioni e forniture";
    capitoli.set(categoria, [...(capitoli.get(categoria) ?? []), r]);
  }
  // Il nome del cliente scritto tutto maiuscolo («ROSSI MARIO») nel titolo grande della
  // copertina si legge meglio così: «Rossi Mario». Il dato resta com'è altrove.
  const nomeCliente = str(q.client_name).trim();
  const conNomeLeggibile = (testo: unknown) => nomeCliente.length > 2 && typeof testo === "string"
    ? testo.split(nomeCliente).join(nomeLeggibile(nomeCliente)) : testo;
  const iva = righeRiepilogoIva({ righe: input.righePerIva ?? items, subtotal: q.subtotal, discount_amount: q.discount_amount, total: q.total, discount_percent: q.discount_percent });
  const imponibile = iva.subTotShown - iva.scontoShown;
  const totale = iva.totShown;
  const dati = costruisciDatiEdile({
    companyId: typeof q.company_id === "string" ? q.company_id : null,
    modulo: { chiave: "generico", etichetta: "Preventivo", titoloCopertina: str(q.title) || "La tua *proposta*.", sottotitoloCopertina: str(q.description), titoloComputo: "Lavorazioni e forniture" },
    progetto, azienda: { name: str(c?.business_name || c?.name), indirizzo: str(c?.address), email: str(c?.email), telefono: str(c?.phone), partita_iva: str(c?.vat_number), logo_url: str(c?.logo_url), logo_chiaro_url: str(c?.brand_logo_dark_url), colore_marca: str(c?.brand_primary_color) },
    template: { ...t, color_primary: t.primary_color, color_secondary: t.secondary_color, color_accent: t.accent_color,
      pdf_cover_hero: conNomeLeggibile(t.cover_title), pdf_cover_subhero: conNomeLeggibile(t.cover_subtitle), pdf_cover_image_url: t.show_cover_image === false ? null : t.cover_image_url,
      // La dimensione del logo scelta nel modello (Piccola, Media, Grande) vale sulla copertina,
      // se il modello non ha già una misura sua (25/09/2026).
      pdf_cover_logo_size: t.pdf_cover_logo_size ?? (t.logo_size === "small" ? 80 : t.logo_size === "large" ? 140 : null),
      chi_siamo: t.company_description, show_chi_siamo: t.show_company_description,
      payment_terms_text: t.show_payment_terms === false ? null : q.payment_terms || t.payment_terms_text,
      condizioni_legali_attivo: q.pdf_mostra_condizioni !== false && (t.show_contractual_terms !== false || t.show_legal_terms !== false),
      condizioni_legali_testo: [t.show_contractual_terms !== false ? t.contractual_terms_text : null, t.show_legal_terms !== false ? t.legal_terms_text : null].filter(Boolean).join("\n\n"),
      default_validita_giorni: q.expires_at && q.created_at ? Math.max(0, Math.round((Date.parse(str(q.expires_at)) - Date.parse(str(q.created_at))) / 86400000)) : null,
    },
    capitoli: [...capitoli].map(([nome, righe]) => ({ nome, fuoriTotale: righe.every(r => r.is_optional === true), subtotale: righe.reduce((s, r) => s + num(r.line_total), 0), voci: righe.map((r, i) => ({ id: str(r.id) || `riga-${i}`, descrizione: str(r.name), descrizione_estesa: str(r.description), descrizione_scritta: true, quantita: num(r.quantity), unita_misura: str(r.unit_of_measure), prezzo_unitario: num(r.unit_price), sconto_pct: num(r.discount_percent), importo: num(r.line_total), immagine_url: str(r.image_url) })) })),
    totali: { imponibileLordo: iva.subTotShown, scontoEur: iva.scontoShown, scontoPct: num(q.discount_percent), imponibile, iva: iva.ivaToShow, ivaPct: iva.righeIva[0]?.aliquota ?? 0, aliquoteIva: iva.righeIva, totale, detrazionePct: 0, detrazioneEur: 0, costoTot: 0, margineEur: null, marginePct: null, prezzoManuale: num(q.prezzo_manuale) > 0 },
    // «Solo il totale» (sul preventivo o nelle impostazioni dell'azienda): il computo a corpo, senza le righe.
    media: [], opzioniComputo: { livello: q.pdf_mostra_solo_totale === true ? "corpo" : "dettagliato", mostraPrezzi: q.pdf_mostra_prezzi_per_riga !== false, mostraQta: q.pdf_mostra_quantita !== false },
  });
  // Lo sconto si mostra solo se è vero: non i centesimi dell'IVA che righeRiepilogoIva assorbe nello sconto.
  dati.totali.mostraScontiRiga = q.pdf_mostra_sconti !== false;
  dati.totali.mostraSconti = q.pdf_mostra_sconti !== false && num(q.discount_amount) >= 0.01;
  dati.titoloDocumento = `Preventivo ${str(q.quote_number)}`;
  dati.filigrana = t.show_watermark ? str(t.watermark_text) : null;
  // Il preventivo classico è un documento semplice (07/11/2026, Florin: «copertina, la tabella con cosa compra
  // e il prezzo finale, poi in fondo modalità di pagamento e le condizioni contrattuali: oggi è troppo lungo»).
  // Dei capitoli del documento edile restano il piano (la tabella) e l'investimento (prezzo e pagamento); niente
  // lettera e indice in apertura, niente presentazione, niente «prossimi passi». Il cliente sta in copertina e
  // nella pagina delle firme: la scheda «Dati del cliente» non si ripete. Restano le condizioni con la firma.
  dati.modello.ordineCapitoli = ORDINE_PREVENTIVO_CLASSICO;
  dati.mostraChiusura = false;
  dati.prezzoSottoLaTabella = true;
  // E sobrio (07/11/2026, Florin: «non ci sono titoli, tutto più piccolo, la tabella ordinaria come nel
  // computo, poco spazio vuoto»): dopo la copertina, un documento da ufficio.
  dati.stile = "sobrio";
  dati.modello.copertina.occhiello = dati.modello.copertina.occhiello || "Preventivo";
  dati.sezioniTecniche = [];
  const condizioni = [
    t.show_notes === false ? null : { etichetta: "Note", valore: str(q.notes) },
    t.show_delivery_terms === false ? null : { etichetta: "Consegna", valore: str(q.delivery_terms || t.delivery_terms_text) },
    { etichetta: "Coordinate bancarie", valore: str(t.bank_details) },
  ].filter((r): r is { etichetta: string; valore: string } => !!r?.valore);
  if (condizioni.length) dati.sezioniTecniche.push({ id: "accordi", titolo: "Accordi e riferimenti", righe: condizioni });
  // Niente «Chi siamo», schede prodotto o sezioni libere dei blocchi collegati al modello (08/11/2026, Florin):
  // il classico dice cosa si compra, quanto costa, come si paga, a quali condizioni. Le schede dei prodotti scelti
  // sono i PDF allegati in fondo (`schedeProdotto`).
  // Le condizioni col colore del loro blocco, se l'ha scelto.
  dati.modello.coloreCondizioni = coloreDelBlocco(t.composed_terms?.primary_color);
  if (t.show_logo === false) { dati.azienda.logoUrl = null; dati.azienda.logoChiaroUrl = null; dati.modello.copertina.logoUrl = null; dati.modello.copertina.posizioneLogo = "hidden"; }
  // Timbro e chi firma per l'impresa (25/09/2026): il timbro arriva già letto dalla cartella
  // dell'azienda (generate-quote-pdf), qui solo il data URL.
  dati.azienda.timbroUrl = str(t.timbro_firma_url) || null;
  dati.azienda.firmatario = str(t.firmatario_impresa).trim() || null;
  const bonus = agevolazioniPreventivo(q.bonus_lines, { imponibile, totale });
  if (bonus) dati.sezioniTecniche.push({ id: "agevolazioni", titolo: "Agevolazioni previste", righe: bonus.voci.map(v => ({ etichetta: `${v.etichetta} (${v.aliquota}%)`, valore: formatCurrency(v.detrazione) })), nota: "Stime subordinate alla verifica dei requisiti dell'intervento e del beneficiario." });
  // Le parti aggiunte qui (dati del cliente, note, accordi) passano dallo stesso filtro di
  // costruisciDatiEdile: un'emoji o una freccia incollate non escono come caratteri a caso.
  return testiPerPdf(dati);
}
