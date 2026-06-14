import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenLine, Send, Loader2 } from "lucide-react";
import { isMissingTableError } from "./_shared";

/**
 * Componi e invia UNA email al volo da una casella del pool cold.
 * Chiama l'edge function outreach-send-single (gated super_admin). Le caselle
 * arrivano dal pool (outreach_sender_accounts): se la migrazione non è applicata
 * o non ci sono caselle, mostra un suggerimento invece del form.
 */

interface SenderOpt { id: string; email: string; display_name: string | null; status: string; }

export function OutreachComposeDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [senderId, setSenderId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const senders = useQuery({
    queryKey: ["outreach-senders-min", companyId],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from("outreach_sender_accounts")
        .select("id,email,display_name,status").eq("company_id", companyId)
        .in("status", ["active", "warming"]).order("email");
      if (error) throw error;
      return (data ?? []) as SenderOpt[];
    },
  });

  const gated = !!senders.error && isMissingTableError(senders.error);
  const noSenders = !gated && !senders.isLoading && !senders.error && (senders.data?.length ?? 0) === 0;
  const blocked = gated || noSenders;

  async function send() {
    if (!senderId || !to.trim() || !body.trim()) { toast.error("Compila casella, destinatario e testo"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-send-single", {
        body: { sender_account_id: senderId, to: to.trim(), subject, html: body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Email inviata");
      setOpen(false); setTo(""); setSubject(""); setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore invio");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><PenLine className="h-4 w-4" /> Componi email</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Componi email singola</DialogTitle></DialogHeader>

        {blocked ? (
          <p className="py-4 text-sm text-muted-foreground">
            Configura prima almeno una casella mittente nella scheda <strong>Deliverability</strong>
            {gated && " (richiede la migrazione del motore applicata)"}.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Da (casella del pool)</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={senders.isLoading ? "Carico…" : "Scegli casella"} /></SelectTrigger>
                <SelectContent>
                  {(senders.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.display_name ? `${s.display_name} · ${s.email}` : s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">A</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="destinatario@azienda.it" className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Oggetto</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Messaggio</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Ciao, …" /></div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={send} disabled={sending || blocked} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Invia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
