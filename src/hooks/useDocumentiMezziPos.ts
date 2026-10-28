import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { chiamaServerPos } from "./usePos";
import {
  CATEGORIE_DOCUMENTO_MEZZO_POS,
  normalizzaDocumentoMezzo,
  normalizzaControlliMezzo,
  type DocumentoMezzoPos,
  type ControlliMezzoPos,
} from "../../supabase/functions/_shared/posDocumentiMezzi";

export interface QuadroDocumentiMezzoPos {
  company_id: string;
  order_id: string;
  mezzo_id: string;
  documenti: DocumentoMezzoPos[];
  controlli: ControlliMezzoPos;
}
export async function leggiDocumentiMezzoPos(
  companyId: string,
  orderId: string,
  mezzoId: string,
): Promise<QuadroDocumentiMezzoPos> {
  const { data, error } = await supabase.rpc(
    "pos_documenti_mezzo_quadro" as never,
    { _company: companyId, _ordine: orderId, _mezzo: mezzoId } as never,
  );
  if (error) throw new Error(error.message);
  const q = data as unknown as QuadroDocumentiMezzoPos;
  if (
    !q ||
    q.company_id !== companyId ||
    q.order_id !== orderId ||
    q.mezzo_id !== mezzoId ||
    !Array.isArray(q.documenti) ||
    q.documenti.length > 200 ||
    q.documenti.some(
      (d) =>
        !d ||
        d.mezzo_id !== mezzoId ||
        !CATEGORIE_DOCUMENTO_MEZZO_POS.some((c) => c === d.categoria) ||
        !/^[0-9a-f]{64}$/i.test(d.impronta),
    ) ||
    !q.controlli ||
    !Array.isArray(q.controlli.manutenzioni) ||
    !Array.isArray(q.controlli.segnalazioni) ||
    q.controlli.manutenzioni.length > 200 ||
    q.controlli.segnalazioni.length > 200 ||
    q.controlli.mezzo_id !== mezzoId ||
    !/^[0-9a-f]{64}$/i.test(q.controlli.impronta)
  )
    throw new Error(
      "Documenti o controlli non disponibili per questa attrezzatura e commessa.",
    );
  return {
    company_id: companyId,
    order_id: orderId,
    mezzo_id: mezzoId,
    documenti: q.documenti.map(normalizzaDocumentoMezzo),
    controlli: normalizzaControlliMezzo(q.controlli),
  };
}
export function useDocumentiMezzoPos(
  companyId: string,
  orderId: string,
  mezzoId: string | null,
  enabled: boolean,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["pos-documenti-mezzo", companyId, orderId, mezzoId],
    enabled:
      enabled &&
      !!companyId &&
      !!orderId &&
      !!mezzoId &&
      p.canViewSicurezzaCantiere,
    queryFn: () => leggiDocumentiMezzoPos(companyId, orderId, mezzoId!),
  });
}
export async function apriDocumentoMezzoPos(
  companyId: string,
  orderId: string,
  d: DocumentoMezzoPos,
) {
  const finestra = window.open("about:blank", "_blank");
  if (!finestra)
    throw new Error("Consenti l’apertura di una nuova scheda e riprova.");
  finestra.opener = null;
  try {
    const result = await chiamaServerPos<{ url: string }>({
      azione: "apri_documento_mezzo",
      company_id: companyId,
      order_id: orderId,
      mezzo_id: d.mezzo_id,
      documento_id: d.id,
      impronta: d.impronta,
    });
    const url = new URL(result.url);
    if (
      url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin ||
      !decodeURIComponent(url.pathname).startsWith(
        `/storage/v1/object/sign/mezzi-documenti/${companyId}/${d.mezzo_id}/`,
      )
    )
      throw new Error("Indirizzo del documento non valido.");
    finestra.location.href = url.href;
  } catch (e) {
    finestra.close();
    throw e;
  }
}
