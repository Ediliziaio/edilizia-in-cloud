import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Globe, Mailbox, Plus, Trash2, Flame, ShieldCheck, AlertTriangle } from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Sender pool & domini cold (Fase 2). Vive sulle tabelle outreach_* della
 * migrazione 20270815000000: finché non è applicata mostra il MigrationGate.
 * Le tabelle non sono ancora in types.ts → accesso via cast (come da prassi
 * del repo per tabelle non rigenerate).
 */

const T_DOMAINS = "outreach_sending_domains";
const T_SENDERS = "outreach_sender_accounts";

interface Domain {
  id: string; domain: string; status: string;
  spf_verified: boolean; dkim_verified: boolean; dmarc_verified: boolean; daily_cap: number;
}
interface Sender {
  id: string; email: string; display_name: string | null; provider: string; status: string;
  sending_domain_id: string | null; daily_cap_target: number; warmup_day: number; daily_sent: number;
}

const effectiveCap = (s: Sender, base = 5, step = 5) => Math.min(s.daily_cap_target, base + s.warmup_day * step);

export function OutreachSenderPool({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [showDomain, setShowDomain] = useState(false);
  const [showSender, setShowSender] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainCap, setNewDomainCap] = useState("200");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderDomainId, setSenderDomainId] = useState<string>("");
  const [senderProvider, setSenderProvider] = useState("ses");
  const [senderCap, setSenderCap] = useState("40");

  // db non tipizzato per le tabelle outreach_* (non in types.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const pool = useQuery({
    queryKey: ["outreach-pool", companyId],
    retry: false,
    queryFn: async () => {
      const { data: domains, error: dErr } = await db.from(T_DOMAINS).select("*").eq("company_id", companyId).order("created_at");
      if (dErr) throw dErr;
      const { data: senders, error: sErr } = await db.from(T_SENDERS).select("*").eq("company_id", companyId).order("created_at");
      if (sErr) throw sErr;
      return { domains: (domains ?? []) as Domain[], senders: (senders ?? []) as Sender[] };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach-pool", companyId] });

  const addDomain = useMutation({
    mutationFn: async () => {
      const domain = newDomain.trim().toLowerCase();
      if (!domain) throw new Error("Dominio mancante");
      const { error } = await db.from(T_DOMAINS).insert({ company_id: companyId, domain, daily_cap: Number(newDomainCap) || 200 });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dominio aggiunto"); setNewDomain(""); setShowDomain(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const addSender = useMutation({
    mutationFn: async () => {
      const email = senderEmail.trim().toLowerCase();
      if (!email) throw new Error("Email mancante");
      const { error } = await db.from(T_SENDERS).insert({
        company_id: companyId, email, provider: senderProvider,
        sending_domain_id: senderDomainId || null, daily_cap_target: Number(senderCap) || 40,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Casella aggiunta (in warm-up)"); setSenderEmail(""); setShowSender(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const del = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rimosso"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (pool.isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (pool.error && isMissingTableError(pool.error)) {
    return (
      <MigrationGate
        title="Pool mittenti & domini cold — pronto"
        unlocks={[
          "Più caselle su domini cold dedicati, con rotazione automatica.",
          "Warm-up per casella con cap crescente e auto-pausa su bounce.",
          "Coda di invio con throttle nel tempo (Fase 2).",
        ]}
      />
    );
  }
  if (pool.error) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-red-600">
        <AlertTriangle className="h-4 w-4" /> Errore: {pool.error instanceof Error ? pool.error.message : "imprevisto"}
      </CardContent></Card>
    );
  }

  const domains = pool.data?.domains ?? [];
  const senders = pool.data?.senders ?? [];
  const totalCapacity = senders.filter((s) => s.status !== "disabled").reduce((sum, s) => sum + effectiveCap(s), 0);

  return (
    <div className="space-y-4">
      {/* Capacità */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Globe} label="Domini" value={domains.length} />
        <Stat icon={Mailbox} label="Caselle" value={senders.length} />
        <Stat icon={Flame} label="Capacità/giorno" value={totalCapacity} hint="cap effettivo (warm-up)" tone="good" />
      </div>

      {/* Domini */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> Domini cold</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowDomain((v) => !v)}><Plus className="h-3.5 w-3.5" /> Dominio</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {showDomain && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex-1 space-y-1"><Label className="text-xs">Dominio</Label><Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="mail-edilizia.com" className="h-8" /></div>
              <div className="w-24 space-y-1"><Label className="text-xs">Cap/g</Label><Input type="number" value={newDomainCap} onChange={(e) => setNewDomainCap(e.target.value)} className="h-8" /></div>
              <Button size="sm" className="h-8" disabled={addDomain.isPending} onClick={() => addDomain.mutate()}>{addDomain.isPending ? "…" : "Salva"}</Button>
            </div>
          )}
          {domains.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Nessun dominio. Aggiungi un dominio cold dedicato (mai il dominio principale).</p>
          ) : domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="font-mono text-sm">{d.domain}</span><Badge variant={d.status === "active" ? "default" : "secondary"} className="text-[10px]">{d.status}</Badge></div>
                <div className="mt-1 flex gap-1.5">
                  <DnsBadge ok={d.spf_verified} label="SPF" /><DnsBadge ok={d.dkim_verified} label="DKIM" /><DnsBadge ok={d.dmarc_verified} label="DMARC" />
                  <span className="text-[11px] text-muted-foreground">· {d.daily_cap}/g</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => del.mutate({ table: T_DOMAINS, id: d.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Caselle */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Mailbox className="h-4 w-4" /> Caselle mittenti</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowSender((v) => !v)}><Plus className="h-3.5 w-3.5" /> Casella</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {showSender && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 space-y-1"><Label className="text-xs">Email</Label><Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="marco@mail-edilizia.com" className="h-8" /></div>
                <div className="w-28 space-y-1"><Label className="text-xs">Cap/g target</Label><Input type="number" value={senderCap} onChange={(e) => setSenderCap(e.target.value)} className="h-8" /></div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label className="text-xs">Provider</Label>
                  <Select value={senderProvider} onValueChange={setSenderProvider}><SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ses">Amazon SES</SelectItem><SelectItem value="smtp">SMTP</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Dominio</Label>
                  <Select value={senderDomainId || "none"} onValueChange={(v) => setSenderDomainId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">—</SelectItem>{domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>)}</SelectContent></Select>
                </div>
                <Button size="sm" className="h-8" disabled={addSender.isPending} onClick={() => addSender.mutate()}>{addSender.isPending ? "…" : "Salva"}</Button>
              </div>
            </div>
          )}
          {senders.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Nessuna casella. Aggiungi più caselle per distribuire il volume e proteggere la reputazione.</p>
          ) : senders.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="truncate font-mono text-sm">{s.email}</span>
                  <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{s.provider}</span>
                  <span>· warm-up g.{s.warmup_day}</span>
                  <span>· {s.daily_sent}/{effectiveCap(s)} oggi</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => del.mutate({ table: T_SENDERS, id: s.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Globe; label: string; value: number; hint?: string; tone?: "default" | "good" }) {
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${tone === "good" ? "text-emerald-600" : ""}`}>{value.toLocaleString("it-IT")}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </CardContent></Card>
  );
}

function DnsBadge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{label}</span>;
}
