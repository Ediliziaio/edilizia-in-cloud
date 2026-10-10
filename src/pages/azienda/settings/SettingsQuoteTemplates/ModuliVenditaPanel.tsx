/**
 * SettingsQuoteTemplates — Pannello «Modello dell'area»
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 *
 * Scheda «Moduli» della pagina /azienda/impostazioni/template-preventivi.
 * La libreria (ModuleTemplateLibrary) mostra le aree e i modelli di ogni intervento; questo pannello
 * serve solo quando dalla libreria si apre il «Modello dell'area» (`modello=generale`): l'editor
 * online dell'area scelta (lazy). La griglia di scelta dell'area, più sotto, a quanto risulta dal codice
 * non si raggiunge più: la libreria chiama `renderLegacy` solo con un'area già scelta (e valida).
 */
import React, { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Bath, Hammer, Home, Loader2, RectangleVertical, ShoppingBag, Sun, Wind, Zap, Flame, LayoutGrid, Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useModuliVisibilita } from "@/lib/moduli-vendita";
import { buildQuoteTemplatesModuleParams } from "@/lib/settingsQuoteTemplatesRoute";

// PERF: lazy-load editor pesanti (Serramenti ~150KB, Fotovoltaico ~120KB)
// per evitare di caricare il bundle nella route Settings prima del click sulla tab.
const SerramentiTemplateEditor = lazy(() =>
  import("@/components/serramenti/SerramentiModuleTemplatesPanel").then((m) => ({ default: m.SerramentiModuleTemplatesPanel })),
);
const FotovoltaicoTemplateEditor = lazy(() =>
  import("@/components/fotovoltaico/FotovoltaicoTemplateEditor").then((m) => ({ default: m.FotovoltaicoTemplateEditor })),
);
const RistrutturazioneTemplateEditor = lazy(() =>
  import("@/components/ristrutturazione/RistrutturazioneTemplateEditor").then((m) => ({ default: m.RistrutturazioneTemplateEditor })),
);
const BagniTemplateEditor = lazy(() =>
  import("@/components/bagni/BagniTemplateEditor").then((m) => ({ default: m.BagniTemplateEditor })),
);
const TettiTemplateEditor = lazy(() =>
  import("@/components/tetti/TettiModuleTemplatesPanel").then((m) => ({ default: m.TettiModuleTemplatesPanel })),
);
const ClimatizzazioneTemplateEditor = lazy(() =>
  import("@/components/climatizzazione/ClimatizzazioneTemplateEditor").then((m) => ({ default: m.ClimatizzazioneTemplateEditor })),
);
const ElettricoTemplateEditor = lazy(() =>
  import("@/components/elettrico/ElettricoTemplateEditor").then((m) => ({ default: m.ElettricoTemplateEditor })),
);
const TermoidraulicoTemplateEditor = lazy(() =>
  import("@/components/termoidraulico/TermoidraulicoTemplateEditor").then((m) => ({ default: m.TermoidraulicoTemplateEditor })),
);
const PavimentiTemplateEditor = lazy(() =>
  import("@/components/pavimenti/PavimentiTemplateEditor").then((m) => ({ default: m.PavimentiTemplateEditor })),
);
const PiscineTemplateEditor = lazy(() =>
  import("@/components/piscine/PiscineTemplateEditor").then((m) => ({ default: m.PiscineTemplateEditor })),
);

interface ModuloVendita {
  slug: string;
  nome: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  /** Thumbnail della resa PDF reale, quando il modulo ha una libreria locale. */
  coverPreview?: string;
  /** Nota breve per aiutare a scegliere il modulo senza aprire ogni editor. */
  designNote?: string;
  available: boolean;
  render: () => React.ReactNode;
}

