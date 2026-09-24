/**
 * Il profilo WhatsApp di un numero (foto, info, descrizione, indirizzo, email,
 * siti, categoria), letto e salvato direttamente su WhatsApp dalla funzione
 * `whatsapp-profilo`. Le regole dei campi: _shared/profiloWhatsApp.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ErroriProfilo, ProfiloWhatsApp } from "../../../supabase/functions/_shared/profiloWhatsApp";
import type { FotoProfiloPronta } from "@/lib/whatsapp/fotoProfiloWhatsApp";

export interface NomeWhatsApp {
  verificato: string | null;
  /** Revisione del nome da parte di Meta (APPROVED, PENDING_REVIEW, DECLINED…). */
  stato: string | null;
}

export interface DatiProfiloWhatsApp {
  profilo: ProfiloWhatsApp;
  nome: NomeWhatsApp | null;
}

/** L'errore della funzione, con gli errori dei singoli campi se ci sono. */
export class ErroreProfiloWhatsApp extends Error {
  errori: ErroriProfilo;

  constructor(messaggio: string, errori: ErroriProfilo = {}) {
    super(messaggio);
    this.name = "ErroreProfiloWhatsApp";
    this.errori = errori;
  }
}

async function chiama<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-profilo", { body });
  if (error) {
    let messaggio = error.message || "Errore imprevisto";
    let errori: ErroriProfilo = {};
    try {
      const contesto = (error as { context?: Response }).context;
      if (contesto && typeof contesto.json === "function") {
        const corpo = await contesto.json();
        if (typeof corpo?.error === "string") messaggio = corpo.error;
        if (corpo?.errori && typeof corpo.errori === "object") errori = corpo.errori as ErroriProfilo;
      }
    } catch {
      // corpo non leggibile: resta il messaggio generico
    }
    throw new ErroreProfiloWhatsApp(messaggio, errori);
  }
  if (data?.error) throw new ErroreProfiloWhatsApp(String(data.error), data.errori ?? {});
  return data as T;
}

export const chiaveProfiloWhatsApp = (companyId: string | null, waNumberId: string | null) =>
  ["wa", "profilo", companyId, waNumberId] as const;

export function useProfiloWhatsApp(companyId: string | null, waNumberId: string | null, attivo: boolean) {
  return useQuery({
    queryKey: chiaveProfiloWhatsApp(companyId, waNumberId),
    enabled: attivo && !!companyId && !!waNumberId,
    queryFn: () =>
      chiama<DatiProfiloWhatsApp>({ azione: "leggi", company_id: companyId, wa_number_id: waNumberId }),
    staleTime: 30_000,
    retry: false,
  });
}

function useAggiornaProfilo(companyId: string | null, waNumberId: string | null) {
  const qc = useQueryClient();
  return (profilo: ProfiloWhatsApp) =>
    qc.setQueryData<DatiProfiloWhatsApp>(chiaveProfiloWhatsApp(companyId, waNumberId), (prec) =>
      prec ? { ...prec, profilo } : { profilo, nome: null },
    );
}

export function useSalvaProfiloWhatsApp(companyId: string | null, waNumberId: string | null) {
  const aggiorna = useAggiornaProfilo(companyId, waNumberId);
  return useMutation({
    mutationFn: (profilo: ProfiloWhatsApp) =>
      chiama<{ profilo: ProfiloWhatsApp; invariato?: boolean }>({
        azione: "salva",
        company_id: companyId,
        wa_number_id: waNumberId,
        profilo,
      }),
    onSuccess: (dati) => aggiorna(dati.profilo),
  });
}

export function useFotoProfiloWhatsApp(companyId: string | null, waNumberId: string | null) {
  const aggiorna = useAggiornaProfilo(companyId, waNumberId);
  return useMutation({
    mutationFn: (foto: FotoProfiloPronta) =>
      chiama<{ profilo: ProfiloWhatsApp }>({
        azione: "foto",
        company_id: companyId,
        wa_number_id: waNumberId,
        foto: { base64: foto.base64, tipo: foto.tipo },
      }),
    onSuccess: (dati) => aggiorna(dati.profilo),
  });
}
