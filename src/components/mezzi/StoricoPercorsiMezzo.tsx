import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { supabase } from "@/integrations/supabase/client";
import type { PuntoStoricoMezzo, StoricoPercorsiMezzo as DatiStorico } from "@/integrations/supabase/appDatabase";
import { formatData, oggiIso } from "@/types/mezzi";
import { coordinate, dataAdiacente, partiNelFuso, type Coordinate, type Tappa } from "../../../shared/mappa-operativa/calcoli";
import { calcolaPercorso, fonteCartografica, servizioMappa } from "@/components/calendar/mappa/servizio";
import type { Pin } from "@/components/calendar/mappa/CartografiaOperativa";
import type { LineaPercorso } from "@/components/calendar/mappa/tratte";
import { cn } from "@/lib/utils";
import { PercorrenzeMezzi } from "./PercorrenzeMezzi";

const CartografiaOperativa = lazy(() => import("@/components/calendar/mappa/CartografiaOperativa"));
const pagina = 20;
const distanza = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const km = (n: number | null) => n == null ? "—" : `${distanza.format(n)} km`;
const fonti = { contatore: "Contachilometri", dichiarati: "Km dichiarati", stimati: "Stima nel registro" };
const orario = (iso: string) => {
  const { giorno, ora } = partiNelFuso(iso);
  return `${formatData(giorno)} · ${ora}`;
};
const punto = (p: PuntoStoricoMezzo | null) => coordinate(p?.lat, p?.lng);
const stessaPosizione = (a: Coordinate | null, b: Coordinate | null) => Boolean(a && b && a.lat === b.lat && a.lng === b.lng);

type Periodo = { dal: string; al: string };
function intervallo(oggi: string, giorni: number): Periodo {
  return { dal: dataAdiacente(oggi, 1 - giorni), al: oggi };
}

export default function StoricoPercorsiMezzo({ company, mezzo, giorno, routing, costi }: {
  company: string; mezzo: string; giorno?: string; routing: boolean; costi?: boolean;
}) {
  const actor = useAuth().user?.id;
  const oggi = oggiIso();
  const [periodo, setPeriodo] = useState(() => giorno && /^\d{4}-\d{2}-\d{2}$/.test(giorno) && Number.isFinite(Date.parse(giorno))
    ? { dal: giorno, al: giorno } : intervallo(oggi, 30));
  const [bozza, setBozza] = useState(periodo);
  const [offset, setOffset] = useState(0);
  const giorni = (Date.parse(bozza.al) - Date.parse(bozza.dal)) / 86_400_000;
  const valido = giorni >= 0 && giorni <= 365;
  const applica = (p: Periodo) => { setBozza(p); setPeriodo(p); setOffset(0); };
  const storico = useQuery({
    queryKey: [...viaggiKey(company), actor, "percorsi-mezzo", mezzo, periodo.dal, periodo.al, offset],
    enabled: Boolean(actor && company && mezzo),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mezzi_storico_percorsi", {
        p_company: company, p_mezzo: mezzo, p_dal: periodo.dal, p_al: periodo.al, p_offset: offset,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
    retry: false, staleTime: 30_000,
  });
  const totale = storico.data?.totali;
  return <section aria-labelledby="titolo-storico-percorsi" className="min-w-0 space-y-3">
    <div className="space-y-2.5 rounded-xl border bg-card p-2.5 sm:p-3">
      <div className="flex flex-col items-start gap-2.5 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="titolo-storico-percorsi" className="font-semibold">Storico percorsi</h2>
          <div role="group" aria-label="Periodi rapidi" className="flex flex-wrap gap-1.5">
            {[7, 30].map(n => {
              const rapido = intervallo(oggi, n);
              const attivo = periodo.dal === rapido.dal && periodo.al === rapido.al;
              return <Button key={n} size="sm" variant={attivo ? "secondary" : "outline"} aria-pressed={attivo}
                onClick={() => applica(rapido)}>Ultimi {n} giorni</Button>;
            })}
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (valido) applica(bozza); }} className="grid w-full grid-cols-2 items-end gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
          <label className="min-w-0 space-y-1 text-xs text-muted-foreground sm:w-36">Dal
            <Input type="date" className="h-9 min-w-0" value={bozza.dal} onChange={e => setBozza({ ...bozza, dal: e.target.value })} required />
          </label>
          <label className="min-w-0 space-y-1 text-xs text-muted-foreground sm:w-36">Al
            <Input type="date" className="h-9 min-w-0" value={bozza.al} onChange={e => setBozza({ ...bozza, al: e.target.value })} required />
          </label>
          <Button type="submit" variant="outline" size="sm" className="col-span-2 h-9" disabled={!valido}><CalendarDays className="size-4" /> Applica periodo</Button>
        </form>
      </div>
      {!valido && <p role="alert" className="text-sm text-amber-800">Indica un periodo valido, fino a 366 giorni.</p>}
    </div>
    {storico.isPending && <p role="status" className="rounded-lg border p-4 text-sm">Caricamento viaggi del periodo…</p>}
    {storico.isError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
      Impossibile caricare lo storico percorsi. <Button size="sm" variant="outline" onClick={() => void storico.refetch()}>Riprova</Button>
    </div>}
    {totale && <div className="space-y-2" aria-label="Riepilogo chilometri del periodo">
      <p className="text-xs text-muted-foreground">Viaggi per data di partenza · {formatData(periodo.dal)} – {formatData(periodo.al)}</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Km registrati", km(totale.registrati)], ["Km stimati", km(totale.stimati)], ["Viaggi", totale.viaggi], ["Viaggi senza totale", totale.senza_km]].map(([label, valore]) =>
          <div key={label} className="rounded-lg border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{valore}</dd>
          </div>)}
      </dl>
    </div>}
    {costi && <PercorrenzeMezzi mezzo={mezzo} dal={periodo.dal} al={periodo.al} costi distanza={false} />}
    {storico.data && <PercorsiDelPeriodo key={`${mezzo}:${periodo.dal}:${periodo.al}:${offset}`}
      dati={storico.data} company={company} actor={actor} routing={routing} />}
    {totale && (offset > 0 || totale.viaggi > pagina) && <div className="flex items-center justify-between gap-2 text-sm">
      <Button size="sm" variant="outline" disabled={!offset} onClick={() => setOffset(n => n - pagina)}><ChevronLeft className="size-4" /> Precedenti</Button>
      <span className="text-center text-xs text-muted-foreground">Pagina {1 + offset / pagina} di {Math.ceil(totale.viaggi / pagina)}</span>
      <Button size="sm" variant="outline" disabled={offset + pagina >= totale.viaggi} onClick={() => setOffset(n => n + pagina)}>Successivi <ChevronRight className="size-4" /></Button>
    </div>}
  </section>;
}

