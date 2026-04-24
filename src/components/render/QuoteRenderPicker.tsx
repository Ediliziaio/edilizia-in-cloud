import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Image } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface RenderOption {
  id: string;
  result_url: string | null;
  created_at: string;
  render_type: string;
  session_table: string;
}

interface QuoteRenderPickerProps {
  contactId: string | null;
  selectedRenderIds: string[];
  onSelectionChange: (renders: RenderOption[]) => void;
}

interface ViewRow {
  id: string;
  result_url: string | null;
  created_at: string;
  render_type: string;
  source_table: string;
}

export function QuoteRenderPicker({
  contactId,
  selectedRenderIds,
  onSelectionChange,
}: QuoteRenderPickerProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: renders = [] } = useQuery({
    queryKey: ["quote-render-picker", companyId, contactId],
    queryFn: async (): Promise<RenderOption[]> => {
      if (!companyId) return [];

      // FIX P6.1: singola query sulla VIEW company_renders_recent invece
      // di 7 query parallele. Filtriamo per status='completed' (normalizzato).
      let q = supabase
        .from("company_renders_recent" as never)
        .select("id,result_url,created_at,render_type,source_table" as never)
        .eq("company_id", companyId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);
      if (contactId) q = q.eq("contact_id", contactId);
      const { data, error } = await q;
      if (error) {
        console.error("[QuoteRenderPicker] query error:", error);
        return [];
      }
      return ((data ?? []) as unknown as ViewRow[])
        .filter(r => r.result_url)
        .map((r) => ({
          id: r.id,
          result_url: r.result_url,
          created_at: r.created_at,
          render_type: r.render_type,
          session_table: r.source_table,
        }));
    },
    enabled: !!companyId,
  });

  if (renders.length === 0) return null;

  const typeLabel: Record<string, string> = {
    infissi: "Infissi", bagno: "Bagno", facciata: "Facciata",
    pavimento: "Pavimento", persiane: "Persiane", tetto: "Tetto", stanza: "Stanza",
    pergole: "Pergole", piscine: "Piscine",
  };

  const handleToggle = (render: RenderOption) => {
    const isSelected = selectedRenderIds.includes(render.id);
    const currentSelected = renders.filter(r => selectedRenderIds.includes(r.id));
    if (isSelected) {
      onSelectionChange(currentSelected.filter(r => r.id !== render.id));
    } else {
      onSelectionChange([...currentSelected, render]);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Render AI da allegare
        {contactId && <span className="text-muted-foreground font-normal">(del contatto)</span>}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
        {renders.map((r) => {
          const isSelected = selectedRenderIds.includes(r.id);
          return (
            <div
              key={`${r.render_type}-${r.id}`}
              className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer transition-all ${
                isSelected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-primary/40"
              }`}
              onClick={() => handleToggle(r)}
            >
              {r.result_url ? (
                <img src={r.result_url} alt="Render" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Image className="h-5 w-5 text-muted-foreground/30" />
                </div>
              )}
              <div className="absolute top-1 left-1">
                <Checkbox checked={isSelected} className="bg-white/80" />
              </div>
              <div className="absolute bottom-0.5 left-0.5">
                <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-black/60 text-white border-0">
                  {typeLabel[r.render_type]}
                </Badge>
              </div>
              <div className="absolute bottom-0.5 right-0.5">
                <span className="text-[8px] text-white/80 bg-black/40 px-0.5 rounded">
                  {format(new Date(r.created_at), "d MMM", { locale: it })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {selectedRenderIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedRenderIds.length} render selezionat{selectedRenderIds.length === 1 ? "o" : "i"}
        </p>
      )}
    </div>
  );
}
