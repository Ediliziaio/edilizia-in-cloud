/**
 * Manodopera e Mezzi → Operai (26/09/2026).
 *
 * Tre viste:
 * - «Giornata»: chi è al lavoro, in pausa, uscito, assente, a riposo o non ha
 *   timbrato, divisi per squadra, con il cantiere timbrato o previsto;
 * - «Squadre»: le squadre con nome, colore, responsabile, chi c'è dentro e le
 *   commesse su cui lavorano; si creano e si mettono al lavoro da qui;
 * - «Elenco»: gli operai con squadra, documenti, mezzo, app (il costo sta nel
 *   Personale: qui entra anche chi organizza i cantieri).
 * Gli operai sono le persone del Personale con «Lavora in cantiere» acceso.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Clock, Crown, FileWarning, HardHat, LogOut, Truck,
  MoreHorizontal, Moon, Pencil, Plus, RefreshCw, Search, Smartphone, Users, UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { KpiMobili, RigaMobile } from "@/components/mobile/FiltriMobile";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { OperaioDialog } from "@/components/manodopera/OperaioDialog";
import { SquadraDialog } from "@/components/manodopera/SquadraDialog";
import { SquadraCommessaDialog } from "@/components/manodopera/SquadraCommessaDialog";
import { DiarioGiorno } from "@/components/manodopera/DiarioGiorno";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { it } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";
import {
  messaggioErroreOperai, oggiRoma, useGiornataOperai, useOperai, useSciogliSquadra, useSquadre,
  type OperaioElenco, type OperaioOggi, type Squadra,
} from "@/hooks/useOperai";
import {
  PALLINO_STATO, TONO_STATO, cantiereDelGruppo, contaGiornata, etichettaGiornata, formatOra, formatOre,
  giornoInParole, passaFiltroGiornata, perSquadra, spostaGiorno, statoNoto, type FiltroGiornata,
} from "@/lib/manodopera/giornata";
import { formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type Vista = "oggi" | "squadre" | "elenco";
const VISTE: { v: Vista; etichetta: string }[] = [
  { v: "oggi", etichetta: "Giornata" },
  { v: "squadre", etichetta: "Squadre" },
  { v: "elenco", etichetta: "Elenco" },
];

export default function OperaiTab() {
  const perms = usePermissions();
  const puoModificare = (perms.canEditOperai || perms.isAdmin) && !perms.solaLettura;
  const [searchParams, setSearchParams] = useSearchParams();
  const richiesta = searchParams.get("vista");
  const vista: Vista = richiesta === "elenco" || richiesta === "squadre" ? richiesta : "oggi";
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [nuovaSquadra, setNuovaSquadra] = useState(false);
  const navigate = useNavigate();

  const cambiaVista = (v: Vista) => {
    const next = new URLSearchParams(searchParams);
    if (v === "oggi") next.delete("vista");
    else next.set("vista", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {VISTE.map(({ v, etichetta }) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => cambiaVista(v)}
              className={cn(
                "tap-compact rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                vista === v ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {etichetta}
            </button>
          ))}
        </div>
        {puoModificare && (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNuovaSquadra(true)}>
                <UsersRound className="h-4 w-4" aria-hidden="true" />Nuova squadra
              </Button>
              <Button
                size="sm"
                onClick={() => setNuovoAperto(true)}
                className="gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />Nuovo operaio
              </Button>
            </div>
            {/* Telefono: un bottone solo, le due scelte nel menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  aria-label="Aggiungi"
                  className="h-9 w-9 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm sm:hidden"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setNuovoAperto(true)}>Nuovo operaio</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNuovaSquadra(true)}>Nuova squadra</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {vista === "oggi" && <GiornataOperai onNuovo={puoModificare ? () => setNuovoAperto(true) : undefined} />}
      {vista === "squadre" && <SquadreOperai puoModificare={puoModificare} onNuova={() => setNuovaSquadra(true)} />}
      {vista === "elenco" && <ElencoOperai onNuovo={puoModificare ? () => setNuovoAperto(true) : undefined} />}

      <OperaioDialog
        aperto={nuovoAperto}
        onAperto={setNuovoAperto}
        onSalvato={(id) => navigate(`/azienda/manodopera/operai/${id}`)}
      />
      <SquadraDialog
        aperto={nuovaSquadra}
        onAperto={setNuovaSquadra}
        onSalvata={() => cambiaVista("squadre")}
      />
    </div>
  );
}

// ── Vista «Giornata» ─────────────────────────────────────────────────────────

function GiornataOperai({ onNuovo }: { onNuovo?: () => void }) {
  const oggi = oggiRoma();
  const [giorno, setGiorno] = useState(oggi);
  const [filtro, setFiltro] = useState<FiltroGiornata>("tutti");
  const [cerca, setCerca] = useState("");
  const [calendarioAperto, setCalendarioAperto] = useState(false);
  const perms = usePermissions();
  const { data = [], isLoading, error, refetch, isFetching } = useGiornataOperai(giorno);

  const conta = useMemo(() => contaGiornata(data), [data]);
  const gruppi = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return perSquadra(data.filter((r) =>
      passaFiltroGiornata(r.stato, filtro)
      && (!q || [r.nome, r.cognome, `${r.nome} ${r.cognome}`, r.mansione, r.squadra, r.cantiere, r.previsto, r.mezzi, r.rapportino]
        .some((x) => x?.toLowerCase().includes(q)))));
  }, [data, filtro, cerca]);
  const eOggi = giorno === oggi;
  const tuttiARiposo = data.length > 0 && conta.riposo === data.length;
  const alterna = (f: FiltroGiornata) => setFiltro((x) => (x === f ? "tutti" : f));
  const linkCommesse = perms.canViewOrders === true || perms.isAdmin;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Giorno prima" onClick={() => setGiorno((g) => spostaGiorno(g, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarioAperto} onOpenChange={setCalendarioAperto}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="tap-compact min-w-[10.5rem] rounded px-1 py-1.5 text-center text-sm font-semibold text-slate-900 hover:bg-slate-50"
                aria-label={`Scegli il giorno (ora: ${giornoInParole(giorno, oggi)})`}
              >
                {giornoInParole(giorno, oggi)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={it}
                selected={new Date(`${giorno}T12:00:00`)}
                disabled={{ after: new Date(`${oggi}T12:00:00`) }}
                onSelect={(d) => {
                  if (!d) return;
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  setGiorno(iso);
                  setCalendarioAperto(false);
                }}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Giorno dopo" disabled={eOggi} onClick={() => setGiorno((g) => spostaGiorno(g, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!eOggi && <Button variant="outline" size="sm" onClick={() => setGiorno(oggi)}>Torna a oggi</Button>}
        <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-xs sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="cerca-giornata"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca persona, cantiere, mezzo…"
            aria-label="Cerca nella giornata"
            className="h-9 pl-9"
          />
        </div>
      </div>

      {tuttiARiposo && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <p>
            {eOggi ? "Oggi è" : `${giornoInParole(giorno, oggi)} era`} giorno di riposo per tutti: nessuno doveva timbrare.{" "}
            <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setGiorno(spostaGiorno(giorno, -1))}>
              Guarda il giorno prima
            </button>
          </p>
        </div>
      )}

      {!tuttiARiposo && (
        <>
          <KpiMobili
            className="sm:hidden"
            voci={[
              { label: "Al lavoro", valore: String(conta.alLavoro), tono: conta.alLavoro > 0 ? "text-emerald-700" : undefined, onClick: () => alterna("al_lavoro"), attivo: filtro === "al_lavoro" },
              { label: eOggi ? "Non hanno timbrato" : "Da controllare", valore: String(conta.daControllare), tono: conta.daControllare > 0 ? "text-amber-700" : undefined, onClick: () => alterna("da_controllare"), attivo: filtro === "da_controllare" },
              { label: "Usciti", valore: String(conta.usciti), onClick: () => alterna("usciti"), attivo: filtro === "usciti" },
              { label: "Assenti", valore: String(conta.assenti), onClick: () => alterna("assenti"), attivo: filtro === "assenti" },
            ]}
          />
          <div className="hidden grid-cols-4 gap-3 sm:grid">
            <OperationalKpiCard icon={HardHat} label="Al lavoro" value={conta.alLavoro} hint="anche chi è in pausa" tone="green" isLoading={isLoading} active={filtro === "al_lavoro"} onClick={() => alterna("al_lavoro")} />
            <OperationalKpiCard icon={AlertTriangle} label={eOggi ? "Non hanno timbrato" : "Da controllare"} value={conta.daControllare} hint={eOggi ? "nessuna entrata oggi" : "senza entrata o uscita"} tone={conta.daControllare > 0 ? "amber" : "slate"} isLoading={isLoading} active={filtro === "da_controllare"} onClick={() => alterna("da_controllare")} />
            <OperationalKpiCard icon={LogOut} label="Usciti" value={conta.usciti} hint="giornata finita" tone="slate" isLoading={isLoading} active={filtro === "usciti"} onClick={() => alterna("usciti")} />
            <OperationalKpiCard icon={CalendarOff} label="Assenti" value={conta.assenti} hint={conta.riposo > 0 ? `e ${conta.riposo} a riposo` : "ferie, permessi, malattia"} tone="blue" isLoading={isLoading} active={filtro === "assenti"} onClick={() => alterna("assenti")} />
          </div>
          {data.length > 0 && <BarraGiornata righe={data} />}
        </>
      )}

      {error ? (
        <ErroreCaricamento testo="Non riesco a caricare la giornata degli operai." onRiprova={() => refetch()} inCorso={isFetching} />
      ) : isLoading ? (
        <ScheletroLista />
      ) : data.length === 0 ? (
        <NessunOperaio onNuovo={onNuovo} />
      ) : gruppi.length === 0 && filtro !== "tutti" ? (
        <p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          Nessun operaio in questo gruppo.{" "}
          <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setFiltro("tutti")}>Mostra tutti</button>
        </p>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {gruppi.length === 0 && (
            <p className="rounded-xl border border-dashed bg-white px-4 py-6 text-center text-sm text-muted-foreground">
              Nessuno corrisponde alla ricerca.
            </p>
          )}
          {gruppi.map((g) => {
            const stati = g.righe.map((r) => statoNoto(r.stato));
            const riepilogo = stati.every((x) => x === "riposo")
              ? "a riposo"
              : eOggi
                ? `${stati.filter((x) => x === "al_lavoro" || x === "in_pausa").length} su ${g.righe.length} al lavoro`
                : `${stati.filter((x) => x === "al_lavoro" || x === "in_pausa" || x === "uscito" || x === "uscita_mancante").length} su ${g.righe.length} presenti`;
            const dove = cantiereDelGruppo(g.righe);
            return (
              <section key={g.id ?? "senza"} aria-label={g.nome} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <header
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-slate-50/70 px-4 py-2.5"
                  style={g.colore ? { borderTop: `3px solid ${g.colore}` } : undefined}
                >
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {g.id ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.colore ?? "#94A3B8" }} aria-hidden="true" /> : <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                    {g.nome}
                    <span className="font-normal text-muted-foreground tabular-nums">· {riepilogo}</span>
                  </h3>
                  {dove && <p className="max-w-full truncate text-xs text-slate-500"><HardHat className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{dove}</p>}
                </header>
                <ul className="grid sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-slate-100 sm:[&>li]:border-r">
                  {g.righe.map((r) => <SchedinaGiornata key={r.profilo_id} r={r} linkCommesse={linkCommesse} />)}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="xl:sticky xl:top-4">
          <DiarioGiorno giorno={giorno} giornata={data} cerca={cerca} linkCommesse={linkCommesse} />
        </div>
        </div>
      )}
    </div>
  );
}

const PLURALE: Record<string, string> = {
  al_lavoro: "al lavoro",
  in_pausa: "in pausa",
  uscito: "usciti",
  assente: "assenti",
  uscita_mancante: "senza uscita",
  non_timbrato: "senza timbrature",
  riposo: "a riposo",
};

/** La giornata in una riga: quanti in ogni stato, a colpo d'occhio. */
function BarraGiornata({ righe }: { righe: readonly OperaioOggi[] }) {
  const ordine = ["al_lavoro", "in_pausa", "uscito", "assente", "uscita_mancante", "non_timbrato", "riposo"] as const;
  const conteggi = ordine
    .map((s) => ({ s, n: righe.filter((r) => statoNoto(r.stato) === s).length }))
    .filter((x) => x.n > 0);
  return (
    <div className="hidden space-y-1.5 sm:block">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={conteggi.map((c) => `${c.n} ${PLURALE[c.s]}`).join(", ")}>
        {conteggi.map((c) => (
          <span key={c.s} className={cn("h-full", PALLINO_STATO[c.s])} style={{ width: `${(c.n / righe.length) * 100}%` }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {conteggi.map((c) => (
          <span key={c.s} className="inline-flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", PALLINO_STATO[c.s])} aria-hidden="true" />
            <span className="tabular-nums">{c.n}</span> {PLURALE[c.s]}
          </span>
        ))}
      </p>
    </div>
  );
}

function SchedinaGiornata({ r, linkCommesse }: { r: OperaioOggi; linkCommesse: boolean }) {
  const stato = statoNoto(r.stato);
  const idCantiere = r.cantiere_id ?? r.previsto_id;
  const testoCantiere = r.cantiere ?? r.previsto;
  const orari = r.prima_entrata
    ? `${formatOra(r.prima_entrata)} → ${r.ultima_uscita ? formatOra(r.ultima_uscita) : stato === "in_pausa" ? "in pausa" : "…"}`
    : null;
  return (
    <li className="flex min-w-0 gap-3 bg-white px-4 py-3">
      <Link to={`/azienda/manodopera/operai/${r.profilo_id}`} className="tap-compact shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Apri ${r.nome} ${r.cognome}`}>
        <AvatarOperaio nome={r.nome} cognome={r.cognome} colore={r.colore_avatar} pallino={PALLINO_STATO[stato]} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/azienda/manodopera/operai/${r.profilo_id}`} className="tap-compact min-w-0 truncate text-sm font-medium text-slate-900 hover:text-orange-700">
            {r.nome} {r.cognome}
          </Link>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONO_STATO[stato])}>
            {etichettaGiornata(r.stato, r.assenza)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {r.mansione ?? "Operaio"}
          {orari && <> · <span className="tabular-nums">{orari}</span></>}
          {(r.ore_lavorate ?? 0) > 0 && <> · <span className="tabular-nums">{formatOre(r.ore_lavorate)}</span></>}
        </p>
        {testoCantiere && (
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {!r.cantiere && <span className="text-muted-foreground">Previsto: </span>}
            {linkCommesse && idCantiere
              ? <Link to={`/azienda/ordini/${idCantiere}`} className="tap-compact hover:text-orange-700 hover:underline">{testoCantiere}</Link>
              : testoCantiere}
          </p>
        )}
        {r.mezzi && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-600">
            <Truck className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{r.mezzi}</span>
          </p>
        )}
        {r.rapportino && <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-500">«{r.rapportino}»</p>}
        {r.fuori_zona && <p className="mt-0.5 text-[11px] text-amber-700">Ha timbrato lontano dal cantiere</p>}
      </div>
    </li>
  );
}

// ── Vista «Squadre» ──────────────────────────────────────────────────────────

function SquadreOperai({ puoModificare, onNuova }: { puoModificare: boolean; onNuova: () => void }) {
  const perms = usePermissions();
  const { data: squadre = [], isLoading, error, refetch, isFetching } = useSquadre();
  const { data: operai = [] } = useOperai();
  const { data: giornata = [] } = useGiornataOperai(oggiRoma());
  const sciogli = useSciogliSquadra();
  const [modifica, setModifica] = useState<Squadra | null>(null);
  const [suCommessa, setSuCommessa] = useState<Squadra | null>(null);
  const [daSciogliere, setDaSciogliere] = useState<Squadra | null>(null);
  const [perNuova, setPerNuova] = useState<string[] | null>(null);

  const statoOggi = useMemo(() => new Map(giornata.map((r) => [r.profilo_id, statoNoto(r.stato)])), [giornata]);
  const senzaSquadra = useMemo(() => operai.filter((o) => o.attivo && !o.squadra_id), [operai]);
  const linkCommesse = perms.canViewOrders === true || perms.isAdmin;

  if (error) return <ErroreCaricamento testo="Non riesco a caricare le squadre." onRiprova={() => refetch()} inCorso={isFetching} />;
  if (isLoading) return <ScheletroLista />;

  return (
    <div className="space-y-4">
      {squadre.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white px-6 py-10 text-center">
          <UsersRound className="mx-auto h-8 w-8 text-orange-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-slate-900">Non ci sono ancora squadre</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Dai un nome alla squadra, scegli chi ci lavora e chi la guida. Poi la metti sulle commesse: i suoi operai si trovano il cantiere nell'app.
          </p>
          {puoModificare && (
            <Button onClick={onNuova} className="mt-4 gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600">
              <Plus className="h-4 w-4" aria-hidden="true" />Crea la prima squadra
            </Button>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {squadre.map((s) => (
            <article key={s.id} className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm" aria-label={s.nome}>
              <div className="h-1.5" style={{ backgroundColor: s.colore ?? "#94A3B8" }} aria-hidden="true" />
              <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-950">{s.nome}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.componenti.length === 1 ? "1 operaio" : `${s.componenti.length} operai`}
                    {s.responsabile ? (
                      <> · <Crown className="inline h-3 w-3 text-orange-600" aria-hidden="true" /> {s.responsabile.nome} {s.responsabile.cognome}
                        {!s.responsabile.e_componente && <span> ({s.responsabile.mansione ?? "fuori squadra"})</span>}
                      </>
                    ) : " · nessun responsabile"}
                  </p>
                </div>
                {puoModificare && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 max-sm:w-8 max-sm:px-0" aria-label={`Modifica ${s.nome}`} onClick={() => setModifica(s)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /><span className="max-sm:hidden">Modifica</span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Altre azioni per ${s.nome}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {linkCommesse && <DropdownMenuItem onSelect={() => setSuCommessa(s)}>Mettila su una commessa</DropdownMenuItem>}
                        <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => setDaSciogliere(s)}>Sciogli la squadra</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {s.componenti.length === 0 ? (
                <p className="px-4 pb-3 text-sm text-muted-foreground">Nessun operaio: premi «Modifica» e scegli chi ci lavora.</p>
              ) : (
                <ul className="divide-y border-y">
                  {s.componenti.map((p) => {
                    const st = statoOggi.get(p.id);
                    return (
                      <li key={p.id} className="flex items-center gap-2.5 px-4 py-2">
                        <AvatarOperaio nome={p.nome} cognome={p.cognome} colore={p.colore_avatar} pallino={st ? PALLINO_STATO[st] : undefined} />
                        <Link to={`/azienda/manodopera/operai/${p.id}`} className="tap-compact min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-orange-700">
                          {p.nome} {p.cognome}
                          {s.responsabile?.id === p.id && <Crown className="ml-1 inline h-3 w-3 text-orange-600" aria-label="responsabile" />}
                          {p.mansione && <span className="text-muted-foreground"> · {p.mansione}</span>}
                        </Link>
                        {st && <span className="shrink-0 text-[11px] text-muted-foreground">{etichettaGiornata(st)}</span>}
                        {p.ha_accesso_app && <Smartphone className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="ha l'app di cantiere" />}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-auto space-y-1.5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Commesse</p>
                {s.commesse.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Non è su nessuna commessa.
                    {puoModificare && linkCommesse && (
                      <> <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setSuCommessa(s)}>Mettila al lavoro</button></>
                    )}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {s.commesse.map((c) => {
                      const testo = [c.codice, c.cliente].filter(Boolean).join(" · ") || "Commessa";
                      const quando = c.dal && !c.oggi ? ` · dal ${formatDateIt(c.dal)}` : c.al ? ` · fino al ${formatDateIt(c.al)}` : "";
                      const cls = cn(
                        "inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs",
                        c.oggi ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600",
                      );
                      return (
                        <li key={c.order_id} className="max-w-full">
                          {linkCommesse
                            ? <Link to={`/azienda/ordini/${c.order_id}`} className={cn(cls, "tap-compact hover:border-orange-300")}>{testo}{quando}</Link>
                            : <span className={cls}>{testo}{quando}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {senzaSquadra.length > 0 && squadre.length > 0 && (
        <section className="rounded-2xl border border-dashed bg-white px-4 py-3" aria-label="Operai senza squadra">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Senza squadra <span className="font-normal text-muted-foreground">· {senzaSquadra.length}</span>
            </p>
            {puoModificare && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-orange-700" onClick={() => setPerNuova(senzaSquadra.map((o) => o.id))}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />Fanne una squadra
              </Button>
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {senzaSquadra.map((o) => (
              <li key={o.id}>
                <Link to={`/azienda/manodopera/operai/${o.id}`} className="tap-compact flex items-center gap-1.5 text-sm text-slate-700 hover:text-orange-700">
                  <AvatarOperaio nome={o.nome} cognome={o.cognome} colore={o.colore_avatar} />
                  {o.nome} {o.cognome}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modifica && <SquadraDialog aperto={!!modifica} onAperto={(v) => { if (!v) setModifica(null); }} squadra={modifica} />}
      {perNuova && <SquadraDialog aperto={!!perNuova} onAperto={(v) => { if (!v) setPerNuova(null); }} preselezionati={perNuova} />}
      {suCommessa && <SquadraCommessaDialog aperto={!!suCommessa} onAperto={(v) => { if (!v) setSuCommessa(null); }} squadraId={suCommessa.id} />}

      <AlertDialog open={!!daSciogliere} onOpenChange={(o) => { if (!o) setDaSciogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sciogli «{daSciogliere?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Gli operai restano, senza squadra. Dalle commesse spariscono gli accessi dati dalla squadra; le ore già timbrate restano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!daSciogliere) return;
                const nome = daSciogliere.nome;
                sciogli.mutate(daSciogliere.id, {
                  onSuccess: () => toast.success(`«${nome}» sciolta`),
                  onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a sciogliere la squadra. Riprova tra qualche secondo.")),
                });
                setDaSciogliere(null);
              }}
            >
              Sciogli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Vista «Elenco» ───────────────────────────────────────────────────────────

type FiltroElenco = "tutti" | "app" | "documenti" | "senza_squadra";

function ElencoOperai({ onNuovo }: { onNuovo?: () => void }) {
  const { data = [], isLoading, error, refetch, isFetching } = useOperai();
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [filtro, setFiltro] = useState<FiltroElenco>("tutti");

  const attivi = useMemo(() => data.filter((o) => o.attivo), [data]);
  const numeri = useMemo(() => ({
    attivi: attivi.length,
    conApp: attivi.filter((o) => o.ha_accesso_app).length,
    documenti: attivi.filter((o) => o.documenti_scaduti > 0 || o.documenti_in_scadenza > 0).length,
    senzaSquadra: attivi.filter((o) => !o.squadra_id).length,
  }), [attivi]);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return data.filter((o) => {
      if (soloAttivi !== o.attivo) return false;
      if (filtro === "app" && !o.ha_accesso_app) return false;
      if (filtro === "documenti" && !(o.documenti_scaduti > 0 || o.documenti_in_scadenza > 0)) return false;
      if (filtro === "senza_squadra" && o.squadra_id) return false;
      if (!q) return true;
      return [o.nome, o.cognome, o.mansione, o.telefono, o.mezzi, o.squadra].some((x) => x?.toLowerCase().includes(q));
    });
  }, [data, cerca, soloAttivi, filtro]);

  const nonAttivi = data.length - attivi.length;
  const alterna = (f: FiltroElenco) => setFiltro((x) => (x === f ? "tutti" : f));

  return (
    <div className="space-y-3 sm:space-y-4">
      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: "Operai", valore: String(numeri.attivi) },
          { label: "Documenti da rifare", valore: String(numeri.documenti), tono: numeri.documenti > 0 ? "text-red-600" : undefined, onClick: () => alterna("documenti"), attivo: filtro === "documenti" },
        ]}
      />
      <div className="hidden grid-cols-4 gap-3 sm:grid">
        <OperationalKpiCard icon={Users} label="Operai" value={numeri.attivi} hint="che lavorano in cantiere" tone="blue" isLoading={isLoading} active={filtro === "tutti" && soloAttivi} onClick={() => { setFiltro("tutti"); setSoloAttivi(true); }} />
        <OperationalKpiCard icon={Smartphone} label="Con l'app di cantiere" value={numeri.conApp} hint="timbrano dal telefono" tone="green" isLoading={isLoading} active={filtro === "app"} onClick={() => alterna("app")} />
        <OperationalKpiCard icon={FileWarning} label="Documenti da rifare" value={numeri.documenti} hint="scaduti o in scadenza" tone={numeri.documenti > 0 ? "red" : "green"} isLoading={isLoading} active={filtro === "documenti"} onClick={() => alterna("documenti")} />
        <OperationalKpiCard icon={UsersRound} label="Senza squadra" value={numeri.senzaSquadra} hint="da mettere in una squadra" tone={numeri.senzaSquadra > 0 ? "amber" : "green"} isLoading={isLoading} active={filtro === "senza_squadra"} onClick={() => alterna("senza_squadra")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="cerca-operai" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome, squadra, mezzo…" aria-label="Cerca operai" className="pl-9" />
        </div>
        {nonAttivi > 0 && (
          <Button variant="outline" size="sm" onClick={() => setSoloAttivi((x) => !x)} aria-pressed={!soloAttivi}>
            {soloAttivi ? `Non più attivi (${nonAttivi})` : "Torna agli attivi"}
          </Button>
        )}
      </div>

      {error ? (
        <ErroreCaricamento testo="Non riesco a caricare gli operai." onRiprova={() => refetch()} inCorso={isFetching} />
      ) : isLoading ? (
        <ScheletroLista />
      ) : data.length === 0 ? (
        <NessunOperaio onNuovo={onNuovo} />
      ) : righe.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          Nessun operaio con questi filtri.{" "}
          <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => { setCerca(""); setFiltro("tutti"); setSoloAttivi(true); }}>Togli i filtri</button>
        </p>
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-xl border bg-white sm:hidden">
            {righe.map((o) => (
              <RigaMobile
                key={o.id}
                to={`/azienda/manodopera/operai/${o.id}`}
                sinistra={<AvatarOperaio nome={o.nome} cognome={o.cognome} colore={o.colore_avatar} />}
                titolo={`${o.nome} ${o.cognome}`}
                sottotitolo={[o.squadra, o.mansione, o.mezzi].filter(Boolean).join(" · ") || undefined}
                stato={<DocumentiTesto o={o} />}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Operaio</th>
                  <th scope="col" className="px-4 py-2.5">Squadra</th>
                  <th scope="col" className="px-4 py-2.5">Telefono</th>
                  <th scope="col" className="px-4 py-2.5">Documenti</th>
                  <th scope="col" className="px-4 py-2.5">Mezzo in carico</th>
                  <th scope="col" className="px-4 py-2.5 text-center">Cantieri</th>
                  <th scope="col" className="px-4 py-2.5">App</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((o) => <RigaElenco key={o.id} o={o} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RigaElenco({ o }: { o: OperaioElenco }) {
  const navigate = useNavigate();
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/azienda/manodopera/operai/${o.id}`)}>
      <td className="px-4 py-2.5">
        <Link
          to={`/azienda/manodopera/operai/${o.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AvatarOperaio nome={o.nome} cognome={o.cognome} colore={o.colore_avatar} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{o.nome} {o.cognome}</span>
            {o.mansione && <span className="block truncate text-xs text-muted-foreground">{o.mansione}</span>}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5">
        {o.squadra ? (
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: o.squadra_colore ?? "#94A3B8" }} aria-hidden="true" />{o.squadra}
          </span>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5 tabular-nums text-slate-700">
        {o.telefono ? <a href={`tel:${o.telefono}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange-700 hover:underline">{o.telefono}</a> : "—"}
      </td>
      <td className="px-4 py-2.5"><DocumentiTesto o={o} /></td>
      <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-700">{o.mezzi ?? "—"}</td>
      <td className="px-4 py-2.5 text-center tabular-nums">{o.cantieri_attivi || "—"}</td>
      <td className="px-4 py-2.5">
        {o.ha_accesso_app
          ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Sì</Badge>
          : <span className="text-muted-foreground">No</span>}
      </td>
    </tr>
  );
}

function DocumentiTesto({ o }: { o: OperaioElenco }) {
  if (o.documenti_scaduti > 0) {
    return <span className="font-medium text-red-600">{o.documenti_scaduti === 1 ? "1 scaduto" : `${o.documenti_scaduti} scaduti`}</span>;
  }
  if (o.documenti_in_scadenza > 0 && o.prossima_scadenza) {
    return <span className="text-amber-700">Scade il {formatDateIt(o.prossima_scadenza)}</span>;
  }
  if (o.prossima_scadenza) return <span className="text-emerald-700">In regola</span>;
  return <span className="text-muted-foreground">Nessuno</span>;
}

// ── Stati comuni ─────────────────────────────────────────────────────────────

function NessunOperaio({ onNuovo }: { onNuovo?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-6 py-10 text-center">
      <HardHat className="mx-auto h-8 w-8 text-orange-500" aria-hidden="true" />
      <p className="mt-3 font-semibold text-slate-900">Non ci sono ancora operai</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Aggiungi chi lavora nei tuoi cantieri. Se è già nel Personale, apri la sua scheda e accendi «Lavora in cantiere».
      </p>
      {onNuovo && (
        <Button onClick={onNuovo} className="mt-4 gap-1.5 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600">
          <Plus className="h-4 w-4" aria-hidden="true" />Aggiungi il primo operaio
        </Button>
      )}
    </div>
  );
}

function ErroreCaricamento({ testo, onRiprova, inCorso }: { testo: string; onRiprova: () => void; inCorso: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-8 text-center">
      <Clock className="h-6 w-6 text-amber-600" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-900">{testo}</p>
      <Button variant="outline" size="sm" onClick={onRiprova} disabled={inCorso} className="gap-1.5">
        <RefreshCw className={cn("h-4 w-4", inCorso && "animate-spin")} aria-hidden="true" />Riprova
      </Button>
    </div>
  );
}

function ScheletroLista() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  );
}
