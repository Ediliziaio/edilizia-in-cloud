// src/hooks/useGeneraleRendiconto.ts
// Il dossier di rendicontazione della commessa generale: legge i numeri dai moduli con i
// loro hook (stesse chiavi di cache: aprire il dialogo dopo le schede è immediato), le foto
// recenti di rapportini e diario delle figlie, lo storico degli invii e l'invio per email
// (edge function generale-dossier-invia). Ogni modulo si legge solo se il modello lo usa e
// chi guarda ha il permesso: quello che non si legge non può finire nel dossier.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { useGeneraleInvestitori } from "@/hooks/useGeneraleInvestitori";
import { useFotografieGenerale, useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useUnitaGenerale as useElencoUnita } from "@/hooks/useGeneraleUnita";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { moduliDelModello } from "@/lib/orders/generali/moduli";
import {
  giornoIt,
  type AziendaDossier, type FotoDossier, type InputDossier, type LivelloDossier, type ModelloDossier, type SezioneDossier,
} from "@/lib/orders/generali/rendiconto";

// Tabelle, bucket e funzione nuovi, non ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviDossier = {
  storico: (generaleId: string | undefined) => ["generale-dossier", generaleId] as const,
  foto: (generaleId: string | undefined, ids: string) => ["generale-dossier-foto", generaleId, ids] as const,
  azienda: (companyId: string | undefined) => ["generale-dossier-azienda", companyId] as const,
};

const oggiIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** I dati dell'azienda per la copertina. */
export function useAziendaDossier() {
  const { effectiveCompany } = useAuth();
  return useQuery({
    queryKey: chiaviDossier.azienda(effectiveCompany?.id),
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AziendaDossier> => {
      const { data } = await supabase
        .from("companies")
        .select("name, vat_number, address, city, postal_code, province, phone, email, logo_url")
        .eq("id", effectiveCompany!.id)
        .maybeSingle();
      const a = (data ?? {}) as Record<string, string | null>;
      const luogo = [a.postal_code, a.city, a.province ? `(${a.province})` : null].filter(Boolean).join(" ");
      return {
        nome: a.name ?? effectiveCompany?.name ?? "La tua impresa",
        partitaIva: a.vat_number ?? null,
        indirizzo: [a.address, luogo].filter(Boolean).join(", ") || null,
        email: a.email ?? null,
        telefono: a.phone ?? null,
        logo: a.logo_url ?? null,
      };
    },
  });
}

/** Una foto candidata al dossier: `src` è l'indirizzo (firmato o pubblico) da cui scaricarla. */
export interface FotoCandidata extends FotoDossier { id: string; fonte: "diario" | "rapportino" }

/** Le foto più recenti di rapportini e diario delle figlie (e della generale), al massimo 24. */
export function useFotoDossier(r: RiepilogoGenerale, enabled = true) {
  const { effectiveCompany } = useAuth();
  const ids = useMemo(() => [r.generale.id, ...r.figlie.map((f) => f.id)], [r.generale.id, r.figlie]);
  const nomi = useMemo(() => new Map(r.figlie.map((f) => [f.id, f.codice ?? f.nome])), [r.figlie]);
  return useQuery({
    queryKey: chiaviDossier.foto(r.generale.id, ids.join(",")),
    enabled: enabled && !!effectiveCompany?.id,
    staleTime: 5 * 60_000,
    meta: { silent: true },
    queryFn: async (): Promise<FotoCandidata[]> => {
      const [diario, rapportini] = await Promise.all([
        db.from("foto_cantiere")
          .select("id, order_id, descrizione, storage_path, thumbnail_path, taken_at")
          .in("order_id", ids)
          .eq("company_id", effectiveCompany!.id)
          .order("taken_at", { ascending: false })
          .limit(24),
        db.from("campo_rapportini")
          .select("id, order_id, data_lavoro, descrizione_lavori, foto_urls")
          .in("order_id", ids)
          .eq("company_id", effectiveCompany!.id)
          .not("foto_urls", "is", null)
          .order("data_lavoro", { ascending: false })
          .limit(24),
      ]);
      const foto: FotoCandidata[] = [];
      const righeDiario = Array.isArray(diario.data) ? (diario.data as Record<string, string | null>[]) : [];
      if (righeDiario.length > 0) {
        const percorsi = righeDiario.map((x) => x.storage_path ?? "").filter(Boolean);
        const { data: firmati } = await supabase.storage.from("foto-cantiere").createSignedUrls(percorsi, 3600);
        const link = new Map((firmati ?? []).map((f) => [f.path, f.signedUrl]));
        for (const x of righeDiario) {
          const src = x.storage_path ? link.get(x.storage_path) : null;
          if (!src) continue;
          const data = x.taken_at?.slice(0, 10) ?? null;
          foto.push({
            id: `d-${x.id}`, fonte: "diario", src, data,
            didascalia: [nomi.get(x.order_id ?? "") ?? null, x.descrizione, giornoIt(data)].filter(Boolean).join(" · "),
          });
        }
      }
      const righeRapp = Array.isArray(rapportini.data) ? (rapportini.data as Record<string, unknown>[]) : [];
      for (const x of righeRapp) {
        const urls = Array.isArray(x.foto_urls) ? (x.foto_urls as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)) : [];
        const data = typeof x.data_lavoro === "string" ? x.data_lavoro.slice(0, 10) : null;
        const testo = typeof x.descrizione_lavori === "string" ? x.descrizione_lavori.slice(0, 60) : null;
        urls.slice(0, 4).forEach((src, i) => foto.push({
          id: `r-${x.id}-${i}`, fonte: "rapportino", src, data,
          didascalia: [nomi.get(String(x.order_id)) ?? null, testo ? `rapportino: ${testo}` : "rapportino", giornoIt(data)].filter(Boolean).join(" · "),
        }));
      }
      return foto.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")).slice(0, 24);
    },
  });
}

