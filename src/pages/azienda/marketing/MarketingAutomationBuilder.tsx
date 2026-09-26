import { FlowBuilderPage } from "@/components/flow-builder/FlowBuilderPage";
import { AvvisoSoloDaComputer } from "@/components/mobile/SoloDaComputer";
import { useIsMobile } from "@/hooks/use-mobile";

export default function MarketingAutomationBuilder() {
  const isMobile = useIsMobile();
  // Telefono: le automazioni si guardano dall'elenco; il builder (tela a nodi)
  // si usa da computer o tablet. Ci si arriva solo da un link salvato.
  if (isMobile) {
    return (
      <div className="p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <AvvisoSoloDaComputer
          titolo="Le automazioni si creano e si modificano da computer o tablet"
          azione={{ etichetta: "Torna ai flussi", to: "/azienda/automazioni" }}
        />
      </div>
    );
  }
  return <FlowBuilderPage />;
}
