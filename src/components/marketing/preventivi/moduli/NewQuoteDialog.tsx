import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Search, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { useModuliVendita, useModuliVisibilita } from "@/lib/moduli-vendita";
import { useSerramentiModelSupport } from "@/hooks/useSerramentiModelSupport";
import { useTettiModelSupport } from "@/hooks/useTettiModelSupport";
import { SALES_AREAS, type SalesArea } from "@/lib/moduli-vendita/areas";
import { hasAreaAccess, matchesIntervention, pilotHref, quoteCreationHref } from "./salesSelector";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: URLSearchParams;
  trigger: ReactNode;
}

/** One entry point, on top of the quote list. No template-editing destinations. */
export function NewQuoteDialog({ open, onOpenChange, params, trigger }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    {open && <QuoteChooser params={params} onSelect={() => onOpenChange(false)} />}
  </Dialog>;
}

function AreaImage({ area }: { area: SalesArea }) {
  const [failed, setFailed] = useState(false);
  const src = `/quote-picker/${area.id}-${area.interventions[0].id}.webp`;
  return src && !failed
    ? <img src={src} alt="" width={320} height={120} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-20 w-full object-cover sm:h-24 max-sm:h-14" />
    : <div className="flex h-20 items-center justify-center bg-orange-50 text-orange-600 sm:h-24 max-sm:h-14"><FileText aria-hidden="true" className="h-8 w-8 max-sm:h-5 max-sm:w-5" /></div>;
}