/**
 * Una foto pronta per il PDF: scaricata, ridotta a 1200 px e ricompressa in JPEG, così il
 * dossier resta leggero abbastanza per l'email. null se non si scarica (link scaduto, CORS).
 */
export async function fotoPerPdf(src: string, lato = 1200): Promise<string | null> {
  try {
    const risposta = await fetch(src);
    if (!risposta.ok) return null;
    const bitmap = await createImageBitmap(await risposta.blob());
    const scala = Math.min(1, lato / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scala));
    canvas.height = Math.max(1, Math.round(bitmap.height * scala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/**
 * Tutto quello che serve a comporre il dossier, dai moduli. `input` è senza le scelte di chi
 * genera (sezioni, periodo, note, foto): le aggiunge il dialogo.
 */
export function useDatiDossier(r: RiepilogoGenerale) {
  const moduli = moduliDelModello(r.generale.modello);
  const id = r.generale.id;
  const margini = r.permessi.margini;
  const conPiano = moduli.includes("piano") && margini;
  const conInvestitori = moduli.includes("investitori") && margini;

  const piano = useGeneralePianoNumeri(r, { enabled: conPiano });
  const fotografie = useFotografieGenerale(id, conPiano);
  const investitori = useGeneraleInvestitori(r, { enabled: conInvestitori });
  const unita = useElencoUnita(moduli.includes("unita") ? id : undefined);
  const contratto = useDatiContratto(id, moduli.includes("contratto") && r.permessi.importi);
  const documenti = useChecklistGenerale(r);
  const azienda = useAziendaDossier();

  const input = useMemo((): Omit<InputDossier, "periodo" | "modello" | "sezioni" | "foto" | "note"> | null => {
    if (!azienda.data) return null;
    return {
      oggi: oggiIso(),
      riepilogo: r,
      azienda: azienda.data,
      piano: conPiano ? piano.piano : null,
      versionePiano: conPiano ? piano.inVista : null,
      fotografie: conPiano && Array.isArray(fotografie.data) ? fotografie.data : null,
      conti: conInvestitori && investitori.fonti.length > 0 ? investitori.conti : null,
      unita: unita.data ?? null,
      contratto: contratto.data ?? null,
      checklist: moduli.includes("documenti") ? documenti.checklist : null,
    };
  }, [azienda.data, r, conPiano, piano.piano, piano.inVista, fotografie.data, conInvestitori, investitori.fonti.length, investitori.conti, unita.data, contratto.data, moduli, documenti.checklist]);

  const isLoading = azienda.isLoading
    || (conPiano && (piano.isLoading || fotografie.isLoading))
    || (conInvestitori && investitori.isLoading)
    || (moduli.includes("unita") && unita.isLoading)
    || (moduli.includes("contratto") && r.permessi.importi && contratto.isLoading)
    || documenti.isLoading;

  return { input, isLoading };
}

// ── Storico ────────────────────────────────────────────────────────────────

export interface DossierInviato {
  id: string;
  modello: ModelloDossier | "personalizzato";
  titolo: string;
  sezioni: SezioneDossier[];
  livello: LivelloDossier;
  destinatari: string[];
  oggetto: string;
  stato: "in_invio" | "inviato" | "parziale" | "fallito";
  esiti: { a: string; ok: boolean; errore: string | null }[];
  errore: string | null;
  pdfPath: string | null;
  xlsxPath: string | null;
  creatoIl: string;
  inviatoIl: string | null;
}

const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function leggiStoricoDossier(data: unknown): DossierInviato[] {
  const righe = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return righe
    .filter((r) => typeof r?.id === "string")
    .map((r) => ({
      id: r.id as string,
      modello: r.modello === "banca" || r.modello === "soci" || r.modello === "completo" ? r.modello : "personalizzato",
      titolo: testo(r.titolo) ?? "Rendiconto",
      sezioni: Array.isArray(r.sezioni) ? (r.sezioni as SezioneDossier[]) : [],
      livello: r.livello === "base" || r.livello === "importi" ? r.livello : "margini",
      destinatari: Array.isArray(r.destinatari) ? (r.destinatari as unknown[]).filter((x): x is string => typeof x === "string") : [],
      oggetto: testo(r.oggetto) ?? "",
      stato: r.stato === "inviato" || r.stato === "parziale" || r.stato === "fallito" ? r.stato : "in_invio",
      esiti: Array.isArray(r.esiti)
        ? (r.esiti as Record<string, unknown>[]).map((e) => ({ a: String(e?.a ?? ""), ok: e?.ok === true, errore: testo(e?.errore) }))
        : [],
      errore: testo(r.errore),
      pdfPath: testo(r.pdf_path),
      xlsxPath: testo(r.xlsx_path),
      creatoIl: testo(r.created_at) ?? "",
      inviatoIl: testo(r.inviato_at),
    }));
}

/** Gli invii fatti: la RLS mostra solo quelli che chi guarda può riaprire. Tabella assente: elenco vuoto. */
export function useStoricoDossier(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviDossier.storico(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<DossierInviato[]> => {
      const { data, error } = await db
        .from("generale_dossier")
        .select("id, modello, titolo, sezioni, livello, destinatari, oggetto, stato, esiti, errore, pdf_path, xlsx_path, created_at, inviato_at")
        .eq("generale_id", generaleId)
        .order("created_at", { ascending: false })
        .limit(100);
      // La tabella non c'è ancora (migrazione non applicata): nessuno storico, nessun errore.
      if (error?.code === "42P01" || error?.code === "PGRST205") return [];
      if (error) throw error;
      return leggiStoricoDossier(data);
    },
  });
}

/** Un link temporaneo per riaprire un file dello storico. */
export async function linkFileDossier(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("generale-dossier").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("File non trovato");
  return data.signedUrl;
}

// ── Invio ──────────────────────────────────────────────────────────────────

export interface InvioDossier {
  destinatari: string[];
  subject: string;
  message: string;
  modello: ModelloDossier | "personalizzato";
  titolo: string;
  sezioni: SezioneDossier[];
  periodo: { dal: string | null; al: string };
  filename: string;
  pdf: Blob;
  excel: { filename: string; dati: Blob } | null;
  numeri: unknown;
}

export async function base64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Manda il dossier (edge function generale-dossier-invia). Solo su un clic esplicito di «Invia». */
export function useInviaDossier(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: InvioDossier) => {
      const { data, error } = await supabase.functions.invoke("generale-dossier-invia", {
        body: {
          generale_id: generaleId,
          destinatari: r.destinatari,
          subject: r.subject,
          message: r.message,
          modello: r.modello,
          titolo: r.titolo,
          sezioni: r.sezioni,
          periodo_dal: r.periodo.dal,
          periodo_al: r.periodo.al,
          filename: r.filename,
          pdf_base64: await base64(r.pdf),
          xlsx_filename: r.excel?.filename,
          xlsx_base64: r.excel ? await base64(r.excel.dati) : undefined,
          numeri: r.numeri,
        },
      });
      if (error) {
        // Il messaggio scritto dalla funzione sta nel corpo della risposta.
        const ctx = (error as { context?: Response }).context;
        const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch((): null => null) : null;
        throw new Error((corpo as { error?: string } | null)?.error ?? "Invio non riuscito. Riprova tra poco.");
      }
      return data as { id: string; stato: string; esiti: { a: string; ok: boolean; errore: string | null }[] };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: chiaviDossier.storico(generaleId) }),
  });
}
