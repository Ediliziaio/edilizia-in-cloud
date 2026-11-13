import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  Columns3,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  MessageSquare,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateIt } from "@/lib/formatters";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { neutralizeCsvFormula } from "@/lib/csvExport";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import {
  bankRpc,
  bankCausale,
  bankVisibilityKey,
  bankState,
  bankJobs,
  bankFiltersPayload,
  loadBankPage,
  EMPTY_BANK_FILTERS,
  CONTEXT_LABELS,
  type BankFilters,
  type BankMovement,
  type BankPage,
} from "@/lib/finance/bankWorkspace";
import { BankMovementDetail } from "./BankMovementDetail";
import { prettyTxDesc } from "./txLabel";

const columns = {
  counterparty: "Controparte",
  account: "Conto",
  category: "Categoria",
  state: "Riconciliazione",
  matched: "Abbinato",
  remaining: "Residuo",
  documents: "Fatture e pagamenti",
  jobs: "Commesse",
  contexts: "Altri riferimenti",
  notes: "Note interne",
  reference: "Riferimento",
  value_date: "Data valuta",
};
type Column = keyof typeof columns;
const defaults: Column[] = [
  "counterparty",
  "account",
  "state",
  "remaining",
  "documents",
  "jobs",
  "contexts",
  "notes",
];
const states: Record<string, string> = {
  all: "Tutti i movimenti",
  work: "Da lavorare",
  suggestion: "Da verificare",
  pending: "Da collegare",
  partial: "Parziali",
  reconciled: "Riconciliate",
  ignored: "Senza fattura",
};
const categoryChoices = [
  "Clienti",
  "Fornitori",
  "Stipendi",
  "Affitti",
  "Tasse & Tributi",
  "Utenze",
  "Assicurazioni",
  "Ristorazione",
  "Trasferte",
  "Bancario",
  "Entrata",
];
export default function TransactionsFeed({
  companyId,
  refreshKey = 0,
  mode = "all",
}: {
  companyId: string;
  refreshKey?: number;
  mode?: "all" | "reconcile";
}) {
  const perms = usePermissions();
  const { user } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const previousCompany = useRef(companyId);
  const [filters, setFilters] = useState<BankFilters>(() => ({
    ...EMPTY_BANK_FILTERS,
    state: mode === "reconcile" ? "work" : "all",
  }));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<string | null>(() =>
    params.get("movimento"),
  );
  const prefKey = `eic:bank-columns:${user?.id ?? "user"}:${companyId}`;
  const [visible, setVisible] = useState<Column[]>(defaults);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(prefKey) ?? "null");
      setVisible(
        Array.isArray(raw)
          ? raw.filter(
              (k): k is Column => typeof k === "string" && k in columns,
            )
          : defaults,
      );
    } catch {
      setVisible(defaults);
    }
  }, [prefKey]);
  useEffect(() => {
    setPage(0);
    if (previousCompany.current !== companyId) {
      previousCompany.current = companyId;
      setSelected(null);
      setSearch("");
      setFilters({
        ...EMPTY_BANK_FILTERS,
        state: mode === "reconcile" ? "work" : "all",
      });
      if (params.has("movimento")) {
        const next = new URLSearchParams(params);
        next.delete("movimento");
        setParams(next, { replace: true });
      }
    } else setSelected(params.get("movimento"));
  }, [companyId]);
  useEffect(() => {
    if (filters.search === search) return;
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters.search]);
  const change = (key: keyof BankFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const validation = useMemo(() => {
    try {
      bankFiltersPayload(filters);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Filtri non validi";
    }
  }, [filters]);
  const data = useQuery({
    queryKey: [
      "bank-movimenti-workspace",
      companyId,
      filters,
      page,
      refreshKey,
      bankVisibilityKey(perms),
    ],
    queryFn: () => loadBankPage(companyId, filters, page),
    enabled: !!companyId && !validation,
    retry: false,
  });
  const accounts = useQuery({
    queryKey: ["bank-workspace-accounts", companyId, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts_operativi")
        .select("id,display_name,account_name,iban,currency")
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
  const active = Object.entries(filters).filter(
    ([k, v]) => v !== EMPTY_BANK_FILTERS[k as keyof BankFilters],
  );
  const shown = Object.keys(columns).filter((k) =>
    visible.includes(k as Column),
  ) as Column[];
  const reset = () => {
    setFilters({
      ...EMPTY_BANK_FILTERS,
      state: mode === "reconcile" ? "work" : "all",
    });
    setSearch("");
    setPage(0);
  };
  const select = (key: Column) =>
    setVisible((v) => {
      const next = v.includes(key) ? v.filter((x) => x !== key) : [...v, key];
      try {
        localStorage.setItem(prefKey, JSON.stringify(next));
      } catch {
        /* Preferences do not affect financial data. */
      }
      return next;
    });
  function close() {
    setSelected(null);
    if (params.has("movimento")) {
      const next = new URLSearchParams(params);
      next.delete("movimento");
      setParams(next, { replace: true });
    }
  }
  async function scan() {
    setScanning(true);
    try {
      const n = await bankRpc<number>("bank_suggerisci_riconciliazioni", {
        p_company: companyId,
      });
      toast.success(`${n} nuove proposte da verificare`, {
        description: "Nessun pagamento registrato automaticamente.",
      });
      refreshFinancialQueries(client);
      change("state", "suggestion");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analisi non riuscita");
    } finally {
      setScanning(false);
    }
  }
  async function exportAll() {
    setExporting(true);
    try {
      const entries: BankMovement[] = [];
      let count = -1;
      for (let offset = 0; count < 0 || offset < count; offset += 100) {
        const result = await bankRpc<BankPage>("bank_movimenti_elenco", {
          p_company: companyId,
          p_filters: bankFiltersPayload(filters),
          p_offset: offset,
          p_limit: 100,
        });
        if (count >= 0 && count !== result.count)
          throw new Error(
            "I movimenti sono cambiati durante l’esportazione. Riprova.",
          );
        count = result.count;
        entries.push(...result.rows);
        if (!result.rows.length) break;
      }
      if (
        entries.length !== count ||
        new Set(entries.map((r) => r.id)).size !== entries.length
      )
        throw new Error("Esportazione incompleta: aggiorna e riprova.");
      const matrix: unknown[][] = [
        [
          "Data",
          "Causale originale",
          "Controparte",
          "Conto",
          "Importo",
          "Valuta",
          "Stato",
          "Abbinato",
          "Residuo",
          "Documenti",
          "Commesse",
          "Altri riferimenti",
          "Note interne",
          "Riferimento",
          "Data valuta",
        ],
        ...entries.map((m) => [
          m.booking_date,
          m.description ?? "",
          m.transaction_type === "credit" ? m.debtor_name : m.creditor_name,
          m.account_name,
          String(m.amount).replace(".", ","),
          m.currency,
          bankState(m).label,
          String(m.links.matched).replace(".", ","),
          String(m.links.remaining).replace(".", ","),
          m.links.financial.map((f) => `${f.label}: ${f.amount}`).join(" | "),
          bankJobs(m)
            .map((j) => j.label)
            .join(" | "),
          m.links.contexts
            .map((c) => `${CONTEXT_LABELS[c.kind]}: ${c.label} (${c.amount})`)
            .join(" | "),
          m.note,
          m.reference,
          m.value_date,
        ]),
      ];
      const csv =
        "\uFEFF" +
        matrix
          .map((row) =>
            row
              .map(
                (v) =>
                  '"' +
                  neutralizeCsvFormula(String(v ?? "")).replaceAll('"', '""') +
                  '"',
              )
              .join(";"),
          )
          .join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `movimenti-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Esportati ${entries.length} movimenti`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Esportazione non riuscita");
    } finally {
      setExporting(false);
    }
  }
  function cell(m: BankMovement, k: Column) {
    switch (k) {
      case "counterparty":
        return (
          <span
            title={
              (m.transaction_type === "credit"
                ? m.debtor_name
                : m.creditor_name) ?? ""
            }
          >
            {(m.transaction_type === "credit"
              ? m.debtor_name
              : m.creditor_name) || "—"}
          </span>
        );
      case "account":
        return m.account_name;
      case "category":
        return m.category || "—";
      case "state": {
        const s = bankState(m);
        return (
          <button
            type="button"
            onClick={() => setSelected(m.id)}
            aria-label={`${s.label}: apri ${prettyTxDesc(m)}`}
          >
            <Badge
              variant="outline"
              className={`whitespace-nowrap ${s.className}`}
            >
              {s.label}
            </Badge>
          </button>
        );
      }
      case "matched":
        return money(m.links.matched, "—", m.currency);
      case "remaining":
        return money(m.links.remaining, "—", m.currency);
      case "documents":
        return m.links.financial.length ? (
          <button
            type="button"
            className="max-w-60 truncate text-left text-primary hover:underline"
            onClick={() => setSelected(m.id)}
            title={m.links.financial.map((f) => f.label).join(" · ")}
          >
            {m.links.financial[0].label}
            {m.links.financial.length > 1 &&
              ` +${m.links.financial.length - 1}`}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "jobs": {
        const jobs = bankJobs(m);
        return jobs.length ? (
          <span className="flex items-center gap-1">
            <Link
              to={jobs[0].url!}
              className="max-w-48 truncate text-primary hover:underline"
              title={jobs[0].label}
            >
              {jobs[0].label}
            </Link>
            {jobs.length > 1 && (
              <button
                onClick={() => setSelected(m.id)}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                +{jobs.length - 1}
              </button>
            )}
          </span>
        ) : (
          <button
            className="text-primary hover:underline"
            onClick={() => setSelected(m.id)}
          >
            {perms.canReconcileBankTransactions ? "Collega" : "—"}
          </button>
        );
      }
      case "contexts": {
        const list = m.links.contexts.filter((c) => c.kind !== "commessa");
        return list.length ? (
          <button
            onClick={() => setSelected(m.id)}
            className="max-w-52 truncate text-left hover:underline"
            title={list.map((c) => c.label).join(" · ")}
          >
            {list[0].label}
            {list.length > 1 && ` +${list.length - 1}`}
          </button>
        ) : (
          "—"
        );
      }
      case "notes":
        return m.note ? (
          <button
            type="button"
            title={m.note}
            onClick={() => setSelected(m.id)}
            className="flex max-w-64 items-center gap-2 text-left"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{m.note}</span>
          </button>
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => setSelected(m.id)}
          >
            {perms.canReconcileBankTransactions ? "Aggiungi nota" : "—"}
          </button>
        );
      case "reference":
        return <span title={m.reference ?? ""}>{m.reference || "—"}</span>;
      case "value_date":
        return formatDateIt(m.value_date);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {mode === "reconcile"
              ? "Verifica e riconcilia"
              : "Movimenti bancari"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Un movimento, tutti i collegamenti. Quote, documenti e note nello
            stesso dettaglio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.canReconcileBankTransactions && (
            <Button
              variant="outline"
              onClick={() => void scan()}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Trova corrispondenze
            </Button>
          )}
          <Button
            variant="outline"
            disabled={exporting || !!validation || !data.data?.count}
            onClick={() => void exportAll()}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Esporta risultati
          </Button>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cerca movimenti"
              placeholder="Causale, nome, importo, data, fattura, commessa o note…"
              className="pl-9"
            />
          </div>
          <select
            aria-label="Filtra per conto"
            value={filters.account}
            onChange={(e) => change("account", e.target.value)}
            className="h-10 max-w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Tutti i conti</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name || a.account_name || a.iban || "Conto"}
              </option>
            ))}
          </select>
          <Button
            variant={expanded ? "secondary" : "outline"}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filtri {active.length > 0 && `(${active.length})`}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3 className="mr-2 h-4 w-4" />
                Colonne
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(columns).map(([k, l]) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={visible.includes(k as Column)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => select(k as Column)}
                >
                  {l}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {accounts.isError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Elenco conti non disponibile.{" "}
            <button
              className="underline"
              onClick={() => void accounts.refetch()}
            >
              Riprova
            </button>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "all",
            "work",
            "suggestion",
            "partial",
            "reconciled",
            "ignored",
          ].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filters.state === s ? "default" : "outline"}
              onClick={() => change("state", s)}
            >
              {states[s]}
            </Button>
          ))}
        </div>
        {expanded && (
          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [
                  "direction",
                  "Direzione",
                  [
                    ["all", "Entrate e uscite"],
                    ["credit", "Entrate"],
                    ["debit", "Uscite"],
                  ],
                ],
                ["state", "Riconciliazione", Object.entries(states)],
                [
                  "linked",
                  "Collegamenti",
                  [
                    ["all", "Tutti"],
                    ["yes", "Con collegamenti"],
                    ["no", "Senza collegamenti"],
                    ...Object.entries(CONTEXT_LABELS),
                  ],
                ],
                [
                  "category",
                  "Categoria",
                  [
                    ["all", "Tutte le categorie"],
                    ...Array.from(
                      new Set([
                        ...categoryChoices,
                        ...(data.data?.facets?.categories ?? []),
                      ]),
                    )
                      .sort()
                      .map((c) => [c, c]),
                  ],
                ],
                [
                  "currency",
                  "Valuta",
                  [
                    ["all", "Tutte le valute"],
                    ...Array.from(
                      new Set([
                        "EUR",
                        ...(accounts.data ?? []).map(
                          (a) => a.currency || "EUR",
                        ),
                        ...(data.data?.facets?.currencies ?? []),
                      ]),
                    ).map((c) => [c, c]),
                  ],
                ],
              ] as [keyof BankFilters, string, string[][]][]
            ).map(([k, label, opts]) => (
              <label key={k} className="text-xs text-muted-foreground">
                {label}
                <select
                  aria-label={label}
                  value={filters[k]}
                  onChange={(e) => change(k, e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  {opts.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {(
              [
                ["from", "Dal", "date"],
                ["to", "Al", "date"],
                ["min", "Importo minimo (assoluto)", "text"],
                ["max", "Importo massimo (assoluto)", "text"],
              ] as [keyof BankFilters, string, string][]
            ).map(([k, l, t]) => (
              <label key={k} className="text-xs text-muted-foreground">
                {l}
                <Input
                  aria-label={l}
                  type={t}
                  inputMode={t === "text" ? "decimal" : undefined}
                  value={filters[k]}
                  onChange={(e) => change(k, e.target.value)}
                  className="mt-1 text-foreground"
                />
              </label>
            ))}
          </div>
        )}
        {active.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {active.map(([k, v]) => (
              <button
                key={k}
                onClick={() => {
                  if (k === "search") setSearch("");
                  change(
                    k as keyof BankFilters,
                    EMPTY_BANK_FILTERS[k as keyof BankFilters],
                  );
                }}
                className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs"
                aria-label={`Rimuovi filtro ${k}`}
              >
                <span className="truncate">
                  {k === "state"
                    ? states[v]
                    : k === "account"
                      ? accounts.data?.find((a) => a.id === v)?.display_name ||
                        "Conto selezionato"
                      : `${({ search: "Ricerca", direction: "Direzione", category: "Categoria", currency: "Valuta", linked: "Collegamenti", from: "Dal", to: "Al", min: "Minimo", max: "Massimo" } as Record<string, string>)[k] ?? k}: ${v}`}
                </span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
            <button
              onClick={reset}
              className="text-xs text-primary hover:underline"
            >
              Ripristina filtri
            </button>
          </div>
        )}
      </div>
      {validation && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 p-3 text-sm text-destructive"
        >
          {validation}
        </p>
      )}
      {!validation && data.isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 p-4 text-sm"
        >
          <p>Movimenti non disponibili: {data.error.message}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => void data.refetch()}
          >
            Riprova
          </Button>
        </div>
      )}
      {!validation && !data.isError && (
        <>
          {data.data?.totals.map((t) => (
            <div
              key={t.currency}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-muted/20 px-4 py-3 text-sm"
            >
              <span className="font-medium">
                {t.n} movimenti · {t.currency}
              </span>
              <span>
                Entrate{" "}
                <strong className="text-emerald-700">
                  {money(t.income, "—", t.currency)}
                </strong>
              </span>
              <span>
                Uscite{" "}
                <strong className="text-red-700">
                  {money(t.expenses, "—", t.currency)}
                </strong>
              </span>
              <span>
                Saldo dei movimenti{" "}
                <strong>{money(t.net, "—", t.currency)}</strong>
              </span>
            </div>
          ))}
          <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 z-20 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-[112px] bg-muted px-4 py-3 text-left max-sm:static">
                    Data
                  </th>
                  <th className="sticky left-[112px] top-0 z-30 min-w-64 bg-muted px-4 py-3 text-left max-sm:static">
                    Causale del bonifico
                  </th>
                  {shown.map((k) => (
                    <th key={k} className="px-4 py-3 text-left">
                      {columns[k]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Importo</th>
                  <th className="sticky right-0 bg-card px-3 py-3 text-right">
                    Dettaglio
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.isPending ? (
                  <tr>
                    <td
                      colSpan={shown.length + 4}
                      className="p-8 text-center"
                      role="status"
                    >
                      Caricamento movimenti…
                    </td>
                  </tr>
                ) : data.data?.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={shown.length + 4}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Nessun movimento con questi filtri.
                      {active.length > 0 && (
                        <Button variant="link" onClick={reset}>
                          Ripristina filtri
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  data.data?.rows.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-muted/20">
                      <td className="sticky left-0 z-10 min-w-[112px] bg-card px-4 py-3 max-sm:static">
                        {formatDateIt(m.booking_date)}
                      </td>
                      <td className="sticky left-[112px] z-10 min-w-64 max-w-80 bg-card px-4 py-3 max-sm:static">
                        <button
                          type="button"
                          className="flex max-w-full items-center gap-2 text-left font-medium hover:text-primary"
                          onClick={() => setSelected(m.id)}
                          title={bankCausale(m)}
                        >
                          {m.transaction_type === "credit" ? (
                            <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-red-600" />
                          )}
                          <span className="truncate">{bankCausale(m)}</span>
                        </button>
                        {m.status !== "booked" && (
                          <span className="text-xs text-muted-foreground">
                            In attesa in banca
                          </span>
                        )}
                      </td>
                      {shown.map((k) => (
                        <td key={k} className="max-w-80 px-4 py-3">
                          {cell(m, k)}
                        </td>
                      ))}
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${m.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {money(m.amount, "—", m.currency)}
                      </td>
                      <td className="sticky right-0 bg-card px-3 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Dettaglio movimento: ${prettyTxDesc(m)}`}
                          onClick={() => setSelected(m.id)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {data.data?.count ?? 0} risultati · pagina {page + 1} di{" "}
              {Math.max(1, Math.ceil((data.data?.count ?? 0) / 50))}
              {data.isFetching && !data.isPending && " · aggiornamento…"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || data.isFetching}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Pagina precedente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (page + 1) * 50 >= (data.data?.count ?? 0) || data.isFetching
                }
                onClick={() => setPage((p) => p + 1)}
                aria-label="Pagina successiva"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
      {selected && companyId && (
        <BankMovementDetail
          key={`${companyId}:${selected}`}
          company={companyId}
          id={selected}
          onClose={close}
        />
      )}
    </div>
  );
}