function InterventionImage({ area, modelId }: { area: SalesArea; modelId: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <AreaImage area={area} /> : <img src={`/quote-picker/${area.id}-${modelId}.webp`} alt="" width={640} height={360} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-24 w-full object-cover sm:h-28 max-sm:h-16" />;
}

function QuoteChooser({ params, onSelect }: { params: URLSearchParams; onSelect: () => void }) {
  const permissions = usePermissions();
  const { moduli, isLoading, isError } = useModuliVendita();
  const { isModuloVisibile, isLoading: visibilityLoading } = useModuliVisibilita();
  const srSupport = useSerramentiModelSupport();
  const tetSupport = useTettiModelSupport();
  const [areaId, setAreaId] = useState(params.get("area") ?? "");
  const [query, setQuery] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const canCreate = (area: SalesArea) => area.sourceModule === "fotovoltaico" ? permissions.canEditPreventivi : permissions.canEditMarketingOpportunities;
  const areas = SALES_AREAS.filter(area => canCreate(area) && isModuloVisibile(area.sourceModule) && hasAreaAccess(moduli.find(view => view.modulo.slug === area.sourceModule)));
  const area = areas.find(item => item.id === areaId);
  const searching = query.trim().length > 0;
  const results = (area ? [area] : areas).flatMap(item => item.interventions.filter(intervention => matchesIntervention(item, intervention, query)).map(intervention => ({ area: item, intervention })));
  const waiting = isLoading || visibilityLoading;
  const selectArea = (id: string) => { setAreaId(id); setQuery(""); heading.current?.focus(); };
  const view = area ? moduli.find(item => item.modulo.slug === area.sourceModule) : undefined;

  return <DialogContent onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
    className="flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[88dvh] [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:right-2 [&>button]:top-2 max-sm:w-full max-sm:rounded-b-none max-sm:[&>button]:top-1.5">
    {/* Telefono: resta il titolo (via soprattitolo e spiegazione), a 18px. */}
    <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-5 text-left sm:px-6 max-sm:pb-3 max-sm:pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-orange-600 max-sm:hidden">Un nuovo progetto, pochi passi</p>
      <DialogTitle ref={heading} tabIndex={-1} className="pr-7 text-2xl font-semibold tracking-tight outline-none max-sm:text-lg">{area ? `Preventivo ${area.title}` : "Che preventivo vuoi creare?"}</DialogTitle>
      <DialogDescription className="pr-3 max-sm:sr-only">{area ? "Scegli l’intervento e apri il relativo preventivatore." : "Parti da un’offerta libera o scegli una delle aree abilitate per la tua azienda."}</DialogDescription>
    </DialogHeader>

    <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 max-sm:py-3" data-testid="quote-chooser-scroll">
      {area && <Button variant="ghost" size="sm" className="mb-3 min-h-11 -ml-2 max-sm:mb-1 max-sm:min-h-8" onClick={() => selectArea("")}><ArrowLeft className="mr-2 h-4 w-4" />Tutte le aree</Button>}
      {!area && !searching && permissions.canEditPreventivi && <Link onClick={onSelect} to={quoteCreationHref("/azienda/marketing/preventivi/nuovo", params)}
        className="mb-5 flex min-h-24 items-center gap-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:mb-3 max-sm:min-h-0 max-sm:gap-3 max-sm:px-3 max-sm:py-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm max-sm:h-9 max-sm:w-9"><FileText aria-hidden="true" className="h-6 w-6 max-sm:h-5 max-sm:w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold max-sm:text-sm">Preventivo classico</span><span className="mt-1 block text-sm text-muted-foreground max-sm:hidden">Prodotti, servizi e voci libere. Lo componi come vuoi.</span></span>
        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-600" />
      </Link>}

      <div className="relative mb-4 max-sm:mb-3"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground max-sm:top-2.5" aria-hidden="true" /><Input type="search" aria-label="Cerca un intervento" placeholder={area ? "Cerca in questa area…" : "Cerca: persiane, bagno, ripasso…"} value={query} onChange={event => setQuery(event.target.value)} className="h-11 pl-9 text-base sm:text-sm max-sm:h-9" /></div>

      {waiting ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Verifico le aree abilitate…</p>
        : isError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Non è stato possibile verificare i moduli aziendali. Chiudi e riprova: nessun accesso viene dato per confermato.</p>
        : !area && !searching ? <>
          <h3 className="mb-3 text-sm font-semibold max-sm:mb-2 max-sm:text-xs max-sm:font-medium max-sm:uppercase max-sm:tracking-wide max-sm:text-muted-foreground">Preventivi per area <span className="ml-1 font-normal text-muted-foreground max-sm:hidden">· {areas.length} disponibili</span></h3>
          {areas.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nessun modulo specifico abilitato per il tuo ruolo e la tua azienda.</p>}
          {/* Telefono: tre aree per riga con la foto piccola e il nome sotto,
              tutte in una schermata (a due per riga con le foto grandi se ne
              vedevano quattro). */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 max-sm:grid-cols-3 max-sm:gap-2">{areas.map(item => <button type="button" key={item.id} onClick={() => selectArea(item.id)}
            className="tap-compact group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-card text-left shadow-sm transition-colors hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Scegli area ${item.title}`}>
            <AreaImage area={item} /><span className="flex min-h-16 items-center justify-between gap-2 p-3 max-sm:min-h-0 max-sm:px-1.5 max-sm:py-1.5"><span className="text-sm font-semibold leading-snug max-sm:line-clamp-2 max-sm:w-full max-sm:text-center max-sm:text-[11px] max-sm:leading-tight">{item.title}</span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-orange-600 max-sm:hidden" /></span>
          </button>)}</div>
        </> : <>
          {area && !searching && view && <Link onClick={onSelect} to={quoteCreationHref(`${view.modulo.href}/nuovo`, params)} className="mb-4 flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:mb-3 max-sm:min-h-0 max-sm:py-2.5">
            <span><span className="block font-semibold">Preventivo {area.title} generale</span><span className="block text-xs text-muted-foreground max-sm:hidden">Per lavori misti, senza un modello d’intervento specifico.</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>}
          <p role="status" className="mb-3 text-xs text-muted-foreground max-sm:sr-only">{results.length} interventi {area ? "in questa area" : "trovati"}</p>
          {results.length === 0 && <div className="py-6 text-center"><p className="text-sm">Nessun intervento trovato.</p><Button variant="ghost" className="mt-2" onClick={() => setQuery("")}>Cancella ricerca</Button></div>}
          {/* Telefono: due interventi per riga, foto e nome; il riassunto e
              «Apri preventivatore» si leggono dal computer (resta l'avviso se
              il percorso non è pronto). */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-sm:grid-cols-2 max-sm:gap-2">{results.map(({ area: item, intervention }) => {
            const href = pilotHref(item, intervention, params);
            const support = item.sourceModule === "tetti" ? tetSupport : srSupport;
            const ready = href && support.supported && !support.isLoading && !support.isError;
            const content = <><InterventionImage area={item} modelId={intervention.id} /><span className="block p-3 max-sm:p-2"><span className="text-[11px] text-muted-foreground max-sm:hidden">{item.title}</span><span className="mt-1 block font-semibold max-sm:mt-0 max-sm:line-clamp-2 max-sm:text-xs max-sm:leading-tight">{intervention.title}</span><span className="mt-2 block text-xs leading-relaxed text-muted-foreground max-sm:hidden">{intervention.summary}</span><span className={`mt-3 flex items-center gap-2 text-xs ${ready ? "text-green-700 max-sm:hidden" : "text-amber-800 max-sm:mt-1 max-sm:text-[10px]"}`}>{ready ? <><Check className="h-3.5 w-3.5" />Apri preventivatore</> : href ? "Salvataggio da attivare" : "Collegamento in preparazione"}</span></span></>;
            return href ? <Link key={`${item.id}/${intervention.id}`} onClick={onSelect} to={href} aria-label={`Apri preventivatore ${intervention.title}`} className="overflow-hidden rounded-xl border text-sm hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{content}</Link>
              : <div key={`${item.id}/${intervention.id}`} aria-label={`Intervento non disponibile: ${intervention.title}`} className="overflow-hidden rounded-xl border bg-muted/20 text-sm">{content}</div>;
          })}</div>
          {results.some(result => !pilotHref(result.area, result.intervention, params)) && <p className="mt-4 text-xs text-muted-foreground max-sm:hidden">I percorsi in preparazione non aprono un preventivatore diverso al posto del modello scelto.</p>}
        </>}
    </div>
    {/* Telefono no: una frase di contorno in fondo al foglio. */}
    <footer className="shrink-0 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:px-6 max-sm:hidden">Ritrovi ogni offerta nella <span className="font-medium text-foreground">Lista Preventivi</span>, anche quelle dei moduli specifici.</footer>
  </DialogContent>;
}
