/**
 * Ferie e Permessi dell'operaio — visualizza richieste e invia nuove.
 * Simile alla sezione HR dell'ufficio ma limitata all'utente loggato.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Plus, CalendarDays, Loader2, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIPI_RICHIESTA = [
  { value: "ferie", label: "Ferie" },
  { value: "permesso", label: "Permesso" },
  { value: "malattia", label: "Malattia" },
  { value: "rol", label: "ROL" },
  { value: "straordinario", label: "Straordinario" },
  { value: "smart_working", label: "Smart Working" },
  { value: "trasferta", label: "Trasferta" },
  { value: "altro", label: "Altro" },
];

const STATO_CONFIG: Record<string, { label: string; icon: any; color: string; badgeClass: string }> = {
  in_attesa: { label: "In attesa", icon: AlertCircle, color: "text-amber-500", badgeClass: "bg-amber-100 text-amber-700" },
  approvata: { label: "Approvata", icon: CheckCircle, color: "text-green-600", badgeClass: "bg-green-100 text-green-700" },
  rifiutata: { label: "Rifiutata", icon: XCircle, color: "text-red-500", badgeClass: "bg-red-100 text-red-700" },
};

export default function CampoFerie() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Profilo HR: la lista dell'ufficio joina hr_profili via profilo_id — senza,
  // la richiesta compariva in HR senza nome del dipendente.
  const { data: hrProfilo } = useMyHrProfilo();

  // Form state
  const [tipo, setTipo] = useState("ferie");
  const [dataInizio, setDataInizio] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dataFine, setDataFine] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");

  // Le mie richieste
  const { data: richieste = [], isLoading } = useQuery({
    queryKey: ["campo-mie-richieste", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_richieste")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Invia nuova richiesta
  const { mutate: inviaRichiesta, isPending: submitting } = useMutation({
    mutationFn: async () => {
      if (!dataInizio || !dataFine) throw new Error("Seleziona le date");
      if (dataFine < dataInizio) throw new Error("La data fine deve essere dopo la data inizio");

      const { error } = await supabase.from("hr_richieste").insert({
        user_id: user!.id,
        company_id: (profile as any)?.company_id,
        profilo_id: hrProfilo?.id ?? null,
        tipo,
        data_inizio: dataInizio,
        data_fine: dataFine,
        motivo: note.trim() || null,
        stato: "in_attesa",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta inviata! L'ufficio ti notifichera.");
      queryClient.invalidateQueries({ queryKey: ["campo-mie-richieste"] });
      setShowForm(false);
      setNote("");
    },
    onError: (err: any) => toast.error(err.message ?? "Errore nell'invio"),
  });

  // KPI
  const inAttesa = richieste.filter((r: any) => r.stato === "in_attesa").length;
  const approvate = richieste.filter((r: any) => r.stato === "approvata").length;
  const rifiutate = richieste.filter((r: any) => r.stato === "rifiutata").length;

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-semibold tracking-tight">Ferie e Permessi</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Richiedi ferie e visualizza lo storico</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Nuova richiesta</span>
          <span className="sm:hidden">Nuova</span>
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "In attesa", value: inAttesa, color: "text-amber-500" },
          { label: "Approvate", value: approvate, color: "text-green-600" },
          { label: "Rifiutate", value: rifiutate, color: "text-red-500" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Form nuova richiesta */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nuova richiesta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Tipo</label>
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {TIPI_RICHIESTA.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95",
                      tipo === t.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Data inizio</label>
                <input
                  type="date"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground"
                  value={dataInizio}
                  onChange={e => setDataInizio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Data fine</label>
                <input
                  type="date"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground"
                  value={dataFine}
                  onChange={e => setDataFine(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Note (opzionale)</label>
              <textarea
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground resize-none placeholder:text-muted-foreground"
                rows={2}
                placeholder="Motivo della richiesta..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                Annulla
              </Button>
              <Button onClick={() => inviaRichiesta()} disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Invia richiesta
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista richieste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Le mie richieste</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : richieste.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nessuna richiesta inviata</p>
            </div>
          ) : (
            <div className="space-y-3">
              {richieste.map((r: any) => {
                const statoConf = STATO_CONFIG[r.stato] || STATO_CONFIG.in_attesa;
                const Icon = statoConf.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-xl"
                  >
                    <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", statoConf.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground capitalize">{r.tipo}</span>
                        <Badge className={cn("text-[10px]", statoConf.badgeClass)}>
                          {statoConf.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.data_inizio), "d MMM", { locale: it })}
                        {r.data_inizio !== r.data_fine && (
                          <> — {format(new Date(r.data_fine), "d MMM yyyy", { locale: it })}</>
                        )}
                      </p>
                      {r.motivo && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.motivo}</p>
                      )}
                    </div>
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
