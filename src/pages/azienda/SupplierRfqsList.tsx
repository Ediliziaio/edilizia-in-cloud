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
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileQuestion,
  ShoppingCart,
  Plus,
  Search,
  Clock,
  Inbox,
  Trophy,
  CalendarClock,
  AlertTriangle,
  X,
} from "lucide-react";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";
import {
  OperationalBoard,
  OperationalPagination,
} from "@/components/orders/OperationalBoard";
import { useSupplierRfqs, type SupplierRfq } from "@/hooks/useSupplierRfqs";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { usePermissions } from "@/hooks/usePermissions";
import { RDO_STATUS_LABELS, RDO_STATUS_COLORS } from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";
import {
  inOperationalPeriod,
  operationalPeriod,
  operationalPage,
  updateOperationalParams,
} from "@/lib/orders/operationalFilters";
import { cn } from "@/lib/utils";
import { format, differenceInCalendarDays } from "date-fns";

const dataIt = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const OPEN = ["bozza", "inviata", "in_valutazione"];
const STAGES = [
  {
    id: "bozza",
    label: "Da inviare",
    hint: "Completa le voci e invita i fornitori",
    accent: "border-t-slate-400",
  },
  {
    id: "inviata",
    label: "In attesa",
    hint: "Raccogli le risposte dei fornitori",
    accent: "border-t-blue-500",
  },
  {
    id: "in_valutazione",
    label: "In valutazione",
    hint: "Confronta prezzi e condizioni",
    accent: "border-t-amber-500",
  },
  {
    id: "aggiudicata",
    label: "Aggiudicate",
    hint: "Verifica l’ordine d’acquisto collegato",
    accent: "border-t-emerald-500",
  },
  {
    id: "chiusa",
    label: "Chiuse / annullate",
    hint: "Richieste concluse senza aggiudicazione",
    accent: "border-t-slate-300",
  },
];
const STATUSES = [
  "tutti",
  "aperte",
  "bozza",
  "inviata",
  "in_valutazione",
  "aggiudicata",
  "chiusa",
  "annullata",
];

