/**
 * Quello che il popup «Crea con Silvio» chiede fuori da sé: i lettori, il database delle
 * bozze, il registro delle correzioni e, per «Completa», la commessa e i suoi documenti. Si passa da qui perché i test lo sostituiscano
 * senza toccare Supabase (src/test/ui/silvioCommessaPopup.test.tsx).
 *
 * Fase 3: la chat sulla bozza (`chat`), il saldo dei crediti prima di ogni chiamata AI
 * (`saldoAI`), la dettatura (`trascrivi`, con `trascrizione-audio` come il preventivatore), i
 * contratti dell'app, i documenti letti dove stanno (`leggiRemoto`), e la ⓘ che riapre un
 * documento (`scaricaCaricato`, `apriDocumento`).
 */
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ChiamataStrumento, ContestoChat } from "../../../shared/silvio-commessa/chat.ts";
import type { RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import {
  leggiDocumento, leggiDocumentoRemoto, leggiTesto, BUCKET_DOCUMENTI_COMMESSA, type EsitoLettura, type OpzioniLettura,
} from "@/lib/silvio-commessa/leggiDocumento";
import {
  elencaAllegatiCommessa, leggiFrammentiCommessa, leggiFrammentiPreventivo, leggiFrammentoComputo, leggiFrammentoContratto,
  scaricaAllegatoCommessa, type AllegatoCommessa,
} from "@/lib/silvio-commessa/lettori";
import { registraCorrezioni, type Correzione } from "@/lib/silvio-commessa/correzioni";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";
import { elencaComputiCloud, type RiepilogoComputoCloud } from "@/lib/computo/cloudComputo";
import { supabase } from "@/integrations/supabase/client";
import { readInvokeError } from "@/lib/readInvokeError";

/** Un preventivo nell'elenco da scegliere. */
export interface PreventivoDaScegliere {
  id: string;
  quote_number: string;
  title: string | null;
  client_name: string | null;
  status: string;
  total: number | null;
}

export interface RichiestaChat {
  companyId: string;
  messaggio: string;
  contesto: ContestoChat;
  storia: { ruolo: "persona" | "silvio"; testo: string }[];
  /** Una per invio: due invii uguali sono due risposte, un ritentativo dello stesso no. */
  richiestaId: string;
}

export interface RispostaChat {
  testo: string;
  strumenti: ChiamataStrumento[];
  costoEur: number;
}

/** I crediti AI dell'azienda: null se non si sanno (la funzione li ricontrolla comunque). */
export interface SaldoAI {
  saldoEur: number | null;
  bloccato: boolean;
}

export interface ServiziSilvioCommessa {
  elencaPreventivi(companyId: string): Promise<PreventivoDaScegliere[]>;
  frammentiPreventivo(quoteId: string, inizio?: string | null): Promise<Frammento[]>;
  frammentoComputo(companyId: string, draftId: string, inizio?: string | null): Promise<Frammento | null>;
  leggiFile(file: File, opz: OpzioniLettura): Promise<EsitoLettura>;
  leggiTesto(testo: string, opz: OpzioniLettura): Promise<EsitoLettura>;
  /** Un documento che il browser non scarica (allegato di un'email): lo legge Silvio dove sta. */
  leggiRemoto(documento: RifDocumento, meta: { nome: string; mime?: string | null }, opz: OpzioniLettura): Promise<EsitoLettura>;
  elencaComputi(companyId: string): Promise<RiepilogoComputoCloud[]>;
  registraCorrezioni(c: Correzione[]): Promise<void>;
  /** «Completa»: la commessa che c'è (fonte persona) e, se serve, il modello del lavoro. */
  frammentiCommessa(orderId: string): Promise<Frammento[]>;
  /** «Completa»: i documenti già allegati alla commessa, da far leggere su tocco. */
  elencaAllegati(orderId: string): Promise<AllegatoCommessa[]>;
  scaricaAllegato(a: AllegatoCommessa): Promise<File>;
  /** «Crea la commessa da questo contratto»: un contratto dell'app, a regole. */
  frammentoContratto(id: string): Promise<Frammento>;
  /** Un file già in silvio-uploads (allegato della chat, fonte di una bozza ripresa). */
  scaricaCaricato(path: string, nome: string, mime?: string | null): Promise<File>;
  /** Un indirizzo per aprire un documento che il browser non scarica da sé (la ⓘ). */
  apriDocumento(documento: RifDocumento, companyId: string): Promise<string>;
  chat(r: RichiestaChat): Promise<RispostaChat>;
  saldoAI(companyId: string): Promise<SaldoAI>;
  /** La dettatura: l'audio diventa testo (`trascrizione-audio`). */
  trascrivi(audio: Blob): Promise<string>;
  /** Il client delle bozze e delle RPC (`bozze.ts`). */
  db: ClientBozze;
}

async function invoca<T>(funzione: string, body: Record<string, unknown> | FormData): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funzione, { body });
  if (error) throw new Error(await readInvokeError(error));
  return data as T;
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
  leggiRemoto: (documento, meta, opz) => leggiDocumentoRemoto(documento, meta, opz),
  elencaComputi: elencaComputiCloud,
  registraCorrezioni,
  frammentiCommessa: leggiFrammentiCommessa,
  elencaAllegati: elencaAllegatiCommessa,
  scaricaAllegato: scaricaAllegatoCommessa,
  frammentoContratto: leggiFrammentoContratto,
  scaricaCaricato: async (path, nome, mime) => {
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTI_COMMESSA).download(path);
    if (error || !data) throw new Error("Documento non trovato: forse è stato tolto.");
    return new File([data], nome, { type: mime || data.type || "" });
  },
  apriDocumento: async (documento, companyId) => {
    const r = await invoca<{ url?: string }>("silvio-commessa", { modo: "apri", company_id: companyId, documento });
    if (!r?.url) throw new Error("Non riesco ad aprire il documento.");
    return r.url;
  },
  chat: async (r) => {
    const risposta = await invoca<{ testo?: string; strumenti?: ChiamataStrumento[]; costo_eur?: number }>("silvio-commessa", {
      modo: "chat", company_id: r.companyId, messaggio: r.messaggio, contesto: r.contesto, storia: r.storia, richiesta_id: r.richiestaId,
    });
    return { testo: risposta?.testo ?? "", strumenti: Array.isArray(risposta?.strumenti) ? risposta.strumenti : [], costoEur: Number(risposta?.costo_eur) || 0 };
  },
  // Come useWallets: il saldo in euro è uno solo, e ai_credits dice se le chiamate AI sono ferme.
  saldoAI: async (companyId) => {
    const [pool, ai] = await Promise.all([
      supabase.from("company_credit_pool").select("balance_eur").eq("company_id", companyId).maybeSingle(),
      supabase.from("ai_credits").select("balance_eur, free_balance_eur, calls_blocked").eq("company_id", companyId).maybeSingle(),
    ]);
    const p = pool.data as { balance_eur?: number | null } | null;
    const a = ai.data as { balance_eur?: number | null; free_balance_eur?: number | null; calls_blocked?: boolean | null } | null;
    if (pool.error && ai.error) return { saldoEur: null, bloccato: false };
    const saldo = (Number(p?.balance_eur ?? a?.balance_eur) || 0) + (Number(a?.free_balance_eur) || 0);
    return { saldoEur: p || a ? saldo : null, bloccato: !!a?.calls_blocked };
  },
  trascrivi: async (audio) => {
    const fd = new FormData();
    const ext = audio.type.includes("mp4") || audio.type.includes("aac") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", audio, `audio.${ext}`);
    fd.append("language", "it");
    const r = await invoca<{ testo?: string }>("trascrizione-audio", fd);
    if (!r?.testo?.trim()) throw new Error("Non ho capito l'audio: riprova, o scrivi.");
    return r.testo.trim();
  },
  // Le tabelle nuove non sono ancora nei tipi generati: si passa da un client senza tipi.
  db: supabase as unknown as ClientBozze,
};
