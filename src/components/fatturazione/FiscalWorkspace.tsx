import { Suspense, type ReactNode } from "react";
// Come in App.tsx: dopo una pubblicazione i pezzi vecchi non ci sono più, e senza
// il nuovo tentativo la sezione finiva su «Errore nel caricamento fiscale».
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { useSearchParams, useLocation, Navigate, Link } from "react-router-dom";
import { ReceiptText, Calculator, ShieldCheck, Archive } from "lucide-react";
import { RequireCompanyPermission } from "@/components/auth/RequireCompanyPermission";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { FiscalPeriodFilters } from "./FiscalPeriodFilters";
import {
  fiscalSection,
  fiscalHref,
  type FiscalSection,
} from "@/lib/fatturazione/fiscalWorkspace";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { useContabilitaGeneraleAttiva } from "@/components/contabilita/ContabilitaInCasa";
const Registro = lazy(() => import("@/pages/azienda/fatturazione/RegistroIVA"));
const Contabilita = lazy(() => import("@/pages/azienda/ContabilitaFiscale"));
const Ritenute = lazy(() => import("@/pages/azienda/RitenuteGaranzia"));
const ArchivioFiscale = lazy(
  () => import("@/pages/azienda/ArchivioSostitutivo"),
);
const sections = [
  ["iva", "Registro IVA", ReceiptText],
  ["contabilita", "Liquidazione IVA e F24", Calculator],
  ["ritenute", "Ritenute di garanzia", ShieldCheck],
  ["archivio", "Archivio fiscale", Archive],
] as const;
function Access({
  section,
  children,
}: {
  section: FiscalSection;
  children: ReactNode;
}) {
  const { role, userRoles } = useAuth();
  const [params] = useSearchParams();
  const delegated =
    section === "iva" &&
    params.get("commercialistaMode") === "1" &&
    (role === "accountant" || userRoles?.includes("accountant"));
  const permission =
    section === "iva"
      ? "canViewBilling"
      : section === "ritenute"
        ? "canViewOrders"
        : "canViewPrimaNota";
  const feature =
    section === "iva"
      ? "documenti"
      : section === "ritenute"
        ? "ritenute_garanzia"
        : section === "archivio"
          ? "archivio_sostitutivo"
          : "contabilita_fiscale";
  // Il Registro IVA legge native e importate (fatture_vendite_iva): vale per
  // qualsiasi modo di fatturare.
  const content = <FeatureRoute featureKey={feature}>{children}</FeatureRoute>;
  return delegated ? (
    content
  ) : (
    <RequireCompanyPermission permission={permission}>
      {content}
    </RequireCompanyPermission>
  );
}
export function FiscalLegacyRedirect({
  section,
  fallback,
}: {
  section: FiscalSection;
  fallback?: ReactNode;
}) {
  const location = useLocation();
  const redirect = (
    <Navigate to={fiscalHref(section, location.search)} replace />
  );
  return fallback ? (
    <LegacyHubEligibility fallback={fallback}>{redirect}</LegacyHubEligibility>
  ) : (
    redirect
  );
}
function LegacyHubEligibility({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  // Original route guards still authorize this content. Do not add the native
  // billing entitlement to standalone accounting/guarantee/archive permissions.
  const permissions = usePermissions();
  const documents = useFeatureAccess("documenti");
  if (permissions.isLoading || documents.isLoading)
    return <p role="status">{t("Verifica accesso al workspace…")}</p>;
  if (
    !permissions.canViewBilling ||
    (!documents.isEnabled && !documents.isPreview)
  )
    return <>{fallback}</>;
  return <>{children}</>;
}
export function FiscalStandaloneWorkspace({
  section,
}: {
  section: FiscalSection;
}) {
  return <FiscalWorkspace defaultSection={section} />;
}
export default function FiscalWorkspace({
  defaultSection = "iva",
}: { defaultSection?: FiscalSection } = {}) {
  const t = useT();
  const { params, set, anno, mese, tipo, trimestre } = useFiscalPeriod();
  const { attiva: generaleAttiva } = useContabilitaGeneraleAttiva();
  // La Contabilità generale sta nel menu Contabilità (10/11/2026): il vecchio indirizzo porta lì.
  if (params.get("sezione") === "generale") {
    const resto = new URLSearchParams(params);
    resto.delete("tab");
    resto.delete("sezione");
    const q = resto.toString();
    return <Navigate to={`/azienda/contabilita-generale${q ? `?${q}` : ""}`} replace />;
  }
  // Con la contabilità generale in casa (24/11/2026) l'IVA ha un posto solo: registri, liquidazione, LIPE,
  // F24 e ritenute d'acconto stanno in Contabilità generale → IVA. Prima c'erano due copie degli stessi
  // strumenti, e chi tiene la contabilità non sapeva quale valesse. Qui restano ritenute di garanzia e
  // archivio; i vecchi indirizzi dell'IVA portano là, con lo stesso periodo.
  if (generaleAttiva === undefined && params.get("sezione") !== "ritenute" && params.get("sezione") !== "archivio") {
    return <p role="status" className="p-6 text-sm text-muted-foreground">{t("Caricamento…")}</p>;
  }
  const richiesta = params.has("sezione") ? fiscalSection(params) : generaleAttiva ? "ritenute" : defaultSection;
  if (generaleAttiva && (richiesta === "iva" || richiesta === "contabilita")) {
    const resto = new URLSearchParams(params);
    const vistaVecchia = resto.get("vista");
    for (const k of ["tab", "sezione", "vista"]) resto.delete(k);
    resto.set("vista", "iva");
    if (richiesta === "iva") resto.set("iva", "registri");
    else { resto.set("iva", "liquidazione"); resto.set("iva_vista", vistaVecchia || "iva"); }
    return <Navigate to={`/azienda/contabilita-generale?${resto.toString()}`} replace />;
  }
  const section = richiesta;
  const sezioniVisibili = generaleAttiva ? sections.filter(([k]) => k === "ritenute" || k === "archivio") : sections;
  // La liquidazione elenca da sola i periodi dell'anno: mese e trimestre lì confonderebbero.
  const vista = params.get("vista");
  const conPeriodo = section === "iva" || (section === "contabilita" && (vista === "f24" || vista === "ritenute_bancarie"));
  return (
    <section className="space-y-4" aria-label={t("Area fiscale")}>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-5 max-md:gap-2 max-md:p-3">
        <div>
          <h1 className="text-lg font-bold text-slate-950 max-md:hidden">{t("Fiscalità")}</h1>
          <p className="mt-1 text-sm text-slate-500 max-md:hidden">
            {t("Documenti, prospetti e verifiche della tua azienda. Nessun versamento automatico.")}
          </p>
        </div>
        <FiscalPeriodFilters
          anno={anno}
          mese={mese}
          trimestre={trimestre}
          tipo={tipo}
          showPeriod={conPeriodo}
          onChange={set}
        />
      </div>
      <div
        role="tablist"
        aria-label={t("Sezioni fiscali")}
        className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1.5"
      >
        {sezioniVisibili.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={section === key}
            tabIndex={section === key ? 0 : -1}
            aria-controls={`fiscal-panel-${key}`}
            id={`fiscal-tab-${key}`}
            onClick={() => set({ tab: "fiscalita", sezione: key })}
            onKeyDown={(event) => {
              const index = sezioniVisibili.findIndex(([value]) => value === key);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % sezioniVisibili.length
                  : event.key === "ArrowLeft"
                    ? (index + sezioniVisibili.length - 1) % sezioniVisibili.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? sezioniVisibili.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              set({ tab: "fiscalita", sezione: sezioniVisibili[next][0] });
              const tabs =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              tabs?.[next]?.focus();
            }}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${section === key ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <Icon className="h-4 w-4" />
            {t(label)}
          </button>
        ))}
        {generaleAttiva ? (
          <Link to="/azienda/contabilita-generale?vista=iva" className="ml-auto flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
            <Calculator className="h-4 w-4" />{t("IVA, liquidazioni e F24 → Contabilità generale")}
          </Link>
        ) : null}
      </div>
      <div
        role="tabpanel"
        id={`fiscal-panel-${section}`}
        aria-labelledby={`fiscal-tab-${section}`}
      >
        <Access section={section}>
          <ErrorBoundary key={section} title={t("Errore nel caricamento fiscale")}>
            <Suspense
              fallback={
                <p role="status" className="p-6">
                  {t("Caricamento sezione…")}
                </p>
              }
            >
              {section === "iva" ? (
                <Registro embedded />
              ) : section === "contabilita" ? (
                <Contabilita embedded />
              ) : section === "ritenute" ? (
                <Ritenute embedded />
              ) : (
                <ArchivioFiscale embedded />
              )}
            </Suspense>
          </ErrorBoundary>
        </Access>
      </div>
    </section>
  );
}