export default function SupplierRfqsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  useOperationalViewMemory("rdo", [
    "rdo_vista",
    "rdo_ambito",
    "rdo_cerca",
    "rdo_stato",
    "rdo_commessa",
    "rdo_fornitore",
    "rdo_periodo",
    "rdo_focus",
  ]);
  const { rfqs, contatori, isLoading, isError, create } = useSupplierRfqs();
  const { suppliers } = useOperationalSuppliers();
  const perm = usePermissions();
  const canCreate =
    !perm.solaLettura &&
    (perm.canManagePurchasing || perm.canEditOrders || perm.isAdmin);
  const view = params.get("rdo_vista") === "elenco" ? "elenco" : "pipeline";
  const search = params.get("rdo_cerca") ?? "";
  const archive = useOperationalArchive(
    "rdo_ambito",
    params.has("rdo_stato") || view === "elenco" ? "all" : "active",
  );
  const rawStatus = params.get("rdo_stato") ?? "tutti";
  const status = STATUSES.includes(rawStatus) ? rawStatus : "tutti";
  const order = params.get("rdo_commessa") ?? "all";
  const supplier = params.get("rdo_fornitore") ?? "all";
  const period = operationalPeriod(params.get("rdo_periodo"));
  const focus = ["risposte", "attesa", "scadute"].includes(
    params.get("rdo_focus") ?? "",
  )
    ? params.get("rdo_focus")!
    : "";
  const update = (values: Record<string, string | null>) =>
    setParams(
      updateOperationalParams(
        params,
        "rdo",
        "stato" in values ? { ...values, ambito: "all" } : values,
      ),
      {
        replace: true,
      },
    );
  const clear = () =>
    update({
      cerca: null,
      stato: null,
      commessa: null,
      fornitore: null,
      periodo: null,
      focus: null,
    });
  const active = [
    !!search,
    status !== "tutti",
    order !== "all",
    supplier !== "all",
    period !== "tutto",
    !!focus,
  ].filter(Boolean).length;
  const today = format(new Date(), "yyyy-MM-dd");
  const overdue = (r: SupplierRfq) =>
    OPEN.includes(r.status) &&
    !!r.scadenza_offerte &&
    r.scadenza_offerte.slice(0, 10) < today;
  const [newOpen, setNewOpen] = useState(false);
  const movement = usePipelineTransition({ kind: "rfq", enabled: canCreate });
  const moveDocument = (id: string, target: string) => {
    const r = rfqs.find((r) => r.id === id);
    if (r)
      movement.request(
        {
          id: r.id,
          label: r.rfq_number,
          status: r.status,
          stage: ["chiusa", "annullata"].includes(r.status)
            ? "chiusa"
            : r.status,
          href: `/azienda/richieste-offerta/${r.id}`,
          responses: contatori[r.id]?.risposte ?? 0,
        },
        target,
      );
  };

  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [fabbisogno, setFabbisogno] = useState("");
  const [scadenza, setScadenza] = useState("");

  const commesse = useMemo(
    () =>
      [
        ...new Map(
          rfqs
            .filter((r) => r.order_id)
            .map((r) => [r.order_id!, r.orders?.order_code || "Commessa"]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1], "it", { numeric: true })),
    [rfqs],
  );
  const invited = new Set(Object.values(contatori).flatMap((c) => c.fornitori));
  const availableSuppliers = suppliers.filter((s) => invited.has(s.id));
  const base = rfqs.filter((r) => {
    const q = search.trim().toLocaleLowerCase("it");
    if (
      q &&
      ![r.rfq_number, r.titolo, r.descrizione, r.orders?.order_code].some((v) =>
        v?.toLocaleLowerCase("it").includes(q),
      )
    )
      return false;
    if (
      order === "none" ? !!r.order_id : order !== "all" && r.order_id !== order
    )
      return false;
    if (supplier !== "all" && !contatori[r.id]?.fornitori.includes(supplier))
      return false;
    return inOperationalPeriod(r.created_at, period);
  });
  const kpis = {
    aperte: base.filter((r) => OPEN.includes(r.status)).length,
    risposte: base.filter(
      (r) => OPEN.includes(r.status) && (contatori[r.id]?.risposte ?? 0) > 0,
    ).length,
    attesa: base.filter(
      (r) => OPEN.includes(r.status) && (contatori[r.id]?.inAttesa ?? 0) > 0,
    ).length,
    aggiudicate: base.filter((r) => r.status === "aggiudicata").length,
  };
  const matchesStatus = (r: SupplierRfq, value: string) =>
    value === "tutti" ||
    (value === "aperte" ? OPEN.includes(r.status) : r.status === value);
  const focused = base.filter(
    (r) =>
      !focus ||
      (focus === "scadute"
        ? overdue(r)
        : OPEN.includes(r.status) &&
          (focus === "risposte"
            ? (contatori[r.id]?.risposte ?? 0) > 0
            : (contatori[r.id]?.inAttesa ?? 0) > 0)),
  );
  const filtered = focused
    .filter(
      (r) =>
        matchesStatus(r, status) &&
        inOperationalScope(!OPEN.includes(r.status), archive.scope),
    )
    .sort((a, b) => {
      if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
  const page = operationalPage(params.get("rdo_pagina"), filtered.length);
  const visible = filtered.slice((page - 1) * 25, page * 25);
  const selectKpi = (value: string, nextFocus = "") =>
    update({ stato: value, focus: nextFocus });
  const response = (r: SupplierRfq) => {
    const c = contatori[r.id];
    const wait =
      OPEN.includes(r.status) && c?.inAttesa && c.attesaDal
        ? differenceInCalendarDays(new Date(), new Date(c.attesaDal))
        : 0;
    return (
      <div className="space-y-1 whitespace-nowrap text-xs">
        <span>
          {c?.risposte ?? 0}/{c?.invitati ?? 0} risposte
        </span>
        {wait > 3 && (
          <span className="ml-2 text-amber-700">
            In attesa da {wait} giorni
          </span>
        )}
      </div>
    );
  };
  const card = (r: SupplierRfq) => (
    <article
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-2 shadow-sm",
        overdue(r) && "border-orange-300",
      )}
    >
      <PipelineCardHeading>
        <Link
          to={`/azienda/richieste-offerta/${r.id}`}
          className="min-w-0 truncate font-mono text-xs font-semibold text-primary hover:underline"
          title={r.rfq_number}
        >
          {r.rfq_number}
        </Link>
        <Badge
          className={cn("shrink-0 text-[10px]", RDO_STATUS_COLORS[r.status])}
        >
          {RDO_STATUS_LABELS[r.status] ?? r.status}
        </Badge>
      </PipelineCardHeading>
      <Link
        to={`/azienda/richieste-offerta/${r.id}`}
        className="mt-1 block text-xs font-semibold hover:underline"
      >
        {r.titolo}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {r.orders?.order_code ?? "Senza commessa"}
      </p>
      {r.status === "aggiudicata" && r.supplier_id_aggiudicato && (
        <p className="mt-1 text-xs text-muted-foreground">
          Fornitore scelto:{" "}
          {suppliers.find((s) => s.id === r.supplier_id_aggiudicato)?.name ||
            "Apri aggiudicazione per i dettagli"}
        </p>
      )}
      <div className="my-2">{response(r)}</div>
      <p
        className={cn(
          "flex items-center gap-1 text-xs",
          overdue(r) ? "text-orange-700" : "text-muted-foreground",
        )}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Risposta entro {dataIt(r.scadenza_offerte)}
      </p>
      {r.data_fabbisogno && (
        <p className="mt-1 text-xs text-muted-foreground">
          Serve entro {dataIt(r.data_fabbisogno)}
        </p>
      )}
      {overdue(r) && (
        <p className="mt-1 text-xs font-medium text-orange-700">
          Termine di risposta superato
        </p>
      )}
      {perm.canViewCosts && contatori[r.id]?.migliore != null && (
        <p className="mt-3 text-xs">
          Migliore offerta{" "}
          <strong className="float-right tabular-nums">
            {formatCurrency(contatori[r.id].migliore!)}
          </strong>
        </p>
      )}
    </article>
  );
  const handleCreate = () => {
    if (!canCreate || !titolo.trim()) return;
    create.mutate(
      {
        titolo: titolo.trim(),
        descrizione: descrizione.trim() || undefined,
        data_fabbisogno: fabbisogno || null,
        scadenza_offerte: scadenza || null,
      },
      {
        onSuccess: (r) => {
          setNewOpen(false);
          setTitolo("");
          setDescrizione("");
          setFabbisogno("");
          setScadenza("");
          navigate(`/azienda/richieste-offerta/${r.id}`);
        },
      },
    );
  };

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Richieste d’offerta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inviti, risposte e confronto delle offerte, fino all’ordine al
            fornitore.
          </p>
        </div>
        <Button
          disabled={!canCreate}
          onClick={() => setNewOpen(true)}
          className="bg-orange-500 text-white hover:bg-orange-600"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuova richiesta
        </Button>
      </div>
      <section
        aria-label="Riepilogo richieste d’offerta"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <OperationalKpiCard
          icon={FileQuestion}
          label="Aperte"
          value={kpis.aperte}
          hint="bozze, inviate e in valutazione"
          tone="blue"
          isLoading={isLoading}
          onClick={() => selectKpi("aperte")}
          active={status === "aperte" && !focus}
        />
        <OperationalKpiCard
          icon={Inbox}
          label="Da valutare"
          value={kpis.risposte}
          hint="richieste con almeno una risposta"
          tone="amber"
          isLoading={isLoading}
          onClick={() => selectKpi("aperte", "risposte")}
          active={focus === "risposte"}
        />
        <OperationalKpiCard
          icon={Clock}
          label="In attesa di risposte"
          value={kpis.attesa}
          hint="richieste con fornitori in attesa"
          tone="orange"
          isLoading={isLoading}
          onClick={() => selectKpi("aperte", "attesa")}
          active={focus === "attesa"}
        />
        <OperationalKpiCard
          icon={Trophy}
          label="Aggiudicate"
          value={kpis.aggiudicate}
          hint="richieste assegnate a un fornitore"
          tone="green"
          isLoading={isLoading}
          onClick={() => selectKpi("aggiudicata")}
          active={status === "aggiudicata"}
        />
      </section>
      <section
        aria-label="Filtri richieste d’offerta"
        className="space-y-2 rounded-xl border bg-white p-2.5 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <OperationalViewSwitch
            value={view}
            onChange={(v) => update({ vista: v, ambito: archive.scope })}
          />
          <OperationalHelp>
            Apri una richiesta per invitare i fornitori, registrare una risposta
            o confrontare le offerte.
          </OperationalHelp>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca richieste d’offerta"
              placeholder="Cerca richiesta, oggetto o commessa…"
              value={search}
              onChange={(e) => update({ cerca: e.target.value })}
              className="h-8 pl-9 text-xs"
            />
          </div>
          <Select value={order} onValueChange={(v) => update({ commessa: v })}>
            <SelectTrigger
              aria-label="Commessa richieste d’offerta"
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le commesse</SelectItem>
              <SelectItem value="none">Senza commessa</SelectItem>
              {commesse.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={supplier}
            onValueChange={(v) => update({ fornitore: v })}
          >
            <SelectTrigger
              aria-label="Fornitore invitato"
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              {availableSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!!active && (
            <Button size="sm" variant="ghost" onClick={clear}>
              <X className="mr-1 h-3.5 w-3.5" />
              Azzera ({active})
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 sm:flex-nowrap">
          <div
            role="group"
            aria-label="Stato richieste d’offerta"
            className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-50 p-1 sm:flex-1"
          >
            {STATUSES.filter(
              (id) =>
                id === "tutti" ||
                (id === "aperte"
                  ? archive.scope !== "history"
                  : inOperationalScope(!OPEN.includes(id), archive.scope)),
            ).map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={status === id}
                onClick={() => update({ stato: id, focus: null })}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium",
                  status === id
                    ? "bg-orange-50 text-slate-950 ring-1 ring-orange-100"
                    : "text-muted-foreground hover:bg-white",
                )}
              >
                {id === "tutti"
                  ? "Tutte"
                  : id === "aperte"
                    ? "Aperte"
                    : RDO_STATUS_LABELS[id]}{" "}
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px]">
                  {
                    focused.filter(
                      (r) =>
                        matchesStatus(r, id) &&
                        inOperationalScope(
                          !OPEN.includes(r.status),
                          archive.scope,
                        ),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <Select value={period} onValueChange={(v) => update({ periodo: v })}>
            <SelectTrigger
              aria-label="Creazione richiesta"
              className="h-8 w-[190px] shrink-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutto">Creazione: sempre</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              <SelectItem value="anno">Quest’anno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <OperationalArchive
            label="richieste d’offerta"
            scope={archive.scope}
            onChange={(v) =>
              archive.setScope(v, ["rdo_stato", "rdo_focus", "rdo_pagina"])
            }
            active={base.filter((r) => OPEN.includes(r.status)).length}
            history={base.filter((r) => !OPEN.includes(r.status)).length}
          />
          <span>
            {filtered.length} di {rfqs.length} richieste
          </span>
          <Button
            variant={focus === "scadute" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={focus === "scadute"}
            onClick={() =>
              update({
                focus: focus === "scadute" ? null : "scadute",
                stato: "aperte",
              })
            }
          >
            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
            Risposta scaduta ({base.filter(overdue).length})
          </Button>
        </div>
      </section>
      {isError ? (
        <div role="alert" className="rounded-xl border p-6 text-sm">
          Impossibile caricare le richieste d’offerta. Riprova ricaricando la
          pagina.
        </div>
      ) : isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileQuestion className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-muted-foreground">
            {rfqs.length
              ? archive.scope === "active"
                ? "Nessuna richiesta aperta con questi filtri. Le richieste concluse sono nello storico."
                : "Nessuna richiesta con questi filtri."
              : "Nessuna richiesta d’offerta. Crea una richiesta per raccogliere e confrontare i prezzi dei fornitori."}
          </p>
          {archive.scope === "active" &&
            base.some((r) => !OPEN.includes(r.status)) && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() =>
                  archive.setScope("history", ["rdo_stato", "rdo_focus"])
                }
              >
                Consulta storico
              </Button>
            )}
          {!!active && (
            <Button variant="outline" className="mt-3" onClick={clear}>
              Azzera filtri
            </Button>
          )}
        </div>
      ) : view === "pipeline" ? (
        <>
          <OperationalBoard
            label="Pipeline richieste d’offerta"
            onOpen={(r) => navigate(`/azienda/richieste-offerta/${r.id}`)}
            renderActions={(r) =>
              r.purchase_order_id ? (
                <Button asChild variant="ghost" size="icon" className="h-6 w-6">
                  <Link
                    to={`/azienda/ordini-acquisto/${r.purchase_order_id}`}
                    aria-label="Apri ordine d’acquisto"
                    title="Ordine d’acquisto collegato"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null
            }
            onMove={canCreate ? moveDocument : undefined}
            disabled={movement.saving}
            getLabel={(r) => r.rfq_number}
            columns={STAGES.map((s) => ({
              ...s,
              items: filtered.filter((r) =>
                s.id === "chiusa"
                  ? ["chiusa", "annullata"].includes(r.status)
                  : r.status === s.id,
              ),
            }))}
            renderCard={card}
          />
        </>
      ) : (
        <>
          <OperationalTable label="Elenco richieste d’offerta">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                {[
                  "N° richiesta",
                  "Oggetto",
                  "Commessa",
                  "Risposta entro",
                  "Serve entro",
                  "Risposte",
                  ...(perm.canViewCosts ? ["Migliore offerta"] : []),
                  "Stato",
                ].map((v) => (
                  <th
                    key={v}
                    className="whitespace-nowrap p-3 text-xs font-medium"
                  >
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <Link
                      to={`/azienda/richieste-offerta/${r.id}`}
                      className="whitespace-nowrap font-mono text-xs text-primary hover:underline"
                    >
                      {r.rfq_number}
                    </Link>
                  </td>
                  <td>
                    <Link
                      to={`/azienda/richieste-offerta/${r.id}`}
                      className="block min-w-56 max-w-80 truncate font-medium hover:text-primary hover:underline"
                      title={r.titolo}
                    >
                      {r.titolo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">
                    {r.order_id ? (
                      <Link
                        to={`/azienda/ordini/${r.order_id}`}
                        className="text-primary hover:underline"
                      >
                        {r.orders?.order_code ?? "Apri commessa"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className={cn(
                      "p-3 whitespace-nowrap",
                      overdue(r) && "text-orange-700",
                    )}
                  >
                    {dataIt(r.scadenza_offerte)}
                    {overdue(r) && <p className="text-xs">Scaduta</p>}
                  </td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">
                    {dataIt(r.data_fabbisogno)}
                  </td>
                  <td className="p-3">{response(r)}</td>
                  {perm.canViewCosts && (
                    <td className="whitespace-nowrap p-3 text-right tabular-nums">
                      {contatori[r.id]?.migliore != null
                        ? formatCurrency(contatori[r.id].migliore!)
                        : "—"}
                    </td>
                  )}
                  <td className="p-3">
                    <Badge
                      className={cn(
                        "whitespace-nowrap",
                        RDO_STATUS_COLORS[r.status],
                      )}
                    >
                      {RDO_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </OperationalTable>
          <OperationalPagination
            page={page}
            total={filtered.length}
            onChange={(v) => update({ pagina: String(v) })}
            label="Pagine richieste d’offerta"
          />
        </>
      )}
      {movement.dialog}
      <Dialog open={newOpen && canCreate} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova richiesta d'offerta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rdo-titolo">Cosa ti serve</Label>
              <Input
                id="rdo-titolo"
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Es. Ferro d'armatura per fondazioni lotto B"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdo-desc">
                Dettagli per il fornitore (facoltativo)
              </Label>
              <Textarea
                id="rdo-desc"
                rows={2}
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Condizioni, luogo di consegna, requisiti particolari."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rdo-fab">Serve in cantiere entro</Label>
                <Input
                  id="rdo-fab"
                  type="date"
                  value={fabbisogno}
                  onChange={(e) => setFabbisogno(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rdo-scad">Risposta entro</Label>
                <Input
                  id="rdo-scad"
                  type="date"
                  value={scadenza}
                  onChange={(e) => setScadenza(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Prossimo passo: elenchi cosa serve e a quali fornitori. Se l'hai
              già chiesta per telefono o WhatsApp, la segni come chiesta e
              scrivi i prezzi quando arrivano.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || !titolo.trim() || create.isPending}
            >
              {create.isPending ? "Creazione..." : "Crea richiesta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
