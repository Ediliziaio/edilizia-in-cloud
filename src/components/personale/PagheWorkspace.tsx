import { useMemo, useState } from "react";
import { usePayrollWorkspace } from "@/hooks/usePayrollWorkspace";
import {
  PAYROLL_TYPES,
  payrollPeriod,
  payrollAmount,
  signedPayrollAmount,
  payrollCsv,
  overlappingMeals,
  type PayrollType,
  type PayrollMovement,
  type BenefitRow,
} from "@/lib/paghe/registri";
import { HrQueryError } from "@/components/hr/HrQueryError";
import { HrPager } from "@/components/hr/HrPager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { apriDocumentoPaghe } from "@/lib/paghe/apriDocumentoPaghe";
import { toast } from "sonner";
import { oggiRoma } from "@/hooks/useOperai";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
type Workspace = ReturnType<typeof usePayrollWorkspace>;
type Action = {
  kind:
    | "config"
    | "refresh"
    | "km"
    | "receipt"
    | "movement"
    | "state"
    | "history"
    | "link"
    | "reverse";
  row?: PayrollMovement;
  benefit?: BenefitRow;
  table?: "hr_buoni_pasto" | "hr_rimborsi_km";
};
const selectClass =
  "h-10 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const statuses: Record<string, string> = {
  maturato: "Maturato",
  da_erogare: "Da erogare",
  erogato: "Erogato",
  annullato: "Annullato",
  da_confermare: "Da confermare",
  da_rimborsare: "Da rimborsare",
  approvato: "Approvato",
  rimborsato: "Rimborsato",
};

