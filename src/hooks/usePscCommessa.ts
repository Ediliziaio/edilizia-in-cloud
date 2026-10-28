import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  type FontePsc,
  improntaPsc,
  percorsoPscValido,
  type RiferimentoPsc,
  stessaFontePsc,
} from "../../supabase/functions/_shared/posPsc";
export const chiavePsc = ["psc-commessa"] as const;
export async function leggiPscCommessa(
  companyId: string,
  orderId: string,
): Promise<FontePsc[]> {
  const [archivio, fascicolo] = await Promise.all([
    readAllPages((from, to) =>
      supabase.from("sicurezza_documenti" as never).select(
        "id,company_id,order_id,titolo,file_name,file_path,data_documento,created_at",
      ).eq("company_id", companyId).eq("order_id", orderId).eq("tipo", "psc")
        .is("subappaltatore_id", null).order("created_at", { ascending: false })
        .order("id").range(from, to)
    ),
    readAllPages((from, to) =>
      supabase.from("sicurezza_fascicolo" as never).select(
        "id,company_id,order_id,titolo,file_name,file_path,data_rilascio,revisione,created_at,stato",
      ).eq("company_id", companyId).eq("order_id", orderId).eq("tipo", "psc")
        .is("subappaltatore_id", null).order("created_at", { ascending: false })
        .order("id").range(from, to)
    ),
  ]);
  const converti = (
    rows: unknown[],
    tabella: FontePsc["archivio"],
  ): FontePsc[] =>
    rows.flatMap((raw) => {
      const r = raw as Record<string, unknown>;
      if (
        r.company_id !== companyId || r.order_id !== orderId || !r.file_path ||
        r.stato === "non_applicabile"
      ) return [];
      const s = (k: string) => typeof r[k] === "string" ? r[k] as string : "";
      if (!percorsoPscValido(s("file_path"), companyId)) return [];
      return [{
        archivio: tabella,
        id: s("id"),
        company_id: companyId,
        order_id: orderId,
        titolo: s("titolo"),
        file_name: s("file_name"),
        file_path: s("file_path"),
        data_documento: s(
          tabella === "sicurezza_documenti"
            ? "data_documento"
            : "data_rilascio",
        ),
        revisione: s("revisione"),
        created_at: s("created_at"),
      }];
    });
  return [
    ...converti(archivio, "sicurezza_documenti"),
    ...converti(fascicolo, "sicurezza_fascicolo"),
  ];
}
export function usePscCommessa(companyId: string, orderId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: [...chiavePsc, companyId, orderId],
    enabled: !!companyId && !!orderId && p.canViewSicurezzaCantiere,
    refetchOnWindowFocus: true,
    queryFn: () => leggiPscCommessa(companyId, orderId),
  });
}
/** Re-read metadata before and after the download; never reuse a stale list selection. */
export async function identificaPsc(
  fonte: FontePsc,
  revisione: string,
): Promise<RiferimentoPsc> {
  if (!revisione.trim()) {
    throw new Error("Indica la revisione riportata sul PSC.");
  }
  const rileggi = async () => {
    const rows = await leggiPscCommessa(fonte.company_id, fonte.order_id);
    const corrente = rows.find((r) =>
      r.id === fonte.id && r.archivio === fonte.archivio
    );
    if (!corrente || !stessaFontePsc(fonte, corrente)) {
      throw new Error(
        "Il PSC è cambiato o non è più disponibile: aggiorna l’elenco.",
      );
    }
  };
  await rileggi();
  const bucket = fonte.archivio === "sicurezza_documenti"
    ? "sicurezza-documenti"
    : "fascicoli-cantiere";
  const { data, error } = await supabase.storage.from(bucket).download(
    fonte.file_path,
  );
  if (error || !data) {
    throw new Error(
      "Non riesco a leggere l’originale del PSC. Il riferimento non è stato modificato.",
    );
  }
  const sha256 = await improntaPsc(data);
  await rileggi();
  const { created_at: _created, ...r } = fonte;
  return { ...r, revisione: revisione.trim(), sha256 };
}