const MODULI_VENDITA: ModuloVendita[] = [
  {
    slug: "serramenti",
    nome: "Serramenti",
    icon: RectangleVertical,
    description: "Sette modelli PDF: finestre, persiane, avvolgibili, zanzariere, porte d'ingresso, porte interne e interventi combinati.",
    coverPreview: "/cover-stock/serramenti/1-thumb.jpg",
    designNote: "Proposta commerciale + allegato tecnico",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <SerramentiTemplateEditor />
      </Suspense>
    ),
  },
  {
    slug: "fotovoltaico",
    nome: "Fotovoltaico",
    icon: Sun,
    description: "Modello del PDF Fotovoltaico: marchio, presentazione dell'impresa, risparmio, certificazioni e contatti.",
    coverPreview: "/cover-stock/fotovoltaico/1-thumb.jpg",
    designNote: "Dati, risparmio e ritorno dell'investimento",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <FotovoltaicoTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "ristrutturazione",
    nome: "Ristrutturazione",
    icon: Hammer,
    description: "Modello del PDF Ristrutturazione: marchio, copertina, chi siamo, esigenze, punti di forza, testimonianze, cronoprogramma, condizioni.",
    coverPreview: "/cover-stock/ristrutturazione/2-thumb.jpg",
    designNote: "Piano lavori + computo leggibile",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <RistrutturazioneTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "bagni",
    nome: "Bagni",
    icon: Bath,
    description: "Modello del PDF Bagni: marchio, copertina, chi siamo, esigenze, punti di forza, testimonianze, cronoprogramma, condizioni.",
    coverPreview: "/cover-stock/bagni/2-thumb.jpg",
    designNote: "Progetto bagno + percorso chiavi in mano",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <BagniTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "tetti",
    nome: "Tetti",
    icon: Home,
    description: "Sei modelli PDF: rifacimento, ripasso, riparazioni, isolamento, terrazzi e lattoneria. Il modello generale dell'area c'è sempre.",
    coverPreview: "/cover-stock/tetti/1-thumb.jpg",
    designNote: "Un modello indipendente per ogni intervento",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <TettiTemplateEditor />
      </Suspense>
    ),
  },
  {
    slug: "climatizzazione",
    nome: "Climatizzazione",
    icon: Wind,
    description: "Modello del PDF Climatizzazione: comfort, consumi, impianto, garanzie, controlli e assistenza.",
    coverPreview: "/cover-stock/climatizzazione/1-thumb.jpg",
    designNote: "Comfort, efficienza e benessere",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <ClimatizzazioneTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "elettrico",
    nome: "Elettrico / Domotica",
    icon: Zap,
    description: "Modello del PDF Elettrico: sicurezza, impianto, domotica, controlli, documenti e garanzie.",
    coverPreview: "/cover-stock/elettrico/1-thumb.jpg",
    designNote: "Sicurezza, impianto e domotica",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <ElettricoTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "termoidraulico",
    nome: "Termoidraulico",
    icon: Flame,
    description: "Modello del PDF Termoidraulico: riscaldamento, acqua, impianti, controlli, manutenzione e garanzie.",
    coverPreview: "/cover-stock/termoidraulico/1-thumb.jpg",
    designNote: "Impianti, calore e manutenzione",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <TermoidraulicoTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "pavimenti",
    nome: "Pavimenti & Resine",
    icon: LayoutGrid,
    description: "Modello del PDF Pavimenti: materiali, posa, finiture, lavorazioni, manutenzione e condizioni.",
    coverPreview: "/cover-stock/pavimenti/1-thumb.jpg",
    designNote: "Materiali, posa e resa finale",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <PavimentiTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "piscine",
    nome: "Piscine",
    icon: Waves,
    description: "Modello del PDF Piscine: progetto, terreno, impianto, posa, manutenzione, garanzie e prossimi passi.",
    coverPreview: "/cover-stock/piscine/1-thumb.jpg",
    designNote: "Progetto outdoor + impianto",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <PiscineTemplateEditor embedded />
      </Suspense>
    ),
  },
];

// La vecchia sezione separata "Moduli preventivo attivi" è stata FUSA nella
// griglia dei moduli (ModuliVenditaPanel): ogni card ha ora il proprio
// interruttore on/off, eliminando la lista ridondante in cima.

