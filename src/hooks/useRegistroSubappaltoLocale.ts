import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCachedTokens } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";
import { registroVuoto, type ArchivioSubappalto, type OperazioneSubappalto, type RegistroSubappalto } from "@/lib/subappaltatori/richiesteDaLavorazioni";

type RispostaRpc = { data: ArchivioSubappalto | null; error: { message: string; code: string } | null };
type RpcRegistro = (
  funzione: "registro_subappalto", parametri: { p_azienda: string; p_commessa: string; p_operazione: OperazioneSubappalto | null },
) => PromiseLike<RispostaRpc>;

class ErroreArchivio extends Error {
  constructor(readonly stato: number, messaggio: string) { super(messaggio); }
}

function registroNelBrowser(chiave: string) {
  try {
    const originale = window.localStorage.getItem(chiave);
    if (!originale) return null;
    const registro = JSON.parse(originale) as RegistroSubappalto;
    return Array.isArray(registro?.richieste) && Array.isArray(registro?.interne) ? { originale, registro } : null;
  } catch {
    return null;
  }
}

export function useRegistroSubappaltoLocale(companyId: string, orderId: string, userId: string | undefined) {
  const disponibile = !!userId;
  const demoIsolata = import.meta.env.DEV && import.meta.env.VITE_CANTIERE_ISOLATO === "true";
  const chiave = ["registro-subappalto-locale", companyId, orderId, userId] as const;
  const chiavePrecedente = `eic:subappalto:v1:${userId}:${companyId}:${orderId}`;
  const qc = useQueryClient();

  async function richiesta(op?: OperazioneSubappalto): Promise<ArchivioSubappalto> {
    if (!demoIsolata) {
      const rpcRegistro = supabase.rpc.bind(supabase) as unknown as RpcRegistro;
      const { data, error } = await withClientTimeout(Promise.resolve(rpcRegistro("registro_subappalto", {
        p_azienda: companyId, p_commessa: orderId, p_operazione: op ?? null,
      })), "Archivio subappalto", 15_000);
      if (error || !data) throw new ErroreArchivio((error?.code === "PT409" || error?.code === "40001") ? 409 : 503, error?.message ?? "Archivio di subappalto non disponibile.");
      return data;
    }
    let token = getCachedTokens().accessToken;
    if (!token) {
      const { data } = await withClientTimeout(supabase.auth.getSession(), "Sessione subappalto", 5000);
      token = data.session?.access_token ?? null;
    }
    if (!token) throw new Error("Accedi per leggere l’archivio della commessa.");
    const parametri = new URLSearchParams({ azienda: companyId, commessa: orderId });
    const risposta = await fetch(`/api/locale/registro-subappalto?${parametri}`, {
      cache: "no-store", method: op ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: op ? JSON.stringify(op) : undefined,
    });
    if (!risposta.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Archivio di subappalto non disponibile sul server locale.");
    }
    const dati = await risposta.json();
    if (!risposta.ok) throw new ErroreArchivio(risposta.status, dati.errore ?? "Archivio di subappalto non disponibile.");
    return dati as ArchivioSubappalto;
  }

  const query = useQuery({
    queryKey: chiave, enabled: disponibile, retry: false, staleTime: 5000,
    refetchOnWindowFocus: "always", meta: { volatile: true },
    structuralSharing: (precedente: ArchivioSubappalto | undefined, nuova: ArchivioSubappalto) =>
      precedente && precedente.versione > nuova.versione ? precedente : nuova,
    queryFn: async () => {
      const attuale = await richiesta();
      const precedente = demoIsolata ? registroNelBrowser(chiavePrecedente) : null;
      if (!precedente) return attuale;
      const daImportare = precedente.registro.richieste.length || precedente.registro.interne.length;
      const archivio = daImportare ? await richiesta({ tipo: "importa", registro: precedente.registro }) : attuale;
      try {
        if (window.localStorage.getItem(chiavePrecedente) === precedente.originale) window.localStorage.removeItem(chiavePrecedente);
      } catch { /* L'importazione resta ripetibile per ID. */ }
      return archivio;
    },
  });

  const modifica = useMutation({
    mutationFn: richiesta,
    onSuccess: (dati) => qc.setQueryData<ArchivioSubappalto>(chiave, (precedente) =>
      precedente && precedente.versione > dati.versione ? precedente : dati),
    onError: (e) => { if (e instanceof ErroreArchivio && e.stato === 409) void qc.invalidateQueries({ queryKey: chiave }); },
  });
  return {
    disponibile, registro: query.data ?? registroVuoto,
    carica: disponibile && query.isPending, errore: disponibile ? query.error : null,
    riprova: query.refetch, aggiorna: modifica.mutateAsync, salvaInCorso: modifica.isPending,
  };
}
