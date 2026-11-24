import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet, FileText, Loader2, ShoppingBag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";
import {
  buildQuoteTemplatesTabParams,
  normalizeQuoteTemplatesParams,
  resolveQuoteTemplatesTopTab,
  type QuoteTemplatesTopTab,
} from "@/lib/settingsQuoteTemplatesRoute";
import { ModuliVenditaPanel } from "./ModuliVenditaPanel";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ComputoModelloPanel = lazy(() => import("@/components/computo/ComputoModelloPanel"));
const VariationTemplatesPanel = lazy(() => import("./VariationTemplatesPanel").then(m => ({ default: m.VariationTemplatesPanel })));

function useSchedeModelliPreventivi(unificato: boolean) {
  const [params, setParams] = useSearchParams();
  const modulo = params.get("modulo") ?? undefined;
  const richiesta = resolveQuoteTemplatesTopTab(params.get("tab"), modulo);
  const scheda = unificato && richiesta === "documenti" ? "computo" : richiesta;

  useEffect(() => {
    const normalized = unificato && richiesta === "documenti"
      ? buildQuoteTemplatesTabParams(params, "computo")
      : normalizeQuoteTemplatesParams(params);
    if (normalized) setParams(normalized, { replace: true });
  }, [params, setParams, unificato, richiesta]);

  const cambiaScheda = (value: string) => {
    if (confermaNavigazioneImpostazioni()) {
      setParams(prev => buildQuoteTemplatesTabParams(prev, value as QuoteTemplatesTopTab), { replace: true });
    }
  };
  return { scheda, modulo, cambiaScheda };
}

function CaricamentoModelli() {
  const t = useT();
  return <p role="status" className="py-8 text-sm text-muted-foreground">{t("Caricamento dei modelli…")}</p>;
}

export function SchedeModelliPreventivi({ companyId, puoModificare, unificato, caricamentoLibreria, children }: {
  companyId?: string;
  puoModificare: boolean;
  unificato: boolean;
  caricamentoLibreria?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const { scheda, cambiaScheda, modulo } = useSchedeModelliPreventivi(unificato);
  if (caricamentoLibreria && scheda === "documenti") {
    return <div role="status" aria-label={t("Caricamento dei modelli")} className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>;
  }
  return (
    <Tabs value={scheda} onValueChange={cambiaScheda} className="space-y-4">
      <TabsList className={`h-auto max-w-full flex-wrap bg-slate-100 max-sm:grid max-sm:w-full max-sm:gap-1 max-sm:[&>button]:min-h-11 max-sm:[&>button]:whitespace-normal max-sm:[&>button]:px-1.5 max-sm:[&>button]:text-xs max-sm:[&_svg]:hidden ${unificato ? "max-sm:grid-cols-3" : "max-sm:grid-cols-2"}`}>
        {!unificato && <TabsTrigger value="documenti" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />{t("Libreria modelli")}
        </TabsTrigger>}
        <TabsTrigger value="computo" className="gap-1.5">
          <FileSpreadsheet className="h-3.5 w-3.5" />{unificato ? t("Preventivo / computo metrico") : t("Builder preventivo")}
        </TabsTrigger>
        <TabsTrigger value="moduli-vendita" className="gap-1.5">
          <ShoppingBag className="h-3.5 w-3.5" />{t("Moduli")}<span className="max-sm:hidden"> {t("(serramenti, fotovoltaico…)")}</span>
        </TabsTrigger>
        <TabsTrigger value="varianti" className="gap-1.5">{t("Varianti e lavori extra")}</TabsTrigger>
      </TabsList>

      <TabsContent value="computo">
        <Suspense fallback={<CaricamentoModelli />}><ComputoModelloPanel key={companyId} canEdit={puoModificare} /></Suspense>
      </TabsContent>
      <TabsContent value="varianti">
        <Suspense fallback={<CaricamentoModelli />}><VariationTemplatesPanel key={companyId} companyId={companyId} canEdit={puoModificare} /></Suspense>
      </TabsContent>
      <TabsContent value="moduli-vendita" className="space-y-4">
        <ModuliVenditaPanel initialModulo={modulo} />
      </TabsContent>
      {children}
    </Tabs>
  );
}

export default function ModelliPreventivi() {
  const { role, effectiveCompany } = useAuth();
  const { canEditSettingsPricing } = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || canEditSettingsPricing;
  return <SchedeModelliPreventivi companyId={effectiveCompany?.id} puoModificare={puoModificare} unificato />;
}
