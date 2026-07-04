/**
 * CedoliniPersonali — cedolini paga in sola lettura per dipendente ufficio
 * Legge dalla tabella cedolini via employee_id del profilo HR
 * Download PDF via edge function generate-cedolino-pdf
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt, Download, Loader2, UserX, ChevronDown, ChevronUp, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Mese in italiano ───────────────────────────────────────────────────────
const MESI = [
  "", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

// ── Configurazione badge stato ─────────────────────────────────────────────
const STATO_CONFIG: Record<string, { label: string; className: string }> = {
  bozza:  { label: "Bozza",  className: "bg-muted text-muted-foreground" },
  emesso: { label: "Emesso", className: "bg-blue-50 text-blue-700 border-blue-200" },
  pagato: { label: "Pagato", className: "bg-green-50 text-green-700 border-green-200" },
};

// ── Cedolino row type ──────────────────────────────────────────────────────
interface Cedolino {
  id: string;
  mese: number;
  anno: number;
  lordo: number;
  netto: number;
  contributi_dipendente: number | null;
  ritenute_irpef: number | null;
  stato: string;
  note: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CedoliniPersonali() {
  const companyId = useEffectiveCompanyId();
  const { user, role } = useAuth();
  const { data: profilo, isLoading: loadingProfilo } = useMyHrProfilo();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Se profilo.employee_id è null, prova a recuperare employee_id dalla tabella employees
  const { data: employeeId, isLoading: loadingEmployee } = useQuery({
    queryKey: ["my-employee-id", profilo?.employee_id, user?.id],
    queryFn: async () => {
      if (profilo?.employee_id) return profilo.employee_id;
      // Fallback: cerca per user_id
      const { data, error } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      // Un errore reale (RLS/DB) non deve essere confuso con "nessun collegamento":
      // lo propaghiamo così la UI può mostrare un vero stato d'errore invece di
      // "profilo non collegato".
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!profilo,
    staleTime: 10 * 60 * 1000,
  });

  // Cedolini del dipendente
  const { data: cedolini = [], isLoading: loadingCedolini } = useQuery({
    queryKey: ["my-cedolini", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cedolini")
        .select("id, mese, anno, lordo, netto, contributi_dipendente, ritenute_irpef, stato, note")
        .eq("employee_id", employeeId!)
        .order("anno", { ascending: false })
        .order("mese", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Cedolino[];
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Download PDF cedolino ─────────────────────────────────────────────
  const handleDownload = async (cedolino: Cedolino) => {
    if (!companyId) return;
    setDownloadingId(cedolino.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cedolino-pdf", {
        body: { cedolino_id: cedolino.id, company_id: companyId },
      });
      if (error) {
        let errBody: any = null;
        try { const ctx = (error as any).context; if (ctx instanceof Response) errBody = await ctx.json(); } catch { /* intentionally ignored */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto PDF");
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) w.onload = () => w.print();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nel download");
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Guard ruolo: solo company_staff e company_admin ───────────────────
  if (role && !["company_staff", "company_admin"].includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Accesso non autorizzato</h3>
        <p className="text-muted-foreground mt-2">
          Questa sezione non è disponibile per il tuo ruolo.
        </p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (loadingProfilo) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    );
  }

  // ── Nessun profilo HR ──────────────────────────────────────────────────
  if (!profilo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <UserX className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Profilo HR non configurato</h3>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Il tuo profilo HR non è ancora stato configurato.
          Contatta l'amministratore per completare la configurazione.
        </p>
      </div>
    );
  }

  const isLoading = loadingEmployee || loadingCedolini;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Receipt className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">I miei Cedolini</h1>
          <p className="text-sm text-muted-foreground">
            Visualizza e scarica le tue buste paga
          </p>
        </div>
      </div>

      {/* Lista cedolini */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cedolini disponibili</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !employeeId ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Il tuo profilo non è ancora collegato a un record dipendente.</p>
              <p className="text-xs mt-1">Contatta l'amministratore.</p>
            </div>
          ) : cedolini.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Nessun cedolino disponibile</p>
              <p className="text-xs mt-1">
                I cedolini vengono caricati dall'amministratore.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cedolini.map(c => {
                const cfg = STATO_CONFIG[c.stato] ?? STATO_CONFIG.bozza;
                const isExpanded = expandedId === c.id;
                const canDownload = c.stato === "emesso" || c.stato === "pagato";
                const isDownloading = downloadingId === c.id;

                return (
                  <div key={c.id} className="rounded-lg border overflow-hidden">
                    {/* Riga principale */}
                    <div className="flex items-center justify-between px-4 py-3 gap-3">
                      <button
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      >
                        <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {MESI[c.mese]} {c.anno}
                            </span>
                            <Badge variant="outline" className={cn("text-xs", cfg.className)}>
                              {cfg.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Netto: <span className="font-semibold text-foreground">
                              €{c.netto.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                            </span>
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
                        )}
                      </button>

                      <Button
                        size="sm"
                        variant={canDownload ? "default" : "ghost"}
                        disabled={!canDownload || isDownloading}
                        onClick={() => canDownload && handleDownload(c)}
                        className="shrink-0"
                        title={canDownload ? "Scarica cedolino" : "Cedolino non ancora emesso"}
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline ml-1.5">
                          {isDownloading ? "..." : "Scarica"}
                        </span>
                      </Button>
                    </div>

                    {/* Dettaglio espanso */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Lordo</p>
                          <p className="font-medium">
                            €{c.lordo.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contributi dip.</p>
                          <p className="font-medium">
                            {c.contributi_dipendente != null
                              ? `€${c.contributi_dipendente.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">IRPEF</p>
                          <p className="font-medium">
                            {c.ritenute_irpef != null
                              ? `€${c.ritenute_irpef.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Netto</p>
                          <p className="font-semibold text-green-700">
                            €{c.netto.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        {c.note && (
                          <div className="col-span-full">
                            <p className="text-xs text-muted-foreground">Note</p>
                            <p className="text-sm italic">{c.note}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
