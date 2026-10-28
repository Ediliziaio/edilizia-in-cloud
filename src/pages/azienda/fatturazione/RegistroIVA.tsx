import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiscalSourceViewer } from "@/components/fatturazione/FiscalSourceViewer";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  fiscalRows,
  fiscalTotals,
  fiscalDocumentIssues,
  SALES_TYPES,
  type FiscalDocument,
} from "@/lib/fatturazione/fiscalWorkspace";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { FiscalLegacyRedirect } from "@/components/fatturazione/FiscalWorkspace";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import {
  FiscalSectionHeader,
  FiscalMetric,
} from "@/components/fatturazione/FiscalSectionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLiquidazioneIVA } from "@/hooks/useLiquidazioneIVA";
import { LiquidazioneIVA } from "@/components/contabilita/LiquidazioneIVA";
import { fiscalDate, fiscalVatGroups } from "@/lib/fatturazione/fiscalInsights";

export default function RegistroIVA({
  embedded = false,
}: { embedded?: boolean } = {}) {
  return embedded ? (
    <RegistroContent />
  ) : (
    <FiscalLegacyRedirect section="iva" />
  );
}
function RegistroContent() {
  const company = useEffectiveCompanyId(),
    p = useFiscalPeriod();
  const search = p.params.get("q_iva") ?? "";
  const [page, setPage] = useState(0);
  const side =
    p.params.get("registro") === "tutti"
      ? "tutti"
      : p.params.get("registro") === "acquisti"
        ? "acquisti"
        : "vendite";
  const onlyIssues = p.params.get("filtro_iva") === "verificare";
  const selectedGroup = p.params.get("gruppo_iva") ?? "";
  const sales = useQuery({
    queryKey: ["fiscal-sales", company, p.dal, p.al],
    enabled: !!company,
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("fatture_vendite_iva" as never)
          .select(
            "id,tipo,numero,data_emissione,cliente_snapshot,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,stato,esigibilita_iva",
          )
          .eq("company_id", company!)
          .is("deleted_at", null)
          .gte("data_emissione", p.dal)
          .lte("data_emissione", p.al)
          .in("tipo", SALES_TYPES)
          .not("stato", "in", '("bozza","annullata")')
          .order("data_emissione")
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as FiscalDocument[],
  });
  const purchases = useQuery({
    queryKey: ["fiscal-purchases", company, p.dal, p.al],
    enabled: !!company,
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("fatture_ricevute_periodo_iva" as never)
          .select(
            "id,numero_fattura,data_fattura,data_ricezione_sdi,data_detrazione,tipo_documento,cedente_ragione_sociale,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,aliquota_reverse_charge",
          )
          .eq("company_id", company!)
          .gte("data_detrazione", p.dal)
          .lte("data_detrazione", p.al)
          .in("stato", ["non_letta", "letta", "contabilizzata"])
          .order("data_detrazione")
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as FiscalDocument[],
  });
  const rows = useMemo(
    () => fiscalRows(sales.data || [], purchases.data || []),
    [sales.data, purchases.data],
  );
  const issues = fiscalDocumentIssues(rows);
  const matching = rows.filter(
    (r) =>
      (side === "tutti" || r.side === side) &&
      (!onlyIssues || r.issues.length > 0) &&
      `${r.number} ${r.counterparty} ${r.nature}`
        .toLocaleLowerCase("it")
        .includes(search.toLocaleLowerCase("it")),
  );
  const groups = fiscalVatGroups(matching);
  const filtered = selectedGroup
    ? matching.filter(
        (row) =>
          JSON.stringify([row.side, row.rate, row.nature, row.exigibility]) ===
          selectedGroup,
      )
    : matching;
  const totals = fiscalTotals(filtered),
    documentedRows = filtered.filter((row) => !row.synthetic).length,
    projectionRows = filtered.length - documentedRows,
    pages = Math.max(1, Math.ceil(filtered.length / 50)),
    current = Math.min(page, pages - 1);
  const iva = useLiquidazioneIVA();
  if (!company)
    return <p>Seleziona un’azienda per consultare i dati fiscali.</p>;
  if (
    sales.isPending ||
    purchases.isPending ||
    sales.isError ||
    purchases.isError
  )
    return (
      <FiscalQueryState
        loading={sales.isPending || purchases.isPending}
        error={sales.isError || purchases.isError}
        onRetry={() => {
          void sales.refetch();
          void purchases.refetch();
        }}
      />
    );
  const exportCsv = () => {
    const cells = [
      [
        "Data documento",
        "Data periodo",
        "Ricezione SDI",
        "Numero",
        "Controparte",
        "Imponibile",
        "IVA",
        "Aliquota",
        "Natura",
        "Origine",
        "Da verificare",
      ],
      ...filtered.map((r) => [
        r.date,
        r.periodDate,
        r.received || "",
        r.number,
        r.counterparty,
        r.base === null ? "" : (r.base / 100).toFixed(2).replace(".", ","),
        r.tax === null ? "" : (r.tax / 100).toFixed(2).replace(".", ","),
        r.rate ?? "",
        r.nature,
        r.synthetic ? "Proiezione RC, non registrazione" : r.documentId,
        r.issues.join(" · "),
      ]),
    ];
    const csv = cells
      .map((row) => row.map((c) => escapeCsvCell(String(c), ";")).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-documentale-${side}-${p.dal}-${p.al}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title="Registro IVA documentale"
        description={
          <>
            Dal {fiscalDate(p.dal)} al {fiscalDate(p.al)} · valori delle fatture
            presenti, non una liquidazione fiscale approvata.
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["vendite", "acquisti"] as const).map((s) => {
          const t = fiscalTotals(rows.filter((r) => r.side === s));
          return (
            <FiscalMetric
              key={s}
              label={`IVA documenti ${s}`}
              value={money(t.tax)}
              onClick={() => {
                p.set({
                  registro: s,
                  filtro_iva: "tutti",
                  gruppo_iva: "",
                  q_iva: "",
                });
                setPage(0);
              }}
              active={side === s && !onlyIssues && !selectedGroup}
              description={
                <>
                  {t.count} {t.count === 1 ? "documento" : "documenti"} ·
                  imponibile {money(t.base)} · proiezioni RC escluse
                </>
              }
            />
          );
        })}
        <FiscalMetric
          label="Qualità dei dati"
          warning
          onClick={() => {
            p.set({
              registro: "tutti",
              filtro_iva: "verificare",
              gruppo_iva: "",
              q_iva: "",
            });
            setPage(0);
          }}
          active={onlyIssues}
          value={
            <>
              {issues.length} {issues.length === 1 ? "documento" : "documenti"}{" "}
              da verificare
            </>
          }
          description="Gli importi presenti non attestano detraibilità, esigibilità o adempimento."
        />
      </div>
      {issues.length > 0 && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Controlli e dati mancanti
          </summary>
          <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-sm">
            {issues.map((r) => (
              <li key={r.id}>
                <FiscalSourceViewer
                  id={r.documentId}
                  label={r.number}
                  type={r.side}
                />{" "}
                · {r.side}: {r.issues.join(" · ")}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Registri IVA" className="flex gap-1">
          {(["vendite", "acquisti", "tutti"] as const).map((s) => (
            <Button
              key={s}
              role="tab"
              aria-selected={side === s}
              variant={side === s ? "default" : "outline"}
              onClick={() => {
                p.set({ registro: s, gruppo_iva: "" });
                setPage(0);
              }}
            >
              {s === "tutti" ? "Tutti i documenti" : `Registro ${s}`}
            </Button>
          ))}
        </div>
        <Input
          className="min-w-40 flex-1"
          aria-label="Cerca nel registro IVA"
          placeholder="Numero o controparte…"
          value={search}
          onChange={(e) => {
            p.set({ q_iva: e.target.value }, true);
            setPage(0);
          }}
        />
        <Button
          variant="outline"
          disabled={
            !filtered.length ||
            filtered.some((r) => r.tax === null || r.base === null)
          }
          onClick={exportCsv}
        >
          Esporta CSV
        </Button>
      </div>
      {(search || onlyIssues || selectedGroup) && (
        <p className="text-xs text-muted-foreground">
          La ricerca filtra l’elenco; i riepiloghi in alto si riferiscono
          all’intero periodo.{" "}
          {onlyIssues ? "Solo righe con verifiche aperte. " : ""}
          <button
            className="ml-2 text-blue-700 underline"
            onClick={() => {
              p.set({ q_iva: "", filtro_iva: "tutti", gruppo_iva: "" });
              setPage(0);
            }}
          >
            Azzera filtri del registro
          </button>
        </p>
      )}
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Riepilogo per aliquota e natura · {groups.length}{" "}
          {groups.length === 1 ? "gruppo" : "gruppi"}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Righe documentali dei filtri correnti, senza proiezioni RC. Uno stesso
          documento può contenere più aliquote: non sommare i conteggi dei
          gruppi.
        </p>
        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <button
              key={group.key}
              aria-pressed={group.key === selectedGroup}
              className="flex w-full flex-wrap justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-blue-50"
              onClick={() => {
                p.set({ gruppo_iva: group.key });
                setPage(0);
              }}
            >
              <span>
                {group.side === "vendite" ? "Vendite" : "Acquisti"} ·{" "}
                {group.rate === null
                  ? "Aliquota da verificare"
                  : `${group.rate}%`}{" "}
                ·{" "}
                {group.nature ||
                  (Number(group.rate) > 0
                    ? "Operazione imponibile"
                    : "Natura non indicata")}{" "}
                · Esigibilità{" "}
                {group.exigibility === "I"
                  ? "immediata"
                  : group.exigibility === "D"
                    ? "differita"
                    : group.exigibility === "S"
                      ? "split payment"
                      : "da verificare"}
              </span>
              <span>
                {group.count} {group.count === 1 ? "documento" : "documenti"} ·
                Imponibile {money(group.base)} · IVA {money(group.tax)}
              </span>
            </button>
          ))}
          {!groups.length && (
            <p className="text-sm">
              Nessuna riga documentale nei filtri correnti.
            </p>
          )}
        </div>
      </details>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[
                "Documento / controparte",
                "Data / periodo",
                "Imponibile",
                "IVA",
                "Aliquota / natura",
                "Verifica",
              ].map((h) => (
                <th key={h} className="p-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 50, (current + 1) * 50).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <FiscalSourceViewer
                    id={r.documentId}
                    label={r.number}
                    type={r.synthetic ? "acquisti" : r.side}
                  />
                  <p className="text-xs text-muted-foreground">
                    {r.counterparty}
                  </p>
                </td>
                <td className="p-3 whitespace-nowrap">
                  {fiscalDate(r.date)}
                  {r.periodDate !== r.date && (
                    <p className="text-xs text-muted-foreground">
                      Periodo {fiscalDate(r.periodDate)}
                    </p>
                  )}
                  {r.side === "acquisti" && (
                    <p className="text-xs text-muted-foreground">
                      Ricezione {fiscalDate(r.received, "non documentata")}
                    </p>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">{money(r.base)}</td>
                <td className="p-3 whitespace-nowrap">{money(r.tax)}</td>
                <td className="p-3">
                  {r.rate === null ? "Da verificare" : r.rate + "%"}
                  <p className="text-xs text-muted-foreground">
                    {r.nature || "—"}
                    {r.exigibility === "S" ? " · Split payment" : ""}
                  </p>
                </td>
                <td className="max-w-xs p-3 text-xs text-muted-foreground">
                  {r.synthetic
                    ? "Proiezione RC · non contabilizzata"
                    : r.issues.length
                      ? r.issues.join(" · ")
                      : "Dato presente nel documento"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nessun documento corrisponde al periodo e ai filtri selezionati. Non
            certifica l’assenza di obblighi fiscali.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          {totals.count} {totals.count === 1 ? "documento" : "documenti"}
          {documentedRows !== totals.count && (
            <> · {documentedRows} righe IVA</>
          )}
          {projectionRows > 0 && (
            <>
              {" "}
              · {projectionRows}{" "}
              {projectionRows === 1
                ? "proiezione RC non contabilizzata"
                : "proiezioni RC non contabilizzate"}
            </>
          )}
          {(search || onlyIssues || selectedGroup) && (
            <> · IVA dei risultati: {money(totals.tax)}</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Precedenti
          </Button>
          <span aria-label="Pagina del registro">
            Pagina {current + 1} di {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Successivi
          </Button>
        </div>
      </div>
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Prospetto IVA preliminare del server
        </summary>
        <div className="mt-4">
          <LiquidazioneIVA
            {...iva}
            documental={{
              vendite: fiscalTotals(
                rows.filter((row) => row.side === "vendite"),
              ).tax,
              acquisti: fiscalTotals(
                rows.filter((row) => row.side === "acquisti"),
              ).tax,
            }}
          />
        </div>
      </details>
    </div>
  );
}
function money(cents: number | null) {
  return cents === null ? "Da verificare" : formatCurrency(cents / 100);
}
