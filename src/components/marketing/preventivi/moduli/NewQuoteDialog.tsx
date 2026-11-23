import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Search, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModuliVendita, useModuliVisibilita } from "@/lib/moduli-vendita";
import { useSerramentiModelSupport } from "@/hooks/useSerramentiModelSupport";
import { useTettiModelSupport } from "@/hooks/useTettiModelSupport";
import { useSupportoModelliPreventivo } from "@/hooks/useSupportoModelliPreventivo";
import { MODULI_CON_MODELLI, eModuloConModelloPreventivo } from "@/lib/moduli/modelloPreventivo";
import { SALES_AREAS, type SalesArea } from "@/lib/moduli-vendita/areas";
import { hasAreaAccess, matchesIntervention, pilotHref, quoteCreationHref } from "./salesSelector";
import { quoteAiWorkflow } from '@/lib/moduli-vendita/quoteAiWorkflow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: URLSearchParams;
  trigger?: ReactNode;
  ai?: boolean;
}

/** I preventivatori che salvano il modello dell'intervento, Fotovoltaico compreso. */
const MODULI_CON_MODELLI_E_FV = [...MODULI_CON_MODELLI, "fotovoltaico"] as const;

/** One entry point, on top of the quote list. No template-editing destinations. */
export function NewQuoteDialog({ open, onOpenChange, params, trigger, ai = false }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    {open && <QuoteChooser ai={ai} params={params} onSelect={() => onOpenChange(false)} />}
  </Dialog>;
}

function AreaImage({ area }: { area: SalesArea }) {
  const [failed, setFailed] = useState(false);
  const src = `/quote-picker/${area.id}-${area.interventions[0].id}.webp`;
  return src && !failed
    ? <img src={src} alt="" width={320} height={120} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-20 w-full object-cover sm:h-24 max-sm:h-14" />
    : <span className="flex h-20 items-center justify-center bg-orange-50 text-orange-600 sm:h-24 max-sm:h-14"><FileText aria-hidden="true" className="h-8 w-8 max-sm:h-5 max-sm:w-5" /></span>;
}

