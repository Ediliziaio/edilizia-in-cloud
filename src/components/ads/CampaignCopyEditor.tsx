/**
 * CampaignCopyEditor — Editor copy avanzato per il wizard campagne.
 *
 * 3 sezioni distinte (ognuna con max 5 varianti):
 *   • Titoli (≤40 char) — headline Meta UI
 *   • Descrizioni (90-180 char) — primary text
 *   • Hook (30-60 char) — prime righe stop-scroll
 *
 * Per ogni sezione:
 *   • Lista variant con input/textarea
 *   • Counter caratteri live + colore (verde/giallo/rosso) in base ai best practice
 *   • Pulsante "+" aggiungi variante (fino a 5)
 *   • Pulsante "✨ Genera con AI" → chiama ai-ads-copy-generate con masterprompt
 *   • Pulsante "🗑️" per ogni variant
 *   • Drag indicator per riordino (TODO v2)
 *
 * Uso: dentro lo step 4 del wizard CampaignBuilderTab.
 * Sostituisce i campi `copyVariants` (textarea legacy) + il prompt immagine.
 */

import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdsAi } from "@/hooks/useAdsAi";

export interface CampaignCopyState {
  /** Max 5 — appaiono come "headline" sotto l'immagine in Meta */
  titles: string[];
  /** Max 5 — primary text del corpo dell'annuncio */
  descriptions: string[];
  /** Max 5 — prime righe stop-scroll */
  hooks: string[];
  /** Backward-compat: vecchio campo "copyVariants" del builder = descriptions */
  legacyCopyVariants?: string[];
}

interface Props {
  companyId: string | undefined;
  /** Brief libero da cui generare (es. offerta, settore, zona) */
  brief: string;
  segment?: string;
  zone?: string;
  offer?: string;
  value: CampaignCopyState;
  onChange: (next: CampaignCopyState) => void;
}

const MAX_VARIANTS = 5;

// Range caratteri raccomandati per Meta Ads
const LIMITS = {
  titles: { ideal_max: 40, hard_max: 50 },
  descriptions: { ideal_min: 90, ideal_max: 180, hard_max: 220 },
  hooks: { ideal_min: 30, ideal_max: 60, hard_max: 80 },
};

export function CampaignCopyEditor({
  companyId,
  brief,
  segment,
  zone,
  offer,
  value,
  onChange,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const { generateCopy } = useAdsAi(companyId);

  const handleGenerate = useCallback(async () => {
    if (!brief || brief.trim().length < 10) {
      toast.error("Brief insufficiente", {
        description: "Compila la sezione 'Offerta' nello step 1 (almeno 10 caratteri).",
      });
      return;
    }
    setGenerating(true);
    try {
      const result = await generateCopy({
        brief: offer ?? brief,
        segment,
        zone,
        variants: MAX_VARIANTS,
      });
      if (!result) {
        return;
      }
      onChange({
        titles: result.titles?.length ? result.titles : value.titles,
        descriptions: result.descriptions?.length
          ? result.descriptions
          : result.copy_variants?.length
            ? result.copy_variants
            : value.descriptions,
        hooks: result.hooks?.length ? result.hooks : value.hooks,
        legacyCopyVariants: result.descriptions ?? result.copy_variants,
      });
      if (result.warnings?.length) {
        toast.warning("Attenzione compliance Meta", {
          description: result.warnings.slice(0, 3).join(" · "),
        });
      } else {
        toast.success("Copy generato!", {
          description: `${result.titles?.length ?? 0} titoli · ${result.descriptions?.length ?? 0} descrizioni · ${result.hooks?.length ?? 0} hook`,
        });
      }
    } finally {
      setGenerating(false);
    }
  }, [brief, generateCopy, offer, onChange, segment, value.descriptions, value.hooks, value.titles, zone]);

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Sparkles className="h-4 w-4 text-violet-600" />
              Copy dell'annuncio
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              3 elementi separati: <strong>Titoli</strong> (cosa vedi sotto l'immagine), <strong>Descrizioni</strong> (testo principale),
              <strong> Hook</strong> (prime parole stop-scroll). Max {MAX_VARIANTS} varianti per blocco.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || !companyId}
            className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700"
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI sta scrivendo…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Genera tutto con AI</>
            )}
          </Button>
        </div>
        {(!brief || brief.length < 10) && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Per generare con AI compila prima la sezione <strong>"Offerta"</strong> nello step 1.
          </div>
        )}
      </div>

      <BlockSection
        title="Titoli"
        subtitle="Headline che appaiono sotto l'immagine. Promessa atomica leggibile in mezzo secondo."
        emoji="📌"
        kind="title"
        items={value.titles}
        ideal={LIMITS.titles}
        onChange={(items) => onChange({ ...value, titles: items })}
      />

      <BlockSection
        title="Descrizioni (primary text)"
        subtitle="Il corpo dell'annuncio. Hook + valore concreto + CTA. Mobile-first."
        emoji="📝"
        kind="description"
        items={value.descriptions}
        ideal={LIMITS.descriptions}
        onChange={(items) => onChange({ ...value, descriptions: items, legacyCopyVariants: items })}
      />

      <BlockSection
        title="Hook (prime righe)"
        subtitle="Le prime 5-8 parole. Lavorano per fermare lo scroll."
        emoji="🪝"
        kind="hook"
        items={value.hooks}
        ideal={LIMITS.hooks}
        onChange={(items) => onChange({ ...value, hooks: items })}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BlockSection — UN blocco (titoli/descrizioni/hook) con N varianti
