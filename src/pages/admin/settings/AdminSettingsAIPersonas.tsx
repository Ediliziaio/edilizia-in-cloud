/**
 * AdminSettingsAIPersonas — Coordinatore SuperAdmin per le 18 personas AI cliente.
 *
 * Sezioni:
 *   1. Guida visiva delle 18 personas cliente raggruppate per categoria
 *   2. Editor system prompt + tier modello + tool whitelist
 *   3. Mapping ruoli applicativi che possono accedervi
 *
 * Solo super_admin (RLS protegge ai_personas).
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Wallet, Calculator, FileText, BookOpen, HardHat, Construction, Ruler,
  ShoppingCart, TrendingUp, Briefcase, UserCheck, Headphones, Megaphone,
  Users, ShieldCheck, Scale, Crown, Brain, Bot, Sparkles, Pencil, Search,
} from "lucide-react";

interface Persona {
  id: string;
  persona_key: string;
  display_name: string;
  short_label: string;
  mission: string;
  system_prompt: string;
  category: string;
  recommended_tier_key: string;
  recommended_model: string | null;
  allowed_tools: string[];
  data_scope: string;
  allowed_roles: string[];
  icon: string;
  color: string;
  enabled: boolean;
  is_system: boolean;
  sort_order: number;
}

interface TierMini {
  tier_key: string;
  tier_label: string;
  customer_label: string;
}

const ICON_MAP: Record<string, typeof Bot> = {
  Wallet, Calculator, FileText, BookOpen, HardHat, Construction, Ruler,
  ShoppingCart, TrendingUp, Briefcase, UserCheck, Headphones, Megaphone,
  Users, ShieldCheck, Scale, Crown, Brain, Bot,
};

const CATEGORY_LABEL: Record<string, string> = {
  finance: "Finanza & Amministrazione",
  operations: "Operations & Cantiere",
  sales: "Vendite & Cliente",
  marketing: "Marketing",
  hr: "Risorse Umane",
  compliance: "Compliance & Legale",
  client: "Front-line Cliente",
  meta: "Executive & Sistema",
};

const CATEGORY_ORDER = [
  "meta", "finance", "operations", "sales", "client", "marketing", "hr", "compliance",
];

const COLOR_RING: Record<string, string> = {
  emerald: "ring-emerald-200 bg-emerald-50",
  amber:   "ring-amber-200 bg-amber-50",
  blue:    "ring-blue-200 bg-blue-50",
  purple:  "ring-purple-200 bg-purple-50",
  orange:  "ring-orange-200 bg-orange-50",
  cyan:    "ring-cyan-200 bg-cyan-50",
  green:   "ring-green-200 bg-green-50",
  pink:    "ring-pink-200 bg-pink-50",
  rose:    "ring-rose-200 bg-rose-50",
  indigo:  "ring-indigo-200 bg-indigo-50",
  red:     "ring-red-200 bg-red-50",
  violet:  "ring-violet-200 bg-violet-50",
  slate:   "ring-slate-200 bg-slate-50",
};

const TIER_BADGE_COLOR: Record<string, string> = {
  t0_nano:     "bg-slate-100 text-slate-700",
  t1_economic: "bg-blue-100 text-blue-700",
  t2_vision:   "bg-cyan-100 text-cyan-700",
  t3_balanced: "bg-violet-100 text-violet-700",
  t4_premium:  "bg-amber-100 text-amber-700",
  t5_deep:     "bg-rose-100 text-rose-700",
};

export default function AdminSettingsAIPersonas() {
  const [editPersona, setEditPersona] = useState<Persona | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const { data: personas, isLoading } = useQuery({
    queryKey: ["ai_personas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_personas" as never)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Persona[];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["ai_pricing_tiers_mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_pricing_tiers" as never)
        .select("tier_key, tier_label, customer_label")
        .eq("enabled", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as TierMini[];
    },
  });

  // Conta personas per categoria (per filtri chip — calcolato sul totale)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of personas ?? []) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return counts;
  }, [personas]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = (personas ?? []).filter(p => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.short_label.toLowerCase().includes(q) ||
        p.persona_key.toLowerCase().includes(q) ||
        p.mission.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, Persona[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return CATEGORY_ORDER
      .filter(c => map.has(c))
      .map(c => ({ category: c, items: map.get(c)! }));
  }, [personas, search, categoryFilter]);

  return (
    <div className="space-y-6">
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertDescription>
            <strong>Le 18 Personas AI cliente</strong> sono "esperti" virtuali che le aziende possono interpellare.
            Ogni persona ha un <em>system prompt</em> amplificato, un tier modello consigliato e una whitelist di ruoli che possono accedervi.
            Modifica qui i prompt customer-facing. Le 21 personas interne di Silvio Superadmin sono un sistema separato.
        </AlertDescription>
      </Alert>

      {/* HEADER STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Personas totali</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{personas?.length ?? "—"}</div>
            <p className="text-xs text-muted-foreground">
              {(personas ?? []).filter(p => p.enabled && !p.is_system).length} chattabili
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Categorie</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{grouped.length}</div>
            <p className="text-xs text-muted-foreground">aree funzionali</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Tier premium</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(personas ?? []).filter(p => ["t4_premium", "t5_deep"].includes(p.recommended_tier_key)).length}
            </div>
            <p className="text-xs text-muted-foreground">richiedono modelli costosi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Sistema</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(personas ?? []).filter(p => p.is_system).length}</div>
            <p className="text-xs text-muted-foreground">non chattabili (interne)</p>
          </CardContent>
        </Card>
      </div>

      {/* SEARCH + CATEGORY FILTER CHIPS */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca persona o nella mission…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={categoryFilter === null ? "default" : "outline"}
            className="cursor-pointer hover:bg-accent"
            onClick={() => setCategoryFilter(null)}
          >
            Tutte ({personas?.length ?? 0})
          </Badge>
          {CATEGORY_ORDER.filter(c => categoryCounts.get(c)).map(cat => (
            <Badge
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              className="cursor-pointer hover:bg-accent"
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
            >
              {CATEGORY_LABEL[cat] ?? cat} <span className="ml-1 opacity-60">{categoryCounts.get(cat)}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* PERSONAS GROUPED BY CATEGORY */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {CATEGORY_LABEL[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map(p => (
                  <PersonaCard
                    key={p.id}
                    persona={p}
                    onEdit={() => setEditPersona(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDIT DIALOG */}
      {editPersona && (
        <EditPersonaDialog
          persona={editPersona}
          tiers={tiers ?? []}
          onClose={() => setEditPersona(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function PersonaCard({ persona, onEdit }: { persona: Persona; onEdit: () => void }) {
  const Icon = ICON_MAP[persona.icon] ?? Bot;
  const colorClass = COLOR_RING[persona.color] ?? COLOR_RING.slate;
  const tierClass = TIER_BADGE_COLOR[persona.recommended_tier_key] ?? "bg-slate-100";

  return (
    <Card className={cn(
      "relative transition-all hover:shadow-md",
      !persona.enabled && "opacity-50",
      persona.is_system && "border-dashed"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn("rounded-lg ring-2 p-2.5", colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">
                {persona.display_name}
                {persona.is_system && <Badge variant="outline" className="ml-2 text-xs">sistema</Badge>}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {persona.short_label}
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-3">
          {persona.mission}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge className={cn("text-xs", tierClass)}>
            {persona.recommended_tier_key}
          </Badge>
          {persona.allowed_roles.slice(0, 2).map(r => (
            <Badge key={r} variant="outline" className="text-xs">
              {r}
            </Badge>
          ))}
          {persona.allowed_roles.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{persona.allowed_roles.length - 2}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function EditPersonaDialog({
  persona, tiers, onClose,
}: {
  persona: Persona;
  tiers: TierMini[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(persona.display_name);
  const [shortLabel, setShortLabel] = useState(persona.short_label);
  const [mission, setMission] = useState(persona.mission);
  const [systemPrompt, setSystemPrompt] = useState(persona.system_prompt);
  const [tierKey, setTierKey] = useState(persona.recommended_tier_key);
  const [recommendedModel, setRecommendedModel] = useState(persona.recommended_model ?? "");
  const [allowedRoles, setAllowedRoles] = useState(persona.allowed_roles.join(", "));
  const [enabled, setEnabled] = useState(persona.enabled);

  const updateMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_personas" as never)
        .update({
          display_name: displayName,
          short_label: shortLabel,
          mission,
          system_prompt: systemPrompt,
          recommended_tier_key: tierKey,
          recommended_model: recommendedModel || null,
          allowed_roles: allowedRoles.split(",").map(r => r.trim()).filter(Boolean),
          enabled,
        })
        .eq("id", persona.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Persona "${displayName}" aggiornata`);
      qc.invalidateQueries({ queryKey: ["ai_personas"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica persona: {persona.persona_key}</DialogTitle>
          <DialogDescription>
            Affina mission, system prompt e tier. Le modifiche entrano in vigore dalla prossima chiamata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome visualizzato</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <Label>Sottotitolo</Label>
              <Input value={shortLabel} onChange={(e) => setShortLabel(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Mission (descrizione breve)</Label>
            <Textarea rows={2} value={mission} onChange={(e) => setMission(e.target.value)} />
          </div>

          <div>
            <Label>System Prompt completo (iniettato in conversazione)</Label>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {systemPrompt.length.toLocaleString()} caratteri • ~{Math.round(systemPrompt.length / 4).toLocaleString()} token
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tier modello consigliato</Label>
              <Select value={tierKey} onValueChange={setTierKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiers.map(t => (
                    <SelectItem key={t.tier_key} value={t.tier_key}>
                      {t.tier_label} <span className="text-muted-foreground ml-1">({t.customer_label})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modello specifico (override)</Label>
              <Input
                placeholder="es. anthropic/claude-haiku-4.5 (lascia vuoto per usare il tier)"
                value={recommendedModel}
                onChange={(e) => setRecommendedModel(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Ruoli ammessi (CSV)</Label>
            <Input
              placeholder="super_admin, owner, cfo, ..."
              value={allowedRoles}
              onChange={(e) => setAllowedRoles(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separati da virgola. Solo questi ruoli possono attivare la persona.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Persona abilitata</Label>
              <p className="text-xs text-muted-foreground">
                Se disabilitata, le aziende non potranno selezionarla
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Salvataggio…" : "Salva persona"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