export function PagheWorkspace({ area }: { area: "benefit" | "registers" }) {
  const [month, setMonth] = useState(() => oggiRoma().slice(0, 7));
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {area === "benefit"
              ? "Benefit e rimborsi"
              : "TFR, welfare e altre voci"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {area === "benefit"
              ? "Diritto individuale, maturazioni e verifiche. Nessun ordine di pagamento."
              : "Registri documentati: non determinano da soli spettanze o trattamento fiscale."}
          </p>
        </div>
        <div>
          <Label htmlFor="paghe-period">Periodo</Label>
          <Input
            id="paghe-period"
            type="month"
            value={month}
            min="1900-01"
            max="2199-12"
            onChange={(e) => {
              if (
                /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                Number(e.target.value.slice(0, 4)) >= 1900 &&
                Number(e.target.value.slice(0, 4)) <= 2199
              )
                setMonth(e.target.value);
            }}
          />
        </div>
      </div>
      <WorkspaceBody key={`${area}:${month}`} area={area} month={month} />
    </section>
  );
}
function WorkspaceBody({
  area,
  month,
}: {
  area: "benefit" | "registers";
  month: string;
}) {
  const w = usePayrollWorkspace(month, area),
    [person, setPerson] = useState(""),
    [view, setView] = useState<"pasti" | "km" | "diritti">("pasti"),
    [page, setPage] = useState(0),
    [action, setAction] = useState<Action | null>(null);
  const names = useMemo(
    () =>
      new Map(
        (w.people.data || []).map((p) => [
          p.id,
          `${p.cognome} ${p.nome} · ${p.matricola || p.id.slice(0, 8)}${p.attivo ? "" : " · Storico"}`,
        ]),
      ),
    [w.people.data],
  );
  const queries =
    area === "benefit"
      ? [w.people, w.config, w.meals, w.km, w.closure]
      : [w.people, w.movements, w.links, w.balances, w.documents, w.closure];
  if (!w.allowed)
    return (
      <p className="rounded-lg border p-4 text-sm">
        Registri riservati agli amministratori. Nessun dato paghe viene caricato
        per utenti non autorizzati.
      </p>
    );
  if (queries.some((q) => q.isPending))
    return (
      <p role="status" className="p-6 text-sm">
        Caricamento dei registri…
      </p>
    );
  if (queries.some((q) => q.isError))
    return (
      <HrQueryError
        label="Registri non disponibili: nessun saldo può essere considerato completo"
        onRetry={() => Promise.all(queries.map((q) => q.refetch()))}
      />
    );
  const editable = w.canEdit && !w.closed && !w.change.isPending;
  const rows = (view === "km" ? w.km.data : w.meals.data) || [];
  const filtered = rows.filter((r) => !person || r.profilo_id === person);
  const movements = (w.movements.data || []).filter(
    (r) => !person || r.profilo_id === person,
  );
  const balances = (w.balances.data || []).filter(
    (r) => !person || r.profilo_id === person,
  );
  const linked = new Map((w.links.data || []).map((l) => [l.movimento_id, l]));
  const selectedPeople = (w.people.data || []).filter(
    (p) => !person || p.id === person,
  );
  const paginated = <T,>(items: T[]) =>
    items.slice(
      Math.min(page, Math.max(0, Math.ceil(items.length / 20) - 1)) * 20,
      (Math.min(page, Math.max(0, Math.ceil(items.length / 20) - 1)) + 1) * 20,
    );
  const exportCsv = () => {
    const blob = new Blob([payrollCsv(movements, names)], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `registro-paghe-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
        <div className="min-w-52 flex-1">
          <Label htmlFor="paghe-person-filter">Persona</Label>
          <select
            id="paghe-person-filter"
            className={selectClass}
            value={person}
            onChange={(e) => {
              setPerson(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Tutto il personale</option>
            {[...names].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {w.closed && (
          <Badge variant="outline">Mese HR chiuso · modifiche bloccate</Badge>
        )}
        {area === "benefit" ? (
          <>
            <Button
              variant="outline"
              disabled={!w.canEdit || w.change.isPending}
              onClick={() => setAction({ kind: "config" })}
            >
              Regole aziendali
            </Button>
            <Button
              disabled={!editable || !w.config.data}
              onClick={() => setAction({ kind: "refresh" })}
            >
              Riconcilia maturazioni
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!movements.length}
            >
              Esporta registro CSV
            </Button>
            <Button
              disabled={!editable}
              onClick={() => setAction({ kind: "movement" })}
            >
              Registra voce
            </Button>
          </>
        )}
      </div>
      {area === "benefit" ? (
        <>
          {!w.config.data && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              Regole non configurate: nessun valore, soglia ore o tariffa viene
              inventato. Configurale prima di riconciliare le maturazioni.
            </p>
          )}
          {overlappingMeals(w.meals.data || []) > 0 && (
            <p
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              {overlappingMeals(w.meals.data || [])} giornate con buono fisso e
              ricevuta: possibile doppio conteggio. Verifica e annulla la voce
              non dovuta prima dell’erogazione; non vengono sommate
              automaticamente alle paghe.
            </p>
          )}
          <div className="flex flex-wrap gap-2" aria-label="Viste benefit">
            {(
              [
                ["pasti", "Buoni pasto"],
                ["km", "Rimborsi km"],
                ["diritti", "Diritti individuali"],
              ] as const
            ).map(([v, label]) => (
              <Button
                key={v}
                variant={view === v ? "default" : "outline"}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setPage(0);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {view === "diritti" ? (
            <div className="rounded-xl border bg-white p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Il diritto non è attribuito automaticamente. Le modifiche
                valgono per le prossime maturazioni; per il mese aperto usa
                «Riconcilia maturazioni». I movimenti già erogati non vengono
                riscritti.
              </p>
              {paginated(selectedPeople).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
                >
                  <span className="font-medium">{names.get(p.id)}</span>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={p.buono_pasto_abilitato}
                        disabled={!w.canEdit || w.change.isPending}
                        onChange={(e) =>
                          w.change.mutate({
                            kind: "right",
                            person: p.id,
                            field: "buono_pasto_abilitato",
                            value: e.target.checked,
                          })
                        }
                      />
                      Buono pasto · {names.get(p.id)}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={p.rimborso_km_abilitato}
                        disabled={!w.canEdit || w.change.isPending}
                        onChange={(e) =>
                          w.change.mutate({
                            kind: "right",
                            person: p.id,
                            field: "rimborso_km_abilitato",
                            value: e.target.checked,
                          })
                        }
                      />
                      Rimborso km · {names.get(p.id)}
                    </label>
                  </div>
                </div>
              ))}
              <HrPager
                total={selectedPeople.length}
                page={page}
                onPage={setPage}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {filtered.length} movimenti · non annullati:{" "}
                  <strong>
                    {formatCurrency(
                      filtered
                        .filter((r) => r.stato !== "annullato")
                        .reduce((s, r) => s + Number(r.importo), 0),
                    )}
                  </strong>
                </p>
                <Button
                  disabled={!editable}
                  onClick={() =>
                    setAction({ kind: view === "km" ? "km" : "receipt" })
                  }
                >
                  {view === "km"
                    ? "Registra richiesta km"
                    : "Registra ricevuta pasto"}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Giorno",
                        "Persona",
                        view === "km" ? "Km × tariffa" : "Tipo",
                        "Importo",
                        "Stato",
                        "Verifica",
                      ].map((t) => (
                        <th key={t} className="p-3 font-medium">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated(filtered).map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-3 whitespace-nowrap">{r.giorno}</td>
                        <td className="p-3">
                          {names.get(r.profilo_id) || "Persona da verificare"}
                        </td>
                        <td className="p-3">
                          {view === "km"
                            ? `${r.km} km × ${r.tariffa_eur_km} €/km`
                            : r.tipo === "fisso"
                              ? "Da ore registrate"
                              : "Ricevuta"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {formatCurrency(Number(r.importo))}
                        </td>
                        <td className="p-3">{statuses[r.stato] || r.stato}</td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setAction({
                                kind:
                                  editable &&
                                  !["erogato", "rimborsato"].includes(r.stato)
                                    ? "state"
                                    : "history",
                                benefit: r,
                                table:
                                  view === "km"
                                    ? "hr_rimborsi_km"
                                    : "hr_buoni_pasto",
                              })
                            }
                          >
                            Dettagli e storico
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Nessun movimento nel periodo. Questo non certifica l’assenza
                    di spettanze.
                  </p>
                )}
              </div>
              <HrPager total={filtered.length} page={page} onPage={setPage} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              [
                "Saldo TFR registrato al periodo",
                balances.reduce((s, b) => s + Number(b.tfr_registrato), 0),
              ],
              [
                "Welfare registrato nell’anno",
                balances.reduce(
                  (s, b) => s + Number(b.welfare_anno_registrato),
                  0,
                ),
              ],
              [
                "Voci del mese non riconciliate",
                movements.filter((r) => !linked.has(r.id)).length,
              ],
            ].map(([label, value], i) => (
              <div key={label} className="rounded-xl border bg-white p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-xl font-semibold">
                  {i === 2
                    ? value
                    : balances.length
                      ? formatCurrency(Number(value))
                      : "Non caricato"}
                </p>
              </div>
            ))}
          </div>
          <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            Saldi dei soli movimenti registrati: inserisci il saldo iniziale TFR
            comunicato dal consulente e tutte le variazioni. Il welfare è
            riepilogato per anno civile, senza determinare esenzioni o
            disponibilità presso fornitori. Anticipi e utilizzi sono
            registrazioni di eventi esterni, non pagamenti. La fonte
            «consulente» è dichiarata dall’operatore; il collegamento a un
            documento non ne certifica automaticamente il contenuto.
          </p>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Data / persona",
                    "Voce",
                    "Importo",
                    "Fonte e riferimento",
                    "Documento / rettifica",
                  ].map((t) => (
                    <th key={t} className="p-3 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated(movements).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">
                      <p className="font-medium">
                        {names.get(r.profilo_id) || "Persona da verificare"}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {r.data}
                      </span>
                    </td>
                    <td className="p-3">
                      {PAYROLL_TYPES[r.tipo]}
                      {r.destinazione && (
                        <p className="text-xs text-muted-foreground">
                          {r.destinazione}
                        </p>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap font-medium">
                      {formatCurrency(Number(r.importo))}
                    </td>
                    <td className="max-w-xs p-3">
                      <p className="text-xs text-muted-foreground">
                        {r.fonte === "consulente"
                          ? "Dato comunicato dal consulente"
                          : "Inserito dall’azienda"}
                      </p>
                      <p className="break-words">{r.riferimento}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {linked.has(r.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void apriDocumentoPaghe(
                                linked.get(r.id)!.documento_id,
                              ).catch(() =>
                                toast.error("Documento non disponibile"),
                              );
                            }}
                          >
                            Apri riferimento
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!editable}
                            onClick={() => setAction({ kind: "link", row: r })}
                          >
                            Collega documento
                          </Button>
                        )}
                        {r.tipo !== "storno" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={
                              !editable ||
                              (w.movements.data || []).some(
                                (x) => x.storno_di === r.id,
                              )
                            }
                            onClick={() =>
                              setAction({ kind: "reverse", row: r })
                            }
                          >
                            Storno
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!movements.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nessuna voce registrata nel periodo: non significa TFR o welfare
                pari a zero.
              </p>
            )}
          </div>
          <HrPager total={movements.length} page={page} onPage={setPage} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Modifiche riservate agli amministratori. Nessun dato di questa vista
        viene aggiunto automaticamente al netto del cedolino, pubblicato o
        inviato ai dipendenti.
      </p>
      {action && (
        <EntryDialog
          key={`${action.kind}:${action.row?.id || action.benefit?.id || ""}`}
          action={action}
          workspace={w}
          month={month}
          person={person}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function EntryDialog({
  action: a,
  workspace: w,
  month,
  person,
  onClose,
}: {
  action: Action;
  workspace: Workspace;
  month: string;
  person: string;
  onClose: () => void;
}) {
  const { start, end } = payrollPeriod(month),
    cfg = w.config.data;
  const [draft, setDraft] = useState({
    person: a.row?.profilo_id || person,
    date: a.row?.data || (oggiRoma().startsWith(month) ? oggiRoma() : start),
    type: "tfr_quota" as PayrollType,
    amount: "",
    reduce: false,
    reference: "",
    source: "azienda",
    destination: "",
    km: "",
    rate: cfg ? String(cfg.km_tariffa_eur) : "",
    document: "",
    state: a.benefit?.stato || "",
    active: cfg?.buono_pasto_attivo ?? false,
    modality: cfg?.buono_pasto_modalita || "entrambi",
    value: cfg ? String(cfg.buono_pasto_valore) : "",
    threshold: cfg ? String(cfg.buono_pasto_soglia_ore) : "",
  });
  const [request] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const set = (key: keyof typeof draft, value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const p = (w.people.data || []).find((p) => p.id === a.row?.profilo_id);
  const docs = (w.documents.data || []).filter(
    (d) =>
      d.hr_profilo_id === p?.id ||
      (!!p?.employee_id && d.employee_id === p.employee_id),
  );
  const saving = w.change.isPending,
    canSave = w.canEdit && (!w.closed || a.kind === "config") && !saving;
  const submit = () => {
    setError("");
    try {
      const finish = { onSuccess: onClose };
      if (a.kind === "config")
        w.change.mutate(
          {
            kind: "config",
            data: {
              buono_pasto_attivo: draft.active,
              buono_pasto_modalita: draft.modality,
              buono_pasto_valore: payrollAmount(draft.value),
              buono_pasto_soglia_ore: payrollAmount(
                draft.threshold,
                "Soglia ore",
              ),
              km_tariffa_eur: parseRate(draft.rate),
            },
          },
          finish,
        );
      else if (a.kind === "refresh")
        w.change.mutate({ kind: "reconcile" }, finish);
      else if (a.kind === "receipt") {
        if (!draft.person || draft.reference.trim().length < 5)
          throw Error("Seleziona persona e riferimento");
        w.change.mutate(
          {
            kind: "receipt",
            id: request,
            person: draft.person,
            date: draft.date,
            amount: payrollAmount(draft.amount),
            reference: draft.reference,
            merchant: draft.destination,
          },
          finish,
        );
      } else if (a.kind === "km") {
        if (!draft.person || draft.reference.trim().length < 5)
          throw Error("Seleziona persona e riferimento");
        const km = payrollAmount(draft.km, "Km");
        if (Math.abs(km * 10 - Math.round(km * 10)) > 0.00001)
          throw Error("I km supportano al massimo un decimale");
        w.change.mutate(
          {
            kind: "km",
            id: request,
            person: draft.person,
            date: draft.date,
            km,
            rate: parseRate(draft.rate),
            reference: draft.reference,
          },
          finish,
        );
      } else if (a.kind === "state") {
        if (!a.table || !a.benefit || draft.reference.trim().length < 5)
          throw Error("Inserisci il riferimento della verifica");
        w.change.mutate(
          {
            kind: "state",
            table: a.table,
            id: a.benefit.id,
            state: draft.state,
            reference: draft.reference,
          },
          finish,
        );
      } else if (a.kind === "link") {
        if (!a.row || !draft.document || draft.reference.trim().length < 5)
          throw Error("Scegli il documento e descrivi la verifica");
        w.change.mutate(
          {
            kind: "link",
            movement: a.row.id,
            document: draft.document,
            reason: draft.reference,
          },
          finish,
        );
      } else {
        if (!draft.person || draft.reference.trim().length < 5)
          throw Error("Seleziona persona e riferimento");
        w.change.mutate(
          {
            kind: "movement",
            request,
            person: draft.person,
            date: draft.date,
            type: a.kind === "reverse" ? "storno" : draft.type,
            amount:
              a.kind === "reverse"
                ? -Number(a.row!.importo)
                : signedPayrollAmount(draft.type, draft.amount, draft.reduce),
            reference: draft.reference,
            source: draft.source,
            destination: draft.destination,
            reversal: a.kind === "reverse" ? a.row!.id : null,
          },
          finish,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verifica i dati");
    }
  };
  const title = {
    config: "Regole aziendali dei benefit",
    refresh: "Conferma riconciliazione maturazioni",
    km: "Richiesta di rimborso chilometrico",
    receipt: "Registra spesa pasto documentata",
    movement: "Registra voce documentata",
    state: "Registra esito della verifica",
    history: "Dettagli e storico del movimento",
    link: "Collega documento del periodo",
    reverse: "Storno documentato",
  }[a.kind];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {a.kind === "refresh"
              ? "Ricalcola esplicitamente i soli buoni fissi non erogati del mese, su ore e diritti configurati. Le giornate cancellate o non più idonee annullano la maturazione senza eliminare lo storico. Nessun pagamento o invio."
              : a.kind === "config"
                ? "Valori aziendali, non soglie fiscali. Non riscrivono automaticamente mesi passati o movimenti erogati."
                : "Registrazione amministrativa, non autorizzazione a pagare né calcolo di spettanze. Sono conservati utente, riferimento e storico."}
          </DialogDescription>
        </DialogHeader>
        {a.kind === "config" ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              Buoni pasto attivi
            </label>
            <Label htmlFor="pay-modality">Modalità</Label>
            <select
              id="pay-modality"
              className={selectClass}
              value={draft.modality}
              onChange={(e) => set("modality", e.target.value)}
            >
              <option value="fisso">Da ore lavorate</option>
              <option value="ricevuta">Solo ricevuta</option>
              <option value="entrambi">
                Ore e ricevute (verificare eventuali duplicazioni)
              </option>
            </select>
            <Field
              id="pay-value"
              label="Valore unitario buono (€)"
              value={draft.value}
              onChange={(v) => set("value", v)}
            />
            <Field
              id="pay-threshold"
              label="Soglia ore lavorate"
              value={draft.threshold}
              onChange={(v) => set("threshold", v)}
            />
            <Field
              id="pay-rate"
              label="Tariffa km aziendale (€/km, massimo 3 decimali)"
              value={draft.rate}
              onChange={(v) => set("rate", v)}
            />
          </div>
        ) : a.kind === "refresh" ? (
          <p className="rounded-lg bg-blue-50 p-3 text-sm">
            Periodo {month}. La conferma riguarda tutte le persone dell’azienda,
            anche se l’elenco è filtrato. Le regole e i diritti individuali
            devono essere già verificati.
          </p>
        ) : a.kind === "history" ? (
          <p className="text-sm">
            Movimento {a.benefit!.giorno}:{" "}
            {formatCurrency(Number(a.benefit!.importo))} ·{" "}
            {statuses[a.benefit!.stato] || a.benefit!.stato}.{" "}
            {w.closed ? "Il mese HR è chiuso." : ""}
          </p>
        ) : (
          <div className="space-y-3">
            {["km", "receipt", "movement"].includes(a.kind) && (
              <>
                <Label htmlFor="pay-person">Persona</Label>
                <select
                  id="pay-person"
                  className={selectClass}
                  value={draft.person}
                  onChange={(e) => set("person", e.target.value)}
                >
                  <option value="">Seleziona persona</option>
                  {(w.people.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.cognome} {p.nome} · {p.matricola || p.id.slice(0, 8)}
                      {!p.attivo ? " · Storico" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            {["km", "receipt", "movement", "reverse"].includes(a.kind) && (
              <Field
                id="pay-date"
                label="Data di registrazione nel periodo"
                type="date"
                value={draft.date}
                min={start}
                max={end}
                onChange={(v) => set("date", v)}
              />
            )}
            {a.kind === "movement" && (
              <>
                <Label htmlFor="pay-type">Voce</Label>
                <select
                  id="pay-type"
                  className={selectClass}
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  {Object.entries(PAYROLL_TYPES)
                    .filter(([k]) => k !== "storno")
                    .map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                </select>
                <Field
                  id="pay-amount"
                  label={
                    draft.type.startsWith("tfr_")
                      ? "Importo TFR lordo da prospetto (€), non netto del bonifico"
                      : "Importo documentato (€)"
                  }
                  value={draft.amount}
                  onChange={(v) => set("amount", v)}
                />
                {[
                  "tfr_iniziale",
                  "tfr_rettifica",
                  "welfare_rettifica",
                ].includes(draft.type) && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.reduce}
                      onChange={(e) => set("reduce", e.target.checked)}
                    />
                    Rettifica in diminuzione
                  </label>
                )}
                <Field
                  id="pay-destination"
                  label="Fondo, destinazione o piano (facoltativo)"
                  value={draft.destination}
                  onChange={(v) => set("destination", v)}
                />
              </>
            )}
            {a.kind === "receipt" && (
              <>
                <Field
                  id="pay-amount"
                  label="Importo ricevuta (€)"
                  value={draft.amount}
                  onChange={(v) => set("amount", v)}
                />
                <Field
                  id="pay-merchant"
                  label="Esercente (facoltativo)"
                  value={draft.destination}
                  onChange={(v) => set("destination", v)}
                />
                <p className="text-xs text-muted-foreground">
                  Indica dove è conservato il giustificativo. Registrare il
                  riferimento non verifica il contenuto della ricevuta né
                  autorizza il rimborso.
                </p>
              </>
            )}
            {a.kind === "km" && (
              <>
                <Field
                  id="pay-km"
                  label="Chilometri effettivi da rimborsare"
                  value={draft.km}
                  onChange={(v) => set("km", v)}
                />
                <Field
                  id="pay-rate"
                  label="Tariffa approvata (€/km, massimo 3 decimali)"
                  value={draft.rate}
                  onChange={(v) => set("rate", v)}
                />
                <p className="text-xs text-muted-foreground">
                  Non vengono dedotti viaggi da indirizzi o GPS. Verifica mezzo
                  proprio, itinerario e documentazione.
                </p>
              </>
            )}
            {["movement", "reverse"].includes(a.kind) && (
              <>
                <Label htmlFor="pay-source">Fonte dichiarata</Label>
                <select
                  id="pay-source"
                  className={selectClass}
                  value={draft.source}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="azienda">Inserimento dell’azienda</option>
                  <option value="consulente">
                    Dato comunicato dal consulente
                  </option>
                </select>
              </>
            )}
            {a.kind === "reverse" && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm">
                Voce originale conservata. Verrà aggiunto uno storno di{" "}
                {formatCurrency(-Number(a.row!.importo))}, senza cancellare né
                riscrivere il movimento.
              </p>
            )}
            {a.kind === "state" && (
              <>
                <p className="text-sm">
                  Importo registrato:{" "}
                  {formatCurrency(Number(a.benefit!.importo))}.
                  «Erogato/rimborsato» registra soltanto un’operazione già
                  effettuata fuori dal gestionale.
                </p>
                <Label htmlFor="pay-state">Esito</Label>
                <select
                  id="pay-state"
                  className={selectClass}
                  value={draft.state}
                  onChange={(e) => set("state", e.target.value)}
                >
                  {(a.table === "hr_buoni_pasto"
                    ? ["maturato", "da_erogare", "erogato", "annullato"]
                    : [
                        "da_confermare",
                        "da_rimborsare",
                        "approvato",
                        "rimborsato",
                        "annullato",
                      ]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {statuses[s]}
                    </option>
                  ))}
                </select>
              </>
            )}
            {a.kind === "link" && (
              <>
                <Label htmlFor="pay-document">
                  Documento della stessa persona e periodo
                </Label>
                <select
                  id="pay-document"
                  className={selectClass}
                  value={draft.document}
                  onChange={(e) => set("document", e.target.value)}
                >
                  <option value="">Scegli documento</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titolo}
                    </option>
                  ))}
                </select>
                {!docs.length && (
                  <p className="text-sm text-amber-800">
                    Nessun documento compatibile: caricalo prima da «Carica dal
                    consulente». Non vengono associati documenti di altre
                    persone.
                  </p>
                )}
              </>
            )}
            <Label htmlFor="pay-reference">
              Riferimento e motivo obbligatori
            </Label>
            <Textarea
              id="pay-reference"
              value={draft.reference}
              maxLength={1000}
              onChange={(e) => set("reference", e.target.value)}
              placeholder="Riferimento al prospetto, comunicazione o giustificativo verificato"
            />
          </div>
        )}
        {["state", "history"].includes(a.kind) && a.benefit && w.company && (
          <BenefitHistory
            company={w.company}
            id={a.benefit.id}
            table={a.table!}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Annulla
          </Button>
          {a.kind !== "history" && (
            <Button disabled={!canSave} onClick={submit}>
              {saving
                ? "Salvataggio…"
                : a.kind === "refresh"
                  ? "Conferma riconciliazione"
                  : "Conferma registrazione"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function parseRate(value: string) {
  const raw = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 100)
    throw Error("Verifica la tariffa (positiva, massimo tre decimali)");
  return Number(raw);
}

function BenefitHistory({
  company,
  id,
  table,
}: {
  company: string;
  id: string;
  table: string;
}) {
  const query = useQuery({
    queryKey: ["payroll-benefit-history", company, id, table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_benefit_storico" as never)
        .select("id,registrato_il,attore,prima,dopo")
        .eq("company_id", company)
        .eq("record_id", id)
        .eq("tabella", table)
        .order("registrato_il", { ascending: false })
        .order("id")
        .limit(20);
      if (error) throw error;
      return data as unknown as {
        id: string;
        registrato_il: string;
        attore: string | null;
        prima: { stato?: string; importo?: number } | null;
        dopo: { stato?: string; importo?: number; note?: string };
      }[];
    },
  });
  if (query.isPending)
    return (
      <p role="status" className="text-xs">
        Caricamento storico…
      </p>
    );
  if (query.isError)
    return (
      <HrQueryError label="Storico non disponibile" onRetry={query.refetch} />
    );
  return (
    <details>
      <summary className="cursor-pointer text-sm">
        Storico · ultimi 20 eventi
      </summary>
      <ol className="mt-2 max-h-48 space-y-2 overflow-auto text-xs">
        {(query.data || []).map((e) => (
          <li key={e.id} className="rounded-lg bg-slate-50 p-2">
            <p>
              {new Date(e.registrato_il).toLocaleString("it-IT")} ·{" "}
              {e.prima?.stato
                ? `${statuses[e.prima.stato] || e.prima.stato} → `
                : ""}
              {statuses[e.dopo.stato || ""] || e.dopo.stato} ·{" "}
              {formatCurrency(Number(e.dopo.importo))}
            </p>
            <p className="mt-1 break-all text-muted-foreground">
              {e.attore
                ? `Utente: ${e.attore}`
                : "Elaborazione automatica del registro"}
            </p>
            {e.dopo.note && (
              <p className="mt-1 whitespace-pre-wrap">{e.dopo.note}</p>
            )}
          </li>
        ))}
      </ol>
      {!query.data?.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Nessun evento registrato dopo l’attivazione dello storico.
        </p>
      )}
    </details>
  );
}
