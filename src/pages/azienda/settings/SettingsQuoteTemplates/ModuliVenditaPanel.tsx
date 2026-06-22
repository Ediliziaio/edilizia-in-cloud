/**
 * SettingsQuoteTemplates — Pannello "Template Moduli Vendita"
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 *
 * Tab "Moduli Vendita" della pagina /azienda/impostazioni/template-preventivi.
 * Mostra una landing card-grid per scegliere il modulo (serramenti, fotovoltaico,
 * tetti...) e poi mostra l'editor del modulo selezionato (lazy).
 */
import React, { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Bath, FileText, Hammer, Loader2, RectangleVertical, ShoppingBag, Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildQuoteTemplatesModuleParams } from "@/lib/settingsQuoteTemplatesRoute";

// PERF: lazy-load editor pesanti (Serramenti ~150KB, Fotovoltaico ~120KB)
// per evitare di caricare il bundle nella route Settings prima del click sulla tab.
const SerramentiTemplateEditor = lazy(() =>
  import("@/components/serramenti/SerramentiTemplateEditor").then((m) => ({ default: m.SerramentiTemplateEditor })),
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

interface ModuloVendita {
  slug: string;
  nome: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  available: boolean;
  render: () => React.ReactNode;
}

const MODULI_VENDITA: ModuloVendita[] = [
  {
    slug: "serramenti",
    nome: "Serramenti",
    icon: RectangleVertical,
    description: "Template del PDF Preventivatore Serramenti: branding, recensioni, esigenze tipiche, USP, cronoprogramma.",
    available: true,
    render: () => (
      <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>}>
        <SerramentiTemplateEditor embedded />
      </Suspense>
    ),
  },
  {
    slug: "fotovoltaico",
    nome: "Fotovoltaico",
    icon: Sun,
    description: "Template del PDF Fotovoltaico (16 pagine): branding, presentazione impresa, recensioni, certificazioni, contatti.",
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
    description: "Template del PDF Preventivatore Ristrutturazione: branding, copertina, chi siamo, esigenze, USP, testimonianze, cronoprogramma, condizioni.",
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
    description: "Template del PDF Preventivatore Bagni: branding, copertina, chi siamo, esigenze, USP, testimonianze, cronoprogramma, condizioni.",
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
    icon: FileText,
    description: "In arrivo.",
    available: false,
    render: () => null,
  },
];

export function ModuliVenditaPanel({ initialModulo }: { initialModulo?: string }) {
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
  const active = activeSlug ? MODULI_VENDITA.find((m) => m.slug === activeSlug) : null;

  // Sincronizzo l'URL quando l'utente cambia modulo (così back/forward + share funzionano)
  const handleSelectModulo = (slug: string | null) => {
    setActiveSlug(slug);
    setSearchParams((prev) => buildQuoteTemplatesModuleParams(prev, slug), { replace: true });
  };

  // Header comune
  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
          <ShoppingBag className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">Template Moduli Vendita</h1>
          <p className="text-sm text-muted-foreground">
            {active
              ? <>Stai configurando il template del modulo <strong>{active.nome}</strong>.</>
              : "Scegli quale modulo vuoi configurare. Le impostazioni si applicano a tutti i preventivi futuri di quel modulo."}
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
          <ArrowLeft className="h-3.5 w-3.5" />
          Scegli altro modulo
        </Button>
      )}
    </div>
  );

  // Landing: grid di card selezionabili
  if (!active) {
    return (
      <div className="space-y-4">
        {header}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULI_VENDITA.map((m) => {
            const Icon = m.icon;
            const isDisabled = !m.available;
            return (
              <button
                key={m.slug}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && handleSelectModulo(m.slug)}
                className={
                  "text-left rounded-xl border-2 p-4 transition-all group focus:outline-none " +
                  (isDisabled
                    ? "bg-slate-50 border-slate-200 cursor-not-allowed opacity-60"
                    : "bg-white border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 hover:shadow-md focus:ring-2 focus:ring-orange-400 cursor-pointer")
                }
              >
                <div className="flex items-start gap-3">
                  <div className={
                    "h-11 w-11 rounded-lg flex items-center justify-center shrink-0 " +
                    (isDisabled ? "bg-slate-200" : "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-sm")
                  }>
                    <Icon className={isDisabled ? "h-5 w-5 text-slate-400" : "h-5 w-5 text-white"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-slate-900">{m.nome}</h3>
                      {isDisabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                          In arrivo
                        </span>
                      )}
                      {!isDisabled && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                          Disponibile
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-snug">{m.description}</p>
                  </div>
                </div>
                {!isDisabled && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                    <span className="text-slate-500">Configura logo, recensioni, USP…</span>
                    <span className="font-semibold text-orange-700 group-hover:translate-x-0.5 transition-transform">
                      Apri →
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-3 text-xs text-slate-600">
            💡 Ogni modulo ha un editor dedicato. Tutto quello che configuri qui (logo, recensioni, USP, cronoprogramma, ecc.) verrà applicato come <strong>default</strong> a ogni nuovo preventivo. Puoi sempre modificare i singoli valori dentro ogni preventivo.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Editor del modulo selezionato
  return (
    <div className="space-y-4">
      {header}
      <Card className="bg-orange-50/30 border-orange-200">
        <CardContent className="p-3 flex items-start gap-3">
          <active.icon className="h-5 w-5 text-orange-700 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm text-orange-900">{active.nome}</p>
            <p className="text-xs text-orange-800 mt-0.5">{active.description}</p>
          </div>
        </CardContent>
      </Card>
      <div>{active.render()}</div>
    </div>
  );
}
