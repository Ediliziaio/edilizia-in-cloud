import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leggiFlussoAzienda } from "@/lib/flussoLavoro";
import { applyPlaybookToOrder, getOrderPlaybook } from "@/lib/orderPlaybook";
import {
  invalidateOfficeWorkspace,
  OFFICE_STAGES,
  officeStage,
} from "@/lib/orders/officeWorkspace";
import { campoWorkDay } from "@/lib/campo/workDay";

export function OfficeTemplateApplyDialog({
  open,
  onOpenChange,
  companyId,
  orderId,
  vertical,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  companyId: string;
  orderId: string;
  vertical?: string | null;
}) {
  const qc = useQueryClient();
  const [start, setStart] = useState(campoWorkDay);
  const preview = useQuery({
    queryKey: ["office-template-preview", companyId, orderId, vertical],
    enabled: open,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [configured, existing, phases, order] = await Promise.all([
        leggiFlussoAzienda({ companyId, ambito: "commessa", vertical }),
        supabase
          .from("tasks")
          .select("id,title,status")
          .eq("company_id", companyId)
          .eq("order_id", orderId),
        supabase
          .from("order_work_phases")
          .select("name,status")
          .eq("order_id", orderId),
        supabase
          .from("orders")
          .select("assigned_to")
          .eq("company_id", companyId)
          .eq("id", orderId)
          .maybeSingle(),
      ]);
      if (existing.error) throw existing.error;
      if (phases.error) throw phases.error;
      if (order.error) throw order.error;
      if (!order.data) throw Error("Commessa non disponibile.");
      return {
        steps: configured.length
          ? configured
          : getOrderPlaybook(vertical).steps,
        configured: !!configured.length,
        existing: new Set(
          (existing.data ?? []).map((r) => r.title.trim().toLowerCase()),
        ),
        completed: new Set(
          (existing.data ?? [])
            .filter((r) => r.status === "completata")
            .map((r) => r.title.trim().toLowerCase()),
        ),
        openPhases: new Set(
          (phases.data ?? [])
            .filter((r) => r.status !== "completata")
            .map((r) => r.name.trim().toLowerCase()),
        ),
        assignedTo: order.data.assigned_to,
      };
    },
  });
  const apply = useMutation({
    mutationFn: async () => {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
        !Number.isFinite(new Date(`${start}T12:00:00`).getTime())
      )
        throw Error("Scegli una data valida.");
      if (!preview.data || preview.isFetching || preview.isError)
        throw Error("Ricarica l’anteprima prima di applicare.");
      return applyPlaybookToOrder({
        companyId,
        orderId,
        vertical,
        baseDate: new Date(`${start}T12:00:00`),
        assignedTo: preview.data.assignedTo,
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.created
          ? `${r.created} attività create nella commessa`
          : "Le attività del modello sono già presenti",
      );
      invalidateOfficeWorkspace(qc, orderId);
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Modello non applicato");
      invalidateOfficeWorkspace(qc, orderId);
      void preview.refetch();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!apply.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Applica il modello a questa commessa</DialogTitle>
          <DialogDescription>
            Controlla attività e date prima di confermare. La configurazione
            aziendale non viene modificata.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          Data di partenza
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={apply.isPending}
          />
        </label>
        {preview.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Anteprima non disponibile.{" "}
            <button
              onClick={() => void preview.refetch()}
              className="underline"
            >
              Riprova
            </button>
          </p>
        ) : preview.isPending || preview.isFetching ? (
          <p role="status">Carico il modello…</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {preview.data?.configured
                ? "Modello aziendale configurato"
                : "Modello standard di partenza"}{" "}
              · comprende attività d’ufficio e operative. Le corrispondenze già
              presenti sono controllate per titolo: verifica eventuali omonimie.
            </p>
            <ol className="divide-y rounded-xl border">
              {preview.data?.steps.map((step, i) => {
                const exists = preview.data.existing.has(
                  step.titolo.trim().toLowerCase(),
                );
                const previous = preview.data.steps.find(
                  (s) => s.id === step.dipende_da_id,
                );
                const waiting = step.dipende_da_id
                  ? !previous ||
                    !preview.data.completed.has(
                      previous.titolo.trim().toLowerCase(),
                    )
                  : !!step.dopo_fase_lavorazione &&
                    preview.data.openPhases.has(
                      step.dopo_fase_lavorazione.trim().toLowerCase(),
                    );
                const date = new Date(`${start}T12:00:00`);
                return (
                  <li key={step.id ?? i} className="px-3 py-2.5">
                    <p className="text-sm font-medium">
                      {i + 1}. {step.titolo}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {exists
                        ? "Già presente · non viene duplicata"
                        : waiting
                          ? "Data definita allo sblocco della dipendenza"
                          : Number.isFinite(date.getTime())
                            ? `Scadenza proposta: ${format(addDays(date, step.giorni_offset), "dd/MM/yyyy")}`
                            : "Data da definire"}{" "}
                      ·{" "}
                      {step.activity_scope === "ufficio"
                        ? OFFICE_STAGES.find(
                            ([key]) => key === officeStage(step.office_stage),
                          )?.[1]
                        : "Attività operativa"}
                    </p>
                    {step.dopo_fase_lavorazione && (
                      <p className="text-xs text-orange-700">
                        Attende: {step.dopo_fase_lavorazione}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              Responsabili e dipendenze seguono il modello. Le attività senza
              assegnazione esplicita vanno al responsabile della commessa o a
              chi applica il modello. Non vengono inviati ordini ai fornitori,
              email o fatture.
            </p>
          </>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={apply.isPending}
          >
            Annulla
          </Button>
          <Button
            disabled={
              apply.isPending ||
              preview.isPending ||
              preview.isFetching ||
              preview.isError ||
              !start
            }
            onClick={() => apply.mutate()}
          >
            {apply.isPending ? "Applico…" : "Conferma e crea le attività"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
