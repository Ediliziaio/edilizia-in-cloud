/**
 * Tab "Documenti" in PersonalePage.
 * Sezione 1: Dashboard scadenze globale (admin view)
 * Sezione 2: Documenti per singolo profilo (con select operaio)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { FileText, AlertTriangle, User } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScadenzeAdminDashboard } from "@/components/hr/ScadenzeAdminDashboard";
import { DocumentiOperaioTab } from "@/components/hr/DocumentiOperaioTab";
import { PushConsentBanner } from "@/components/hr/PushConsentBanner";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfiloOption {
  id: string;
  user_id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  reparto: string | null;
}

export function TabDocumenti() {
  const companyId = useEffectiveCompanyId();
  const [selectedOperaio, setSelectedOperaio] = useState<string>("");
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);

  // I documenti operai sono ancora collegati all'account utente: qui partiamo dai profili HR collegati.
  const { data: profili = [], isLoading: loadingProfili } = useQuery<ProfiloOption[]>({
    queryKey: ["hr-profili-documenti-list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("id, user_id, nome, cognome, mansione, reparto")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .not("user_id", "is", null)
        .order("cognome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfiloOption[];
    },
    enabled: !!companyId,
  });

  return (
    <div className="space-y-5">
      {/* Banner push consent (solo se non già dismesso) */}
      {!pushBannerDismissed && (
        <PushConsentBanner onDismiss={() => setPushBannerDismissed(true)} />
      )}

      <Tabs defaultValue="scadenze">
        <TabsList className="h-auto gap-1 p-1">
          <TabsTrigger value="scadenze" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Scadenze globali
          </TabsTrigger>
          <TabsTrigger value="per-operaio" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Per operaio
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Dashboard scadenze globali ─────────────────────────────── */}
        <TabsContent value="scadenze" className="mt-4">
          <ScadenzeAdminDashboard />
        </TabsContent>

        {/* ── Tab 2: Documenti per singolo operaio ──────────────────────────── */}
        <TabsContent value="per-operaio" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
              <User className="h-3.5 w-3.5" />
              Operaio
            </div>
            {loadingProfili ? (
              <Skeleton className="h-9 w-64 rounded-md" />
            ) : (
              <Select value={selectedOperaio} onValueChange={setSelectedOperaio}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Seleziona operaio…" />
                </SelectTrigger>
                <SelectContent>
                  {profili.map(p => (
                    <SelectItem key={p.id} value={p.user_id}>
                      {[p.nome, p.cognome].filter(Boolean).join(" ") || p.id.slice(0, 8)}
                      {p.mansione ? ` · ${p.mansione}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedOperaio ? (
            <DocumentiOperaioTab
              operaioId={selectedOperaio}
              canUpload
              canDelete
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <User className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Seleziona un operaio per gestire i suoi documenti
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Patente, visita medica, corsi sicurezza, permessi di soggiorno e altro
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
