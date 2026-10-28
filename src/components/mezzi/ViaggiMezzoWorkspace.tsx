import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Plus, Route } from "lucide-react";
import { format, subDays } from "date-fns";
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
import { oggiIso } from "@/types/mezzi";
import { ViaggioDialog } from "./ViaggioDialog";

const n = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const dataOra = (value: string) =>
  new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
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
}: Props) {
  const [expanded, setExpanded] = useState(!campo || autoOpen);
  const [dialog, setDialog] = useState<{
    mezzoId: string;
    viaggio?: Viaggio;
  } | null>(autoOpen && mezzoId ? { mezzoId } : null);
  const [selected, setSelected] = useState(mezzoId ?? "");
  const validInitial =
    initialDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(initialDay) &&
    Number.isFinite(Date.parse(initialDay))
      ? initialDay
      : null;
  const [dal, setDal] = useState(
    validInitial ?? format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [al, setAl] = useState(validInitial ?? oggiIso());
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
  const total = orderId ? totaliCommessa(rows, orderId) : null;
  const roadVehicles = mezzi.filter(
    (m) =>
      ["autovettura", "furgone", "autocarro", "altro"].includes(m.tipo) &&
      (!m.contatore_unita || m.contatore_unita === "km"),
  );
  return (
    <section
      aria-label="Viaggi e tratte del mezzo"
      className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
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
        </button>
        {!readOnly && mezzoId && (
          <Button
            className="min-h-11 rounded-xl"
            onClick={() => setDialog({ mezzoId })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Registra viaggio
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-600">
        {campo
          ? "Più cantieri nello stesso giro? Aggiungi una tratta per ogni tappa. Il viaggio si registra una sola volta, non per ogni passeggero."
          : "Registro dei viaggi dichiarati, distinto dall’assegnazione del mezzo e dalla stima sede–cantiere. Nessun costo, rimborso o ora viene registrato automaticamente."}
      </p>
      {expanded && (
        <>
          {!mezzoId && !readOnly && (
            <div className="flex flex-col gap-2 sm:flex-row">
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
                className="min-h-11 rounded-xl"
                disabled={!selected}
                onClick={() => setDialog({ mezzoId: selected })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Registra viaggio
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              Dal
              <Input
                aria-label="Viaggi dal"
                type="date"
                value={dal}
                onChange={(e) => {
                  setDal(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <label className="text-xs text-slate-600">
              Al
              <Input
                aria-label="Viaggi al"
                type="date"
                value={al}
                onChange={(e) => {
                  setAl(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
          </div>
          {!rangeValid && (
            <p role="alert" className="text-sm text-amber-800">
              Scegli un periodo valido, al massimo 366 giorni.
            </p>
          )}
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
            <>
              {total && rows.length > 0 && (
                <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">
                  <p className="mb-1 text-xs font-semibold">
                    {offset > 0 || list.data?.has_more
                      ? "Riepilogo delle righe di questa pagina"
                      : "Riepilogo del periodo"}{" "}
                    · solo tratte di questa commessa, bozze e annullati esclusi
                  </p>
                  <p>
                    {n(total.verificati)} km verificati · {n(total.dichiarati)}{" "}
                    dichiarati da verificare · {n(total.stimati)} stimati ·{" "}
                    {total.mancanti} tratte senza km
                  </p>
                  {vedeCosti && (
                    <p className="mt-1 text-xs">
                      Simulazione gestionale:{" "}
                      {total.costoStimato == null
                        ? "— (tariffa da definire)"
                        : formatCurrency(total.costoStimato)}{" "}
                      · {n(total.kmSenzaTariffa)} km senza tariffa. Non inclusa
                      nel consuntivo contabile.
                    </p>
                  )}
                </div>
              )}
              {rows.length === 0 && (
                <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">
                  Nessun viaggio registrato nel periodo. I km stimati dalle
                  assegnazioni non sono viaggi confermati.
                </p>
              )}
              <ul className="space-y-2">
                {rows.map((v) => (
                  <li key={v.id}>
                    <ViaggioRiga
                      companyId={companyId}
                      viaggio={v}
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
              </ul>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
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
              </div>
            </>
          )}
        </>
      )}
      {dialog && (
        <ViaggioDialog
          key={dialog.viaggio?.id ?? dialog.mezzoId}
          companyId={companyId}
          mezzoId={dialog.mezzoId}
          viaggio={dialog.viaggio}
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
  campo,
  editable,
  onEdit,
}: {
  companyId: string;
  viaggio: Viaggio;
  campo: boolean;
  editable: boolean;
  onEdit: () => void;
}) {
  const [history, setHistory] = useState(false);
  const audit = useViaggioStorico(companyId, v.id, history && !campo);
  const summary = riepilogoViaggio(v);
  return (
    <details className="rounded-xl border bg-white p-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-semibold">{v.mezzo_nome}</span> ·{" "}
        {dataOra(v.partenza)}
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{stati[v.stato]}</Badge>
          <span>
            {n(summary.km)} km
            {summary.mancanti > 0
              ? ` · ${summary.mancanti} tratte senza km`
              : ""}
          </span>
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-xs text-slate-600">
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
            <li key={t.id} className="rounded-lg bg-slate-50 p-2">
              <strong>
                {i + 1}. {t.da} → {t.a}
              </strong>
              <p className="text-xs text-slate-600">
                {n(t.km)} km ·{" "}
                {t.fonte === "stimati" ? "Stima, da verificare" : "Dichiarati"}
                {t.minuti != null ? ` · ${n(t.minuti)} min` : ""} ·{" "}
                {t.destinazione === "generale"
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
          <p className="whitespace-pre-wrap text-xs text-slate-600">{v.note}</p>
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
}: {
  orderId: string;
  mezzi: MezzoOption[];
  readOnly: boolean;
  vedeCosti: boolean;
}) {
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
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
          />
        </div>
      )}
    </details>
  );
}
