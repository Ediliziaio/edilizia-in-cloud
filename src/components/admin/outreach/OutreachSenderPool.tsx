import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Globe, Mailbox, Plus, Trash2, Flame, ShieldCheck, AlertTriangle, Copy, Pause, Play, RefreshCw } from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Gestione infrastruttura di invio cold: DOMINI → CASELLE (email) annidate per
 * dominio, raggruppate per brand. Per ogni dominio: stato, badge DNS verificabili,
 * pannello "DNS da configurare" (record da inserire), e creazione caselle facile
 * (local-part @ dominio). Per ogni casella: warm-up, cap, pausa/riattiva, elimina.
 * Tabelle outreach_* (migrazioni 20270815000000 + 20270817000000 brand).
 */

const T_DOMAINS = "outreach_sending_domains";
const T_SENDERS = "outreach_sender_accounts";

interface Domain {
  id: string; company_id: string; domain: string; status: string;
  spf_verified: boolean; dkim_verified: boolean; dmarc_verified: boolean; daily_cap: number; brand_id: string | null;
}
interface Sender {
  id: string; email: string; display_name: string | null; provider: string; status: string;
  sending_domain_id: string | null; daily_cap_target: number; warmup_day: number; daily_sent: number;
}

const effectiveCap = (s: Sender, base = 5, step = 5) => Math.min(s.daily_cap_target, base + s.warmup_day * step);

