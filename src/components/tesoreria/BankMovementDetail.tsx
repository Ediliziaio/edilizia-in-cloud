import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Unlink,
  BadgeCheck,
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
  type BankMovement,
  type BankLink,
  type BankTarget,
} from "@/lib/finance/bankWorkspace";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { CHIUSURE_CASSA, chiaveQueryCassa, rpcCassa } from "@/lib/cassaInCloud";
import type { AccreditoCassa } from "../../../shared/cassaInCloud";
import { syncBankExternalPayments } from "@/lib/finance/bankExternalPayments";
import { BankContextEditor } from "./BankContextEditor";
import {
  RipartizioneMovimento,
  type CandidatoRipartizione,
  type RigaRipartizione,
} from "./RipartizioneMovimento";
import { MovimentoSenzaFattura } from "./MovimentoSenzaFattura";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { prettyTxDesc } from "./txLabel";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { CategoriaMovimento } from "./CategoriaMovimento";
import { useVociMovimenti } from "@/lib/finance/cassaVoci";
import { ControparteRiconosciuta, SuggerimentiAbbinamento, useSuggerimentiMovimento } from "./MovimentoSuggerimenti";
import { AlternativeEsito, BadgeEsito, RigaEsitoMovimento, useEsitoMovimento } from "./EsitoMovimento";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { cercaMovimentiSimili } from "@/lib/finance/movimentiSimili";

export type BankDetailSection = "documents" | "contexts";

