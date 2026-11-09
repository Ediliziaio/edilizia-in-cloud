/**
 * L'anteprima di un modello di «Contratti e condizioni» è il PDF vero (07/11/2026).
 *
 * Florin: «l'anteprima non rispecchia l'anteprima reale: un modello in PDF che esce deve rispettare quello
 * reale». Quindi niente HTML disegnato a parte: si costruisce un documento con `costruisciDatiEdile`, il
 * modello passa per la stessa regola dei preventivi (`condizioniDelPdf`, dall'archivio appoggiato sul
 * modello), quella che legge davvero i preventivi.
 *
 * Dal 09/11/2026 il foglio è quello semplice, uguale per ogni tipo di documento (`FoglioCondizioniPDF`):
 * niente «Piano dei lavori · Preventivo», logo o titolo grande, e in fondo i dati societari veri.
 *
 * I campi automatici ({{cliente.nome_completo}}, {{cantiere.indirizzo}}…) si riempiono con dati di esempio,
 * dichiarati come tali nella pagina, così si legge la frase com'è davvero.
 */
import { pdf } from "@react-pdf/renderer";
import { FoglioCondizioniPDF } from "@/components/preventivi/pdf/FoglioCondizioniPDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { supabase } from "@/integrations/supabase/client";
import { caricaDatiSocietari, datiSocietariDa, righeSocietarie, type DatiSocietari } from "../../../supabase/functions/_shared/datiSocietari";
import { CHIAVE_ARCHIVIO, type ModelloArchivio } from "../../../supabase/functions/_shared/condizioniArchivio";

export const DATI_DI_ESEMPIO = {
  cliente: "Mario Rossi",
  cantiere: "Via Roma 1, Milano",
  numero: "PRV-2026-001",
  totale: 12_500,
} as const;

export interface AziendaPerAnteprima {
  /** Per leggere i dati societari veri, nel piè di pagina. */
  id?: string | null;
  nome: string;
  colore?: string | null;
  partitaIva?: string | null;
  email?: string | null;
  telefono?: string | null;
  indirizzo?: string | null;
}

/** L'azienda che si sta guardando, nei campi che servono all'anteprima. Un posto solo per tutte le pagine. */
export function aziendaPerAnteprima(c: {
  id?: string | null; business_name?: string | null; name?: string | null; brand_primary_color?: string | null; vat_number?: string | null;
  email?: string | null; phone?: string | null; legal_address?: string | null;
} | null | undefined): AziendaPerAnteprima {
  return {
    id: c?.id ?? null, nome: c?.business_name || c?.name || "La tua azienda",
    colore: c?.brand_primary_color ?? null, partitaIva: c?.vat_number ?? null,
    email: c?.email ?? null, telefono: c?.phone ?? null, indirizzo: c?.legal_address ?? null,
  };
}

/** I dati del documento: un preventivo d'esempio che stampa solo le condizioni di questo modello. */
export function datiAnteprimaCondizioni(modello: ModelloArchivio, azienda: AziendaPerAnteprima) {
  const dati = costruisciDatiEdile({
    modulo: { chiave: "generico", etichetta: "Preventivo", titoloCopertina: "Preventivo", sottotitoloCopertina: null, titoloComputo: "Lavorazioni" },
    progetto: {
      code: DATI_DI_ESEMPIO.numero, tipo_intervento: "Lavori", cliente_nome: DATI_DI_ESEMPIO.cliente, cliente_cognome: null,
      cantiere_indirizzo: DATI_DI_ESEMPIO.cantiere, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
      immobile_tipo: null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null,
      created_at: new Date().toISOString(), mostra_finanziamento: false,
    },
    template: {
      condizioni_legali_attivo: true,
      // Nessun testo vecchio: deve uscire l'archivio, come esce nei preventivi veri.
      condizioni_legali_testo: null,
      color_primary: azienda.colore ?? null,
      [CHIAVE_ARCHIVIO]: { associato: modello, predefinito: null, fissate: null },
    },
    azienda: {
      name: azienda.nome, ragione_sociale: azienda.nome, partita_iva: azienda.partitaIva ?? null,
      email: azienda.email ?? null, telefono: azienda.telefono ?? null, indirizzo: azienda.indirizzo ?? null,
      colore_marca: azienda.colore ?? null,
    },
    capitoli: [],
    totali: {
      imponibileLordo: DATI_DI_ESEMPIO.totale, scontoEur: 0, scontoPct: 0, imponibile: DATI_DI_ESEMPIO.totale,
      iva: 0, ivaPct: 0, totale: DATI_DI_ESEMPIO.totale, detrazionePct: 0, detrazioneEur: 0, costoTot: 0,
      margineEur: null, marginePct: null,
    },
    media: [],
  });
  return { ...dati, titoloDocumento: `Anteprima · ${modello.nome}` };
}

/** I dati societari letti da poco: l'anteprima si rifà a ogni tasto, il database no. */
const LETTI = new Map<string, { quando: number; dati: Promise<DatiSocietari | null> }>();
function datiSocietariDi(id: string): Promise<DatiSocietari | null> {
  const letto = LETTI.get(id);
  if (letto && Date.now() - letto.quando < 60_000) return letto.dati;
  const dati = caricaDatiSocietari(supabase, id);
  LETTI.set(id, { quando: Date.now(), dati });
  return dati;
}

/** Il foglio dell'anteprima: le clausole del modello e i dati societari, nient'altro. */
export function foglioAnteprima(modello: ModelloArchivio, azienda: AziendaPerAnteprima, societari: DatiSocietari | null) {
  const dati = datiAnteprimaCondizioni(modello, azienda);
  const riserva = datiSocietariDa({ business_name: azienda.nome, legal_address: azienda.indirizzo, vat_number: azienda.partitaIva }, null);
  return (
    <FoglioCondizioniPDF titolo={dati.titoloDocumento ?? modello.nome} autore={azienda.nome}
      righe={dati.modello.condizioniLegali} societarie={righeSocietarie(societari ?? riserva)} companyId={azienda.id} />
  );
}

/** Il PDF, pronto per il pannello dell'anteprima. */
export async function anteprimaCondizioniUrl(modello: ModelloArchivio, azienda: AziendaPerAnteprima): Promise<string> {
  const societari = azienda.id ? await datiSocietariDi(azienda.id) : null;
  const blob = await pdf(foglioAnteprima(modello, azienda, societari)).toBlob();
  return createPdfPreviewUrl(blob);
}
