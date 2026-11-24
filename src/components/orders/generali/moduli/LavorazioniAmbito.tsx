import { lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { PianoMezziCantiere } from "@/components/mezzi/PianoMezziCantiere";
import { CantiereLogistica } from "@/components/orders/CantiereLogistica";
import { LavoriExtraPopup } from "@/components/orders/LavoriExtraPopup";
import { IncarichiCantiere } from "@/components/sicurezza/IncarichiCantiere";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const OrderWorkPhases = lazy(() => import("@/components/orders/OrderWorkPhases").then(m => ({ default: m.OrderWorkPhases })));
const CronoprogrammaCommessa = lazy(() => import("@/components/orders/CronoprogrammaCommessa").then(m => ({ default: m.CronoprogrammaCommessa })));

function useDatiCantiere(orderId: string, companyId: string | undefined, abilitato = true) {
  return useQuery({
    queryKey: ["generale-dati-cantiere", companyId, orderId],
    enabled: !!companyId && abilitato,
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, created_at, quote_id, work_start_date, work_end_date, expected_date, description, work_description, client_name, indirizzo_lavori, work_address, vat_rate, customer:profiles!orders_customer_id_fkey(first_name,last_name,email,address)")
        .eq("company_id", companyId!).eq("id", orderId).abortSignal(signal).single();
      if (error) throw error;
      return data;
    },
  });
}

export function LavorazioniAmbito({ orderId, orderCode, importo, fase, figlia, onApriCronoprogramma }: {
  orderId: string;
  orderCode: string | null;
  importo?: number | null;
  fase?: string | null;
  figlia: boolean;
  onApriCronoprogramma: () => void;
}) {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const companyId = effectiveCompany?.id;
  const puoVedereExtra = figlia && permessi.canViewOrderAmounts;
  const { data: ordine } = useDatiCantiere(orderId, companyId, puoVedereExtra);

  return <>
    <OrderWorkPhases key={`${orderId}:${fase ?? ""}`} orderId={orderId} orderCode={orderCode} view="lavorazioni"
      logisticaIntegrata importoContratto={importo} faseIniziale={fase} onApriCronoprogramma={onApriCronoprogramma}
      organizationContent={companyId && permessi.canViewSicurezzaCantiere ? <ErrorBoundary>
        <IncarichiCantiere companyId={companyId} orderId={orderId} compact />
      </ErrorBoundary> : undefined}
      lavoriExtra={companyId && puoVedereExtra && ordine ? <LavoriExtraPopup orderId={orderId} companyId={companyId}
        className="h-9 border-transparent bg-transparent px-2.5 font-medium hover:bg-accent"
        context={{ currentNet: importo ?? undefined, vatRate: ordine.vat_rate ?? undefined,
          customerName: [ordine.customer?.first_name, ordine.customer?.last_name].filter(Boolean).join(" ") || ordine.client_name || undefined,
          customerEmail: ordine.customer?.email ?? undefined, customerAddress: ordine.customer?.address ?? undefined,
          siteAddress: ordine.indirizzo_lavori || ordine.work_address || undefined, orderCode: orderCode ?? undefined,
          companyName: effectiveCompany?.name }} /> : undefined} />
    <div id="section-mezzi" className="scroll-mt-24 space-y-3">
      <ErrorBoundary><CantiereLogistica orderId={orderId} showSiteEquipment={false} /></ErrorBoundary>
      <ErrorBoundary><PianoMezziCantiere orderId={orderId} conViaggi /></ErrorBoundary>
    </div>
  </>;
}

export function CronoprogrammaAmbito({ orderId, onApriLavorazioni }: { orderId: string; onApriLavorazioni: () => void }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const dati = useDatiCantiere(orderId, effectiveCompany?.id);
  if (dati.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!dati.data) return <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
    {t("Cronoprogramma della commessa non disponibile.")}
    <Button size="sm" variant="outline" onClick={() => void dati.refetch()}>{t("Riprova")}</Button>
  </div>;
  return <ErrorBoundary><CronoprogrammaCommessa orderId={orderId} order={dati.data} onOpenLavorazioni={onApriLavorazioni} /></ErrorBoundary>;
}
