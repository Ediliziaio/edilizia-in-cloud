import { FlowBuilderPage } from "@/components/flow-builder/FlowBuilderPage";
import { AvvisoSoloDaComputer } from "@/components/mobile/SoloDaComputer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsAdminMarketing } from "@/hooks/useMarketingRoutePrefix";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function MarketingAutomationBuilder() {
  const t = useT();
  const isMobile = useIsMobile();
  // Dall'admin l'elenco sta in /admin/marketing/automazioni: prima si finiva
  // nell'area azienda (/azienda/automazioni) perdendo il contesto piattaforma.
  const isAdmin = useIsAdminMarketing();
  const elencoFlussi = isAdmin ? "/admin/marketing/automazioni" : "/azienda/automazioni";
  // Telefono: le automazioni si guardano dall'elenco; il builder (tela a nodi)
  // si usa da computer o tablet. Ci si arriva solo da un link salvato.
  if (isMobile) {
    return (
      <div className="p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <AvvisoSoloDaComputer
          titolo={t("Le automazioni si creano e si modificano da computer o tablet")}
          azione={{ etichetta: "Torna ai flussi", to: elencoFlussi }}
        />
      </div>
    );
  }
  return <FlowBuilderPage />;
}