export function BankMovementDetail({
  company,
  id,
  onClose,
  initialSection,
  onRiconciliaSimili,
}: {
  company: string;
  id: string;
  onClose: () => void;
  initialSection?: BankDetailSection;
  /** «Fai lo stesso per i simili»: apre la conferma in blocco con questi movimenti. Senza, l'avviso non compare. */
  onRiconciliaSimili?: (ids: string[]) => void;
}) {
  const t = useT();
  const permissions = usePermissions();
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  // Simili da aprire dopo la conferma di «Chiudi senza salvare» (note o categoria non salvate).
  const simiDaAprire = useRef<string[] | null>(null);
  const apriSimili = onRiconciliaSimili
    ? (ids: string[]) => {
        if (dirty) {
          simiDaAprire.current = ids;
          setDiscard(true);
        } else onRiconciliaSimili(ids);
      }
    : undefined;
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
          <DialogTitle>{t("Dettaglio movimento")}</DialogTitle>
          <DialogDescription
            className="line-clamp-2"
            title={q.data ? bankCausale(q.data) : undefined}
          >
            {q.data
              ? `${money(q.data.amount, "—", q.data.currency)} · ${bankCausale(q.data)}`
              : t("Dati bancari, abbinamenti, quote e note interne.")}
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p role="status">{t("Caricamento movimento…")}</p>
        ) : q.isError ? (
          <div role="alert">
            <p>{t("Movimento non disponibile: {errore}", { errore: String(q.error.message ?? "") })}</p>
            <Button variant="outline" onClick={() => void q.refetch()}>
              {t("Riprova")}
            </Button>
          </div>
        ) : (
          <Detail
            key={id}
            movement={q.data}
            company={company}
            onDirtyChange={setDirty}
            initialSection={initialSection}
            onRiconciliaSimili={apriSimili}
          />
        )}
      </DialogContent>
      <AlertDialog open={discard} onOpenChange={(v) => { setDiscard(v); if (!v) simiDaAprire.current = null; }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Chiudere senza salvare?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Ci sono note o collegamenti modificati che non hai ancora salvato.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Continua a modificare")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const ids = simiDaAprire.current;
              if (ids && onRiconciliaSimili) onRiconciliaSimili(ids);
              else onClose();
            }}>
              {t("Chiudi senza salvare")}
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
  onRiconciliaSimili,
}: {
  movement: BankMovement;
  company: string;
  onDirtyChange: (dirty: boolean) => void;
  initialSection?: BankDetailSection;
  onRiconciliaSimili?: (ids: string[]) => void;
}) {
  const tr = useT();
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
  // Bozza dei selettori «Fatture e scadenze» / «Pagamenti già registrati»: scelte e quote scritte.
  const [pickerDirty, setPickerDirty] = useState(false);
  const [dividi, setDividi] = useState(false);
  // «dividi» (28/11/2026): anche «Dividi in quote» chiude il selettore, e con lui la bozza.
  const [modoRichiesto, setModoRichiesto] = useState<"new" | "existing" | "none" | "dividi" | null | undefined>(undefined);
  const cambiaModo = (next: "new" | "existing" | "none" | "dividi" | null) => {
    if (next === mode) return;
    if (pickerDirty) setModoRichiesto(next);
    else if (next === "dividi") setDividi(true);
    else setMode(next);
  };
  const startSection = useRef<HTMLDivElement | null>(null);
  // «Fai lo stesso per i simili» (lotto D): dopo una conferma a mano, gli altri movimenti aperti della
  // stessa controparte con una proposta forte. Solo un avviso: la conferma resta nella conferma in blocco.
  const [simili, setSimili] = useState<string[]>([]);
  const cercaSimili = () => {
    if (!onRiconciliaSimili) return;
    // Un suggerimento che non arriva non è un errore da mostrare: la conferma è già fatta.
    void cercaMovimentiSimili(company, m.id).then(setSimili, () => setSimili([]));
  };
  const voce = useVociMovimenti(company, [m.id]);
  useEffect(() => {
    startSection.current?.scrollIntoView?.({ block: "start" });
  }, [initialSection]);
  useEffect(
    () =>
      onDirtyChange(
        note !== savedAnnotation.note ||
          category !== savedAnnotation.category ||
          contextDirty ||
          pickerDirty,
      ),
    [note, category, savedAnnotation, contextDirty, pickerDirty, onDirtyChange],
  );
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tesoreria-esito", company] });
    return refreshFinancialQueries(client);
  };
  const esito = useEsitoMovimento(company, m.id);
  const accreditoPos = useQuery({
    queryKey: [...chiaveQueryCassa(company), "pos-da-banca", m.id],
    enabled: m.transaction_type === "credit" && m.chiuso_senza_documento === "nessun_costo",
    queryFn: () => rpcCassa<AccreditoCassa | null>("cassa_in_cloud_accredito_pos", { p_company_id: company, p_id: null, p_tx: m.id }),
  });
  const pos = accreditoPos.data;
  const conEsito = !!esito.data && esito.data.natura !== "gia_riconciliato";
  async function act(action: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(tr(message));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Operazione non riuscita"));
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
  const s = useSuggerimentiMovimento(company, m, validMatch, refresh);
  // Dividi in quote (23/11/2026): lo stesso popup della Prima Nota, col movimento già dentro.
  const commesse = new Map<string, BankTarget & { amount?: number }>();
  for (const f of m.links.financial) for (const j of f.jobs ?? []) commesse.set(j.id, j);
  for (const c of m.links.contexts) if (c.kind === "commessa") commesse.set(c.id, c);
  const contesti = (tipi: string[]) => m.links.contexts.filter((c) => tipi.includes(c.kind));
  const puoContesti = write && !m.links.restricted_contexts;
  const apriContesti = puoContesti ? () => { setEditContexts(true); setContextDirty(false); } : undefined;
  const noteCambiata = note !== savedAnnotation.note;
  // L'ODA letto nella causale si collega con un clic, per l'intero importo, tenendo gli altri collegamenti.
  const collegaOda = (odaId: string): void =>
    void act(async () => {
      const righe = m.links.contexts.map((c) => ({ kind: c.kind, target_id: c.id, amount: c.amount, note: c.note ?? null }));
      righe.push({ kind: "oda", target_id: odaId, amount: Math.abs(m.amount), note: null });
      const r = await bankRpc<number>("bank_context_save", { p_company: company, p_tx: m.id, p_revision: revision, p_rows: righe });
      setRevision(r);
    }, "Ordine d'acquisto collegato");
  const riga = (titolo: string, contenuto: ReactNode, sotto?: ReactNode) => (
    <>
      <dt className="pt-0.5 text-muted-foreground">{titolo ? tr(titolo) : null}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">{contenuto}{sotto}</dd>
    </>
  );
  return (
    <div className="space-y-4">
      {dividi && (
        <NewEntryDialog open onOpenChange={(v) => { if (!v) { setDividi(false); setMode(null); refresh(); } }}
          onConfirm={() => {}} isPending={false}
          movimentoBanca={{
            id: m.id, direction: m.transaction_type === "credit" ? "entrata" : "uscita",
            importo: m.links.remaining, data: m.booking_date ?? new Date().toLocaleDateString("en-CA"),
            descrizione: prettyTxDesc(m),
          }} />
      )}
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
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {tr("Abbinato")} <strong className="text-foreground tabular-nums">{monetary(pos ? pos.netto : m.links.matched)}</strong>
              {" · "}{tr("da abbinare")} <strong className={`tabular-nums ${m.links.remaining > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>{monetary(m.links.remaining)}</strong>
            </span>
            <Badge variant="outline" className={state.className}>
              {pos ? tr("Accredito POS") : tr(state.label)}
            </Badge>
            {!pos && <BadgeEsito esito={esito.data} />}
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words font-medium">
          {bankCausale(m)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            [
              "IBAN controparte",
              m.transaction_type === "credit" ? m.debtor_iban : m.creditor_iban,
            ],
            ["Conto", m.account_name],
            ["Data operazione", formatDateIt(m.booking_date)],
            ["Data valuta", formatDateIt(m.value_date)],
            [
              "Stato in banca",
              m.status === "booked"
                ? tr("Contabilizzato")
                : tr("In attesa"),
            ],
            ...(m.reference ? [["Riferimento", m.reference]] : []),
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{tr(k)}</dt>
              <dd className="break-words">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Un posto solo: ogni legame ha la sua riga, e quel che serve per cambiarlo si apre lì sotto. */}
      <section className="rounded-xl border p-4" aria-labelledby="collegato-a">
        <h3 id="collegato-a" className="mb-3 flex items-center gap-2 font-semibold">
          <Link2 className="h-4 w-4" /> {tr("A cosa è collegato")}
        </h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(130px,max-content)_1fr]">
          {conEsito && !pos && riga("Esito", <RigaEsitoMovimento company={company} movement={m} esito={esito.data!} puoScrivere={write} onCambiato={refresh} />)}
          {pos && riga("Cassa in Cloud", <>
            <span>{tr(pos.chiusure === 1 ? "{n} chiusura" : "{n} chiusure", { n: pos.chiusure })} · {tr("Lordo {importo}", { importo: monetary(pos.lordo) })} · {tr("Commissioni {importo}", { importo: monetary(pos.commissioni) })}</span>
            {perms.canViewBilling && <Link className="font-medium text-primary hover:underline"
              to={`${CHIUSURE_CASSA}&dal=${pos.dal_chiusure ?? ""}&al=${pos.al_chiusure ?? ""}`}>{tr("Apri chiusure")}</Link>}
          </>)}
          {riga("Controparte", <ControparteRiconosciuta s={s} onCollegaOda={puoContesti && !editContexts ? collegaOda : undefined} odaCollegate={contesti(["oda"]).map((c) => c.id)} />)}
          {riga(
            "Categoria",
            <CategoriaMovimento
              company={company}
              tx={m.id}
              importo={m.amount}
              revisione={revision}
              voce={voce.data?.[m.id]}
              testoVecchio={category || null}
              puoModificare={write && m.status === "booked"}
              onSalvata={(rev, nome) => {
                setRevision(rev);
                if (nome) {
                  setCategory(nome);
                  setSavedAnnotation((a) => ({ ...a, category: nome }));
                }
              }}
            />,
          )}
          {riga(
            "Fatture e pagamenti",
            <>
              {m.links.financial.length === 0 && <Nessuno />}
              {validMatch && (
                <Azione onClick={() => cambiaModo(mode ? null : "new")} label={tr("Collega fatture e pagamenti")}>
                  {mode ? tr("Chiudi") : m.links.financial.length ? tr("Aggiungi") : tr("Collega")}
                </Azione>
              )}
              {m.links.remaining > 0 && m.links.matched > 0 && (
                <span className="text-xs text-amber-700 dark:text-amber-400">{tr("restano {importo}", { importo: String(monetary(m.links.remaining) ?? "") })}</span>
              )}
            </>,
            <>
              {m.links.financial.length > 0 && (
                <ul className="w-full min-w-0 basis-full divide-y rounded-lg border">
                  {m.links.financial.map((f, i) => (
                    <li key={f.id ?? `legacy-${i}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {f.existing_payment ? tr("Pagamento registrato") : f.kind === "quota_fornitore" ? tr("Quota pagata") : f.kind === "scadenza" ? tr("Scadenza") : tr("Documento")}
                      </span>
                      <span className="min-w-0 flex-1 truncate max-sm:basis-full max-sm:order-first" title={f.note ?? f.label}>
                        {f.url ? (
                          <Link to={f.url} className="font-medium text-primary hover:underline">{f.label}</Link>
                        ) : (
                          <span className="font-medium">{f.label}</span>
                        )}
                        {f.jobs?.map((j) => (
                          <Link key={j.id} to={j.url!} className="ml-2 text-xs text-muted-foreground hover:underline">{j.label}</Link>
                        ))}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{monetary(f.amount)}</span>
                      {/* Su un incasso già collegato a una fattura: l'IBAN dell'ordinante diventa la prova
                          che identifica quel cliente negli incassi futuri (tesoreria_ricorda_iban_da_quota). */}
                      {write && f.id && m.amount > 0 && (m.debtor_iban || m.counterparty_iban) && (f.kind === "documento" || f.kind === "invoice") && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" disabled={busy}
                          title={tr("Ricorda questo IBAN per il cliente della fattura")} aria-label={tr("Ricorda questo IBAN per il cliente della fattura")}
                          onClick={() => void act(async () => {
                            await bankRpc("tesoreria_ricorda_iban_da_quota", { p_company: company, p_riconciliazione: f.id });
                          }, "IBAN ricordato: identificherà i prossimi bonifici di questo cliente")}>
                          <BadgeCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {write && f.id && f.split && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setRemove(f)} disabled={busy}
                          title={f.existing_payment ? tr("Scollega prova bancaria") : tr("Annulla abbinamento")}
                          aria-label={f.existing_payment ? tr("Scollega prova bancaria") : tr("Annulla abbinamento")}>
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {simili.length > 0 && onRiconciliaSimili && (
                <div role="status" className="flex basis-full flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="min-w-0 flex-1">
                    {tr(simili.length === 1
                      ? "C'è un movimento simile: riconciliarlo allo stesso modo?"
                      : "Ci sono {n} movimenti simili: riconciliarli allo stesso modo?", { n: simili.length })}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRiconciliaSimili(simili)}>
                    {tr("Apri la conferma in blocco")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSimili([])}>
                    {tr("No, grazie")}
                  </Button>
                </div>
              )}
              {m.reconciliation_status === "suggestion" && (
                <p className="basis-full rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900">
                  {tr("Proposta da verificare: c'è una possibile corrispondenza, ma il suggerimento non registra pagamenti.")}
                  {write && (
                    <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs" disabled={busy}
                      onClick={() => void act(async () => { await bankRpc("bank_scarta_suggerimento", { p_company: company, p_tx: m.id }); }, "Proposta scartata")}>
                      {tr("Scarta proposta")}
                    </Button>
                  )}
                </p>
              )}
              {/* Le alternative del motore degli esiti; i suggerimenti calcolati qui solo se il motore non risponde. */}
              {!m.chiuso_senza_documento && !mode && (esito.isError
                ? <SuggerimentiAbbinamento s={s} resto={m.links.remaining} />
                : conEsito && <AlternativeEsito company={company} movement={m} esito={esito.data!} puoAbbinare={validMatch} onAbbinato={refresh} />)}
              {write && !validMatch && !m.chiuso_senza_documento && m.links.remaining > 0 && (
                <p className="basis-full text-xs text-muted-foreground">
                  {m.status !== "booked"
                    ? tr("Attendi che la banca contabilizzi il movimento prima di abbinarlo.")
                    : m.currency !== "EUR"
                      ? tr("Movimento in valuta estera: occorre verificare il cambio prima di registrare pagamenti in euro.")
                      : tr("Questo movimento richiede la verifica degli abbinamenti precedenti.")}
                </p>
              )}
              {validMatch && mode && (
                <div
                  ref={(el) => { if (initialSection === "documents") startSection.current = el; }}
                  className="basis-full scroll-mt-4 space-y-3 rounded-lg border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("Come collegare")}>
                    <Button size="sm" variant={mode === "new" ? "default" : "outline"} aria-label={tr("Collega fatture e scadenze")} onClick={() => cambiaModo("new")}>
                      <FileText className="mr-1 h-3.5 w-3.5" />{tr("Fatture e scadenze")}
                    </Button>
                    {perms.canViewPrimaNota && (
                      <Button size="sm" variant={mode === "existing" ? "default" : "outline"} aria-label={tr("Collega pagamenti già registrati")} onClick={() => cambiaModo("existing")}>
                        <Link2 className="mr-1 h-3.5 w-3.5" />{tr("Pagamenti già registrati")}
                      </Button>
                    )}
                    {perms.canViewPrimaNota && (
                      <Button size="sm" variant="outline" aria-label={tr("Dividi in quote")} onClick={() => cambiaModo("dividi")}>
                        {tr("Dividi in quote")}
                      </Button>
                    )}
                    {m.links.matched === 0 && (
                      <Button size="sm" variant={mode === "none" ? "default" : "outline"} aria-label={tr("Senza fattura")} onClick={() => cambiaModo("none")}>
                        {tr("Senza fattura")}
                      </Button>
                    )}
                  </div>
                  {mode === "new" && (
                    <FinancialPicker key="new" company={company} movement={m} onDirtyChange={setPickerDirty} onDone={() => { setMode(null); refresh(); cercaSimili(); }} />
                  )}
                  {mode === "existing" && (
                    <ExistingPicker key="existing" company={company} movement={m} onDirtyChange={setPickerDirty} onDone={() => { setMode(null); refresh(); }} />
                  )}
                  {mode === "none" && (
                    <MovimentoSenzaFattura companyId={company} tx={m} onFatto={() => { setMode(null); refresh(); }} />
                  )}
                </div>
              )}
            </>,
          )}
          {riga(
            "Commesse",
            <>
              {commesse.size ? [...commesse.values()].map((j) => <Pastiglia valuta={monetary} key={j.id} t={j} importo={(j as { amount?: number }).amount} />) : <Nessuno />}
              {!editContexts && <Azione onClick={apriContesti} label={tr("Collega una commessa")}>{commesse.size ? tr("Modifica") : tr("Collega")}</Azione>}
            </>,
          )}
          {riga(
            "Mezzi",
            <>
              {contesti(["mezzo"]).length ? contesti(["mezzo"]).map((c) => <Pastiglia valuta={monetary} key={c.context_id ?? c.id} t={c} importo={c.amount} />) : <Nessuno />}
              {!editContexts && <Azione onClick={apriContesti} label={tr("Collega un mezzo")}>{contesti(["mezzo"]).length ? tr("Modifica") : tr("Collega")}</Azione>}
            </>,
          )}
          {contesti(["fornitore"]).length > 0 &&
            riga("Fornitori", contesti(["fornitore"]).map((c) => <Pastiglia valuta={monetary} key={c.context_id ?? c.id} t={c} importo={c.amount} />))}
          {contesti(["dipendente", "cedolino"]).length > 0 &&
            riga("Personale", contesti(["dipendente", "cedolino"]).map((c) => <Pastiglia valuta={monetary} key={c.context_id ?? c.id} t={c} importo={c.amount} />))}
          {([["oda", "Ordini d'acquisto"], ["f24", "F24"], ["cespite", "Cespiti"]] as const).map(([tipo, titolo]) =>
            contesti([tipo]).length > 0 ? (
              <Fragment key={tipo}>
                {riga(titolo, <>
                  {contesti([tipo]).map((c) => <Pastiglia valuta={monetary} key={c.context_id ?? c.id} t={c} importo={c.amount} />)}
                  {!editContexts && <Azione onClick={apriContesti} label={tr("Modifica {titolo}", { titolo: tr(titolo) })}>{tr("Modifica")}</Azione>}
                </>)}
              </Fragment>
            ) : null,
          )}
          {!editContexts && puoContesti && riga(
            "Altro",
            <span className="text-xs text-muted-foreground">
              {tr("Fornitore, ordine d'acquisto, F24, cespite o personale:")}{" "}
              <Azione onClick={apriContesti} label={tr("Collega un altro riferimento")}>{tr("Collega")}</Azione>
            </span>,
          )}
          {m.links.restricted_contexts && riga("", <span className="text-xs text-muted-foreground">{tr("Alcuni riferimenti sono riservati: li modifica un amministratore.")}</span>)}
          {editContexts && puoContesti && (
            <div
              ref={(el) => { if (initialSection === "contexts") startSection.current = el; }}
              className="scroll-mt-4 rounded-lg border bg-muted/20 p-3 sm:col-span-2"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{tr("Commesse, fornitori, mezzi e personale")}</p>
                <Button size="sm" variant="ghost" onClick={() => { setEditContexts(false); setContextDirty(false); }}>{tr("Annulla")}</Button>
              </div>
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
            </div>
          )}
          {perms.canViewBilling && riga(
            "Allegati",
            // Contabile del bonifico, ricevuta, F24 quietanzato: stessi allegati di fatture e costi.
            <div className="w-full min-w-0">
              <AllegatiFattura companyId={company} madre={{ movimentoId: m.id }} titolo="" scegliTipo={false} sola_lettura={!write} />
            </div>,
          )}
          {riga(
            "Note interne",
            <div className="w-full space-y-1.5">
              <Label htmlFor="bank-note" className="sr-only">{tr("Note interne")}</Label>
              <Textarea
                id="bank-note"
                rows={2}
                maxLength={10000}
                value={note}
                readOnly={!write}
                onChange={(e) => setNote(e.target.value)}
                placeholder={write ? tr("Annotazioni per il tuo team: restano nel gestionale, non vanno alla banca né in fattura") : tr("Nessuna nota")}
                className="min-h-[2.75rem] text-sm"
              />
              {write && noteCambiata && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
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
                      }, "Nota salvata")
                    }
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{tr("Salva nota")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNote(savedAnnotation.note)}>{tr("Annulla")}</Button>
                </div>
              )}
            </div>,
          )}
        </dl>
      </section>
      {m.links.history.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">{tr("Storico abbinamenti rimossi ({n})", { n: m.links.history.length })}</summary>
          {m.links.history.map((h) => (
            <div key={h.id} className="mt-3 border-t pt-2 text-sm">
              <p>
                {h.label} · {monetary(h.amount)}
              </p>
              <p className="text-xs text-muted-foreground">{tr("Rimosso il {data}", { data: formatDateIt(h.unmatched_at) })}</p>
            </div>
          ))}
        </details>
      )}
      <AlertDialog open={modoRichiesto !== undefined} onOpenChange={(v) => { if (!v) setModoRichiesto(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Scartare le scelte fatte?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Hai spuntato documenti o scritto importi che non hai ancora confermato. Cambiando modo li perdi.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Resta")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (modoRichiesto === "dividi") { setMode(null); setDividi(true); } else setMode(modoRichiesto ?? null); setModoRichiesto(undefined); }}>
              {tr("Scarta e cambia")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                ? tr("Scollegare la prova bancaria?")
                : tr("Annullare questo abbinamento?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.adjustment
                ? tr("Verrà annullato l’abbinamento e stornato il pagamento della differenza creato da questa riconciliazione. Gli altri pagamenti restano invariati.")
                : remove?.existing_payment
                ? tr("Il pagamento già registrato verrà conservato. Sarà rimossa soltanto l’associazione a questo movimento bancario.")
                : remove?.kind === "quota_fornitore"
                ? tr("La quota tornerà da pagare sulla fattura o sulla rata.")
                : tr("L’abbinamento sarà annullato con le regole del documento: gli incassi creati dalla riconciliazione possono essere stornati. Le altre quote del bonifico restano collegate.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
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
                          tr("Abbinamento annullato. Aggiornamento su Fatture in Cloud da riprovare."),
                        );
                    } catch {
                      toast.warning(
                        tr("Abbinamento annullato. Aggiornamento su Fatture in Cloud da riprovare."),
                      );
                    }
                  }
                }, "Abbinamento rimosso");
              }}
            >
              {tr("Conferma scollegamento")}
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
    const timer = setTimeout(() => setTerm(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["bank-candidati", company, id, existing, term],
    // Una ricerca che fallisce (timeout) lascia in vista gli ultimi risultati: prima
    // l'elenco spariva e, con lui, le scadenze già spuntate (27/11/2026).
    placeholderData: keepPreviousData,
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
/** Il resto da abbinare è sceso rispetto a quello visto prima della conferma? Se la rilettura
 *  fallisce si risponde «no»: meglio un errore in più che una conferma creduta fatta. */
async function confermaGiaArrivata(company: string, tx: string, restoPrima: number): Promise<boolean> {
  try {
    const dopo = await bankRpc<BankMovement>("bank_movimento_dettaglio", { p_company: company, p_tx: tx });
    return Math.round(Number(dopo?.links?.remaining) * 100) < Math.round(restoPrima * 100);
  } catch {
    return false;
  }
}

function FinancialPicker({
  company,
  movement: m,
  onDone,
  onDirtyChange,
}: {
  company: string;
  movement: BankMovement;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const { query, setSearch } = useCandidates(company, m.id, false);
  const [busy, setBusy] = useState(false);
  // Il ref chiude la porta subito: due clic nello stesso istante vedono ancora busy=false.
  const inVolo = useRef(false);
  async function confirm(rows: RigaRipartizione[], note: string) {
    if (inVolo.current) return;
    inVolo.current = true;
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
      toast.success(t("Abbinamenti e pagamenti registrati"));
      if (failed.length)
        toast.warning(
          t("Pagamenti salvati, aggiornamento esterno da riprovare: {elenco}", { elenco: failed.join(", ") }),
        );
    } catch (e) {
      // Risposta persa dopo una scrittura riuscita (rete caduta): un nuovo clic scriverebbe le
      // stesse quote una seconda volta. Prima di ridare il pulsante si rilegge il movimento: se il
      // resto da abbinare è sceso, la conferma era arrivata (28/11/2026).
      if (!committed && (await confermaGiaArrivata(company, m.id, m.links.remaining))) {
        committed = true;
        toast.warning(t("La conferma era già arrivata: il movimento è aggiornato, non serve riprovare."));
      } else {
        toast.error(messaggioErrore(e, t("Abbinamento non riuscito")));
      }
    } finally {
      inVolo.current = false;
      setBusy(false);
      if (committed) onDone();
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {m.transaction_type === "credit"
          ? t("Questa conferma registra nuovi incassi. Se sono già presenti in Prima nota, usa «Collega pagamenti già registrati».")
          : t("Questa conferma registra nuovi pagamenti. Se sono già presenti in Prima nota, usa «Collega pagamenti già registrati».")}
      </p>
      {/* L'errore sta sopra, senza smontare la ripartizione: le scadenze già spuntate e
          gli importi scritti vivono lì dentro, e un timeout della ricerca li cancellava
          tutti (distinta RiBa da 94.856 €, 27/11/2026). */}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            {t("Riprova")}
          </button>{" "}
          {t("Le scadenze già selezionate restano selezionate.")}
        </p>
      )}
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
        onModificata={onDirtyChange}
      />
      {(query.data?.length ?? 0) >= 100 && (
        <p className="text-xs text-muted-foreground">
          {t("Primi 100 risultati. Usa la ricerca per trovare gli altri documenti.")}
        </p>
      )}
    </div>
  );
}
function ExistingPicker({
  company,
  movement: m,
  onDone,
  onDirtyChange,
}: {
  company: string;
  movement: BankMovement;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useT();
  const { query, search, setSearch } = useCandidates(company, m.id, true);
  const [selected, setSelected] = useState<
    Record<string, CandidatoRipartizione>
  >({});
  const [busy, setBusy] = useState(false);
  const inVolo = useRef(false);
  const haScelte = Object.keys(selected).length > 0;
  useEffect(() => { onDirtyChange?.(haScelte); }, [haScelte, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const total =
    Math.round(
      Object.values(selected).reduce((s, r) => s + Number(r.residuo), 0) * 100,
    ) / 100;
  const rows = [
    ...new Map(
      [...Object.values(selected), ...(query.data ?? [])].map((c) => [c.id, c]),
    ).values(),
  ];
  // Movimenti divisi in Prima Nota (23/11/2026): le quote dello stesso bonifico si collegano insieme.
  const idsRighe = rows.map((r) => r.id).sort().join(",");
  const gruppi = useQuery({
    queryKey: ["bank-candidati-gruppi", company, idsRighe],
    enabled: rows.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("prima_nota_entries")
        .select("id, gruppo_id, prima_nota_gruppi(descrizione, importo)")
        .in("id", idsRighe.split(","));
      if (error) throw error;
      return new Map(((data ?? []) as unknown as { id: string; gruppo_id: string | null; prima_nota_gruppi: { descrizione: string; importo: number } | null }[])
        .filter((r) => r.gruppo_id).map((r) => [r.id, { gruppo: r.gruppo_id!, ...r.prima_nota_gruppi! }]));
    },
  });
  const gruppoDi = (id: string) => gruppi.data?.get(id);
  const quoteDelGruppo = (g: string) => rows.filter((r) => gruppoDi(r.id)?.gruppo === g);
  // Se un movimento diviso fa esattamente quanto resta del bonifico, si propone.
  const proposti = [...new Set([...(gruppi.data?.values() ?? [])].map((g) => g.gruppo))]
    .map((g) => ({ gruppo: g, quote: quoteDelGruppo(g), info: [...gruppi.data!.values()].find((x) => x.gruppo === g)! }))
    .filter((p) => p.quote.every((r) => !selected[r.id])
      && Math.abs(p.quote.reduce((s, r) => s + Number(r.residuo), 0) - m.links.remaining) < 0.005
      && Math.abs(Number(p.info.importo) - m.links.remaining) < 0.005);
  const seleziona = (rs: CandidatoRipartizione[], v: boolean) =>
    setSelected((old) => {
      const next = { ...old };
      for (const r of rs) { if (v) next[r.id] = r; else delete next[r.id]; }
      return next;
    });
  async function confirm() {
    if (inVolo.current) return;
    inVolo.current = true;
    setBusy(true);
    try {
      await bankRpc("bank_associa_pagamenti", {
        p_company: company,
        p_tx: m.id,
        p_ids: Object.keys(selected),
      });
      toast.success(t("Prove bancarie collegate: nessun pagamento duplicato"));
      onDone();
    } catch (e) {
      toast.error(messaggioErrore(e, t("Collegamento non riuscito")));
    } finally {
      inVolo.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {t("Seleziona gli incassi o pagamenti già registrati che compongono questo bonifico. Saranno collegati per il loro intero importo, senza registrare altri movimenti di cassa.")}
      </p>
      <Input
        aria-label={t("Cerca pagamenti già registrati")}
        placeholder={t("Cerca descrizione, riferimento o data…")}
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
          {t("Ricerca in corso…")}
        </p>
      )}
      {proposti.map((p) => (
        <button key={p.gruppo} type="button" disabled={busy} onClick={() => seleziona(p.quote, true)}
          className="w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-left text-sm hover:bg-primary/10">
          <span className="font-medium">{t("«{descrizione}» fa esattamente {remaining}", { descrizione: String(p.info.descrizione ?? ""), remaining: String(money(m.links.remaining) ?? "") })}</span>
          <span className="block text-xs text-muted-foreground">{t("{n} quote registrate in Prima Nota: toccalo per selezionarle tutte.", { n: p.quote.length })}</span>
        </button>
      ))}
      <div className="max-h-72 space-y-2 overflow-auto">
        {rows.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              checked={!!selected[r.id]}
              disabled={busy}
              onCheckedChange={(v) => {
                const g = gruppoDi(r.id);
                seleziona(g ? quoteDelGruppo(g.gruppo) : [r], v === true);
              }}
              aria-label={t("Collega {titolo}", { titolo: String(r.titolo ?? "") })}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block break-words font-medium">{r.titolo}</span>
              <span className="text-xs text-muted-foreground">
                {r.sottotitolo}
              </span>
              {gruppoDi(r.id) && (
                <span className="block text-xs text-primary">{t("Quota di «{descrizione}»: si collega insieme alle altre", { descrizione: String(gruppoDi(r.id)!.descrizione ?? "") })}</span>
              )}
            </span>
            <span className="shrink-0 text-sm font-semibold">
              {money(r.residuo)}
            </span>
          </label>
        ))}
        {!query.isFetching && !rows.length && !query.isError && (
          <p className="text-sm text-muted-foreground">
            {t("Nessun pagamento disponibile: verifica che sia già registrato in Prima nota e non sia collegato a un’altra prova bancaria.")}
          </p>
        )}
      </div>
      <p
        className={`text-sm ${total > m.links.remaining + 0.004 ? "text-destructive" : "text-muted-foreground"}`}
      >{t("Selezionati {selezionati} · disponibili {disponibili}", { selezionati: String(money(total) ?? ""), disponibili: String(money(m.links.remaining) ?? "") })}</p>
      <Button
        disabled={
          busy ||
          !Object.keys(selected).length ||
          total > m.links.remaining + 0.004 ||
          query.isError
        }
        onClick={() => void confirm()}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Conferma collegamento")}
      </Button>
    </div>
  );
}

function Azione({ children, onClick, label }: { children: string; onClick?: () => void; label: string }) {
  return onClick ? (
    <Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" onClick={onClick} aria-label={label}>
      {children}
    </Button>
  ) : null;
}

function Pastiglia({ t, importo, valuta }: { t: BankTarget; importo?: number; valuta: (n: number) => string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
      {t.url ? (
        <Link to={t.url} className="truncate font-medium hover:underline">
          {t.label}
        </Link>
      ) : (
        <span className="truncate font-medium">{t.label}</span>
      )}
      {importo != null && <span className="shrink-0 text-muted-foreground">{valuta(importo)}</span>}
    </span>
  );
}

function Nessuno() {
  const t = useT();
  return <span className="text-muted-foreground">{t("Nessuno")}</span>;
}
