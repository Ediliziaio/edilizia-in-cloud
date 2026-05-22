/**
 * MetaTargetingPanel — Step "Pubblico & Geo" reale per campagne Meta.
 *
 * Replica il targeting di Meta Ads Manager con:
 *   • Multi-location picker (paesi, regioni, città, ZIP, geo_market) con
 *     autocomplete via edge function `meta-targeting-search`
 *   • Per ogni città: raggio individuale 1–80 km
 *   • Exclusion locations
 *   • Interests multi-select con audience size visibile
 *   • Languages multi-select (Meta locales)
 *   • Placements (Advantage automatic vs manual con Facebook/Instagram positions)
 *
 * Mantiene compat con BuilderState legacy:
 *   • `state.zone` viene popolato con la prima location (per backward compat)
 *   • `state.interests` viene popolato con i nomi degli interest tag separati da virgola
 *
 * Il payload reale per Meta Marketing API arriva da `geoLocations` (array) +
 * `interestTags` (array di {key,name}). `meta-ads-create-campaign` userà
 * questi nuovi array quando presenti, fallback su zone/interests string.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Globe2,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type {
  MetaGeoLocationPick,
  MetaPlacementsConfig,
  MetaSearchResult,
} from "@/types/metaAds";

interface MetaTargetingState {
  geoLocations: MetaGeoLocationPick[];
  interestTags: MetaSearchResult[];
  excludedInterestTags: MetaSearchResult[];
  localeTags: MetaSearchResult[];
  placements: MetaPlacementsConfig;
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  advantageAudience: boolean;
}

interface Props {
  companyId: string | undefined;
  adAccountId?: string;
  value: MetaTargetingState;
  onChange: (next: Partial<MetaTargetingState>) => void;
  /** Audience size stimato (opzionale). */
  audienceSizeHint?: { lower: number; upper: number } | null;
}

const FACEBOOK_POSITIONS = [
  { v: "feed", label: "Feed Facebook" },
  { v: "video_feeds", label: "Video Feed" },
  { v: "story", label: "Storie" },
  { v: "facebook_reels", label: "Reels Facebook" },
  { v: "marketplace", label: "Marketplace" },
  { v: "search", label: "Risultati di ricerca" },
] as const;

const INSTAGRAM_POSITIONS = [
  { v: "stream", label: "Feed Instagram" },
  { v: "story", label: "Storie" },
  { v: "reels", label: "Reels" },
  { v: "explore", label: "Esplora" },
  { v: "explore_home", label: "Esplora Home" },
  { v: "profile_feed", label: "Feed profilo" },
] as const;

