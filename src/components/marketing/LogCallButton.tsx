/**
 * LogCallButton — registra MANUALMENTE una chiamata su un contatto, senza
 * bisogno del centralino/softphone. Scrive una riga strutturata in `call_logs`
 * (la stessa tabella letta da UnifiedContactTimeline e dai report), così che
 * "quante volte ho chiamato" diventi contabile e l'esito resti tracciato —
 * invece di finire solo in una nota di testo libero.
 *
 * Esiti coerenti con la mappa di UnifiedContactTimeline (outcome → etichetta).
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

/** Codici outcome + etichetta IT. Allineati a UnifiedContactTimeline. */
export const CALL_OUTCOMES: { value: string; label: string }[] = [
  { value: "answered", label: "Risposto" },
  { value: "no_answer", label: "Non risposto" },
  { value: "busy", label: "Occupato" },
  { value: "wrong_number", label: "Numero errato" },
  { value: "callback", label: "Da richiamare" },
];

interface Props {
  companyId?: string | null;
  contactId?: string | null;
  userId?: string | null;
  className?: string;
  /** chiamato dopo un salvataggio riuscito (es. refresh extra) */
  onLogged?: () => void;
}

export function LogCallButton({ companyId, contactId, userId, className, onLogged }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!companyId || !userId) {
      toast.error("Sessione non valida: riprova ad accedere.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("call_logs").insert({
      company_id: companyId,
      contact_id: contactId ?? null,
      user_id: userId,
      outcome,
      notes: notes.trim() || null,
      started_at: new Date().toISOString(),
      duration_sec: 0,
    });
    setSaving(false);
    if (error) {
      toast.error("Non sono riuscito a registrare la chiamata. Riprova.");
      return;
    }
    toast.success("Chiamata registrata");
    // La timeline del contatto legge ["unified_call_logs", contactId].
    queryClient.invalidateQueries({ queryKey: ["unified_call_logs", contactId] });
    onLogged?.();
    setOpen(false);
    setOutcome("answered");
    setNotes("");
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
