import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldBan, Plus } from "lucide-react";

/**
 * Aggiunta manuale alla blocklist (email_suppressions).
 * Per liste "do-not-contact" del cold outreach: incolla indirizzi → suppression.
 * reason "manual"/"legal" bloccano sia marketing sia transazionale (vedi
 * _shared/emailSuppression.ts). email_normalized è GENERATA: non inserirla.
 * Upsert idempotente sul vincolo (company_id, email_normalized, reason).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SuppressionAddCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState<"manual" | "legal">("manual");
  const [scope, setScope] = useState<"admin" | "global">("admin");
  const [busy, setBusy] = useState(false);

  const { valid, invalid } = useMemo(() => {
    const tokens = raw.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const valid = [...new Set(tokens.filter((t) => EMAIL_RE.test(t)))];
    const invalid = tokens.filter((t) => !EMAIL_RE.test(t)).length;
    return { valid, invalid };
  }, [raw]);

  async function add() {
    if (!valid.length) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const rows = valid.map((email) => ({
        email,
        company_id: scope === "global" ? null : companyId,
        reason,
        suppressed_at: nowIso,
        // source_provider ha un CHECK su valori provider noti: per un inserimento
        // manuale resta NULL; l'origine la registriamo in notes.
        notes: "Blocklist manuale (outreach admin)",
      }));
      const { error } = await supabase
        .from("email_suppressions")
        .upsert(rows as never, { onConflict: "company_id,email_normalized,reason", ignoreDuplicates: true });
      if (error) throw error;
      toast.success(`${valid.length} ${valid.length === 1 ? "indirizzo aggiunto" : "indirizzi aggiunti"} alla blocklist`);
      setRaw("");
      qc.invalidateQueries({ queryKey: ["admin-email-suppressions"] });
      qc.invalidateQueries({ queryKey: ["outreach-count", "suppressed"] });
    } catch (e) {
      toast.error(`Errore: ${e instanceof Error ? e.message : "imprevisto"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldBan className="h-5 w-5 text-amber-500" /> Aggiungi alla blocklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Indirizzi da non contattare mai (richieste di rimozione, reclami, concorrenti).
          Bloccano l'invio prima della partenza.
        </p>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          placeholder={"Incolla email — una per riga o separate da virgola\nesempio@dominio.it\naltro@azienda.com"}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as "manual" | "legal")}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manuale</SelectItem>
                <SelectItem value="legal">Legale / GDPR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ambito</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "admin" | "global")}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Solo outreach admin</SelectItem>
                <SelectItem value="global">Globale (tutte le aziende)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={busy || !valid.length} className="h-9 gap-2">
            <Plus className="h-4 w-4" />
            {busy ? "Aggiungo…" : `Aggiungi ${valid.length || ""}`.trim()}
          </Button>
        </div>
        {(valid.length > 0 || invalid > 0) && (
          <p className="text-xs text-muted-foreground">
            {valid.length} validi{invalid > 0 && <span className="text-amber-600"> · {invalid} ignorati (non email)</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
