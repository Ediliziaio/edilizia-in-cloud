import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fiscalCommand } from "@/lib/fatturazione/fiscalCommands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FiscalQueryState } from "./FiscalQueryState";

export function FiscalHistory({
  companyId,
  table,
  recordId,
}: {
  companyId: string;
  table: string;
  recordId: string;
}) {
  const q = useQuery({
    queryKey: ["fiscal-history", companyId, table, recordId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("fiscalita_storico" as never)
        .select("id,azione,attore,registrato_il,prima,dopo")
        .eq("company_id", companyId)
        .eq("tabella", table)
        .eq("record_id", recordId)
        .order("registrato_il", { ascending: false })
        .order("id")
        .limit(20)
        .abortSignal(signal);
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        azione: string;
        attore: string;
        registrato_il: string;
        prima: Record<string, unknown> | null;
        dopo: Record<string, unknown>;
      }>;
    },
  });
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary>Storico delle ultime 20 operazioni</summary>
      {q.isLoading || q.isError ? (
        <FiscalQueryState
          loading={q.isLoading}
          error={q.isError}
          onRetry={() => void q.refetch()}
        />
      ) : !q.data?.length ? (
        <p className="mt-2 text-muted-foreground">
          Nessuna operazione tracciata dal nuovo registro. Lo storico precedente
          non viene ricostruito.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {q.data.map((r) => (
            <li key={r.id}>
              <p>
                {new Date(r.registrato_il).toLocaleString("it-IT")} ·{" "}
                {r.azione === "INSERT" ? "Creazione" : "Aggiornamento"} ·{" "}
                {String(r.prima?.stato ?? "—")} → {String(r.dopo.stato ?? "—")}
              </p>
              <p className="break-words text-muted-foreground">
                {String(r.dopo.motivo ?? r.dopo.note ?? "")}
              </p>
              <p className="text-xs text-muted-foreground">
                Utente: {r.attore}
              </p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function FiscalPeriodControl({
  anno,
  mese,
  canManage,
}: {
  anno: number;
  mese: number;
  canManage: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const date = `${anno}-${String(mese).padStart(2, "0")}-01`;
  const qc = useQueryClient();
  const [reason, setReason] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["fiscal-period", companyId, date],
    enabled: !!companyId && canManage,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("fiscalita_periodi" as never)
        .select("stato,revisione,motivo,aggiornato_il")
        .eq("company_id", companyId!)
        .eq("mese", date)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        stato: "aperto" | "chiuso";
        revisione: number;
        motivo: string;
        aggiornato_il: string;
      } | null;
    },
  });
  if (!canManage || !companyId) return null;
  const closed = q.data?.stato === "chiuso";
  const completed =
    date <
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .slice(0, 7) +
      "-01";
  const change = async () => {
    setPending(true);
    setError("");
    try {
      const result = await fiscalCommand("fiscalita_transizione_periodo", {
        p_company: companyId,
        p_mese: date,
        p_revisione: q.data?.revisione ?? 0,
        p_stato: closed ? "aperto" : "chiuso",
        p_motivo: reason.trim(),
      });
      if (result.stato !== (closed ? "aperto" : "chiuso"))
        throw Error("Conferma non ricevuta");
      setReason("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fiscal-period", companyId, date] }),
        qc.invalidateQueries({ queryKey: ["fiscal-history", companyId] }),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Operazione non riuscita. Aggiorna e verifica lo stato.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Gestione del mese ·{" "}
        {q.isLoading
          ? "Verifica…"
          : q.isError
            ? "Stato non disponibile"
            : closed
              ? "Chiuso"
              : "Aperto"}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Chiusura amministrativa, non certificazione fiscale. Blocca rettifiche
          agli importi e alle date del mese: una rettifica tardiva richiede
          riapertura autorizzata, con motivo e storico. Occorrono registrazioni
          F24 verificate; non si chiude un mese ancora in corso.
        </p>
        {q.isLoading || q.isError ? (
          <FiscalQueryState
            loading={q.isLoading}
            error={q.isError}
            onRetry={() => void q.refetch()}
          />
        ) : (
          <>
            {q.data && (
              <p className="text-sm">
                Revisione {q.data.revisione}: {q.data.motivo}
              </p>
            )}
            <label className="block text-sm">
              Motivo e riferimento della verifica
              <Input
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Riferimento al controllo del consulente…"
              />
            </label>
            <Button
              variant="outline"
              disabled={
                pending || reason.trim().length < 5 || (!closed && !completed)
              }
              onClick={() => void change()}
            >
              {pending
                ? "Verifica in corso…"
                : closed
                  ? "Riapri mese con motivo"
                  : "Conferma chiusura mese"}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FiscalHistory
              companyId={companyId}
              table="fiscalita_periodi"
              recordId={date}
            />
          </>
        )}
      </div>
    </details>
  );
}
