import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { useSerramentiModelSupport } from "@/hooks/useSerramentiModelSupport";
import { useTettiModelSupport } from "@/hooks/useTettiModelSupport";
import { useModuliVendita, useModuliVisibilita, type ModuloVenditaView } from "@/lib/moduli-vendita";
import { SALES_AREAS, findSalesArea, type SalesArea } from "@/lib/moduli-vendita/areas";
import { AreaWorkspace, SalesAreaCard, SalesModelCard } from "./AreaWorkspace";
import { ModuloLockedDialog } from "./ModuloLockedDialog";
import { hasAreaAccess, matchesIntervention, quoteCreationHref } from "./salesSelector";

type AreaFilter = "tutti" | "attivo" | "bloccato" | "coming_soon" | "disattivato";
const FILTERS: { id: AreaFilter; label: string }[] = [
  { id: "tutti", label: "Tutti gli stati" }, { id: "attivo", label: "Aree abilitate" },
  { id: "disattivato", label: "Disattivate" }, { id: "bloccato", label: "Da attivare" }, { id: "coming_soon", label: "In sviluppo" },
];

export function SalesAreasTab() {
  const [params, setParams] = useSearchParams();
  const { moduli, isLoading, isError } = useModuliVendita();
  const { isModuloVisibile, setModuloVisibile, isLoading: loadingVisibility, isSaving } = useModuliVisibilita();
  const permissions = usePermissions();
  const support = useSerramentiModelSupport();
  const tettiSupport = useTettiModelSupport();
  const modelSupportedFor = (item: SalesArea) => {
    const state = item.sourceModule === "tetti" ? tettiSupport : support;
    return state.supported && !state.isLoading && !state.isError;
  };
  const canManage = permissions.canViewSettingsPricing && permissions.canEditSettingsPricing;
  const [lockedView, setLockedView] = useState<ModuloVenditaView | null>(null);
  const query = params.get("q_moduli") || "";
  const isSearching = query.trim().length > 0;
  const rawFilter = params.get("stato_moduli");
  const filter: AreaFilter = FILTERS.some(item => item.id === rawFilter && (item.id !== "disattivato" || canManage)) ? rawFilter as AreaFilter : "tutti";
  const area = findSalesArea(params.get("area"));
  const viewFor = (item: SalesArea) => moduli.find(view => view.modulo.slug === item.sourceModule);
  const isHidden = (item: SalesArea) => !isModuloVisibile(item.sourceModule);
  const matchesFilter = (item: SalesArea) => {
    if (filter === "disattivato") return canManage && isHidden(item);
    if (isHidden(item)) return false;
    const view = viewFor(item);
    return filter === "tutti" || (!!view && !view.isError && !view.isLoading && view.stato === filter);
  };
  const filteredAreas = SALES_AREAS.filter(item => (!area || item.id === area.id) && matchesFilter(item));
  const results = filteredAreas.flatMap(item => item.interventions
    .filter(intervention => matchesIntervention(item, intervention, query))
    .map(intervention => ({ area: item, intervention })));
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || (key === "stato_moduli" && value === "tutti")) next.delete(key); else next.set(key, value);
    next.set("tab", "moduli");
    // Un filtro esplicito sostituisce la selezione del vecchio deeplink.
    next.delete("intervento");
    setParams(next, { replace: true });
  };
  const accessProps = (item: SalesArea) => ({
    area: item, view: viewFor(item), hidden: isHidden(item), canManage,
    canCreate: item.sourceModule === "fotovoltaico" ? permissions.canEditPreventivi : permissions.canEditMarketingOpportunities,
    canRead: item.sourceModule === "fotovoltaico" || permissions.canViewMarketingOpportunities,
    onLockedClick: setLockedView,
  });

  if (isLoading || loadingVisibility) return <div role="status" className="rounded-xl border p-6">Caricamento interventi e preferenze aziendali…</div>;
  if (isError) return <div role="alert" className="rounded-xl border border-amber-300 p-6"><h1 className="text-lg font-semibold">Impossibile verificare le aree</h1><p className="my-3 text-sm">Gli accessi non sono stati confermati. Riprova prima di creare preventivi o cambiare preferenze.</p><Button onClick={() => window.location.reload()}>Riprova</Button></div>;

  const showAreas = !area && !isSearching;
  const resultCount = showAreas ? filteredAreas.length : results.length;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">Cosa devi preventivare?</h1><p className="mt-1 text-sm text-muted-foreground">Scegli l'area e l'intervento. Poi compila cliente, prodotti e lavorazioni, prezzi e sconti.</p></div>
      <div>{permissions.canEditPreventivi && <Button asChild size="sm" variant="ghost"><Link to={quoteCreationHref("/azienda/marketing/preventivi/nuovo", params)}>Preventivo libero</Link></Button>}</div>
    </header>
    {params.get("area") && !area && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">Area non riconosciuta. Scegli una delle aree disponibili qui sotto.</p>}
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex-1"><label htmlFor="model-search" className="mb-1 block text-xs font-medium">Cerca intervento</label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="model-search" className="h-10 pl-9" placeholder="Persiane, ripasso, caldaia…" value={query} onChange={event => update("q_moduli", event.target.value)} /></div></div>
      <div><label htmlFor="model-area" className="mb-1 block text-xs font-medium">Area</label><select id="model-area" className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-60" value={area?.id || ""} onChange={event => update("area", event.target.value)}><option value="">Tutte le aree</option>{SALES_AREAS.filter(item => canManage || !isHidden(item) || area?.id === item.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
      <div><label htmlFor="model-status" className="mb-1 block text-xs font-medium">Stato area</label><select id="model-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-44" value={filter} onChange={event => update("stato_moduli", event.target.value)}>{FILTERS.filter(item => item.id !== "disattivato" || canManage).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    </div>
    {canManage && <details className="rounded-lg border bg-muted/20">
      <summary className="cursor-pointer p-3 text-sm font-medium">Gestisci visibilità aree · {SALES_AREAS.filter(isHidden).length} disattivate</summary>
      <div className="space-y-3 border-t p-3"><p className="text-xs text-muted-foreground">Mostra o nascondi un'area per la squadra. Puoi riattivarla qui anche dopo averla nascosta; preventivi esistenti e piano non cambiano.</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SALES_AREAS.filter(item => hasAreaAccess(viewFor(item))).map(item => <div key={item.id} className="flex items-center justify-between gap-3"><label htmlFor={`area-toggle-${item.id}`} className="text-sm">{item.title}</label><Switch id={`area-toggle-${item.id}`} aria-label={`Attiva o disattiva area ${item.title}`} checked={!isHidden(item)} disabled={isSaving} onCheckedChange={checked => setModuloVisibile(item.sourceModule, checked)} /></div>)}</div></div>
    </details>}
    <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{resultCount} {showAreas ? (resultCount === 1 ? "area trovata" : "aree trovate") : (resultCount === 1 ? "intervento trovato" : "interventi trovati")}{isSaving ? " · Salvataggio preferenza…" : ""}</p>
    {resultCount === 0 && <div className="rounded-xl border border-dashed p-6 text-center"><h2 className="font-semibold">{showAreas ? "Nessuna area corrispondente" : "Nessun modello corrispondente"}</h2><p className="mt-2 text-sm text-muted-foreground">Cambia ricerca o area.{canManage ? " Le aree nascoste si riattivano da Gestisci visibilità aree." : ""}</p><Button variant="outline" className="mt-3" onClick={() => { const next = new URLSearchParams(params); for (const key of ["q_moduli", "stato_moduli", "area", "intervento"]) next.delete(key); setParams(next, { replace: true }); }}>Azzera filtri</Button></div>}
    {area ? <AreaWorkspace {...accessProps(area)} params={params} interventions={results.map(result => result.intervention)} modelSupported={modelSupportedFor(area)} isSaving={isSaving} onVisibilityChange={checked => setModuloVisibile(area.sourceModule, checked)} />
      : showAreas ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredAreas.map(item => <SalesAreaCard key={item.id} {...accessProps(item)} params={params} />)}</div>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{results.map(result => <SalesModelCard key={`${result.area.id}-${result.intervention.id}`} {...accessProps(result.area)} item={result.intervention} params={params} modelSupported={modelSupportedFor(result.area)} />)}</div>}
    <ModuloLockedDialog view={lockedView} open={!!lockedView} onOpenChange={open => { if (!open) setLockedView(null); }} />
  </div>;
}
