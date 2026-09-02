import { useEffect, useRef } from "react";
import { type QuotePaymentPhase, parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { type BonusLine, parseBonusLines } from "@/lib/orders/bonusFiscali";

/**
 * P1-4: campi extra del preventivo (migration 20260324200*_preventivo_pro_v2).
 * Non presenti nei types generati da Supabase: li tipizziamo esplicitamente
 * qui per eliminare il `as unknown as {...}` inline nel QuoteBuilder.
 */
export interface QuoteExtraFields {
  tipo_lavoro?: string | null;
  indirizzo_lavori?: string | null;
  piano_installazione?: number | null;
  km_cantiere?: number | null;
  pdf_mostra_prezzi_per_riga?: boolean | null;
  pdf_mostra_solo_totale?: boolean | null;
  pdf_mostra_sconti?: boolean | null;
  pdf_mostra_immagini?: boolean | null;
  pdf_includi_schede_tecniche?: boolean | null;
  firma_digitale_abilitata?: boolean | null;
  template_layout_override?: string | null;
  payment_method?: string | null;
  payment_phases?: unknown;
  bonus_lines?: unknown;
}

export interface QuoteFormSetters {
  setContactId: (v: string | null) => void;
  setClientName: (v: string) => void;
  setClientEmail: (v: string) => void;
  setClientPhone: (v: string) => void;
  setClientCompany: (v: string) => void;
  setClientAddress: (v: string) => void;
  setClientFiscalCode: (v: string) => void;
  setClientVatNumber: (v: string) => void;
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setValidityDays: (v: number) => void;
  setNotes: (v: string) => void;
  setInternalNotes: (v: string) => void;
  setDiscountPercent: (v: number) => void;
  setSelectedTemplateId: (v: string) => void;
  setTipoLavoro: (v: string) => void;
  setIndirizzoLavori: (v: string) => void;
  setPianoInstallazione: (v: number) => void;
  setKmCantiere: (v: number) => void;
  setPdfPrezziRiga: (v: boolean) => void;
  setPdfSoloTotale: (v: boolean) => void;
  setPdfSconti: (v: boolean) => void;
  setPdfImmagini: (v: boolean) => void;
  setPdfSchedeTecniche: (v: boolean) => void;
  setPdfFirma: (v: boolean) => void;
  setLayoutOverride: (v: string | null) => void;
  setPaymentMethod: (v: string) => void;
  setPaymentPhases: (v: QuotePaymentPhase[]) => void;
  setBonusLines?: (v: BonusLine[]) => void;
}

interface ExistingQuoteCore {
  contact_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_company: string | null;
  client_address: string | null;
  client_fiscal_code: string | null;
  client_vat_number: string | null;
  title: string | null;
  description: string | null;
  validity_days: number | null;
  notes: string | null;
  internal_notes: string | null;
  discount_percent: number | null;
  template_id: string | null;
}

export type ExistingQuoteForHydration = ExistingQuoteCore & QuoteExtraFields;

/**
 * P1-4: idrata il form del QuoteBuilder quando `existingQuote` cambia
 * (modalità edit o apertura preventivo esistente). Prima era un blocco
 * inline di 50 righe con cast `as unknown as {...}`. Estratto qui per:
 *   - rimuovere il cast (tipo QuoteExtraFields esplicito);
 *   - rendere testabile (unit test indipendente dal componente);
 *   - ridurre la dimensione di QuoteBuilder.tsx (file da 3261 righe).
 */
export function useQuoteFormHydration(
  existingQuote: ExistingQuoteForHydration | null | undefined,
  setters: QuoteFormSetters,
) {
  // Tengo il riferimento setters in un ref: gli setState di React hanno
  // identità stabile, ma il chiamante potrebbe comunque ricreare l'oggetto
  // contenitore ad ogni render. Usando ref preserviamo la semantica
  // originale del blocco inline (re-hydrate SOLO quando existingQuote
  // cambia, non quando ri-render del componente).
  const settersRef = useRef(setters);
  settersRef.current = setters;

  useEffect(() => {
    if (!existingQuote) return;
    const q = existingQuote;
    const s = settersRef.current;
    s.setContactId(q.contact_id);
    s.setClientName(q.client_name || "");
    s.setClientEmail(q.client_email || "");
    s.setClientPhone(q.client_phone || "");
    s.setClientCompany(q.client_company || "");
    s.setClientAddress(q.client_address || "");
    s.setClientFiscalCode(q.client_fiscal_code || "");
    s.setClientVatNumber(q.client_vat_number || "");
    s.setTitle(q.title || "Preventivo");
    s.setDescription(q.description || "");
    s.setValidityDays(q.validity_days || 30);
    s.setNotes(q.notes || "");
    s.setInternalNotes(q.internal_notes || "");
    s.setDiscountPercent(q.discount_percent || 0);
    if (q.template_id) {
      s.setSelectedTemplateId(q.template_id);
    }
    s.setTipoLavoro(q.tipo_lavoro || "");
    s.setIndirizzoLavori(q.indirizzo_lavori || "");
    s.setPianoInstallazione(q.piano_installazione || 0);
    s.setKmCantiere(q.km_cantiere || 0);
    s.setPdfPrezziRiga(q.pdf_mostra_prezzi_per_riga ?? true);
    s.setPdfSoloTotale(q.pdf_mostra_solo_totale ?? false);
    s.setPdfSconti(q.pdf_mostra_sconti ?? false);
    s.setPdfImmagini(q.pdf_mostra_immagini ?? true);
    s.setPdfSchedeTecniche(q.pdf_includi_schede_tecniche ?? false);
    s.setPdfFirma(q.firma_digitale_abilitata ?? true);
    s.setLayoutOverride(q.template_layout_override ?? null);
    s.setPaymentMethod(q.payment_method || "");
    s.setPaymentPhases(parseQuotePaymentPhases(q.payment_phases));
    s.setBonusLines?.(parseBonusLines(q.bonus_lines));
  }, [existingQuote]);
}
