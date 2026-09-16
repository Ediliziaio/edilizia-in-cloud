import { useEffect, useState } from "react";
import { istruzioniDns } from "./outreachDns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Globe, Mailbox, Plus, Trash2, Flame, AlertTriangle, Copy, Pause, Play, RefreshCw, Plug, Check, ChevronRight, ChevronDown, MailPlus, Search, X, Pencil, KeyRound } from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";
import {
  FieldLabel, HeatBar, HealthPill, ProviderBadge, StatusDot, senderTone, type Health,
} from "./deliverabilityUi";

/**
 * Gestione infrastruttura di invio cold: DOMINI → CASELLE (email) annidate per
 * dominio, raggruppate per brand. Layout stile Instantly/Smartlead "Email Accounts":
 * card caselle pulite con dot di stato, badge provider, barra warm-up e salute.
 * Per ogni dominio: stato, badge DNS verificabili, pannello "DNS da configurare"
 * (record da inserire), e creazione caselle facile (local-part @ dominio).
 * Tabelle outreach_* (migrazioni 20270815000000 + 20270817000000 brand).
 */

const T_DOMAINS = "outreach_sending_domains";
const T_SENDERS = "outreach_sender_accounts";

// Soglie reputazione allineate a shouldAutoPause (auto-pausa a bounce>=10 || lamentele>=2).
const MAX_BOUNCES = 10;
const MAX_COMPLAINTS = 2;
const WARN_BOUNCES = 5;
const WARN_COMPLAINTS = 1;

function healthLevel(bounce: number, complaint: number): Health {
  if (bounce >= MAX_BOUNCES || complaint >= MAX_COMPLAINTS) return "a rischio";
  if (bounce >= WARN_BOUNCES || complaint >= WARN_COMPLAINTS) return "attenzione";
  return "ok";
}

/** Filtro stato casella per la ricerca a scala. */
type SenderFilter = "all" | "active" | "warming" | "paused" | "risk";

/** La casella passa il filtro testo (email) + stato? Usato per la ricerca a scala. */
function matchesFilter(s: Sender, query: string, filter: SenderFilter): boolean {
  const q = query.trim().toLowerCase();
  if (q && !s.email.toLowerCase().includes(q)) return false;
  if (filter === "all") return true;
  if (filter === "risk") return healthLevel(s.bounce_count ?? 0, s.complaint_count ?? 0) === "a rischio";
  const tone = senderTone(s.status, s.connection_status);
  if (filter === "active") return tone === "active";
  if (filter === "warming") return tone === "warming";
  if (filter === "paused") return tone === "paused" || tone === "error" || tone === "untested";
  return true;
}

interface Domain {
  id: string; company_id: string; domain: string; status: string;
  spf_verified: boolean; dkim_verified: boolean; dmarc_verified: boolean; daily_cap: number; brand_id: string | null;
  dkim_selector?: string | null;
}
interface Sender {
  id: string; email: string; display_name: string | null; provider: string; status: string;
  sending_domain_id: string | null; daily_cap_target: number; warmup_day: number; daily_sent: number;
  connection_status?: string | null; connection_error?: string | null;
  smtp_host?: string | null; bounce_count?: number | null; complaint_count?: number | null;
  oauth_connection_id?: string | null; warmup_base?: number | null; warmup_step?: number | null;
  signature?: string | null;
  // `secret_ref` e' il puntatore al Vault: se manca, la casella non ha una
  // password e non spedira' mai — la card lo deve poter dire e risolvere.
  secret_ref?: string | null;
  smtp_port?: number | null; smtp_secure?: boolean | null; smtp_username?: string | null;
  imap_host?: string | null; imap_port?: number | null; imap_secure?: boolean | null;
}

const BASE = 5;
const STEP = 5;
// Cap del giorno = min(target, base + giorno × step) con i valori DELLA CASELLA
// (prima 5/5 fissi: cap mostrato ≠ cap usato dal dispatcher).
const effectiveCap = (s: Sender, base = BASE, step = STEP) =>
  Math.min(s.daily_cap_target, (s.warmup_base ?? base) + s.warmup_day * (s.warmup_step ?? step));

