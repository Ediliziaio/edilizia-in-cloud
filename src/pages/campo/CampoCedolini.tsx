/**
 * Cedolini dell'operaio — visualizza le buste paga emesse.
 * Solo lettura — i cedolini vengono creati dall'ufficio.
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Receipt, Download, Loader2, FileText, Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const STATO_BADGE: Record<string, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  emesso: { label: "Emesso", className: "bg-blue-100 text-blue-700" },
  pagato: { label: "Pagato", className: "bg-green-100 text-green-700" },
};

export default function CampoCedolini() {
  const { user } = useAuth();

  // Cerca employee_id
  const { data: employeeId } = useQuery({
    queryKey: ["campo-emp-cedolini", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id,
  });

  // I miei cedolini
  const { data: cedolini = [], isLoading } = useQuery({
    queryKey: ["campo-miei-cedolini", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_cedolini")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("anno", { ascending: false })
        .order("mese", { ascending: false })
        .limit(24);
      return data ?? [];
    },
    enabled: !!employeeId,
  });

  // KPI
  const cedoliniPagati = cedolini.filter((c: any) => c.stato === "pagato");
  const ultimoCedolino = cedolini[0] as any;
  const totaleNetto = cedoliniPagati.reduce((sum: number, c: any) => {
    const netto = (c.lordo ?? 0) - (c.contributi_dipendente ?? 0) - (c.ritenute_irpef ?? 0);
    return sum + netto;
  }, 0);

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">I miei cedolini</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Buste paga e retribuzioni</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cedolini disponibili</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{cedolini.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ultimo cedolino</p>
            <p className="text-2xl font-bold mt-1 text-primary">
              {ultimoCedolino ? `${MESI[(ultimoCedolino.mese ?? 1) - 1]?.slice(0, 3)} ${ultimoCedolino.anno}` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista cedolini */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Storico cedolini</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : cedolini.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nessun cedolino disponibile</p>
              <p className="text-xs text-muted-foreground mt-1">I cedolini verranno aggiunti dall'ufficio</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cedolini.map((c: any) => {
                const netto = (c.lordo ?? 0) - (c.contributi_dipendente ?? 0) - (c.ritenute_irpef ?? 0);
                const statoConf = STATO_BADGE[c.stato] || STATO_BADGE.bozza;
                const meseLabel = MESI[(c.mese ?? 1) - 1] ?? "";

                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 p-4 bg-muted/50 border border-border rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">
                          {meseLabel} {c.anno}
                        </span>
                        <Badge className={cn("text-[10px]", statoConf.className)}>
                          {statoConf.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {c.lordo != null && <span>Lordo: {c.lordo.toFixed(2)}</span>}
                        {c.ore_lavorate != null && <span>{c.ore_lavorate}h lavorate</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">
                        {netto > 0 ? `${netto.toFixed(2)}` : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Netto</p>
                    </div>
                    {c.pdf_url && (
                      <a
                        href={c.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
                      >
                        <Download className="w-4 h-4 text-primary" />
                      </a>
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
