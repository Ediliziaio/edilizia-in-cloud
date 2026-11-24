import { UniformSelect } from "@/components/ui/uniform-select";
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
  fiscalReceivedLabel,
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
import { Printer, FileSpreadsheet } from "lucide-react";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { htmlRegistroIva, righeExcelIva } from "@/lib/contabilita/registroIva";
import { periodoInLettere } from "@/lib/contabilita/registroPrimaNota";
import { Input } from "@/components/ui/input";
import { useLiquidazioneIVA } from "@/hooks/useLiquidazioneIVA";
import { LiquidazioneIVA } from "@/components/contabilita/LiquidazioneIVA";
import { RicezioneAcquisti } from "@/components/fatturazione/RicezioneAcquisti";
import { DetraibilitaAcquisti } from "@/components/fatturazione/DetraibilitaAcquisti";
import { fiscalDate, fiscalVatGroups } from "@/lib/fatturazione/fiscalInsights";
import { chiaveProtocolloIva, useRegistriIva } from "@/hooks/useRegistriIva";
import { AssegnaProtocolliIva, GestioneSezionaliIva } from "@/components/fatturazione/ProtocolliIva";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function etichettaAliquota(r: { rate: string; nature: string }): string {
  const aliquota = r.rate || "Da verificare";
  return r.nature ? `${aliquota} · ${r.nature}` : aliquota;
}

