import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fiscalCommand } from "@/lib/fatturazione/fiscalCommands";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FiscalQueryState } from "./FiscalQueryState";
import { FiscalHistory } from "./FiscalPeriodControl";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";

export function FiscalReleaseDialog({
  companyId,
  id,
  onClose,
  onReleased,
}: {
  companyId: string;
  id: string;
  onClose: () => void;
  onReleased?: () => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [date, setDate] = useState(today),
    [reference, setReference] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["fiscal-release", companyId, id],
    queryFn: async () => {
      const data = await fiscalCommand("fiscalita_svincolo_anteprima", {
        p_company: companyId,
        p_id: id,
      });
      if (
        typeof data.versione !== "string" ||
        !data.registrazione ||
        typeof data.registrazione !== "object"
      )
        throw Error("Anteprima non disponibile");
      return {
        versione: data.versione,
        row: data.registrazione as {
          stato: string;
          importo: number;
          data_svincolo_effettiva: string | null;
        },
      };
    },
  });
  const confirm = async () => {
    if (!q.data) return;
    setPending(true);
    setError("");
    try {
      const result = await fiscalCommand("fiscalita_svincola", {
        p_company: companyId,
        p_id: id,
        p_versione: q.data.versione,
        p_data: date,
        p_riferimento: reference.trim(),
      });
      if (!result.registrazione || result.incasso_registrato !== false)
        throw Error("Conferma di svincolo non valida");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ritenute-garanzia"] }),
        qc.invalidateQueries({ queryKey: ["fiscal-history", companyId] }),
        qc.invalidateQueries({ queryKey: ["fiscal-release", companyId, id] }),
      ]);
      await onReleased?.();
      setReference("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Conferma non ricevuta: aggiorna la verifica prima di riprovare.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Svincolo documentato</DialogTitle>
          <DialogDescription>
            Non registra un incasso, un pagamento o una movimentazione bancaria.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading || q.isError ? (
          <FiscalQueryState
            loading={q.isLoading}
            error={q.isError}
            onRetry={() => void q.refetch()}
          />
        ) : (
          q.data && (
            <div className="space-y-4">
              <p className="font-medium">
                {formatCurrency(Number(q.data.row.importo))} ·{" "}
                {q.data.row.stato}
              </p>
              {q.data.row.stato === "trattenuta" ? (
                <>
                  <label className="block text-sm">
                    Data del verbale di svincolo
                    <Input
                      disabled={pending}
                      type="date"
                      value={date}
                      max={today}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    Riferimento al documento verificato
                    <Input
                      disabled={pending}
                      value={reference}
                      maxLength={2000}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Verbale / attestazione e relativo riferimento…"
                    />
                  </label>
                  <Button
                    disabled={
                      pending ||
                      !date ||
                      date > today ||
                      reference.trim().length < 5
                    }
                    onClick={() => void confirm()}
                  >
                    {pending
                      ? "Conferma in corso…"
                      : "Conferma svincolo documentato"}
                  </Button>
                </>
              ) : (
                <p className="text-sm">
                  Data di svincolo:{" "}
                  {fiscalDate(
                    q.data.row.data_svincolo_effettiva,
                    "Non disponibile",
                  )}
                  . Eventuali rettifiche richiedono una verifica dedicata.
                </p>
              )}
              {error && (
                <div
                  role="alert"
                  className="space-y-2 text-sm text-destructive"
                >
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => void q.refetch()}
                  >
                    Ricarica verifica
                  </Button>
                </div>
              )}
              <FiscalHistory
                companyId={companyId}
                table="ritenute_garanzia"
                recordId={id}
              />
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
