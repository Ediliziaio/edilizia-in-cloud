import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  Loader2,
  Search,
  ShieldCheck,
  AlertTriangle,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  bankRpc,
  bankCausale,
  bankState,
  bankVisibilityKey,
  loadBankPage,
  bankFiltersPayload,
  type BankFilters,
  type BankMovement,
} from "@/lib/finance/bankWorkspace";
import {
  draftAllocated,
  draftDifference,
  draftPayload,
  draftProblem,
  ownAccountTransfer,
  proposalClaims,
  strongProposal,
  type BankDraft,
  type BankProposal,
} from "@/lib/finance/bankReconciliationBatch";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { formatDateIt } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { BankMovementDetail } from "./BankMovementDetail";
import {
  syncBankExternalPayments,
  type BankBatchResult,
} from "@/lib/finance/bankExternalPayments";

type Account = {
  id: string;
  display_name?: string | null;
  account_name?: string | null;
  iban?: string | null;
};
const categories = [
  ["Bancario", "Commissioni bancarie"],
  ["Tasse & Tributi", "F24, imposte e tributi"],
  ["Stipendi", "Stipendi"],
  ["Finanziamento", "Finanziamento / leasing"],
  ["Giroconto", "Giroconto tra conti aziendali"],
  ["Arrotondamento", "Arrotondamento"],
  ["Altra spesa", "Altra spesa"],
  ["Altra entrata", "Altra entrata"],
];
function fresh(m: BankMovement): BankDraft {
  return {
    movement: m,
    mode: "documents",
    rows: {},
    note: "",
    category: "",
    differenceReason: "",
    reviewed: false,
  };
}