const ModuleTemplateLibrary = lazy(() => import("@/components/preventivi/modules/ModuleTemplateLibrary"));

export function ModuliVenditaPanel({ initialModulo }: { initialModulo?: string }) {
  return <Suspense fallback={<p role="status">Caricamento dei modelli…</p>}><ModuleTemplateLibrary renderLegacy={() => <LegacyModuliVenditaPanel initialModulo={initialModulo} />} /></Suspense>;
}

function LegacyModuliVenditaPanel({ initialModulo }: { initialModulo?: string }) {
  // Se arriva via deeplink un modulo valido E available, lo pre-seleziono.
  // Altrimenti mostro la landing con la grid di selezione.
  const [, setSearchParams] = useSearchParams();
  const initialFromUrl = initialModulo && MODULI_VENDITA.some((m) => m.slug === initialModulo && m.available)
    ? initialModulo
    : null;
  const [activeSlug, setActiveSlug] = useState<string | null>(initialFromUrl);
  // Sync col deeplink SENZA effetto (no setState-in-effect): pattern React
  // "adjust state during render". Quando `initialFromUrl` cambia (navigazione
  // verso ?modulo=…), riconciliamo `activeSlug` durante il render confrontando
  // l'ultimo valore visto; la selezione locale dell'utente resta altrimenti.
  const [lastInitial, setLastInitial] = useState<string | null>(initialFromUrl);
  if (initialFromUrl !== lastInitial) {
    setLastInitial(initialFromUrl);
    setActiveSlug(initialFromUrl);
  }
  const { isModuloVisibile, setModuloVisibile, isSaving } = useModuliVisibilita();
  const active = activeSlug ? MODULI_VENDITA.find((m) => m.slug === activeSlug) : null;

  // Sincronizzo l'URL quando l'utente cambia modulo (così back/forward + share funzionano)
  const handleSelectModulo = (slug: string | null) => {
    setActiveSlug(slug);
    setSearchParams((prev) => buildQuoteTemplatesModuleParams(prev, slug), { replace: true });
  };

  // Header comune. Il titolo della pagina è nel layout (h1): quello di questo pannello è un h2.
  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-eic-amber flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
          <ShoppingBag className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Modello dell&apos;area</h2>
          <p className="text-sm text-muted-foreground">
            {active && ["tetti", "serramenti"].includes(active.slug) ? `Configura i modelli PDF dell'area ${active.nome}, uno per ogni intervento.` : active
              ? <>Stai configurando il modello dell&apos;area <strong>{active.nome}</strong>.</>
              : "Scegli quale area vuoi configurare. Le impostazioni valgono per tutti i nuovi preventivi di quell'area."}
          </p>
        </div>
      </div>
      {active && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleSelectModulo(null)}
          className="gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Scegli un&apos;altra area
        </Button>
      )}
    </div>
  );

  // Landing: grid di card selezionabili
  if (!active) {
    return (
      <div className="space-y-4">
        {header}

        {/* Aree: accendi/spegni (interruttore su ogni scheda) + apri l'editor del PDF */}
        <div className="pt-1">
          <h2 className="text-base font-bold leading-tight">Aree dei preventivi</h2>
          <p className="text-xs text-muted-foreground">
            Accendi o spegni ogni area per la tua squadra con l'interruttore, e clicca <strong>Apri</strong>{" "}
            per configurarne il PDF (logo, copertina, recensioni, punti di forza, cronoprogramma). Le aree spente
            spariscono dal menu «Nuovo preventivo»; il «Classico» c'è sempre.
          </p>
        </div>
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 via-white to-amber-50/60">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">3</div>
              <div>
                <p className="text-sm font-bold text-slate-900">Il primo PDF in tre passi</p>
                <p className="text-xs text-slate-600">Le impostazioni diventano il punto di partenza per tutti i nuovi preventivi.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-orange-100 bg-white/80 p-3">
                <p className="text-xs font-semibold text-orange-700">01 · Scegli</p>
                <p className="mt-1 text-xs text-slate-600">Apri l'area che vendi più spesso.</p>
              </div>
              <div className="rounded-lg border border-orange-100 bg-white/80 p-3">
                <p className="text-xs font-semibold text-orange-700">02 · Applica</p>
                <p className="mt-1 text-xs text-slate-600">In Copertina scegli uno stile pronto e una foto.</p>
              </div>
              <div className="rounded-lg border border-orange-100 bg-white/80 p-3">
                <p className="text-xs font-semibold text-orange-700">03 · Verifica</p>
                <p className="mt-1 text-xs text-slate-600">Usa Anteprima PDF e salva solo dopo aver controllato le pagine.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULI_VENDITA.map((m) => {
            const Icon = m.icon;
            const isDisabled = !m.available;
            const visibile = isModuloVisibile(m.slug);
            return (
              <div
                key={m.slug}
                className={
                  "flex h-full flex-col rounded-xl border-2 p-4 transition-all " +
                  (isDisabled
                    ? "bg-slate-50 border-slate-200 opacity-60"
                    : visibile
                      ? "bg-white border-slate-200"
                      : "bg-slate-50/60 border-slate-200")
                }
              >
                {m.coverPreview && (
                  <div className="relative mb-3 h-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <img
                      src={m.coverPreview}
                      alt={`Anteprima copertina PDF ${m.nome}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-medium text-white">
                      Anteprima PDF
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className={
                    "h-11 w-11 rounded-lg flex items-center justify-center shrink-0 " +
                    (isDisabled || !visibile ? "bg-slate-200" : "bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-sm")
                  }>
                    <Icon className={isDisabled || !visibile ? "h-5 w-5 text-slate-400" : "h-5 w-5 text-white"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 mb-1 flex-wrap min-w-0">
                        <h3 className={"font-bold " + (!isDisabled && visibile ? "text-slate-900" : "text-slate-500")}>{m.nome}</h3>
                        {isDisabled ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">In arrivo</span>
                        ) : (
                          <span className={"text-[10px] px-2 py-0.5 rounded-full font-medium " + (visibile ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500")}>
                            {visibile ? "Attivo" : "Nascosto"}
                          </span>
                        )}
                      </div>
                      {/* on/off per-modulo: visibilità del preventivatore per la squadra */}
                      <Switch
                        checked={visibile}
                        disabled={isDisabled || isSaving}
                        onCheckedChange={(v) => setModuloVisibile(m.slug, v)}
                        aria-label={`${visibile ? "Spegni" : "Accendi"} l'area ${m.nome} nel menu Nuovo preventivo`}
                      />
                    </div>
                    <p className="text-xs leading-snug text-slate-600">{m.description}</p>
                    {m.designNote && (
                      <p className="mt-2 text-[11px] font-medium text-slate-500">Stile: {m.designNote}</p>
                    )}
                  </div>
                </div>
                {!isDisabled && (
                  <button
                    type="button"
                    onClick={() => handleSelectModulo(m.slug)}
                    className="mt-auto pt-3 border-t w-full flex items-center justify-between text-xs group focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded"
                  >
                    <span className="text-slate-500">Configura logo, recensioni…</span>
                    <span className="font-semibold text-orange-700 group-hover:translate-x-0.5 transition-transform">Apri →</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-xs text-slate-600">
            Il modello dell'area è il punto di partenza dei nuovi preventivi. I modelli di ogni intervento li usano i preventivi creati da quell'intervento.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Editor del modulo selezionato
  return (
    <div className="space-y-4">
      {header}
      {active.slug !== "tetti" && <Card className="bg-orange-50/30 border-orange-200">
        <CardContent className="p-3 flex items-start gap-3">
          <active.icon className="h-5 w-5 text-orange-700 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm text-orange-900">{active.nome}</p>
            <p className="text-xs text-orange-800 mt-0.5">{active.description}</p>
          </div>
        </CardContent>
      </Card>}
      <div>{active.render()}</div>
    </div>
  );
}
