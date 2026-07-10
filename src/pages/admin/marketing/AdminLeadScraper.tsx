import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import {
  Search, MapPin, Linkedin, Building2, Loader2, Sparkles, Mail, Phone,
  Globe, Star, Download, UserPlus, Trash2, Target, ChevronRight,
  Wand2, Facebook, Instagram, Flame, FileText, Grid3x3, Upload, MessageSquareQuote, ShieldBan, EyeOff,
  MessageCircle, Send, Pencil, SlidersHorizontal, Rocket, Bot, BadgeCheck, ChevronDown, Database, Zap,
  BarChart3, MoreVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

// ── tipi ──────────────────────────────────────────────────────────────────────
interface LeadResult {
  id: string;
  search_id: string;
  source: string;
  business_name: string;
  contact_name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviews_count: number | null;
  ai_score: number | null;
  ai_label: "hot" | "warm" | "cold" | null;
  ai_reason: string | null;
  // v2 enrichment
  partita_iva: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  intent_signals: Record<string, boolean> | null;
  intent_score: number | null;
  email_status: "none" | "guessed" | "verified_mx" | "found" | "pec" | "verified" | null;
  enrichment: Record<string, unknown> | null;
  // v3
  seen_before: boolean | null;
  ateco: string | null;
  ateco_desc: string | null;
  company_size: string | null;
  // registro imprese
  fatturato: number | null;
  dipendenti: number | null;
  anno_fondazione: number | null;
  forma_giuridica: string | null;
  ai_summary: string | null;
  ai_icebreaker: string | null;
  crm_opportunity_id: string | null;
  crm_contact_id: string | null;
  // v5
  buying_score: number | null;
  buying_signals: Record<string, boolean> | null;
  ai_sequence: unknown | null;
  is_existing_customer: boolean | null;
  pushed_to_crm: boolean;
  created_at: string;
}

interface LeadSearch {
  id: string;
  source: string;
  label: string | null;
  query: Record<string, unknown> | null;
  results_count: number;
  status: string;
  created_at: string;
}

const SOURCES = [
  { id: "internal", label: "Interno", icon: Database, active: true, hint: "Scraper self-host + DB proprietario: scrapa 1 volta, riusa per sempre (~€0). Richiede scraper-worker." },
  { id: "company_search", label: "Registro Imprese", icon: Building2, active: true, hint: "Liste imprese italiane dal Registro (openapi.it): filtra per ATECO + provincia (sigla). Ritorna P.IVA, ATECO, PEC, codice SdI. ~€0,03/azienda (ricerca + dettaglio). Sandbox = dati finti gratis (openapi_it_token + openapi_env)." },
  { id: "google_maps", label: "Google Maps", icon: MapPin, active: true, hint: "Imprese locali da Maps: telefono, sito, email (gratis)" },
  { id: "apify_maps", label: "Apify Maps", icon: Bot, active: true, hint: "Google Maps via Apify: include le email. $5 free/mese (apify_api_token)" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, active: true, hint: "Decisori via Serper (≈$0.30/1000) o Google CSE (gratis 100/g)" },
  { id: "apollo", label: "Apollo", icon: Rocket, active: true, hint: "Decisori + email (apollo.io). Free tier + crediti economici (apollo_api_key)" },
  { id: "explorium", label: "Explorium", icon: Building2, active: false, hint: "150M+ aziende — richiede explorium_api_key" },
] as const;

// Preset settori edilizia (keyword Google Maps efficaci in italiano)
const SECTOR_PRESETS = [
  "impresa edile", "impresa di costruzioni", "studio tecnico geometra",
  "studio di architettura", "ristrutturazioni", "general contractor",
  "impresa di ristrutturazioni", "termoidraulica", "serramentista",
  "impresa di pavimenti", "edilizia", "cartongesso",
];

// Preset codici ATECO edilizia (per la fonte Registro Imprese / Company Search)
const ATECO_PRESETS: { code: string; label: string }[] = [
  { code: "41", label: "41 · Costruzione edifici" },
  { code: "42", label: "42 · Ingegneria civile" },
  { code: "43", label: "43 · Lavori specializzati" },
  { code: "4332", label: "4332 · Serramenti/infissi" },
  { code: "4391", label: "4391 · Coperture/tetti" },
  { code: "4322", label: "4322 · Idraulica/riscaldamento" },
];

// Le tabelle lead_scraper_* non sono ancora nei tipi generati (nessun push DB):
// usiamo l'accessor non tipizzato già adottato altrove nel codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromLS = (n: string) => (supabase as any).from(n);

// Etichette dei segnali d'intento (motivi per cui è un buon prospect)
const INTENT_LABELS: Record<string, { label: string; cls: string }> = {
  outdated_copyright: { label: "Sito datato", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  not_mobile: { label: "No mobile", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  no_https: { label: "No HTTPS", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  no_website: { label: "No sito", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
};

const EMAIL_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  found: { label: "verificata", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  pec: { label: "PEC", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  verified: { label: "valida", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  verified_mx: { label: "MX ok", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  guessed: { label: "ipotizzata", cls: "bg-muted text-muted-foreground" },
};

function scoreColor(score: number | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
}

// Formatta il fatturato in modo compatto (€1,2M · €450k · €80k).
function fmtFatturato(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".", ",")}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}k`;
  return `€${Math.round(v)}`;
}

// Stima il costo di una ricerca PRIMA di lanciarla (trasparenza spesa).
function stimaCostoRicerca(source: string, n: number): { testo: string } {
  switch (source) {
    case "company_search": {
      const eur = n * 0.03; // ricerca + dettaglio IT-advanced openapi.it
      return { testo: `~${eur.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })} (${n} aziende × ~€0,03)` };
    }
    case "apollo": return { testo: `consuma ~${n} crediti Apollo` };
    case "apify_maps": return { testo: "usa il piano Apify ($5 free/mese, poi a consumo)" };
    case "google_maps": return { testo: "gratis (entro il cap giornaliero Google Places)" };
    case "linkedin": return { testo: "~gratis (ricerca web)" };
    case "internal": return { testo: "gratis (DB proprietario / scraper self-host)" };
    default: return { testo: "" };
  }
}

// Split di una riga CSV rispettando le virgolette RFC-4180: una cella quotata
// può contenere il separatore ("Rossi, Bianchi & C. SNC") e "" = " letterale.
// (Il vecchio line.split(sep) spezzava i nomi azienda con la virgola.)
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Normalizza un numero IT in E.164 e indica se è mobile (per WhatsApp).
function normalizeItPhone(raw: string | null): { e164: string | null; isMobile: boolean } {
  if (!raw) return { e164: null, isMobile: false };
  let s = raw.trim().replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  let national: string;
  if (s.startsWith("+39")) national = s.slice(3);
  else if (s.startsWith("+")) return { e164: s, isMobile: false }; // estero
  else if (s.startsWith("39") && s.length >= 11) national = s.slice(2);
  else national = s.replace(/^\+/, "");
  national = national.replace(/\D/g, "");
  if (!national) return { e164: null, isMobile: false };
  return { e164: "+39" + national, isMobile: national.startsWith("3") };
}

// Pannello dettaglio lead con modifica inline
function LeadDetailSheet({ lead, onClose, onSave, saving }: {
  lead: LeadResult | null;
  onClose: () => void;
  onSave: (patch: { id: string } & Record<string, unknown>) => void;
  saving: boolean;
}) {
  // init lazy dai prop (il componente viene rimontato via `key={lead.id}`)
  const [form, setForm] = useState<Record<string, string>>(() => ({
    contact_name: lead?.contact_name || "", role: lead?.role || "", email: lead?.email || "", phone: lead?.phone || "",
  }));

  const wa = lead ? normalizeItPhone(lead.phone) : { e164: null, isMobile: false };
  return (
    <Sheet open={!!lead} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {lead && (
          <div className="space-y-4">
            <SheetHeader><SheetTitle className="text-base">{lead.business_name}</SheetTitle></SheetHeader>
            <div className="flex flex-wrap gap-1.5">
              {lead.ai_score != null && <Badge variant="secondary" className={`${scoreColor(lead.ai_score)} border-0`}>AI {lead.ai_score}</Badge>}
              {lead.intent_score != null && <Badge variant="secondary" className={`${scoreColor(lead.intent_score)} border-0`}>Intento {lead.intent_score}</Badge>}
              {lead.pushed_to_crm && <Badge variant="outline">in CRM</Badge>}
            </div>
            <div className="space-y-2">
              {([["contact_name", "Referente"], ["role", "Ruolo"], ["email", "Email"], ["phone", "Telefono"]] as const).map(([k, lbl]) => (
                <div key={k}>
                  <Label className="text-xs">{lbl}</Label>
                  <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} className="mt-1 h-8 text-sm" />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => onSave({ id: lead.id, ...form })}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Salva
                </Button>
                {wa.isMobile && wa.e164 && (
                  <a href={`https://wa.me/${wa.e164.replace("+", "")}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-[#25d366]" /> WhatsApp</Button>
                  </a>
                )}
              </div>
            </div>
            <div className="space-y-1.5 text-xs border-t pt-3">
              {lead.website && <div><span className="text-muted-foreground">Sito:</span> <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{lead.website}</a></div>}
              {lead.partita_iva && <div><span className="text-muted-foreground">P.IVA:</span> {lead.partita_iva}</div>}
              {lead.ateco && <div><span className="text-muted-foreground">ATECO:</span> {lead.ateco} {lead.ateco_desc}</div>}
              {(lead.fatturato != null || lead.dipendenti != null || lead.forma_giuridica || lead.anno_fondazione) && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {lead.fatturato != null && <span><span className="text-muted-foreground">Fatturato:</span> <span className="font-medium">{fmtFatturato(lead.fatturato)}</span></span>}
                  {lead.dipendenti != null && <span><span className="text-muted-foreground">Dipendenti:</span> {lead.dipendenti}</span>}
                  {lead.forma_giuridica && <span><span className="text-muted-foreground">Forma:</span> {lead.forma_giuridica}</span>}
                  {lead.anno_fondazione && <span><span className="text-muted-foreground">Anno:</span> {lead.anno_fondazione}</span>}
                </div>
              )}
              {lead.address && <div><span className="text-muted-foreground">Indirizzo:</span> {lead.address}</div>}
              {lead.linkedin_url && <div><a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Profilo LinkedIn ↗</a></div>}
              {lead.ai_summary && <div className="rounded bg-muted/50 p-2"><span className="text-muted-foreground">Sintesi AI: </span>{lead.ai_summary}</div>}
              {lead.ai_icebreaker && <div className="rounded bg-primary/5 p-2"><span className="text-muted-foreground">Icebreaker: </span>{lead.ai_icebreaker}</div>}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Analytics/ROI per fonte ───────────────────────────────────────────────────
interface SourceAnalytics {
  source: string; total: number; contactable: number; with_email: number; with_phone: number;
  with_pec: number; with_piva: number; qualified: number; hot: number; high_intent: number;
  in_crm: number; opportunities: number; existing_customers: number;
  avg_ai_score: number | null; avg_buying_score: number | null; last_lead_at: string | null;
}
interface ProviderUsage { provider: string; calls_total: number; calls_30d: number; calls_today: number; last_used: string | null; }

function AnalyticsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["lead-scraper", "analytics"],
    queryFn: async (): Promise<SourceAnalytics[]> => {
      const { data, error } = await fromLS("lead_scraper_source_analytics").select("*").order("total", { ascending: false });
      if (error) throw error;
      return (data || []) as SourceAnalytics[];
    },
    enabled: open,
  });
  const { data: usage = [] } = useQuery({
    queryKey: ["lead-scraper", "provider-usage"],
    queryFn: async (): Promise<ProviderUsage[]> => {
      const { data, error } = await fromLS("lead_scraper_provider_usage").select("*").order("calls_total", { ascending: false });
      if (error) throw error;
      return (data || []) as ProviderUsage[];
    },
    enabled: open,
  });
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const tot = rows.reduce((a, r) => a + r.total, 0);
  const totOpps = rows.reduce((a, r) => a + r.opportunities, 0);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader><SheetTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Analytics & ROI per fonte</SheetTitle></SheetHeader>
        {isFetching && rows.length === 0 ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nessun dato ancora. Esegui qualche ricerca.</p>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[["Lead totali", tot], ["Opportunità", totOpps], ["Conv. media", `${pct(totOpps, tot)}%`]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border p-2.5 text-center">
                  <div className="text-lg font-bold">{v}</div>
                  <div className="text-[11px] text-muted-foreground">{l as string}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fonte</TableHead>
                    <TableHead className="text-xs text-right">Lead</TableHead>
                    <TableHead className="text-xs text-right">Contattabili</TableHead>
                    <TableHead className="text-xs text-right">PEC</TableHead>
                    <TableHead className="text-xs text-right">Qualif.</TableHead>
                    <TableHead className="text-xs text-right">In CRM</TableHead>
                    <TableHead className="text-xs text-right">Opp.</TableHead>
                    <TableHead className="text-xs text-right">Conv.</TableHead>
                    <TableHead className="text-xs text-right">AI medio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.source}>
                      <TableCell className="text-xs font-medium">{r.source}</TableCell>
                      <TableCell className="text-xs text-right">{r.total}</TableCell>
                      <TableCell className="text-xs text-right">{r.contactable} <span className="text-muted-foreground">({pct(r.contactable, r.total)}%)</span></TableCell>
                      <TableCell className="text-xs text-right">{r.with_pec || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{r.qualified}</TableCell>
                      <TableCell className="text-xs text-right">{r.in_crm}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{r.opportunities}</TableCell>
                      <TableCell className="text-xs text-right">{pct(r.opportunities, r.total)}%</TableCell>
                      <TableCell className="text-xs text-right">{r.avg_ai_score ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {usage.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">Consumo API esterne (chiamate)</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Provider</TableHead>
                        <TableHead className="text-xs text-right">Oggi</TableHead>
                        <TableHead className="text-xs text-right">30 giorni</TableHead>
                        <TableHead className="text-xs text-right">Totale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.map((u) => (
                        <TableRow key={u.provider}>
                          <TableCell className="text-xs font-medium">{u.provider}</TableCell>
                          <TableCell className="text-xs text-right">{u.calls_today || 0}</TableCell>
                          <TableCell className="text-xs text-right">{u.calls_30d || 0}</TableCell>
                          <TableCell className="text-xs text-right">{u.calls_total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Le fonti interne (paginegialle/gmaps self-host) e il riuso dal DB proprietario non consumano API → costo ≈ 0.</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Autopilot: config dello scraping notturno (città × settore) ───────────────
interface AutopilotCfg {
  id: string; enabled: boolean; engine: string; cities: string[]; sectors: string[];
  per_run: number; cursor: number; last_run_at: string | null; last_result: Record<string, unknown> | null;
}
function AutopilotForm({ cfg }: { cfg: AutopilotCfg | null }) {
  const qc = useQueryClient();
  // initializer dalle props: il remount via key (cfg.id) ri-idrata senza ref/effect
  const [enabled, setEnabled] = useState(cfg?.enabled ?? false);
  const [engine, setEngine] = useState(cfg?.engine ?? "paginegialle");
  const [cities, setCities] = useState((cfg?.cities ?? []).join(", "));
  const [sectors, setSectors] = useState((cfg?.sectors ?? []).join(", "));
  const [perRun, setPerRun] = useState(String(cfg?.per_run ?? 40));
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        enabled, engine,
        cities: cities.split(",").map((s) => s.trim()).filter(Boolean),
        sectors: sectors.split(",").map((s) => s.trim()).filter(Boolean),
        per_run: Math.max(1, Math.min(200, Number(perRun) || 40)),
      };
      if (cfg?.id) {
        const { error } = await fromLS("lead_scraper_autopilot").update(payload).eq("id", cfg.id);
        if (error) throw error;
      } else {
        const { error } = await fromLS("lead_scraper_autopilot").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead-scraper", "autopilot"] }); toast.success("Autopilot salvato"); },
    onError: (e: Error) => toast.error("Salvataggio fallito", { description: e.message }),
  });
  const combos = cities.split(",").filter((s) => s.trim()).length * sectors.split(",").filter((s) => s.trim()).length;

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-muted-foreground">Ogni notte l'autopilot scrapa la prossima combinazione <b>città × settore</b> nel database proprietario, a costo ≈ 0. Richiede la edge function <code>lead-scraper-autopilot</code> schedulata via cron.</p>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div><div className="text-sm font-medium">Attivo</div><div className="text-[11px] text-muted-foreground">Abilita il ciclo notturno</div></div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div>
        <Label className="text-xs">Motore</Label>
        <Select value={engine} onValueChange={setEngine}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paginegialle">Pagine Gialle (HTTP, economico)</SelectItem>
            <SelectItem value="gmaps">Google Maps (Playwright)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Città (separate da virgola)</Label>
        <Textarea value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Milano, Roma, Torino, Napoli, Bologna" className="mt-1 text-xs" rows={2} />
      </div>
      <div>
        <Label className="text-xs">Settori (separati da virgola)</Label>
        <Textarea value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="impresa edile, ristrutturazioni, serramenti" className="mt-1 text-xs" rows={2} />
      </div>
      <div>
        <Label className="text-xs">Lead per combinazione / notte</Label>
        <Input type="number" min={1} max={200} value={perRun} onChange={(e) => setPerRun(e.target.value)} className="mt-1" />
      </div>
      <div className="rounded-lg bg-muted/50 p-2.5 text-[11px] text-muted-foreground space-y-0.5">
        <div>{combos} combinazioni · ~{combos * (Number(perRun) || 0)} lead/ciclo completo</div>
        {cfg?.last_run_at && <div>Ultimo run: {new Date(cfg.last_run_at).toLocaleString("it-IT")} · cursore {cfg.cursor}/{combos || "—"}</div>}
      </div>
      <Button className="w-full gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Salva configurazione
      </Button>
    </div>
  );
}

function AutopilotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: cfg, isFetching, isSuccess } = useQuery({
    queryKey: ["lead-scraper", "autopilot"],
    queryFn: async (): Promise<AutopilotCfg | null> => {
      const { data, error } = await fromLS("lead_scraper_autopilot").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      return (data || null) as AutopilotCfg | null;
    },
    enabled: open,
  });
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Autopilot — scraping notturno</SheetTitle></SheetHeader>
        {isFetching && !isSuccess
          ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : <AutopilotForm key={cfg?.id ?? "new"} cfg={cfg ?? null} />}
      </SheetContent>
    </Sheet>
  );
}

// ── Arricchisci azienda: dati liberi (nome/sito/P.IVA) → tutte le info (gratis) ──
interface EnrichResult {
  emails?: string[];
  phones?: string[];
  partita_iva?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  site_excerpt?: string;
  vies?: { valid: boolean; name?: string; address?: string };
  firmografici?: Record<string, unknown>;
}
function EnrichCompanySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [piva, setPiva] = useState("");
  const [result, setResult] = useState<EnrichResult | null>(null);

  const enrich = useMutation({
    mutationFn: async (): Promise<EnrichResult> => {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: {
          action: "enrich_company",
          business_name: businessName.trim() || undefined,
          website: website.trim() || undefined,
          partita_iva: piva.trim() || undefined,
        },
      });
      if (error) throw new Error(error.message);
      return (data || {}) as EnrichResult;
    },
    onSuccess: (d) => setResult(d),
    onError: (e: Error) => toast.error("Arricchimento fallito", { description: e.message }),
  });

  const canRun = !!(businessName.trim() || website.trim() || piva.trim());
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Copiato"); };
  const empty = result && !result.emails?.length && !result.phones?.length && !result.partita_iva && !result.vies?.valid && !(result.firmografici && Object.keys(result.firmografici).length > 0);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Arricchisci un'azienda</SheetTitle></SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">Inserisci ciò che sai (anche solo il sito o la P.IVA): trovo email, telefono, P.IVA, social e dati ufficiali. Gratis.</p>
        <div className="mt-4 space-y-3">
          <div><Label className="text-xs">Ragione sociale</Label><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Es. Rossi Costruzioni Srl" /></div>
          <div><Label className="text-xs">Sito web</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="rossicostruzioni.it" /></div>
          <div><Label className="text-xs">P.IVA</Label><Input value={piva} onChange={(e) => setPiva(e.target.value)} placeholder="01234567890" /></div>
          <Button className="w-full gap-1.5" disabled={!canRun || enrich.isPending} onClick={() => enrich.mutate()}>
            {enrich.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Trova tutte le info
          </Button>
        </div>

        {result && (
          <div className="mt-5 space-y-3 text-sm">
            {result.vies?.valid && result.vies.name && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Ragione sociale (VIES)</div>
                <div className="font-medium">{result.vies.name}</div>
                {result.vies.address && <div className="text-xs text-muted-foreground">{result.vies.address}</div>}
              </div>
            )}
            {result.partita_iva && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">P.IVA</div>
                <button type="button" onClick={() => copy(result.partita_iva!)} className="flex items-center gap-1.5 hover:text-primary"><FileText className="h-3 w-3" />{result.partita_iva}</button>
              </div>
            )}
            {!!result.emails?.length && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Email</div>
                <div className="space-y-1">{result.emails.map((e) => (
                  <button key={e} type="button" onClick={() => copy(e)} className="flex w-full items-center gap-1.5 text-left hover:text-primary"><Mail className="h-3 w-3 shrink-0" />{e}</button>
                ))}</div>
              </div>
            )}
            {!!result.phones?.length && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Telefoni</div>
                <div className="space-y-1">{result.phones.map((p) => (
                  <button key={p} type="button" onClick={() => copy(p)} className="flex w-full items-center gap-1.5 text-left hover:text-primary"><Phone className="h-3 w-3 shrink-0" />{p}</button>
                ))}</div>
              </div>
            )}
            {(result.linkedin_url || result.facebook_url || result.instagram_url) && (
              <div className="flex items-center gap-3 pt-1">
                {result.linkedin_url && <a href={result.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn"><Linkedin className="h-4 w-4 text-[#0a66c2]" /></a>}
                {result.facebook_url && <a href={result.facebook_url} target="_blank" rel="noopener noreferrer" title="Facebook"><Facebook className="h-4 w-4 text-[#1877f2]" /></a>}
                {result.instagram_url && <a href={result.instagram_url} target="_blank" rel="noopener noreferrer" title="Instagram"><Instagram className="h-4 w-4 text-[#e1306c]" /></a>}
              </div>
            )}
            {result.firmografici && Object.keys(result.firmografici).length > 0 && (() => {
              const f = result.firmografici as {
                fatturato?: number; dipendenti?: number; ateco?: string; ateco_desc?: string;
                forma_giuridica?: string; anno_fondazione?: number; company_size?: string; pec?: string;
              };
              const rows: { label: string; value: string }[] = [];
              if (f.fatturato != null) rows.push({ label: "Fatturato", value: fmtFatturato(f.fatturato) });
              if (f.dipendenti != null) rows.push({ label: "Dipendenti", value: String(f.dipendenti) });
              if (f.ateco) rows.push({ label: "ATECO", value: `${f.ateco}${f.ateco_desc ? ` · ${f.ateco_desc}` : ""}` });
              if (f.forma_giuridica) rows.push({ label: "Forma giuridica", value: f.forma_giuridica });
              if (f.anno_fondazione) rows.push({ label: "Anno fondazione", value: String(f.anno_fondazione) });
              if (f.company_size) rows.push({ label: "Dimensione", value: f.company_size });
              return (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3 w-3" /> Dati ufficiali (Registro Imprese)
                  </div>
                  {rows.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {rows.map((r) => (
                        <div key={r.label}>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.label}</div>
                          <div className="text-sm font-medium">{r.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nessun dato firmografico disponibile.</p>
                  )}
                  {f.pec && (
                    <div className="mt-2 border-t pt-2">
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">PEC</div>
                      <button type="button" onClick={() => copy(f.pec!)} className="flex items-center gap-1.5 text-sm hover:text-primary">
                        <Mail className="h-3 w-3 shrink-0" />{f.pec}
                      </button>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">Tutti i campi</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[10px]">{JSON.stringify(result.firmografici, null, 2)}</pre>
                  </details>
                </div>
              );
            })()}
            {empty && (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                Nessuna info trovata. Prova ad aggiungere il sito web.
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Importa dal CRM: aziende già nel sistema → lista arricchibile ─────────────
// Il caso d'uso principe: "ho l'azienda con la P.IVA ma mi manca l'email/telefono"
// → la importi qui, lanci gli strumenti (Registro, PEC, sito, VIES…) e con
// "Aggiorna CRM" i dati trovati tornano nel contatto originale (solo campi vuoti).
function ImportCrmSheet({ open, onClose, onImported }: {
  open: boolean; onClose: () => void; onImported: (searchId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState<string>("email");
  const [onlyWithPiva, setOnlyWithPiva] = useState(true);
  const [limit, setLimit] = useState("200");

  const imp = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("lead-scraper", {
        body: {
          action: "import_crm",
          q: q.trim() || undefined,
          missing: missing === "none" ? undefined : missing,
          onlyWithPiva,
          limit: parseInt(limit, 10) || 200,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { searchId: string | null; count: number; withPiva: number; withEmail: number; withWebsite: number };
    },
    onSuccess: (d) => {
      if (!d.searchId || !d.count) { toast.info("Nessun contatto trovato con questi filtri"); return; }
      toast.success(`${d.count} aziende importate dal CRM`, {
        description: `${d.withPiva} con P.IVA · ${d.withEmail} con email · ${d.withWebsite} con sito — ora arricchiscile`,
      });
      onImported(d.searchId);
      onClose();
    },
    onError: (e: Error) => toast.error("Import dal CRM fallito", { description: e.message }),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Arricchisci aziende dal CRM</SheetTitle></SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          Pesca le aziende già caricate nel sistema (es. con P.IVA ma senza email) e usale come lista: Registro Imprese, PEC, sito, VIES, email finder… I dati trovati tornano nel contatto CRM con «Aggiorna CRM» (solo campi vuoti, mai sovrascritti).
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Cerca (nome, P.IVA, città, email)</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="es. costruzioni · 01234567890 · Milano" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">A cui manca…</Label>
            <Select value={missing} onValueChange={setMissing}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email (da trovare)</SelectItem>
                <SelectItem value="phone">Telefono (da trovare)</SelectItem>
                <SelectItem value="piva">P.IVA (da trovare)</SelectItem>
                <SelectItem value="website">Sito web (da trovare)</SelectItem>
                <SelectItem value="none">Niente — importa comunque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-2.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Solo aziende con P.IVA</span>
            </div>
            <Switch checked={onlyWithPiva} onCheckedChange={setOnlyWithPiva} />
          </div>
          <div>
            <Label className="text-xs">Massimo contatti</Label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["50", "100", "200", "500"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full gap-1.5" disabled={imp.isPending} onClick={() => imp.mutate()}>
            {imp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Importa dal CRM
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminLeadScraper() {
  const { hasAccess, permLoading } = useAdminMarketing();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [source, setSource] = useState<string>("google_maps");
  const [keyword, setKeyword] = useState("impresa edile");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [extractEmails, setExtractEmails] = useState(true);
  const [icp, setIcp] = useState(
    "Impresa edile / studio tecnico in Italia, 5-50 dipendenti, gestisce cantieri, preventivi, DDT e fatture — cliente ideale per un gestionale cloud.",
  );

  const [gridMode, setGridMode] = useState(false);
  const [createOpp, setCreateOpp] = useState(false);
  const [hideSeen, setHideSeen] = useState(false);
  const [massive, setMassive] = useState(false);          // scraping massivo (migliaia, asincrono)
  const [massiveTarget, setMassiveTarget] = useState("1000");
  const [jobId, setJobId] = useState<string | null>(null);
  const activeMassiveJobRef = useRef<string | null>(null); // ferma il polling orfano del job massivo
  // All'uscita dalla pagina il polling del job massivo si ferma (il job continua
  // nel worker; senza questo cleanup la catena di setTimeout continuava a
  // chiamare l'edge function ogni 4s anche dopo la navigazione altrove).
  useEffect(() => () => { activeMassiveJobRef.current = null; }, []);
  const [renderLimit, setRenderLimit] = useState(200);    // righe renderizzate (anti-jank su migliaia)

  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [filterFlags, setFilterFlags] = useState({ email: false, hot: false, notCrm: false, edil: false, conFatturato: false });
  const [sortBy, setSortBy] = useState<"ai" | "intent" | "buying" | "rating" | "name" | "fatturato">("ai");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sequenzaId, setSequenzaId] = useState<string>("");

  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [importCrmOpen, setImportCrmOpen] = useState(false);

  // ── ricerche salvate ───────────────────────────────────────────────────────
  const { data: searches = [] } = useQuery({
    queryKey: ["lead-scraper", "searches"],
    queryFn: async (): Promise<LeadSearch[]> => {
      const { data, error } = await fromLS("lead_scraper_searches")
        .select("id, source, label, query, results_count, status, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data || []) as LeadSearch[];
    },
    enabled: hasAccess,
  });

  // ── risultati della ricerca corrente ─────────────────────────────────────────
  const { data: results = [], isFetching: resultsLoading } = useQuery({
    queryKey: ["lead-scraper", "results", currentSearchId],
    queryFn: async (): Promise<LeadResult[]> => {
      if (!currentSearchId) return [];
      const { data, error } = await fromLS("lead_scraper_results")
        .select("*")
        .eq("search_id", currentSearchId)
        .order("ai_score", { ascending: false, nullsFirst: false })
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(2000); // cap: oltre si lavora a segmenti/export
      if (error) throw error;
      return (data || []) as LeadResult[];
    },
    enabled: hasAccess && !!currentSearchId,
  });

  const kpi = useMemo(() => ({
    total: results.length,
    withPhone: results.filter((r) => r.phone).length,
    withEmail: results.filter((r) => r.email).length,
    hot: results.filter((r) => r.ai_label === "hot").length,
  }), [results]);

  // ── stato outreach per lead (inviata/aperta/click) ──────────────────────────
  const resultIdsKey = results.length;
  const { data: outreachRows = [] } = useQuery({
    queryKey: ["lead-scraper", "outreach-map", currentSearchId, resultIdsKey],
    queryFn: async (): Promise<Array<{ lead_id: string; sends: number; opened: boolean; clicked: boolean; replied: boolean }>> => {
      const ids = results.map((r) => r.id).slice(0, 1000);
      if (!ids.length) return [];
      const { data, error } = await fromLS("lead_scraper_outreach_by_lead")
        .select("lead_id, sends, opened, clicked, replied").in("lead_id", ids);
      if (error) throw error;
      return (data || []) as Array<{ lead_id: string; sends: number; opened: boolean; clicked: boolean; replied: boolean }>;
    },
    enabled: hasAccess && !!currentSearchId && results.length > 0,
  });
  const outreachMap = useMemo(
    () => new Map(outreachRows.map((o) => [o.lead_id, o])),
    [outreachRows],
  );

  // ── mutations ────────────────────────────────────────────────────────────────
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("lead-scraper", { body });
    if (error) {
      // edge function ritorna {error} con status non-2xx → error.context
      let msg = error.message;
      try {
        const ctx = await (error as { context?: Response }).context?.json?.();
        if (ctx?.error) msg = ctx.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // Esegue un'azione a lotti con barra di avanzamento (evita il limite ~150s
  // della edge function su operazioni lunghe). Somma i contatori numerici.
  const batchInvoke = async (
    label: string, action: string, ids: string[], batchSize: number, extra: Record<string, unknown> = {},
  ): Promise<Record<string, number>> => {
    const acc: Record<string, number> = {};
    setProgress({ label, done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const res = await invoke({ action, resultIds: chunk, ...extra });
        for (const [k, v] of Object.entries(res || {})) if (typeof v === "number") acc[k] = (acc[k] || 0) + (v as number);
        setProgress({ label, done: Math.min(i + batchSize, ids.length), total: ids.length });
      }
    } finally {
      setProgress(null);
    }
    return acc;
  };

  // openapi.it: ambiente sandbox (test gratis) vs produzione (dati reali)
  const openapiEnvQuery = useQuery({
    queryKey: ["lead-scraper", "openapi-env"],
    queryFn: () => invoke({ action: "openapi_env" }) as Promise<{ env: string; hasToken: boolean }>,
    enabled: hasAccess && source === "company_search",
  });
  // Quota odierna per la trasparenza costi pre-ricerca (riusa la vista usata in Analytics).
  const { data: providerUsageInline = [] } = useQuery({
    queryKey: ["lead-scraper", "provider-usage-inline"],
    queryFn: async (): Promise<{ provider: string; calls_today: number }[]> => {
      const { data } = await fromLS("lead_scraper_provider_usage").select("provider, calls_today");
      return (data || []) as { provider: string; calls_today: number }[];
    },
    enabled: hasAccess && (source === "company_search" || source === "google_maps"),
    staleTime: 60_000,
  });
  const setOpenapiEnv = useMutation({
    mutationFn: (env: "sandbox" | "prod") => invoke({ action: "openapi_env", set: env }),
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-scraper", "openapi-env"], data);
      toast.success(`openapi.it → ${data.env === "prod" ? "Produzione (dati reali)" : "Sandbox (test gratis)"}`);
    },
    onError: (e: Error) => toast.error("Cambio ambiente fallito", { description: e.message }),
  });

  const searchMutation = useMutation({
    mutationFn: () => invoke({
      action: "search", source,
      keyword: keyword.trim(), city: city.trim(), region: region.trim(),
      maxResults: parseInt(maxResults, 10) || 20,
      extractEmails,
      mode: gridMode && source === "google_maps" ? "grid" : "text",
    }),
    onSuccess: (data) => {
      setCurrentSearchId(data.searchId);
      setSelected(new Set());
      setRenderLimit(200);
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
      const desc = data.scrapedNew != null
        ? `${data.reused ?? 0} riusati dal DB (gratis) · ${data.scrapedNew} nuovi scrapati`
        : data.withPhone != null
          ? `${data.withPhone} con telefono · ${data.withEmail} con email`
          : "Usa Arricchisci per recuperare contatti";
      toast.success(`${data.count} lead trovati`, { description: desc });
    },
    onError: (e: Error) => toast.error("Ricerca fallita", { description: e.message }),
  });

  // Scraping MASSIVO (migliaia): enqueue di un job → il worker lo processa in
  // background → polling con setTimeout (no effetti → no warning lint).
  const runMassive = async () => {
    const target = Math.max(1, Math.min(20000, parseInt(massiveTarget, 10) || 1000));
    try {
      const data = await invoke({ action: "enqueue_scrape", keyword: keyword.trim(), city: city.trim(), region: region.trim(), engine: "paginegialle", target, extractEmails });
      const id = data.jobId as string;
      setJobId(id);
      activeMassiveJobRef.current = id;
      setProgress({ label: "Scraping massivo (in coda)", done: 0, total: target });
      const poll = async () => {
        if (activeMassiveJobRef.current !== id) return; // job non più attivo (unmount/nuovo job) → stop
        try {
          const s = await invoke({ action: "job_status", jobId: id });
          setProgress({ label: `Scraping massivo · ${s.status}`, done: s.processed || 0, total: s.total || target });
          if (s.status === "done") {
            setProgress(null); setJobId(null); activeMassiveJobRef.current = null;
            if (s.search_id) { setCurrentSearchId(s.search_id); setSelected(new Set()); setRenderLimit(200); }
            queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
            toast.success(`Scraping massivo completato`, { description: `${s.results_count} aziende nel DB proprietario` });
            return;
          }
          if (s.status === "error" || s.status === "canceled") {
            setProgress(null); setJobId(null); activeMassiveJobRef.current = null;
            toast.error("Job interrotto", { description: s.error || s.status });
            return;
          }
          setTimeout(poll, 4000);
        } catch {
          setTimeout(poll, 6000);
        }
      };
      toast.success("Job avviato", { description: `Il worker scraperà fino a ${target} aziende in background` });
      setTimeout(poll, 3000);
    } catch (e) {
      setProgress(null); setJobId(null);
      toast.error("Avvio job fallito", { description: (e as Error).message });
    }
  };

  // BUGFIX: l'azione edge "qualify" processa max 60 lead per chiamata (limite
  // prompt AI). Prima con searchId/lista lunga troncava a 60 IN SILENZIO: ora
  // la UI spezza sempre in lotti da 40 con barra di avanzamento.
  const qualifyMutation = useMutation({
    mutationFn: (resultIds?: string[]) => {
      const ids = resultIds?.length ? resultIds : results.map((r) => r.id);
      return batchInvoke("Qualifica AI", "qualify", ids, 40, { icp: icp.trim() });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.qualified || 0} lead qualificati con AI`);
    },
    onError: (e: Error) => toast.error("Qualificazione fallita", { description: e.message }),
  });

  // Deep enrichment: sito → email + telefono + P.IVA + social + intent + VIES (gratis)
  const deepEnrichMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Arricchimento", "deep_enrich", resultIds, 10, { vies: true }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.enriched} lead arricchiti`, { description: "Email, P.IVA, social e segnali d'intento" });
    },
    onError: (e: Error) => toast.error("Arricchimento fallito", { description: e.message }),
  });

  // Email finder: pattern nome.cognome@dominio + verifica MX (gratis)
  const findEmailMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Ricerca email", "find_email", resultIds, 15),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.found} email ipotizzate`, { description: `dominio verificato (MX) su ${data.attempted} lead` });
    },
    onError: (e: Error) => toast.error("Email finder fallito", { description: e.message }),
  });

  // LinkedIn finder: trova il profilo del decisore via Serper/CSE
  const findLinkedinMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Ricerca LinkedIn", "find_linkedin", resultIds, 8),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.found} profili LinkedIn trovati`, { description: `su ${data.attempted} lead` });
    },
    onError: (e: Error) => toast.error("Ricerca LinkedIn fallita", { description: e.message }),
  });

  // Provider esterni a basso costo (gated)
  const enrichApolloMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Apollo enrich", "enrich_apollo", resultIds, 10),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.enriched} arricchiti con Apollo`, { description: `su ${data.attempted} lead` });
    },
    onError: (e: Error) => toast.error("Apollo fallito", { description: e.message }),
  });
  const enrichPdlMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("PDL enrich", "enrich_pdl", resultIds, 10),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.enriched} arricchiti con PDL`, { description: `su ${data.attempted} lead` });
    },
    onError: (e: Error) => toast.error("PDL fallito", { description: e.message }),
  });
  const verifyEmailMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Verifica email", "verify_email", resultIds, 15),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.valid} email valide`, { description: data.invalid ? `${data.invalid} non valide rimosse` : undefined });
    },
    onError: (e: Error) => toast.error("Verifica email fallita", { description: e.message }),
  });

  // PEC — email certificata deliverable da P.IVA (Italia)
  const findPecMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Trova PEC", "find_pec", resultIds, 8),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.found} PEC trovate`, { description: `email certificate da P.IVA · su ${data.attempted} lead` });
    },
    onError: (e: Error) => toast.error("Ricerca PEC fallita", { description: e.message }),
  });

  // Registro Imprese — firmografici reali (ATECO, fatturato, dipendenti, anno) da P.IVA
  const enrichRegistroMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Registro Imprese", "enrich_registro", resultIds, 8),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.enriched} aziende arricchite dal Registro`, {
        description: `ATECO · fatturato · dipendenti${data.withPec ? ` · ${data.withPec} PEC` : ""} · su ${data.attempted} con P.IVA`,
      });
    },
    onError: (e: Error) => toast.error("Arricchimento Registro fallito", { description: e.message }),
  });

  // Valida P.IVA su VIES (gratis) → ragione sociale ufficiale. Azione edge già pronta.
  const validateVatMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Valida P.IVA", "validate_vat", resultIds, 10),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.validated} P.IVA valide (VIES)`, { description: `su ${data.attempted} con P.IVA · ragione sociale ufficiale salvata nei dati azienda` });
    },
    onError: (e: Error) => toast.error("Validazione P.IVA fallita", { description: e.message }),
  });

  // Dati persona dal profilo LinkedIn (Proxycurl): nome/ruolo/email decisore.
  const enrichLinkedinMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Dati LinkedIn", "enrich_linkedin_profile", resultIds, 6),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.enriched} profili LinkedIn arricchiti`, { description: `nome/ruolo/email · su ${data.attempted} con URL LinkedIn` });
    },
    onError: (e: Error) => toast.error("Arricchimento LinkedIn fallito", { description: e.message }),
  });

  // Outreach reale — invio a freddo. channel "mailbox" = ruota sulle caselle Google/Outlook
  // collegate (cap/giorno, protegge la reputazione del dominio); "esp" = Resend (per opt-in).
  const sendOutreachMutation = useMutation({
    mutationFn: ({ ids, channel }: { ids: string[]; channel: "mailbox" | "esp" }) =>
      batchInvoke(
        channel === "mailbox" ? "Invio (caselle)" : "Invio (Resend)",
        "send_outreach", ids, channel === "mailbox" ? 50 : 5, { channel },
      ),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "outreach-map", currentSearchId] });
      if (vars.channel === "mailbox") {
        toast.success(`${data.queued || 0} email in coda dalle caselle`, {
          description: `${data.skipped_capacity ? `${data.skipped_capacity} oltre il cap giornaliero · ` : ""}${data.suppressed || 0} opt-out · invio a rotazione`,
        });
      } else {
        toast.success(`${data.sent || 0} email inviate (Resend)`, {
          description: `${data.failed || 0} fallite · ${data.suppressed || 0} opt-out · su ${data.attempted || 0}`,
        });
      }
    },
    onError: (e: Error) => toast.error("Invio outreach fallito", { description: e.message }),
  });

  // v5 — Buying signals (intent reale)
  const buyingMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Buying signals", "compute_buying_signals", resultIds, 10),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.scored} lead valutati per intento d'acquisto`);
    },
    onError: (e: Error) => toast.error("Buying signals falliti", { description: e.message }),
  });
  // v5 — flag già-clienti
  const flagExistingMutation = useMutation({
    mutationFn: (resultIds: string[]) => invoke({ action: "flag_existing_customers", resultIds: resultIds.length ? resultIds : undefined, searchId: resultIds.length ? undefined : currentSearchId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.flagged} già clienti EiC segnalati`, { description: "Filtrali via per non ricontattarli" });
    },
    onError: (e: Error) => toast.error("Controllo clienti fallito", { description: e.message }),
  });
  // v5 — sequenza AI multi-step
  const generateSequenceMutation = useMutation({
    mutationFn: () => invoke({ action: "generate_sequence", product: "Edilizia in Cloud, gestionale cloud per imprese edili", settore: keyword }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "sequenze"] });
      setSequenzaId(data.sequenzaId);
      toast.success(`Sequenza AI creata (${data.steps?.length || 0} step)`, { description: "Selezionata sotto — premi 'Avvia sequenza' per arruolare i lead" });
    },
    onError: (e: Error) => toast.error("Generazione sequenza fallita", { description: e.message }),
  });

  // v5 — Pipeline automatica: arricchisci → qualifica → buying → flag clienti (sui selezionati o tutti)
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const runPipeline = async () => {
    const ids = selectedIds.length ? selectedIds : results.map((r) => r.id);
    if (ids.length === 0) return;
    setPipelineRunning(true);
    try {
      await batchInvoke("Pipeline · arricchimento", "deep_enrich", ids, 10, { vies: true });
      await batchInvoke("Pipeline · buying signals", "compute_buying_signals", ids, 10);
      // a lotti: qualify processa max 60/chiamata, flag_existing filtra via .in()
      // (migliaia di id in una chiamata = filtro PostgREST troppo lungo)
      await batchInvoke("Pipeline · qualifica AI", "qualify", ids, 40, { icp: icp.trim() });
      await batchInvoke("Pipeline · già clienti", "flag_existing_customers", ids, 200);
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success("Pipeline completata", { description: "Arricchiti, valutati, qualificati e filtrati i già-clienti" });
    } catch (e) {
      toast.error("Pipeline interrotta", { description: (e as Error).message });
    } finally {
      setPipelineRunning(false);
    }
  };

  const pushMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Salvataggio CRM", "push_crm", resultIds, 25, { createOpportunity: createOpp }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      setSelected(new Set());
      const extra = [
        data.duplicates ? `${data.duplicates} già nel CRM` : null,
        data.suppressed ? `${data.suppressed} in opt-out` : null,
        data.opportunities ? `${data.opportunities} opportunità create` : null,
      ].filter(Boolean).join(" · ");
      toast.success(`${data.pushed} contatti salvati nel CRM`, { description: extra || undefined });
    },
    onError: (e: Error) => toast.error("Salvataggio CRM fallito", { description: e.message }),
  });

  // Sync verso il CRM: riempie i campi VUOTI del contatto collegato con quanto
  // trovato dall'enrichment (email/PEC affidabili, telefono, P.IVA, sito, fatturato).
  const syncCrmMutation = useMutation({
    mutationFn: (resultIds: string[]) => batchInvoke("Aggiorna CRM", "sync_crm", resultIds, 100),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      const detail = [
        d.filled_email ? `${d.filled_email} email` : null,
        d.filled_phone ? `${d.filled_phone} telefoni` : null,
        d.filled_piva ? `${d.filled_piva} P.IVA` : null,
        d.filled_sito ? `${d.filled_sito} siti` : null,
        d.filled_fatturato ? `${d.filled_fatturato} fatturati` : null,
      ].filter(Boolean).join(" · ");
      toast.success(`${d.synced || 0} contatti CRM aggiornati`, { description: detail || "Nessun campo nuovo da riempire (solo i campi vuoti vengono toccati)" });
    },
    onError: (e: Error) => toast.error("Aggiornamento CRM fallito", { description: e.message }),
  });

  // AI: sintesi + icebreaker personalizzato
  const outreachMutation = useMutation({
    mutationFn: (resultIds: string[]) => invoke({ action: "generate_outreach", resultIds }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.generated} messaggi AI generati`);
    },
    onError: (e: Error) => toast.error("Generazione messaggi fallita", { description: e.message }),
  });

  // GDPR: aggiungi alla do-not-contact
  const suppressMutation = useMutation({
    mutationFn: (resultIds: string[]) => invoke({ action: "suppress", resultIds, reason: "manual" }),
    onSuccess: (data) => {
      setSelected(new Set());
      toast.success(`${data.suppressed} email aggiunte alla lista opt-out`);
    },
    onError: (e: Error) => toast.error("Operazione fallita", { description: e.message }),
  });

  // Import CSV → crea una ricerca "import" + righe, poi arricchibili
  const importMutation = useMutation({
    mutationFn: async (rows: Array<{ business_name: string; website?: string; phone?: string; email?: string; city?: string }>) => {
      const { data: searchRow, error: sErr } = await fromLS("lead_scraper_searches").insert({
        source: "google_maps", label: `Import CSV · ${new Date().toLocaleDateString("it-IT")}`,
        query: { import: true }, status: "completed", results_count: rows.length,
      }).select("id").single();
      if (sErr) throw sErr;
      const toInsert = rows.map((r) => {
        const dk = r.email ? `p:${r.email.toLowerCase()}` : (r.phone ? `p:${r.phone.replace(/[^0-9+]/g, "")}` : `n:${r.business_name.trim().toLowerCase()}`);
        return { search_id: searchRow.id, source: "import", business_name: r.business_name, website: r.website || null, phone: r.phone || null, email: r.email || null, email_status: r.email ? "found" : null, city: r.city || null, country: "IT", dedupe_key: dk };
      });
      const { error: rErr } = await fromLS("lead_scraper_results").upsert(toInsert, { onConflict: "search_id,dedupe_key", ignoreDuplicates: true });
      if (rErr) throw rErr;
      return { searchId: searchRow.id as string, count: rows.length };
    },
    onSuccess: (data) => {
      setCurrentSearchId(data.searchId);
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
      toast.success(`${data.count} righe importate`, { description: "Ora puoi arricchirle" });
    },
    onError: (e: Error) => toast.error("Import fallito", { description: e.message }),
  });

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast.error("CSV vuoto o senza intestazione"); return; }
      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
      const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
      const ci = { name: idx(["azienda", "nome", "ragione", "business", "company"]), web: idx(["sito", "website", "web", "url"]), phone: idx(["telefono", "phone", "tel"]), email: idx(["email", "mail"]), city: idx(["città", "citta", "city", "comune"]) };
      if (ci.name < 0) { toast.error("Colonna nome/azienda non trovata nel CSV"); return; }
      const rows = lines.slice(1).map((line) => {
        const cells = splitCsvLine(line, sep);
        return { business_name: cells[ci.name] || "", website: ci.web >= 0 ? cells[ci.web] : undefined, phone: ci.phone >= 0 ? cells[ci.phone] : undefined, email: ci.email >= 0 ? cells[ci.email] : undefined, city: ci.city >= 0 ? cells[ci.city] : undefined };
      }).filter((r) => r.business_name).slice(0, 500);
      if (!rows.length) { toast.error("Nessuna riga valida"); return; }
      importMutation.mutate(rows);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deleteSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromLS("lead_scraper_searches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      if (currentSearchId === id) setCurrentSearchId(null);
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
      toast.success("Ricerca eliminata");
    },
  });

  // Sequenze email disponibili (per l'arruolamento)
  const { data: sequenze = [] } = useQuery({
    queryKey: ["lead-scraper", "sequenze"],
    queryFn: async (): Promise<Array<{ id: string; nome: string; attiva: boolean }>> => {
      const { data, error } = await fromLS("sequenze")
        .select("id, nome, attiva").order("created_at", { ascending: false }).limit(50);
      if (error) return [];
      return (data || []) as Array<{ id: string; nome: string; attiva: boolean }>;
    },
    enabled: hasAccess,
  });

  // Arruola i lead selezionati in una sequenza email
  const enrollMutation = useMutation({
    mutationFn: (resultIds: string[]) => invoke({ action: "enroll_sequence", resultIds, sequenzaId }),
    onSuccess: (data) => {
      setSelected(new Set());
      toast.success(`${data.enrolled} lead in sequenza`, { description: data.skipped ? `${data.skipped} saltati (opt-out o senza email)` : undefined });
    },
    onError: (e: Error) => toast.error("Arruolamento fallito", { description: e.message }),
  });

  // Modifica inline di un lead (dal pannello dettaglio)
  const updateLeadMutation = useMutation({
    mutationFn: async (patch: { id: string } & Record<string, unknown>) => {
      const { id, ...fields } = patch;
      // "" → null: campi svuotati nel form non devono restare stringhe vuote nel
      // DB (i filtri "con email" e il sync CRM trattano "" come valore presente).
      for (const k of Object.keys(fields)) {
        if (typeof fields[k] === "string" && !(fields[k] as string).trim()) fields[k] = null;
      }
      const { error } = await fromLS("lead_scraper_results").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success("Lead aggiornato");
    },
    onError: (e: Error) => toast.error("Salvataggio fallito", { description: e.message }),
  });

  // ── Azioni per-riga (singolo lead): converti, arricchisci, elimina ──────────
  const rowConvertMutation = useMutation({
    mutationFn: ({ id, createOpportunity }: { id: string; createOpportunity: boolean }) =>
      invoke({ action: "push_crm", resultIds: [id], createOpportunity }),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      if (data.duplicates) toast.info("Già presente nel CRM");
      else if (data.suppressed) toast.warning("In opt-out: non importato (GDPR)");
      else if (data.skipped) toast.info("Lead già convertito in precedenza");
      else if (!data.pushed) toast.error("Non sono riuscito a convertire il lead. Riprova.");
      else toast.success(vars.createOpportunity ? "Convertito in opportunità" : "Convertito in contatto");
    },
    onError: (e: Error) => toast.error("Conversione fallita", { description: e.message }),
  });

  // "Trova tutte le info": deep_enrich (sito → email/telefono/P.IVA/social/firmografici) + find_email — gratis
  const rowEnrichMutation = useMutation({
    mutationFn: async (id: string) => {
      await invoke({ action: "deep_enrich", resultIds: [id] });
      await invoke({ action: "find_email", resultIds: [id] });
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success("Info azienda aggiornate");
    },
    onError: (e: Error) => toast.error("Arricchimento fallito", { description: e.message }),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromLS("lead_scraper_results").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success("Lead eliminato");
    },
    onError: (e: Error) => toast.error("Eliminazione fallita", { description: e.message }),
  });

  const busy = searchMutation.isPending || qualifyMutation.isPending || deepEnrichMutation.isPending ||
    findEmailMutation.isPending || findLinkedinMutation.isPending || pushMutation.isPending ||
    outreachMutation.isPending || suppressMutation.isPending || importMutation.isPending ||
    enrollMutation.isPending || enrichApolloMutation.isPending || enrichPdlMutation.isPending ||
    verifyEmailMutation.isPending || buyingMutation.isPending || flagExistingMutation.isPending ||
    generateSequenceMutation.isPending || findPecMutation.isPending || enrichRegistroMutation.isPending ||
    validateVatMutation.isPending || enrichLinkedinMutation.isPending ||
    syncCrmMutation.isPending ||
    sendOutreachMutation.isPending || pipelineRunning || jobId !== null || progress !== null;

  // ── filtri + ordinamento ──────────────────────────────────────────────────────
  const visibleResults = useMemo(() => {
    let list = hideSeen ? results.filter((r) => !r.seen_before) : results;
    const q = filterQ.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.business_name} ${r.city || ""} ${r.email || ""} ${r.contact_name || ""}`.toLowerCase().includes(q));
    if (filterFlags.email) list = list.filter((r) => !!r.email);
    if (filterFlags.hot) list = list.filter((r) => r.ai_label === "hot" || (r.intent_score != null && r.intent_score >= 70));
    if (filterFlags.notCrm) list = list.filter((r) => !r.pushed_to_crm);
    if (filterFlags.edil) list = list.filter((r) => /^4[123]/.test(r.ateco || "")); // ATECO 41/42/43 = costruzioni
    if (filterFlags.conFatturato) list = list.filter((r) => (r.fatturato ?? 0) > 0); // solo con fatturato dal Registro
    const arr = [...list];
    arr.sort((a, b) => {
      if (sortBy === "name") return a.business_name.localeCompare(b.business_name);
      if (sortBy === "fatturato") return (b.fatturato ?? 0) - (a.fatturato ?? 0);
      const key = sortBy === "ai" ? "ai_score" : sortBy === "intent" ? "intent_score" : sortBy === "buying" ? "buying_score" : "rating";
      return (Number(b[key as keyof LeadResult] ?? -1)) - (Number(a[key as keyof LeadResult] ?? -1));
    });
    return arr;
  }, [results, hideSeen, filterQ, filterFlags, sortBy]);
  const seenCount = useMemo(() => results.filter((r) => r.seen_before).length, [results]);

  // ── funnel ────────────────────────────────────────────────────────────────────
  const funnel = useMemo(() => ({
    total: results.length,
    enriched: results.filter((r) => r.enrichment != null || r.intent_score != null).length,
    qualified: results.filter((r) => r.ai_score != null).length,
    pushed: results.filter((r) => r.pushed_to_crm).length,
    opps: results.filter((r) => r.crm_opportunity_id).length,
    inviate: outreachMap.size,
    aperte: [...outreachMap.values()].filter((o) => o.opened).length,
  }), [results, outreachMap]);

  const detailLead = useMemo(() => results.find((r) => r.id === detailId) || null, [results, detailId]);

  // selezione smart
  const selectWhere = (pred: (r: LeadResult) => boolean) => setSelected(new Set(visibleResults.filter(pred).map((r) => r.id)));

  // ── selezione ─────────────────────────────────────────────────────────────────
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = visibleResults.length > 0 && visibleResults.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleResults.map((r) => r.id)));
  // BUGFIX: azioni in blocco + export agiscono SOLO sui lead VISIBILI col filtro
  // corrente (non su selezionati poi nascosti da un filtro).
  const visibleIds = useMemo(() => new Set(visibleResults.map((r) => r.id)), [visibleResults]);
  const selectedIds = [...selected].filter((id) => visibleIds.has(id));
  // Lead collegati a un contatto CRM (import dal CRM o già convertiti):
  // bersaglio del bottone "Aggiorna CRM" (selezionati, altrimenti tutti i visibili).
  const crmLinkedIds = (selectedIds.length ? visibleResults.filter((r) => selected.has(r.id)) : visibleResults)
    .filter((r) => r.crm_contact_id).map((r) => r.id);

  // ── export CSV ─────────────────────────────────────────────────────────────────
  const CSV_HEADER = ["Azienda", "Contatto", "Ruolo", "Telefono", "Email", "Stato email", "P.IVA", "Sito",
    "LinkedIn", "Facebook", "Instagram", "Indirizzo", "Città", "Rating", "Recensioni", "AI Score", "Intent Score",
    "Buying Score", "Già cliente", "ATECO", "Settore", "Dipendenti", "Fatturato", "Anno", "Forma giuridica"];
  // Anti CSV/formula-injection: ogni cella passa da escapeCsvCell (neutralizza
  // = + - @ e applica il quoting RFC-4180). Protegge entrambi gli export
  // (exportCsv + exportCsvAll) che condividono csvRow.
  const csvEsc = (v: unknown) => escapeCsvCell(v as string | number | null | undefined, ",");
  const csvRow = (r: Partial<LeadResult>) => [
    r.business_name, r.contact_name, r.role, r.phone, r.email, r.email_status, r.partita_iva, r.website,
    r.linkedin_url, r.facebook_url, r.instagram_url, r.address, r.city,
    r.rating, r.reviews_count, r.ai_score, r.intent_score,
    r.buying_score, r.is_existing_customer ? "sì" : "",
    r.ateco, r.ateco_desc, r.dipendenti, r.fatturato, r.anno_fondazione, r.forma_giuridica,
  ].map(csvEsc).join(",");
  const downloadCsv = (csv: string, suffix = "") => {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-scraper-${suffix ? suffix + "-" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export rapido: selezione o risultati già in memoria (≤2000).
  const exportCsv = () => {
    const rows = selectedIds.length ? visibleResults.filter((r) => selected.has(r.id)) : visibleResults;
    if (!rows.length) return;
    const csv = [CSV_HEADER.join(","), ...rows.map(csvRow)].join("\n");
    downloadCsv(csv);
  };

  // Export MASSIVO: pagina l'intera ricerca corrente dal DB (migliaia di righe)
  // a blocchi di 1000 con barra di avanzamento → niente cap a 2000.
  const [exportingAll, setExportingAll] = useState(false);
  const exportCsvAll = async () => {
    if (!currentSearchId || exportingAll) return;
    setExportingAll(true);
    const PAGE = 1000;
    const lines: string[] = [CSV_HEADER.join(",")];
    try {
      const { count } = await fromLS("lead_scraper_results")
        .select("id", { count: "exact", head: true })
        .eq("search_id", currentSearchId);
      const total = count ?? 0;
      if (!total) { toast.info("Nessun risultato da esportare"); return; }
      setProgress({ label: `Export CSV (${total} lead)`, done: 0, total });
      for (let from = 0; from < total; from += PAGE) {
        const { data, error } = await fromLS("lead_scraper_results")
          .select("business_name, contact_name, role, phone, email, email_status, partita_iva, website, linkedin_url, facebook_url, instagram_url, address, city, rating, reviews_count, ai_score, intent_score, buying_score, is_existing_customer, ateco, ateco_desc, dipendenti, fatturato, anno_fondazione, forma_giuridica")
          .eq("search_id", currentSearchId)
          .order("ai_score", { ascending: false, nullsFirst: false })
          .order("rating", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of (data || []) as Partial<LeadResult>[]) lines.push(csvRow(r));
        setProgress({ label: `Export CSV (${total} lead)`, done: Math.min(from + PAGE, total), total });
      }
      downloadCsv(lines.join("\n"), "completo");
      toast.success(`Esportati ${lines.length - 1} lead in CSV`);
    } catch (e) {
      toast.error("Errore export CSV", { description: (e as Error).message });
    } finally {
      setProgress(null);
      setExportingAll(false);
    }
  };

  if (permLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">Accesso negato</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5"><Target className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lead Scraper</h1>
          <p className="text-sm text-muted-foreground">Genera liste di imprese edili da più fonti, qualificale con l'AI e portale nel CRM.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAnalyticsOpen(true)}>
            <BarChart3 className="h-4 w-4" /> Analytics
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAutopilotOpen(true)}>
            <Bot className="h-4 w-4" /> Autopilot
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEnrichOpen(true)}>
            <Sparkles className="h-4 w-4" /> Arricchisci azienda
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* ── Colonna sinistra: form + cronologia ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Nuova ricerca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Fonte */}
              <div>
                <Label className="text-xs">Fonte</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {SOURCES.map((s) => {
                    const Icon = s.icon;
                    const isActive = source === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!s.active}
                        onClick={() => s.active && setSource(s.id)}
                        title={s.hint}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors ${
                          isActive ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                        } ${!s.active ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <Icon className="h-4 w-4" />
                        {s.label}
                        {!s.active && <span className="text-[9px]">presto</span>}
                      </button>
                    );
                  })}
                </div>
                {source === "company_search" && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-[11px] text-muted-foreground">Ambiente openapi.it</span>
                    <div className="flex gap-1">
                      {(["sandbox", "prod"] as const).map((e) => {
                        const active = (openapiEnvQuery.data?.env || "sandbox") === e;
                        return (
                          <button key={e} type="button" disabled={setOpenapiEnv.isPending || active}
                            onClick={() => setOpenapiEnv.mutate(e)}
                            title={e === "sandbox" ? "Test gratis con dati finti" : "Dati reali (consuma il free-tier/credito)"}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                            {e === "sandbox" ? "Sandbox" : "Produzione"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Settore / keyword */}
              <div>
                <Label className="text-xs">{source === "company_search" ? "Codice ATECO o nome" : "Settore / attività"}</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={source === "company_search" ? "es. 41 (ATECO) oppure nome azienda" : "es. impresa edile"} className="mt-1" />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {source === "company_search"
                    ? ATECO_PRESETS.map((p) => (
                      <button key={p.code} type="button" onClick={() => setKeyword(p.code)}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/70" title={p.label}>
                        {p.label}
                      </button>
                    ))
                    : SECTOR_PRESETS.slice(0, 6).map((p) => (
                      <button key={p} type="button" onClick={() => setKeyword(p)}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/70">
                        {p}
                      </button>
                    ))}
                </div>
                {source === "company_search" && (
                  <p className="text-[10px] text-muted-foreground mt-1">Dati ufficiali dal Registro Imprese (P.IVA, ATECO, fatturato, dipendenti, PEC). Filtra per ATECO + città.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{source === "company_search" ? "Provincia (sigla)" : "Città"}</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={source === "company_search" ? "es. MI" : "Milano"} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Regione/Prov.</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Lombardia" className="mt-1" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Numero risultati</Label>
                <Select value={maxResults} onValueChange={setMaxResults}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["20", "40", "60"].map((n) => <SelectItem key={n} value={n}>{n} lead</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Estrai email dai siti</span>
                </div>
                <Switch checked={extractEmails} onCheckedChange={setExtractEmails} />
              </div>

              {source === "google_maps" && (
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Ricerca estesa (geo-grid &gt;60)</span>
                  </div>
                  <Switch checked={gridMode} onCheckedChange={setGridMode} />
                </div>
              )}

              {source === "internal" && (
                <div className="rounded-lg border p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span className="text-xs">Scraping massivo (migliaia, in background)</span>
                    </div>
                    <Switch checked={massive} onCheckedChange={setMassive} />
                  </div>
                  {massive && (
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">Target</Label>
                      <Input type="number" value={massiveTarget} onChange={(e) => setMassiveTarget(e.target.value)} className="h-7 w-24 text-xs" min={1} max={20000} />
                      <span className="text-[10px] text-muted-foreground">aziende (job asincrono)</span>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const isSandbox = source === "company_search" && openapiEnvQuery.data?.env !== "prod";
                const n = massive && source === "internal" ? (parseInt(massiveTarget, 10) || 0) : (parseInt(maxResults, 10) || 0);
                const stima = stimaCostoRicerca(source, n);
                if (!stima.testo && !isSandbox) return null;
                const googleToday = providerUsageInline.find((p) => p.provider === "google_places")?.calls_today;
                return (
                  <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <span>Stima costo: </span>
                    <span className="font-medium text-foreground">{isSandbox ? "gratis (Sandbox · dati di test)" : stima.testo}</span>
                    {source === "google_maps" && googleToday != null && <span> · Google oggi: {googleToday}/2000</span>}
                  </div>
                );
              })()}
              <Button className="w-full gap-2"
                onClick={() => (massive && source === "internal" ? runMassive() : searchMutation.mutate())}
                disabled={busy || !keyword.trim()}>
                {searchMutation.isPending || jobId ? <Loader2 className="h-4 w-4 animate-spin" /> : (massive && source === "internal" ? <Zap className="h-4 w-4" /> : <Search className="h-4 w-4" />)}
                {massive && source === "internal" ? "Avvia scraping massivo" : "Cerca lead"}
              </Button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground">oppure</span><div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importa CSV
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => setImportCrmOpen(true)} disabled={busy}
                title="Aziende già nel sistema (es. con P.IVA ma senza email): importale, arricchiscile e riscrivi i dati nel CRM">
                <Database className="h-4 w-4" /> Arricchisci dal CRM
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
            </CardContent>
          </Card>

          {/* ICP per qualificazione AI */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> ICP per AI</CardTitle>
              <CardDescription className="text-[11px]">Descrizione del cliente ideale usata per il punteggio 0-100.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={icp} onChange={(e) => setIcp(e.target.value)} rows={4} className="text-xs" />
            </CardContent>
          </Card>

          {/* Cronologia ricerche */}
          {searches.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ricerche recenti</CardTitle></CardHeader>
              <CardContent className="space-y-1 px-2">
                {searches.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                      currentSearchId === s.id ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                    onClick={() => { setCurrentSearchId(s.id); setSelected(new Set()); setRenderLimit(200); }}
                  >
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{s.label || "Ricerca"}</p>
                      <p className="text-[10px] text-muted-foreground">{s.results_count} lead · {formatRelativeTime(s.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Elimina ricerca"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirm({ title: "Eliminare la ricerca?", description: "Tutti i lead associati verranno rimossi.", confirmLabel: "Elimina", variant: "destructive" })) {
                          deleteSearchMutation.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Colonna destra: risultati ── */}
        <div className="space-y-4">
          {/* KPI + barra azioni */}
          {currentSearchId && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Lead", value: kpi.total, icon: Building2 },
                  { label: "Telefono", value: kpi.withPhone, icon: Phone },
                  { label: "Email", value: kpi.withEmail, icon: Mail },
                  { label: "Hot (AI)", value: kpi.hot, icon: Sparkles },
                ].map((k) => {
                  const Icon = k.icon;
                  return (
                    <Card key={k.label}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold leading-none">{k.value}</p>
                          <p className="text-[11px] text-muted-foreground">{k.label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="gap-1.5"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => deepEnrichMutation.mutate(selectedIds)}
                  title="Sito → email, telefono, P.IVA, social, segnali d'intento (gratis)">
                  {deepEnrichMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Arricchisci{selectedIds.length ? ` (${selectedIds.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => findEmailMutation.mutate(selectedIds)}
                  title="Email pattern nome.cognome@dominio + verifica MX">
                  {findEmailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Trova email
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => findLinkedinMutation.mutate(selectedIds)}
                  title="Trova il LinkedIn del decisore (Serper/CSE)">
                  {findLinkedinMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Linkedin className="h-3.5 w-3.5" />}
                  LinkedIn
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || selectedIds.length === 0}>
                      <Database className="h-3.5 w-3.5" /> Provider <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-[11px]">Provider esterni (a basso costo)</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => enrichApolloMutation.mutate(selectedIds)}>
                      <Rocket className="h-3.5 w-3.5 mr-2" /> Apollo — email decisore
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => enrichPdlMutation.mutate(selectedIds)}>
                      <Database className="h-3.5 w-3.5 mr-2" /> People Data Labs — email/tel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => verifyEmailMutation.mutate(selectedIds)}>
                      <BadgeCheck className="h-3.5 w-3.5 mr-2" /> Verifica email (deliverability)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => findPecMutation.mutate(selectedIds)}>
                      <Mail className="h-3.5 w-3.5 mr-2 text-violet-600" /> Trova PEC (email certificata da P.IVA)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => enrichRegistroMutation.mutate(selectedIds)}>
                      <Building2 className="h-3.5 w-3.5 mr-2 text-sky-600" /> Registro Imprese (ATECO, fatturato, dipendenti)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => validateVatMutation.mutate(selectedIds)}>
                      <BadgeCheck className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Valida P.IVA (VIES, gratis)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => enrichLinkedinMutation.mutate(selectedIds)}>
                      <Linkedin className="h-3.5 w-3.5 mr-2 text-[#0a66c2]" /> Dati persona da LinkedIn (Proxycurl)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px]">Intento & outreach</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => buyingMutation.mutate(selectedIds)}>
                      <Flame className="h-3.5 w-3.5 mr-2 text-orange-500" /> Buying signals (intento d'acquisto)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => flagExistingMutation.mutate(selectedIds)}>
                      <ShieldBan className="h-3.5 w-3.5 mr-2" /> Segnala già-clienti EiC
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => generateSequenceMutation.mutate()}>
                      <MessageSquareQuote className="h-3.5 w-3.5 mr-2 text-primary" /> Genera sequenza email AI
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      const n = selectedIds.length;
                      if (!n) { toast.error("Seleziona almeno un lead"); return; }
                      if (await confirm({ title: `Invio a freddo dalle caselle a ${n} lead?`, description: "Ruota sulle caselle Google/Outlook collegate alla piattaforma, con cap giornaliero per casella (consigliato per il cold: protegge la reputazione del dominio). Esclude gli opt-out (GDPR).", confirmLabel: "Metti in coda" })) {
                        sendOutreachMutation.mutate({ ids: selectedIds, channel: "mailbox" });
                      }
                    }}>
                      <Send className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Invia dalle caselle Google/Outlook (rotazione)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      const n = selectedIds.length;
                      if (!n) { toast.error("Seleziona almeno un lead"); return; }
                      if (await confirm({ title: `Inviare via Resend a ${n} lead?`, description: "Invio via ESP (Resend). Adatto a liste opt-in / dominio dedicato — NON per liste a freddo (rischio reputazione). Esclude gli opt-out (GDPR).", confirmLabel: "Invia ora" })) {
                        sendOutreachMutation.mutate({ ids: selectedIds, channel: "esp" });
                      }
                    }}>
                      <Mail className="h-3.5 w-3.5 mr-2 text-sky-600" /> Invia via Resend/ESP (liste opt-in)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" className="gap-1.5 bg-orange-600 hover:bg-orange-700"
                  disabled={busy || results.length === 0}
                  onClick={runPipeline}
                  title="Tutto in uno: arricchisci → buying signals → qualifica AI → segnala già-clienti">
                  {pipelineRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Pipeline AI{selectedIds.length ? ` (${selectedIds.length})` : " (tutti)"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
                  onClick={() => qualifyMutation.mutate(selectedIds.length ? selectedIds : undefined)}
                  title="Punteggio AI 0-100 vs ICP">
                  {qualifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Qualifica AI{selectedIds.length ? ` (${selectedIds.length})` : ""}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => outreachMutation.mutate(selectedIds)}
                  title="Sintesi + frase di apertura personalizzata per email a freddo">
                  {outreachMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareQuote className="h-3.5 w-3.5" />}
                  Messaggio AI
                </Button>
                <Button size="sm" className="gap-1.5"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => pushMutation.mutate(selectedIds)}>
                  {pushMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Salva nel CRM ({selectedIds.length})
                </Button>
                {crmLinkedIds.length > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    disabled={busy}
                    onClick={() => syncCrmMutation.mutate(crmLinkedIds)}
                    title="Riscrive nel contatto CRM collegato i campi vuoti riempiti dall'enrichment: email/PEC affidabili, telefono, P.IVA, sito, fatturato, ATECO nelle note. Mai sovrascritti i dati esistenti.">
                    {syncCrmMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                    Aggiorna CRM ({crmLinkedIds.length})
                  </Button>
                )}
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <Checkbox checked={createOpp} onCheckedChange={(v) => setCreateOpp(!!v)} /> + opportunità
                </label>
                <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"
                  disabled={busy || selectedIds.length === 0}
                  onClick={async () => {
                    if (await confirm({ title: "Aggiungere alla lista opt-out?", description: "Le email selezionate non verranno più contattate (GDPR).", confirmLabel: "Sopprimi", variant: "destructive" })) {
                      suppressMutation.mutate(selectedIds);
                    }
                  }}
                  title="Aggiungi alla do-not-contact (GDPR)">
                  {suppressMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldBan className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 ml-auto" onClick={exportCsv} disabled={results.length === 0}>
                  <Download className="h-3.5 w-3.5" /> CSV {selectedIds.length ? `(${selectedIds.length})` : "vista"}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={exportCsvAll}
                  disabled={!currentSearchId || exportingAll}
                  title="Esporta TUTTI i lead della ricerca (anche oltre 2000) — paginazione dal DB">
                  {exportingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} CSV completo
                </Button>
              </div>

              {/* Barra di avanzamento operazioni a lotti */}
              {progress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground"><span>{progress.label}…</span><span>{progress.done}/{progress.total}</span></div>
                  <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Funnel */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {([["Trovati", funnel.total], ["Arricchiti", funnel.enriched], ["Qualificati", funnel.qualified], ["Inviate", funnel.inviate], ["Aperte", funnel.aperte], ["In CRM", funnel.pushed], ["Opportunità", funnel.opps]] as const).map(([l, v], i, arr) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span><span className="font-semibold text-foreground">{v}</span> {l}</span>
                    {i < arr.length - 1 && <ChevronRight className="h-3 w-3 opacity-40" />}
                  </span>
                ))}
              </div>

              {/* Filtri + ordina + selezione smart + sequenza */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <SlidersHorizontal className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Filtra…" className="h-8 w-40 pl-7 text-xs" />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">Ordina: AI score</SelectItem>
                    <SelectItem value="buying">Ordina: Intento d'acquisto</SelectItem>
                    <SelectItem value="intent">Ordina: Intento (fit)</SelectItem>
                    <SelectItem value="rating">Ordina: Rating</SelectItem>
                    <SelectItem value="fatturato">Ordina: Fatturato</SelectItem>
                    <SelectItem value="name">Ordina: Nome</SelectItem>
                  </SelectContent>
                </Select>
                {([["email", "Con email"], ["hot", "Hot"], ["notCrm", "Non in CRM"], ["edil", "Solo edilizia"], ["conFatturato", "Con fatturato"]] as const).map(([k, lbl]) => (
                  <button key={k} type="button"
                    onClick={() => setFilterFlags((f) => ({ ...f, [k]: !f[k] }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${filterFlags[k] ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
                    {lbl}
                  </button>
                ))}
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => selectWhere((r) => !!r.email && !r.pushed_to_crm)}>
                  Sel. con email
                </Button>
                {seenCount > 0 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none ml-auto">
                    <EyeOff className="h-3.5 w-3.5" />
                    <Checkbox checked={hideSeen} onCheckedChange={(v) => setHideSeen(!!v)} />
                    Nascondi {seenCount} già visti
                  </label>
                )}
              </div>

              {/* Sequenza email (loop outreach) */}
              {sequenze.length > 0 && (
                <div className="flex items-center gap-2">
                  <Send className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={sequenzaId} onValueChange={setSequenzaId}>
                    <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Sequenza email…" /></SelectTrigger>
                    <SelectContent>
                      {sequenze.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}{!s.attiva ? " (bozza)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5"
                    disabled={busy || !sequenzaId || selectedIds.length === 0}
                    onClick={() => enrollMutation.mutate(selectedIds)}
                    title="Arruola i lead selezionati (con email, non in opt-out) nella sequenza">
                    {enrollMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Avvia sequenza
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Tabella risultati */}
          <Card>
            <CardContent className="p-0">
              {!currentSearchId ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Target className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Avvia una ricerca per generare lead</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">es. "impresa edile" a Milano</p>
                </div>
              ) : resultsLoading && results.length === 0 ? (
                <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nessun lead per questa ricerca</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Seleziona tutti" /></TableHead>
                        <TableHead>Azienda</TableHead>
                        <TableHead>Contatti</TableHead>
                        <TableHead className="text-center">Rating</TableHead>
                        <TableHead className="text-center">AI</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleResults.slice(0, renderLimit).map((r) => (
                        <TableRow key={r.id} className={selected.has(r.id) ? "bg-primary/5" : ""}>
                          <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Seleziona ${r.business_name}`} /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => setDetailId(r.id)} className="font-medium text-sm text-left hover:text-primary hover:underline">{r.business_name}</button>
                              {r.seen_before && <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">già visto</Badge>}
                              {r.is_existing_customer && <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-0">già cliente</Badge>}
                            </div>
                            {(r.contact_name || r.role) && (
                              <div className="text-[11px] text-foreground/80">{r.contact_name}{r.role ? ` · ${r.role}` : ""}</div>
                            )}
                            <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                              {r.city && <span>{r.city}</span>}
                              {r.website && (
                                <a href={r.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                                  <Globe className="h-3 w-3" /> sito
                                </a>
                              )}
                              {r.partita_iva && <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" />{r.partita_iva}</span>}
                              {r.ateco && <span className="inline-flex items-center gap-0.5" title={r.ateco_desc || ""}>ATECO {r.ateco}</span>}
                              {r.dipendenti != null ? <span title="dipendenti (Registro Imprese)">{r.dipendenti} dip.</span> : (r.company_size && <span>{r.company_size} dip.</span>)}
                              {r.fatturato != null && <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400" title="fatturato (Registro Imprese)">{fmtFatturato(r.fatturato)}</span>}
                              {r.anno_fondazione != null && <span title="anno fondazione">dal {r.anno_fondazione}</span>}
                              {(() => {
                                const o = outreachMap.get(r.id);
                                if (!o) return null;
                                const label = o.replied ? "ha risposto" : o.clicked ? "ha cliccato" : o.opened ? "aperta" : "inviata";
                                const cls = o.replied ? "text-emerald-600" : o.clicked ? "text-sky-600" : o.opened ? "text-violet-600" : "text-muted-foreground";
                                return <span className={`inline-flex items-center gap-0.5 ${cls}`} title={`${o.sends} invio/i`}><Send className="h-3 w-3" />{label}</span>;
                              })()}
                            </div>
                            {r.intent_signals && Object.keys(r.intent_signals).some((k) => r.intent_signals?.[k] && INTENT_LABELS[k]) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.keys(r.intent_signals).filter((k) => r.intent_signals?.[k] && INTENT_LABELS[k]).map((k) => (
                                  <Badge key={k} variant="secondary" className={`${INTENT_LABELS[k].cls} border-0 text-[9px] px-1.5 py-0`}>
                                    {INTENT_LABELS[k].label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {r.ai_icebreaker && (
                              <div className="mt-1 flex items-start gap-1 rounded bg-primary/5 px-1.5 py-1 text-[10px] text-foreground/80">
                                <MessageSquareQuote className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                <span className="line-clamp-2" title={r.ai_icebreaker}>{r.ai_icebreaker}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5 text-xs">
                              {r.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{r.phone}</div>}
                              {r.email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate max-w-[170px]">{r.email}</span>
                                  {r.email_status && EMAIL_STATUS_LABELS[r.email_status] && (
                                    <Badge variant="secondary" className={`${EMAIL_STATUS_LABELS[r.email_status].cls} border-0 text-[8px] px-1 py-0`}>
                                      {EMAIL_STATUS_LABELS[r.email_status].label}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 pt-0.5">
                                {(() => { const { e164, isMobile } = normalizeItPhone(r.phone); return isMobile && e164 ? (
                                  <a href={`https://wa.me/${e164.replace("+", "")}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"><MessageCircle className="h-3.5 w-3.5 text-[#25d366]" /></a>
                                ) : null; })()}
                                {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn"><Linkedin className="h-3.5 w-3.5 text-[#0a66c2]" /></a>}
                                {r.facebook_url && <a href={r.facebook_url} target="_blank" rel="noopener noreferrer" title="Facebook"><Facebook className="h-3.5 w-3.5 text-[#1877f2]" /></a>}
                                {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noopener noreferrer" title="Instagram"><Instagram className="h-3.5 w-3.5 text-[#e1306c]" /></a>}
                              </div>
                              {!r.phone && !r.email && !r.linkedin_url && <span className="text-muted-foreground/60">—</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.rating != null ? (
                              <div className="inline-flex items-center gap-0.5 text-xs">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}
                                <span className="text-muted-foreground">({r.reviews_count || 0})</span>
                              </div>
                            ) : <span className="text-muted-foreground/60 text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-center gap-1">
                              {r.ai_score != null && (
                                <Badge variant="secondary" className={`${scoreColor(r.ai_score)} border-0`} title={r.ai_reason || ""}>
                                  AI {r.ai_score}
                                </Badge>
                              )}
                              {r.intent_score != null && (
                                <Badge variant="secondary" className={`${scoreColor(r.intent_score)} border-0 gap-0.5`} title="Fit (buon prospect per EiC)">
                                  <Flame className="h-2.5 w-2.5" />{r.intent_score}
                                </Badge>
                              )}
                              {r.buying_score != null && (
                                <Badge variant="secondary" className={`${scoreColor(r.buying_score)} border-0 gap-0.5`}
                                  title={`Intento d'acquisto${r.buying_signals?.hiring ? " · sta assumendo" : ""}`}>
                                  <Zap className="h-2.5 w-2.5" />{r.buying_score}
                                </Badge>
                              )}
                              {r.ai_score == null && r.intent_score == null && r.buying_score == null && <span className="text-muted-foreground/40 text-xs">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {r.pushed_to_crm && (
                                r.crm_contact_id ? (
                                  <button type="button" onClick={() => navigate(`/admin/marketing/contatti/${r.crm_contact_id}`)} title="Apri il contatto nel CRM">
                                    <Badge variant="outline" className="gap-1 text-[10px] hover:bg-primary/10 cursor-pointer"><ChevronRight className="h-3 w-3" />CRM</Badge>
                                  </button>
                                ) : (
                                  <Badge variant="outline" className="gap-1 text-[10px]"><ChevronRight className="h-3 w-3" />CRM</Badge>
                                )
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Azioni lead">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel className="text-[11px] truncate">{r.business_name}</DropdownMenuLabel>
                                  <DropdownMenuItem disabled={r.pushed_to_crm || rowConvertMutation.isPending} onClick={() => rowConvertMutation.mutate({ id: r.id, createOpportunity: false })}>
                                    <UserPlus className="h-3.5 w-3.5 mr-2" /> Converti in contatto
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={r.pushed_to_crm || rowConvertMutation.isPending} onClick={() => rowConvertMutation.mutate({ id: r.id, createOpportunity: true })}>
                                    <Target className="h-3.5 w-3.5 mr-2" /> Converti in opportunità
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem disabled={rowEnrichMutation.isPending} onClick={() => rowEnrichMutation.mutate(r.id)}>
                                    <Wand2 className="h-3.5 w-3.5 mr-2" /> Trova tutte le info
                                  </DropdownMenuItem>
                                  {r.website && (
                                    <DropdownMenuItem onClick={() => window.open(r.website!.startsWith("http") ? r.website! : `https://${r.website}`, "_blank", "noopener")}>
                                      <Globe className="h-3.5 w-3.5 mr-2" /> Apri sito
                                    </DropdownMenuItem>
                                  )}
                                  {r.pushed_to_crm && r.crm_contact_id && (
                                    <DropdownMenuItem onClick={() => navigate(`/admin/marketing/contatti/${r.crm_contact_id}`)}>
                                      <ChevronRight className="h-3.5 w-3.5 mr-2" /> Apri nel CRM
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-rose-600 focus:text-rose-600"
                                    onClick={async () => {
                                      if (await confirm({ title: "Eliminare questo lead?", description: `"${r.business_name}" verrà rimosso da questa lista.`, confirmLabel: "Elimina", variant: "destructive" })) {
                                        deleteLeadMutation.mutate(r.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina lead
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {visibleResults.length > renderLimit && (
                    <div className="flex items-center justify-center gap-3 py-3 border-t text-xs text-muted-foreground">
                      <span>Mostrati {renderLimit} di {visibleResults.length}</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setRenderLimit((n) => n + 200)}>
                        Mostra altri 200
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setRenderLimit(visibleResults.length)}>
                        Tutti
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <LeadDetailSheet
        key={detailLead?.id ?? "none"}
        lead={detailLead}
        onClose={() => setDetailId(null)}
        saving={updateLeadMutation.isPending}
        onSave={(patch) => updateLeadMutation.mutate(patch, { onSuccess: () => setDetailId(null) })}
      />
      <AnalyticsSheet open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
      <AutopilotSheet open={autopilotOpen} onClose={() => setAutopilotOpen(false)} />
      <EnrichCompanySheet open={enrichOpen} onClose={() => setEnrichOpen(false)} />
      <ImportCrmSheet
        open={importCrmOpen}
        onClose={() => setImportCrmOpen(false)}
        onImported={(searchId) => {
          setCurrentSearchId(searchId);
          setSelected(new Set());
          setRenderLimit(200);
          queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
        }}
      />
    </div>
  );
}
