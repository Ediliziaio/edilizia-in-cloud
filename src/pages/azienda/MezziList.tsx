/**
 * /azienda/mezzi — Mezzi e attrezzature (24/09/2026).
 *
 * In cima quello che è scaduto o sta per scadere, sotto l'elenco dei mezzi con
 * il pallino dello stato peggiore. Le scadenze vengono dalla vista
 * mezzi_scadenze, la stessa che fa partire l'avviso giornaliero.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Loader2, Plus, Search, Truck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useCopertineMezzi, useCostiParco, useMezzi, useMezziScadenze, useSegnalazioniAperte } from "@/hooks/useMezzi";
import { formatCurrency } from "@/lib/formatters";
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import {
  STATO_SCADENZA_BADGE, TIPI_MEZZO, costoAnnuoMezzo, descriviScadenza, formatContatore, formatData, giornoItaliano,
  oggiIso, statoMezzo, statoPeggiore, tipoMezzoLabel, tipoSegnalazioneLabel,
  type MezzoScadenza,
} from "@/types/mezzi";

const TUTTI = "__tutti__";
const PALLINO: Record<string, string> = {
  scaduto: "bg-red-500",
  in_scadenza: "bg-amber-400",
  valido: "bg-emerald-500",
};

export default function MezziList() {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;

  const { data: mezzi = [], isLoading, error, refetch } = useMezzi();
  const { data: scadenze = [] } = useMezziScadenze();
  const { data: segnalazioni = [] } = useSegnalazioniAperte();
  const { data: costiParco } = useCostiParco();
  const { data: copertine } = useCopertineMezzi(mezzi.map((m) => m.foto_path ?? "").filter(Boolean));

  const [cerca, setCerca] = useState("");
  const [tipo, setTipo] = useState<string>(TUTTI);
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [tutteLeScadenze, setTutteLeScadenze] = useState(false);

  const daControllare = useMemo(
    () =>
      scadenze
        .filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza")
        .sort((a, b) =>
          a.stato !== b.stato
            ? a.stato === "scaduto" ? -1 : 1
            : (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"),
        ),
    [scadenze],
  );

  const perMezzo = useMemo(() => {
    const m = new Map<string, MezzoScadenza[]>();
    for (const s of scadenze) (m.get(s.mezzo_id) ?? m.set(s.mezzo_id, []).get(s.mezzo_id)!).push(s);
    return m;
  }, [scadenze]);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return mezzi.filter((m) => {
      if (tipo !== TUTTI && m.tipo !== tipo) return false;
      if (!q) return true;
      return [m.nome, m.targa, m.marca, m.modello, m.assegnato_persona, m.assegnato_commessa]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [mezzi, cerca, tipo]);

  const visibili = tutteLeScadenze ? daControllare : daControllare.slice(0, 5);
  const nomeMezzo = useMemo(() => new Map(mezzi.map((m) => [m.id, m.targa ? `${m.nome} · ${m.targa}` : m.nome])), [mezzi]);
  const guasti = segnalazioni.filter((s) => s.tipo !== "km" && nomeMezzo.has(s.mezzo_id));
  const guastiPerMezzo = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of segnalazioni) if (g.tipo !== "km") m.set(g.mezzo_id, (m.get(g.mezzo_id) ?? 0) + 1);
    return m;
  }, [segnalazioni]);

  // Il parco in due numeri: quanto vale (acquisti segnati) e quanto costa in un anno (stima).
  const parco = useMemo(() => {
    if (!mezzi.length) return null;
    const oggi = oggiIso();
    let valore = 0;
    let costoAnno = 0;
    for (const m of mezzi) {
      valore += Number(m.valore_acquisto ?? 0);
      costoAnno += costoAnnuoMezzo(
        m,
        (costiParco?.documenti ?? []).filter((d) => d.mezzo_id === m.id),
        (costiParco?.manutenzioni ?? []).filter((x) => x.mezzo_id === m.id),
        oggi,
      ).totale;
    }
    return { valore, costoAnno };
  }, [mezzi, costiParco]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] sm:h-10 sm:w-10">
            <Truck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Mezzi e attrezzature</h1>
            <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">
              Furgoni, mezzi e attrezzi: assicurazioni, revisioni e tagliandi, con l'avviso prima che scadano.
            </p>
          </div>
        </div>
        {puoModificare && (
          <Button
            size="sm"
            onClick={() => setNuovoAperto(true)}
            className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Nuovo mezzo
          </Button>
        )}
      </div>

      {parco && (
        <p className="px-1 text-sm text-muted-foreground max-sm:hidden">
          {mezzi.length === 1 ? "1 mezzo" : `${mezzi.length} mezzi`}
          {parco.valore > 0 && <> · valore d'acquisto <span className="font-medium text-foreground">{formatCurrency(parco.valore)}</span></>}
          {parco.costoAnno > 0 && <> · costano circa <span className="font-medium text-foreground">{formatCurrency(parco.costoAnno)}</span> l'anno</>}
        </p>
      )}

      {(daControllare.length > 0 || guasti.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" aria-labelledby="da-controllare">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <h2 id="da-controllare" className="text-sm font-semibold text-amber-900">
              Da controllare: {daControllare.length + guasti.length}
            </h2>
          </div>
          <ul className="divide-y divide-amber-200/70">
            {guasti.map((g) => (
              <li key={`guasto-${g.id}`}>
                <Link
                  to={`/azienda/mezzi/${g.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{nomeMezzo.get(g.mezzo_id)}</span>
                    <span className="block truncate text-xs text-slate-600">
                      {tipoSegnalazioneLabel(g.tipo)} dal campo, {formatData(giornoItaliano(g.created_at))}{g.descrizione ? `: ${g.descrizione}` : ""}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-[11px] text-red-700">
                    {g.stato === "in_lavorazione" ? "In lavorazione" : "Da vedere"}
                  </Badge>
                </Link>
              </li>
            ))}
            {visibili.map((s) => (
              <li key={`${s.origine}-${s.riferimento_id}`}>
                <Link
                  to={`/azienda/mezzi/${s.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[s.stato]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {s.mezzo_nome}{s.targa ? ` · ${s.targa}` : ""}
                    </span>
                    <span className="block truncate text-xs text-slate-600">{descriviScadenza(s)}</span>
                  </span>
                  <Badge variant="outline" className={`shrink-0 text-[11px] ${STATO_SCADENZA_BADGE[s.stato].cls}`}>
                    {STATO_SCADENZA_BADGE[s.stato].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
          {daControllare.length > 5 && (
            <button
              type="button"
              className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2"
              onClick={() => setTutteLeScadenze((v) => !v)}
            >
              {tutteLeScadenze ? "Mostra meno" : `Mostra tutte (${daControllare.length})`}
            </button>
          )}
        </section>
      )}

      {/* Con pochi mezzi si vedono tutti: ricerca e filtro servono da sei in su. */}
      {mezzi.length > 5 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca nome, targa, persona"
              className="pl-9"
              aria-label="Cerca mezzi"
            />
          </div>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="sm:w-56" aria-label="Filtra per tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TUTTI}>Tutti i tipi</SelectItem>
              {TIPI_MEZZO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Non riesco a caricare i mezzi.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : mezzi.length === 0 ? (
        // Telefono: una riga e basta; «Nuovo mezzo» c'è già in alto.
        <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center max-sm:px-3 max-sm:py-5">
          <Truck className="mx-auto h-10 w-10 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold max-sm:mt-0 max-sm:text-sm max-sm:font-normal max-sm:text-muted-foreground">Nessun mezzo ancora</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground max-sm:hidden">
            Aggiungi furgoni, mezzi d'opera e attrezzi: poi carichi assicurazione, revisione e tagliandi, e ti avvisiamo prima delle scadenze.
          </p>
          {puoModificare && (
            <Button className="mt-4 max-sm:hidden" onClick={() => setNuovoAperto(true)}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi il primo mezzo
            </Button>
          )}
        </div>
      ) : filtrati.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nessun mezzo corrisponde alla ricerca.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {filtrati.map((m) => {
            const sue = perMezzo.get(m.id) ?? [];
            const peggiore = statoPeggiore(sue.map((s) => s.stato));
            const urgente = sue
              .filter((s) => s.stato === peggiore && peggiore !== "valido")
              .sort((a, b) => (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"))[0];
            const stato = statoMezzo(m.stato);
            const carico = [m.assegnato_persona, m.assegnato_commessa, m.su_mezzo_nome ? `su ${m.su_mezzo_nome}` : null]
              .filter(Boolean).join(" · ");
            const nGuasti = guastiPerMezzo.get(m.id) ?? 0;
            return (
              <li key={m.id}>
                <Link
                  to={`/azienda/mezzi/${m.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/30"
                >
                  {m.foto_path && copertine?.get(m.foto_path) ? (
                    <img
                      src={copertine.get(m.foto_path)}
                      alt=""
                      loading="lazy"
                      className="h-10 w-12 shrink-0 rounded-lg border object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <IconaMezzo tipo={m.tipo} className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{m.nome}</span>
                      {m.targa && <span className="shrink-0 rounded border px-1 font-mono text-[11px] text-slate-600">{m.targa}</span>}
                      {m.stato !== "in_servizio" && (
                        <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] ${stato.cls}`}>{stato.label}</Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[tipoMezzoLabel(m.tipo), m.contatore != null ? formatContatore(m.contatore, m.contatore_unita) : null, carico || null]
                        .filter(Boolean).join(" · ")}
                    </span>
                    {nGuasti > 0 && (
                      <span className="mt-0.5 block truncate text-xs font-medium text-red-700">
                        {nGuasti === 1 ? "1 segnalazione dal campo da vedere" : `${nGuasti} segnalazioni dal campo da vedere`}
                      </span>
                    )}
                    {urgente && (
                      <span className={`mt-0.5 block truncate text-xs font-medium ${peggiore === "scaduto" ? "text-red-700" : "text-amber-700"}`}>
                        {descriviScadenza(urgente)}
                      </span>
                    )}
                  </span>
                  {(peggiore || nGuasti > 0) && (
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[nGuasti > 0 ? "scaduto" : peggiore ?? "valido"]}`}
                      title={nGuasti > 0 ? "Segnalazioni da vedere" : STATO_SCADENZA_BADGE[peggiore ?? "valido"].label}
                      aria-label={nGuasti > 0 ? "Segnalazioni da vedere" : STATO_SCADENZA_BADGE[peggiore ?? "valido"].label}
                    />
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <MezzoFormDialog
        open={nuovoAperto}
        onOpenChange={setNuovoAperto}
        onSalvato={(id) => navigate(`/azienda/mezzi/${id}`)}
      />
    </div>
  );
}
