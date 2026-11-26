import { TestataScheda, BOTTONE_SECONDARIO, RICERCA_BARRA, TENDINA_STATO_BARRA } from "@/components/orders/TestataScheda";
import { createPortal } from "react-dom";
import { useSlotAzioniSezione } from "@/hooks/useSlotAzioniSezione";
import { OperationalDateRange } from "@/components/orders/OperationalDateRange";
import { useOperationalDeletion } from "@/hooks/useOperationalDeletion";
import { OperationalExtraFilters } from "@/components/orders/OperationalExtraFilters";
import { OperationalSummary, OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import {
  useOperationalArchive,
  inOperationalScope,
} from "@/hooks/useOperationalArchive";
import { OperationalHelp } from "@/components/orders/OperationalHelp";
import { OperationalArchive } from "@/components/orders/OperationalArchive";
import { OperationalTable } from "@/components/orders/OperationalTable";
import { usePipelineTransition } from "@/hooks/usePipelineTransition";
// ============================================================================
// DDTRicezioneList — Vista globale dei DDT fornitori (UX procedurale)
// ----------------------------------------------------------------------------
// Tab usata dentro OrdersList.tsx accanto a "Ordini d'Acquisto".
// Include:
//   • Header + KPI con evidenza non conformità / da verificare
//   • Filtro pill mobile-first (tutti/atteso/parziale/ricevuto/verificato/non_conforme)
//   • Card mobile con allegati mini-icon + DDTStatusBadge
//   • Tabella desktop con colonna corriere + allegati
//   • Dialog Nuovo DDT → wizard procedurale 3 step
// ============================================================================

import { useState, useMemo } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileCheck,
  Plus,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Paperclip,
  ChevronDown,
  FileSpreadsheet,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useDDTRicezioneList,
  type DDTStato,
  type DDTRicezioneWithJoins,
} from "@/hooks/useDDTRicezione";
import {
  DDTStatusBadge,
  DDT_STATO_META,
} from "@/components/ddt/DDTStatusBadge";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { RevisioneDocumento, RiepilogoInviiWhatsApp, RigaDocumentoInIngresso, StatoDocumentoInIngresso, VocaleDocumento, nomeDocumentoInIngresso } from "@/components/ddt/DocumentiInIngresso";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvvisoPossibileDuplicatoDDT } from "@/components/ddt/AvvisoPossibileDuplicatoDDT";
import { useDocumentiInIngresso } from "@/hooks/useDocumentiInIngresso";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import { originaliBolla } from "@/lib/fatturazione/originaliConfronto";
import { STATO_DOCUMENTO } from "@/hooks/useDocumentiDDT";
import type { DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";
import { BolleInBloccoDialog } from "@/components/ddt/BolleInBloccoDialog";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";

// ── Commessa e fornitore di una bolla ───────────────────────────────────────
// Dal 29/10/2026 stanno sulla bolla stessa: una bolla senza ordine d'acquisto
// li ha SOLO lì. Si legge prima la colonna propria, poi, per le bolle vecchie,
// il giro attraverso l'ODA. Scritto una volta: filtri, ricerca, ordinamento,
// esportazione e tabella devono dire tutti la stessa cosa.
const commessaIdDi = (d: DDTRicezioneWithJoins) =>
  d.order_id ?? d.purchase_orders?.order_id ?? null;
const commessaCodiceDi = (d: DDTRicezioneWithJoins) =>
  d.orders?.order_code ?? d.purchase_orders?.orders?.order_code ?? null;
const fornitoreIdDi = (d: DDTRicezioneWithJoins) =>
  d.supplier_id ?? d.purchase_orders?.supplier_id ?? null;
const fornitoreNomeDi = (d: DDTRicezioneWithJoins) =>
  d.suppliers?.name ?? d.purchase_orders?.suppliers?.name ?? null;
import {
  OperationalBoard,
  OperationalPagination,
} from "@/components/orders/OperationalBoard";
import { usePermissions } from "@/hooks/usePermissions";
import { idBollaValido } from "../../../shared/aiAttivita";
import {
  riepilogoQuantitaDDT,
  destinazioneConsegneDDT,
  magazziniConsegneDDT,
} from "@/lib/ddt/riepilogoConsegne";
import {
  inOperationalPeriod,
  operationalPage,
  operationalPeriod,
  updateOperationalParams,
} from "@/lib/orders/operationalFilters";
import { useT, intlCampo, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

type FilterKey = "tutti" | "da_registrare" | DDTStato;
type SortDirection = "asc" | "desc";
type DDTSortKey =
  | "numero"
  | "data"
  | "fornitore"
  | "corriere"
  | "magazzino"
  | "allegati"
  | "quantita"
  | "stato";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "tutti", label: "Tutti" },
  { key: "da_registrare", label: "Da registrare" },
  { key: "atteso", label: "Attesi" },
  { key: "parziale", label: "Parziali" },
  { key: "ricevuto", label: "Ricevuti da verificare" },
  { key: "verificato", label: "Verificati" },
  { key: "non_conforme", label: "Non conformi" },
];

function getSortValue(d: DDTRicezioneWithJoins, key: DDTSortKey) {
  const po = d.purchase_orders;
  switch (key) {
    case "numero":
      return d.numero_ddt;
    case "data":
      return new Date(d.data_ricezione ?? 0).getTime();
    case "fornitore":
      return fornitoreNomeDi(d) ?? po?.oda_number ?? "";
    case "corriere":
      return d.corriere ?? "";
    case "magazzino":
      return magazziniConsegneDDT(d);
    case "allegati":
      return (d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0);
    case "quantita":
      return d.ricezione_esplicita
        ? riepilogoQuantitaDDT(d)
        : Number(d.quantita_ricevuta ?? 0);
    case "stato":
      return (
        DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ?? d.stato
      );
    default:
      return "";
  }
}

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "it", {
    numeric: true,
    sensitivity: "base",
  });
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />;
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