/** Drafts live above filters and pagination. Nothing is posted before the final confirmation. */
export function BankReconciliationWorkspace({
  company,
  filters: initial,
  accounts,
  onClose,
}: {
  company: string;
  filters: BankFilters;
  accounts: Account[];
  onClose: () => void;
}) {
  const perms = usePermissions();
  const client = useQueryClient();
  const [filters, setFilters] = useState<BankFilters>(() => ({
    ...initial,
    state: "work",
    direction: initial.direction === "all" ? "credit" : initial.direction,
  }));
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, BankDraft>>({});
  const [proposals, setProposals] = useState<Record<string, BankProposal[]>>(
    {},
  );
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [closeWarning, setCloseWarning] = useState(false);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const selected = Object.values(drafts).filter((d) => d.reviewed);
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  let validation: string | null = null;
  try {
    bankFiltersPayload(filters);
  } catch (e) {
    validation = e instanceof Error ? e.message : "Filtri non validi";
  }
  const movements = useQuery({
    queryKey: [
      "bank-lotto-movimenti",
      company,
      filters,
      page,
      bankVisibilityKey(perms),
    ],
    queryFn: () => loadBankPage(company, filters, page),
    enabled: !validation,
    retry: false,
  });
  const rows = movements.data?.rows ?? [];
  const focused = focus
    ? (drafts[focus]?.movement ?? rows.find((m) => m.id === focus))
    : undefined;
  const candidates = useQuery({
    queryKey: [
      "bank-lotto-candidati",
      company,
      focus,
      term,
      bankVisibilityKey(perms),
    ],
    queryFn: () =>
      bankRpc<BankProposal[]>("bank_proposte_movimento", {
        p_company: company,
        p_tx: focus,
        p_search: term,
      }),
    enabled: !!focus && focused?.currency === "EUR",
    retry: false,
  });
  const claims = useMemo(() => proposalClaims(proposals), [proposals]);
  const invalid = selected
    .map((d) => ({ d, problem: draftProblem(d, selected) }))
    .filter((x) => x.problem);
  const total = selected.reduce((s, d) => s + d.movement.links.remaining, 0);
  const allocated = selected.reduce(
    (s, d) =>
      s +
      (d.mode === "none"
        ? d.movement.links.remaining
        : d.mode === "withholding" ||
            ["commissioni", "arrotondamento"].includes(d.differenceReason)
          ? d.movement.links.remaining
          : draftAllocated(d)),
    0,
  );
  function change(k: keyof BankFilters, v: string) {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  }
  function edit(m: BankMovement, update: (d: BankDraft) => BankDraft) {
    setDrafts((old) => ({ ...old, [m.id]: update(old[m.id] ?? fresh(m)) }));
    setError("");
  }
  function show(m: BankMovement) {
    setFocus(m.id);
    setSearch("");
    if (window.matchMedia("(max-width: 1023px)").matches)
      requestAnimationFrame(() =>
        document
          .getElementById("bank-lotto-editor")
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  }
  function toggle(m: BankMovement) {
    edit(m, (d) => ({ ...d, reviewed: !d.reviewed }));
  }
  function add(m: BankMovement, c: BankProposal) {
    edit(m, (d) => {
      const next = { ...d.rows };
      if (next[c.key]) delete next[c.key];
      else
        next[c.key] = {
          candidate: c,
          amount: String(
            Math.max(
              0,
              Math.min(
                c.residuo,
                d.movement.links.remaining - draftAllocated(d),
              ),
            ),
          ),
        };
      return { ...d, rows: next, reviewed: true, strongKey: undefined };
    });
  }
  async function scan() {
    setScanning(true);
    setError("");
    try {
      const eligible = rows.filter(
        (m) =>
          m.status === "booked" &&
          m.currency === "EUR" &&
          m.links.remaining > 0 &&
          !m.chiuso_senza_documento &&
          !ownAccountTransfer(m, accounts),
      );
      const result = await bankRpc<Record<string, BankProposal[]>>(
        "bank_proposte_lotto",
        { p_company: company, p_ids: eligible.map((m) => m.id) },
      );
      setProposals((p) => ({ ...p, ...result }));
      toast.success(
        "Proposte aggiornate per questa pagina. Seleziona quelle da confermare.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi non riuscita");
    } finally {
      setScanning(false);
    }
  }
  function selectStrong() {
    setDrafts((old) => {
      const next = { ...old };
      for (const m of rows) {
        const c = strongProposal(proposals[m.id] ?? [], claims);
        if (!c || ownAccountTransfer(m, accounts) || next[m.id]?.reviewed)
          continue;
        next[m.id] = {
          ...fresh(m),
          reviewed: true,
          strongKey: c.key,
          rows: {
            [c.key]: { candidate: c, amount: String(m.links.remaining) },
          },
        };
      }
      return next;
    });
  }
  async function confirm() {
    if (busy || !selected.length || invalid.length) return;
    setBusy(true);
    setError("");
    const items = selected.map(draftPayload);
    const payload = JSON.stringify(items);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await bankRpc<BankBatchResult>("bank_conferma_lotto", {
        p_company: company,
        p_request: request.current!.id,
        p_items: items,
      });
      setDrafts({});
      setProposals({});
      setFocus(null);
      request.current = null;
      refreshFinancialQueries(client);
      await client.invalidateQueries({
        queryKey: ["bank-lotto-movimenti", company],
      });
      toast.success(`${result.count} movimenti confermati`);
      const failed = await syncBankExternalPayments(result.items);
      if (failed.length)
        toast.warning(
          `Registrazioni salvate; sincronizzazione esterna da riprovare: ${failed.join(", ")}`,
        );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Conferma non riuscita. Le selezioni sono conservate.",
      );
    } finally {
      setBusy(false);
    }
  }
  const draft = focused ? (drafts[focused.id] ?? fresh(focused)) : undefined;
  const visibleCandidates = [
    ...Object.values(draft?.rows ?? {})
      .map((r) => r.candidate)
      .filter((c) => !candidates.data?.some((x) => x.key === c.key)),
    ...(candidates.data ?? []),
  ];
  const exit = () => {
    if (busy) return;
    if (dirty) setCloseWarning(true);
    else onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) exit();
      }}
    >
      <DialogContent
        className="left-[1vw] top-[2dvh] flex h-[96dvh] max-h-[96dvh] w-[98vw] max-w-[1600px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 2xl:left-1/2 2xl:-translate-x-1/2"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="max-sm:max-h-[32dvh] max-sm:overflow-y-auto shrink-0 border-b bg-background px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="text-xl">
            Riconcilia movimenti bancari
          </DialogTitle>
          <DialogDescription>
            Confronta documenti e movimenti, prepara le quote e conferma
            insieme. Le selezioni restano quando cambi conto, sezione o filtri.
          </DialogDescription>
          <fieldset
            disabled={busy}
            className="mt-3 flex min-w-0 flex-wrap items-end gap-3"
          >
            <div
              className="flex rounded-lg border p-1"
              aria-label="Direzione movimenti"
            >
              {[
                ["credit", "Incassi"],
                ["debit", "Pagamenti"],
              ].map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={filters.direction === v ? "default" : "ghost"}
                  onClick={() => change("direction", v)}
                >
                  {v === "credit" ? (
                    <ArrowDownLeft className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="mr-1 h-4 w-4" />
                  )}
                  {l}
                </Button>
              ))}
            </div>
            <label className="text-xs">
              Conto
              <select
                aria-label="Conto da riconciliare"
                className="mt-1 block h-9 max-w-60 rounded-md border bg-background px-2 text-sm"
                value={filters.account}
                onChange={(e) => change("account", e.target.value)}
              >
                <option value="all">Tutti i conti</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.account_name || "Conto"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Dal
              <Input
                type="date"
                aria-label="Lotto dal"
                value={filters.from}
                onChange={(e) => change("from", e.target.value)}
                className="mt-1 h-9 w-36"
              />
            </label>
            <label className="text-xs">
              Al
              <Input
                type="date"
                aria-label="Lotto al"
                value={filters.to}
                onChange={(e) => change("to", e.target.value)}
                className="mt-1 h-9 w-36"
              />
            </label>
            <Input
              aria-label="Cerca movimenti nel lotto"
              placeholder="Cerca controparte, causale, importo…"
              className="h-9 min-w-48 flex-1"
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={scanning || movements.isFetching}
              onClick={() => void scan()}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Trova proposte
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectStrong}
              disabled={
                !rows.some((m) => strongProposal(proposals[m.id] ?? [], claims))
              }
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Seleziona riscontri forti
            </Button>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {movements.data?.totals.map((t) => (
              <span key={t.currency}>
                {t.unreconciled_count ?? t.n} da riconciliare ·{" "}
                <strong className="text-foreground">
                  {money(t.unreconciled_amount ?? 0, "—", t.currency)}
                </strong>
              </span>
            ))}
            <span>
              Nessuna conferma automatica · fino a 100 movimenti per lotto
            </span>
          </div>
        </DialogHeader>
        {(validation || error) && (
          <p
            role="alert"
            className="shrink-0 border-b bg-red-50 px-5 py-3 text-sm text-destructive"
          >
            {validation || error}
          </p>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[43%_57%] lg:overflow-hidden">
          <section
            aria-label="Movimenti da riconciliare"
            className="max-lg:max-h-[42dvh] flex min-h-0 flex-col border-r"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-muted/50 px-4 py-3 text-sm font-semibold">
              Movimenti bancari{" "}
              <span className="font-normal text-muted-foreground">
                {movements.data?.count ?? 0} risultati
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {movements.isError && (
                <p role="alert" className="p-4 text-destructive">
                  {movements.error.message}
                  <Button
                    variant="link"
                    onClick={() => void movements.refetch()}
                  >
                    Riprova
                  </Button>
                </p>
              )}
              {movements.isPending && (
                <p role="status" className="p-6 text-sm">
                  Caricamento movimenti…
                </p>
              )}
              {!movements.isPending && !rows.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nessun movimento da riconciliare con questi filtri.
                </p>
              )}
              {rows.map((m) => {
                const strong = strongProposal(proposals[m.id] ?? [], claims);
                const transfer = ownAccountTransfer(m, accounts);
                const eligible = m.currency === "EUR" && m.status === "booked";
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 border-b p-4 ${focus === m.id ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  >
                    <Checkbox
                      aria-label={`Seleziona movimento ${m.id}`}
                      checked={drafts[m.id]?.reviewed ?? false}
                      disabled={busy || !eligible}
                      onCheckedChange={() => toggle(m)}
                      className="mt-1"
                    />
                    <button
                      disabled={busy}
                      className="min-w-0 flex-1 text-left"
                      onClick={() => show(m)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <strong className="text-sm">
                          {(m.transaction_type === "credit"
                            ? m.debtor_name
                            : m.creditor_name) || "Controparte non indicata"}
                        </strong>
                        <strong
                          className={`shrink-0 tabular-nums ${m.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}
                        >
                          {money(m.links.remaining, "—", m.currency)}
                        </strong>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">
                        {bankCausale(m)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDateIt(m.booking_date)} · {m.account_name} ·{" "}
                        {bankState(m).label}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {transfer ? (
                          <Badge variant="outline">
                            Giroconto tra conti aziendali
                          </Badge>
                        ) : strong ? (
                          <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Riscontri forti
                          </Badge>
                        ) : proposals[m.id] ? (
                          <Badge variant="outline">
                            {proposals[m.id].some(
                              (c) => (c.punteggio ?? 0) > 30,
                            )
                              ? "Da verificare singolarmente"
                              : "Nessuna corrispondenza forte"}
                          </Badge>
                        ) : null}
                        {drafts[m.id]?.reviewed && (
                          <Badge variant="outline">Nel lotto</Badge>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t bg-background p-3 text-xs">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || busy || movements.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Precedenti
              </Button>
              Pagina {page + 1} di{" "}
              {Math.max(1, Math.ceil((movements.data?.count ?? 0) / 50))}
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (page + 1) * 50 >= (movements.data?.count ?? 0) ||
                  busy ||
                  movements.isFetching
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Successivi
              </Button>
            </div>
          </section>
          <section
            aria-label="Documenti e quote"
            id="bank-lotto-editor"
            className="min-h-0 overflow-y-auto bg-muted/10 p-5"
          >
            {!focused || !draft ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <FileText className="h-10 w-10" />
                <p>Scegli un movimento per confrontare documenti e quote.</p>
                <p className="max-w-md text-sm">
                  Puoi lavorare su più pagine e su incassi e pagamenti nello
                  stesso lotto. La conferma resta in basso.
                </p>
              </div>
            ) : (
              <fieldset disabled={busy} className="min-w-0 space-y-4">
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {focused.account_name} ·{" "}
                        {formatDateIt(focused.booking_date)}
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {bankCausale(focused)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        IBAN controparte:{" "}
                        {(focused.transaction_type === "credit"
                          ? focused.debtor_iban
                          : focused.creditor_iban) || "Non disponibile"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {money(focused.links.remaining)}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="link"
                    className="mt-2 h-auto p-0"
                    onClick={() => setDetail(focused.id)}
                  >
                    Dettagli, pagamenti già registrati e annullamento
                  </Button>
                </div>
                {ownAccountTransfer(focused, accounts) && (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                    L’IBAN appartiene a un altro conto della stessa azienda.
                    Classifica come giroconto: non genera ricavi o costi.
                    Seleziona anche l’altro movimento per chiudere entrambe le
                    operazioni.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {[
                    ["documents", "Fatture e scadenze"],
                    ["none", "Senza fattura"],
                    ...(focused.transaction_type === "credit"
                      ? [["withholding", "Ritenuta su bonifico parlante"]]
                      : []),
                  ].map(([v, l]) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={draft.mode === v ? "default" : "outline"}
                      onClick={() =>
                        edit(focused, (d) => ({
                          ...d,
                          strongKey: undefined,
                          mode: v as BankDraft["mode"],
                          reviewed: true,
                          category: ownAccountTransfer(focused, accounts)
                            ? "Giroconto"
                            : d.category,
                        }))
                      }
                    >
                      {l}
                    </Button>
                  ))}
                </div>
                {draft.mode === "none" ? (
                  <div className="space-y-3 rounded-xl border bg-background p-4">
                    <label className="text-sm font-medium">
                      Tipo di operazione
                      <select
                        aria-label="Categoria senza fattura"
                        className="mt-2 block h-10 w-full rounded-md border bg-background px-2"
                        value={draft.category}
                        onChange={(e) =>
                          edit(focused, (d) => ({
                            ...d,
                            category: e.target.value,
                            reviewed: true,
                          }))
                        }
                      >
                        <option value="">Scegli una categoria</option>
                        {categories
                          .filter(([v]) =>
                            focused.transaction_type === "debit"
                              ? v !== "Altra entrata"
                              : !["Altra spesa", "Arrotondamento"].includes(v),
                          )
                          .map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Commissioni e altre spese diventano costi già pagati. F24,
                      stipendi, finanziamenti e giroconti vengono classificati
                      senza duplicare i costi già registrati.
                    </p>
                  </div>
                ) : (
                  <>
                    {draft.mode === "withholding" && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                        Scegli una sola fattura interna. La procedura fiscale
                        verifica lordo, aliquota prevista e commissioni,
                        registra la ritenuta e aggiorna il residuo. Non inserire
                        una ritenuta ordinaria o un abbuono in questo percorso.
                      </p>
                    )}
                    <Input
                      aria-label="Ricerca documenti nel lotto"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Ragione sociale, numero, importo o data (AAAA-MM-GG)…"
                    />
                    {candidates.isFetching && (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Ricerca documenti…
                      </p>
                    )}
                    {candidates.isError && (
                      <p role="alert" className="text-sm text-destructive">
                        {candidates.error.message}
                        <Button
                          variant="link"
                          onClick={() => void candidates.refetch()}
                        >
                          Riprova
                        </Button>
                      </p>
                    )}
                    <div className="space-y-2">
                      {visibleCandidates.map((c) => {
                        const picked = draft.rows[c.key];
                        return (
                          <div
                            key={c.key}
                            className={`rounded-xl border bg-background p-3 ${picked ? "border-primary bg-primary/5" : ""}`}
                          >
                            <div className="flex gap-3">
                              <Checkbox
                                aria-label={`Scegli documento ${c.titolo}`}
                                checked={!!picked}
                                disabled={
                                  draft.mode === "withholding" &&
                                  c.tipo !== "documento"
                                }
                                onCheckedChange={() => add(focused, c)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-semibold">
                                  {c.titolo}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {c.sottotitolo}
                                </p>
                                <ul className="mt-2 space-y-1 text-xs">
                                  {c.motivi?.map((w) => (
                                    <li key={w} className="text-emerald-700">
                                      ✓ {w}
                                    </li>
                                  ))}
                                  {c.incongruenze?.map((w) => (
                                    <li key={w} className="text-amber-800">
                                      ⚠ {w}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs text-muted-foreground">
                                  Residuo documento
                                </p>
                                <strong className="tabular-nums">
                                  {money(c.residuo)}
                                </strong>
                                {picked && draft.mode === "documents" && (
                                  <Input
                                    aria-label={`Quota per ${c.titolo}`}
                                    inputMode="decimal"
                                    className="mt-2 h-8 w-28 text-right tabular-nums"
                                    value={picked.amount}
                                    onChange={(e) =>
                                      edit(focused, (d) => ({
                                        ...d,
                                        strongKey: undefined,
                                        rows: {
                                          ...d.rows,
                                          [c.key]: {
                                            ...d.rows[c.key],
                                            amount: e.target.value,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!candidates.isFetching &&
                        !candidates.isError &&
                        !visibleCandidates.length && (
                          <p className="py-5 text-center text-sm text-muted-foreground">
                            Nessun documento trovato. Modifica la ricerca o usa
                            “Senza fattura”.
                          </p>
                        )}
                    </div>
                    {draft.mode === "documents" &&
                      Object.keys(draft.rows).length > 0 && (
                        <div className="rounded-lg border bg-background p-3 text-sm">
                          <p className="flex justify-between">
                            Attribuito ai documenti{" "}
                            <strong className="tabular-nums">
                              {money(draftAllocated(draft))}
                            </strong>
                          </p>
                          <p className="mt-1 flex justify-between">
                            Differenza residua{" "}
                            <strong className="tabular-nums">
                              {money(draftDifference(draft))}
                            </strong>
                          </p>
                          {draftDifference(draft) > 0 && (
                            <label className="mt-3 block text-xs">
                              Gestione della differenza
                              <select
                                aria-label="Gestione differenza"
                                className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm"
                                value={draft.differenceReason}
                                onChange={(e) =>
                                  edit(focused, (d) => ({
                                    ...d,
                                    differenceReason: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Scegli come procedere</option>
                                <option value="Acconto o pagamento parziale">
                                  Acconto / pagamento parziale: mantieni aperto
                                  il residuo
                                </option>
                                {focused.transaction_type === "debit" && (
                                  <>
                                    <option value="commissioni">
                                      Commissioni: registra il costo e
                                      riconcilia la differenza
                                    </option>
                                    <option value="arrotondamento">
                                      Arrotondamento fino a 1 €: registra e
                                      riconcilia
                                    </option>
                                  </>
                                )}
                                <option value="Commissioni da verificare">
                                  Commissioni: mantieni aperto e verifica la
                                  registrazione
                                </option>
                                <option value="Arrotondamento da verificare">
                                  Arrotondamento: mantieni aperto e verifica la
                                  registrazione
                                </option>
                                <option value="Ritenuta da verificare">
                                  Ritenuta ordinaria: mantieni aperto e verifica
                                  il trattamento fiscale
                                </option>
                              </select>
                              <span className="mt-2 block text-muted-foreground">
                                Se scegli di registrare la differenza, viene
                                creato il costo con il suo pagamento. Negli
                                altri casi il residuo resta aperto.
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                  </>
                )}
                <label className="block text-xs text-muted-foreground">
                  Nota per la registrazione
                  <Input
                    aria-label="Nota riconciliazione"
                    className="mt-1"
                    value={draft.note}
                    onChange={(e) =>
                      edit(focused, (d) => ({ ...d, note: e.target.value }))
                    }
                  />
                </label>
                <Button
                  variant={draft.reviewed ? "secondary" : "default"}
                  onClick={() => toggle(focused)}
                >
                  {draft.reviewed
                    ? "Rimuovi dal lotto"
                    : "Aggiungi al lotto dopo verifica"}
                </Button>
              </fieldset>
            )}
          </section>
        </div>
        <footer className="shrink-0 border-t bg-background px-5 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
          {invalid.length > 0 && (
            <p role="status" className="mb-3 flex gap-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {invalid.length} movimenti da completare: {invalid[0].problem}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <strong>{selected.length} movimenti selezionati</strong>
              <span>
                Totale <b className="tabular-nums">{money(total)}</b>
              </span>
              <span>
                Attribuito <b className="tabular-nums">{money(allocated)}</b>
              </span>
              <span>
                Differenza{" "}
                <b className="tabular-nums">{money(total - allocated)}</b>
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={exit}>
                Chiudi riconciliazione
              </Button>
              <Button
                disabled={
                  busy ||
                  selected.length === 0 ||
                  selected.length > 100 ||
                  invalid.length > 0 ||
                  !perms.canReconcileBankTransactions
                }
                onClick={() => void confirm()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conferma {selected.length > 0 ? selected.length : ""} movimenti
              </Button>
            </div>
          </div>
          {closeWarning && (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              <span>
                Hai operazioni non confermate. Chiudendo verranno scartate.
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCloseWarning(false)}
                >
                  Continua a lavorare
                </Button>
                <Button size="sm" variant="destructive" onClick={onClose}>
                  Scarta e chiudi
                </Button>
              </div>
            </div>
          )}
        </footer>
        {detail && (
          <BankMovementDetail
            company={company}
            id={detail}
            onClose={() => {
              setDetail(null);
              void movements.refetch();
              void candidates.refetch();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
