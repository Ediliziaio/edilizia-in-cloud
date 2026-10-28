import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { apriFileFascicolo } from "./useFascicoloCantiere";
import {
  normalizzaDocumentoTecnico,
  type DocumentoTecnicoPos,
} from "../../supabase/functions/_shared/posFontiTecniche";
export interface QuadroDocumentiTecniciPos {
  company_id: string;
  order_id: string;
  documenti: DocumentoTecnicoPos[];
}
export async function leggiDocumentiTecniciPos(
  companyId: string,
  orderId: string,
): Promise<QuadroDocumentiTecniciPos> {
  const { data, error } = await supabase.rpc(
    "pos_documenti_tecnici_quadro" as never,
    { _company: companyId, _ordine: orderId } as never,
  );
  if (error) throw new Error(error.message);
  const q = data as unknown as QuadroDocumentiTecniciPos;
  if (
    !q ||
    q.company_id !== companyId ||
    q.order_id !== orderId ||
    !Array.isArray(q.documenti) ||
    q.documenti.some(
      (d) => d.order_id !== orderId || typeof d.impronta !== "string",
    )
  )
    throw new Error("Documenti tecnici non disponibili per questa commessa.");
  return { ...q, documenti: q.documenti.map(normalizzaDocumentoTecnico) };
}
export function useDocumentiTecniciPos(
  companyId: string,
  orderId: string,
  enabled: boolean,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["pos-documenti-tecnici", companyId, orderId],
    enabled: enabled && !!companyId && !!orderId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiDocumentiTecniciPos(companyId, orderId),
  });
}
export async function apriDocumentoTecnicoPos(
  companyId: string,
  orderId: string,
  d: DocumentoTecnicoPos,
) {
  const { data, error } = await supabase.rpc(
    "pos_documento_tecnico_apri" as never,
    {
      _company: companyId,
      _ordine: orderId,
      _documento: d.id,
      _impronta: d.impronta,
    } as never,
  );
  if (error) throw new Error(error.message);
  const path: unknown = data;
  if (
    typeof path !== "string" ||
    !path.startsWith(`${companyId}/${d.id}/`) ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Documento tecnico non disponibile.");
  await apriFileFascicolo(path);
}
