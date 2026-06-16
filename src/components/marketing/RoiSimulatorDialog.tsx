/**
 * RoiSimulatorDialog — lancia il Simulatore ROI da un deal (opportunità).
 *
 * Pre-compila `client_name` dal nome opportunità/contatto e, al salvataggio,
 * lega la simulazione a quel deal (opportunity_id + contact_id). Riusa il
 * componente core RoiSimulator e il prezzo del piano reale (useResellerPlans).
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoiSimulator } from "@/components/marketing/RoiSimulator";
import { RoiSendEmailDialog } from "@/components/marketing/RoiSendEmailDialog";
import { generateRoiPdf } from "@/lib/roiSimulatorPdf";
import { DEFAULT_INPUTS, type RoiInputs, type RoiResults } from "@/lib/roiSimulator";
import { useResellerPlans } from "@/hooks/useResellerPlans";
import { useSaveRoiSimulation, useLatestRoiSimulation } from "@/hooks/useRoiSimulations";
import { Calculator } from "lucide-react";
import { toast } from "sonner";

interface RoiSimulatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  contactId?: string | null;
  /** Nome cliente da precompilare (es. nome contatto o opportunità). */
  defaultClientName?: string;
  /** Email del contatto, per precompilare il destinatario dell'invio (round 2). */
  defaultContactEmail?: string | null;
}

export function RoiSimulatorDialog({
  open,
  onOpenChange,
  opportunityId,
  contactId,
  defaultClientName,
  defaultContactEmail,
}: RoiSimulatorDialogProps) {
  const { data: plans = [] } = useResellerPlans();
  const defaultMonthly = useMemo(() => {
    const prices = plans.map((p) => p.price_monthly).filter((n) => Number.isFinite(n) && n > 0);
    return prices.length ? Math.min(...prices) : DEFAULT_INPUTS.abbonamentoMensile;
  }, [plans]);

  // Ultima simulazione salvata sul deal → se esiste, riparte da quei valori.
  const { data: latest } = useLatestRoiSimulation(open ? opportunityId : null);

  const [inputs, setInputs] = useState<RoiInputs>(() => structuredClone(DEFAULT_INPUTS));
  const [clientName, setClientName] = useState(defaultClientName ?? "");
  const [referente, setReferente] = useState("");
  // Hydration una-tantum all'apertura: ultima sim → altrimenti default + piano reale.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (open && hydratedFor !== opportunityId) {
    if (latest) {
      setInputs(latest.inputs ?? structuredClone(DEFAULT_INPUTS));
      setClientName(latest.client_name || defaultClientName || "");
    } else {
      setInputs({ ...structuredClone(DEFAULT_INPUTS), abbonamentoMensile: defaultMonthly });
      setClientName(defaultClientName ?? "");
    }
    setHydratedFor(opportunityId);
  }
  if (!open && hydratedFor !== null) setHydratedFor(null);

  const saveSim = useSaveRoiSimulation();

  // Round 2 — invio email: payload del riepilogo da spedire al cliente.
  const [emailPayload, setEmailPayload] = useState<{
    inputs: RoiInputs;
    results: RoiResults;
    clientName: string;
    referente: string;
  } | null>(null);

  const handleSave = async (payload: {
    inputs: RoiInputs;
    results: RoiResults;
    clientName: string;
  }) => {
    try {
      await saveSim.mutateAsync({
        clientName: payload.clientName,
        inputs: payload.inputs,
        results: payload.results,
        contactId: contactId ?? null,
        opportunityId,
      });
      toast.success("Simulazione salvata sul deal");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Simulatore ROI
          </DialogTitle>
          <DialogDescription>
            Mostra al cliente quanto gli costa non cambiare. La simulazione viene salvata su questo deal.
          </DialogDescription>
        </DialogHeader>

        <RoiSimulator
          value={inputs}
          onChange={setInputs}
          plans={plans}
          clientName={clientName}
          onClientNameChange={setClientName}
          referente={referente}
          onReferenteChange={setReferente}
          onSave={handleSave}
          saving={saveSim.isPending}
          onExportPdf={({ inputs, results, clientName, referente }) =>
            generateRoiPdf(inputs, results, clientName, { referente })
          }
          onSendEmail={(payload) => setEmailPayload(payload)}
        />

        {emailPayload && (
          <RoiSendEmailDialog
            open={!!emailPayload}
            onOpenChange={(v) => !v && setEmailPayload(null)}
            inputs={emailPayload.inputs}
            results={emailPayload.results}
            clientName={emailPayload.clientName}
            referente={emailPayload.referente}
            defaultEmail={defaultContactEmail ?? null}
            metadata={{ opportunity_id: opportunityId, contact_id: contactId ?? null }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RoiSimulatorDialog;
