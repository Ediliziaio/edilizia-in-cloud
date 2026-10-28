import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import {
  normalizzaMezzoFonte,
  chiaveFonteMezzo,
  type MezzoFontePos,
} from "../../supabase/functions/_shared/posMezzi";

export interface QuadroMezziPos {
  company_id: string;
  order_id: string;
  fonti: MezzoFontePos[];
}
export async function leggiMezziPos(
  companyId: string,
  orderId: string,
): Promise<QuadroMezziPos> {
  const { data, error } = await supabase.rpc(
    "pos_mezzi_quadro" as never,
    { _company: companyId, _ordine: orderId } as never,
  );
  if (error) throw new Error(error.message);
  const q = data as unknown as QuadroMezziPos;
  if (
    !q ||
    q.company_id !== companyId ||
    q.order_id !== orderId ||
    !Array.isArray(q.fonti) ||
    q.fonti.length > 500 ||
    q.fonti.some(
      (f) =>
        !f ||
        f.order_id !== orderId ||
        ![
          "assegnazione",
          "allocazione",
          "corrente",
          "su_mezzo_corrente",
        ].includes(f.fonte_tipo) ||
        !/^[0-9a-f]{64}$/i.test(f.impronta),
    )
  )
    throw new Error("Attrezzature non disponibili per questa commessa.");
  const fonti = q.fonti.map(normalizzaMezzoFonte);
  if (new Set(fonti.map(chiaveFonteMezzo)).size !== fonti.length)
    throw new Error("Fonti attrezzatura duplicate: rileggi l’inventario.");
  return { company_id: companyId, order_id: orderId, fonti };
}
export function useMezziPos(
  companyId: string,
  orderId: string,
  enabled: boolean,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["pos-mezzi", companyId, orderId],
    enabled: enabled && !!companyId && !!orderId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiMezziPos(companyId, orderId),
  });
}
