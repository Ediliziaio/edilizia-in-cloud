/**
 * LogCallButton — registra MANUALMENTE una chiamata su un contatto/opportunità,
 * senza centralino. Scrive una riga strutturata in `call_logs` (letta da
 * UnifiedContactTimeline e — dopo l'aggiunta — da ContactActivityRegister), così
 * "quante volte ho chiamato" diventa contabile e l'esito resta tracciato.
 *
 * Esito "Da richiamare" + data → oltre alla nota, se è passato `opportunityId`
 * imposta la PROSSIMA AZIONE dell'opportunità (next_action/next_action_date),
 * che è la worklist già usata dalla diagnosi venditori e dai report CRM.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Codici outcome + etichetta IT. Allineati a UnifiedContactTimeline/ContactActivityRegister. */
export const CALL_OUTCOMES: { value: string; label: string }[] = [
  { value: "answered", label: "Risposto" },
  { value: "no_answer", label: "Non risposto" },
  { value: "busy", label: "Occupato" },
  { value: "wrong_number", label: "Numero errato" },
  { value: "callback", label: "Da richiamare" },
];

/** dd/mm/yyyy da una stringa "YYYY-MM-DD" senza passare per Date (no UTC drift). */
function formatItDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

interface Props {
  companyId?: string | null;
  contactId?: string | null;
  userId?: string | null;
  /** Se presente, su "Da richiamare" + data imposta la prossima azione dell'opportunità. */
  opportunityId?: string | null;
  className?: string;
  onLogged?: () => void;
}

export function LogCallButton({ companyId, contactId, userId, opportunityId, className, onLogged }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [saving, setSaving] = useState(false);

  const isCallback = outcome === "callback";
  const todayLocal = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD locale, per il min

  const reset = () => {
    setOutcome("answered");
    setNotes("");
    setCallbackDate("");
  };

  const handleSave = async () => {
    if (!companyId || !userId) {
      toast.error("Sessione non valida: riprova ad accedere.");
      return;
    }
    setSaving(true);

    const richiamoLine = isCallback && callbackDate ? `Richiamare il ${formatItDate(callbackDate)}` : "";
    const finalNotes = [richiamoLine, notes.trim()].filter(Boolean).join(" — ") || null;

    const { error } = await supabase.from("call_logs").insert({
      company_id: companyId,
      contact_id: contactId ?? null,
      user_id: userId,
      outcome,
      notes: finalNotes,
      started_at: new Date().toISOString(),
      duration_sec: 0,
    });
    if (error) {
      setSaving(false);
      toast.error("Non sono riuscito a registrare la chiamata. Riprova.");
      return;
    }

    // Worklist: su "Da richiamare" + data, imposta la prossima azione dell'opportunità.
    if (opportunityId && isCallback && callbackDate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("marketing_opportunities")
        .update({ next_action: "Richiamare (tel)", next_action_date: callbackDate })
        .eq("id", opportunityId)
        .eq("company_id", companyId);
    }

    setSaving(false);
    toast.success(isCallback && callbackDate ? "Chiamata registrata · richiamo pianificato" : "Chiamata registrata");
    // Le due timeline del contatto: UnifiedContactTimeline (["unified_call_logs"])
    // e ContactActivityRegister (["reg-calls"]).
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        // marketing-opportunities: se sopra abbiamo scritto next_action sulla
        // opportunità, kanban/worklist mostravano il valore stale per 2 minuti.
        return k === "unified_call_logs" || k === "reg-calls" || k === "marketing-opportunities";
      },
    });
    onLogged?.();
    setOpen(false);
    reset();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        disabled={!contactId}
        title={contactId ? "Registra una chiamata fatta a questo contatto" : "Contatto non disponibile"}
      >
        <Phone className="mr-1.5 h-4 w-4" />
        Registra chiamata
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registra chiamata</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Esito</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CALL_OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCallback && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Richiamami il</Label>
                <input
                  type="date"
                  value={callbackDate}
                  min={todayLocal}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  aria-label="Data richiamo"
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700"
                />
                {opportunityId && (
                  <p className="text-[11px] text-muted-foreground">
                    Imposterà la “prossima azione” dell’opportunità a questa data.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nota (opzionale)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cosa è emerso dalla chiamata…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Annulla
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Salvo…" : "Salva chiamata"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default LogCallButton;
