import { costruisciDatiEdile, type ProgettoComune } from "./adattatoreEdile";
import type { DocEdileDati } from "./documentoEdileTipi";
import { righeRiepilogoIva } from "../../../../supabase/functions/_shared/riepilogoIvaPreventivo";
import { agevolazioniPreventivo } from "../../../../supabase/functions/_shared/prezziPreventivo";
import { formatCurrency } from "@/lib/formatters";

type Riga = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;

/** Dati già autorizzati e letti da generate-quote-pdf; nessuna lettura DB nel renderer. */
export function datiGenerici(input: { quote: Riga; items: Riga[]; righePerIva?: Riga[]; company: Riga | null; template: Riga }): DocEdileDati {
  const { quote: q, items, company: c, template: t } = input;
  const progetto: ProgettoComune = {
    code: str(q.quote_number), tipo_intervento: str(q.title), cliente_nome: str(q.client_name), cliente_cognome: null,
    cantiere_indirizzo: str(q.work_address || q.client_address), cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, created_at: str(q.created_at), mostra_finanziamento: false,
  };
  const capitoli = new Map<string, typeof items>();
  for (const r of items) {
    const categoria = r.is_optional ? "Opzioni escluse dal totale" : str(r.category || r.category_name) || "Lavorazioni e forniture";
    capitoli.set(categoria, [...(capitoli.get(categoria) ?? []), r]);
  }
  const iva = righeRiepilogoIva({ righe: input.righePerIva ?? items, subtotal: q.subtotal, discount_amount: q.discount_amount, total: q.total, discount_percent: q.discount_percent });
  const imponibile = iva.subTotShown - iva.scontoShown;
  const totale = iva.totShown;
  const dati = costruisciDatiEdile({
    modulo: { chiave: "generico", etichetta: "Preventivo", titoloCopertina: str(q.title) || "La tua *proposta*.", sottotitoloCopertina: str(q.description), titoloComputo: "Lavorazioni e forniture" },
    progetto, azienda: { name: str(c?.business_name || c?.name), indirizzo: str(c?.address), email: str(c?.email), telefono: str(c?.phone), partita_iva: str(c?.vat_number), logo_url: str(c?.logo_url), logo_chiaro_url: str(c?.brand_logo_dark_url), colore_marca: str(c?.brand_primary_color) },
    template: { ...t, color_primary: t.primary_color, color_secondary: t.secondary_color, color_accent: t.accent_color,
      pdf_cover_hero: t.cover_title, pdf_cover_subhero: t.cover_subtitle, pdf_cover_image_url: t.show_cover_image === false ? null : t.cover_image_url,
      chi_siamo: t.company_description, show_chi_siamo: t.show_company_description,
      payment_terms_text: t.show_payment_terms === false ? null : q.payment_terms || t.payment_terms_text,
      condizioni_legali_attivo: q.pdf_mostra_condizioni !== false && (t.show_contractual_terms !== false || t.show_legal_terms !== false),
      condizioni_legali_testo: [t.show_contractual_terms !== false ? t.contractual_terms_text : null, t.show_legal_terms !== false ? t.legal_terms_text : null].filter(Boolean).join("\n\n"),
      default_validita_giorni: q.expires_at && q.created_at ? Math.max(0, Math.round((Date.parse(str(q.expires_at)) - Date.parse(str(q.created_at))) / 86400000)) : null,
    },
    capitoli: [...capitoli].map(([nome, righe]) => ({ nome, fuoriTotale: righe.every(r => r.is_optional === true), subtotale: righe.reduce((s, r) => s + num(r.line_total), 0), voci: righe.map((r, i) => ({ id: str(r.id) || `riga-${i}`, descrizione: str(r.name), descrizione_estesa: str(r.description), quantita: num(r.quantity), unita_misura: str(r.unit_of_measure), prezzo_unitario: num(r.unit_price), importo: num(r.line_total), immagine_url: str(r.image_url) })) })),
    totali: { imponibileLordo: iva.subTotShown, scontoEur: iva.scontoShown, scontoPct: num(q.discount_percent), imponibile, iva: iva.ivaToShow, ivaPct: iva.righeIva[0]?.aliquota ?? 0, aliquoteIva: iva.righeIva, totale, detrazionePct: 0, detrazioneEur: 0, costoTot: 0, margineEur: null, marginePct: null, prezzoManuale: num(q.prezzo_manuale) > 0 },
    media: [], opzioniComputo: { mostraPrezzi: q.pdf_mostra_prezzi !== false, mostraQta: q.pdf_mostra_quantita !== false },
  });
  dati.totali.mostraSconti = q.pdf_mostra_sconti !== false;
  dati.titoloDocumento = `Preventivo ${str(q.quote_number)}`;
  dati.filigrana = t.show_watermark ? str(t.watermark_text) : null;
  dati.sezioniTecniche = [];
  if (t.show_client_details !== false) dati.sezioniTecniche.push({ id: "anagrafica", titolo: "Dati del cliente", righe: [
    { etichetta: "Intestatario", valore: dati.cliente },
    ...[["Azienda", q.client_company], ["Codice fiscale", q.client_fiscal_code], ["Partita IVA", q.client_vat_number], ["Indirizzo", q.client_address], ["Email", q.client_email], ["Telefono", q.client_phone]].flatMap(([etichetta, valore]) => typeof valore === "string" && valore ? [{ etichetta: String(etichetta), valore }] : []),
  ] });
  const condizioni = [
    t.show_notes === false ? null : { etichetta: "Note", valore: str(q.notes) },
    t.show_delivery_terms === false ? null : { etichetta: "Consegna", valore: str(q.delivery_terms || t.delivery_terms_text) },
    { etichetta: "Coordinate bancarie", valore: str(t.bank_details) },
  ].filter((r): r is { etichetta: string; valore: string } => !!r?.valore);
  if (condizioni.length) dati.sezioniTecniche.push({ id: "accordi", titolo: "Accordi e riferimenti", righe: condizioni });
  if (t.show_logo === false) { dati.azienda.logoUrl = null; dati.azienda.logoChiaroUrl = null; dati.modello.copertina.logoUrl = null; dati.modello.copertina.posizioneLogo = "hidden"; }
  const bonus = agevolazioniPreventivo(q.bonus_lines, { imponibile, totale });
  if (bonus) dati.sezioniTecniche.push({ id: "agevolazioni", titolo: "Agevolazioni previste", righe: bonus.voci.map(v => ({ etichetta: `${v.etichetta} (${v.aliquota}%)`, valore: formatCurrency(v.detrazione) })), nota: "Stime subordinate alla verifica dei requisiti dell'intervento e del beneficiario." });
  return dati;
}