function SortableTh({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "center" | "right";
}) {
  return (
    <th
      scope="col"
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "p-3 font-medium",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        {label}
        <SortIcon active={active} direction={direction} />
      </button>
    </th>
  );
}

export default function DDTRicezioneList() {
  const [params] = useSearchParams();
  const permissions = usePermissions();
  const canCreate =
    !permissions.solaLettura &&
    (permissions.canEditWarehouse ||
      permissions.canManagePurchasing ||
      permissions.canEditOrders ||
      permissions.isAdmin);
  const documentoId = params.get("ddt_documento");
  return idBollaValido(documentoId)
    ? <DocumentoDDTCollegato key={documentoId} id={documentoId} canCreate={canCreate} />
    : <ElencoDDT canCreate={canCreate} />;
}

function DocumentoDDTCollegato({ id, canCreate }: { id: string; canCreate: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const ingresso = useDocumentiInIngresso(canCreate, id);
  const documento = ingresso.query.data?.find(j => j.id === id);
  const duplicato = ingresso.duplicati.get(id);
  const [vista, setVista] = useState<"modifica" | "originale" | null>(null);
  const stato = documento?.status;
  const puoLeggere = canCreate && (stato === "da_leggere" || stato === "error");
  const puoCompilare = canCreate && (stato === "review" || puoLeggere);
  const mostraEditor = puoCompilare && (vista === "modifica" || (vista === null && stato === "review"));
  if (documento?.status === "registered" && documento.ddt_id) {
    return <Navigate to={`/azienda/ddt/${documento.ddt_id}`} replace />;
  }

  return (
    <section aria-labelledby="bolla-collegata" className="space-y-4 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link aria-label={t("Tutti i DDT")} to="/azienda/ordini?tab=ddt"><ArrowLeft className="size-4" aria-hidden="true" /></Link>
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="bolla-collegata" className="text-lg font-bold sm:text-xl">{t("DDT in ingresso")}</h1>
              {stato && <StatoDocumentoInIngresso stato={stato} />}
            </div>
            {documento && <p className="text-xs text-muted-foreground">
              {documento.source === "whatsapp" ? "WhatsApp" : documento.source === "campo" ? t("App cantiere") : t("Caricamento ufficio")}
              {" · "}{new Date(documento.created_at).toLocaleDateString(intlCampo())}
            </p>}
          </div>
        </div>
        {documento && <div className="flex flex-wrap gap-2">
          {puoLeggere && !mostraEditor && (
            <Button variant="outline" size="sm" disabled={ingresso.riprovando === id} onClick={() => {
              setVista(null);
              void ingresso.riprova(documento);
            }}>{stato === "error" ? t("Rileggi con l’AI") : t("Leggi con l’AI")}</Button>
          )}
          {puoCompilare && (
            <Button size="sm" variant={mostraEditor ? "outline" : "default"}
              onClick={() => setVista(mostraEditor ? "originale" : "modifica")}>
              {mostraEditor ? t("Solo originale") : stato === "review" ? t("Controlla e registra") : t("Compila a mano")}
            </Button>
          )}
        </div>}
      </header>
      {ingresso.query.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Caricamento della bolla…")}</p>}
      {ingresso.query.isError && <div className="flex items-center gap-2">
        <p role="alert" className="text-sm text-destructive">{t("Caricamento della bolla non riuscito.")}</p>
        <Button size="sm" variant="outline" onClick={() => void ingresso.query.refetch()}>{t("Riprova")}</Button>
      </div>}
      {!ingresso.query.isLoading && !ingresso.query.isError && !documento && (
        <p role="status" className="text-sm text-muted-foreground">{t("Bolla non disponibile per questa utenza.")}</p>
      )}
      {documento && (
        <>
          {duplicato && <AvvisoPossibileDuplicatoDDT duplicato={duplicato} />}
          {documento.whatsapp_voice_message_id && (
            <VocaleDocumento companyId={documento.company_id} messageId={documento.whatsapp_voice_message_id} />
          )}
          {documento.last_error && <p className="text-sm text-destructive">{documento.last_error}</p>}
          {stato === "split" && !!documento.split_ids?.length && (
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{t("Bolle ricavate dal PDF")}</p>
              <ul className="flex flex-wrap gap-2">
                {documento.split_ids.filter(idBollaValido).map((figlio, i) => (
                  <li key={figlio}>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/azienda/ordini?tab=ddt&ddt_documento=${figlio}`}>{t("Apri bolla {i}", { i: i + 1 })}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mostraEditor ? (
            <RevisioneDocumento documento={documento} incorporata onClose={() => setVista("originale")}
              onRegistrata={ddtId => navigate(`/azienda/ddt/${ddtId}`, { replace: true })} />
          ) : (
            <section aria-label={t("Bolla originale")} className="rounded-xl border bg-card p-3 sm:p-4">
              <h2 className="mb-2 text-sm font-semibold">{t("Bolla originale")}</h2>
              <OriginaliConfronto companyId={documento.company_id} files={originaliBolla(documento.company_id, {}, [documento])} />
            </section>
          )}
        </>
      )}
    </section>
  );
}

function ElencoDDT({ canCreate }: { canCreate: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  useOperationalViewMemory("ddt", [
    "ddt_vista",
    "ddt_ambito",
    "ddt_cerca",
    "ddt_stato",
    "ddt_commessa",
    "ddt_fornitore",
    "ddt_periodo", "ddt_da", "ddt_a",
    "ddt_focus",
  ], { restoreView: false });
  const update = (values: Record<string, string | null>) =>
    setParams(
      updateOperationalParams(
        params,
        "ddt",
        "stato" in values || "focus" in values
          ? { ...values, ambito: "all" }
          : values,
      ),
      {
        replace: true,
      },
    );
  const rawTab = params.get("ddt_stato") ?? "tutti";
  const idInvio = params.get("ddt_invio");
  const invioSelezionato = idBollaValido(idInvio) ? idInvio : undefined;
  const tab: FilterKey = FILTERS.some((f) => f.key === rawTab)
    ? (rawTab as FilterKey)
    : "tutti";
  const setTab = (v: FilterKey) =>
    update({ stato: v, focus: null, invio: null, ambito: "all" });
  const search = params.get("ddt_cerca") ?? "";
  const setSearch = (v: string) => update({ cerca: v });
  // Sul telefono le colonne affiancate non ci stanno: sempre l'elenco, a righe.
  const telefono = useIsMobile(640);
  const slotAzioni = useSlotAzioniSezione(640);
  const view = !telefono && params.get("ddt_vista") === "pipeline" ? "pipeline" : "elenco";
  const archive = useOperationalArchive(
    "ddt_ambito",
    params.has("ddt_stato") || view === "elenco" ? "all" : "active",
  );
  const focus = ["pendenti", "verifica"].includes(params.get("ddt_focus") ?? "")
    ? params.get("ddt_focus")
    : "";
  const filterOrder = params.get("ddt_commessa") ?? "all";
  const filterSupplier = params.get("ddt_fornitore") ?? "all";
  const filterPeriodo = operationalPeriod(params.get("ddt_periodo"));
  const dateFrom = params.get("ddt_da") ?? "";
  const dateTo = params.get("ddt_a") ?? "";
  const setFilterOrder = (v: string) => update({ commessa: v });
  const setFilterSupplier = (v: string) => update({ fornitore: v });
  const setFilterPeriodo = (v: string) => update({ periodo: v });
  const [newOpen, setNewOpen] = useState(false);
  const [bloccoOpen, setBloccoOpen] = useState(false);
  const movement = usePipelineTransition({ kind: "ddt", enabled: canCreate });
  const ingresso = useDocumentiInIngresso(canCreate, undefined, invioSelezionato);

  const [sort, setSort] = useState<{
    key: DDTSortKey;
    direction: SortDirection;
  }>({
    key: "data",
    direction: "desc",
  });

  const {
    data: ddtList = [],
    isLoading,
    isError,
    refetch,
  } = useDDTRicezioneList();
  // 11/11/2026: «Nuovo DDT» non dipende più dagli ordini. La bolla senza ordine
  // si registra già (NewDDTDialog, origine «senza ordine»): chi non usa gli
  // ordini al fornitore, come Bonarrigo con 0 ordini, aveva il pulsante spento.

  const activeFiltersCount = [
    filterOrder !== "all",
    filterSupplier !== "all",
    filterPeriodo !== "tutto",
    !!search,
    tab !== "tutti",
    !!focus,
    !!invioSelezionato,
  ].filter(Boolean).length;
  const clearFilters = () =>
    update({
      commessa: null,
      fornitore: null,
      periodo: null, da: null, a: null,
      cerca: null,
      stato: null,
      focus: null,
      invio: null,
    });
  const stage = (d: (typeof ddtList)[number]) =>
    d.has_damages || d.stato === "non_conforme"
      ? "non_conforme"
      : d.stato === "attesa"
        ? "atteso"
        : d.stato;
  const moveDocument = (id: string, target: string) => {
    const d = ddtList.find((d) => d.id === id);
    if (d)
      movement.request(
        {
          id: d.id,
          label: d.numero_ddt,
          status: d.stato,
          stage: stage(d),
          href: `/azienda/ddt/${d.id}`,
          damages: d.has_damages,
          quantity: d.ricezione_esplicita
            ? d.consegne?.some((c) => c.tipo === "ingresso")
              ? 1
              : 0
            : Number(d.quantita_ricevuta),
        },
        target,
      );
  };

  // le scelte vengono dalle bolle che ci sono, non da tutta l'anagrafica
  const commesseInElenco = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of ddtList) {
      const id = commessaIdDi(d);
      const codice = commessaCodiceDi(d);
      if (id && codice) m.set(id, codice);
    }
    return [...m.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "it", { numeric: true }),
    );
  }, [ddtList]);
  const fornitoriInElenco = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of ddtList) {
      const id = fornitoreIdDi(d);
      if (id) m.set(id, fornitoreNomeDi(d) ?? "Fornitore");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [ddtList]);

  const handleSort = (key: DDTSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const baseFiltered = useMemo(() => {
    let list = ddtList;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => {
        const po = d.purchase_orders;
        return (
          d.numero_ddt.toLowerCase().includes(q) ||
          po?.oda_number?.toLowerCase().includes(q) ||
          fornitoreNomeDi(d)?.toLowerCase().includes(q) ||
          commessaCodiceDi(d)?.toLowerCase().includes(q) ||
          (d.corriere ?? "").toLowerCase().includes(q) ||
          (d.autista_nome ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (filterOrder === "none") list = list.filter((d) => !commessaIdDi(d));
    else if (filterOrder !== "all")
      list = list.filter((d) => commessaIdDi(d) === filterOrder);
    if (filterSupplier !== "all") {
      list = list.filter((d) => fornitoreIdDi(d) === filterSupplier);
    }
    list = list.filter((d) =>
      inOperationalPeriod(d.data_ricezione, filterPeriodo, undefined, {da:dateFrom,a:dateTo}),
    );

    return [...list].sort((a, b) => {
      const result = compareSortValues(
        getSortValue(a, sort.key),
        getSortValue(b, sort.key),
      );
      return sort.direction === "asc" ? result : -result;
    });
  }, [ddtList, search, filterOrder, filterSupplier, filterPeriodo, dateFrom, dateTo, sort]);
  const filtered = baseFiltered.filter(
    (d) =>
      !invioSelezionato &&
      (tab === "tutti" || stage(d) === tab) &&
      inOperationalScope(stage(d) === "verificato", archive.scope) &&
      (!focus ||
        (focus === "pendenti"
          ? ["atteso", "parziale"].includes(stage(d))
          : stage(d) === "ricevuto")),
  );
  const pendingBase = ingresso.documenti.filter((j) => {
    if (archive.scope === "history" || filterSupplier !== "all" || focus === "pendenti")
      return false;
    if (filterOrder === "none" && j.order_id) return false;
    if (
      filterOrder !== "all" &&
      filterOrder !== "none" &&
      j.order_id !== filterOrder
    )
      return false;
    if (!inOperationalPeriod(j.created_at, filterPeriodo, undefined, {da:dateFrom,a:dateTo})) return false;
    const q = search.trim().toLowerCase();
    return (
      !q ||
      `${j.files.map((f) => f.name).join(" ")} ${STATO_DOCUMENTO[j.status]} ${j.source}`
        .toLowerCase()
        .includes(q)
    );
  });
  const pendingDaVerificare = pendingBase.filter(j => ["review", "da_leggere", "error"].includes(j.status));
  const pending = tab === "ricevuto" || focus === "verifica"
    ? pendingDaVerificare
    : ["tutti", "da_registrare"].includes(tab) ? pendingBase : [];
  type ListRow =
    | { tipo: "ddt"; ddt: DDTRicezioneWithJoins }
    | { tipo: "documento"; documento: DocumentoPersistente };
  const rows: ListRow[] = [
    ...filtered.map((ddt): ListRow => ({ tipo: "ddt", ddt })),
    ...pending.map((documento): ListRow => ({ tipo: "documento", documento })),
  ];
  const rowSortValue = (r: ListRow) =>
    r.tipo === "ddt"
      ? getSortValue(r.ddt, sort.key)
      : sort.key === "data"
        ? new Date(r.documento.created_at).getTime()
        : sort.key === "numero"
          ? r.documento.files[0]?.name
          : sort.key === "stato"
            ? STATO_DOCUMENTO[r.documento.status]
            : "";
  rows.sort(
    (a, b) =>
      compareSortValues(rowSortValue(a), rowSortValue(b)) *
      (sort.direction === "asc" ? 1 : -1),
  );
  const page = operationalPage(params.get("ddt_pagina"), rows.length);
  const visibleRows = rows.slice((page - 1) * 25, page * 25);
  const selection = useOperationalDeletion("ddt", visibleRows.flatMap(row => {
    if (row.tipo !== "ddt") return [];
    const d = row.ddt;
    return [{ id: d.id, label: d.numero_ddt, href: `/azienda/ddt/${d.id}`,
      phase: { id: d.id, label: d.numero_ddt, href: `/azienda/ddt/${d.id}`, status: d.stato, stage: stage(d), damages: d.has_damages, quantity: d.ricezione_esplicita ? (d.consegne?.some(c => c.tipo === "ingresso") ? 1 : 0) : Number(d.quantita_ricevuta) },
      values: { fornitore: fornitoreNomeDi(d) ?? "", commessa: commessaCodiceDi(d) ?? "", oda: d.purchase_orders?.oda_number ?? "", data: d.data_ricezione ?? "", stato: DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ?? d.stato, quantita: riepilogoQuantitaDDT(d) },
    }];
  }), canCreate && view === "elenco", {
    filename: "ddt", columns: [{ key: "documento", label: "N° DDT" }, { key: "fornitore", label: "Fornitore" }, { key: "commessa", label: "Commessa" }, { key: "oda", label: "OdA" }, { key: "data", label: "Data" }, { key: "stato", label: "Stato" }, { key: "quantita", label: "Quantità" }],
  });

  // Export
  const buildExportRows = () => {
    return filtered.map((d) => {
      const po = d.purchase_orders;
      return {
        numero_ddt: d.numero_ddt,
        data: d.data_ricezione
          ? format(new Date(d.data_ricezione), "dd/MM/yyyy")
          : "",
        oda: po?.oda_number ?? "",
        supplier: fornitoreNomeDi(d) ?? "",
        order_code: commessaCodiceDi(d) ?? "",
        corriere: d.corriere ?? "",
        autista: d.autista_nome ?? "",
        stato:
          DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ??
          d.stato,
        quantita: riepilogoQuantitaDDT(d),
        destinazione: destinazioneConsegneDDT(d),
        magazzino: magazziniConsegneDDT(d),
        has_damages: d.has_damages || d.stato === "non_conforme" ? "Sì" : "No",
        attachments_count: String(
          (d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0),
        ),
      };
    });
  };

  const exportColumns = useMemo(
    () => [
      { key: "numero_ddt", label: "N° DDT" },
      { key: "data", label: "Data" },
      { key: "oda", label: "N° OdA" },
      { key: "supplier", label: "Fornitore" },
      { key: "order_code", label: "Ordine Cliente" },
      { key: "corriere", label: "Corriere" },
      { key: "autista", label: "Autista" },
      { key: "stato", label: "Stato" },
      { key: "quantita", label: "Q.tà Ricevuta" },
      { key: "destinazione", label: "Destinazione" },
      { key: "magazzino", label: "Magazzino" },
      { key: "has_damages", label: "Non conforme" },
      { key: "attachments_count", label: "N. Allegati" },
    ],
    [],
  );

  const exportCSV = () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: t("Nessun DDT da esportare"), variant: "destructive" });
      return;
    }
    exportToCSV(
      rows,
      exportColumns,
      `ddt-${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    toast({ title: t("CSV esportato — {n} DDT", { n: rows.length }) });
  };

  const exportXLSX = async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: t("Nessun DDT da esportare"), variant: "destructive" });
      return;
    }
    await exportToXLSX(
      rows,
      exportColumns,
      `ddt-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    );
    toast({ title: t("Excel esportato — {n} DDT", { n: rows.length }) });
  };

  const exportPDF = async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: t("Nessun DDT da esportare"), variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
      doc.setFontSize(14);
      doc.text("DDT Fornitori", 40, 40);
      doc.setFontSize(9);
      doc.text(
        `Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} DDT`,
        40,
        56,
      );

      const cols = [
        { key: "numero_ddt", label: "N° DDT", w: 70 },
        { key: "data", label: "Data", w: 60 },
        { key: "supplier", label: "Fornitore", w: 140 },
        { key: "oda", label: "OdA", w: 60 },
        { key: "corriere", label: "Corriere", w: 90 },
        { key: "stato", label: "Stato", w: 80 },
        { key: "quantita", label: "Q.tà", w: 50, align: "right" as const },
        { key: "has_damages", label: "NC", w: 40 },
        {
          key: "attachments_count",
          label: "All.",
          w: 40,
          align: "right" as const,
        },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(
        40,
        y - 12,
        cols.reduce((a, c) => a + c.w, 0),
        18,
        "F",
      );
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
      y += 14;
      doc.setFont("helvetica", "normal");

      rows.forEach((r, i) => {
        if (y > 540) {
          doc.addPage();
          y = 40;
        }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(
            40,
            y - 10,
            cols.reduce((a, c) => a + c.w, 0),
            14,
            "F",
          );
        }
        cols.forEach((c) => {
          const val = String(r[c.key as keyof typeof r] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed =
            val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
          if (c.align === "right") {
            doc.text(trimmed, x + c.w - 4, y, { align: "right" });
          } else {
            doc.text(trimmed, x + 4, y);
          }
          x += c.w;
        });
        y += 13;
      });

      doc.save(`ddt-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: t("PDF esportato — {n} DDT", { n: rows.length }) });
    } catch (e) {
      toast({
        title: t("Errore export PDF"),
        description: e instanceof Error ? e.message : t("Generazione PDF fallita"),
        variant: "destructive",
      });
    }
  };

  const columns = [
    {
      id: "atteso",
      label: t("Attesi"),
      hint: t("Merce ancora da ricevere"),
      accent: "border-t-sky-500",
    },
    {
      id: "parziale",
      label: t("Parziali"),
      hint: t("Ricezione da completare"),
      accent: "border-t-amber-500",
    },
    {
      id: "ricevuto",
      label: t("Da verificare"),
      hint: t("Merce ricevuta, controllo da eseguire"),
      accent: "border-t-rose-500",
    },
    {
      id: "verificato",
      label: t("Verificati"),
      hint: t("Controllo completato senza danni segnalati"),
      accent: "border-t-emerald-500",
    },
    {
      id: "non_conforme",
      label: t("Non conformi / danni"),
      hint: t("Difformità o danni da approfondire"),
      accent: "border-t-rose-500",
    },
  ].map((c) => ({ ...c, items: filtered.filter((d) => stage(d) === c.id) }));
  const renderCard = (ddt: (typeof ddtList)[number]) => (
    <article
      className={cn(
        "block rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        stage(ddt) === "non_conforme" && "border-rose-200",
      )}
    >
      <PipelineCardHeading>
        <Link
          to={`/azienda/ddt/${ddt.id}`}
          className="min-w-0 truncate font-mono text-xs font-semibold text-primary"
          title={ddt.numero_ddt}
        >
          {ddt.numero_ddt}
        </Link>
        <DDTStatusBadge stato={ddt.stato} size="sm" />
      </PipelineCardHeading>
      <p className="mt-2 text-sm font-medium">
        {fornitoreNomeDi(ddt) ?? t("Fornitore non indicato")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {ddt.purchase_orders?.oda_number ?? t("Senza ordine d'acquisto")}
      </p>
      <p className="mt-1 text-xs text-primary">
        {commessaCodiceDi(ddt) ?? t("Senza commessa")}
        {` · ${destinazioneConsegneDDT(ddt)}`}
      </p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>
          {ddt.data_ricezione
            ? format(new Date(ddt.data_ricezione), "dd/MM/yyyy")
            : t("Data non indicata")}
          {ddt.ora_arrivo ? ` · ${ddt.ora_arrivo.slice(0, 5)}` : ""}
        </p>
        <p>{magazziniConsegneDDT(ddt)}</p>
        {ddt.corriere && (
          <p className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {ddt.corriere}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs font-medium">
        {ddt.ricezione_esplicita ? t("Consegne") : t("Quantità ricevuta")}:{" "}
        {riepilogoQuantitaDDT(ddt)}
      </p>
      {ddt.has_damages && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-700">
          <AlertTriangle className="h-3 w-3" />
          {t("Danni segnalati")}
        </p>
      )}
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        {t("{n} allegati", { n: (ddt.attachments?.length ?? 0) + (ddt.ddt_file_url ? 1 : 0) })}
      </p>
    </article>
  );

  return (
    <div className="space-y-3">
      {/* Telefono: «⋯» e «+» tondi sulla riga delle sezioni di Commesse; niente titolo né barra. */}
      {slotAzioni && createPortal(
        <>
          {canCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" aria-label={t("Altre azioni DDT")}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(pendingBase.length > 0 || ingresso.invii.length > 0 || !!invioSelezionato) && (
                  <DropdownMenuItem onSelect={() => setTab(tab === "da_registrare" ? "tutti" : "da_registrare")}>
                    {tab === "da_registrare" ? t("Tutti i DDT") : t("Documenti in ingresso ({n})", { n: pendingBase.length })}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setBloccoOpen(true)}>{t("Carica più bolle")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="icon" disabled={!canCreate} aria-label={t("Nuovo DDT")} onClick={() => { if (canCreate) setNewOpen(true); }}
            className="h-9 w-9 rounded-full bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm">
            <Plus className="h-4 w-4" />
          </Button>
        </>, slotAzioni)}
      {/* Testata comune delle schede di Commesse (25/11/2026): «Esporta» nel «⋯», comandi da 32px,
          niente frase sotto il titolo. Da telefono «⋯» e «+» stanno nelle pillole (qui sopra). */}
      <TestataScheda
        className={cn(slotAzioni && "hidden")}
        titolo={t("DDT fornitori")}
        azioni={canCreate && <>
          {(pendingBase.length > 0 || ingresso.invii.length > 0 || !!invioSelezionato) && (
            <Button
              variant={tab === "da_registrare" ? "secondary" : "outline"}
              size="sm"
              className={BOTTONE_SECONDARIO}
              aria-label={t("Documenti in ingresso ({n})", { n: pendingBase.length })}
              aria-pressed={tab === "da_registrare"}
              onClick={() => setTab(tab === "da_registrare" ? "tutti" : "da_registrare")}
            >
              {t("Documenti in ingresso")}
              <span className="tabular-nums">({pendingBase.length})</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={() => setBloccoOpen(true)}>
            {t("Carica più bolle")}
          </Button>
        </>}
        altre={[
          { gruppo: t("DDT filtrati ({n})", { n: filtered.length }), etichetta: "CSV", icona: FileText, onSelect: exportCSV },
          { gruppo: t("DDT filtrati ({n})", { n: filtered.length }), etichetta: "Excel", icona: FileSpreadsheet, onSelect: exportXLSX },
          { gruppo: t("DDT filtrati ({n})", { n: filtered.length }), etichetta: "PDF", icona: FileText, onSelect: exportPDF },
        ]}
        nuovo={{ etichetta: t("Nuovo DDT"), onClick: () => { if (canCreate) setNewOpen(true); }, disabled: !canCreate }}
      />

      <OperationalSummary compatto fascia label={t("Riepilogo DDT")} title={t("Ricezioni e controlli")} icon={Truck} error={isError}>
        {([{ key: "atteso", label: t("Attesi") }, { key: "parziale", label: t("Ricezioni parziali") }, { key: "ricevuto", label: t("Da verificare") }, { key: "non_conforme", label: t("Non conformi") }] as const).map(item => {
          const registrati = baseFiltered.filter(ddt => stage(ddt) === item.key).length;
          const totale = registrati + (item.key === "ricevuto" ? pendingDaVerificare.length : 0);
          return <OperationalSummaryMetric key={item.key} label={item.label} value={totale} isLoading={isLoading}
            className={item.key === "ricevuto" && totale > 0 ? "border-rose-300/50 [&>span:last-child]:text-rose-300" : undefined}
            tone={item.key === "non_conforme" && totale > 0 ? "amber" : undefined}
            onClick={() => setTab(tab === item.key ? "tutti" : item.key)} active={tab === item.key} />;
        })}
      </OperationalSummary>

      <section aria-label={t("Filtri DDT")} className="rounded-xl border bg-white p-2.5 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto max-sm:overflow-visible"><div className={RICERCA_BARRA}>
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("Cerca DDT")}
              placeholder={t("Cerca DDT, OdA, commessa o corriere…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-9 text-xs max-sm:h-9 max-sm:text-sm"
            />
          </div><Select value={tab} onValueChange={value => setTab(value as FilterKey)}><SelectTrigger aria-label={t("Stato DDT")} className={cn(TENDINA_STATO_BARRA, "max-sm:h-9 max-sm:w-[8.5rem] max-sm:text-sm")}><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map(f => <SelectItem key={f.key} value={f.key}>{f.key === "tutti" ? t("Tutti gli stati") : f.label}</SelectItem>)}</SelectContent></Select>{!telefono && <OperationalViewSwitch
            value={view}
            onChange={(v) => update({ vista: v, ambito: archive.scope })}
          />}<OperationalExtraFilters count={Number(filterOrder !== "all") + Number(filterSupplier !== "all") + Number(filterPeriodo !== "tutto") + Number(!!focus) + Number(archive.scope !== "all")}>      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">

          <OperationalHelp>
            {t("Apri un DDT per registrare la ricezione, verificare la merce o consultare gli allegati. I documenti con danni sono raccolti tra le non conformità.")}
          </OperationalHelp>

          <Select value={filterOrder} onValueChange={setFilterOrder}>
            <SelectTrigger
              aria-label={t("Commessa DDT")}
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tutte le commesse")}</SelectItem>
              <SelectItem value="none">{t("Senza commessa")}</SelectItem>
              {commesseInElenco.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger
              aria-label={t("Fornitore DDT")}
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tutti i fornitori")}</SelectItem>
              {fornitoriInElenco.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!!activeFiltersCount && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              {t("Azzera ({n})", { n: activeFiltersCount })}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 sm:flex-nowrap">

          <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
            <SelectTrigger
              aria-label={t("Data ricezione DDT")}
              className="h-8 w-[190px] shrink-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutto">{t("Ricezione: sempre")}</SelectItem>
              <SelectItem value="30">{t("Ultimi 30 giorni")}</SelectItem>
              <SelectItem value="90">{t("Ultimi 90 giorni")}</SelectItem>
              <SelectItem value="anno">{t("Quest’anno")}</SelectItem>
              <SelectItem value="personalizzato">{t("Intervallo di date")}</SelectItem>
            </SelectContent>
          </Select>
          {filterPeriodo === "personalizzato" && <OperationalDateRange from={dateFrom} to={dateTo} onChange={values => update(values)} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <OperationalArchive
            label="DDT"
            scope={archive.scope}
            onChange={(v) =>
              archive.setScope(v, ["ddt_stato", "ddt_focus", "ddt_pagina"])
            }
            active={
              baseFiltered.filter((d) => stage(d) !== "verificato").length +
              pendingBase.length
            }
            history={
              baseFiltered.filter((d) => stage(d) === "verificato").length
            }
          />
          <span>
            {rows.length === 1 ? t("{n} documento caricato", { n: 1 }) : t("{n} documenti caricati", { n: rows.length })} · {t("{n} da registrare", { n: pending.length })}
            {focus === "pendenti"
              ? ` ${t("· Attesi e parziali")}`
              : focus === "verifica"
                ? ` ${t("· Ricevuti da verificare")}`
                : ""}
          </span>
          <span>{t("Le esportazioni includono i DDT registrati filtrati.")}</span>
        </div>
      </div></OperationalExtraFilters></div>
      </section>

      {canCreate && ingresso.ripresaLocale.queueCount > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          {t("{n} invii conservati su questo dispositivo. Lascia aperta la pagina per completarli.", { n: ingresso.ripresaLocale.queueCount })}{" "}
          {ingresso.ripresaLocale.failedCount > 0 && (
            <Button
              variant="link"
              size="sm"
              onClick={() => void ingresso.ripresaLocale.retry()}
            >
              {t("Riprova invii")}
            </Button>
          )}
        </p>
      )}
      {canCreate && ingresso.query.isError && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {t("Le letture in ingresso non sono aggiornate. I documenti già caricati restano disponibili.")}{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => void ingresso.query.refetch()}
          >
            {t("Riprova letture")}
          </Button>
        </p>
      )}
      {canCreate && ingresso.query.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Caricamento documenti in lettura…")}
        </p>
      )}
      {canCreate && tab === "da_registrare" && !focus && archive.scope !== "history" && (
        <RiepilogoInviiWhatsApp invii={ingresso.invii} selezionato={invioSelezionato}
          onApri={invio => update({ invio, stato: "da_registrare", cerca: null, commessa: null, fornitore: null,
            periodo: null, da: null, a: null, focus: null, pagina: null })} />
      )}
      {canCreate && ingresso.infoNonAggiornate && <p role="status" className="text-sm text-muted-foreground">{t("Riepilogo invii e confronto duplicati momentaneamente indisponibili.")}</p>}

      {/* ─── List ─────────────────────────────────────────────── */}
      {isError ? (
        <div role="alert" className="rounded-xl border p-6 text-sm">
          {t("Impossibile caricare i DDT.")}{" "}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("Riprova")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          hasFilter={activeFiltersCount > 0}
          canCreate={canCreate}
          onCreate={() => {
            if (canCreate) setNewOpen(true);
          }}
        />
      ) : view === "pipeline" && tab !== "da_registrare" ? (
        <>
          {pending.length > 0 && (
            <OperationalTable label={t("Documenti da registrare")}>
              <thead>
                <tr>
                  <th>{t("Documento")}</th>
                  <th>{t("Stato")}</th>
                  <th>{t("Data")}</th>
                  <th>{t("Fornitore")}</th>
                  <th>{t("OdA")}</th>
                  <th>{t("Commessa")}</th>
                  <th>{t("Corriere")}</th>
                  <th>{t("Destinazione")}</th>
                  <th>{t("Allegati")}</th>
                  <th>{t("Q.tà")}</th>
                  <th>{t("Azioni")}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((j) => (
                  <RigaDocumentoInIngresso
                    key={j.id}
                    documento={j}
                    duplicato={ingresso.duplicati.get(j.id)}
                    apri={j => navigate(`/azienda/ordini?tab=ddt&ddt_documento=${j.id}`)}
                    riprova={ingresso.riprova}
                    riprovando={ingresso.riprovando}
                  />
                ))}
              </tbody>
            </OperationalTable>
          )}
          <OperationalBoard
            label={t("Pipeline DDT")}
            onOpen={(ddt) => navigate(`/azienda/ddt/${ddt.id}`)}
            onMove={canCreate ? moveDocument : undefined}
            disabled={movement.saving}
            getLabel={(r) => r.numero_ddt}
            columns={columns}
            renderCard={renderCard}
          />
        </>
      ) : (
        <>
          {selection.toolbar}
          {selection.confirmation}
          {telefono ? (
            <ul aria-label={t("Elenco DDT")} className="divide-y overflow-hidden rounded-lg border bg-card">
              {visibleRows.map((row) => {
                if (row.tipo === "documento") {
                  const j = row.documento;
                  return (
                    <li key={j.id} className="bg-amber-50/40">
                      <button type="button" onClick={() => navigate(`/azienda/ordini?tab=ddt&ddt_documento=${j.id}`)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{nomeDocumentoInIngresso(j)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ingresso.duplicati.get(j.id) ? `${t("Possibile duplicato")} · ` : ""}{j.order_id ? t("Commessa assegnata") : t("Da associare")}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          {STATO_DOCUMENTO[j.status]}
                        </span>
                      </button>
                    </li>
                  );
                }
                const ddt = row.ddt;
                const fornitore = fornitoreNomeDi(ddt) ?? ddt.purchase_orders?.oda_number ?? t("Fornitore da indicare");
                return (
                  <li key={ddt.id}>
                    <Link to={`/azienda/ddt/${ddt.id}`} className="flex w-full items-center gap-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{fornitore}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          DDT {ddt.numero_ddt}{ddt.data_ricezione ? ` · ${new Date(ddt.data_ricezione).toLocaleDateString(intlCampo(), { day: "2-digit", month: "2-digit", year: "2-digit" })}` : ""}{ddt.has_damages ? ` ${t("· con danni")}` : ""}
                        </span>
                      </span>
                      <DDTStatusBadge stato={ddt.stato} size="sm" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
          <OperationalTable label={t("Elenco DDT")}>
            <thead>
              <tr className="border-b bg-muted/50">
                {selection.enabled && <th scope="col">{selection.header}</th>}
                <SortableTh
                  label={t("N° DDT")}
                  active={sort.key === "numero"}
                  direction={sort.direction}
                  onClick={() => handleSort("numero")}
                />
                <SortableTh
                  label={t("Stato")}
                  active={sort.key === "stato"}
                  direction={sort.direction}
                  onClick={() => handleSort("stato")}
                />
                <SortableTh
                  label={t("Data")}
                  active={sort.key === "data"}
                  direction={sort.direction}
                  onClick={() => handleSort("data")}
                />
                <SortableTh
                  label={t("Fornitore")}
                  active={sort.key === "fornitore"}
                  direction={sort.direction}
                  onClick={() => handleSort("fornitore")}
                />
                <th scope="col">{t("OdA")}</th>
                <th scope="col">{t("Commessa")}</th>
                <SortableTh
                  label={t("Corriere")}
                  active={sort.key === "corriere"}
                  direction={sort.direction}
                  onClick={() => handleSort("corriere")}
                />
                <SortableTh
                  label={t("Magazzino")}
                  active={sort.key === "magazzino"}
                  direction={sort.direction}
                  onClick={() => handleSort("magazzino")}
                />
                <SortableTh
                  label={t("Allegati")}
                  active={sort.key === "allegati"}
                  direction={sort.direction}
                  onClick={() => handleSort("allegati")}
                  align="center"
                />
                <SortableTh
                  label={t("Q.tà")}
                  active={sort.key === "quantita"}
                  direction={sort.direction}
                  onClick={() => handleSort("quantita")}
                  align="right"
                />
                <th scope="col">{t("Azioni")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                if (row.tipo === "documento")
                  return (
                    <RigaDocumentoInIngresso
                      key={row.documento.id}
                      documento={row.documento}
                      duplicato={ingresso.duplicati.get(row.documento.id)}
                      apri={j => navigate(`/azienda/ordini?tab=ddt&ddt_documento=${j.id}`)}
                      riprova={ingresso.riprova}
                      riprovando={ingresso.riprovando}
                      colonnaSelezione={selection.enabled}
                    />
                  );
                const ddt = row.ddt;
                const po = ddt.purchase_orders;
                const attachCount =
                  (ddt.attachments?.length ?? 0) + (ddt.ddt_file_url ? 1 : 0);
                return (
                  <tr
                    key={ddt.id}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                  >
                    {selection.enabled && <td onClick={e => e.stopPropagation()}>{selection.checkbox(ddt.id, ddt.numero_ddt)}</td>}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {ddt.ddt_file_url && (
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <Link
                          to={`/azienda/ddt/${ddt.id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {ddt.numero_ddt}
                        </Link>
                      </div>
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {canCreate ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto gap-1 px-1"
                              disabled={movement.saving}
                              aria-label={t("Gestisci stato DDT {numero}: {stato}", { numero: ddt.numero_ddt, stato: t(DDT_STATO_META[ddt.stato as keyof typeof DDT_STATO_META]?.label ?? ddt.stato) })}
                            >
                              <DDTStatusBadge stato={ddt.stato} size="sm" />
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuLabel>{t("Cambia stato")}</DropdownMenuLabel>
                            {FILTERS.filter(
                              (f) =>
                                !["tutti", "da_registrare"].includes(f.key),
                            ).map((f) => (
                              <DropdownMenuItem
                                key={f.key}
                                disabled={stage(ddt) === f.key}
                                onSelect={() => moveDocument(ddt.id, f.key)}
                              >
                                {t(f.label)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <DDTStatusBadge stato={ddt.stato} size="sm" />
                      )}
                      {ddt.has_damages && (
                        <AlertTriangle className="ml-1 inline-block h-3 w-3 text-rose-500" />
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {ddt.data_ricezione
                        ? format(new Date(ddt.data_ricezione), "dd/MM/yyyy", {
                            locale: dateFnsCampo(),
                          })
                        : "—"}
                    </td>
                    <td>
                      <span
                        className="block min-w-40 max-w-56 truncate font-medium"
                        title={fornitoreNomeDi(ddt) ?? undefined}
                      >
                        {fornitoreNomeDi(ddt) || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {po?.oda_number ? (
                        <Link
                          to={`/azienda/ordini-acquisto/${po.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {po.oda_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {commessaIdDi(ddt) && commessaCodiceDi(ddt) ? (
                        <Link
                          to={`/azienda/ordini/${commessaIdDi(ddt)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {commessaCodiceDi(ddt)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {ddt.corriere ? (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[140px]">
                            {ddt.corriere}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {ddt.warehouses?.name ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <WarehouseIcon className="h-3 w-3" />
                          {magazziniConsegneDDT(ddt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {magazziniConsegneDDT(ddt)}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {attachCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                          <Paperclip className="h-3 w-3" />
                          {attachCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="min-w-48 max-w-64 whitespace-normal p-3 text-right text-xs font-medium">
                      {riepilogoQuantitaDDT(ddt)}
                    </td>
                    <td>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                      >
                        <Link to={`/azienda/ddt/${ddt.id}`}>
                          {t("Apri")}
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </OperationalTable>
          )}
          <OperationalPagination
            page={page}
            total={rows.length}
            onChange={(v) => update({ pagina: String(v) })}
            label={t("Pagine DDT")}
          />
        </>
      )}

      {canCreate && ingresso.query.hasNextPage && (
        <Button
          variant="outline"
          disabled={ingresso.query.isFetchingNextPage}
          onClick={() => void ingresso.query.fetchNextPage()}
        >
          {ingresso.query.isFetchingNextPage
            ? t("Caricamento…")
            : ingresso.query.isFetchNextPageError
              ? t("Riprova a caricare altri documenti")
              : t("Carica altri documenti da registrare")}
        </Button>
      )}

      {/* ─── New DDT Wizard ─────────────────────────────────── */}
      {movement.dialog}
      {canCreate && <NewDDTDialog open={newOpen} onOpenChange={setNewOpen} />}
      {canCreate && bloccoOpen && (
        <BolleInBloccoDialog open onOpenChange={setBloccoOpen} />
      )}
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================
function EmptyState({
  hasFilter,
  canCreate,
  onCreate,
}: {
  hasFilter: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const t = useT();
  return (
    <div className="text-center py-12 sm:py-16 space-y-3 rounded-lg border-2 border-dashed">
      <div className="h-12 w-12 mx-auto rounded-full bg-muted flex items-center justify-center">
        <FileCheck className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-muted-foreground font-medium">
        {hasFilter
          ? t("Nessun DDT corrisponde ai filtri")
          : t("Nessun DDT registrato")}
      </p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {hasFilter
          ? t("Prova a cambiare i filtri o la ricerca per trovare il DDT.")
          : t("Registra il primo DDT per tracciare le ricezioni merce con allegati, dati corriere e verifica qualità.")}
      </p>
      {canCreate && !hasFilter && (
        <Button
          onClick={onCreate}
          className="mt-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
        >
          <Plus className="h-4 w-4 mr-1" /> {t("Registra primo DDT")}
        </Button>
      )}
    </div>
  );
}
