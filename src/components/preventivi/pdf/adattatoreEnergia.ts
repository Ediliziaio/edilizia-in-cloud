import type { DatiRacconto } from "./racconto/baseRacconto";
import { costruisciDatiEdile } from "./adattatoreEdile";
import type { DocEdileDati } from "./documentoEdileTipi";
import type { DomandaRisposta, Passaggio } from "@/lib/contoTermico/testi";

export function contenutiEnergia(dati: DocEdileDati, input: {
  colorePrimario?: string | null;
  testi?: { titoloCopertina?: string | null; sottotitoloCopertina?: string | null; faq?: DomandaRisposta[] | null; passaggi?: Passaggio[] | null };
  foto?: Partial<Record<string, string | null>>;
}, defaults: { faq: DomandaRisposta[]; passaggi: Passaggio[] }) {
  if (input.colorePrimario) dati.modello.colorePrimario = input.colorePrimario;
  if (input.testi?.titoloCopertina?.trim()) dati.modello.copertina.titolo = input.testi.titoloCopertina;
  if (input.testi?.sottotitoloCopertina?.trim()) dati.modello.copertina.sottotitolo = input.testi.sottotitoloCopertina;
  if (input.foto?.copertina) dati.modello.copertina.immagineUrl = input.foto.copertina;
  const faq = input.testi?.faq?.length ? input.testi.faq : defaults.faq;
  const passaggi = input.testi?.passaggi?.length ? input.testi.passaggi : defaults.passaggi;
  dati.modello.faq = faq;
  dati.modello.percorso = passaggi.map(p => ({ titolo: p.titolo, descrizione: p.testo }));
  dati.modello.mostraPercorso = true;
  dati.modello.mostraGaranzie = true;
}

/** I modelli energetici aggiungono i risultati, mantenendo lo stesso documento. */
export function baseDocumentoEnergia(d: DatiRacconto, economia: { prezzo: number; imponibile: number; iva: number }, etichetta: string): DocEdileDati {
  if (d.standard) return structuredClone(d.standard);
  const dati = costruisciDatiEdile({
    modulo: { chiave: "termoidraulico", etichetta, titoloCopertina: `Il tuo *progetto* ${etichetta}.`, sottotitoloCopertina: "Configurazione e scenario economico", titoloComputo: "La fornitura" },
    progetto: { code: d.preventivo.codice, cliente_nome: d.cliente.nome, cliente_cognome: null, tipo_intervento: etichetta, cantiere_indirizzo: d.cliente.indirizzo ?? null, cantiere_cap: null, cantiere_citta: null, cantiere_provincia: null, immobile_tipo: null, immobile_anno: null, immobile_piani: null, immobile_superficie_mq: null, mostra_finanziamento: false },
    azienda: { name: d.azienda.nome, logo_url: d.azienda.logoUrl, telefono: d.azienda.telefono, email: d.azienda.email, website: d.azienda.sito, partita_iva: d.azienda.piva },
    template: { condizioni_legali_attivo: false, default_validita_giorni: d.preventivo.validitaGiorni, pdf_blocchi_foto: {}, pdf_pagine_foto: {} }, capitoli: [], media: [],
    totali: { imponibileLordo: economia.imponibile, imponibile: economia.imponibile, iva: economia.iva, ivaPct: economia.imponibile > 0 ? economia.iva / economia.imponibile * 100 : 0, totale: economia.prezzo, scontoEur: 0, scontoPct: 0, detrazionePct: 0, detrazioneEur: 0, costoTot: 0, margineEur: null, marginePct: null },
  });
  dati.bozzaLocale = { ivaDaDefinire: false };
  return dati;
}
