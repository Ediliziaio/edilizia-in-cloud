import { lazy, Suspense, type ReactNode } from "react";
import { useSearchParams, useLocation, Navigate } from "react-router-dom";
import { ReceiptText, Calculator, ShieldCheck, Archive } from "lucide-react";
import { RequireCompanyPermission } from "@/components/auth/RequireCompanyPermission";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { BillingModeGuard } from "@/components/billing/BillingModeGuard";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { FiscalPeriodFilters } from "./FiscalPeriodFilters";
import {
  fiscalSection,
  fiscalHref,
  type FiscalSection,
} from "@/lib/fatturazione/fiscalWorkspace";
const Registro = lazy(() => import("@/pages/azienda/fatturazione/RegistroIVA"));
const Contabilita = lazy(() => import("@/pages/azienda/ContabilitaFiscale"));
const Ritenute = lazy(() => import("@/pages/azienda/RitenuteGaranzia"));
const ArchivioFiscale = lazy(
  () => import("@/pages/azienda/ArchivioSostitutivo"),
);
const sections = [
  ["iva", "Registro IVA", ReceiptText],
  ["contabilita", "Contabilità fiscale", Calculator],
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
  const content = (
    <FeatureRoute featureKey={feature}>
      {section === "iva" ? (
        <BillingModeGuard requiredMode="native">{children}</BillingModeGuard>
      ) : (
        children
      )}
    </FeatureRoute>
  );
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
  // Original route guards still authorize this content. Do not add the native
  // billing entitlement to standalone accounting/guarantee/archive permissions.
  const permissions = usePermissions();
  const billing = useBillingMode();
  const documents = useFeatureAccess("documenti");
  if (permissions.isLoading || billing.isLoading || documents.isLoading)
    return <p role="status">Verifica accesso al workspace…</p>;
  if (
    !permissions.canViewBilling ||
    billing.mode !== "native" ||
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
  const { params, set, anno, mese, tipo, trimestre } = useFiscalPeriod();
  const section = params.has("sezione")
    ? fiscalSection(params)
    : defaultSection;
  return (
    <section className="space-y-4" aria-label="Area fiscale">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-5">
        <div>
          <h1 className="text-xl font-bold text-slate-950">Fiscalità</h1>
          <p className="mt-1 text-sm text-slate-500">
            Documenti, prospetti e verifiche della tua azienda. Nessun
            versamento automatico.
          </p>
        </div>
        <FiscalPeriodFilters
          anno={anno}
          mese={mese}
          trimestre={trimestre}
          tipo={tipo}
          showPeriod={["iva", "contabilita"].includes(section)}
          onChange={set}
        />
      </div>
      <div
        role="tablist"
        aria-label="Sezioni fiscali"
        className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1.5"
      >
        {sections.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={section === key}
            tabIndex={section === key ? 0 : -1}
            aria-controls={`fiscal-panel-${key}`}
            id={`fiscal-tab-${key}`}
            onClick={() => set({ tab: "fiscalita", sezione: key })}
            onKeyDown={(event) => {
              const index = sections.findIndex(([value]) => value === key);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % sections.length
                  : event.key === "ArrowLeft"
                    ? (index + sections.length - 1) % sections.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? sections.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              set({ tab: "fiscalita", sezione: sections[next][0] });
              const tabs =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              tabs?.[next]?.focus();
            }}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${section === key ? "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`fiscal-panel-${section}`}
        aria-labelledby={`fiscal-tab-${section}`}
      >
        <Access section={section}>
          <ErrorBoundary key={section} title="Errore nel caricamento fiscale">
            <Suspense
              fallback={
                <p role="status" className="p-6">
                  Caricamento sezione…
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
