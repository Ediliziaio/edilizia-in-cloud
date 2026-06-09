import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound, Mail, Send, Unlock, Loader2, Pencil, Check, X, ShieldCheck, ShieldAlert, AlertCircle,
} from "lucide-react";

export type AccessDenormTable = "referrers" | "companies" | "accountant_firms";

interface LoginStatus {
  success: boolean;
  email: string;
  has_account: boolean;
  email_confirmed?: boolean;
  banned?: boolean;
  last_sign_in_at?: string | null;
}

// Estrae il messaggio d'errore reale dal corpo della risposta della edge function.
async function invokeManage(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-manage-login", { body });
  if (error) {
    let msg = error.message;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = await (error as any).context?.json?.();
      if (j?.error) msg = j.error;
    } catch { /* corpo non-JSON: tieni il messaggio originale */ }
    throw new Error(msg || "Operazione fallita");
  }
  return data as Record<string, unknown>;
}

/**
 * AccessControlDialog — pannello super_admin per gestire i DATI DI ACCESSO
 * (login) di un attore gestito: referrer, admin produttore/rivenditore, owner
 * studio commercialista. Vede stato, cambia email, invia reset password, sblocca.
 * Tutte le operazioni passano dalla edge function `admin-manage-login` (gate
 * super_admin). La password non viene MAI impostata in chiaro: solo link di reset.
 */
export function AccessControlDialog({
  open, onOpenChange, email, label, denorm, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string | null;
  label?: string;
  denorm?: { table: AccessDenormTable; id: string } | null;
  onChanged?: (newEmail?: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");

  const statusKey = ["admin-login-status", email] as const;
  const { data: status, isLoading } = useQuery({
    queryKey: statusKey,
    enabled: open && !!email,
    staleTime: 10_000,
    queryFn: async (): Promise<LoginStatus> =>
      invokeManage({ action: "get_status", email }) as Promise<LoginStatus>,
  });

  const sendRecovery = useMutation({
    mutationFn: () => invokeManage({ action: "send_recovery", email }),
    onSuccess: () => toast.success("Email di reset inviata", { description: `Link inviato a ${email}.` }),
    onError: (e) => toast.error("Invio fallito", { description: (e as Error).message }),
  });

  const unblock = useMutation({
    mutationFn: () => invokeManage({ action: "unblock", email }),
    onSuccess: () => {
      toast.success("Accesso sbloccato");
      qc.invalidateQueries({ queryKey: statusKey });
    },
    onError: (e) => toast.error("Sblocco fallito", { description: (e as Error).message }),
  });

  const changeEmail = useMutation({
    mutationFn: (newEmail: string) =>
      invokeManage({ action: "change_email", email, new_email: newEmail, denorm: denorm ?? undefined }),
    onSuccess: (_d, newEmail) => {
      toast.success("Email di accesso aggiornata", { description: newEmail });
      setEditing(false);
      qc.invalidateQueries({ queryKey: statusKey });
      onChanged?.(newEmail);
    },
    onError: (e) => toast.error("Cambio email fallito", { description: (e as Error).message }),
  });

  const anyPending = sendRecovery.isPending || unblock.isPending || changeEmail.isPending;
  const hasAccount = status?.has_account ?? true; // ottimista finché carica
  const banned = !!status?.banned;

  function startEdit() {
    setDraftEmail(email ?? "");
    setEditing(true);
  }
  function saveEdit() {
    const v = draftEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(v)) {
      toast.error("Email non valida");
      return;
    }
    if (v === (email ?? "").toLowerCase()) {
      setEditing(false);
      return;
    }
    changeEmail.mutate(v);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!anyPending) { setEditing(false); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Accesso{label ? ` — ${label}` : ""}
          </DialogTitle>
          <DialogDescription>
            Gestisci i dati di login. La password non è mai visibile né impostabile a mano: si invia un link di reset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stato account */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isLoading ? (
              <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Verifica stato…</span>
            ) : !hasAccount ? (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700"><AlertCircle className="h-3 w-3" /> Nessun account ancora</Badge>
            ) : (
              <>
                {status?.email_confirmed
                  ? <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700"><ShieldCheck className="h-3 w-3" /> Email confermata</Badge>
                  : <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700"><ShieldAlert className="h-3 w-3" /> Email da confermare</Badge>}
                {banned && <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700"><ShieldAlert className="h-3 w-3" /> Bloccato</Badge>}
                {status?.last_sign_in_at && (
                  <span className="text-muted-foreground">Ultimo accesso {new Date(status.last_sign_in_at).toLocaleDateString("it-IT")}</span>
                )}
              </>
            )}
          </div>

          {/* Email di accesso */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email di accesso</Label>
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  type="email"
                  autoFocus
                  disabled={changeEmail.isPending}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
                />
                <Button size="icon" variant="ghost" className="shrink-0" onClick={saveEdit} disabled={changeEmail.isPending} title="Salva">
                  {changeEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-emerald-600" />}
                </Button>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setEditing(false)} disabled={changeEmail.isPending} title="Annulla">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="truncate text-sm font-medium">{email ?? "—"}</span>
                <Button
                  size="sm" variant="ghost" className="h-7 shrink-0 gap-1 text-xs"
                  onClick={startEdit}
                  disabled={!hasAccount || anyPending}
                  title={hasAccount ? "Cambia email di accesso" : "Account non ancora creato"}
                >
                  <Pencil className="h-3 w-3" /> Cambia
                </Button>
              </div>
            )}
          </div>

          {/* Azioni */}
          <div className="space-y-2 border-t pt-3">
            <Button
              variant="outline" className="w-full justify-start gap-2"
              onClick={() => sendRecovery.mutate()}
              disabled={anyPending}
            >
              {sendRecovery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Invia link per reimpostare la password
            </Button>

            {banned && (
              <Button
                variant="outline" className="w-full justify-start gap-2 border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => unblock.mutate()}
                disabled={anyPending}
              >
                {unblock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                Sblocca l'accesso
              </Button>
            )}

            {!hasAccount && (
              <p className="text-xs text-muted-foreground">
                Questo attore non ha ancora un account. Usa il reinvito dalla sua scheda per crearne uno; il cambio email sarà disponibile dopo il primo accesso.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={anyPending}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
