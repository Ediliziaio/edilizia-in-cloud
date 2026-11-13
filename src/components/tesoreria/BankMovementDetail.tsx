import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Unlink,
  FileText,
  Link2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { formatDateIt } from "@/lib/formatters";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import {
  bankRpc,
  bankCausale,
  bankVisibilityKey,
  bankState,
  CONTEXT_LABELS,
  type BankMovement,
  type BankLink,
} from "@/lib/finance/bankWorkspace";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { syncBankExternalPayments } from "@/lib/finance/bankExternalPayments";
import { prettyTxDesc } from "./txLabel";
import { BankContextEditor } from "./BankContextEditor";
import {
  RipartizioneMovimento,
  type CandidatoRipartizione,
  type RigaRipartizione,
} from "./RipartizioneMovimento";
import { MovimentoSenzaFattura } from "./MovimentoSenzaFattura";

export type BankDetailSection = "documents" | "contexts";

export function BankMovementDetail({
  company,
  id,
  onClose,
  initialSection,
}: {
  company: string;
  id: string;
  onClose: () => void;
  initialSection?: BankDetailSection;
}) {
  const permissions = usePermissions();
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const q = useQuery({
    queryKey: ["bank-movimento", company, id, bankVisibilityKey(permissions)],
    queryFn: () =>
      bankRpc<BankMovement>("bank_movimento_dettaglio", {
        p_company: company,
        p_tx: id,
      }),
    retry: false,
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) {
          if (dirty) setDiscard(true);
          else onClose();
        }
      }}
    >
      <DialogContent
        struttura="scorrevole"
        className="top-[50%] w-[calc(100%-2rem)] max-w-5xl rounded-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement | null)?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>Dettaglio movimento</DialogTitle>
          <DialogDescription
            className="line-clamp-2"
            title={q.data ? bankCausale(q.data) : undefined}
          >
            {q.data
              ? `${money(q.data.amount, "—", q.data.currency)} · ${bankCausale(q.data)}`
              : "Dati bancari, abbinamenti, quote e note interne."}
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p role="status">Caricamento movimento…</p>
        ) : q.isError ? (
          <div role="alert">
            <p>Movimento non disponibile: {q.error.message}</p>
            <Button variant="outline" onClick={() => void q.refetch()}>
              Riprova
            </Button>
          </div>
        ) : (
          <Detail
            key={id}
            movement={q.data}
            company={company}
            onDirtyChange={setDirty}
            initialSection={initialSection}
          />
        )}
      </DialogContent>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere senza salvare?</AlertDialogTitle>
            <AlertDialogDescription>
              Ci sono note o collegamenti modificati che non hai ancora salvato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              Chiudi senza salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