// ═══════════════════════════════════════════════════════════════════
function BlockSection({
  title,
  subtitle,
  emoji,
  kind,
  items,
  ideal,
  onChange,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  kind: "title" | "description" | "hook";
  items: string[];
  ideal: { ideal_min?: number; ideal_max: number; hard_max: number };
  onChange: (items: string[]) => void;
}) {
  const list = useMemo(() => (items.length > 0 ? items : [""]), [items]);

  const update = (idx: number, val: string) => {
    const next = [...list];
    next[idx] = val.slice(0, ideal.hard_max);
    onChange(next.filter((v, i) => i === idx || v.trim().length > 0 || i < next.length - 1));
  };
  const add = () => {
    if (list.length >= MAX_VARIANTS) return;
    onChange([...list, ""]);
  };
  const remove = (idx: number) => {
    const next = list.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">
            <span className="mr-1">{emoji}</span> {title}
          </h4>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
          {items.filter((i) => i.trim().length > 0).length}/{MAX_VARIANTS}
        </Badge>
      </header>

      <div className="space-y-2">
        {list.map((val, idx) => (
          <VariantRow
            key={idx}
            index={idx}
            value={val}
            kind={kind}
            ideal={ideal}
            onChange={(v) => update(idx, v)}
            onRemove={() => remove(idx)}
            canRemove={list.length > 1}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        disabled={list.length >= MAX_VARIANTS}
        className="mt-3 w-full"
      >
        <Plus className="mr-1 h-3 w-3" />
        {list.length >= MAX_VARIANTS ? `Massimo ${MAX_VARIANTS} varianti` : "Aggiungi variante"}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VariantRow — singola riga con input + counter caratteri
// ═══════════════════════════════════════════════════════════════════
function VariantRow({
  index,
  value,
  kind,
  ideal,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  value: string;
  kind: "title" | "description" | "hook";
  ideal: { ideal_min?: number; ideal_max: number; hard_max: number };
  onChange: (v: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const len = value.length;
  const tooShort = ideal.ideal_min ? len > 0 && len < ideal.ideal_min : false;
  const tooLong = len > ideal.ideal_max;
  const overHardMax = len >= ideal.hard_max;
  const ok = len >= (ideal.ideal_min ?? 1) && len <= ideal.ideal_max;
  const status: "ok" | "warn" | "bad" | "empty" =
    len === 0 ? "empty" : ok ? "ok" : overHardMax ? "bad" : "warn";

  return (
    <div className="flex items-start gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-500">
        {index + 1}
      </div>
      <div className="flex-1">
        {kind === "description" ? (
          <Textarea
            value={value}
            placeholder={`Variante ${index + 1} — ${ideal.ideal_min ?? "?"}-${ideal.ideal_max} caratteri ottimali`}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-16 text-sm"
            maxLength={ideal.hard_max}
          />
        ) : (
          <Input
            value={value}
            placeholder={`Variante ${index + 1} — max ${ideal.ideal_max} caratteri`}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm"
            maxLength={ideal.hard_max}
          />
        )}
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <CounterBadge status={status} len={len} ideal={ideal} />
          {tooShort && <span className="text-amber-600">↑ Troppo corto, aggiungi dettaglio concreto</span>}
          {tooLong && !overHardMax && <span className="text-amber-600">↑ Sopra il range ottimale — Meta potrebbe troncare</span>}
          {overHardMax && <span className="text-rose-600">✗ Limite massimo raggiunto</span>}
        </div>
      </div>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onRemove}
              disabled={!canRemove}
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rimuovi variante</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function CounterBadge({
  status,
  len,
  ideal,
}: {
  status: "ok" | "warn" | "bad" | "empty";
  len: number;
  ideal: { ideal_min?: number; ideal_max: number; hard_max: number };
}) {
  if (status === "empty") return <span className="text-muted-foreground">0 caratteri</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        status === "ok" && "text-emerald-700",
        status === "warn" && "text-amber-700",
        status === "bad" && "text-rose-700",
      )}
    >
      {status === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {status === "warn" && <AlertTriangle className="h-3 w-3" />}
      {status === "bad" && <AlertTriangle className="h-3 w-3" />}
      {len} / {ideal.ideal_max} car.
    </span>
  );
}

export default CampaignCopyEditor;
