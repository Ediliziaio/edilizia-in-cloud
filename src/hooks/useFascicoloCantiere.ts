import { leggiSdsAziendali } from "./useSdsAziendali";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { readAllPages } from "@/lib/personale/readAllPages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import type {
  AmbitoFascicolo,
  IncaricoSicurezza,
  OperaioEsterno,
  AssegnazioneEsterna,
  EvidenzaFascicolo,
  FaseFascicolo,
} from "@/lib/sicurezza/fascicolo";

type Tabella =
  | "sicurezza_incarichi"
  | "subappaltatori_operai"
  | "subappaltatori_assegnazioni"
  | "sicurezza_fascicolo";
export const chiaviFascicolo = ["fascicolo-cantiere"] as const;
function pagine<T>(q: {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: unknown }>;
}) {
  return readAllPages((from, to) => q.range(from, to));
}

function useElenco<T>(tabella: Tabella, ambito: AmbitoFascicolo, sdsAziendali=false) {
  const perms = usePermissions();
  return useQuery({
    queryKey: sdsAziendali ? ["sds-aziendali",ambito.companyId] : [
      ...chiaviFascicolo,
      tabella,
      ambito.companyId,
      ambito.subId,
      ambito.orderId,
    ],
    enabled:
      !!ambito.companyId &&
      !!(sdsAziendali || ambito.subId || ambito.orderId) &&
      perms.canViewSicurezzaCantiere,
    queryFn: async (): Promise<T[]> => {
      if(sdsAziendali)return await leggiSdsAziendali(ambito.companyId) as unknown as T[];
      let q = supabase
        .from(tabella as never)
        .select("*")
        .eq("company_id", ambito.companyId);
      if (ambito.subId) q = q.eq("subappaltatore_id", ambito.subId);
      if (ambito.orderId) q = q.eq("order_id", ambito.orderId);
      return (await pagine(
        q.order("created_at", { ascending: false }).order("id"),
      )) as unknown as T[];
    },
  });
}
export const useIncarichiCantiere = (a: AmbitoFascicolo) =>
  useElenco<IncaricoSicurezza>("sicurezza_incarichi", a);
export const useOperaiEsterni = (a: AmbitoFascicolo) =>
  useElenco<OperaioEsterno>("subappaltatori_operai", a);
export const useAssegnazioniEsterne = (a: AmbitoFascicolo) =>
  useElenco<AssegnazioneEsterna>("subappaltatori_assegnazioni", a);
export const useEvidenzeFascicolo = (a: AmbitoFascicolo & {sdsAziendali?:boolean}) =>
  useElenco<EvidenzaFascicolo>("sicurezza_fascicolo", a, a.sdsAziendali===true);
export function useCommesseFascicolo(companyId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: [...chiaviFascicolo, "commesse", companyId],
    enabled: !!companyId && p.canViewSicurezzaCantiere,
    queryFn: async () => {
      return pagine(
        supabase
          .from("orders")
          .select("id,order_code,description")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id"),
      );
    },
  });
}

export function useFasiFascicolo(companyId:string,orderId?:string) {
 const p=usePermissions();
 return useQuery({queryKey:[...chiaviFascicolo,"fasi",companyId,orderId],enabled:!!companyId&&!!orderId&&p.canViewSicurezzaCantiere,queryFn:async():Promise<FaseFascicolo[]>=>{
  return await pagine(supabase.from("order_work_phases").select("id,company_id,order_id,name,start_date,end_date").eq("company_id",companyId).eq("order_id",orderId!).order("position").order("id")) as FaseFascicolo[];
 }});
}