export default function RegistroIVA({
  embedded = false,
  onApriLiquidazione,
}: {
  embedded?: boolean;
  /** Dove porta «Vai alla liquidazione IVA»: in Contabilità generale resta nella pagina. */
  onApriLiquidazione?: () => void;
} = {}) {
  return embedded ? (
    <RegistroContent onApriLiquidazione={onApriLiquidazione} />
  ) : (
    <FiscalLegacyRedirect section="iva" />
  );
}
function RegistroContent({ onApriLiquidazione }: { onApriLiquidazione?: () => void }) {
  const tr = useT();
  // Passato solo da Contabilità generale, dove la liquidazione è la linguetta accanto.
  const dentroContabilita = !!onApriLiquidazione;
  const company = useEffectiveCompanyId(),
    p = useFiscalPeriod();
  const search = p.params.get("q_iva") ?? "";
  const [page, setPage] = useState(0);
  const [aliquota, setAliquota] = useState("tutte");
  const [sezionale, setSezionale] = useState("tutti");
  const registri = useRegistriIva(company);
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
    queryFn: async ({ signal }) => {
      // Una fattura scartata dallo SDI per l'Agenzia non esiste: fuori dal registro.
      const { data: scartate, error: scartateError } = await supabase.from("documenti_fiscali" as never)
        .select("id").eq("company_id", company!).eq("sdi_stato", "NS").abortSignal(signal);
      if (scartateError) throw scartateError;
      const fuori = new Set(((scartate ?? []) as unknown as { id: string }[]).map((d) => d.id));
      const righe = (await readAllPages((from, to) =>
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
      )) as unknown as FiscalDocument[];
      return righe.filter((d) => !fuori.has((d as unknown as { id: string }).id));
    },
  });
  const purchases = useQuery({
    queryKey: ["fiscal-purchases", company, p.dal, p.al],
    enabled: !!company,
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("fatture_ricevute_periodo_iva" as never)
          .select(
            "id,numero_fattura,data_fattura,data_ricezione_sdi,data_detrazione,tipo_documento,cedente_ragione_sociale,imponibile_totale,iva_totale,totale_documento,riepilogo_iva,aliquota_reverse_charge,ricezione_dichiarata_il,ricezione_origine,integrazione,detraibilita_percentuale",
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
    () => fiscalRows(sales.data || [], purchases.data || []).map(r => {
      const protocollo = r.synthetic ? undefined : registri.perDocumento.get(chiaveProtocolloIva(r.side, r.documentId));
      const s = protocollo ? registri.perSezionale.get(protocollo.sezionale_id) : undefined;
      return { ...r, protocol: protocollo ? `${s?.codice ?? ""} ${protocollo.numero}/${protocollo.anno}`.trim() : "", section: s ? `${s.codice} · ${s.nome}` : "", sectionId: s?.id ?? "", registrationDate: protocollo?.data_registrazione ?? "" };
    }),
    [sales.data, purchases.data, registri.perDocumento, registri.perSezionale],
  );
  const issues = fiscalDocumentIssues(rows);
  const aliquote = [...new Set(rows.filter((r) => !r.synthetic).map((r) => etichettaAliquota(r)))].sort();
  const matching = rows.filter(
    (r) =>
      (side === "tutti" || r.side === side) &&
      (sezionale === "tutti" || (sezionale === "non_assegnato" ? !r.synthetic && !r.protocol : r.sectionId === sezionale)) &&
      (aliquota === "tutte" || etichettaAliquota(r) === aliquota) &&
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
  // Prima dei return qui sotto: un hook dopo un return anticipato manda in errore la pagina.
  const [stampa, setStampa] = useState<string | null>(null);
  const anagrafica = useAnagraficaAzienda();
  if (!company)
    return <p>{tr("Seleziona un’azienda per consultare i dati fiscali.")}</p>;
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
  // Stampa ed Excel del registro (09/11/2026): prima si poteva solo esportare
  // un CSV senza intestazione, e chi porta il trimestre al commercialista si
  // trovava numeri senza di chi sono né di che periodo.
  const intestazione = {
    ragione_sociale: anagrafica.data?.ragione_sociale ?? "",
    partita_iva: anagrafica.data?.partita_iva ?? null,
    codice_fiscale: anagrafica.data?.codice_fiscale ?? null,
    indirizzo_via: anagrafica.data?.indirizzo_via ?? null,
    indirizzo_numero_civico: anagrafica.data?.indirizzo_numero_civico ?? null,
    indirizzo_cap: anagrafica.data?.indirizzo_cap ?? null,
    indirizzo_comune: anagrafica.data?.indirizzo_comune ?? null,
    indirizzo_provincia: anagrafica.data?.indirizzo_provincia ?? null,
    logo_url: anagrafica.data?.logo_url ?? null,
  };
  const apriStampa = () =>
    setStampa(htmlRegistroIva({ azienda: intestazione, righe: filtered, lato: side, dal: p.dal, al: p.al, sezionale: registri.perSezionale.get(sezionale)?.nome }));
  const scaricaExcel = async () => {
    await exportXlsx({
      filename: `registro-iva-${side}-${p.dal}-${p.al}.xlsx`,
      brand: {
        company_name: intestazione.ragione_sociale || undefined,
        title: side === "acquisti" ? "Registro IVA acquisti" : side === "vendite" ? "Registro IVA vendite" : "Registro IVA",
        subtitle: periodoInLettere(p.dal, p.al),
      },
      sheets: [{
        name: "Registro IVA",
        rows: righeExcelIva(filtered) as unknown[],
        columns: [
          { header: "Data documento", key: "data", width: 14 },
          { header: side === "acquisti" ? "Data detrazione" : "Data periodo", key: "periodo", width: 14 },
          { header: "Numero", key: "numero", width: 16 },
          { header: "Protocollo", key: "protocollo", width: 18 },
          { header: "Sezionale", key: "sezionale", width: 24 },
          { header: "Data registrazione", key: "registrazione", width: 18 },
          { header: "Controparte", key: "controparte", width: 38 },
          { header: "Registro", key: "registro", width: 11 },
          { header: "Imponibile", key: "imponibile", type: "number", width: 15 },
          { header: "Imposta", key: "imposta", type: "number", width: 14 },
          { header: "Aliquota", key: "aliquota", width: 10 },
          { header: "Natura", key: "natura", width: 10 },
          { header: "Nota", key: "nota", width: 34 },
        ],
      }] as never,
    });
  };

  const dataCsv = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
  const exportCsv = () => {
    const cells = [
      [
        "Data documento",
        "Data periodo",
        "Ricezione",
        "Origine ricezione",
        "Numero",
        "Protocollo",
        "Sezionale",
        "Data registrazione",
        "Controparte",
        "Imponibile",
        "IVA",
        "Aliquota",
        "Natura",
        "Origine",
        "Da verificare",
      ],
      // Date all'italiana (24/11/2026): il file va allo studio, che legge 01/10/2026, non 2026-10-01.
      ...filtered.map((r) => [
        dataCsv(r.date),
        dataCsv(r.periodDate),
        dataCsv(r.received),
        r.receivedOrigin || "",
        r.number,
        r.protocol,
        r.section,
        dataCsv(r.registrationDate),
        r.counterparty,
        r.base === null ? "" : (r.base / 100).toFixed(2).replace(".", ","),
        r.tax === null ? "" : (r.tax / 100).toFixed(2).replace(".", ","),
        r.rate ?? "",
        r.nature,
        r.synthetic ? "Proiezione RC, non registrazione" : "Documento",
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
      {stampa && (
        <PrintPreviewModal
          open
          onOpenChange={(v) => { if (!v) setStampa(null); }}
          htmlContent={stampa}
          title={tr("Registro IVA — anteprima di stampa")}
          fileName={`registro-iva-${side}-${p.dal}-${p.al}`}
          soloPdf
        />
      )}
      <FiscalSectionHeader
        title={tr("Registro IVA documentale")}
        description={
          <>{tr("Dal {dal} al {al} · valori delle fatture presenti, non una liquidazione fiscale approvata.", { dal: String(fiscalDate(p.dal) ?? ""), al: String(fiscalDate(p.al) ?? "") })}</>
        }
        actions={
          // Dentro Contabilità generale la liquidazione è la linguetta accanto: il pulsante era un doppione.
          dentroContabilita ? undefined : (
            <Button size="sm" onClick={() => p.set({ sezione: "contabilita", vista: "iva" })}>
              {tr("Vai alla liquidazione IVA")}
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["vendite", "acquisti"] as const).map((s) => {
          const t = fiscalTotals(rows.filter((r) => r.side === s));
          return (
            <FiscalMetric
              key={s}
              label={tr("IVA documenti {s}", { s: String(s ?? "") })}
              value={tr(money(t.tax))}
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
                  {tr(t.count === 1 ? "{n} documento · imponibile {imponibile} · proiezioni RC escluse" : "{n} documenti · imponibile {imponibile} · proiezioni RC escluse", { n: t.count, imponibile: tr(money(t.base)) })}
                </>
              }
            />
          );
        })}
        <FiscalMetric
          label={tr("Qualità dei dati")}
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
              {tr(issues.length === 1 ? "{n} documento da verificare" : "{n} documenti da verificare", { n: issues.length })}
            </>
          }
          description={tr("Gli importi presenti non attestano detraibilità, esigibilità o adempimento.")}
        />
      </div>
      {issues.length > 0 && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {tr("Controlli e dati mancanti")}
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
      {/* Due righe (24/11/2026): sopra quello che si usa ogni volta (registro, ricerca, stampa ed export),
          sotto i filtri e le azioni rare. Prima nove comandi mescolati in una riga sola. */}
      {(registri.protocolli.isError || registri.sezionali.isError) && <p role="alert" className="text-sm text-destructive">{tr("Protocolli IVA non disponibili.")} <button className="underline" onClick={() => void registri.ricarica()}>{tr("Riprova")}</button></p>}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={tr("Registri IVA")} className="flex flex-wrap gap-1">
          {(["vendite", "acquisti", "tutti"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              role="tab"
              aria-selected={side === s}
              variant={side === s ? "default" : "outline"}
              onClick={() => {
                p.set({ registro: s, gruppo_iva: "" });
                setSezionale("tutti");
                setPage(0);
              }}
            >
              {s === "tutti" ? tr("Tutti i documenti") : tr("Registro {s}", { s: String(s ?? "") })}
            </Button>
          ))}
        </div>
        <Input
          className="h-9 min-w-40 flex-1"
          aria-label={tr("Cerca nel registro IVA")}
          placeholder={tr("Numero o controparte…")}
          value={search}
          onChange={(e) => {
            p.set({ q_iva: e.target.value }, true);
            setPage(0);
          }}
        />
        <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!filtered.length} onClick={apriStampa}>
          <Printer className="mr-2 h-4 w-4" />{tr("Stampa")}
        </Button>
        <Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => { void scaricaExcel(); }}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />Excel
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !filtered.length ||
            filtered.some((r) => r.tax === null || r.base === null)
          }
          onClick={exportCsv}
        >
          {tr("Esporta CSV")}
        </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <UniformSelect
          aria-label={tr("Aliquota")}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={aliquota}
          onChange={(e) => {
            setAliquota(e.target.value);
            setPage(0);
          }}
        >
          <option value="tutte">{tr("Tutte le aliquote")}</option>
          {aliquote.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </UniformSelect>
        <UniformSelect aria-label={tr("Sezionale IVA")} className="h-8 rounded-md border bg-background px-2 text-xs" value={sezionale} onChange={e => { setSezionale(e.target.value); setPage(0); }}>
          <option value="tutti">{tr("Tutti i sezionali")}</option><option value="non_assegnato">{tr("Senza protocollo")}</option>{(registri.sezionali.data ?? []).filter(s => side === "tutti" || s.lato === side).map(s => <option key={s.id} value={s.id}>{s.codice} · {s.nome}</option>)}
        </UniformSelect>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <GestioneSezionaliIva company={company} registri={registri} />
          {registri.puoScrivere && side !== "tutti" && <AssegnaProtocolliIva righe={filtered} lato={side} registri={registri} />}
        </span>
      </div>
      {(search || onlyIssues || selectedGroup) && (
        <p className="text-xs text-muted-foreground">
          {tr("La ricerca filtra l’elenco; i riepiloghi in alto si riferiscono all’intero periodo.")}{" "}
          {onlyIssues ? `${tr("Solo righe con verifiche aperte.")} ` : ""}
          <button
            className="ml-2 text-blue-700 underline"
            onClick={() => {
              p.set({ q_iva: "", filtro_iva: "tutti", gruppo_iva: "" });
              setPage(0);
            }}
          >
            {tr("Azzera filtri del registro")}
          </button>
        </p>
      )}
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {tr(groups.length === 1 ? "Riepilogo per aliquota e natura · {n} gruppo" : "Riepilogo per aliquota e natura · {n} gruppi", { n: groups.length })}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {tr("Righe documentali dei filtri correnti, senza proiezioni RC. Uno stesso documento può contenere più aliquote: non sommare i conteggi dei gruppi.")}
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
                {group.side === "vendite" ? tr("Vendite") : tr("Acquisti")} ·{" "}
                {group.rate === null
                  ? tr("Aliquota da verificare")
                  : `${group.rate}%`}{" "}
                ·{" "}
                {group.nature ||
                  (Number(group.rate) > 0
                    ? tr("Operazione imponibile")
                    : tr("Natura non indicata"))}{" "}
                {tr("· Esigibilità")}{" "}
                {group.exigibility === "I"
                  ? tr("immediata")
                  : group.exigibility === "D"
                    ? tr("differita")
                    : group.exigibility === "S"
                      ? tr("split payment")
                      : tr("da verificare")}
              </span>
              <span>
                {tr(group.count === 1 ? "{n} documento · Imponibile {imponibile} · IVA {iva}" : "{n} documenti · Imponibile {imponibile} · IVA {iva}", { n: group.count, imponibile: tr(money(group.base)), iva: tr(money(group.tax)) })}
              </span>
            </button>
          ))}
          {!groups.length && (
            <p className="text-sm">
              {tr("Nessuna riga documentale nei filtri correnti.")}
            </p>
          )}
        </div>
      </details>
      {side !== "vendite" && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">{tr("Ricezione e detraibilità degli acquisti")}</summary>
          <div className="mt-3 space-y-3">
            <RicezioneAcquisti company={company} acquisti={purchases.data || []} />
            <DetraibilitaAcquisti company={company} acquisti={purchases.data || []} />
          </div>
        </details>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[
                "Documento / controparte",
                "Protocollo / sezionale",
                "Data / periodo",
                "Imponibile",
                "IVA",
                "Aliquota / natura",
                "Verifica",
              ].map((h) => (
                <th key={h} className="p-3 font-medium">
                  {tr(h)}
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
                <td className="p-3 whitespace-nowrap">{r.synthetic ? <span className="text-xs text-muted-foreground">{tr("Proiezione RC")}</span> : <><AssegnaProtocolliIva righe={[r]} lato={r.side} registri={registri} singolo /><p className="text-xs text-muted-foreground">{r.section}{r.registrationDate ? ` · ${fiscalDate(r.registrationDate)}` : ""}</p></>}</td>
                <td className="p-3 whitespace-nowrap">
                  {fiscalDate(r.date)}
                  {r.periodDate !== r.date && (
                    <p className="text-xs text-muted-foreground">{tr("Periodo {periodDate}", { periodDate: String(fiscalDate(r.periodDate) ?? "") })}</p>
                  )}
                  {r.side === "acquisti" && (
                    <p className="text-xs text-muted-foreground">
                      {fiscalReceivedLabel(r)}
                    </p>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">{tr(money(r.base))}</td>
                <td className="p-3 whitespace-nowrap">
                  {tr(money(r.tax))}
                  {r.deductible !== undefined && <p className="text-xs text-amber-700">{tr("Detraibile {deductible}%", { deductible: String(r.deductible ?? "") })}</p>}
                </td>
                <td className="p-3">
                  {r.rate === null ? tr("Da verificare") : r.rate + "%"}
                  <p className="text-xs text-muted-foreground">
                    {r.nature || "—"}
                    {r.exigibility === "S" ? ` ${tr("· Split payment")}` : ""}
                  </p>
                </td>
                <td className="max-w-xs p-3 text-xs text-muted-foreground">
                  {r.synthetic && r.id.startsWith("int-v:")
                    ? tr("Integrazione ricevuta · la stessa IVA è anche a debito (conteggiata nel prospetto)")
                    : r.synthetic
                    ? tr("Proiezione RC · non contabilizzata")
                    : r.issues.length
                      ? r.issues.join(" · ")
                      : tr("Dato presente nel documento")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {tr("Nessun documento corrisponde al periodo e ai filtri selezionati. Non certifica l’assenza di obblighi fiscali.")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          {tr(totals.count === 1 ? "{n} documento" : "{n} documenti", { n: totals.count })}
          {documentedRows !== totals.count && (
            <>{" "}{tr("· {documentedRows} righe IVA", { documentedRows: String(documentedRows ?? "") })}</>
          )}
          {projectionRows > 0 && (
            <>
              {" · "}
              {tr(projectionRows === 1 ? "{n} proiezione RC non contabilizzata" : "{n} proiezioni RC non contabilizzate", { n: projectionRows })}
            </>
          )}
          {(search || onlyIssues || selectedGroup) && (
            <>{" "}{tr("· IVA dei risultati: {tax}", { tax: String(tr(money(totals.tax)) ?? "") })}</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {tr("Precedenti")}
          </Button>
          <span aria-label={tr("Pagina del registro")}>{tr("Pagina {current} di {pages}", { current: current + 1, pages: String(pages ?? "") })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {tr("Successivi")}
          </Button>
        </div>
      </div>
      {!dentroContabilita && <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {tr("Confronto tra registro e liquidazione")}
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
      </details>}
    </div>
  );
}
function money(cents: number | null) {
  return cents === null ? "Da verificare" : formatCurrency(cents / 100);
}