function Detail({
  movement: m,
  company,
  onDirtyChange,
  initialSection,
}: {
  movement: BankMovement;
  company: string;
  onDirtyChange: (dirty: boolean) => void;
  initialSection?: BankDetailSection;
}) {
  const perms = usePermissions();
  const client = useQueryClient();
  const write = perms.canReconcileBankTransactions;
  const [note, setNote] = useState(m.note ?? "");
  const [category, setCategory] = useState(m.category ?? "");
  const [revision, setRevision] = useState(m.links.revision);
  const [busy, setBusy] = useState(false);
  const [editContexts, setEditContexts] = useState(initialSection === "contexts");
  const [mode, setMode] = useState<"new" | "existing" | "none" | null>(
    initialSection === "documents" ? "new" : null,
  );
  const [remove, setRemove] = useState<BankLink | null>(null);
  const [savedAnnotation, setSavedAnnotation] = useState({
    note: m.note ?? "",
    category: m.category ?? "",
  });
  const [contextDirty, setContextDirty] = useState(false);
  const startSection = useRef<HTMLElement>(null);
  useEffect(() => {
    startSection.current?.scrollIntoView?.({ block: "start" });
  }, [initialSection]);
  useEffect(
    () =>
      onDirtyChange(
        note !== savedAnnotation.note ||
          category !== savedAnnotation.category ||
          contextDirty,
      ),
    [note, category, savedAnnotation, contextDirty, onDirtyChange],
  );
  const refresh = () => refreshFinancialQueries(client);
  async function act(action: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(message);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }
  const state = bankState(m);
  const validMatch =
    write &&
    m.status === "booked" &&
    m.currency === "EUR" &&
    m.links.remaining > 0 &&
    !m.chiuso_senza_documento &&
    m.reconciliation_status !== "ignored";
  const monetary = (n: number) => money(n, "—", m.currency);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {m.transaction_type === "credit" ? (
              <ArrowDownLeft className="text-emerald-600" />
            ) : (
              <ArrowUpRight className="text-red-600" />
            )}
            <span
              className={`text-3xl font-semibold tabular-nums ${m.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}
            >
              {monetary(m.amount)}
            </span>
          </div>
          <Badge variant="outline" className={state.className}>
            {state.label}
          </Badge>
        </div>
        <p className="mt-4 whitespace-pre-wrap break-words font-medium">
          {bankCausale(m)}
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {[
            [
              "Controparte",
              m.transaction_type === "credit" ? m.debtor_name : m.creditor_name,
            ],
            [
              "IBAN controparte",
              m.transaction_type === "credit" ? m.debtor_iban : m.creditor_iban,
            ],
            ["Conto", m.account_name],
            ["Data operazione", formatDateIt(m.booking_date)],
            ["Data valuta", formatDateIt(m.value_date)],
            ["Riferimento", m.reference],
            [
              "Stato in banca",
              m.status === "booked"
                ? "Contabilizzato"
                : "In attesa di contabilizzazione",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="break-words">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">
            Abbinato a pagamenti / documenti
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {monetary(m.links.matched)}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Ancora da abbinare</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {monetary(m.links.remaining)}
          </p>
        </div>
      </div>
      {m.reconciliation_status === "suggestion" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <p className="font-semibold">Proposta da verificare</p>
          <p className="mt-1">
            È stata trovata una possibile corrispondenza. Verifica i documenti e
            conferma le quote: il suggerimento non registra pagamenti.
          </p>
          {write && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await bankRpc("bank_scarta_suggerimento", {
                    p_company: company,
                    p_tx: m.id,
                  });
                }, "Proposta scartata")
              }
            >
              Scarta proposta
            </Button>
          )}
        </div>
      )}
      {validMatch && (
        <section
          ref={initialSection === "documents" ? startSection : undefined}
          className="space-y-3 rounded-xl border p-4"
        >
          <h3 className="font-semibold">Collega fatture e pagamenti</h3>
          <p className="text-sm text-muted-foreground">
            Un bonifico può coprire più fatture. Scegli i documenti e indica la
            quota di ciascuno.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              className="h-auto items-start justify-start gap-2 whitespace-normal p-3 text-left"
              aria-label="Collega fatture e scadenze"
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode((v) => (v === "new" ? null : "new"))}
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">Fatture e scadenze</span>
                <span className="mt-1 block text-xs font-normal">
                  Cerca e ripartisci su più documenti.
                </span>
              </span>
            </Button>
            {perms.canViewPrimaNota && (
              <Button
                className="h-auto items-start justify-start gap-2 whitespace-normal p-3 text-left"
                aria-label="Collega pagamenti già registrati"
                variant={mode === "existing" ? "default" : "outline"}
                onClick={() =>
                  setMode((v) => (v === "existing" ? null : "existing"))
                }
              >
                <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Pagamenti già registrati</span>
                  <span className="mt-1 block text-xs font-normal">
                    Collega senza duplicare il pagamento.
                  </span>
                </span>
              </Button>
            )}
            {m.links.matched === 0 && (
              <Button
                className="h-auto items-start justify-start whitespace-normal p-3 text-left"
                aria-label="Senza fattura"
                variant={mode === "none" ? "default" : "outline"}
                onClick={() => setMode((v) => (v === "none" ? null : "none"))}
              >
                <span>
                  <span className="block font-medium">Senza fattura</span>
                  <span className="mt-1 block text-xs font-normal">
                    Classifica altri incassi e uscite.
                  </span>
                </span>
              </Button>
            )}
          </div>
          {mode === "new" && (
            <FinancialPicker
              key="new"
              company={company}
              movement={m}
              onDone={() => {
                setMode(null);
                refresh();
              }}
            />
          )}
          {mode === "existing" && (
            <ExistingPicker
              key="existing"
              company={company}
              movement={m}
              onDone={() => {
                setMode(null);
                refresh();
              }}
            />
          )}
          {mode === "none" && (
            <MovimentoSenzaFattura
              companyId={company}
              tx={m}
              onFatto={() => {
                setMode(null);
                refresh();
              }}
            />
          )}
        </section>
      )}
      {write &&
        !validMatch &&
        !m.chiuso_senza_documento &&
        m.links.remaining > 0 && (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            {m.status !== "booked"
              ? "Attendi che la banca contabilizzi il movimento prima di abbinarlo."
              : m.currency !== "EUR"
                ? "Movimento in valuta estera: occorre verificare il cambio prima di registrare pagamenti in euro."
                : "Questo movimento richiede la verifica degli abbinamenti precedenti."}
          </p>
        )}
      <section className="space-y-3">
        <h3 className="font-semibold">
          Fatture e pagamenti abbinati{" "}
          <span className="text-muted-foreground">
            ({m.links.financial.length})
          </span>
        </h3>
        {m.links.financial.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun abbinamento finanziario confermato.
          </p>
        )}
        {m.links.financial.map((f, i) => (
          <div key={f.id ?? `legacy-${i}`} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {f.existing_payment
                    ? "Pagamento già registrato · prova bancaria"
                    : f.kind === "scadenza"
                      ? "Scadenza pagata"
                      : "Documento"}
                </p>
                {f.url ? (
                  <Link
                    to={f.url}
                    className="mt-1 inline-flex items-center gap-1 break-words font-medium text-primary hover:underline"
                  >
                    {f.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                ) : (
                  <p className="mt-1 break-words font-medium">{f.label}</p>
                )}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">
                {monetary(f.amount)}
              </p>
            </div>
            {f.jobs?.map((j) => (
              <Link
                key={j.id}
                to={j.url!}
                className="mt-2 mr-2 inline-block rounded-md bg-muted px-2 py-1 text-xs hover:underline"
              >
                {j.label}
              </Link>
            ))}
            {f.note && (
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {f.note}
              </p>
            )}
            {write && f.id && f.split && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-muted-foreground"
                onClick={() => setRemove(f)}
                disabled={busy}
              >
                <Unlink className="mr-1 h-3 w-3" />
                {f.existing_payment
                  ? "Scollega prova bancaria"
                  : "Annulla abbinamento"}
              </Button>
            )}
          </div>
        ))}
      </section>
      <section
        ref={initialSection === "contexts" ? startSection : undefined}
        className="space-y-3 rounded-xl border p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Collegamenti gestionali</h3>
          {write && !m.links.restricted_contexts && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditContexts((v) => !v);
                setContextDirty(false);
              }}
            >
              {editContexts ? "Annulla modifica" : "Gestisci collegamenti"}
            </Button>
          )}
        </div>
        {m.links.restricted_contexts && (
          <p className="text-xs text-muted-foreground">
            Alcuni riferimenti sono riservati. Un amministratore può modificare
            i collegamenti del movimento.
          </p>
        )}
        {!editContexts && m.links.contexts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Puoi associare più commesse, fornitori, mezzi e riferimenti del
            personale, secondo i tuoi permessi.
          </p>
        )}
        {!editContexts &&
          m.links.contexts.map((c) => (
            <div
              key={c.context_id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="text-xs text-muted-foreground">
                  {CONTEXT_LABELS[c.kind]}
                </p>
                {c.url ? (
                  <Link
                    className="text-sm font-medium hover:underline"
                    to={c.url}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{c.label}</p>
                )}
                {c.note && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {c.note}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold">
                {monetary(c.amount)}
              </span>
            </div>
          ))}
        {editContexts && write && (
          <BankContextEditor
            company={company}
            movement={m}
            revision={revision}
            canPersonnel={perms.isAdmin}
            canMezzi={perms.canViewMezzi}
            onDirty={() => setContextDirty(true)}
            onSaved={(r) => {
              setRevision(r);
              setContextDirty(false);
              setEditContexts(false);
              refresh();
            }}
          />
        )}
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h3 className="font-semibold">Note interne e categoria</h3>
        <p className="text-xs text-muted-foreground">
          Le note restano nel gestionale e non vengono inviate alla banca o
          riportate sulle fatture.
        </p>
        <Label htmlFor="bank-category">Categoria</Label>
        <Input
          id="bank-category"
          maxLength={100}
          value={category}
          readOnly={!write}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Fornitori, stipendi, utenze…"
        />
        <Label htmlFor="bank-note">Note interne</Label>
        <Textarea
          id="bank-note"
          rows={4}
          maxLength={10000}
          value={note}
          readOnly={!write}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Annotazioni per il tuo team…"
        />
        {write && (
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const r = await bankRpc<number>("bank_movimento_note", {
                  p_company: company,
                  p_tx: m.id,
                  p_note: note,
                  p_category: category,
                  p_revision: revision,
                });
                setRevision(r);
                setSavedAnnotation({ note, category });
              }, "Note e categoria salvate")
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva
            note e categoria
          </Button>
        )}
      </section>
      {m.links.history.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Storico abbinamenti rimossi ({m.links.history.length})
          </summary>
          {m.links.history.map((h) => (
            <div key={h.id} className="mt-3 border-t pt-2 text-sm">
              <p>
                {h.label} · {monetary(h.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                Rimosso il {formatDateIt(h.unmatched_at)}
              </p>
            </div>
          ))}
        </details>
      )}
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {remove?.existing_payment
                ? "Scollegare la prova bancaria?"
                : "Annullare questo abbinamento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.adjustment
                ? "Verrà annullato l’abbinamento e stornato il pagamento della differenza creato da questa riconciliazione. Gli altri pagamenti restano invariati."
                : remove?.existing_payment
                ? "Il pagamento già registrato verrà conservato. Sarà rimossa soltanto l’associazione a questo movimento bancario."
                : "L’abbinamento sarà annullato con le regole del documento: gli incassi creati dalla riconciliazione possono essere stornati. Le altre quote del bonifico restano collegate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                const f = remove!;
                setRemove(null);
                void act(async () => {
                  const result = await bankRpc<{
                    tipo?: string;
                    provider?: string;
                    invoice_id?: string;
                    importo?: number;
                    allinea?: boolean;
                  }>(
                    f.existing_payment ? "bank_scollega_pagamento"
                      : f.match_type === "bonifico_parlante" || (f.split === false && f.kind === "documento") ? "scollega_bonifico_fattura"
                      : f.split === false ? "scollega_uscita_scadenza" : "scollega_riga_ripartita",
                    f.match_type === "bonifico_parlante" || (f.split === false && f.kind === "documento") ? { p_reconciliation_id: f.id } : { p_riconciliazione: f.id },
                  );
                  if (
                    result?.tipo === "invoice" &&
                    result.provider === "fattureincloud"
                  ) {
                    try {
                      const { data, error } = await supabase.functions.invoke(
                        "billing-payment-push",
                        {
                          body: {
                            invoice_id: result.invoice_id,
                            azione: result.allinea ? "allinea_banca" : "annulla",
                            importo: result.importo,
                          },
                        },
                      );
                      if (error || !data?.ok)
                        toast.warning(
                          "Abbinamento annullato. Aggiornamento su Fatture in Cloud da riprovare.",
                        );
                    } catch {
                      toast.warning(
                        "Abbinamento annullato. Aggiornamento su Fatture in Cloud da riprovare.",
                      );
                    }
                  }
                }, "Abbinamento rimosso");
              }}
            >
              Conferma scollegamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useCandidates(company: string, id: string, existing: boolean) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["bank-candidati", company, id, existing, term],
    queryFn: () =>
      bankRpc<CandidatoRipartizione[]>("bank_candidati_movimento", {
        p_company: company,
        p_tx: id,
        p_search: term,
        p_existing: existing,
      }),
    retry: false,
  });
  return { query, search, setSearch };
}
function FinancialPicker({
  company,
  movement: m,
  onDone,
}: {
  company: string;
  movement: BankMovement;
  onDone: () => void;
}) {
  const { query, setSearch } = useCandidates(company, m.id, false);
  const [busy, setBusy] = useState(false);
  async function confirm(rows: RigaRipartizione[], note: string) {
    if (busy) return;
    setBusy(true);
    let committed = false;
    try {
      const result = await bankRpc<{
        esterne?: {
          invoice_id: string;
          provider: string;
          saldata: boolean;
          importo: number;
          numero: string;
        }[];
      }>("bank_conferma_ripartizione", {
        p_company: company,
        p_tx: m.id,
        p_rows: rows,
        p_note: note || null,
      });
      committed = true;
      const failed = await syncBankExternalPayments([{ id: m.id, booking_date: m.booking_date, result }]);
      toast.success("Abbinamenti e pagamenti registrati");
      if (failed.length)
        toast.warning(
          `Pagamenti salvati, aggiornamento esterno da riprovare: ${failed.join(", ")}`,
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Abbinamento non riuscito");
    } finally {
      setBusy(false);
      if (committed) onDone();
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        Questa conferma registra nuovi{" "}
        {m.transaction_type === "credit" ? "incassi" : "pagamenti"}. Se sono già
        presenti in Prima nota, usa «Collega pagamenti già registrati».
      </p>
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Riprova
          </button>
        </p>
      ) : (
        <RipartizioneMovimento
          resto={m.links.remaining}
          candidati={(query.data ?? []) as CandidatoRipartizione[]}
          caricando={query.isFetching}
          onSearch={setSearch}
          inCorso={busy}
          etichettaDocumenti={
            m.transaction_type === "credit" ? "fatture" : "scadenze"
          }
          onConferma={(r, n) => void confirm(r, n)}
        />
      )}
      {(query.data?.length ?? 0) >= 100 && (
        <p className="text-xs text-muted-foreground">
          Primi 100 risultati. Usa la ricerca per trovare gli altri documenti.
        </p>
      )}
    </div>
  );
}
function ExistingPicker({
  company,
  movement: m,
  onDone,
}: {
  company: string;
  movement: BankMovement;
  onDone: () => void;
}) {
  const { query, search, setSearch } = useCandidates(company, m.id, true);
  const [selected, setSelected] = useState<
    Record<string, CandidatoRipartizione>
  >({});
  const [busy, setBusy] = useState(false);
  const total =
    Math.round(
      Object.values(selected).reduce((s, r) => s + Number(r.residuo), 0) * 100,
    ) / 100;
  const rows = [
    ...new Map(
      [...Object.values(selected), ...(query.data ?? [])].map((c) => [c.id, c]),
    ).values(),
  ];
  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await bankRpc("bank_associa_pagamenti", {
        p_company: company,
        p_tx: m.id,
        p_ids: Object.keys(selected),
      });
      toast.success("Prove bancarie collegate: nessun pagamento duplicato");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Collegamento non riuscito");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        Seleziona gli incassi o pagamenti già registrati che compongono questo
        bonifico. Saranno collegati per il loro intero importo, senza registrare
        altri movimenti di cassa.
      </p>
      <Input
        aria-label="Cerca pagamenti già registrati"
        placeholder="Cerca descrizione, riferimento o data…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      )}
      {query.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          Ricerca in corso…
        </p>
      )}
      <div className="max-h-72 space-y-2 overflow-auto">
        {rows.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              checked={!!selected[r.id]}
              disabled={busy}
              onCheckedChange={(v) =>
                setSelected((old) => {
                  const next = { ...old };
                  if (v) next[r.id] = r;
                  else delete next[r.id];
                  return next;
                })
              }
              aria-label={`Collega ${r.titolo}`}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block break-words font-medium">{r.titolo}</span>
              <span className="text-xs text-muted-foreground">
                {r.sottotitolo}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold">
              {money(r.residuo)}
            </span>
          </label>
        ))}
        {!query.isFetching && !rows.length && !query.isError && (
          <p className="text-sm text-muted-foreground">
            Nessun pagamento disponibile: verifica che sia già registrato in
            Prima nota e non sia collegato a un’altra prova bancaria.
          </p>
        )}
      </div>
      <p
        className={`text-sm ${total > m.links.remaining + 0.004 ? "text-destructive" : "text-muted-foreground"}`}
      >
        Selezionati {money(total)} · disponibili {money(m.links.remaining)}
      </p>
      <Button
        disabled={
          busy ||
          !Object.keys(selected).length ||
          total > m.links.remaining + 0.004 ||
          query.isError
        }
        onClick={() => void confirm()}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Conferma
        collegamento
      </Button>
    </div>
  );
}
