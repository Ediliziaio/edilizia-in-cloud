import { buildMergeContext, substituteMergeTags } from "../../../supabase/functions/_shared/quoteTemplateComposer";
import type { IntestazioneComputo } from "./esportaComputo";
import type { VoceComputo } from "./alberoComputo";
import { calcolaSconto, oneriSicurezza } from "./scontoComputo";
import { calcolaIvaComputo } from "./ivaComputo";
import { testoPianoPagamenti } from "./pianoPagamentiPdf";

/** Anche il computo usa i campi della libreria comune: nessun {{tag}} grezzo nei testi stampati. */
export function compilaTestiComputo(i: IntestazioneComputo, voci: VoceComputo[]): IntestazioneComputo {
  const lordo = voci.reduce((s, v) => s + (v.importo_computo ?? 0), 0);
  const sconto = calcolaSconto(lordo, i.sconto, oneriSicurezza(voci));
  const fiscale = calcolaIvaComputo(voci.some(v => v.importo_computo != null) ? lordo - sconto.importo : null, i);
  const visibili = !i.senzaPrezzi && i.mostraImporti !== false;
  const dati = i.nascondiCliente ? {} : i.datiCliente;
  const ctx = buildMergeContext({
    quote: {
      quote_number: i.numero ?? "", client_name: i.nascondiCliente ? "" : i.committente,
      client_email: dati?.email, client_phone: dati?.telefono, client_address: dati?.indirizzo,
      client_fiscal_code: dati?.codiceFiscale, client_vat_number: dati?.partitaIva,
      client_codice_univoco: dati?.sdi, subtotal: visibili ? lordo : null,
      discount_amount: visibili ? sconto.importo : null, total: visibili ? fiscale.totale : null,
      vat_amount: visibili ? fiscale.iva : null,
    },
    company: { name: i.azienda, vat_number: i.datiAzienda?.partitaIva, address: i.datiAzienda?.indirizzo, email: i.datiAzienda?.email, phone: i.datiAzienda?.telefono },
    cantiere: { indirizzo: i.nascondiCliente ? "" : i.indirizzoIntervento },
  });
  const piano = [testoPianoPagamenti(i.ratePagamento, i.ivaModalita === "applicata", visibili, i.ritenutaPagamenti), i.pagamenti].filter(Boolean).join("\n");
  ctx.preventivo = { ...ctx.preventivo, data: i.dataDocumento ?? "", totale: visibili && fiscale.totale == null ? "da definire (IVA non ancora determinata)" : ctx.preventivo?.totale,
    iva: visibili ? fiscale.iva == null ? "da definire" : ctx.preventivo?.iva : "",
    piano_pagamenti: piano && !piano.includes("{{") ? piano : "come da condizioni di pagamento concordate" };
  ctx.preventivo.frase_pagamenti = piano && !piano.includes("{{") ? `Il pagamento avviene secondo il piano concordato: ${piano}` : "Il pagamento avviene secondo le modalità concordate.";
  // Lo stesso sostitutore della libreria accetta il gruppo aggiuntivo senza valutare codice o HTML.
  const personalizzato = Object.fromEntries((i.veste?.campiPersonalizzati ?? []).map(c => [c.chiave, c.valore]));
  const completo = { ...ctx, custom: personalizzato };
  const sub = (s: string | null | undefined) => substituteMergeTags(s, completo);
  return {
    ...i, titolo: sub(i.titolo), oggetto: sub(i.oggetto), riferimentoPrezzi: sub(i.riferimentoPrezzi), condizioni: sub(i.condizioni), inclusioni: sub(i.inclusioni), esclusioni: sub(i.esclusioni), tempi: sub(i.tempi), pagamenti: sub(i.pagamenti),
    condizioniContrattuali: sub(i.condizioniContrattuali),
    veste: i.veste && { ...i.veste, campiPersonalizzati: i.veste.campiPersonalizzati?.map(c => ({ ...c, valore: sub(c.valore) })), sopratitolo: sub(i.veste.sopratitolo), premessa: sub(i.veste.premessa), piePagina: sub(i.veste.piePagina), firmatario: sub(i.veste.firmatario), clausoleDaApprovare: sub(i.veste.clausoleDaApprovare) },
  };
}
