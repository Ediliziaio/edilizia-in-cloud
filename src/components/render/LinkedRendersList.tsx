import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Image, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface LinkedRendersListProps {
  contactId?: string | null;
  opportunityId?: string | null;
}

interface RenderItem {
  id: string;
  status: string;
  result_url: string | null;
  created_at: string;
  render_type: string;
}

interface RecentRenderRow {
  id: string;
  status: string;
  result_url: string | null;
  created_at: string;
  render_type: string;
}

export function LinkedRendersList({ contactId, opportunityId }: LinkedRendersListProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();

  const { data: renders = [], isLoading } = useQuery({
    queryKey: ["linked-renders", contactId, opportunityId, companyId],
    queryFn: async (): Promise<RenderItem[]> => {
      if (!companyId || (!contactId && !opportunityId)) return [];

      // FIX P6.1: singola query sulla VIEW company_renders_recent invece
      // di 7 query parallele. Normalizzazione status (bagno italiano →
      // inglese) fatta lato DB.
      // Cast as never: la VIEW è custom, non ancora nei types generati.
      let q = supabase
        .from("company_renders_recent" as never)
        .select("id,status,result_url,created_at,render_type" as never)
        .eq("company_id", companyId);
      if (contactId)     q = q.eq("contact_id", contactId);
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[LinkedRendersList] query error:", error);
        return [];
      }
      return (data ?? []) as unknown as RecentRenderRow[];
    },
    enabled: !!companyId && (!!contactId || !!opportunityId),
  });

  if (!contactId && !opportunityId) return null;
  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Render AI
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (renders.length === 0) return null;

  const typeLabel: Record<string, string> = {
    infissi: "Infissi", bagno: "Bagno", facciata: "Facciata",
    pavimento: "Pavimento", persiane: "Persiane", tetto: "Tetto", stanza: "Stanza",
    pergole: "Pergole", piscine: "Piscine",
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" /> Render AI ({renders.length})
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {renders.map((r) => (
          <div
            key={`${r.render_type}-${r.id}`}
            className="aspect-video rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary/40 transition-all group relative bg-muted"
            onClick={() => navigate(`/azienda/render/${r.render_type}/gallery/${r.id}`)}
          >
            {r.result_url ? (
              <img src={r.result_url} alt="Render" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute bottom-1 left-1 flex gap-1">
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-black/60 text-white border-0">
                {typeLabel[r.render_type] ?? r.render_type}
              </Badge>
            </div>
            <div className="absolute bottom-1 right-1">
              <span className="text-[9px] text-white/80 bg-black/40 px-1 rounded">
                {format(new Date(r.created_at), "d MMM", { locale: it })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