function InterventionImage({ area, modelId }: { area: SalesArea; modelId: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <AreaImage area={area} /> : <img src={`/quote-picker/${area.id}-${modelId}.webp`} alt="" width={640} height={360} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-24 w-full object-cover sm:h-28 max-sm:h-16" />;
}

function QuoteChooser({ params, onSelect, ai }: { params: URLSearchParams; onSelect: () => void; ai: boolean }) {
  const permissions = usePermissions();
  const hrefComputo = quoteCreationHref("/azienda/marketing/preventivi/nuovo", params);
  const hrefComputoAi = `${hrefComputo}${hrefComputo.includes("?") ? "&" : "?"}ai=1`;
  const { moduli, isLoading, isError } = useModuliVendita();
  const { isAreaVisibile, isLoading: visibilityLoading } = useModuliVisibilita();
  const srSupport = useSerramentiModelSupport();
  const tetSupport = useTettiModelSupport();
  const modelliSupport = useSupportoModelliPreventivo(MODULI_CON_MODELLI_E_FV);
  const [areaId, setAreaId] = useState(params.get("area") ?? "");
  const [query, setQuery] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const canCreate = (area: SalesArea) => area.sourceModule === "fotovoltaico" ? permissions.canEditPreventivi : permissions.canEditMarketingOpportunities;
  const areas = SALES_AREAS.filter(area => canCreate(area) && isAreaVisibile(area) && hasAreaAccess(moduli.find(view => view.modulo.slug === area.sourceModule)));
  const area = areas.find(item => item.id === areaId);
  const searching = query.trim().length > 0;
  const results = (area ? [area] : areas).flatMap(item => item.interventions.filter(intervention => matchesIntervention(item, intervention, query)).map(intervention => ({ area: item, intervention })));
  const waiting = isLoading || visibilityLoading;
  const cerca = (value: string) => {
    setQuery(value);
    if (scroll.current) scroll.current.scrollTop = 0;
  };
  const selectArea = (id: string) => { setAreaId(id); cerca(""); heading.current?.focus(); };
  const view = area ? moduli.find(item => item.modulo.slug === area.sourceModule) : undefined;
  // Telefono: le schede «in preparazione» non si toccano e non portano da
  // nessuna parte, quindi restano fuori. Un'area che ha solo quelle apre
  // subito il suo preventivo generale; in ricerca, al posto delle schede
  // spente, c'è il generale dell'area trovata.
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const generaleHref = (item: SalesArea) => {
    const modulo = moduli.find(candidate => candidate.modulo.slug === item.sourceModule);
    return modulo ? quoteCreationHref(`${modulo.modulo.href}/nuovo`, params) : null;
  };
  const collegato = (item: SalesArea, intervention: SalesArea["interventions"][number]) => !!pilotHref(item, intervention, params);
  const haModelli = (item: SalesArea) => item.interventions.some(intervention => collegato(item, intervention));
  const scegliArea = (item: SalesArea) => {
    const href = generaleHref(item);
    if (isMobile && href && !haModelli(item)) { onSelect(); navigate(href); return; }
    selectArea(item.id);
  };
  const mostrati = isMobile ? results.filter(result => collegato(result.area, result.intervention)) : results;
  const areeSenzaModello = isMobile && searching && !area
    ? areas.filter(item => results.some(result => result.area.id === item.id) && !mostrati.some(result => result.area.id === item.id))
    : [];
  const ricercaInutile = isMobile && !!area && !haModelli(area);

  return <DialogContent onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
    className="flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[88dvh] [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:right-2 [&>button]:top-2 max-sm:w-full max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] max-sm:[&>button]:top-1.5">
    {/* Telefono: resta il titolo (via soprattitolo e spiegazione), a 18px. */}
    <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-5 text-left sm:px-6 max-sm:pb-3 max-sm:pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-orange-600 max-sm:hidden">Un nuovo progetto, pochi passi</p>
      <DialogTitle ref={heading} tabIndex={-1} className="pr-7 text-2xl font-semibold tracking-tight outline-none max-sm:text-lg">{area ? `Preventivo ${area.title}` : ai ? "Preventivo AI · scegli come partire" : "Che preventivo vuoi creare?"}</DialogTitle>
      <DialogDescription className="pr-3 max-sm:sr-only">{ai ? 'Scegli prima il modello. Nel relativo wizard puoi aprire Silvio AI con chat, voci modificabili e anteprima del preventivo. Il nuovo popup è in prova locale su Demo Azienda 2.' : area ? "Scegli l’intervento e apri il relativo preventivatore." : "Parti da un’offerta libera o scegli una delle aree abilitate per la tua azienda."}</DialogDescription>
    </DialogHeader>

    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 sm:px-6">
        {area && (
          <Button variant="outline" size="sm" aria-label="Tutte le aree" className="h-11 shrink-0 gap-1.5 max-sm:w-11 max-sm:px-0" onClick={() => selectArea("")}>
            <ArrowLeft className="h-4 w-4" /><span className="max-sm:hidden">Tutte le aree</span>
          </Button>
        )}
        {!ricercaInutile && (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="Cerca un intervento" placeholder={area ? "Cerca in questa area…" : "Cerca un intervento"} value={query} onChange={event => cerca(event.target.value)} className="h-11 pl-9 text-base sm:text-sm" />
          </div>
        )}
    </div>
    <div ref={scroll} className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 max-sm:py-3" data-testid="quote-chooser-scroll">
      {!area && !searching && permissions.canEditPreventivi && <Link onClick={onSelect} to={ai ? hrefComputoAi : hrefComputo}
        className="mb-5 flex min-h-24 items-center gap-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:mb-3 max-sm:min-h-0 max-sm:gap-3 max-sm:px-3 max-sm:py-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm max-sm:h-9 max-sm:w-9"><FileText aria-hidden="true" className="h-6 w-6 max-sm:h-5 max-sm:w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold max-sm:text-sm">Preventivo / computo metrico</span><span className="mt-1 block text-sm text-muted-foreground max-sm:hidden">{ai ? 'Descrivi il lavoro in chat. Le voci si costruiscono nel preventivo e restano modificabili nell’editor.' : 'Inserisci le lavorazioni con quantità e prezzi.'}</span></span>
        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-600" />
      </Link>}

      {ai && area && <p role="note" className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{area.sourceModule === 'fotovoltaico'
        ? 'Scegli il modello e compila i dati del progetto. Nella fase Configurazione apri Silvio AI: dopo la conferma ritrovi componenti, manodopera e servizi nel configuratore modificabile.'
        : area.sourceModule === 'serramenti'
          ? 'Scegli il modello e apri Silvio AI nel preventivatore Serramenti. Immagini, varianti e schede restano quelle del modello e dei prodotti selezionati; le proposte entrano solo dopo la conferma.'
          : 'Scegli il modello e compila il wizard. Nel passo Computo apri Silvio AI: chat e PDF usano quel modello. Le modifiche entrano nel computo solo dopo la conferma.'}</p>}
      {waiting ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Verifico le aree abilitate…</p>
        : isError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Non è stato possibile verificare i moduli aziendali. Chiudi e riprova: nessun accesso viene dato per confermato.</p>
        : !area && !searching ? <>
          <h3 className="mb-3 text-sm font-semibold max-sm:mb-2 max-sm:text-xs max-sm:font-medium max-sm:uppercase max-sm:tracking-wide max-sm:text-muted-foreground">Preventivi per area <span className="ml-1 font-normal text-muted-foreground max-sm:hidden">· {areas.length} disponibili</span></h3>
          {areas.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nessun modulo specifico abilitato per il tuo ruolo e la tua azienda.</p>}
          <div className="grid grid-cols-2 gap-3 max-sm:gap-2 md:grid-cols-3 lg:grid-cols-4">{areas.map(item => <button type="button" key={item.id} onClick={() => scegliArea(item)}
            className="tap-compact group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-card text-left shadow-sm transition-colors hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:flex max-sm:min-h-14 max-sm:items-center" aria-label={`Scegli area ${item.title}`}>
            <span className="block max-sm:w-10 max-sm:shrink-0"><AreaImage area={item} /></span>
            <span className="flex min-w-0 items-center justify-between gap-2 p-3 max-sm:px-2 max-sm:py-1.5 sm:min-h-16">
              <span className="break-words text-sm font-semibold leading-tight max-sm:text-xs">{item.title}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-orange-600 max-sm:hidden" />
            </span>
          </button>)}</div>
        </> : <>
          {area && !searching && view && !(ai && area.sourceModule === 'bagni') && <Link onClick={onSelect} to={quoteCreationHref(`${view.modulo.href}/nuovo`, params)} className="mb-4 flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:mb-3 max-sm:min-h-0 max-sm:py-2.5">
            <span><span className="block font-semibold">Preventivo {area.title} generale</span><span className="block text-xs text-muted-foreground max-sm:hidden">Per lavori misti, senza un modello d’intervento specifico.</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>}
          {areeSenzaModello.map(item => { const href = generaleHref(item); return href && <Link key={item.id} onClick={onSelect} to={href} className="mb-2 flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Preventivo {item.title} generale<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>; })}
          <p role="status" className="mb-3 text-xs text-muted-foreground">{mostrati.length} interventi {area ? "in questa area" : "trovati"}</p>
          {mostrati.length === 0 && areeSenzaModello.length === 0 && (searching || !isMobile) && <div className="py-6 text-center"><p className="text-sm">Nessun intervento trovato.</p><Button variant="ghost" className="mt-2" onClick={() => cerca("")}>Cancella ricerca</Button></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-sm:gap-2">{mostrati.map(({ area: item, intervention }) => {
            const workflow = quoteAiWorkflow(item, intervention);
            const nativeHref = pilotHref(item, intervention, params);
            const href = ai && workflow.kind === 'native-ai' && nativeHref ? `${nativeHref}${nativeHref.includes('?') ? '&' : '?'}ai=1` : nativeHref;
            const support = item.sourceModule === "tetti" ? tetSupport
              : eModuloConModelloPreventivo(item.sourceModule)
                ? { supported: modelliSupport.supportato(item.sourceModule), isLoading: modelliSupport.isLoading, isError: modelliSupport.isError }
                : srSupport;
            const ready = href && support.supported && !support.isLoading && !support.isError;
            const content = <>
              <span className="block max-sm:w-16 max-sm:shrink-0 max-sm:bg-muted"><InterventionImage area={item} modelId={intervention.id} /></span>
              <span className="block min-w-0 flex-1 p-3 max-sm:p-2.5">
                <span className="text-[11px] text-muted-foreground">{item.title}</span>
                <span className="mt-1 block break-words font-semibold max-sm:mt-0 max-sm:leading-snug">{intervention.title}</span>
                <span className="mt-2 block text-xs leading-relaxed text-muted-foreground max-sm:hidden">{intervention.summary}</span>
                <span className={`mt-3 flex items-center gap-2 text-xs ${ready ? (ai && workflow.kind === "manual-only" ? "text-amber-800 max-sm:mt-1" : "text-blue-700 max-sm:hidden") : "text-amber-800 max-sm:mt-1"}`}>
                  {ready ? <><Check className="h-3.5 w-3.5" />{ai && workflow.kind === 'manual-only' ? 'Editor manuale · AI da collegare' : 'Apri preventivatore'}</> : href ? "Salvataggio da attivare" : "Collegamento in preparazione"}
                </span>
              </span>
              {href && <ArrowRight className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />}
            </>;
            const scheda = "overflow-hidden rounded-xl border text-sm max-sm:flex max-sm:min-h-16 max-sm:items-center";
            return href ? <Link key={`${item.id}/${intervention.id}`} onClick={onSelect} to={href} aria-label={`Apri preventivatore ${intervention.title}`} className={`${scheda} hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{content}</Link>
              : <div key={`${item.id}/${intervention.id}`} aria-label={`Intervento non disponibile: ${intervention.title}`} className={`${scheda} bg-muted/20`}>{content}</div>;
          })}</div>
          {results.some(result => !pilotHref(result.area, result.intervention, params)) && <p className="mt-4 text-xs text-muted-foreground max-sm:hidden">I percorsi in preparazione non aprono un preventivatore diverso al posto del modello scelto.</p>}
        </>}
    </div>
    {/* Telefono no: una frase di contorno in fondo al foglio. */}
    <footer className="shrink-0 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground sm:px-6 max-sm:hidden">{ai ? 'Il modello si sceglie qui, le lavorazioni si compongono nel suo wizard. Chat AI e anteprima restano una bozza separata fino alla conferma. Il normale salvataggio del wizard non cambia; nessun invio automatico ai clienti.' : <>Le offerte salvate nel gestionale sono nella <span className="font-medium text-foreground">Lista Preventivi</span>, anche quelle dei moduli specifici.</>}</footer>
  </DialogContent>;
}
