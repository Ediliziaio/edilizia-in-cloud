import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CarFront, ChevronDown, Plus, Route } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useViaggiElenco, useViaggioStorico } from "@/hooks/useMezziViaggi";
import {
  totaliCommessa,
  riepilogoViaggio,
  type Viaggio,
} from "@/lib/mezzi/viaggi";
import { formatCurrency } from "@/lib/formatters";
import { formatData, oggiIso } from "@/types/mezzi";
import { cn } from "@/lib/utils";
import { ViaggioDialog } from "./ViaggioDialog";
import { PercorrenzeMezzi } from "./PercorrenzeMezzi";
import { ArriviDaRapportini } from "./ArriviDaRapportini";
import type { ArrivoDaRapportino } from "@/lib/campo/arrivoRapportino";

const n = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const dataOra = (value: string) =>
  new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  });
const stati = {
  bozza: "Bozza",
  inviato: "Da verificare",
  verificato: "Verificato dall’ufficio",
  annullato: "Annullato",
};
interface MezzoOption {
  id: string;
  nome: string;
  tipo: string;
  contatore_unita?: string;
}
interface Props {
  companyId: string;
  mezzoId?: string;
  orderId?: string;
  mezzi?: MezzoOption[];
  campo?: boolean;
  readOnly?: boolean;
  vedeCosti?: boolean;
  autoOpen?: boolean;
  defaultOrderId?: string;
  initialDay?: string;
  initialTripId?: string;
  integrato?: boolean;
  riepilogoPeriodo?: (dal: string, al: string) => ReactNode;
}