export function MetaTargetingPanel({
  companyId,
  adAccountId,
  value,
  onChange,
  audienceSizeHint,
}: Props) {
  return (
    <div className="space-y-6">
      {/* === GEO LOCATIONS === */}
      <section className="rounded-2xl border bg-white p-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Globe2 className="h-4 w-4 text-blue-600" />
              Dove vuoi mostrare gli annunci
            </h3>
            <p className="text-xs text-slate-500">
              Aggiungi <strong>paesi, regioni, città</strong> o ZIP. Per le città puoi impostare un raggio individuale (1–80 km).
            </p>
          </div>
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
            {value.geoLocations.filter((g) => !g.excluded).length} inclusi
            {value.geoLocations.some((g) => g.excluded) && (
              <> · {value.geoLocations.filter((g) => g.excluded).length} esclusi</>
            )}
          </Badge>
        </header>

        <LocationSearchInput
          companyId={companyId}
          adAccountId={adAccountId}
          onSelect={(picked) => {
            // Evita duplicati per key
            if (value.geoLocations.some((g) => g.key === picked.key)) return;
            onChange({
              geoLocations: [
                ...value.geoLocations,
                { ...picked, radius_km: picked.type === "city" ? 25 : undefined, excluded: false },
              ],
            });
          }}
        />

        {value.geoLocations.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            Nessun luogo selezionato. Cerca una città, una regione o un paese qui sopra.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {value.geoLocations.map((loc) => (
              <li
                key={loc.key}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
                  loc.excluded ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white",
                )}
              >
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  loc.excluded ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700",
                )}>
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-950">{loc.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {loc.path?.join(" › ") ?? loc.type}
                    {loc.country_name && !loc.path?.length && ` · ${loc.country_name}`}
                  </p>
                </div>

                {loc.type === "city" && !loc.excluded && (
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                    <Crosshair className="h-3.5 w-3.5 text-slate-500" />
                    <Input
                      type="number"
                      min={1}
                      max={80}
                      value={loc.radius_km ?? 25}
                      onChange={(e) => {
                        const r = Math.max(1, Math.min(80, Number(e.target.value) || 25));
                        onChange({
                          geoLocations: value.geoLocations.map((g) =>
                            g.key === loc.key ? { ...g, radius_km: r } : g,
                          ),
                        });
                      }}
                      className="h-7 w-16 border-0 bg-transparent text-center text-sm"
                    />
                    <span className="text-[11px] text-slate-500">km</span>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange({
                        geoLocations: value.geoLocations.map((g) =>
                          g.key === loc.key ? { ...g, excluded: !g.excluded } : g,
                        ),
                      })
                    }
                  >
                    {loc.excluded ? "Includi" : "Escludi"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange({
                        geoLocations: value.geoLocations.filter((g) => g.key !== loc.key),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {audienceSizeHint && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
            <strong className="text-emerald-900">Audience size stimata:</strong>{" "}
            <span className="text-slate-700">
              {formatAudience(audienceSizeHint.lower)} – {formatAudience(audienceSizeHint.upper)} persone
            </span>
          </div>
        )}
      </section>

      {/* === DEMOGRAFICI === */}
      <section className="rounded-2xl border bg-white p-5">
        <header className="mb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Users className="h-4 w-4 text-violet-600" />
            Età, genere, lingue
          </h3>
          <p className="text-xs text-slate-500">
            Restringi il pubblico anagrafico. Lascia largo se non sei sicuro: Meta sa imparare.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="mb-2 block text-xs font-semibold text-slate-700">Età</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={18}
                max={65}
                value={value.ageMin}
                onChange={(e) => onChange({ ageMin: Math.max(18, Math.min(65, Number(e.target.value) || 25)) })}
                className="w-16"
              />
              <span className="text-slate-400">—</span>
              <Input
                type="number"
                min={18}
                max={65}
                value={value.ageMax}
                onChange={(e) => onChange({ ageMax: Math.max(18, Math.min(65, Number(e.target.value) || 55)) })}
                className="w-16"
              />
              <span className="text-xs text-slate-500">anni</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs font-semibold text-slate-700">Genere</Label>
            <div className="flex gap-1 rounded-md border border-slate-200 p-1">
              {(["all", "men", "women"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onChange({ gender: g })}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xs font-medium",
                    value.gender === g ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {g === "all" ? "Tutti" : g === "men" ? "Uomini" : "Donne"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs font-semibold text-slate-700">Lingue</Label>
            <LocaleSearchInput
              companyId={companyId}
              adAccountId={adAccountId}
              selected={value.localeTags}
              onChange={(next) => onChange({ localeTags: next })}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-blue-700" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Advantage+ Audience</p>
                <p className="text-[11px] text-slate-600">
                  Meta espande automaticamente oltre la tua selezione quando trova utenti simili a chi converte.
                  Consigliato per <strong>lead gen edilizia</strong>.
                </p>
              </div>
            </div>
            <Switch
              checked={value.advantageAudience}
              onCheckedChange={(v) => onChange({ advantageAudience: v })}
            />
          </div>
        </div>
      </section>

      {/* === INTERESTS === */}
      <section className="rounded-2xl border bg-white p-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Search className="h-4 w-4 text-fuchsia-600" />
              Interessi e comportamenti
            </h3>
            <p className="text-xs text-slate-500">
              Cerca interessi reali da Meta (ristrutturazione, casa, mutuo, fotovoltaico...). Massimo 25.
            </p>
          </div>
          <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-[10px] text-fuchsia-700">
            {value.interestTags.length} inclusi
            {value.excludedInterestTags.length > 0 && (
              <> · {value.excludedInterestTags.length} esclusi</>
            )}
          </Badge>
        </header>

        <Tabs defaultValue="include">
          <TabsList>
            <TabsTrigger value="include">Includi pubblico</TabsTrigger>
            <TabsTrigger value="exclude">Escludi pubblico</TabsTrigger>
          </TabsList>

          <TabsContent value="include" className="space-y-3 pt-3">
            <InterestSearchInput
              companyId={companyId}
              adAccountId={adAccountId}
              type="interest"
              onSelect={(picked) => {
                if (value.interestTags.length >= 25) return;
                if (value.interestTags.some((t) => t.key === picked.key)) return;
                onChange({ interestTags: [...value.interestTags, picked] });
              }}
            />
            <TagList
              tags={value.interestTags}
              color="fuchsia"
              onRemove={(key) =>
                onChange({ interestTags: value.interestTags.filter((t) => t.key !== key) })
              }
            />
          </TabsContent>

          <TabsContent value="exclude" className="space-y-3 pt-3">
            <InterestSearchInput
              companyId={companyId}
              adAccountId={adAccountId}
              type="interest"
              onSelect={(picked) => {
                if (value.excludedInterestTags.some((t) => t.key === picked.key)) return;
                onChange({ excludedInterestTags: [...value.excludedInterestTags, picked] });
              }}
            />
            <TagList
              tags={value.excludedInterestTags}
              color="rose"
              onRemove={(key) =>
                onChange({ excludedInterestTags: value.excludedInterestTags.filter((t) => t.key !== key) })
              }
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* === PLACEMENTS === */}
      <section className="rounded-2xl border bg-white p-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Posizionamenti</h3>
            <p className="text-xs text-slate-500">
              Dove l'annuncio appare. <strong>Advantage automatic</strong> è consigliato:
              Meta sceglie i placement più performanti.
            </p>
          </div>
          <Switch
            checked={value.placements.automatic}
            onCheckedChange={(automatic) =>
              onChange({ placements: { ...value.placements, automatic } })
            }
          />
        </header>

        {!value.placements.automatic && (
          <div className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-xs">
                Placement manuali riducono drasticamente il reach. Usali solo se hai dati storici che
                mostrano performance migliori su uno specifico posizionamento.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 md:grid-cols-2">
              <PlacementGroup
                title="Facebook"
                positions={FACEBOOK_POSITIONS}
                selected={value.placements.facebook_positions ?? []}
                onChange={(next) =>
                  onChange({
                    placements: {
                      ...value.placements,
                      facebook_positions: next as ("feed" | "right_hand_column" | "marketplace" | "video_feeds" | "story" | "search" | "instream_video" | "facebook_reels" | "facebook_reels_overlay")[],
                      publisher_platforms: next.length > 0
                        ? [...new Set([...(value.placements.publisher_platforms ?? []), "facebook" as const])]
                        : (value.placements.publisher_platforms ?? []).filter((p) => p !== "facebook"),
                    },
                  })
                }
              />
              <PlacementGroup
                title="Instagram"
                positions={INSTAGRAM_POSITIONS}
                selected={value.placements.instagram_positions ?? []}
                onChange={(next) =>
                  onChange({
                    placements: {
                      ...value.placements,
                      instagram_positions: next as ("stream" | "story" | "explore" | "reels" | "shop" | "ig_search" | "profile_feed" | "explore_home")[],
                      publisher_platforms: next.length > 0
                        ? [...new Set([...(value.placements.publisher_platforms ?? []), "instagram" as const])]
                        : (value.placements.publisher_platforms ?? []).filter((p) => p !== "instagram"),
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function LocationSearchInput({
  companyId,
  adAccountId,
  onSelect,
}: {
  companyId: string | undefined;
  adAccountId?: string;
  onSelect: (r: MetaSearchResult) => void;
}) {
  return (
    <SearchInput
      placeholder="Cerca città, regione, paese o ZIP..."
      icon={<Search className="h-4 w-4 text-slate-400" />}
      companyId={companyId}
      adAccountId={adAccountId}
      type="geo"
      onSelect={onSelect}
      renderItem={(r) => (
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-900">{r.name}</p>
            <p className="truncate text-[10px] text-slate-500">
              {r.path?.join(" › ") ?? r.type}
              {r.country_name && !r.path?.length && ` · ${r.country_name}`}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[9px]">
            {r.type}
          </Badge>
        </div>
      )}
    />
  );
}

function InterestSearchInput({
  companyId,
  adAccountId,
  type,
  onSelect,
}: {
  companyId: string | undefined;
  adAccountId?: string;
  type: "interest" | "behavior" | "demographic";
  onSelect: (r: MetaSearchResult) => void;
}) {
  return (
    <SearchInput
      placeholder="Cerca interessi (es. ristrutturazione, casa, mutuo, fotovoltaico)..."
      icon={<Search className="h-4 w-4 text-slate-400" />}
      companyId={companyId}
      adAccountId={adAccountId}
      type={type}
      onSelect={onSelect}
      renderItem={(r) => (
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-900">{r.name}</p>
            {r.audience_size_lower && (
              <p className="text-[10px] text-slate-500">
                ~ {formatAudience(r.audience_size_lower)}–{formatAudience(r.audience_size_upper ?? r.audience_size_lower)} persone globali
              </p>
            )}
          </div>
        </div>
      )}
    />
  );
}

function LocaleSearchInput({
  companyId,
  adAccountId,
  selected,
  onChange,
}: {
  companyId: string | undefined;
  adAccountId?: string;
  selected: MetaSearchResult[];
  onChange: (next: MetaSearchResult[]) => void;
}) {
  return (
    <div className="space-y-2">
      <SearchInput
        placeholder="Cerca lingue..."
        icon={<Search className="h-4 w-4 text-slate-400" />}
        companyId={companyId}
        adAccountId={adAccountId}
        type="locale"
        onSelect={(picked) => {
          if (selected.some((s) => s.key === picked.key)) return;
          onChange([...selected, picked]);
        }}
        renderItem={(r) => <span className="text-sm">{r.name}</span>}
      />
      <div className="flex flex-wrap gap-1.5">
        {selected.map((s) => (
          <Badge
            key={s.key}
            variant="secondary"
            className="cursor-pointer text-[10px]"
            onClick={() => onChange(selected.filter((l) => l.key !== s.key))}
          >
            {s.name}
            <X className="ml-1 h-3 w-3" />
          </Badge>
        ))}
      </div>
    </div>
  );
}

interface SearchInputProps {
  placeholder: string;
  icon: React.ReactNode;
  companyId: string | undefined;
  adAccountId?: string;
  type: "geo" | "interest" | "behavior" | "demographic" | "locale";
  onSelect: (r: MetaSearchResult) => void;
  renderItem: (r: MetaSearchResult) => React.ReactNode;
}

function SearchInput({ placeholder, icon, companyId, adAccountId, type, onSelect, renderItem }: SearchInputProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MetaSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  const doSearch = useCallback(
    (query: string) => {
      if (!companyId) return;
      if (query.trim().length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      void supabase.functions
        .invoke("meta-targeting-search", {
          body: {
            company_id: companyId,
            ad_account_id: adAccountId,
            type,
            query,
            limit: 25,
          },
        })
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          setLoading(false);
          if (error) {
            setResults([]);
            return;
          }
          const r = (data as { results?: MetaSearchResult[]; fallback?: boolean } | null)?.results ?? [];
          setResults(r);
          setFallback(Boolean((data as { fallback?: boolean } | null)?.fallback));
          setOpen(r.length > 0);
        })
        .catch(() => {
          if (cancelledRef.current) return;
          setLoading(false);
          setResults([]);
        });
    },
    [companyId, adAccountId, type],
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        {icon}
        <Input
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => doSearch(next), 350);
          }}
          onFocus={() => { if (results.length) setOpen(true); }}
          onBlur={() => { setTimeout(() => setOpen(false), 150); }}
          className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {fallback && (
            <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800">
              Catalogo locale (Meta API non connessa). Connetti l'account Meta in Impostazioni per risultati live.
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setQ("");
                setResults([]);
                setOpen(false);
              }}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
            >
              {renderItem(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagList({
  tags,
  color,
  onRemove,
}: {
  tags: MetaSearchResult[];
  color: "fuchsia" | "rose";
  onRemove: (key: string) => void;
}) {
  if (tags.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
        Nessun tag selezionato.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <Badge
          key={t.key}
          variant="secondary"
          className={cn(
            "cursor-pointer text-xs",
            color === "fuchsia" ? "bg-fuchsia-100 text-fuchsia-900 hover:bg-fuchsia-200" : "bg-rose-100 text-rose-900 hover:bg-rose-200",
          )}
          onClick={() => onRemove(t.key)}
        >
          {t.name}
          <X className="ml-1 h-3 w-3" />
        </Badge>
      ))}
    </div>
  );
}

function PlacementGroup({
  title,
  positions,
  selected,
  onChange,
}: {
  title: string;
  positions: ReadonlyArray<{ v: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const allSelected = positions.every((p) => selected.includes(p.v));
  const noneSelected = selected.length === 0;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
        <button
          type="button"
          className="text-[10px] font-medium text-blue-600 hover:underline"
          onClick={() => onChange(allSelected ? [] : positions.map((p) => p.v))}
        >
          {allSelected ? "Deseleziona tutto" : "Seleziona tutto"}
        </button>
      </div>
      <div className="space-y-1.5">
        {positions.map((pos) => {
          const checked = selected.includes(pos.v);
          return (
            <label key={pos.v} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  const wantOn = !!v;
                  const next = wantOn ? [...selected, pos.v] : selected.filter((s) => s !== pos.v);
                  onChange(next);
                }}
              />
              <span className={cn(noneSelected && "text-slate-400")}>{pos.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function formatAudience(n: number | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default MetaTargetingPanel;
