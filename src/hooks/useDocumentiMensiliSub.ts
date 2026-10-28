import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  TIPI_MENSILI,
  meseValido,
  type DocumentoMensile,
  type TipoMensile,
} from "@/lib/sicurezza/documentiMensili";
export const chiaviMensili = ["subappalto-documenti-mensili"] as const;
export const BUCKET_MENSILI = "subappaltatori-amministrazione";
export function useMensiliSub(
  companyId: string,
  subId: string,
  contrattoId: string,
  mese: string,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: [...chiaviMensili, companyId, subId, contrattoId, mese],
    enabled:
      !!companyId &&
      !!subId &&
      !!contrattoId &&
      meseValido(mese) &&
      p.canViewSubappaltatoriAmministrazione,
    queryFn: async () => {
      const data = await readAllPages((from, to) =>
        supabase
          .from("subappaltatori_documenti_mensili" as never)
          .select("*")
          .eq("company_id", companyId)
          .eq("subappaltatore_id", subId)
          .eq("contratto_id", contrattoId)
          .eq("competenza", mese)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      );
      return data as unknown as DocumentoMensile[];
    },
  });
}
export function useSalvaMensileSub(companyId: string, subId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      campi: Partial<DocumentoMensile> & {
        contratto_id: string;
        competenza: string;
        tipo: TipoMensile;
      },
    ) => {
      if (
        !companyId ||
        !p.canViewSubappaltatoriAmministrazione ||
        p.solaLettura
      )
        throw new Error(
          "Non hai il permesso di modificare i documenti amministrativi.",
        );
      const {
        id,
        company_id: _azienda,
        subappaltatore_id: _sub,
        verificato_da: _autore,
        verificato_il: _quando,
        updated_at: _updated,
        ...dati
      } = campi;
      const q = id
        ? supabase
            .from("subappaltatori_documenti_mensili" as never)
            .update(dati as never)
            .eq("id", id)
            .eq("company_id", companyId)
            .eq("subappaltatore_id", subId)
        : supabase
            .from("subappaltatori_documenti_mensili" as never)
            .insert({
              ...dati,
              company_id: companyId,
              subappaltatore_id: subId,
            } as never);
      const { data, error } = await q.select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Documento non salvato.");
      return data as unknown as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiaviMensili }),
  });
}
export function usePreparaMensiliSub(companyId: string, subId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contrattoId,
      mese,
      tipi,
    }: {
      contrattoId: string;
      mese: string;
      tipi: TipoMensile[];
    }) => {
      if (!p.canViewSubappaltatoriAmministrazione || p.solaLettura)
        throw new Error("Permesso amministrativo insufficiente.");
      if (!contrattoId || !meseValido(mese))
        throw new Error("Scegli contratto e mese di competenza.");
      if (!tipi.length) return;
      if (tipi.some((t) => !Object.hasOwn(TIPI_MENSILI, t)))
        throw new Error("Voce non riconosciuta.");
      const { error } = await supabase
        .from("subappaltatori_documenti_mensili" as never)
        .insert(
          tipi.map((tipo) => ({
            company_id: companyId,
            subappaltatore_id: subId,
            contratto_id: contrattoId,
            competenza: mese,
            tipo,
            stato: "da_richiedere",
            origine_requisito: "da_verificare",
          })) as never,
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiaviMensili }),
  });
}
export async function caricaMensileSub(
  companyId: string,
  id: string,
  file: File,
) {
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    ) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Scegli un PDF o un’immagine non vuota fino a 20 MB.");
  const path = `${companyId}/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;
  const { error } = await supabase.storage
    .from(BUCKET_MENSILI)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}
