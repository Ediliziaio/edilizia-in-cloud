import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GrigliaVerifiche, type ProvaVisuale } from "./SchedeVerifica";

export default function VerificaCoerenza() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["verifica-coerenza-materiali", effectiveCompany?.id],
    enabled: effectiveCompany?.id === "d2000000-0000-4000-a000-000000000002",
    refetchInterval: 10_000,
    queryFn: async (): Promise<ProvaVisuale[]> => {
      const { data: rows, error } = await supabase.from("render_stanza_sessions").select("id,status,config,config_snapshot,original_photo_url,result_urls,error_message,created_at,processing_started_at,processing_completed_at").eq("company_id", effectiveCompany!.id).ilike("config->>note_libere", "%TEST QA COERENZA PROGETTO%").order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      const seen = new Set<string>();
      const cards: ProvaVisuale[] = [];
      for (const row of rows ?? []) {
        const config = row.config as { planimetria?: { locale_id?: string; locale_nome?: string; planimetria_id?: string } } | null;
        const room = config?.planimetria?.locale_id;
        if (!room || seen.has(room)) continue;
        seen.add(room);
        const snapshot = row.config_snapshot as { qa_rejected_path?: string } | null;
        const sign = async (path?: string | null) => {
          if (!path?.startsWith(`${effectiveCompany!.id}/`)) return "";
          return (await supabase.storage.from("stanza-originals").createSignedUrl(path, 3600)).data?.signedUrl ?? "";
        };
        const source = await sign(row.original_photo_url);
        const privatePreview = row.status === "failed" ? await sign(snapshot?.qa_rejected_path) : undefined;
        cards.push({ id: `coerenza-${room}`, label: config?.planimetria?.locale_nome ?? "Stanza del progetto", group: "Stesso progetto · rovere e PVC bianco", source, href: row.status === "completed" ? `/azienda/render/stanza/gallery/${row.id}` : undefined, result: { id: room, session: row.id, status: row.status === "completed" ? "completato" : row.status === "failed" ? "errore" : "generazione Alta", result: row.result_urls?.[0], privatePreview, error: row.error_message ?? undefined, seconds: row.processing_started_at && row.processing_completed_at ? Math.round((Date.parse(row.processing_completed_at) - Date.parse(row.processing_started_at)) / 1000) : undefined } });
      }
      return cards;
    },
  });
  if (!data.length) return null;
  return <section className="space-y-4 border-t border-slate-200 pt-8"><div><h2 className="text-lg font-semibold text-slate-900">La stessa casa, gli stessi materiali</h2><p className="mt-1 text-sm text-slate-500">Soggiorno e camera dalla stessa pianta salvata: parquet rovere naturale e infissi PVC bianco, in qualità Alta.</p></div><GrigliaVerifiche cases={data} running={data.some((c) => c.result?.status === "generazione Alta")} onRetry={() => navigate("/azienda/render/planimetrie/b8b0e9d7-8c52-4895-ba6d-c6e94ee5e88d")} /></section>;
}
