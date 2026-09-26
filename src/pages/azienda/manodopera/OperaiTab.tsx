/**
 * Manodopera e Mezzi → Operai (26/09/2026).
 *
 * Due viste: «Oggi» (chi è al lavoro, in pausa, uscito, assente, chi non ha
 * timbrato, e in quale cantiere) ed «Elenco» (gli operai con costo orario,
 * documenti, mezzo in carico, cantieri in corso). Gli operai sono le persone
 * del Personale con «Lavora in cantiere» acceso.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, Clock, FileWarning, HardHat, LogOut, Plus,
  RefreshCw, Search, Smartphone, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { KpiMobili, RigaMobile } from "@/components/mobile/FiltriMobile";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { OperaioDialog } from "@/components/manodopera/OperaioDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { oggiRoma, useGiornataOperai, useOperai, type OperaioElenco, type OperaioOggi } from "@/hooks/useOperai";
import {
  TONO_STATO, contaGiornata, etichettaGiornata, formatOra, formatOre, giornoInParole, passaFiltroGiornata,
  spostaGiorno, statoNoto, type FiltroGiornata,
} from "@/lib/manodopera/giornata";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const PALLINO_STATO: Record<string, string> = {
  al_lavoro: "bg-emerald-500",
  in_pausa: "bg-amber-400",
  uscito: "bg-slate-400",
  uscita_mancante: "bg-orange-500",
  assente: "bg-sky-400",
  non_timbrato: "bg-slate-200",
};

type Vista = "oggi" | "elenco";

export default function OperaiTab() {
  const perms = usePermissions();
  const puoModificare = (perms.canEditOperai || perms.isAdmin) && !perms.solaLettura;
  const [searchParams, setSearchParams] = useSearchParams();
  const vista: Vista = searchParams.get("vista") === "elenco" ? "elenco" : "oggi";
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const navigate = useNavigate();

  const cambiaVista = (v: Vista) => {
    const next = new URLSearchParams(searchParams);
    if (v === "oggi") next.delete("vista");
    else next.set("vista", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {(["oggi", "elenco"] as const).map((v) => (
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
              {v === "oggi" ? "Giornata" : "Elenco"}
            </button>
          ))}
        </div>
        {puoModificare && (
          <Button
            size="sm"
            onClick={() => setNuovoAperto(true)}
            className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nuovo operaio</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        )}
      </div>

      {vista === "oggi"
        ? <GiornataOperai onNuovo={puoModificare ? () => setNuovoAperto(true) : undefined} />
        : <ElencoOperai onNuovo={puoModificare ? () => setNuovoAperto(true) : undefined} />}

      <OperaioDialog
        aperto={nuovoAperto}
        onAperto={setNuovoAperto}
        mostraStipendio={puoModificare}
        onSalvato={(id) => navigate(`/azienda/manodopera/operai/${id}`)}
      />
    </div>
  );
}

// ── Vista «Giornata» ─────────────────────────────────────────────────────────

function GiornataOperai({ onNuovo }: { onNuovo?: () => void }) {
  const oggi = oggiRoma();
  const [giorno, setGiorno] = useState(oggi);
  const [filtro, setFiltro] = useState<FiltroGiornata>("tutti");
  const perms = usePermissions();
  const { data = [], isLoading, error, refetch, isFetching } = useGiornataOperai(giorno);

  const conta = useMemo(() => contaGiornata(data), [data]);
  const righe = useMemo(() => data.filter((r) => passaFiltroGiornata(r.stato, filtro)), [data, filtro]);
  const eOggi = giorno === oggi;
  const alterna = (f: FiltroGiornata) => setFiltro((x) => (x === f ? "tutti" : f));

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Giorno prima" onClick={() => setGiorno((g) => spostaGiorno(g, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10.5rem] px-1 text-center text-sm font-semibold text-slate-900" aria-live="polite">
            {giornoInParole(giorno, oggi)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Giorno dopo"
            disabled={eOggi}
            onClick={() => setGiorno((g) => spostaGiorno(g, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!eOggi && (
          <Button variant="outline" size="sm" onClick={() => setGiorno(oggi)}>Torna a oggi</Button>
        )}
        {eOggi && (
          <span className="text-xs text-muted-foreground">Si aggiorna da solo ogni minuto</span>
        )}
      </div>

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
        <OperationalKpiCard icon={CalendarOff} label="Assenti" value={conta.assenti} hint="ferie, permessi, malattia" tone="blue" isLoading={isLoading} active={filtro === "assenti"} onClick={() => alterna("assenti")} />
      </div>

      {error ? (
        <ErroreCaricamento testo="Non riesco a caricare la giornata degli operai." onRiprova={() => refetch()} inCorso={isFetching} />
      ) : isLoading ? (
        <ScheletroLista />
      ) : data.length === 0 ? (
        <NessunOperaio onNuovo={onNuovo} />
      ) : righe.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          Nessun operaio in questo gruppo. <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setFiltro("tutti")}>Mostra tutti</button>
        </p>
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-xl border bg-white sm:hidden">
            {righe.map((r) => (
              <RigaMobile
                key={r.profilo_id}
                to={`/azienda/manodopera/operai/${r.profilo_id}`}
                sinistra={<AvatarOperaio nome={r.nome} cognome={r.cognome} colore={r.colore_avatar} pallino={PALLINO_STATO[statoNoto(r.stato)]} />}
                titolo={`${r.nome} ${r.cognome}`}
                sottotitolo={cantiereDellaRiga(r) ?? r.mansione ?? undefined}
                valore={r.prima_entrata ? `${formatOra(r.prima_entrata)}${r.ultima_uscita ? `–${formatOra(r.ultima_uscita)}` : ""}` : undefined}
                stato={<span className="text-muted-foreground">{etichettaGiornata(r.stato, r.assenza)}</span>}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Operaio</th>
                  <th scope="col" className="px-4 py-2.5">Stato</th>
                  <th scope="col" className="px-4 py-2.5">Entrata</th>
                  <th scope="col" className="px-4 py-2.5">Uscita</th>
                  <th scope="col" className="px-4 py-2.5">Ore</th>
                  <th scope="col" className="px-4 py-2.5">Cantiere</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((r) => (
                  <RigaGiornata key={r.profilo_id} r={r} linkCommesse={perms.canViewOrders === true || perms.isAdmin} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function cantiereDellaRiga(r: OperaioOggi): string | null {
  if (r.cantiere) return r.cantiere;
  if (r.previsto) return `Previsto: ${r.previsto}`;
  return null;
}

function RigaGiornata({ r, linkCommesse }: { r: OperaioOggi; linkCommesse: boolean }) {
  const navigate = useNavigate();
  const stato = statoNoto(r.stato);
  const idCantiere = r.cantiere_id ?? r.previsto_id;
  const testoCantiere = r.cantiere ?? r.previsto;
  return (
    <tr
      className="cursor-pointer hover:bg-slate-50"
      onClick={() => navigate(`/azienda/manodopera/operai/${r.profilo_id}`)}
    >
      <td className="px-4 py-2.5">
        <Link
          to={`/azienda/manodopera/operai/${r.profilo_id}`}
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          onClick={(e) => e.stopPropagation()}
        >
          <AvatarOperaio nome={r.nome} cognome={r.cognome} colore={r.colore_avatar} pallino={PALLINO_STATO[stato]} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{r.nome} {r.cognome}</span>
            {r.mansione && <span className="block truncate text-xs text-muted-foreground">{r.mansione}</span>}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONO_STATO[stato])}>
          {etichettaGiornata(r.stato, r.assenza)}
        </span>
        {r.fuori_zona && (
          <span className="mt-1 block text-[11px] text-amber-700">Ha timbrato lontano dal cantiere</span>
        )}
      </td>
      <td className="px-4 py-2.5 tabular-nums">{formatOra(r.prima_entrata)}</td>
      <td className="px-4 py-2.5 tabular-nums">
        {formatOra(r.ultima_uscita)}
        {stato === "in_pausa" && r.ultima_ora && <span className="block text-[11px] text-muted-foreground">in pausa dalle {formatOra(r.ultima_ora)}</span>}
      </td>
      <td className="px-4 py-2.5 tabular-nums">{formatOre(r.ore_lavorate)}</td>
      <td className="max-w-[18rem] px-4 py-2.5">
        {testoCantiere ? (
          <span className="block min-w-0">
            {!r.cantiere && <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Previsto </span>}
            {linkCommesse && idCantiere ? (
              <Link
                to={`/azienda/ordini/${idCantiere}`}
                onClick={(e) => e.stopPropagation()}
                className="line-clamp-2 text-slate-700 hover:text-orange-700 hover:underline"
              >
                {testoCantiere}
              </Link>
            ) : (
              <span className="line-clamp-2 text-slate-700">{testoCantiere}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Vista «Elenco» ───────────────────────────────────────────────────────────

type FiltroElenco = "tutti" | "app" | "documenti" | "senza_costo";

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
    senzaCosto: attivi.filter((o) => !o.costo_orario).length,
  }), [attivi]);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return data.filter((o) => {
      if (soloAttivi && !o.attivo) return false;
      if (!soloAttivi && o.attivo) return false;
      if (filtro === "app" && !o.ha_accesso_app) return false;
      if (filtro === "documenti" && !(o.documenti_scaduti > 0 || o.documenti_in_scadenza > 0)) return false;
      if (filtro === "senza_costo" && o.costo_orario) return false;
      if (!q) return true;
      return [o.nome, o.cognome, o.mansione, o.telefono, o.mezzi].some((x) => x?.toLowerCase().includes(q));
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
        <OperationalKpiCard icon={Wallet} label="Senza costo orario" value={numeri.senzaCosto} hint="le commesse non ne vedono il costo" tone={numeri.senzaCosto > 0 ? "amber" : "green"} isLoading={isLoading} active={filtro === "senza_costo"} onClick={() => alterna("senza_costo")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="cerca-operai"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca per nome, mansione, mezzo…"
            aria-label="Cerca operai"
            className="pl-9"
          />
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
          <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => { setCerca(""); setFiltro("tutti"); setSoloAttivi(true); }}>
            Togli i filtri
          </button>
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
                sottotitolo={[o.mansione, o.mezzi].filter(Boolean).join(" · ") || undefined}
                valore={o.costo_orario ? `${formatCurrency(o.costo_orario)}/h` : undefined}
                stato={<DocumentiTesto o={o} />}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Operaio</th>
                  <th scope="col" className="px-4 py-2.5">Telefono</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Costo orario</th>
                  <th scope="col" className="px-4 py-2.5">Documenti</th>
                  <th scope="col" className="px-4 py-2.5">Mezzo in carico</th>
                  <th scope="col" className="px-4 py-2.5 text-center">Cantieri in corso</th>
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
      <td className="px-4 py-2.5 tabular-nums text-slate-700">
        {o.telefono ? (
          <a href={`tel:${o.telefono}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange-700 hover:underline">{o.telefono}</a>
        ) : "—"}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {o.costo_orario ? formatCurrency(o.costo_orario) : <span className="text-amber-700">da scrivere</span>}
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
        <Button onClick={onNuovo} className="mt-4 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600">
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
