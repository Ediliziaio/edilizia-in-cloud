import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { AlertTriangle, Info, Sparkles, X } from "lucide-react";
import { useState } from "react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  target_status: string;
}

export function AnnouncementBanner() {
  const { effectiveCompany } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const companyStatus = effectiveCompany?.status || "trial";

  const { data: announcements = [] } = useQuery({
    queryKey: ["active-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_announcements")
        .select("id, title, content, type, target_status")
        .eq("is_active", true)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as Announcement[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const visible = announcements.filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (a.target_status === "all") return true;
    return a.target_status === companyStatus;
  });

  if (visible.length === 0) return null;

  const typeStyles: Record<string, { bg: string; icon: React.ReactNode }> = {
    banner: { bg: "bg-primary/10 border-primary/20 text-primary", icon: <Info className="h-4 w-4" /> },
    changelog: { bg: "bg-accent/50 border-accent text-accent-foreground", icon: <Sparkles className="h-4 w-4" /> },
    maintenance: { bg: "bg-amber-50 border-amber-200 text-amber-800", icon: <AlertTriangle className="h-4 w-4" /> },
  };

  return (
    <div className="space-y-0">
      {visible.map((a) => {
        const style = typeStyles[a.type] || typeStyles.banner;
        return (
          <div key={a.id} className={`px-4 py-2.5 flex items-center gap-3 border-b ${style.bg}`}>
            {style.icon}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{a.title}</span>
              {a.content && <span className="text-sm ml-2 text-muted-foreground">{a.content}</span>}
            </div>
            <button onClick={() => setDismissed((prev) => new Set(prev).add(a.id))} className="shrink-0 hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
