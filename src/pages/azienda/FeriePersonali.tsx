/**
 * FeriePersonali — ferie, permessi e ROL per dipendente ufficio (company_staff)
 * Riusa useMyHrProfilo e useCreateRichiesta dagli hook HR esistenti
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Palmtree, Plus, Clock, RotateCcw, CheckCircle2,
  XCircle, Loader2, UserX, Ban, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { useCreateRichiesta } from "@/hooks/useRichieste";
import { useAuth } from "@/contexts/AuthContext";
import type { HrRichiesta, RichiestaTipo, RichiestaStato } from "@/types/hr";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Configurazione badge stato ─────────────────────────────────────────────
const STATO_CONFIG: Record<RichiestaStato, { label: string; icon: React.ElementType; className: string }> = {
  in_attesa:  { label: "In attesa",  icon: Clock,        className: "bg-amber-50  text-amber-800  border-amber-200"  },
  approvata:  { label: "Approvata",  icon: CheckCircle2, className: "bg-green-50  text-green-800  border-green-200"  },
  rifiutata:  { label: "Rifiutata",  icon: XCircle,      className: "bg-red-50    text-red-800    border-red-200"    },
  annullata:  { label: "Annullata",  icon: Ban,          className: "bg-slate-50  text-slate-600  border-slate-200"  },
  revocata:   { label: "Revocata",   icon: RotateCcw,    className: "bg-slate-50  text-slate-600  border-slate-200"  },
};

// ── Tipi richiesta ─────────────────────────────────────────────────────────
const TIPI_RICHIESTA: { value: RichiestaTipo; label: string }[] = [
  { value: "ferie",         label: "Ferie" },
  { value: "permesso",      label: "Permesso" },
  { value: "malattia",      label: "Malattia" },
  { value: "rol",           label: "ROL" },
  { value: "smart_working", label: "Smart Working" },
  { value: "straordinario", label: "Straordinario" },
  { value: "trasferta",     label: "Trasferta" },
  { value: "formazione",    label: "Formazione" },
  { value: "cambio_turno",  label: "Cambio turno" },
  { value: "lutto",         label: "Lutto" },
  { value: "maternita",     label: "Maternità" },
  { value: "paternita",     label: "Paternità" },
  { value: "infortunio",    label: "Infortunio" },
  { value: "rimborso",      label: "Rimborso" },
  { value: "altro",         label: "Altro" },
];

// ── Form data ──────────────────────────────────────────────────────────────
interface NuovaRichiestaForm {
  tipo: RichiestaTipo;
  data_inizio: string;
  data_fine: string;
  ore_richieste: string;
  motivo: string;
}

const FORM_DEFAULT: NuovaRichiestaForm = {
  tipo: "ferie",
  data_inizio: format(new Date(), "yyyy-MM-dd"),
  data_fine: format(new Date(), "yyyy-MM-dd"),
  ore_richieste: "",
  motivo: "",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function FeriePersonali() {
  const { role } = useAuth();
  const { data: profilo, isLoading: loadingProfilo } = useMyHrProfilo();
  const createMutation = useCreateRichiesta();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NuovaRichiestaForm>(FORM_DEFAULT);
  const [annullandoId, setAnnullandoId] = useState<string | null>(null);

  // Richieste personali
  const { data: mieRichieste = [], isLoading: loadingRichieste } = useQuery({
    queryKey: ["my-richieste", profilo?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_richieste")
        .select("*")
        .eq("profilo_id", profilo!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HrRichiesta[];
    },
    enabled: !!profilo?.id,
    staleTime: 2 * 60 * 1000,
  });

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

  // ── Loading ───────────────────────────────────────────────────────────
  if (loadingProfilo) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
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

  // ── Submit nuova richiesta ────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.data_inizio || !form.data_fine) {
      toast.error("Inserisci le date della richiesta");
      return;
    }
    await createMutation.mutateAsync({
      profilo_id: profilo.id,
      tipo: form.tipo,
      data_inizio: form.data_inizio,
      data_fine: form.data_fine,
      ore_richieste: form.ore_richieste ? Number(form.ore_richieste) : null,
      motivo: form.motivo || null,
    });
    setDialogOpen(false);
    setForm(FORM_DEFAULT);
    qc.invalidateQueries({ queryKey: ["my-richieste"] });
  };

  // ── Annulla richiesta ─────────────────────────────────────────────────
  const handleAnnulla = async (id: string) => {
    setAnnullandoId(id);
    try {
      const { error } = await supabase
        .from("hr_richieste")
        .update({ stato: "annullata" } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("Richiesta annullata");
      qc.invalidateQueries({ queryKey: ["my-richieste"] });
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setAnnullandoId(null);
    }
  };

  // ── Saldo ferie ────────────────────────────────────────────────────────
  const feriePerc = profilo.ferie_anno_giorni > 0
    ? Math.min(100, ((profilo.ferie_residue ?? 0) / profilo.ferie_anno_giorni) * 100)
    : 0;
  const permPerc = profilo.permessi_anno_ore > 0
    ? Math.min(100, ((profilo.permessi_residui_ore ?? 0) / profilo.permessi_anno_ore) * 100)
    : 0;
  const rolPerc = profilo.rol_anno_ore > 0
    ? Math.min(100, ((profilo.rol_residuo_ore ?? 0) / profilo.rol_anno_ore) * 100)
    : 0;

  const tipoRichiestaLabel = TIPI_RICHIESTA.find(t => t.value === form.tipo)?.label ?? form.tipo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Palmtree className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Ferie & Permessi</h1>
            <p className="text-sm text-muted-foreground">Gestisci le tue richieste</p>
          </div>
        </div>
        <Button onClick={() => { setForm(FORM_DEFAULT); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova richiesta
        </Button>
      </div>

      {/* BLOCCO A — Saldo ferie */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Ferie */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ferie</p>
                <p className="text-2xl font-bold mt-0.5">{profilo.ferie_residue ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  giorni su {profilo.ferie_anno_giorni}
                </p>
              </div>
              <Palmtree className="h-5 w-5 text-green-500 mt-1" />
            </div>
            <Progress value={feriePerc} className="h-1.5" />
          </CardContent>
        </Card>
        {/* Permessi */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Permessi</p>
                <p className="text-2xl font-bold mt-0.5">{profilo.permessi_residui_ore ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  ore su {profilo.permessi_anno_ore}
                </p>
              </div>
              <Clock className="h-5 w-5 text-blue-500 mt-1" />
            </div>
            <Progress value={permPerc} className="h-1.5" />
          </CardContent>
        </Card>
        {/* ROL */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">ROL</p>
                <p className="text-2xl font-bold mt-0.5">{profilo.rol_residuo_ore ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  ore su {profilo.rol_anno_ore}
                </p>
              </div>
              <RotateCcw className="h-5 w-5 text-purple-500 mt-1" />
            </div>
            <Progress value={rolPerc} className="h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* BLOCCO B — Le mie richieste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Le mie richieste</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRichieste ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : mieRichieste.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Palmtree className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nessuna richiesta ancora inviata</p>
              <Button
                variant="link"
                className="mt-1 text-sm"
                onClick={() => { setForm(FORM_DEFAULT); setDialogOpen(true); }}
              >
                Crea la prima richiesta →
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {mieRichieste.map(r => {
                const cfg = STATO_CONFIG[r.stato as RichiestaStato] ?? STATO_CONFIG.in_attesa;
                const StatusIcon = cfg.icon;
                const tipoLabel = TIPI_RICHIESTA.find(t => t.value === r.tipo)?.label ?? r.tipo;
                const giorni = r.data_fine
                  ? differenceInCalendarDays(parseISO(r.data_fine), parseISO(r.data_inizio)) + 1
                  : 1;

                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between rounded-lg border p-3 gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.className.includes("green") ? "text-green-600" : cfg.className.includes("amber") ? "text-amber-600" : cfg.className.includes("red") ? "text-red-600" : "text-slate-400")} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{tipoLabel}</span>
                          <Badge variant="outline" className={cn("text-xs", cfg.className)}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(r.data_inizio), "d MMM yyyy", { locale: it })}
                          {r.data_fine && r.data_fine !== r.data_inizio &&
                            ` → ${format(parseISO(r.data_fine), "d MMM yyyy", { locale: it })}`}
                          {" · "}
                          {r.ore_richieste ? `${r.ore_richieste}h` : `${giorni} giorn${giorni === 1 ? "o" : "i"}`}
                        </p>
                        {(r as any).note_risposta && (
                          <p className="text-xs text-red-600 mt-1 italic">
                            Nota: {(r as any).note_risposta}
                          </p>
                        )}
                      </div>
                    </div>
                    {r.stato === "in_attesa" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-red-600 shrink-0"
                        disabled={annullandoId === r.id}
                        onClick={() => handleAnnulla(r.id)}
                      >
                        {annullandoId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Annulla"
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCCO C — Dialog nuova richiesta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova richiesta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={v => setForm(f => ({ ...f, tipo: v as RichiestaTipo }))}
              >
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPI_RICHIESTA.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="data_inizio">Dal</Label>
                <Input
                  id="data_inizio"
                  type="date"
                  value={form.data_inizio}
                  onChange={e => setForm(f => ({ ...f, data_inizio: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data_fine">Al</Label>
                <Input
                  id="data_fine"
                  type="date"
                  value={form.data_fine}
                  min={form.data_inizio}
                  onChange={e => setForm(f => ({ ...f, data_fine: e.target.value }))}
                />
              </div>
            </div>

            {(form.tipo === "permesso" || form.tipo === "rol" || form.tipo === "straordinario") && (
              <div className="space-y-1.5">
                <Label htmlFor="ore">Ore richieste (facoltativo)</Label>
                <Input
                  id="ore"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  placeholder="es. 4"
                  value={form.ore_richieste}
                  onChange={e => setForm(f => ({ ...f, ore_richieste: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="motivo">Motivo (facoltativo)</Label>
              <Textarea
                id="motivo"
                rows={3}
                placeholder="Note aggiuntive..."
                value={form.motivo}
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Invia richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
