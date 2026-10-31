/**
 * Quello che il popup «Crea con Silvio» chiede fuori da sé: i lettori, il database delle
 * bozze, il registro delle correzioni e, per «Completa», la commessa e i suoi documenti. Si passa da qui perché i test lo sostituiscano
 * senza toccare Supabase (src/test/ui/silvioCommessaPopup.test.tsx).
 */
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import {
  leggiDocumento, leggiTesto, type EsitoLettura, type OpzioniLettura,
} from "@/lib/silvio-commessa/leggiDocumento";
import {
  elencaAllegatiCommessa, leggiFrammentiCommessa, leggiFrammentiPreventivo, leggiFrammentoComputo, scaricaAllegatoCommessa,
  type AllegatoCommessa,
} from "@/lib/silvio-commessa/lettori";
import { registraCorrezioni, type Correzione } from "@/lib/silvio-commessa/correzioni";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";
import { elencaComputiCloud, type RiepilogoComputoCloud } from "@/lib/computo/cloudComputo";
import { supabase } from "@/integrations/supabase/client";

/** Un preventivo nell'elenco da scegliere. */
export interface PreventivoDaScegliere {
  id: string;
  quote_number: string;
  title: string | null;
  client_name: string | null;
  status: string;
  total: number | null;
}

export interface ServiziSilvioCommessa {
  elencaPreventivi(companyId: string): Promise<PreventivoDaScegliere[]>;
  frammentiPreventivo(quoteId: string, inizio?: string | null): Promise<Frammento[]>;
  frammentoComputo(companyId: string, draftId: string, inizio?: string | null): Promise<Frammento | null>;
  leggiFile(file: File, opz: OpzioniLettura): Promise<EsitoLettura>;
  leggiTesto(testo: string, opz: OpzioniLettura): Promise<EsitoLettura>;
  elencaComputi(companyId: string): Promise<RiepilogoComputoCloud[]>;
  registraCorrezioni(c: Correzione[]): Promise<void>;
  /** «Completa»: la commessa che c'è (fonte persona) e, se serve, il modello del lavoro. */
  frammentiCommessa(orderId: string): Promise<Frammento[]>;
  /** «Completa»: i documenti già allegati alla commessa, da far leggere su tocco. */
  elencaAllegati(orderId: string): Promise<AllegatoCommessa[]>;
  scaricaAllegato(a: AllegatoCommessa): Promise<File>;
  /** Il client delle bozze e delle RPC (`bozze.ts`). */
  db: ClientBozze;
}

export const serviziVeri: ServiziSilvioCommessa = {
  // Come ImportFromQuotePicker: solo i preventivi di questa azienda, i più recenti.
  elencaPreventivi: async (companyId) => {
    const { data, error } = await supabase.from("quotes")
      .select("id, quote_number, title, client_name, status, total")
      .eq("company_id", companyId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(`Non riesco a leggere i preventivi: ${error.message}`);
    return (data ?? []) as PreventivoDaScegliere[];
  },
  frammentiPreventivo: leggiFrammentiPreventivo,
  frammentoComputo: leggiFrammentoComputo,
  leggiFile: (file, opz) => leggiDocumento(file, opz),
  leggiTesto: (testo, opz) => leggiTesto(testo, opz),
  elencaComputi: elencaComputiCloud,
  registraCorrezioni,
  frammentiCommessa: leggiFrammentiCommessa,
  elencaAllegati: elencaAllegatiCommessa,
  scaricaAllegato: scaricaAllegatoCommessa,
  // Le tabelle nuove non sono ancora nei tipi generati: si passa da un client senza tipi.
  db: supabase as unknown as ClientBozze,
};
