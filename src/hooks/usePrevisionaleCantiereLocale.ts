import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCachedTokens } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";
import type { DisponibilitaCantiere } from "@/lib/orders/disponibilitaCantiere";
import { preparaPiani } from "@/lib/orders/calcolaPrevisionaleCantiere";
import { disponibilitaAltriCantieri } from "@/lib/orders/leggiDisponibilitaCantiere";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArchivioPrevisto, BozzaPrevisto, PianoPrevisto } from "@/lib/orders/previsionaleSalvato";

class ErroreArchivio extends Error {
  constructor(readonly stato: number, messaggio: string) { super(messaggio); }
}
const VUOTO: ArchivioPrevisto = { versione: 0, piani: [] };

export function usePrevisionaleCantiereLocale(orderId: string, permesso: boolean) {
  const { user, effectiveCompany } = useAuth();
  const azienda = effectiveCompany?.id;
  const disponibile = permesso && !!azienda && !!user?.id;
  const chiave = ["previsionale-cantiere-locale", azienda, orderId, user?.id] as const;
  const qc = useQueryClient();

  async function richiesta<T = ArchivioPrevisto>(body?: object, disponibilita = false): Promise<T> {
    if (import.meta.env.VITE_CANTIERE_ISOLATO !== "true") {
      type Richiesta = { bozza?: BozzaPrevisto; togli?: string; versione: number; operazione: string };
      const query = supabase.rpc.bind(supabase) as unknown as (nome: string, parametri: object) =>
        PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
      const rpc = async (op: object | null) => {
        const { data, error } = await withClientTimeout(Promise.resolve(query("previsionale_cantiere", {
          p_azienda: azienda, p_commessa: orderId, p_operazione: op,
        })), "Previsionale", 15_000);
        if (error) throw new ErroreArchivio(error.code === "40001" ? 409 : 503, error.message);
        return data;
      };
      if (disponibilita) {
        const dati = body as { persone: string[]; dal: string; al: string };
        const altri = await rpc({ tipo: "disponibilita", dal: dati.dal, al: dati.al }) as Array<{ commessa: string; piani: PianoPrevisto[] }>;
        return await disponibilitaAltriCantieri(supabase as unknown as SupabaseClient, azienda!, orderId, dati, altri) as T;
      }
      const bozza = body as Richiesta | undefined;
      const nuovi = bozza?.bozza ? await preparaPiani(supabase as unknown as SupabaseClient, azienda!, orderId, bozza.bozza) : [];
      return await rpc(bozza ? { versione: bozza.versione, operazione: bozza.operazione, togli: bozza.togli, nuovi } : null) as T;
    }
    let token = getCachedTokens().accessToken;
    if (!token) {
      const { data } = await withClientTimeout(supabase.auth.getSession(), "Sessione previsionale", 5000);
      token = data.session?.access_token ?? null;
    }
    if (!token) throw new Error("Accedi per consultare il previsionale.");
    const query = new URLSearchParams({ azienda: azienda ?? "", commessa: orderId });
    if (disponibilita) query.set("lettura", "disponibilita");
    const response = await fetch(`/api/locale/previsionale-cantiere?${query}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000), cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) throw new ErroreArchivio(response.status, json.errore ?? "Previsionale locale non disponibile.");
    return json as T;
  }

  const query = useQuery({
    queryKey: chiave,
    enabled: disponibile,
    queryFn: () => richiesta(),
    staleTime: 15_000,
    retry: false,
    // Le tariffe salvate restano sul server locale e nella memoria della vista corrente.
    meta: { volatile: true },
  });

  async function cambia(dati: { bozza: BozzaPrevisto } | { togli: string }, operazione: string) {
    if (!disponibile || !query.data) throw new Error("Rileggi il previsionale prima di salvarlo.");
    try {
      const archivio = await richiesta({ ...dati, operazione, versione: query.data.versione });
      qc.setQueryData(chiave, archivio);
    } catch (e) {
      if (e instanceof ErroreArchivio && e.stato === 409) void qc.invalidateQueries({ queryKey: chiave });
      throw e;
    }
  }
  return {
    disponibile,
    chiaveDisponibilita: ["cantiere-disponibilita", azienda, orderId, user?.id] as const,
    disponibilita: (dati: { persone: string[]; dal: string; al: string }) => richiesta<DisponibilitaCantiere>(dati, true),
    archivio: disponibile ? query.data ?? VUOTO : VUOTO,
    carica: disponibile && query.isPending,
    errore: disponibile && query.isError ? query.error : null,
    riprova: query.refetch,
    salva: (bozza: BozzaPrevisto, operazione: string) => cambia({ bozza }, operazione),
    togli: (togli: string, operazione: string) => cambia({ togli }, operazione),
  };
}
