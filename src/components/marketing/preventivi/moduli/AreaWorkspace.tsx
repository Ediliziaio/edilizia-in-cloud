import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SalesArea, SalesIntervention } from "@/lib/moduli-vendita/areas";
import { salesAreaHref } from "@/lib/moduli-vendita/areas";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";
import { MODULE_PRESENTATION } from "@/lib/moduli-vendita/presentation";
import { hasAreaAccess, pilotHref, quoteCreationHref } from "./salesSelector";

interface AccessProps {
  area: SalesArea;
  view?: ModuloVenditaView;
  hidden: boolean;
  canManage: boolean;
  canCreate: boolean;
  canRead: boolean;
  onLockedClick: (view: ModuloVenditaView) => void;
}

export function SalesModelCard({ area, item, view, params, hidden, canCreate, modelSupported, selected = false, onLockedClick }: AccessProps & {
  item: SalesIntervention;
  params: URLSearchParams;
  modelSupported: boolean;
  selected?: boolean;
}) {
  const active = hasAreaAccess(view) && !hidden;
  const href = pilotHref(area, item, params);
  const status = !view || view.isError || view.isLoading ? "Accesso da verificare"
    : hidden ? "Area disattivata" : view.stato === "bloccato" ? "Richiede attivazione"
    : view.stato === "coming_soon" ? "In sviluppo"
    : href ? (modelSupported ? "Pronto per la compilazione" : "Salvataggio da attivare") : "Preventivatore da collegare";
  return <article aria-label={`Intervento ${item.title}`} className={`flex min-w-0 flex-col rounded-xl border bg-card p-4 ${selected ? "border-primary ring-1 ring-primary" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{area.title}</p><Badge variant="secondary">{status}</Badge></div>
    <h2 className="mt-3 font-semibold">{item.title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{item.fields.map(field => <li key={field}>• {field}</li>)}</ul>
    {active && href && !modelSupported && <p className="mt-3 text-xs text-amber-800">Puoi aprire il percorso dedicato. Il salvataggio richiede l'attivazione del collegamento dati.</p>}
    {active && !href && <p className="mt-3 text-xs text-muted-foreground">Il percorso specifico non è ancora collegato. Non verrà aperto un preventivatore generico al suo posto.</p>}
    <div className="mt-auto flex flex-wrap gap-2 pt-4">
      {active && href && canCreate && <Button asChild size="sm"><Link to={href} aria-label={`Apri preventivatore ${item.title}`}>Apri preventivatore<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
      {active && !href && canCreate && <Button disabled size="sm">Preventivatore non disponibile</Button>}
      {!hidden && view && !view.isError && !view.isLoading && view.stato === "bloccato" && <Button size="sm" variant="outline" onClick={() => onLockedClick(view)}>Scopri il modulo</Button>}
      {active && !canCreate && <p className="text-xs text-muted-foreground">Il tuo ruolo non consente di creare preventivi.</p>}
    </div>
  </article>;
}

export function AreaTools({ area, view, params, hidden, canCreate, canRead, compact = false }: AccessProps & { params: URLSearchParams; compact?: boolean }) {
  if (!hasAreaAccess(view) || hidden || !view || (!canCreate && !canRead)) return null;
  return <div className={compact ? "" : "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"}>
    {!compact && <div><h3 className="text-sm font-medium">{area.title}</h3><p className="text-xs text-muted-foreground">Preventivatore generale dell'area, senza modello specifico.</p></div>}
    <div className="flex flex-wrap gap-2">
      {canCreate && <Button asChild size="sm" variant="outline"><Link to={quoteCreationHref(`${view.modulo.href}/nuovo`, params)} aria-label={`Crea preventivo generale ${area.title}`}>Crea preventivo generale</Link></Button>}
      {canRead && <Button asChild size="sm" variant="ghost"><Link to={view.modulo.href} aria-label={`Preventivi salvati ${area.title}`}><FolderOpen className="mr-2 h-4 w-4" />Preventivi salvati</Link></Button>}
    </div>
  </div>;
}

export function SalesAreaCard(props: AccessProps & { params: URLSearchParams }) {
  const { area, view, hidden, params } = props;
  const image = MODULE_PRESENTATION[area.sourceModule].image;
  const Icon = view?.modulo.icon ?? Layers;
  const status = !view || view.isError || view.isLoading ? "Accesso da verificare"
    : hidden ? "Area disattivata" : view.stato === "bloccato" ? "Richiede attivazione"
    : view.stato === "coming_soon" ? "In sviluppo" : null;
  return <article aria-label={`Area ${area.title}`} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
    <div className="flex items-center gap-3">
      {image ? <img src={image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon aria-hidden="true" className="h-6 w-6 text-muted-foreground" /></span>}
      <div><h2 className="font-semibold">{area.title}</h2><p className="text-xs text-muted-foreground">{area.interventions.length} interventi</p></div>
    </div>
    {status && <p className="text-xs text-muted-foreground">{status}</p>}
    <div className="mt-auto space-y-2">
      <Button asChild size="sm"><Link to={salesAreaHref(params, area)} aria-label={`Scegli intervento ${area.title}`}>Scegli intervento<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </div>
  </article>;
}

export function AreaWorkspace(props: AccessProps & {
  params: URLSearchParams;
  interventions: readonly SalesIntervention[];
  modelSupported: boolean;
  isSaving: boolean;
  onVisibilityChange: (enabled: boolean) => void;
}) {
  const { area, view, hidden, canManage, params, interventions, isSaving, onVisibilityChange } = props;
  const selected = area.interventions.find(item => item.id === params.get("intervento"));
  return <div className="space-y-4">
    {params.get("intervento") && !selected && <p role="alert" className="text-sm text-amber-800">Intervento non riconosciuto per questa area.</p>}
    {!view || view.isError || view.isLoading ? <div role="alert" className="rounded-xl border border-amber-300 p-4"><p className="font-medium">Accesso da verificare</p><p className="mt-1 text-sm">Non è possibile confermare la disponibilità del modulo.</p><Button variant="outline" className="mt-3" onClick={() => window.location.reload()}>Riprova</Button></div>
      : hidden ? <section className="rounded-xl border p-4"><h2 className="font-semibold">Area disattivata per la squadra</h2><p className="mt-2 text-sm text-muted-foreground">I preventivi esistenti non sono stati eliminati.</p>{canManage && hasAreaAccess(view) && <Button className="mt-3" disabled={isSaving} onClick={() => onVisibilityChange(true)}>Riattiva area {area.title}</Button>}</section>
      : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{interventions.map(item => <SalesModelCard key={item.id} {...props} item={item} selected={selected?.id === item.id} />)}</div>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Altre opzioni: preventivo generale dell'area e offerte salvate</summary><div className="mt-3"><AreaTools {...props} /></div></details>
      </>}
  </div>;
}
