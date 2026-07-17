/**
 * RichiesteHrPersonali — il dipendente invia richieste / note all'HR o
 * all'amministrazione (rettifica timbratura, segnalazioni, rimborsi, altro) e
 * ne segue lo stato. Riusa la tabella hr_richieste + useCreateRichiesta.
 * Alla creazione, il trigger notify_hr_richiesta avvisa i company_admin
 * (campanella in tempo reale).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  MessageSquarePlus, Clock3, CheckCircle2, XCircle, Ban, Send,
  Loader2, Inbox, PencilLine,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCreateRichiesta } from "@/hooks/useRichieste";
import type { RichiestaTipo, RichiestaStato } from "@/types/hr";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Tipi selezionabili dal dipendente (no ferie/permessi: gestiti nel tab Ferie) ──
type TipoOption = { value: RichiestaTipo; label: string; help: string; needsDate: boolean; dateLabel?: string };
const TIPI_DIPENDENTE: TipoOption[] = [
  { value: "rettifica_timbratura", label: "Rettifica timbratura", help: "Correzione di una timbratura errata o dimenticata", needsDate: true, dateLabel: "Giorno da correggere" },
  { value: "segnalazione", label: "Segnalazione / Nota", help: "Comunicazione o segnalazione all'HR o all'amministrazione", needsDate: false },
  { value: "rimborso", label: "Rimborso spese", help: "Richiesta di rimborso spese sostenute", needsDate: false },
  { value: "altro", label: "Altro", help: "Altra richiesta all'amministrazione", needsDate: false },
];

// Etichette per lo storico (include anche i tipi creati altrove, es. ferie)
const TIPO_LABEL: Partial<Record<RichiestaTipo, string>> = {
  ferie: "Ferie", permesso: "Permesso", rol: "ROL", malattia: "Malattia",
  straordinario: "Straordinario", cambio_turno: "Cambio turno", rimborso: "Rimborso spese",
  smart_working: "Smart working", trasferta: "Trasferta", formazione: "Formazione",
  infortunio: "Infortunio", maternita: "Maternità", paternita: "Paternità", lutto: "Lutto",
  rettifica_timbratura: "Rettifica timbratura", segnalazione: "Segnalazione", altro: "Altro",
};

const STATO_STYLE: Record<RichiestaStato, { label: string; className: string; icon: React.ElementType }> = {
  in_attesa: { label: "In attesa", className: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock3 },
  approvata: { label: "Approvata", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  rifiutata: { label: "Rifiutata", className: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  annullata: { label: "Annullata", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
  revocata: { label: "Revocata", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
};

type RichiestaRow = {
  id: string;
  tipo: RichiestaTipo;
  stato: RichiestaStato;
  data_inizio: string;
  data_fine: string;
  motivo: string | null;
  note_risposta: string | null;
  created_at: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function RichiesteHrPersonali({ companyId, profiloId }: { companyId: string; profiloId: string }) {
  const qc = useQueryClient();
  const createRichiesta = useCreateRichiesta();

  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<RichiestaTipo>("rettifica_timbratura");
  const [data, setData] = useState(todayIso());
  const [motivo, setMotivo] = useState("");

  const tipoConfig = useMemo(() => TIPI_DIPENDENTE.find((t) => t.value === tipo)!, [tipo]);

  const { data: richieste = [], isLoading } = useQuery({
    queryKey: ["my-richieste", profiloId],
    enabled: !!profiloId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_richieste")
        .select("id, tipo, stato, data_inizio, data_fine, motivo, note_risposta, created_at")
        .eq("profilo_id", profiloId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as RichiestaRow[];
    },
  });

  // Annulla una richiesta ancora in attesa (RLS: hr_richieste_self_update)
  const annullaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hr_richieste")
        .update({ stato: "annullata", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("profilo_id", profiloId)
        .eq("stato", "in_attesa");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-richieste", profiloId] });
      qc.invalidateQueries({ queryKey: ["hr-richieste"] });
      toast.success("Richiesta annullata");
    },
    onError: (e: unknown) => toast.error("Errore: " + (e instanceof Error ? e.message : "riprova")),
  });

  function resetForm() {
    setTipo("rettifica_timbratura");
    setData(todayIso());
    setMotivo("");
  }

  function handleSubmit() {
    const testo = motivo.trim();
    if (!testo) {
      toast.error("Descrivi la tua richiesta nel campo note");
      return;
    }
    const giorno = tipoConfig.needsDate ? data : todayIso();
    createRichiesta.mutate(
      {
        profilo_id: profiloId,
        tipo,
        data_inizio: giorno,
        data_fine: giorno,
        motivo: testo,
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["my-richieste", profiloId] });
          setOpen(false);
          resetForm();
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquarePlus className="h-4 w-4" />
              Richieste e segnalazioni
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Invia una richiesta o una nota all'HR / amministrazione
            </p>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => { resetForm(); setOpen(true); }}>
            <PencilLine className="h-4 w-4" />
            <span className="hidden sm:inline">Nuova</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : richieste.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nessuna richiesta inviata</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Usa "Nuova" per segnalare qualcosa all'amministrazione
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {richieste.map((r) => {
              const stato = STATO_STYLE[r.stato] ?? STATO_STYLE.in_attesa;
              const StatoIcon = stato.icon;
              const isRange = r.data_fine && r.data_fine !== r.data_inizio;
              return (
                <div key={r.id} className="rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                        <Badge variant="outline" className={cn("text-[10px] gap-1 px-1.5 py-0", stato.className)}>
                          <StatoIcon className="h-2.5 w-2.5" />
                          {stato.label}
                        </Badge>
                      </div>
                      {r.motivo && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.motivo}</p>
                      )}
                      {r.note_risposta && (
                        <p className="text-xs mt-1 rounded bg-muted/60 px-2 py-1">
                          <span className="font-medium">Risposta:</span> {r.note_risposta}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {format(parseISO(r.data_inizio), "dd/MM/yy")}
                        {isRange && ` → ${format(parseISO(r.data_fine), "dd/MM/yy")}`}
                      </p>
                      {r.stato === "in_attesa" && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-red-600 mt-1"
                          disabled={annullaMutation.isPending}
                          onClick={() => annullaMutation.mutate(r.id)}
                        >
                          Annulla
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Dialog nuova richiesta */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova richiesta</DialogTitle>
            <DialogDescription>
              La richiesta viene inviata all'HR / amministrazione, che riceve una notifica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="tipo-richiesta">Tipo</Label>
              <select
                id="tipo-richiesta"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as RichiestaTipo)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TIPI_DIPENDENTE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{tipoConfig.help}</p>
            </div>

            {tipoConfig.needsDate && (
              <div className="space-y-1.5">
                <Label htmlFor="data-richiesta">{tipoConfig.dateLabel ?? "Data"}</Label>
                <Input
                  id="data-richiesta"
                  type="date"
                  value={data}
                  max={todayIso()}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="motivo-richiesta">
                {tipo === "rettifica_timbratura" ? "Cosa correggere" : "Descrizione"}
              </Label>
              <Textarea
                id="motivo-richiesta"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                placeholder={
                  tipo === "rettifica_timbratura"
                    ? "Es. ho dimenticato di timbrare l'uscita alle 18:00"
                    : "Scrivi qui la tua richiesta o segnalazione…"
                }
                maxLength={1000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={createRichiesta.isPending}>
              Annulla
            </Button>
            <Button onClick={handleSubmit} disabled={createRichiesta.isPending} className="gap-1.5">
              {createRichiesta.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Invia richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