export function OutreachSenderPool({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [showDomain, setShowDomain] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainCap, setNewDomainCap] = useState("200");
  const [domainBrandId, setDomainBrandId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SenderFilter>("all");
  // "" = tutti i brand. Con cinque brand la lista piatta non si legge.
  const [brandFilter, setBrandFilter] = useState("");

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

  if (pool.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="space-y-3">
          <div className="h-5 w-44 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
        </div>
      </section>
    );
  }
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
  const activeCount = senders.filter((s) => senderTone(s.status, s.connection_status) === "active").length;
  const brandName = new Map((brands.data ?? []).map((b) => [b.id, b.name]));

  // Ricerca/filtro a scala: con tante caselle, restringi per email + stato. Il
  // raggruppamento per dominio opera sulle SOLE caselle che passano il filtro; i
  // domini senza match spariscono mentre filtri (riappaiono a filtro azzerato).
  const filtering = search.trim() !== "" || filter !== "all";
  const filtered = filtering ? senders.filter((s) => matchesFilter(s, search, filter)) : senders;
  const matchCount = filtered.length;

  const sendersByDomain = new Map<string, Sender[]>();
  for (const s of filtered) {
    if (!s.sending_domain_id) continue;
    const arr = sendersByDomain.get(s.sending_domain_id) ?? [];
    arr.push(s); sendersByDomain.set(s.sending_domain_id, arr);
  }
  const noDomain = filtered.filter((s) => !s.sending_domain_id);
  // ordina i domini per brand (così sono raggruppati visivamente)
  domains.sort((a, b) => (brandName.get(a.brand_id ?? "") ?? "~").localeCompare(brandName.get(b.brand_id ?? "") ?? "~") || a.domain.localeCompare(b.domain));
  // quando filtri, mostra solo i domini che hanno almeno una casella corrispondente
  const perBrand = brandFilter ? domains.filter((d) => (d.brand_id ?? "") === brandFilter) : domains;
  const visibleDomains = filtering ? perBrand.filter((d) => (sendersByDomain.get(d.id)?.length ?? 0) > 0) : perBrand;

  // La domanda vera davanti a questa pagina non è "quanti domini ho": è "questo
  // brand è pronto a spedire?". La risposta sta nella somma delle sue caselle e
  // nel DNS dei suoi domini — quindi il brand diventa il contenitore, non
  // un'etichetta stampata su ogni riga.
  const gruppiBrand: {
    brandId: string; nome: string; domini: Domain[];
    nCaselle: number; capacita: number; daCollegare: number; dnsCompleti: number;
  }[] = [];
  {
    const mappa = new Map<string, Domain[]>();
    for (const d of visibleDomains) {
      const k = d.brand_id ?? "";
      const arr = mappa.get(k) ?? [];
      arr.push(d);
      mappa.set(k, arr);
    }
    for (const [brandId, doms] of mappa) {
      const caselle = doms.flatMap((d) => sendersByDomain.get(d.id) ?? []);
      gruppiBrand.push({
        brandId,
        nome: brandId ? (brandName.get(brandId) ?? "Brand rimosso") : "Senza brand",
        domini: doms,
        nCaselle: caselle.length,
        capacita: caselle.filter((c) => c.status !== "disabled").reduce((t, c) => t + effectiveCap(c), 0),
        daCollegare: caselle.filter((c) => (c.connection_status ?? "untested") === "untested").length,
        dnsCompleti: doms.filter((d) => d.spf_verified && d.dkim_verified && d.dmarc_verified).length,
      });
    }
    // "Senza brand" per ultimo: è il residuo, non una categoria.
    gruppiBrand.sort((a, b) =>
      a.brandId === "" ? 1 : b.brandId === "" ? -1 : a.nome.localeCompare(b.nome));
  }

  // Per le azioni di massa del brand servono TUTTI i suoi domini e caselle,
  // non solo quelli che passano la ricerca.
  const brandDiDominio = new Map(domains.map((d) => [d.id, d.brand_id ?? ""]));

  const empty = domains.length === 0 && senders.filter((s) => !s.sending_domain_id).length === 0;
  const noMatches = !empty && filtering && matchCount === 0;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 shadow-sm sm:p-5">
      {/* header sezione */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Mailbox className="h-4 w-4 text-primary" /> Caselle mittenti
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Domini cold dedicati e caselle in rotazione, con warm-up e DNS.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" onClick={() => setShowDomain((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Dominio
        </Button>
      </header>

      {/* riepilogo pool */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Globe} label="Domini" value={domains.length} />
        <Stat icon={Mailbox} label="Caselle" value={senders.length} hint={activeCount > 0 ? `${activeCount} attive` : undefined} />
        <Stat icon={Flame} label="Capacità/giorno" value={totalCapacity} hint="cap effettivo (warm-up)" tone="good" />
      </div>

      {/* ricerca + filtro stato (a scala: trova rapidamente le caselle) */}
      {senders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca casella per email…"
              className="h-8 pl-8 pr-8 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Pulisci ricerca">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {([
              ["all", "Tutte"], ["active", "Attive"], ["warming", "Warm-up"], ["paused", "In pausa"], ["risk", "A rischio"],
            ] as [SenderFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                  filter === key ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(brands.data ?? []).length > 1 && (
            <Select value={brandFilter || "all"} onValueChange={(v) => setBrandFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-[170px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i brand</SelectItem>
                {(brands.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filtering && (
            <span className="text-[11px] text-muted-foreground">{matchCount} di {senders.length}</span>
          )}
        </div>
      )}

      {/* form nuovo dominio */}
      {showDomain && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1 space-y-1.5"><FieldLabel>Dominio cold</FieldLabel><Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="mail-edilizia.com" className="h-9 font-mono" /></div>
            <div className="w-24 space-y-1.5"><FieldLabel>Cap/g</FieldLabel><Input type="number" value={newDomainCap} onChange={(e) => setNewDomainCap(e.target.value)} className="h-9" /></div>
            <div className="w-[160px] space-y-1.5"><FieldLabel>Brand</FieldLabel>
              <Select value={domainBrandId || "none"} onValueChange={(v) => setDomainBrandId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— nessuno —</SelectItem>{(brands.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9" disabled={addDomain.isPending} onClick={() => addDomain.mutate()}>{addDomain.isPending ? "…" : "Salva dominio"}</Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Usa un dominio cold dedicato, mai il dominio principale aziendale.</p>
        </div>
      )}

      {/* contenuto */}
      {empty ? (
        <EmptyState onAdd={() => setShowDomain(true)} />
      ) : noMatches ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center">
          <Search className="mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nessuna casella corrisponde</p>
          <p className="mt-1 text-xs text-muted-foreground">Nessun risultato per i filtri attuali.</p>
          <Button size="sm" variant="outline" className="mt-3 h-7 gap-1.5 text-xs" onClick={() => { setSearch(""); setFilter("all"); }}>
            <X className="h-3.5 w-3.5" /> Azzera filtri
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {gruppiBrand.map((g) => (
            <div key={g.brandId || "senza-brand"} className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l-2 border-primary/40 pl-2.5">
                <span className="text-sm font-semibold text-foreground">{g.nome}</span>
                <span className="text-[11px] text-muted-foreground">
                  {g.domini.length} domin{g.domini.length === 1 ? "io" : "i"} · {g.nCaselle} casell{g.nCaselle === 1 ? "a" : "e"} · {g.capacita}/giorno
                </span>
                {/* Una casella senza password non spedisce: e' il primo motivo
                    per cui un brand "pieno di caselle" manda zero email. */}
                {g.daCollegare > 0 && (
                  <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30">
                    {g.daCollegare} da collegare
                  </span>
                )}
                {g.dnsCompleti < g.domini.length && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">
                    DNS completo su {g.dnsCompleti} di {g.domini.length}
                  </span>
                )}
                {g.brandId && (
                  <AzioniBrand
                    domini={domains.filter((d) => (d.brand_id ?? "") === g.brandId)}
                    caselle={senders.filter((s) => s.sending_domain_id && brandDiDominio.get(s.sending_domain_id) === g.brandId)}
                    onChange={invalidate}
                  />
                )}
              </div>
              <div className="space-y-3">
                {g.domini.map((d) => (
                  <DomainCard key={d.id} domain={d} caselle={sendersByDomain.get(d.id) ?? []} forceOpen={filtering} onChange={invalidate} />
                ))}
              </div>
            </div>
          ))}

          {noDomain.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Caselle senza dominio</p>
              <div className="space-y-2">
                {noDomain.map((s) => <SenderAccountCard key={s.id} casella={s} onChange={invalidate} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Azioni di massa di un brand. Marketing Edile ed Edilizia in Cloud hanno 25
 * domini e 75 caselle: «Verifica DNS» e «Testa» uno per uno sono cento clic.
 * Qui partono in blocco, sempre da chi preme il bottone e con le stesse
 * funzioni dei bottoni singoli.
 */
function AzioniBrand({ domini, caselle, onChange }: { domini: Domain[]; caselle: Sender[]; onChange: () => void }) {
  const [fase, setFase] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const daVerificare = domini.filter((d) => d.status !== "active");
  // Senza password non c'è niente da testare: la casella va prima collegata.
  const daTestare = caselle.filter((c) => c.secret_ref && c.connection_status !== "ok");
  const dominiPronti = new Set(domini.filter((d) => d.status === "active").map((d) => d.id));
  const daAvviare = caselle.filter((c) =>
    c.status === "paused" && c.connection_status === "ok" && !!c.sending_domain_id && dominiPronti.has(c.sending_domain_id));

  async function verificaETesta() {
    let dnsPronti = 0;
    let collegate = 0;
    try {
      for (let i = 0; i < daVerificare.length; i++) {
        setFase(`DNS ${i + 1} di ${daVerificare.length}…`);
        try {
          const { data } = await supabase.functions.invoke("outreach-verify-dns", { body: { domain_id: daVerificare[i].id } });
          if (data?.status === "active") dnsPronti++;
        } catch { /* il dominio resta da verificare: lo dice il conteggio */ }
      }
      // Quattro test alla volta: una casella per volta sono minuti.
      let prossima = 0;
      const lavora = async () => {
        while (prossima < daTestare.length) {
          const casella = daTestare[prossima++];
          setFase(`Test ${prossima} di ${daTestare.length}…`);
          try {
            const { data } = await supabase.functions.invoke("outreach-mailbox-test", { body: { sender_account_id: casella.id } });
            if (data?.ok) collegate++;
          } catch { /* la casella resta da collegare */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, daTestare.length) }, lavora));
      const parti: string[] = [];
      if (daVerificare.length) parti.push(`domini pronti ${dnsPronti} su ${daVerificare.length}`);
      if (daTestare.length) parti.push(`caselle collegate ${collegate} su ${daTestare.length}`);
      const messaggio = `Fatto: ${parti.join(" · ")}. I dettagli sono sulle card.`;
      if (dnsPronti === daVerificare.length && collegate === daTestare.length) toast.success(messaggio);
      else toast.warning(messaggio);
    } finally {
      setFase(null);
      onChange();
    }
  }

  async function avvia() {
    setFase("Avvio…");
    const { error } = await db.from(T_SENDERS).update({ status: "warming" }).in("id", daAvviare.map((c) => c.id));
    setFase(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${daAvviare.length} ${daAvviare.length === 1 ? "casella in" : "caselle in"} warm-up`);
    onChange();
  }

  if (daVerificare.length === 0 && daTestare.length === 0 && daAvviare.length === 0) return null;
  return (
    <span className="ml-auto flex flex-wrap items-center gap-1.5">
      {(daVerificare.length > 0 || daTestare.length > 0) && (
        <Button size="sm" variant="outline" className="h-6 gap-1 bg-card px-2 text-[11px]" disabled={fase !== null} onClick={verificaETesta}>
          {fase ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {fase ?? "Verifica DNS e testa le caselle"}
        </Button>
      )}
      {daAvviare.length > 0 && (
        <Button size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={fase !== null} onClick={avvia}>
          <Play className="h-3 w-3" /> Avvia {daAvviare.length} {daAvviare.length === 1 ? "casella" : "caselle"} in warm-up
        </Button>
      )}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <MailPlus className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground">Nessuna casella mittente</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Aggiungi un dominio cold dedicato, poi crea le caselle che spediranno in rotazione. Il warm-up parte da {BASE} invii/giorno e sale di {STEP} al giorno.
      </p>
      <Button size="sm" className="mt-4 gap-1.5" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Aggiungi dominio</Button>
    </div>
  );
}

type CasellaKind = "ee" | "smtp" | "smtp_bulk" | "oauth";

function DomainCard({ domain, caselle, forceOpen, onChange }: { domain: Domain; caselle: Sender[]; forceOpen?: boolean; onChange: () => void }) {
  const [showDns, setShowDns] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [kind, setKind] = useState<CasellaKind>("ee");
  const [locals, setLocals] = useState("");
  const [cap, setCap] = useState("40");
  const [busy, setBusy] = useState(false);
  // capacità del dominio = somma dei cap effettivi (warm-up) delle sue caselle attive
  const domainCapacity = caselle.filter((s) => s.status !== "disabled" && s.status !== "paused").reduce((sum, s) => sum + effectiveCap(s), 0);
  const open = forceOpen || !collapsed;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [verifying, setVerifying] = useState(false);

  // Stato del form "casella SMTP reale". La password è un campo controllato
  // locale: non finisce mai in stato globale né nei log, e si svuota al submit.
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");

  function applyPreset(preset: "google" | "outlook" | "aruba" | "register" | "libero" | "custom") {
    if (preset === "google") {
      setSmtpHost("smtp.gmail.com"); setSmtpPort("465"); setSmtpSecure(true);
      setImapHost("imap.gmail.com"); setImapPort("993");
    } else if (preset === "outlook") {
      setSmtpHost("smtp.office365.com"); setSmtpPort("587"); setSmtpSecure(false);
      setImapHost("outlook.office365.com"); setImapPort("993");
    } else if (preset === "aruba") {
      setSmtpHost("smtps.aruba.it"); setSmtpPort("465"); setSmtpSecure(true);
      setImapHost("imaps.aruba.it"); setImapPort("993");
    } else if (preset === "register") {
      // Stessi valori verificati del preset in Impostazioni → Caselle: i server
      // storici sono morti (`imap.register.it` ha un certificato che non vale
      // per quel nome, `out.register.it` non esiste piu' nel DNS). Le caselle
      // Register di oggi stanno su SecureMail, e l'host che si chiama `pop.`
      // sulla 993 parla IMAP. Qui erano rimasti i vecchi: chi sceglieva il
      // preset trovava solo un test fallito.
      setSmtpHost("authsmtp.securemail.pro"); setSmtpPort("465"); setSmtpSecure(true);
      setImapHost("pop.securemail.pro"); setImapPort("993");
    } else if (preset === "libero") {
      setSmtpHost("smtp.libero.it"); setSmtpPort("465"); setSmtpSecure(true);
      setImapHost("imapmail.libero.it"); setImapPort("993");
    } else {
      setSmtpHost(""); setSmtpPort(""); setSmtpSecure(true);
      setImapHost(""); setImapPort("");
    }
  }

  function resetSmtp() {
    setSmtpEmail(""); setSmtpHost(""); setSmtpPort("465"); setSmtpSecure(true);
    setSmtpUser(""); setSmtpPass(""); setImapHost(""); setImapPort("993");
  }

  async function addSmtpCasella() {
    const email = smtpEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) { toast.error("Inserisci un indirizzo email valido"); return; }
    if (!smtpHost.trim() || !smtpPort.trim()) { toast.error("SMTP host e porta sono obbligatori"); return; }
    if (!smtpPass) { toast.error("Inserisci la password della casella"); return; }
    setBusy(true);
    try {
      // a. crea la riga (paused: l'utente la attiva dopo che il test è ok)
      const { data: created, error: insErr } = await db.from(T_SENDERS).insert({
        company_id: domain.company_id, email, provider: "smtp",
        sending_domain_id: domain.id, brand_id: domain.brand_id,
        smtp_host: smtpHost.trim(), smtp_port: Number(smtpPort), smtp_secure: smtpSecure,
        smtp_username: smtpUser.trim() || email,
        imap_host: imapHost.trim() || null, imap_port: imapPort ? Number(imapPort) : null, imap_secure: true,
        daily_cap_target: Number(cap) || 40, status: "paused",
      }).select("id").single();
      if (insErr) throw insErr;
      const id = created?.id as string;

      // b. salva la password nel Vault (edge dedicata: mai in chiaro nel DB)
      const pwd = smtpPass;
      const { data: connData, error: connErr } = await supabase.functions.invoke("outreach-mailbox-connect", { body: { sender_account_id: id, password: pwd } });
      if (connErr || connData?.error) {
        toast.error(`Casella creata ma password non salvata: ${connErr?.message || connData?.error}`);
        resetSmtp(); onChange();
        return;
      }

      // c. test immediato SMTP+IMAP (non invia email): esito nel toast
      const { data: testData } = await supabase.functions.invoke("outreach-mailbox-test", { body: { sender_account_id: id } });
      if (testData?.ok) {
        toast.success(`Casella SMTP creata e verificata (SMTP ✓ · IMAP ✓). Riattivala per usarla.`);
      } else {
        toast.warning(`Casella creata, ma il test connessione è fallito: ${testData?.error || "verifica le credenziali"}. Correggi e ritesta.`);
      }

      // d. reset + refresh
      resetSmtp(); setShowAdd(false); onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function verifyDns() {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-verify-dns", { body: { domain_id: domain.id, dkim_selector: dkimSel.trim() || undefined } });
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

  /** Parser condiviso EE/SMTP-bulk: una voce per riga, local-part → email@dominio. */
  function parseLocals(): string[] {
    const parts = [...new Set(locals.split(/[\n,;\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean))];
    return parts.map((p) => (p.includes("@") ? p : `${p}@${domain.domain}`)).filter((e) => e.includes("@") && e.includes("."));
  }

  async function addCaselle() {
    const emails = parseLocals();
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

  /**
   * Bulk-add di "slot" casella SMTP: crea molte caselle SMTP insieme (una email per
   * riga) con host/porta del preset scelto, ma SENZA password — restano in pausa
   * come slot da connettere/testare poi (la password va al Vault via la card singola
   * "outreach-mailbox-connect", flusso invariato). Pensato per onboarding a scala:
   * crei 50 caselle Google/Outlook in un colpo, poi le colleghi una a una.
   */
  async function addSmtpSlots() {
    const emails = parseLocals();
    if (emails.length === 0) { toast.error("Inserisci almeno un indirizzo (es. marco)"); return; }
    if (!smtpHost.trim() || !smtpPort.trim()) { toast.error("Scegli un preset o inserisci host/porta SMTP"); return; }
    setBusy(true);
    try {
      const rows = emails.map((email) => ({
        company_id: domain.company_id, email, provider: "smtp",
        sending_domain_id: domain.id, brand_id: domain.brand_id,
        smtp_host: smtpHost.trim(), smtp_port: Number(smtpPort), smtp_secure: smtpSecure,
        smtp_username: email,
        imap_host: imapHost.trim() || null, imap_port: imapPort ? Number(imapPort) : null, imap_secure: true,
        daily_cap_target: Number(cap) || 40, status: "paused",
      }));
      const { error } = await db.from(T_SENDERS).upsert(rows, { onConflict: "company_id,email", ignoreDuplicates: true });
      if (error) throw error;
      toast.success(`${emails.length} ${emails.length === 1 ? "slot SMTP creato" : "slot SMTP creati"} (in pausa). Collega la password e testa ciascuna casella per attivarla.`);
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

  const [dkimSel, setDkimSel] = useState(domain.dkim_selector ?? "");
  const dnsCount = [domain.spf_verified, domain.dkim_verified, domain.dmarc_verified].filter(Boolean).length;
  const dnsAllOk = dnsCount === 3;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* intestazione dominio */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              disabled={forceOpen}
              className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label={open ? "Comprimi dominio" : "Espandi dominio"}
              title={open ? "Comprimi" : "Espandi"}
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono text-sm font-semibold text-foreground">{domain.domain}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${domain.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${domain.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/50"}`} /> {domain.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Mailbox className="h-3 w-3" /> {caselle.length} {caselle.length === 1 ? "casella" : "caselle"}</span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1 text-emerald-600"><Flame className="h-3 w-3" /> {domainCapacity}/g capacità</span>
            <span className="text-border">·</span>
            <span>tetto dominio {domain.daily_cap}/g</span>
          </div>
          {/* badge DNS */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FieldLabel className="mr-0.5">DNS</FieldLabel>
            <DnsBadge ok={domain.spf_verified} label="SPF" onClick={() => toggleDns("spf_verified", domain.spf_verified)} />
            <DnsBadge ok={domain.dkim_verified} label="DKIM" onClick={() => toggleDns("dkim_verified", domain.dkim_verified)} />
            <input
              value={dkimSel}
              onChange={(e) => setDkimSel(e.target.value)}
              placeholder="selettore DKIM"
              title="Selettore DKIM del provider (Register ne genera uno univoco per dominio): la verifica DNS lo prova per primo"
              className="h-6 w-28 rounded-md border border-border bg-background px-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/70"
            />
            <DnsBadge ok={domain.dmarc_verified} label="DMARC" onClick={() => toggleDns("dmarc_verified", domain.dmarc_verified)} />
            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60" onClick={verifyDns} disabled={verifying}>
              {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Verifica DNS
            </button>
            {!dnsAllOk && (
              <button className="text-[10px] font-medium text-primary hover:underline" onClick={() => setShowDns((v) => !v)}>{showDns ? "nascondi record" : "record da configurare"}</button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setShowAdd((v) => !v)}><Plus className="h-3.5 w-3.5" /> Casella</Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={del}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {open && showDns && (() => {
        // Le istruzioni dipendono da CHI spedisce per questo dominio: prima
        // erano scritte per Elastic Email e basta, e chi aveva caselle Register
        // seguendole avrebbe rotto l'SPF (l'include di Register sparisce → ogni
        // email esce con spf=softfail). Il provider si legge dagli host SMTP
        // delle caselle del dominio.
        const dns = istruzioniDns(domain.domain, caselle.map((c) => c.smtp_host ?? null), caselle.map((c) => c.provider));
        return (
          <div className="space-y-2 border-t border-border bg-muted/40 p-4 text-xs">
            <p className="text-muted-foreground">
              Caselle su <strong className="font-medium text-foreground">{dns.provider}</strong>. Inserisci questi record nel DNS del dominio
              {dns.doveDns ? <> ({dns.doveDns})</> : null}, poi premi <strong className="font-medium text-foreground">Verifica DNS</strong>.
            </p>
            <DnsRow type="TXT" host="@" value={dns.spf} />
            <DnsRow type={dns.dkimTipo} host={dns.dkimHost} value={dns.dkimValore} />
            <DnsRow type="TXT" host={`_dmarc.${domain.domain}`} value={`v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; adkim=r; aspf=r`} />
            <p className="text-[10px] text-muted-foreground">{dns.notaDkim}</p>
            <p className="text-[10px] text-muted-foreground">DMARC parte in osservazione (<code>p=none</code>): dopo due settimane di report puliti si passa a <code>p=quarantine</code>. La casella <code>dmarc@{domain.domain}</code> deve esistere, o i report rimbalzano.</p>
          </div>
        );
      })()}

      {open && showAdd && (
        <div className="space-y-3 border-t border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <FieldLabel>Tipo casella</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as CasellaKind)}>
              <SelectTrigger className="h-9 w-[260px] bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth">Gmail / Outlook già collegati (OAuth)</SelectItem>
                <SelectItem value="smtp">SMTP reale (Register, Aruba, Libero, Gmail…)</SelectItem>
                <SelectItem value="smtp_bulk">SMTP in blocco (più caselle)</SelectItem>
                <SelectItem value="ee">Elastic Email (condivisa)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "oauth" ? (
            <OauthCasellaPicker domain={domain} caselle={caselle} cap={cap} setCap={setCap} onDone={() => { setShowAdd(false); onChange(); }} />
          ) : kind === "ee" ? (
            <>
              <Label className="text-xs">Crea caselle su <span className="font-mono font-medium text-foreground">@{domain.domain}</span> — un nome per riga (es. <code>marco</code>, <code>info</code>)</Label>
              <Textarea value={locals} onChange={(e) => setLocals(e.target.value)} rows={2} placeholder={"marco\ninfo\nlucia"} className="bg-card text-sm" />
              <div className="flex items-end gap-2">
                <div className="w-28 space-y-1.5"><FieldLabel>Cap/g target</FieldLabel><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 bg-card" /></div>
                <Button size="sm" className="h-9" disabled={busy} onClick={addCaselle}>{busy ? "…" : "Crea caselle"}</Button>
              </div>
            </>
          ) : kind === "smtp_bulk" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <FieldLabel className="mr-1">Preset</FieldLabel>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("google")}>Google Workspace</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("outlook")}>Outlook/M365</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("register")}>Register</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("aruba")}>Aruba</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("libero")}>Libero</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("custom")}>Personalizzato</Button>
              </div>
              <Label className="text-xs">Crea molte caselle SMTP su <span className="font-mono font-medium text-foreground">@{domain.domain}</span> — un nome (o email completa) per riga. Restano <strong className="font-medium text-foreground">in pausa</strong>: colleghi la password e testi ciascuna dopo.</Label>
              <Textarea value={locals} onChange={(e) => setLocals(e.target.value)} rows={3} placeholder={"marco\ninfo\nlucia.rossi"} className="bg-card text-sm" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5"><FieldLabel>SMTP host</FieldLabel><Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="h-9 bg-card font-mono" /></div>
                <div className="space-y-1.5"><FieldLabel>SMTP porta</FieldLabel><Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-9 bg-card" /></div>
                <div className="space-y-1.5"><FieldLabel>IMAP host</FieldLabel><Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.gmail.com" className="h-9 bg-card font-mono" /></div>
                <div className="space-y-1.5"><FieldLabel>Cap/g target</FieldLabel><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 bg-card" /></div>
                <div className="col-span-2 flex items-end gap-1.5 pb-2 sm:col-span-4">
                  <input id={`tls-bulk-${domain.id}`} type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <Label htmlFor={`tls-bulk-${domain.id}`} className="text-xs">TLS implicito (SSL)</Label>
                </div>
              </div>
              <p className="flex items-start gap-1.5 rounded-lg bg-card px-2.5 py-2 text-[10px] text-muted-foreground ring-1 ring-inset ring-border">
                <ShieldHint /> Gli slot partono in pausa, senza password. Apri ogni casella per collegare la password (salvata cifrata nel Vault) e testarla, poi riattivala per la rotazione.
              </p>
              <Button size="sm" className="h-9" disabled={busy} onClick={addSmtpSlots}>{busy ? "Creo…" : "Crea slot SMTP"}</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <FieldLabel className="mr-1">Preset</FieldLabel>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("google")}>Google Workspace</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("outlook")}>Outlook/M365</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("register")}>Register</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("aruba")}>Aruba</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("libero")}>Libero</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => applyPreset("custom")}>Personalizzato</Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 space-y-1.5 sm:col-span-3"><FieldLabel>Email completa</FieldLabel><Input value={smtpEmail} onChange={(e) => setSmtpEmail(e.target.value)} placeholder={`marco@${domain.domain}`} className="h-9 bg-card" autoComplete="off" /></div>
                <div className="space-y-1.5"><FieldLabel>SMTP host</FieldLabel><Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="h-9 bg-card font-mono" /></div>
                <div className="space-y-1.5"><FieldLabel>SMTP porta</FieldLabel><Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-9 bg-card" /></div>
                <div className="flex items-end gap-1.5 pb-2">
                  <input id={`tls-${domain.id}`} type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="h-4 w-4 accent-primary" />
                  <Label htmlFor={`tls-${domain.id}`} className="text-xs">TLS implicito (SSL)</Label>
                </div>
                <div className="col-span-2 space-y-1.5 sm:col-span-1"><FieldLabel>Username</FieldLabel><Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="= email" className="h-9 bg-card font-mono" autoComplete="off" /></div>
                <div className="col-span-2 space-y-1.5 sm:col-span-2"><FieldLabel>Password</FieldLabel><Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" className="h-9 bg-card" autoComplete="new-password" /></div>
                <div className="space-y-1.5"><FieldLabel>IMAP host</FieldLabel><Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.gmail.com" className="h-9 bg-card font-mono" /></div>
                <div className="space-y-1.5"><FieldLabel>IMAP porta</FieldLabel><Input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} className="h-9 bg-card" /></div>
                <div className="space-y-1.5"><FieldLabel>Cap/g target</FieldLabel><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 bg-card" /></div>
              </div>
              <p className="flex items-start gap-1.5 rounded-lg bg-card px-2.5 py-2 text-[10px] text-muted-foreground ring-1 ring-inset ring-border">
                <ShieldHint /> La password è salvata cifrata nel Vault (mai in chiaro). La casella parte in pausa: dopo un test riuscito riattivala per inserirla nella rotazione.
              </p>
              <Button size="sm" className="h-9" disabled={busy} onClick={addSmtpCasella}>{busy ? "Creo e testo…" : "Crea casella SMTP"}</Button>
            </div>
          )}
        </div>
      )}

      {open && caselle.length > 0 && (
        <div className="space-y-2 border-t border-border bg-muted/20 p-3">
          {caselle.map((s) => <SenderAccountCard key={s.id} casella={s} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Card casella stile Instantly "Email Accounts": riga email + provider + dot di
 * stato in alto; sotto, micro-metriche (warm-up con heat-bar + ETA, inviate oggi,
 * salute reputazione). Azioni pulite a destra. Tutta la logica resta invariata.
 */
function SenderAccountCard({ casella, onChange }: { casella: Sender; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [editingCap, setEditingCap] = useState(false);
  // identita' della casella (nome mittente + firma): precedenza sul brand
  const [editIdent, setEditIdent] = useState(false);
  const [nomeDraft, setNomeDraft] = useState(casella.display_name ?? "");
  const [firmaDraft, setFirmaDraft] = useState(casella.signature ?? "");
  const [savingIdent, setSavingIdent] = useState(false);
  async function saveIdent() {
    setSavingIdent(true);
    const { error } = await db.from(T_SENDERS).update({ display_name: nomeDraft.trim() || null, signature: firmaDraft.trim() || null }).eq("id", casella.id);
    setSavingIdent(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Identita' della casella salvata"); setEditIdent(false); onChange();
  }
  const [capDraft, setCapDraft] = useState(String(casella.daily_cap_target));
  const [savingCap, setSavingCap] = useState(false);
  // Collegamento: password (va al Vault) + parametri del server (restano in
  // tabella). Prima non c'era: una casella creata come "slot" non aveva alcun
  // modo di ricevere la password, e restava inutilizzabile per sempre.
  const [openConn, setOpenConn] = useState(false);
  const [pwd, setPwd] = useState("");
  const [smtpH, setSmtpH] = useState(casella.smtp_host ?? "");
  const [smtpP, setSmtpP] = useState(String(casella.smtp_port ?? 465));
  const [imapH, setImapH] = useState(casella.imap_host ?? "");
  const [imapP, setImapP] = useState(String(casella.imap_port ?? 993));
  const [savingConn, setSavingConn] = useState(false);
  const collegata = Boolean(casella.secret_ref);

  async function salvaCollegamento() {
    const password = pwd.trim();
    if (!collegata && !password) { toast.error("Inserisci la password della casella"); return; }
    setSavingConn(true);
    try {
      const patch: Record<string, unknown> = {
        smtp_host: smtpH.trim() || null,
        smtp_port: Number(smtpP) || 465,
        imap_host: imapH.trim() || null,
        imap_port: Number(imapP) || 993,
      };
      const { error: upErr } = await db.from(T_SENDERS).update(patch).eq("id", casella.id);
      if (upErr) throw new Error(upErr.message);

      // La password non passa MAI dalla tabella: la prende l'edge e la mette
      // nel Vault, sulla riga resta solo `secret_ref`.
      if (password) {
        const { data, error } = await supabase.functions.invoke("outreach-mailbox-connect", {
          body: { sender_account_id: casella.id, password },
        });
        if (error || (data as { error?: string })?.error) {
          throw new Error((data as { error?: string })?.error || (error as Error).message);
        }
      }
      setPwd("");
      setOpenConn(false);
      toast.success(password ? "Casella collegata. Ora premi «Testa»." : "Parametri del server salvati");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Collegamento non riuscito");
    } finally {
      setSavingConn(false);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const paused = casella.status === "paused" || casella.status === "disabled";
  const isSmtp = casella.provider === "smtp";
  const isOauth = casella.provider === "gmail" || casella.provider === "outlook";
  const testabile = isSmtp || isOauth;
  const tone = senderTone(casella.status, casella.connection_status);

  const cap = effectiveCap(casella);
  const isFull = cap >= casella.daily_cap_target;
  const daysToFull = Math.max(0, Math.ceil((casella.daily_cap_target - BASE) / STEP));
  const remainingDays = Math.max(0, daysToFull - casella.warmup_day);
  const heatPct = casella.daily_cap_target > 0 ? Math.min(100, Math.round((cap / casella.daily_cap_target) * 100)) : 0;
  const sentPct = cap > 0 ? Math.min(100, Math.round((casella.daily_sent / cap) * 100)) : 0;
  const health = healthLevel(casella.bounce_count ?? 0, casella.complaint_count ?? 0);

  async function setStatus(status: string) {
    setBusy(true);
    const { error } = await db.from(T_SENDERS).update({ status }).eq("id", casella.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChange();
  }
  async function testConnection() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-mailbox-test", { body: { sender_account_id: casella.id } });
      if (error) throw error;
      if (data?.ok) toast.success(data?.oauth ? "Connessione OK (token validi, profilo raggiungibile)" : "Connessione OK (SMTP ✓ · IMAP ✓)");
      else toast.error(`Test fallito: ${data?.error || "verifica le credenziali"}`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test non riuscito");
    } finally {
      setTesting(false);
    }
  }
  async function del() {
    const { error } = await db.from(T_SENDERS).delete().eq("id", casella.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Casella rimossa"); onChange();
  }
  /** Salva il tetto invii/giorno (daily_cap_target) della casella. */
  async function saveCap() {
    const n = Math.max(0, Math.round(Number(capDraft)));
    if (!Number.isFinite(n)) { toast.error("Valore cap non valido"); return; }
    if (n === casella.daily_cap_target) { setEditingCap(false); return; }
    setSavingCap(true);
    const { error } = await db.from(T_SENDERS).update({ daily_cap_target: n }).eq("id", casella.id);
    setSavingCap(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Cap aggiornato a ${n}/g`); setEditingCap(false); onChange();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-border/80">
      {/* riga superiore: email + provider + stato */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-medium text-foreground">{casella.email}</span>
            <ProviderBadge provider={casella.provider} host={casella.smtp_host} />
          </div>
          <StatusDot tone={tone} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isSmtp && (
            <Button
              size="sm"
              variant={collegata ? "ghost" : "default"}
              className={collegata
                ? "h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                : "h-7 gap-1.5 px-2 text-xs"}
              onClick={() => setOpenConn((v) => !v)}
            >
              <KeyRound className="h-3.5 w-3.5" /> {collegata ? "Password e server" : "Collega"}
            </Button>
          )}
          {testabile && (
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground" disabled={testing} onClick={testConnection}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Testa
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => setStatus(paused ? "warming" : "paused")}>
            {paused ? <><Play className="h-3.5 w-3.5" /> Riattiva</> : <><Pause className="h-3.5 w-3.5" /> Pausa</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={del}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Password + parametri del server. Aperto di default su una casella mai
          collegata sarebbe invadente con dodici caselle in lista: sta dietro al
          pulsante, che pero' e' pieno finche' la password manca. */}
      {openConn && isSmtp && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 space-y-1"><FieldLabel>Password casella</FieldLabel>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                placeholder={collegata ? "••••••••  (lascia vuoto per non cambiarla)" : "••••••••"}
                className="h-8 bg-card text-sm" autoComplete="new-password" />
            </div>
            <div className="space-y-1"><FieldLabel>Server SMTP</FieldLabel>
              <Input value={smtpH} onChange={(e) => setSmtpH(e.target.value)} className="h-8 bg-card font-mono text-xs" />
            </div>
            <div className="space-y-1"><FieldLabel>Porta</FieldLabel>
              <Input type="number" value={smtpP} onChange={(e) => setSmtpP(e.target.value)} className="h-8 bg-card text-sm" />
            </div>
            <div className="space-y-1 sm:col-span-2"><FieldLabel>Server IMAP</FieldLabel>
              <Input value={imapH} onChange={(e) => setImapH(e.target.value)} className="h-8 bg-card font-mono text-xs" />
            </div>
            <div className="space-y-1"><FieldLabel>Porta</FieldLabel>
              <Input type="number" value={imapP} onChange={(e) => setImapP(e.target.value)} className="h-8 bg-card text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldHint /> La password finisce cifrata nel Vault, mai in chiaro nel database.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setOpenConn(false); setPwd(""); }}>Annulla</Button>
              <Button size="sm" className="h-7 px-3 text-xs" disabled={savingConn} onClick={salvaCollegamento}>
                {savingConn ? "…" : collegata ? "Salva" : "Collega"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Una casella senza password non spedira' mai: dirlo qui evita il giro
          «Riattiva» → errore → non si capisce cosa manca. */}
      {isSmtp && !collegata && !openConn && (
        <button type="button" onClick={() => setOpenConn(true)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-left text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/25 hover:bg-amber-500/15">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Manca la password: finché non la colleghi questa casella non spedisce.
        </button>
      )}

      {/* errore connessione (se presente) */}
      {casella.connection_status === "error" && casella.connection_error && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-700">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> <span className="truncate">{casella.connection_error}</span>
        </p>
      )}

      {/* identita' per casella: nome mittente e firma (precedenza sul brand) */}
      <div className="mt-2">
        {editIdent ? (
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
            <Input value={nomeDraft} onChange={(e) => setNomeDraft(e.target.value)} placeholder="Nome mittente (es. Marco Rossi)" className="h-7 text-xs" />
            <Textarea value={firmaDraft} onChange={(e) => setFirmaDraft(e.target.value)} rows={2} placeholder="Firma di questa casella (vuota = firma del brand)" className="text-xs" />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditIdent(false)}>Annulla</Button>
              <Button size="sm" className="h-6 px-2 text-xs" disabled={savingIdent} onClick={saveIdent}>{savingIdent ? "…" : "Salva"}</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setNomeDraft(casella.display_name ?? ""); setFirmaDraft(casella.signature ?? ""); setEditIdent(true); }}
            className="group inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" title="Nome mittente e firma di questa casella">
            {casella.display_name ? `Mittente: ${casella.display_name}` : "Mittente: nome del brand"}{casella.signature ? " · firma propria" : ""}
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </div>

      {/* metriche: warm-up + inviate oggi + salute */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
        {/* warm-up heat */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Warm-up · g.{casella.warmup_day}</FieldLabel>
            {editingCap ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-[10px] font-medium text-muted-foreground">cap {cap}/</span>
                <Input
                  type="number"
                  min={0}
                  value={capDraft}
                  autoFocus
                  onChange={(e) => setCapDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCap(); if (e.key === "Escape") { setCapDraft(String(casella.daily_cap_target)); setEditingCap(false); } }}
                  className="h-6 w-14 px-1.5 text-[11px]"
                  aria-label="Tetto invii al giorno"
                />
                <button type="button" onClick={saveCap} disabled={savingCap} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title="Salva cap">
                  {savingCap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => { setCapDraft(String(casella.daily_cap_target)); setEditingCap(false); }} className="text-muted-foreground hover:text-foreground" title="Annulla">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setCapDraft(String(casella.daily_cap_target)); setEditingCap(true); }}
                className="group inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                title="Modifica il tetto invii/giorno"
              >
                cap {cap}/{casella.daily_cap_target} {isFull ? "· a regime" : `· ETA ${remainingDays}g`}
                <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>
          <HeatBar pct={heatPct} indicatorClassName={isFull ? "bg-emerald-500" : "bg-amber-500"} />
        </div>
        {/* inviate oggi */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <FieldLabel>Oggi</FieldLabel>
            <span className="text-[10px] font-medium text-muted-foreground">{casella.daily_sent}/{cap}</span>
          </div>
          <HeatBar pct={sentPct} indicatorClassName="bg-sky-500" />
        </div>
        {/* salute */}
        <div className="flex items-center sm:justify-end sm:pb-0.5">
          <HealthPill health={health} />
        </div>
      </div>
    </div>
  );
}

function ShieldHint() {
  return <Check className="mt-px h-3 w-3 shrink-0 text-emerald-500" />;
}

function DnsRow({ type, host, value }: { type: string; host: string; value: string }) {
  async function copy() {
    try { await navigator.clipboard.writeText(value); toast.success("Copiato"); } catch { /* no-op */ }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border">{type}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{host}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{value}</span>
      <button className="shrink-0 text-muted-foreground transition-colors hover:text-foreground" onClick={copy} title="Copia"><Copy className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Globe; label: string; value: number; hint?: string; tone?: "default" | "good" }) {
  const chip = tone === "good"
    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300"
    : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${chip}`}><Icon className="h-3.5 w-3.5" /></span>
        <FieldLabel>{label}</FieldLabel>
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${tone === "good" ? "text-emerald-600" : "text-foreground"}`}>{value.toLocaleString("it-IT")}</div>
      {hint && <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">{tone === "good" && <ChevronRight className="h-3 w-3" />}{hint}</div>}
    </div>
  );
}

function DnsBadge({ ok, label, onClick }: { ok: boolean; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Clic per segnare verificato/non verificato"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors ${ok ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100" : "bg-muted text-muted-foreground ring-border hover:bg-muted/70"}`}>
      {ok ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}{label}
    </button>
  );
}


/* ───────────────────────── caselle Gmail/Outlook via OAuth ───────────────────────── */

interface OauthConn { id: string; provider: string; email_address: string; status: string | null }

/**
 * Promuove una casella Gmail/Outlook gia' collegata in /admin/email (OAuth) a
 * mittente del pool: niente password per le app, niente SMTP di base. Invio via
 * Gmail API / Microsoft Graph, risposte lette dalla posta gia' scaricata.
 * Parte in warm-up con cap basso (3 → +1 al giorno fino al target).
 */
function OauthCasellaPicker({ domain, caselle, cap, setCap, onDone }: {
  domain: Domain; caselle: Sender[]; cap: string; setCap: (v: string) => void; onDone: () => void;
}) {
  const [conns, setConns] = useState<OauthConn[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const giaNelPool = new Set(caselle.map((c) => c.email.toLowerCase()));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await db.from("email_oauth_connections")
        .select("id, provider, email_address, status")
        .in("provider", ["gmail", "outlook"])
        .order("created_at", { ascending: false });
      if (!vivo) return;
      if (error) { toast.error(`Caselle collegate non leggibili: ${error.message}`); setConns([]); return; }
      setConns(((data ?? []) as OauthConn[]).filter((c) => !giaNelPool.has(c.email_address.toLowerCase())));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caselle.length]);

  const scelta = conns?.find((c) => c.id === sel) ?? null;
  const dominioEmail = scelta ? scelta.email_address.split("@")[1]?.toLowerCase() : null;
  const fuoriDominio = !!dominioEmail && dominioEmail !== domain.domain.toLowerCase() && !dominioEmail.endsWith(`.${domain.domain.toLowerCase()}`);
  const scaduta = scelta?.status === "expired";

  async function aggiungi() {
    if (!scelta) { toast.error("Scegli una casella"); return; }
    if (scaduta) { toast.error("Connessione scaduta: ricollegala in Impostazioni → Email, poi riprova"); return; }
    const capN = Math.max(1, Math.round(Number(cap) || 5));
    setBusy(true);
    try {
      const { data: created, error } = await db.from(T_SENDERS).insert({
        company_id: domain.company_id, email: scelta.email_address.toLowerCase(), provider: scelta.provider,
        oauth_connection_id: scelta.id, sending_domain_id: domain.id, brand_id: domain.brand_id,
        daily_cap_target: capN, warmup_base: Math.min(3, capN), warmup_step: 1,
        status: "warming", connection_status: "untested",
      }).select("id").single();
      if (error) throw error;
      const { data: t } = await supabase.functions.invoke("outreach-mailbox-test", { body: { sender_account_id: created.id } });
      if (t?.ok) toast.success(`${scelta.email_address} aggiunta al pool: parte in warm-up a ${Math.min(3, capN)}/giorno fino a ${capN}.`);
      else toast.warning(`Casella aggiunta ma il test non e' passato: ${t?.error ?? "riprova con Testa"}`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs">
        Usa una casella Gmail o Outlook gia' collegata in <span className="font-medium text-foreground">Impostazioni → Email</span>: le email
        partono dal provider stesso (Gmail API / Microsoft Graph), firmate da lui, e le risposte arrivano nella sua posta.
      </Label>
      {conns === null ? (
        <p className="text-xs text-muted-foreground">Carico le caselle collegate…</p>
      ) : conns.length === 0 ? (
        <p className="rounded-lg bg-card px-2.5 py-2 text-xs text-muted-foreground ring-1 ring-inset ring-border">
          Nessuna casella Gmail/Outlook collegata (o sono gia' tutte nel pool). Collegala prima da Impostazioni → Email → Mio profilo.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 space-y-1.5">
            <FieldLabel>Casella</FieldLabel>
            <Select value={sel} onValueChange={setSel}>
              <SelectTrigger className="h-9 bg-card"><SelectValue placeholder="Scegli la casella collegata" /></SelectTrigger>
              <SelectContent>
                {conns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.email_address} · {c.provider === "gmail" ? "Gmail" : "Outlook"}{c.status === "expired" ? " · scaduta" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><FieldLabel>Cap/g target</FieldLabel><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 bg-card" /></div>
        </div>
      )}
      {fuoriDominio && (
        <p className="text-[11px] text-amber-700">
          La casella e' su <span className="font-mono">{dominioEmail}</span>, non su {domain.domain}: va bene, ma i controlli DNS di questo dominio non valgono per lei.
        </p>
      )}
      <p className="flex items-start gap-1.5 rounded-lg bg-card px-2.5 py-2 text-[10px] text-muted-foreground ring-1 ring-inset ring-border">
        <ShieldHint /> Per il freddo da caselle vere: 5-10 al giorno per casella, sequenza "solo testo", niente link nei primi messaggi. Parte in warm-up (3/giorno, +1 al giorno).
      </p>
      <Button size="sm" className="h-9" disabled={busy || !scelta} onClick={aggiungi}>{busy ? "Aggiungo e testo…" : "Aggiungi al pool"}</Button>
    </div>
  );
}