function PercorsiDelPeriodo({ dati, company, actor, routing }: { dati: DatiStorico; company: string; actor?: string; routing: boolean }) {
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const [richiesto, setRichiesto] = useState<string | null>(null);
  const carta = useRef<HTMLElement>(null);
  const viaggio = dati.items.find(v => v.id === selezionato);
  const piano = useMemo(() => {
    const tappe: Tappa[] = [];
    const collegamenti = new Map<number, number>();
    for (const [i, tratta] of (viaggio?.tratte ?? []).entries()) {
      const da = punto(tratta.partenza), a = punto(tratta.arrivo);
      if (!da || !a || stessaPosizione(da, a)) continue;
      if (!stessaPosizione(tappe.at(-1)?.punto ?? null, da)) {
        if (tappe.length) tappe.push({ id: `stacco-${i}`, titolo: "", punto: null, inizio: null, fine: null });
        tappe.push({ id: `da-${i}`, titolo: tratta.da, punto: da, inizio: null, fine: null });
      }
      collegamenti.set(i, tappe.length - 1);
      tappe.push({ id: `a-${i}`, titolo: tratta.a, punto: a, inizio: null, fine: null });
    }
    return { tappe, collegamenti };
  }, [viaggio]);
  const percorso = useQuery({
    queryKey: ["storico-percorso-stradale", company, actor, viaggio?.id, piano.tappe],
    enabled: routing && Boolean(viaggio && richiesto === viaggio.id && piano.tappe.length),
    queryFn: ({ signal }) => calcolaPercorso(company, "lavori", piano.tappe, "auto", { signal }),
    staleTime: 5 * 60_000, retry: false,
  });
  const mappa = useMemo(() => {
    const pin: Pin[] = [];
    const linee: LineaPercorso[] = [];
    const riferimenti: string[] = [];
    const coordinateViste = new Set<string>();
    const viaggiPerPin = new Map<string, string>();
    for (const v of viaggio ? [viaggio] : dati.items) {
      for (const [i, t] of v.tratte.entries()) {
        const da = punto(t.partenza), a = punto(t.arrivo);
        for (const [nome, p] of [[t.da, da], [t.a, a]] as const) {
          if (!p) continue;
          const chiave = `${p.lat}:${p.lng}:${nome}`;
          if (coordinateViste.has(chiave)) continue;
          coordinateViste.add(chiave);
          const id = `pin-${pin.length}`;
          viaggiPerPin.set(id, v.id);
          pin.push({ id, titolo: nome, punto: p });
        }
        if (!da || !a || stessaPosizione(da, a)) continue;
        const geometria = percorso.data?.geometrieTratte[piano.collegamenti.get(i) ?? -1];
        const stradale = Boolean(geometria && geometria.length >= 2);
        linee.push({ indice: riferimenti.length, titolo: `${orario(v.partenza)} · ${t.da} → ${t.a}`,
          punti: stradale ? geometria! : [da, a], colore: v.fonte === "stimati" ? "#a1560d" : v.fonte ? "#1d4ed8" : "#475569", indicativa: !stradale });
        riferimenti.push(v.id);
      }
    }
    return { pin, linee, riferimenti, viaggiPerPin };
  }, [dati.items, viaggio, piano.collegamenti, percorso.data]);
  const cartografia = useQuery({
    queryKey: ["cartografia-storico-mezzo", company, actor],
    enabled: routing && mappa.pin.length > 0,
    queryFn: ({ signal }) => servizioMappa<{ ok: true }>(company, "lavori", {
      azione: "vista", cartografia: fonteCartografica,
    }, signal),
    staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false,
  });

  if (!dati.totali.viaggi) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nessun viaggio inviato o verificato nel periodo.</p>;
  const apriViaggio = (id?: string) => {
    if (!id || id === selezionato) return;
    setSelezionato(id);
    setRichiesto(null);
  };
  return <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
    <section ref={carta} aria-label="Carta delle tratte" className="min-w-0 scroll-mt-24 space-y-2 rounded-xl border bg-card p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="size-4 text-primary" /> {viaggio ? "Tratte del viaggio" : "Tratte della pagina"}</h3>
        {viaggio && <Button size="sm" variant="outline" onClick={() => { setSelezionato(null); setRichiesto(null); }}>Tutti i viaggi</Button>}
      </div>
      {mappa.pin.length > 0 ? <Suspense fallback={<p role="status" className="grid min-h-64 place-items-center text-sm">Caricamento mappa…</p>}>
        <CartografiaOperativa pin={mappa.pin} percorso={mappa.linee} selezionato={null}
          tileConsentito={routing && cartografia.isSuccess}
          erroreTiles={!routing ? "Sfondo stradale disponibile con accesso al Calendario lavori." : cartografia.error?.message}
          onSeleziona={id => apriViaggio(mappa.viaggiPerPin.get(id))} contesto={viaggio?.id ?? "storico-mezzi"}
          onTratta={indice => apriViaggio(mappa.riferimenti[indice])} />
      </Suspense> : <p className="rounded-lg bg-muted/55 p-4 text-sm text-muted-foreground">Coordinate assenti per le tappe mostrate. Le tratte e i chilometri restano nell’elenco.</p>}
      {mappa.linee.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span><span className="mr-1 text-blue-700" aria-hidden="true">●</span>Km registrati</span>
        <span><span className="mr-1 text-amber-700" aria-hidden="true">●</span>Km stimati</span>
        <span><span className="mr-1 text-slate-600" aria-hidden="true">●</span>Km da completare</span>
        {mappa.linee.some(l => l.indicativa) && <span>Tratteggio = collegamento indicativo</span>}
      </div>}
      {viaggio && routing && piano.tappe.length > 0 && <Button size="sm" variant="outline" disabled={percorso.isFetching}
        onClick={() => richiesto === viaggio.id ? void percorso.refetch() : setRichiesto(viaggio.id)}>
        <Route className="size-4" /> {percorso.isFetching ? "Calcolo del percorso…" : percorso.data ? "Ricalcola su strada" : "Mostra su strada"}
      </Button>}
      {(percorso.isError || (percorso.data && mappa.linee.some(l => l.indicativa))) && <p role="status" className="text-xs text-amber-800">
        Alcune geometrie stradali non sono disponibili. Le tratte interessate restano tratteggiate.
      </p>}
      {percorso.data && mappa.linee.some(l => !l.indicativa) &&
        <p className="text-xs text-muted-foreground">Percorso stradale ricostruito dalle tappe. I km sono quelli del registro.</p>}
    </section>
    <section aria-label="Viaggi del periodo" className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <h3 className="border-b bg-muted/35 px-3 py-2 text-sm font-semibold">Viaggi del periodo</h3>
      <ul className="max-h-[40rem] divide-y overflow-auto">
        {dati.items.map(v => {
          const aperto = v.id === selezionato;
          return <li key={v.id}>
            <button type="button" aria-expanded={aperto} className={cn("grid w-full min-w-0 gap-1 p-3 text-left hover:bg-muted/60", aperto && "bg-primary/5")}
              onClick={() => { setSelezionato(aperto ? null : v.id); setRichiesto(null); }}>
              <span className="flex flex-wrap justify-between gap-1 text-sm font-semibold">
                <span>{orario(v.partenza)}</span><span>{km(v.km)}</span>
              </span>
              <span className="break-words text-xs text-muted-foreground">{v.tratte[0]?.da} → {v.tratte.at(-1)?.a}</span>
              <span className="text-xs text-muted-foreground">{v.fonte ? fonti[v.fonte] : "Km da completare"} · {v.stato === "verificato" ? "Verificato" : "Inviato"}</span>
            </button>
            {aperto && <div className="space-y-2 px-3 pb-3">
              {mappa.pin.length > 0 && <Button type="button" size="sm" variant="outline" className="xl:hidden"
                onClick={() => carta.current?.scrollIntoView({ block: "start" })}><MapPin className="size-4" /> Vai alla mappa</Button>}
              <ol className="space-y-2 text-sm">
                {v.tratte.map((t, i) => <li key={i} className="rounded-md border p-2 break-words">
                  {t.da} → {t.a}
                  <span className="block text-xs text-muted-foreground">{punto(t.partenza) && punto(t.arrivo)
                    ? [...new Set([t.partenza?.fonte, t.arrivo?.fonte])].join(" · ")
                    : "Posizione non disponibile per una o entrambe le tappe"}</span>
                </li>)}
              </ol>
            </div>}
          </li>;
        })}
      </ul>
    </section>
  </div>;
}