/** Lazy history; no route calculations, GPS or writes during reads. */
export function ViaggiMezzoWorkspace({
  companyId,
  mezzoId,
  orderId,
  mezzi = [],
  campo = false,
  readOnly = false,
  vedeCosti = false,
  autoOpen = false,
  defaultOrderId,
  initialDay,
  initialTripId,
  integrato = false,
  riepilogoPeriodo,
}: Props) {
  const [expanded, setExpanded] = useState(!campo || autoOpen || !!initialTripId);
  const [dialog, setDialog] = useState<{
    mezzoId: string;
    viaggio?: Viaggio;
    arrivo?: ArrivoDaRapportino;
  } | null>(autoOpen && mezzoId ? { mezzoId } : null);
  const [selected, setSelected] = useState(mezzoId ?? "");
  const [registraManuale, setRegistraManuale] = useState(false);
  const validInitial =
    initialDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(initialDay) &&
    Number.isFinite(Date.parse(initialDay))
      ? initialDay
      : null;
  const oggi = oggiIso();
  const inizioUltimi30 = format(subDays(parseISO(oggi), 29), "yyyy-MM-dd");
  const [dal, setDal] = useState(
    validInitial ?? (integrato ? inizioUltimi30 : format(subDays(new Date(), 30), "yyyy-MM-dd")),
  );
  const [al, setAl] = useState(validInitial ?? oggi);
  const [dateAperte, setDateAperte] = useState(!!validInitial);
  const [offset, setOffset] = useState(0);
  const rangeValid =
    !!dal &&
    !!al &&
    al >= dal &&
    (Date.parse(al) - Date.parse(dal)) / 86400000 <= 366;
  const list = useViaggiElenco({
    companyId,
    mezzoId,
    orderId,
    dal,
    al,
    offset,
    enabled: expanded && rangeValid,
  });
  const rows = list.data?.items ?? [];
  const total = orderId && !riepilogoPeriodo ? totaliCommessa(rows, orderId) : null;
  const roadVehicles = mezzi.filter(
    (m) =>
      ["autovettura", "furgone", "autocarro", "altro"].includes(m.tipo) &&
      (!m.contatore_unita || m.contatore_unita === "km"),
  );
  const periodoRapido = (giorno: string) => {
    setDal(giorno);
    setAl(oggi);
    setOffset(0);
    setDateAperte(false);
  };
  return (
    <section
      aria-label={orderId ? "Viaggi e tratte della commessa" : "Viaggi e tratte del mezzo"}
      className={orderId ? "space-y-3" : "space-y-3 rounded-2xl border border-blue-100 bg-white p-3 sm:p-4"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {integrato ? <div className="space-y-1.5">
          <h3 className="sr-only">Registro viaggi</h3>
          <div role="group" aria-label="Periodo del registro" className="flex flex-wrap gap-1">
            {[{ testo: "Ultimi 30 giorni", dal: inizioUltimi30 }, { testo: "Oggi", dal: oggi }].map(p => (
              <Button key={p.testo} type="button" size="sm" variant="ghost" aria-pressed={dal === p.dal && al === oggi}
                className={cn("h-8 px-2.5", dal === p.dal && al === oggi ? "bg-primary/10 font-semibold text-primary hover:bg-primary/15" : "text-muted-foreground")}
                onClick={() => periodoRapido(p.dal)}>{p.testo}</Button>
            ))}
            <Button type="button" size="sm" variant="outline" className="h-8 px-2.5" aria-expanded={dateAperte}
              onClick={() => setDateAperte(v => !v)}><CalendarDays className="size-4" aria-hidden="true" />Periodo</Button>
          </div>
          {rangeValid && <p className="px-0.5 text-xs tabular-nums text-muted-foreground">{dal === al ? formatData(dal) : `${formatData(dal)} – ${formatData(al)}`} · data di partenza</p>}
        </div> : <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-11 items-center gap-2 text-left text-sm font-semibold text-blue-950"
        >
          <Route className="h-4 w-4" />
          Viaggi e tratte
          <ChevronDown
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>}
        {!readOnly && mezzoId && (
          <Button
            className="min-h-11 rounded-xl"
            onClick={() => setDialog({ mezzoId })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Registra viaggio
          </Button>
        )}
        {integrato && !readOnly && !mezzoId && <Button size="sm" variant={registraManuale ? "secondary" : "default"}
          aria-expanded={registraManuale} onClick={() => setRegistraManuale(v => !v)}>
          <Plus className="size-4" aria-hidden="true" />Nuovo viaggio
        </Button>}
      </div>
      {!integrato && <p className="text-xs text-muted-foreground">
        {campo
          ? "Più cantieri nello stesso giro? Aggiungi una tratta per ogni tappa. Il viaggio si registra una sola volta, non per ogni passeggero."
          : orderId ? "Dai rapportini arrivano i mezzi dichiarati per l’andata in cantiere. Qui puoi completare i dettagli o registrare altre tratte."
            : "Viaggi dichiarati e tratte attribuite alle commesse."}
      </p>}
      {expanded && (
        <>
          {!mezzoId && !readOnly && (!integrato || registraManuale) && (
            <div className={cn("flex flex-col gap-2 sm:flex-row", integrato && "rounded-xl border bg-muted/25 p-3 sm:items-center")}>
              <OfficeSelect
                label="Mezzo per nuovo viaggio"
                value={selected}
                onValueChange={setSelected}
                className="sm:max-w-md"
                options={[
                  { value: "", label: "Scegli il mezzo stradale" },
                  ...roadVehicles.map((m) => ({ value: m.id, label: m.nome })),
                ]}
              />
              <Button
                className={cn("min-h-11 rounded-xl", integrato && "shrink-0")}
                disabled={!roadVehicles.some(m => m.id === selected)}
                onClick={() => { setDialog({ mezzoId: selected }); setRegistraManuale(false); }}
              >
                <Plus className="size-4" aria-hidden="true" />
                {integrato ? "Continua" : "Registra viaggio"}
              </Button>
              {integrato && roadVehicles.length === 0 && <Link to="/azienda/manodopera?tab=mezzi" className="self-center text-xs font-medium text-muted-foreground underline underline-offset-2">Apri il parco mezzi</Link>}
            </div>
          )}
          {(!integrato || dateAperte) && <div className={cn("grid grid-cols-2 gap-2", integrato && "rounded-lg border bg-muted/25 p-2.5 sm:max-w-md")}>
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              Dal
              <Input
                aria-label="Viaggi dal"
                type="date"
                className="w-full min-w-0 bg-background"
                value={dal}
                onChange={(e) => {
                  setDal(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
              Al
              <Input
                aria-label="Viaggi al"
                type="date"
                className="w-full min-w-0 bg-background"
                value={al}
                onChange={(e) => {
                  setAl(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
          </div>}
          {!rangeValid && (
            <p role="alert" className="text-sm text-amber-800">
              Scegli un periodo valido, al massimo 366 giorni.
            </p>
          )}
          {rangeValid && riepilogoPeriodo?.(dal, al)}
          {orderId && rangeValid && <ArriviDaRapportini key={`${companyId}:${orderId}:${dal}:${al}`}
            companyId={companyId} orderId={orderId} dal={dal} al={al} readOnly={readOnly}
            onCompleta={arrivo => setDialog({ mezzoId: arrivo.mezzoId, arrivo })} />}
          {rangeValid && list.isPending && (
            <p role="status" className="text-sm">
              Carico il registro viaggi…
            </p>
          )}
          {rangeValid && list.isError && (
            <p
              role="alert"
              className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
            >
              {list.error.message}{" "}
              <Button variant="outline" onClick={() => void list.refetch()}>
                Riprova
              </Button>
            </p>
          )}
          {!list.isError && !list.isPending && rangeValid && (
            <section aria-label="Viaggi registrati" className={integrato ? "rounded-xl border bg-background" : "space-y-3"}>
              {integrato && <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b bg-muted/30 px-3 py-2.5">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Route className="size-4 text-primary" aria-hidden="true" />Viaggi registrati</h4>
                {rows.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "viaggio" : "viaggi"}{(offset > 0 || list.data?.has_more) && " in questa pagina"}
                </span>}
              </header>}
              {total && rows.length > 0 && (
                <div className={cn("space-y-2 p-3", integrato ? "border-b" : "rounded-xl border bg-muted/30")}>
                  <p className="text-xs font-medium text-muted-foreground">
                    {offset > 0 || list.data?.has_more ? "Tratte della commessa in questa pagina" : "Tratte della commessa nel periodo"}
                    <span className="font-normal"> · viaggi inviati e verificati</span>
                  </p>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: "Km verificati", valore: n(total.verificati) },
                      { label: "Km da verificare", valore: n(total.dichiarati) },
                      { label: "Km stimati", valore: n(total.stimati) },
                      { label: "Tratte senza km", valore: total.mancanti },
                    ].map(x => <div key={x.label} className="rounded-lg bg-muted/55 px-2.5 py-1.5">
                      <dt className="text-xs text-muted-foreground">{x.label}</dt>
                      <dd className="text-base font-semibold tabular-nums">{x.valore}</dd>
                    </div>)}
                  </dl>
                  {vedeCosti && (
                    <p className="text-xs text-muted-foreground">
                      Stima dei viaggi{" "}
                      {total.costoStimato == null
                        ? "· tariffa da definire"
                        : formatCurrency(total.costoStimato)}{" "}
                      · {n(total.kmSenzaTariffa)} km senza tariffa · fuori consuntivo
                    </p>
                  )}
                </div>
              )}
              {rows.length === 0 && (
                <p className={cn("px-3 py-3 text-sm text-muted-foreground", !integrato && "rounded-xl border border-dashed")}>
                  {orderId ? "Nessun viaggio con tratte e orari nel periodo." : "Nessun viaggio registrato nel periodo."}
                </p>
              )}
              {rows.length > 0 && <ul className={cn("space-y-2", integrato && "p-3")}>
                {rows.map((v) => (
                  <li key={v.id}>
                    <ViaggioRiga
                      companyId={companyId}
                      viaggio={v}
                      selezionato={v.id === initialTripId}
                      campo={campo}
                      editable={
                        !readOnly &&
                        !orderId &&
                        (!campo || v.stato === "bozza" || v.stato === "inviato")
                      }
                      onEdit={() =>
                        setDialog({ mezzoId: v.mezzo_id, viaggio: v })
                      }
                    />
                  </li>
                ))}
              </ul>}
              {(!integrato || offset > 0 || list.data?.has_more) && <div className={cn("flex items-center justify-between gap-2 text-xs text-muted-foreground", integrato && "border-t p-2.5")}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || list.isFetching}
                  onClick={() => setOffset((v) => Math.max(0, v - 50))}
                >
                  Precedenti
                </Button>
                <span>
                  Pagina {offset / 50 + 1} · {rows.length} viaggi
                  {list.isFetching ? " · aggiornamento…" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!list.data?.has_more || list.isFetching}
                  onClick={() => setOffset((v) => v + 50)}
                >
                  Successivi
                </Button>
              </div>}
            </section>
          )}
        </>
      )}
      {dialog && (
        <ViaggioDialog
          key={dialog.viaggio?.id ?? dialog.arrivo?.id ?? dialog.mezzoId}
          companyId={companyId}
          mezzoId={dialog.mezzoId}
          viaggio={dialog.viaggio}
          arrivoRapportino={dialog.arrivo}
          defaultOrderId={defaultOrderId ?? orderId}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function ViaggioRiga({
  companyId,
  viaggio: v,
  selezionato,
  campo,
  editable,
  onEdit,
}: {
  companyId: string;
  viaggio: Viaggio;
  selezionato: boolean;
  campo: boolean;
  editable: boolean;
  onEdit: () => void;
}) {
  const dettaglio = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!selezionato || !dettaglio.current) return;
    dettaglio.current.open = true;
    dettaglio.current.scrollIntoView({ block: "nearest" });
  }, [selezionato]);
  const [history, setHistory] = useState(false);
  const audit = useViaggioStorico(companyId, v.id, history && !campo);
  const summary = riepilogoViaggio(v);
  const statoClasse = v.stato === "verificato" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200"
    : v.stato === "inviato" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/45 dark:text-amber-200"
      : "bg-muted text-muted-foreground";
  return (
    <details ref={dettaglio} className="group/viaggio rounded-xl border bg-background">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><CarFront className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 basis-32">
          <span className="block break-words font-semibold">{v.mezzo_nome}</span>
          <span className="block text-xs tabular-nums text-muted-foreground">{dataOra(v.partenza)} · {v.tratte.length} {v.tratte.length === 1 ? "tratta" : "tratte"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
          <span className="text-xs font-medium tabular-nums">{summary.km == null ? "Km da completare" : `${n(summary.km)} km`}</span>
          <Badge variant="outline" className={cn("rounded-md", statoClasse)}>{stati[v.stato]}</Badge>
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground group-open/viaggio:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t p-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Arrivo {dataOra(v.arrivo)}
          {v.conducente
            ? ` · In carico a ${v.conducente}`
            : " · Conducente non assegnato"}
          {v.ambito_commessa
            ? " · Mostrate solo le tratte di questa commessa"
            : ""}
        </p>
        <ol className="space-y-2">
          {v.tratte.map((t, i) => (
            <li key={t.id} className="rounded-lg bg-muted/50 p-2">
              <strong>
                {i + 1}. {t.da} → {t.a}
              </strong>
              <p className="text-xs text-muted-foreground">
                {n(t.km)} km ·{" "}
                {t.fonte === "stimati" ? "Stima, da verificare" : "Dichiarati"}
                {t.minuti != null ? ` · ${n(t.minuti)} min` : ""} ·{" "}
                {t.rientro_attribuito ? "Rientro attribuito alla commessa" : t.destinazione === "generale"
                  ? "Spostamento generale"
                  : t.destinazione === "da_attribuire"
                    ? "Da attribuire in ufficio"
                    : "Collegata alla commessa"}
              </p>
            </li>
          ))}
        </ol>
        {!v.ambito_commessa && summary.delta != null && (
          <p className="text-xs">
            Contatore: {n(summary.delta)} km · scarto: {n(summary.scarto)} km
            {summary.scarto != null && Math.abs(summary.scarto) > 0.1
              ? " — da riconciliare"
              : ""}
          </p>
        )}
        {v.note && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{v.note}</p>
        )}
        {editable && (
          <Button variant="outline" className="min-h-11" onClick={onEdit}>
            Rivedi viaggio
          </Button>
        )}
        {v.ambito_commessa && !campo && (
          <Button asChild variant="outline" className="min-h-11">
            <Link
              to={`/azienda/mezzi/${v.mezzo_id}?tab=viaggi&giorno=${format(new Date(v.partenza), "yyyy-MM-dd")}`}
            >
              Apri registro completo del mezzo
            </Link>
          </Button>
        )}
        {!campo && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistory((x) => !x)}
              aria-expanded={history}
            >
              Storico verifiche e rettifiche
            </Button>
            {history &&
              (audit.isPending ? (
                <p className="text-xs">Carico storico…</p>
              ) : audit.isError ? (
                <p role="alert" className="text-xs text-red-700">
                  {audit.error.message}
                </p>
              ) : (
                <ol className="space-y-1 text-xs">
                  {audit.data?.map((e) => (
                    <li key={e.versione}>
                      Rev. {e.versione} · {e.azione} · {dataOra(e.created_at)}
                      {e.motivo ? ` — ${e.motivo}` : ""}
                    </li>
                  ))}
                </ol>
              ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function ViaggiCommessa({
  orderId,
  mezzi,
  readOnly,
  vedeCosti,
  integrato = false,
}: {
  orderId: string;
  mezzi: MezzoOption[];
  readOnly: boolean;
  vedeCosti: boolean;
  integrato?: boolean;
}) {
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
  const riepilogoPeriodo = (dal: string, al: string) =>
    <PercorrenzeMezzi ordine={orderId} dal={dal} al={al} costi={vedeCosti} />;
  if (integrato) return companyId ? <div className="p-3 sm:p-4">
    <ViaggiMezzoWorkspace key={`${companyId}:${orderId}`} companyId={companyId} orderId={orderId} mezzi={mezzi} readOnly={readOnly} vedeCosti={vedeCosti} integrato
      riepilogoPeriodo={riepilogoPeriodo} />
  </div> : null;
  return (
    <details
      className="rounded-xl border bg-white p-3"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpen(true);
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Registro viaggi e tratte della commessa
      </summary>
      {open && companyId && (
        <div className="mt-3">
          <ViaggiMezzoWorkspace
            companyId={companyId}
            orderId={orderId}
            mezzi={mezzi}
            readOnly={readOnly}
            vedeCosti={vedeCosti}
            riepilogoPeriodo={riepilogoPeriodo}
          />
        </div>
      )}
    </details>
  );
}