export function useScriviFascicolo(tabella: Tabella, companyId: string) {
  const qc = useQueryClient();
  const perms = usePermissions();
  return useMutation({
    mutationFn: async ({
      id,
      ...campi
    }: Record<string, unknown> & { id?: string }) => {
      if (!companyId || !perms.canViewSicurezzaCantiere || perms.solaLettura)
        throw new Error("Non hai il permesso di modificare il fascicolo.");
      // Callers cannot change the tenant or supply server verification stamps.
      const {
        company_id: _company,
        verificato_da: _verificatore,
        verificato_il: _verificatoIl,
        ...dati
      } = campi;
      const query = id
        ? supabase
            .from(tabella as never)
            .update(dati as never)
            .eq("id", id)
            .eq("company_id", companyId)
        : supabase
            .from(tabella as never)
            .insert({ ...dati, company_id: companyId } as never);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      if (!data) throw new Error("La modifica non è stata salvata.");
      return data as unknown as { id: string };
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: chiaviFascicolo }),qc.invalidateQueries({queryKey:["sicurezza-documenti",companyId]}),qc.invalidateQueries({queryKey:["qualifiche-addetto",companyId]}),qc.invalidateQueries({queryKey:["addetti-qualifiche-commessa",companyId]}), qc.invalidateQueries({ queryKey: ["pos-riesame-proprio", companyId] }),qc.invalidateQueries({queryKey:['sub-dpi-quadro',companyId]}),qc.invalidateQueries({queryKey:['sicurezza-prodotti',companyId]}),qc.invalidateQueries({queryKey:['sds-aziendali',companyId]}),qc.invalidateQueries({queryKey:['pos-documenti-tecnici',companyId]})]),
  });
}
export async function caricaFileFascicolo(
  companyId: string,
  id: string,
  file: File,
) {
  const tipi = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!tipi.includes(file.type) || file.size > 15 * 1024 * 1024)
    throw new Error("Scegli un PDF o un’immagine fino a 15 MB.");
  const path = `${companyId}/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;
  const { error } = await supabase.storage
    .from("fascicoli-cantiere")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}
export const apriFileFascicolo = (path: string) =>
  apriFileRiservato("fascicoli-cantiere", path);

/** Explicit links only: contract, legacy site link or dated worker assignment. */
export function useImpreseCommessa(companyId: string, orderId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: [...chiaviFascicolo, "imprese-commessa", companyId, orderId],
    enabled: !!companyId && !!orderId && p.canViewSicurezzaCantiere,
    queryFn: async () => {
      const [contratti, diretti, assegnazioni] = await Promise.all([
        pagine(
          supabase
            .from("contratti_subappalto" as never)
            .select("subappaltatore_id")
            .eq("company_id", companyId)
            .eq("order_id", orderId)
            .order("id"),
        ),
        pagine(
          supabase
            .from("subappaltatori_sicurezza")
            .select("id")
            .eq("company_id", companyId)
            .eq("order_id", orderId)
            .order("id"),
        ),
        pagine(
          supabase
            .from("subappaltatori_assegnazioni" as never)
            .select("*")
            .eq("company_id", companyId)
            .eq("order_id", orderId)
            .order("id"),
        ),
      ]);
      const a = assegnazioni as unknown as AssegnazioneEsterna[];
      const ids = [
        ...new Set([
          ...(contratti as unknown as { subappaltatore_id: string }[]).map(
            (c) => c.subappaltatore_id,
          ),
          ...diretti.map((s) => s.id),
          ...a.map((s) => s.subappaltatore_id),
        ]),
      ];
      if (!ids.length)
        return {
          imprese: [],
          operai: [] as OperaioEsterno[],
          assegnazioni: a,
          evidenze: [] as EvidenzaFascicolo[],
        };
      const [imprese, operai, evidenze] = await Promise.all([
        pagine(
          supabase
            .from("subappaltatori_sicurezza")
            .select("id,ragione_sociale,durc_scadenza")
            .eq("company_id", companyId)
            .in("id", ids)
            .order("ragione_sociale")
            .order("id"),
        ),
        pagine(
          supabase
            .from("subappaltatori_operai" as never)
            .select("*")
            .eq("company_id", companyId)
            .in("subappaltatore_id", ids)
            .order("id"),
        ),
        pagine(
          supabase
            .from("sicurezza_fascicolo" as never)
            .select("*")
            .eq("company_id", companyId)
            .in("subappaltatore_id", ids)
            .order("id"),
        ),
      ]);
      return {
        imprese,
        operai: operai as unknown as OperaioEsterno[],
        assegnazioni: a,
        evidenze: evidenze as unknown as EvidenzaFascicolo[],
      };
    },
  });
}

export function useFigurePerIncarico(companyId: string, enabled: boolean) {
  const p = usePermissions();
  return useQuery({
    queryKey: [...chiaviFascicolo, "figure-aziendali", companyId],
    enabled: enabled && !!companyId && p.canViewSicurezzaCantiere,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sicurezza_figure")
        .select(
          "id,ruolo,nominativo,telefono,email,mansioni_sicurezza,scadenza",
        )
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("nominativo");
      if (error) throw error;
      return data ?? [];
    },
  });
}
