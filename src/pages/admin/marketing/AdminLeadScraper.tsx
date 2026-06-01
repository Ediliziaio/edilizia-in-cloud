import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/formatters";
import {
  Search, MapPin, Linkedin, Building2, Loader2, Sparkles, Mail, Phone,
  Globe, Star, Download, UserPlus, Trash2, Target, ChevronRight,
  Wand2, Facebook, Instagram, Flame, FileText, Grid3x3, Upload, MessageSquareQuote, ShieldBan, EyeOff,
  MessageCircle, Send, Pencil, SlidersHorizontal, Rocket, Bot, BadgeCheck, ChevronDown, Database,
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
  email_status: "none" | "guessed" | "verified_mx" | "found" | null;
  enrichment: Record<string, unknown> | null;
  // v3
  seen_before: boolean | null;
  ateco: string | null;
  ateco_desc: string | null;
  company_size: string | null;
  ai_summary: string | null;
  ai_icebreaker: string | null;
  crm_opportunity_id: string | null;
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
  verified_mx: { label: "MX ok", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  guessed: { label: "ipotizzata", cls: "bg-muted text-muted-foreground" },
};

function scoreColor(score: number | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
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

export default function AdminLeadScraper() {
  const { hasAccess, permLoading } = useAdminMarketing();
  const queryClient = useQueryClient();
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

  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [filterFlags, setFilterFlags] = useState({ email: false, hot: false, notCrm: false });
  const [sortBy, setSortBy] = useState<"ai" | "intent" | "rating" | "name">("ai");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sequenzaId, setSequenzaId] = useState<string>("");

  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .order("rating", { ascending: false, nullsFirst: false });
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
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "searches"] });
      toast.success(`${data.count} lead trovati`, {
        description: data.withPhone != null
          ? `${data.withPhone} con telefono · ${data.withEmail} con email`
          : "Usa Arricchisci per recuperare contatti",
      });
    },
    onError: (e: Error) => toast.error("Ricerca fallita", { description: e.message }),
  });

  const qualifyMutation = useMutation({
    mutationFn: (resultIds?: string[]) => invoke({
      action: "qualify",
      searchId: resultIds?.length ? undefined : currentSearchId,
      resultIds: resultIds?.length ? resultIds : undefined,
      icp: icp.trim(),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success(`${data.qualified} lead qualificati con AI`);
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
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
      const ci = { name: idx(["azienda", "nome", "ragione", "business", "company"]), web: idx(["sito", "website", "web", "url"]), phone: idx(["telefono", "phone", "tel"]), email: idx(["email", "mail"]), city: idx(["città", "citta", "city", "comune"]) };
      if (ci.name < 0) { toast.error("Colonna nome/azienda non trovata nel CSV"); return; }
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
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
      const { error } = await fromLS("lead_scraper_results").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-scraper", "results", currentSearchId] });
      toast.success("Lead aggiornato");
    },
    onError: (e: Error) => toast.error("Salvataggio fallito", { description: e.message }),
  });

  const busy = searchMutation.isPending || qualifyMutation.isPending || deepEnrichMutation.isPending ||
    findEmailMutation.isPending || findLinkedinMutation.isPending || pushMutation.isPending ||
    outreachMutation.isPending || suppressMutation.isPending || importMutation.isPending ||
    enrollMutation.isPending || enrichApolloMutation.isPending || enrichPdlMutation.isPending ||
    verifyEmailMutation.isPending || progress !== null;

  // ── filtri + ordinamento ──────────────────────────────────────────────────────
  const visibleResults = useMemo(() => {
    let list = hideSeen ? results.filter((r) => !r.seen_before) : results;
    const q = filterQ.trim().toLowerCase();
    if (q) list = list.filter((r) => `${r.business_name} ${r.city || ""} ${r.email || ""} ${r.contact_name || ""}`.toLowerCase().includes(q));
    if (filterFlags.email) list = list.filter((r) => !!r.email);
    if (filterFlags.hot) list = list.filter((r) => r.ai_label === "hot" || (r.intent_score != null && r.intent_score >= 70));
    if (filterFlags.notCrm) list = list.filter((r) => !r.pushed_to_crm);
    const arr = [...list];
    arr.sort((a, b) => {
      if (sortBy === "name") return a.business_name.localeCompare(b.business_name);
      const key = sortBy === "ai" ? "ai_score" : sortBy === "intent" ? "intent_score" : "rating";
      return (Number(b[key as keyof LeadResult] ?? -1)) - (Number(a[key as keyof LeadResult] ?? -1));
    });
    return arr;
  }, [results, hideSeen, filterQ, filterFlags, sortBy]);
  const seenCount = useMemo(() => results.filter((r) => r.seen_before).length, [results]);

  // ── funnel ────────────────────────────────────────────────────────────────────
  const funnel = useMemo(() => ({
    total: results.length,
    enriched: results.filter((r) => r.enrichment && (r as unknown as { enriched?: boolean }).enriched).length || results.filter((r) => r.intent_score != null).length,
    qualified: results.filter((r) => r.ai_score != null).length,
    pushed: results.filter((r) => r.pushed_to_crm).length,
    opps: results.filter((r) => r.crm_opportunity_id).length,
  }), [results]);

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
  const selectedIds = useMemo(() => [...selected], [selected]);

  // ── export CSV ─────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = selectedIds.length ? results.filter((r) => selected.has(r.id)) : results;
    if (!rows.length) return;
    const header = ["Azienda", "Contatto", "Ruolo", "Telefono", "Email", "Stato email", "P.IVA", "Sito",
      "LinkedIn", "Facebook", "Instagram", "Indirizzo", "Città", "Rating", "Recensioni", "AI Score", "Intent Score"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...rows.map((r) => [
        r.business_name, r.contact_name, r.role, r.phone, r.email, r.email_status, r.partita_iva, r.website,
        r.linkedin_url, r.facebook_url, r.instagram_url, r.address, r.city,
        r.rating, r.reviews_count, r.ai_score, r.intent_score,
      ].map(esc).join(",")),
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-scraper-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              </div>

              {/* Settore / keyword */}
              <div>
                <Label className="text-xs">Settore / attività</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="es. impresa edile" className="mt-1" />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {SECTOR_PRESETS.slice(0, 6).map((p) => (
                    <button key={p} type="button" onClick={() => setKeyword(p)}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/70">
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Città</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Milano" className="mt-1" />
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

              <Button className="w-full gap-2" onClick={() => searchMutation.mutate()} disabled={busy || !keyword.trim()}>
                {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Cerca lead
              </Button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground">oppure</span><div className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importa CSV
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
                    onClick={() => { setCurrentSearchId(s.id); setSelected(new Set()); }}
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => verifyEmailMutation.mutate(selectedIds)}>
                      <BadgeCheck className="h-3.5 w-3.5 mr-2" /> Verifica email (deliverability)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  <Download className="h-3.5 w-3.5" /> CSV
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
                {([["Trovati", funnel.total], ["Arricchiti", funnel.enriched], ["Qualificati", funnel.qualified], ["In CRM", funnel.pushed], ["Opportunità", funnel.opps]] as const).map(([l, v], i, arr) => (
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
                    <SelectItem value="intent">Ordina: Intento</SelectItem>
                    <SelectItem value="rating">Ordina: Rating</SelectItem>
                    <SelectItem value="name">Ordina: Nome</SelectItem>
                  </SelectContent>
                </Select>
                {([["email", "Con email"], ["hot", "Hot"], ["notCrm", "Non in CRM"]] as const).map(([k, lbl]) => (
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
                      {visibleResults.map((r) => (
                        <TableRow key={r.id} className={selected.has(r.id) ? "bg-primary/5" : ""}>
                          <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Seleziona ${r.business_name}`} /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => setDetailId(r.id)} className="font-medium text-sm text-left hover:text-primary hover:underline">{r.business_name}</button>
                              {r.seen_before && <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">già visto</Badge>}
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
                              {r.company_size && <span>{r.company_size} dip.</span>}
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
                                <Badge variant="secondary" className={`${scoreColor(r.intent_score)} border-0 gap-0.5`} title="Punteggio intento (buon prospect per EiC)">
                                  <Flame className="h-2.5 w-2.5" />{r.intent_score}
                                </Badge>
                              )}
                              {r.ai_score == null && r.intent_score == null && <span className="text-muted-foreground/40 text-xs">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.pushed_to_crm ? (
                              <Badge variant="outline" className="gap-1 text-[10px]"><ChevronRight className="h-3 w-3" />CRM</Badge>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
    </div>
  );
}