export function OutreachSenderPool({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [showDomain, setShowDomain] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainCap, setNewDomainCap] = useState("200");
  const [domainBrandId, setDomainBrandId] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const brands = useQuery({
    queryKey: ["outreach-brands", companyId],
    retry: false,
    queryFn: async () => {
      const { data } = await db.from("outreach_brands").select("id,name").eq("company_id", companyId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

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
      if (!domain.includes(".")) throw new Error("Dominio non valido");
      const { error } = await db.from(T_DOMAINS).insert({ company_id: companyId, domain, daily_cap: Number(newDomainCap) || 200, brand_id: domainBrandId || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dominio aggiunto"); setNewDomain(""); setDomainBrandId(""); setShowDomain(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (pool.isLoading) return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (pool.error && isMissingTableError(pool.error)) {
    return <MigrationGate title="Pool mittenti & domini cold — pronto" unlocks={[
      "Più caselle su domini cold dedicati, con rotazione automatica.",
      "Warm-up per casella con cap crescente e auto-pausa su bounce.",
      "DNS guidato (SPF/DKIM/DMARC) per ogni dominio.",
    ]} />;
  }
  if (pool.error) {
    return <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-red-600"><AlertTriangle className="h-4 w-4" /> Errore: {pool.error instanceof Error ? pool.error.message : "imprevisto"}</CardContent></Card>;
  }

  const domains = (pool.data?.domains ?? []).slice();
  const senders = pool.data?.senders ?? [];
  const totalCapacity = senders.filter((s) => s.status !== "disabled").reduce((sum, s) => sum + effectiveCap(s), 0);
  const brandName = new Map((brands.data ?? []).map((b) => [b.id, b.name]));
  const sendersByDomain = new Map<string, Sender[]>();
  for (const s of senders) {
    if (!s.sending_domain_id) continue;
    const arr = sendersByDomain.get(s.sending_domain_id) ?? [];
    arr.push(s); sendersByDomain.set(s.sending_domain_id, arr);
  }
  const noDomain = senders.filter((s) => !s.sending_domain_id);
  // ordina i domini per brand (così sono raggruppati visivamente)
  domains.sort((a, b) => (brandName.get(a.brand_id ?? "") ?? "~").localeCompare(brandName.get(b.brand_id ?? "") ?? "~") || a.domain.localeCompare(b.domain));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Globe} label="Domini" value={domains.length} />
        <Stat icon={Mailbox} label="Caselle" value={senders.length} />
        <Stat icon={Flame} label="Capacità/giorno" value={totalCapacity} hint="cap effettivo (warm-up)" tone="good" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> Domini & caselle</CardTitle>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowDomain((v) => !v)}><Plus className="h-3.5 w-3.5" /> Dominio</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {showDomain && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-[160px] flex-1 space-y-1"><Label className="text-xs">Dominio cold</Label><Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="mail-edilizia.com" className="h-8" /></div>
              <div className="w-20 space-y-1"><Label className="text-xs">Cap/g</Label><Input type="number" value={newDomainCap} onChange={(e) => setNewDomainCap(e.target.value)} className="h-8" /></div>
              <div className="w-[150px] space-y-1"><Label className="text-xs">Brand</Label>
                <Select value={domainBrandId || "none"} onValueChange={(v) => setDomainBrandId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— nessuno —</SelectItem>{(brands.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button size="sm" className="h-8" disabled={addDomain.isPending} onClick={() => addDomain.mutate()}>{addDomain.isPending ? "…" : "Salva"}</Button>
            </div>
          )}

          {domains.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Nessun dominio. Aggiungi un dominio cold dedicato (mai il dominio principale).</p>
          ) : domains.map((d) => (
            <DomainCard key={d.id} domain={d} caselle={sendersByDomain.get(d.id) ?? []} brandName={d.brand_id ? brandName.get(d.brand_id) : undefined} onChange={invalidate} />
          ))}

          {noDomain.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-muted-foreground">Caselle senza dominio</p>
              {noDomain.map((s) => <CasellaRow key={s.id} casella={s} onChange={invalidate} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DomainCard({ domain, caselle, brandName, onChange }: { domain: Domain; caselle: Sender[]; brandName?: string; onChange: () => void }) {
  const [showDns, setShowDns] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [locals, setLocals] = useState("");
  const [cap, setCap] = useState("40");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [verifying, setVerifying] = useState(false);

  async function verifyDns() {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-verify-dns", { body: { domain_id: domain.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.found === false) toast.info(data.message || "Dominio non ancora su Elastic Email");
      else toast.success(`DNS verificato: SPF ${data?.spf_verified ? "✓" : "✗"} · DKIM ${data?.dkim_verified ? "✓" : "✗"}`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verifica non riuscita");
    } finally {
      setVerifying(false);
    }
  }

  async function addCaselle() {
    const parts = [...new Set(locals.split(/[\n,;\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean))];
    const emails = parts.map((p) => (p.includes("@") ? p : `${p}@${domain.domain}`)).filter((e) => e.includes("@") && e.includes("."));
    if (emails.length === 0) { toast.error("Inserisci almeno un indirizzo (es. marco)"); return; }
    setBusy(true);
    try {
      const rows = emails.map((email) => ({
        company_id: domain.company_id, email, provider: "elastic_email",
        sending_domain_id: domain.id, brand_id: domain.brand_id, daily_cap_target: Number(cap) || 40,
      }));
      const { error } = await db.from(T_SENDERS).upsert(rows, { onConflict: "company_id,email", ignoreDuplicates: true });
      if (error) throw error;
      toast.success(`${emails.length} ${emails.length === 1 ? "casella creata" : "caselle create"}`);
      setLocals(""); setShowAdd(false); onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusy(false); }
  }

  async function toggleDns(field: "spf_verified" | "dkim_verified" | "dmarc_verified", cur: boolean) {
    const { error } = await db.from(T_DOMAINS).update({ [field]: !cur }).eq("id", domain.id);
    if (error) { toast.error(error.message); return; }
    onChange();
  }
  async function del() {
    const { error } = await db.from(T_DOMAINS).delete().eq("id", domain.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dominio rimosso"); onChange();
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{domain.domain}</span>
            <Badge variant={domain.status === "active" ? "default" : "secondary"} className="text-[10px]">{domain.status}</Badge>
            {brandName && <Badge variant="outline" className="text-[10px]">{brandName}</Badge>}
            <span className="text-[11px] text-muted-foreground">{caselle.length} caselle · {domain.daily_cap}/g</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <DnsBadge ok={domain.spf_verified} label="SPF" onClick={() => toggleDns("spf_verified", domain.spf_verified)} />
            <DnsBadge ok={domain.dkim_verified} label="DKIM" onClick={() => toggleDns("dkim_verified", domain.dkim_verified)} />
            <DnsBadge ok={domain.dmarc_verified} label="DMARC" onClick={() => toggleDns("dmarc_verified", domain.dmarc_verified)} />
            <button className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-700 hover:bg-orange-100 disabled:opacity-60" onClick={verifyDns} disabled={verifying}>
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Verifica DNS
            </button>
            <button className="text-[11px] text-orange-600 hover:underline" onClick={() => setShowDns((v) => !v)}>{showDns ? "nascondi DNS" : "DNS da configurare"}</button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setShowAdd((v) => !v)}><Plus className="h-3.5 w-3.5" /> Casella</Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={del}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {showDns && (
        <div className="space-y-1.5 border-t bg-muted/20 p-2.5 text-xs">
          <p className="text-muted-foreground">Inserisci questi record nel DNS del dominio, poi premi <strong>Verifica DNS</strong> (legge lo stato reale da Elastic Email). I badge restano cliccabili come override manuale.</p>
          <DnsRow type="TXT" host="@" value="v=spf1 a mx include:_spf.elasticemail.com ~all" />
          <DnsRow type="TXT" host={`api._domainkey.${domain.domain}`} value="(valore DKIM dal pannello Elastic Email)" />
          <DnsRow type="TXT" host={`_dmarc.${domain.domain}`} value="v=DMARC1; p=none; rua=mailto:dmarc@" />
          <p className="text-[10px] text-muted-foreground">Il valore DKIM è generato da Elastic Email quando aggiungi il dominio nel loro pannello. Posso integrarlo via API se vuoi.</p>
        </div>
      )}

      {showAdd && (
        <div className="space-y-2 border-t bg-muted/20 p-2.5">
          <Label className="text-xs">Crea caselle su <span className="font-mono">@{domain.domain}</span> — un nome per riga (es. <code>marco</code>, <code>info</code>)</Label>
          <Textarea value={locals} onChange={(e) => setLocals(e.target.value)} rows={2} placeholder={"marco\ninfo\nlucia"} className="text-sm" />
          <div className="flex items-end gap-2">
            <div className="w-24 space-y-1"><Label className="text-xs">Cap/g target</Label><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-8" /></div>
            <Button size="sm" className="h-8" disabled={busy} onClick={addCaselle}>{busy ? "…" : "Crea caselle"}</Button>
          </div>
        </div>
      )}

      {caselle.length > 0 && (
        <div className="space-y-1 border-t p-2">
          {caselle.map((s) => <CasellaRow key={s.id} casella={s} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

function CasellaRow({ casella, onChange }: { casella: Sender; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const paused = casella.status === "paused" || casella.status === "disabled";

  async function setStatus(status: string) {
    setBusy(true);
    const { error } = await db.from(T_SENDERS).update({ status }).eq("id", casella.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChange();
  }
  async function del() {
    const { error } = await db.from(T_SENDERS).delete().eq("id", casella.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Casella rimossa"); onChange();
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs">{casella.email}</span>
          <Badge variant={casella.status === "active" ? "default" : casella.status === "warming" ? "secondary" : "outline"} className="text-[10px]">{casella.status}</Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{casella.provider}</span>
          <span>· warm-up g.{casella.warmup_day}</span>
          <span>· {casella.daily_sent}/{effectiveCap(casella)} oggi</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => setStatus(paused ? "warming" : "paused")}>
          {paused ? <><Play className="h-3.5 w-3.5" /> Riattiva</> : <><Pause className="h-3.5 w-3.5" /> Pausa</>}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={del}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function DnsRow({ type, host, value }: { type: string; host: string; value: string }) {
  async function copy() {
    try { await navigator.clipboard.writeText(value); toast.success("Copiato"); } catch { /* no-op */ }
  }
  return (
    <div className="flex items-center gap-2 rounded border bg-card px-2 py-1">
      <Badge variant="outline" className="shrink-0 text-[10px]">{type}</Badge>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{host}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{value}</span>
      <button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={copy} title="Copia"><Copy className="h-3.5 w-3.5" /></button>
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

function DnsBadge({ ok, label, onClick }: { ok: boolean; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Clic per segnare verificato/non verificato"
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${ok ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
      {ok ? "✓ " : ""}{label}
    </button>
  );
}
