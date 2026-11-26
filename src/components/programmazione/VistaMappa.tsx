/**
 * La giornata sulla mappa (Programmazione, 26/11/2026): chi va dove, a che
 * ora, con quali viaggi.
 *  - Tutti i giri insieme, un colore per persona, dalla sede operativa e
 *    ritorno; la legenda accende e spegne le persone.
 *  - Per ogni tappa: km e minuti stimati (linea d'aria × 1,3, 45 km/h), l'ora
 *    in cui partire, l'avviso se fra due tappe non c'è il tempo di arrivare.
 *  - Un clic su un punto: cosa c'è da fare lì.
 *  - Oggi: dove sono davvero (timbrature con GPS).
 * Il tempo di strada vero richiede il servizio di percorso (OSRM), che non è
 * ancora configurato: qui sono stime, dette come tali.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStradeGiri } from "@/hooks/useStradeGiri";
import { AlertTriangle, Car, Clock, ExternalLink, Flag, MapPin, Maximize2, Minimize2, Navigation, Package, Pause, Play, Route, Truck, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { oggiRoma } from "@/hooks/useOperai";
import { fonteCartografica, servizioMappa } from "@/components/calendar/mappa/servizio";
import type { LineaPercorso } from "@/components/calendar/mappa/tratte";
import type { Pin } from "@/components/calendar/mappa/CartografiaOperativa";
import { coloreIntervento } from "@/components/programmazione/aspetto";
import {
  agendaPersone, doveAlle, giro, KM_TRASFERTA, linkNavigatore, metriTra, ordina, puntiDelGiro, viaggiDelGiro, type Giornata, type Intervento, type MerceGiorno, type MezzoGiorno, type PersonaGiorno, type Punto,
} from "@/lib/programmazione/giornata";

const CartografiaOperativa = lazy(() => import("@/components/calendar/mappa/CartografiaOperativa"));

/** Un colore per persona, ben distinti su una mappa chiara. */
const COLORI_PERSONA = ["#2563EB", "#DC2626", "#16A34A", "#9333EA", "#EA580C", "#0891B2", "#DB2777", "#65A30D", "#7C3AED", "#CA8A04"];

const durata = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`);

type PosizioneGps = { persona_id: string; nome: string | null; tipo: string; ora: string; lat: number; lng: number };

export default function VistaMappa({ companyId, giornata, persone, personaDi, mezzoDi, utenteAPersona, merce, puntoDi, onApri }: {
  companyId: string | null;
  giornata: Giornata;
  persone: PersonaGiorno[];
  personaDi: Map<string, PersonaGiorno>;
  mezzoDi: Map<string, MezzoGiorno>;
  /** account → hr_profili.id (dal database), per riconoscere le timbrature. */
  utenteAPersona: Map<string, string>;
  merce: MerceGiorno[];
  puntoDi: (i: Intervento) => Punto | null;
  onApri: (interventoId: string) => void;
}) {
  const [tileOk, setTileOk] = useState<string | null>(null);
  const [erroreTiles, setErroreTiles] = useState("");
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const [spente, setSpente] = useState<Set<string>>(new Set());
  const [persona, setPersona] = useState<string | null>(null);
  // Cosa inquadrare: i cantieri del giorno (normale) o tutto, sede e timbrature comprese.
  const [inquadra, setInquadra] = useState<"cantieri" | "tutto">("cantieri");
  // Una tappa scelta dall'itinerario: la mappa ci va sopra.
  const [fuocoTappa, setFuocoTappa] = useState<string | null>(null);
  const [schermoIntero, setSchermoIntero] = useState(false);
  // Il cursore dell'ora: null = spento; altrimenti minuti del giorno.
  const [ora, setOra] = useState<number | null>(null);
  const [inRiproduzione, setInRiproduzione] = useState(false);
  useEffect(() => {
    if (!inRiproduzione) return;
    const t = setInterval(() => setOra((m) => {
      const prossimo = (m ?? 6 * 60) + 5;
      if (prossimo > 20 * 60) { setInRiproduzione(false); return 20 * 60; }
      return prossimo;
    }), 120);
    return () => clearInterval(t);
  }, [inRiproduzione]);
  useEffect(() => {
    if (!schermoIntero) return;
    const esci = (e: KeyboardEvent) => { if (e.key === "Escape") setSchermoIntero(false); };
    window.addEventListener("keydown", esci);
    return () => window.removeEventListener("keydown", esci);
  }, [schermoIntero]);
  const sede = useCompanyBase();
  const oggi = giornata.giorno === oggiRoma();

  // Come la mappa del calendario: la prima apertura registra la vista e sblocca lo sfondo.
  useEffect(() => {
    if (!companyId) return;
    let vivo = true;
    servizioMappa(companyId, "lavori", { azione: "vista", tile: fonteCartografica !== "leaflet", cartografia: fonteCartografica })
      .then(() => { if (vivo) setTileOk(companyId); })
      .catch((e) => { if (vivo && fonteCartografica !== "leaflet") setErroreTiles((e as Error).message); });
    return () => { vivo = false; };
  }, [companyId]);

  // Oggi: dove hanno timbrato davvero (stessa funzione della mappa del calendario).
  const gps = useQuery({
    queryKey: ["programmazione", "gps", companyId, giornata.giorno],
    enabled: !!companyId && oggi,
    refetchInterval: 120_000,
    queryFn: async (): Promise<PosizioneGps[]> => {
      const { data, error } = await supabase.rpc("mappa_timbrature_gps", { p_company: companyId!, p_giorno: giornata.giorno, p_personale: false });
      if (error) return [];
      return (data ?? []) as PosizioneGps[];
    },
  });
  // L'ultima posizione di ciascuno.
  const ultime = useMemo(() => {
    const out = new Map<string, PosizioneGps>();
    for (const e of gps.data ?? []) {
      const chi = utenteAPersona.get(e.persona_id) ?? e.persona_id;
      const prima = out.get(chi);
      if (!prima || prima.ora < e.ora) out.set(chi, e);
    }
    return out;
  }, [gps.data, utenteAPersona]);

  const interventi = useMemo(() => ordina(giornata.interventi).map((i) => ({ ...i, punto: puntoDi(i) })), [giornata, puntoDi]);
  const conPunto = interventi.filter((i) => i.punto);
  const senzaPunto = interventi.filter((i) => !i.punto);
  const numero = new Map(conPunto.map((i, k) => [i.id, k + 1]));
  const agenda = useMemo(() => agendaPersone({ ...giornata, interventi }), [giornata, interventi]);

  // I giri del giorno: chi fa le stesse tappe nello stesso ordine viaggia insieme
  // (la squadra sul furgone), quindi un giro solo con tutti i nomi, un colore e
  // una richiesta di percorso. p = il primo della squadra (il capo, se c'è).
  const basi = useMemo(() => {
    const gruppi = new Map<string, { chi: PersonaGiorno[]; tappe: Intervento[] }>();
    for (const p of persone) {
      const tappe = giro(agenda.get(p.id) ?? []);
      if (!tappe.length) continue;
      const chiave = tappe.map((t) => t.id).join("|");
      const g = gruppi.get(chiave);
      if (g) g.chi.push(p);
      else gruppi.set(chiave, { chi: [p], tappe });
    }
    return [...gruppi.values()].map(({ chi, tappe }, k) => {
      const capi = new Set(tappe.map((t) => t.capoId).filter(Boolean));
      const ordinati = [...chi].sort((a, b) => Number(capi.has(b.id)) - Number(capi.has(a.id)));
      const nome = ordinati.length === 1 ? `${ordinati[0].nome} ${ordinati[0].cognome}`
        : ordinati.map((x) => `${x.nome} ${x.cognome.charAt(0)}.`).join(", ");
      const mezzi = [...new Set(tappe.flatMap((t) => t.mezzi))].map((m) => mezzoDi.get(m)?.nome).filter((x): x is string => !!x);
      return { p: ordinati[0], chi: ordinati, nome, mezzi, colore: COLORI_PERSONA[k % COLORI_PERSONA.length], tappe, punti: puntiDelGiro(tappe, sede) };
    });
  }, [persone, agenda, sede, mezzoDi]);

  // La strada vera (HERE senza traffico, dalla edge mappa-operativa), un giro per
  // richiesta e in cache per mezz'ora. Se il servizio non c'è, ha finito il tetto
  // del giorno o non trova la strada, resta la stima in linea d'aria.
  const strade = useStradeGiri(companyId, basi.map((b) => b.punti), { chiedi: true });
  const avvisoStrade = strade.map((q) => q.error?.message).find(Boolean) ?? null;

  const giri = basi.map((b, k) => {
    const strada = strade[k]?.data ?? null;
    return { ...b, strada, viaggi: viaggiDelGiro(b.tappe, sede, strada?.tratte) };
  });
  const visibili = giri.filter((g) => !spente.has(g.p.id) && (!persona || g.p.id === persona));

  // indice = posizione del giro: la linea si clicca (apre il giro) e ha la
  // freccia del senso di marcia.
  const percorso: LineaPercorso[] = visibili.flatMap((g) => {
    const { nome: titolo, colore, punti, strada } = g;
    const indice = giri.indexOf(g);
    if (punti.length < 2) return [];
    // Sulla strada dove c'è il disegno vero, in linea retta (tratteggiata) dove manca.
    const vere = strada?.geometrieTratte;
    if (!vere?.length) return [{ indice, punti, titolo, colore, indicativa: true }];
    return punti.slice(1).map((a, k): LineaPercorso => (vere[k]?.length ?? 0) >= 2
      ? { indice, punti: vere[k], titolo, colore }
      : { indice, punti: [punti[k], a], titolo, colore, indicativa: true });
  });

  // L'inquadratura: la tappa scelta, il giro della persona scelta, i cantieri
  // (con la sede solo se è vicina: una sede a Milano non deve rimpicciolire Napoli)
  // oppure tutto. null = la mappa inquadra da sé pin e linee.
  const fuoco = ((): Punto[] | null => {
    const tappa = fuocoTappa ? conPunto.find((i) => i.id === fuocoTappa)?.punto : null;
    if (tappa) return [tappa];
    if (persona) {
      const g = giri.find((x) => x.p.id === persona);
      const punti = g?.punti.length ? g.punti : (g?.tappe ?? []).map((t) => t.punto).filter((x): x is Punto => !!x);
      if (punti.length) return punti;
    }
    if (inquadra === "tutto" || conPunto.length === 0) return null;
    const cantieri = conPunto.map((i) => i.punto!);
    const sedeVicina = sede && cantieri.some((c) => metriTra(sede, c) / 1000 <= KM_TRASFERTA);
    return sedeVicina ? [...cantieri, sede] : cantieri;
  })();

  // Col cursore dell'ora: dove dovrebbe essere ogni giro a quell'ora.
  const posizioniAlle = ora == null ? [] : visibili.flatMap((g) => {
    const dove = doveAlle(g.viaggi, g.punti, g.strada?.geometrieTratte, ora);
    return dove ? [{ g, dove }] : [];
  });
  const iniziali = (g: (typeof giri)[number]) => g.chi.length > 1 ? `${g.chi[0].nome[0]}+${g.chi.length - 1}` : `${g.p.nome?.[0] ?? ""}${g.p.cognome?.[0] ?? ""}`.toUpperCase();
  const descriviDove = (d: NonNullable<ReturnType<typeof doveAlle>>) =>
    d.stato === "viaggio" ? `in viaggio verso ${d.intervento ? d.intervento.titolo : "la sede"} (arriva alle ${d.arrivo})`
      : d.stato === "cantiere" ? `in cantiere: ${d.intervento?.titolo}`
        : d.stato === "attesa" ? `fermo a ${d.intervento?.titolo ?? "…"}` : d.stato === "rientrato" ? "rientrato in sede" : "in sede";

  const pin: Pin[] = [
    ...(sede ? [{ id: "sede", titolo: "Sede operativa", punto: sede, tipo: "base" as const, etichetta: "S" }] : []),
    ...conPunto.map((i) => ({
      id: i.id,
      titolo: `${numero.get(i.id)}. ${i.inizio ?? (i.momento === "dopo" ? "Dopo il cantiere" : i.momento === "prima" ? "Prima del cantiere" : "In giornata")} · ${i.titolo}`,
      punto: i.punto!,
      numero: numero.get(i.id),
      avviso: i.persone.length === 0 && !(i.esterni?.length),
    })),
    ...posizioniAlle.map(({ g, dove }) => ({
      id: `ora:${g.p.id}`,
      titolo: `${g.nome} · ${descriviDove(dove)}`,
      punto: dove.punto,
      tipo: "mezzo" as const,
      etichetta: iniziali(g),
      sciolto: true,
      colore: g.colore,
    })),
    ...[...ultime.entries()].map(([chi, e]) => ({
      id: `gps:${chi}`,
      titolo: `${personaDi.get(chi) ? `${personaDi.get(chi)!.nome} ${personaDi.get(chi)!.cognome}` : e.nome ?? "Persona"} · ${e.tipo.replace("_", " ")} alle ${new Date(e.ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`,
      punto: { lat: e.lat, lng: e.lng },
      tipo: "gps" as const,
    })),
  ];

  const scelto = interventi.find((i) => i.id === selezionato) ?? null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {schermoIntero && <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setSchermoIntero(false)} aria-hidden="true" />}
      <div className={cn("h-fit space-y-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm",
        schermoIntero && "fixed inset-2 z-50 h-auto shadow-2xl")}>
        <div className="flex flex-wrap items-center gap-1 px-1 pt-0.5 text-[11px]">
          <span className="text-slate-400">Inquadra:</span>
          {([["cantieri", "Cantieri del giorno"], ["tutto", "Tutto"]] as const).map(([v, etichetta]) => {
            const attivo = inquadra === v && !persona && !fuocoTappa;
            return (
              <button key={v} type="button" aria-pressed={attivo}
                onClick={() => { setInquadra(v); setPersona(null); setFuocoTappa(null); }}
                className={cn("h-6 min-h-0 rounded-full px-2 font-medium", attivo ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {etichetta}
              </button>
            );
          })}
          {persona && (() => { const g = giri.find((x) => x.p.id === persona); return g ? (
            <button type="button" onClick={() => { setPersona(null); setFuocoTappa(null); }}
              className="inline-flex h-6 min-h-0 items-center gap-1 rounded-full bg-slate-100 px-2 font-medium text-slate-700 hover:bg-slate-200" title="Torna a tutti i giri">
              <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: g.colore }} aria-hidden="true" />Giro di {g.chi.length > 1 ? `${g.p.nome} e ${g.chi.length - 1} ${g.chi.length === 2 ? "altro" : "altri"}` : g.p.nome} ×
            </button>
          ) : null; })()}
          <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">Clic sulla mappa, poi la rotellina per lo zoom</span>
          <button type="button" onClick={() => setSchermoIntero((x) => !x)} aria-label={schermoIntero ? "Riduci la mappa" : "Mappa a schermo intero"}
            title={schermoIntero ? "Riduci (Esc)" : "Schermo intero"}
            className="flex h-6 min-h-0 w-6 min-w-0 items-center justify-center rounded-md p-0 text-slate-600 hover:bg-slate-100">
            {schermoIntero ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
        {conPunto.length === 0 && !sede ? (
          <div className="flex min-h-[26rem] flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
            <MapPin className="h-6 w-6" aria-hidden="true" />
            Nessun intervento di questa giornata ha una posizione sulla mappa.
            <span>I cantieri si localizzano dall'indirizzo della commessa.</span>
          </div>
        ) : (
          <Suspense fallback={<div className="h-[34rem] animate-pulse rounded-lg bg-slate-50" />}>
            <CartografiaOperativa pin={pin} selezionato={selezionato} percorso={percorso} nomiPin tileConsentito={tileOk === companyId}
              fuoco={fuoco} rotellinaAlClic classeAltezza={schermoIntero ? "h-[calc(100dvh-9rem)]" : "h-[62dvh] min-h-[26rem] lg:h-[40rem]"}
              erroreTiles={erroreTiles} contesto={`programmazione:${giornata.giorno}:${persona ?? ""}:${spente.size}:${inquadra}:${fuocoTappa ?? ""}`}
              onSeleziona={(id) => {
                if (id.startsWith("ora:")) { setFuocoTappa(null); setPersona(id.slice(4)); return; }
                setSelezionato(id.startsWith("gps:") || id === "sede" ? null : id);
              }}
              onTratta={(k) => { const g = giri[k]; if (g) { setFuocoTappa(null); setPersona(g.p.id); } }} />
          </Suspense>
        )}
        {giri.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1 text-[11px]">
            {ora == null ? (
              <button type="button" onClick={() => { const adesso = new Date(); setOra(oggi ? Math.min(Math.max(adesso.getHours() * 60 + adesso.getMinutes(), 6 * 60), 20 * 60) : 8 * 60); }}
                className="inline-flex h-7 min-h-0 items-center gap-1 rounded-md px-2 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />Dove sono alle…
              </button>
            ) : (
              <>
                <button type="button" aria-label={inRiproduzione ? "Ferma" : "Riproduci la giornata"} onClick={() => { if (!inRiproduzione && (ora ?? 0) >= 20 * 60) setOra(6 * 60); setInRiproduzione((x) => !x); }}
                  className="flex h-7 min-h-0 w-7 min-w-0 items-center justify-center rounded-md p-0 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                  {inRiproduzione ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <span className="w-11 font-semibold tabular-nums text-slate-800">{`${String(Math.floor(ora / 60)).padStart(2, "0")}:${String(ora % 60).padStart(2, "0")}`}</span>
                <input type="range" min={6 * 60} max={20 * 60} step={5} value={ora} aria-label="Ora del giorno"
                  onChange={(e) => { setInRiproduzione(false); setOra(Number(e.target.value)); }}
                  className="h-1.5 min-w-[10rem] flex-1 cursor-pointer accent-orange-600" />
                <span className="hidden text-slate-500 lg:inline">
                  {posizioniAlle.filter((x) => x.dove.stato === "viaggio").length} in viaggio · {posizioniAlle.filter((x) => x.dove.stato === "cantiere").length} in cantiere
                </span>
                <button type="button" aria-label="Chiudi il cursore dell'ora" onClick={() => { setInRiproduzione(false); setOra(null); }}
                  className="flex h-7 min-h-0 w-7 min-w-0 items-center justify-center rounded-md p-0 text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
        )}
        {schermoIntero && giri.length > 0 && (
          // In schermo intero l'elenco dei giri resta sotto: qui i nomi, per accendere e scegliere.
          <div className="flex flex-wrap gap-1 px-1">
            {giri.map((g) => {
              const attivo = persona === g.p.id;
              return (
                <button key={g.p.id} type="button" onClick={() => { setFuocoTappa(null); setPersona(attivo ? null : g.p.id); }}
                  className={cn("inline-flex h-6 min-h-0 items-center gap-1 rounded-full px-2 text-[11px] ring-1",
                    attivo ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}>
                  <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: g.colore }} aria-hidden="true" />
                  {g.nome}<span className={attivo ? "text-slate-300" : "text-slate-400"}>· {g.viaggi.km.toLocaleString("it-IT")} km</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1 text-[10px] text-slate-400">
          <span><span className="font-semibold">S</span> sede operativa{!sede && " (da impostare in Impostazioni → Azienda)"}</span>
          <span>Linee: il giro di ciascuno{giri.some((g) => g.viaggi.stradale) ? ", sulla strada (senza traffico); tratteggiate dove manca" : ", in linea retta"}</span>
          {oggi && <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" aria-hidden="true" />dove ha timbrato, aggiornato ogni 2 minuti</span>}
          {giri.some((g) => !g.viaggi.stradale) && <span>Dove manca la strada, km e tempi sono stime (linea d'aria × 1,3, a 45 km/h)</span>}
          {avvisoStrade && <span className="text-amber-700">{avvisoStrade}</span>}
        </p>
      </div>

      <aside className="space-y-3">
        {scelto && <SchedaPunto i={scelto} numero={numero.get(scelto.id)} personaDi={personaDi} mezzoDi={mezzoDi}
          vicini={scelto.persone.length || scelto.esterni?.length || !scelto.punto ? [] : giri
            .map((g) => {
              // La tappa del giro più vicina a questo cantiere (in linea d'aria).
              const vicina = g.tappe.filter((t) => t.punto && t.id !== scelto.id)
                .map((t) => ({ t, km: metriTra(t.punto!, scelto.punto!) / 1000 }))
                .sort((a, b) => a.km - b.km)[0];
              // Libero quando finisce l'ULTIMA tappa del giro, non quella vicina.
              const ultima = [...g.tappe].reverse().find((t) => t.fine || t.inizio);
              const quando = vicina?.t.inizio ? `${vicina.t.inizio}${vicina.t.fine ? `–${vicina.t.fine}` : ""}` : null;
              return vicina ? { chi: g.nome, colore: g.colore, da: quando ? `${vicina.t.titolo}, ${quando}` : vicina.t.titolo,
                km: Math.round(vicina.km * 10) / 10, liberoDalle: ultima?.fine ?? ultima?.inizio ?? null } : null;
            })
            .filter((x): x is Vicino => !!x)
            .sort((a, b) => a.km - b.km)
            .slice(0, 3)}
          arrivi={giri.flatMap((g) => {
            const k = g.viaggi.tappe.findIndex((t) => t.intervento.id === scelto.id);
            const t = g.viaggi.tappe[k];
            if (k < 0 || t.km == null) return [];
            const prima = g.viaggi.tappe.slice(0, k).reverse().find((x) => x.intervento.punto)?.intervento;
            return [{ chi: g.nome, colore: g.colore, da: prima ? `${numero.get(prima.id) ?? ""} ${prima.titolo}`.trim() : "la sede",
              km: t.km, minuti: t.minuti ?? 0, partenza: t.partenza, ritardo: t.ritardo, stima: !g.viaggi.stradale }];
          })}
          merce={merce.filter((m) => m.orderId && m.orderId === scelto.orderId)} onApri={() => onApri(scelto.id)} onChiudi={() => setSelezionato(null)} />}

        <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Route className="h-3.5 w-3.5" aria-hidden="true" />I giri del giorno · {giri.length}</h3>
            {giri.length > 1 && (
              <button type="button" onClick={() => { setPersona(null); setSpente(spente.size ? new Set() : new Set(giri.map((g) => g.p.id))); }}
                className="text-[10px] text-slate-500 underline-offset-2 hover:underline">{spente.size ? "Mostra tutti" : "Nascondi tutti"}</button>
            )}
          </div>
          {giri.length === 0 && <p className="text-[11px] text-slate-400">Nessuno ha ancora un intervento in questa giornata.</p>}
          <ul className="space-y-1.5">
            {giri.map(({ p, chi, nome, mezzi, colore, viaggi, punti }) => {
              const acceso = !spente.has(p.id) && (!persona || persona === p.id);
              const aperto = persona === p.id;
              const ritardi = viaggi.tappe.filter((t) => t.ritardo > 0).length;
              const timbrati = chi.map((x) => ultime.get(x.id)).filter((x): x is PosizioneGps => !!x);
              const pos = timbrati.sort((a, b) => b.ora.localeCompare(a.ora))[0];
              return (
                <li key={p.id} className={cn("rounded-lg ring-1", aperto ? "ring-slate-300" : "ring-slate-100")}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button type="button" aria-label={acceso ? "Nascondi il giro" : "Mostra il giro"}
                      onClick={() => setSpente((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className="flex h-6 min-h-0 w-6 min-w-0 shrink-0 items-center justify-center rounded-full p-0 hover:bg-slate-100">
                      <span className={cn("block h-3 w-3 rounded-full", !acceso && "opacity-25")} style={{ backgroundColor: colore }} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => { setFuocoTappa(null); setPersona((x) => (x === p.id ? null : p.id)); }} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-medium text-slate-800" title={chi.map((x) => `${x.nome} ${x.cognome}`).join(", ")}>
                        {nome}{chi.length > 1 && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-normal text-slate-500"><Users className="h-2.5 w-2.5" aria-hidden="true" />{chi.length}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                        <span>{viaggi.tappe.length} {viaggi.tappe.length === 1 ? "tappa" : "tappe"}</span>
                        {viaggi.km > 0 && <span className="inline-flex items-center gap-0.5" title={viaggi.stradale ? "Sulla strada, senza traffico" : "Stima in linea d'aria"}><Car className="h-2.5 w-2.5" aria-hidden="true" />{viaggi.stradale ? "" : "~"}{viaggi.km.toLocaleString("it-IT")} km · {durata(viaggi.minuti)}</span>}
                        {mezzi.length > 0 && <span className="inline-flex items-center gap-0.5"><Truck className="h-2.5 w-2.5" aria-hidden="true" />{mezzi.join(", ")}</span>}
                        {viaggi.rientroAlle && <span title="Di nuovo in sede">rientro {viaggi.rientroAlle}</span>}
                        {viaggi.trasferta && <span className="text-sky-700" title="Il primo cantiere è a oltre 150 km dalla sede: il giro parte dal cantiere">in trasferta</span>}
                        {ritardi > 0 && <span className="inline-flex items-center gap-0.5 font-medium text-rose-600"><AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />{ritardi === 1 ? "un arrivo stretto" : `${ritardi} arrivi stretti`}</span>}
                        {oggi && (pos
                          ? <span className="inline-flex items-center gap-0.5 text-emerald-700"><Navigation className="h-2.5 w-2.5" aria-hidden="true" />{pos.tipo.startsWith("uscita") ? "uscito" : "timbrato"} {new Date(pos.ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}{chi.length > 1 && ` · ${timbrati.length} su ${chi.length}`}</span>
                          : <span className="text-slate-400">{chi.length > 1 ? "nessuno ha timbrato" : "non ha timbrato"}</span>)}
                      </span>
                    </button>
                  </div>
                  {aperto && <Itinerario viaggi={viaggi} colore={colore} sede={!!sede && !viaggi.trasferta} punti={punti} selezionato={selezionato}
                    onScegli={(id) => { setSelezionato(id); setFuocoTappa(id); }} />}
                </li>
              );
            })}
          </ul>
          {giri.length > 0 && <p className="mt-1.5 text-[10px] text-slate-400">Chi fa le stesse tappe viaggia insieme: un giro solo. Tocca un giro per l'itinerario con gli orari; il pallino lo accende e lo spegne.</p>}
        </section>

        {senzaPunto.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <p className="text-[10px] font-semibold text-amber-700">Senza posizione · {senzaPunto.length}</p>
            <ul className="mt-0.5 space-y-0.5">
              {senzaPunto.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => onApri(i.id)} className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-slate-500 hover:bg-slate-50">{i.titolo}</button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-slate-400">Fuori dai giri e dai km: manca l'indirizzo localizzato della commessa.</p>
          </section>
        )}
      </aside>
    </div>
  );
}

function Itinerario({ viaggi, colore, sede, punti, onScegli, selezionato }: {
  viaggi: ReturnType<typeof viaggiDelGiro>;
  punti: Punto[];
  colore: string;
  sede: boolean;
  onScegli: (id: string) => void;
  selezionato: string | null;
}) {
  return (
    <ol className="space-y-0.5 border-t border-slate-100 px-2 py-1.5">
      {sede && <li className="flex items-center gap-2 text-[11px] text-slate-500"><Flag className="h-3 w-3" aria-hidden="true" />Partenza dalla sede{viaggi.tappe[0]?.partenza ? <strong className="ml-auto tabular-nums text-slate-800">{viaggi.tappe[0].partenza}</strong> : null}</li>}
      {viaggi.tappe.map((t, k) => (
        <li key={t.intervento.id}>
          {t.km === 0 && k > 0 && <p className="ml-1.5 border-l-2 border-dashed py-0.5 pl-3 text-[10px] text-slate-400" style={{ borderColor: colore }}>stesso posto</p>}
          {t.km != null && t.km > 0 && (
            <p className="ml-1.5 border-l-2 border-dashed py-0.5 pl-3 text-[10px] text-slate-400" style={{ borderColor: colore }}>
              {viaggi.stradale ? "" : "~"}{t.km.toLocaleString("it-IT")} km · {durata(t.minuti ?? 0)}{k > 0 && t.partenza ? ` · parti alle ${t.partenza}` : ""}
              {t.ritardo > 0 && <span className="ml-1 font-semibold text-rose-600">· non ci arriva: mancano {t.ritardo} min</span>}
            </p>
          )}
          <button type="button" onClick={() => onScegli(t.intervento.id)}
            className={cn("flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] hover:bg-slate-50", selezionato === t.intervento.id && "bg-orange-50")}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: coloreIntervento(t.intervento) }}>{k + 1}</span>
            <span className="w-16 shrink-0 tabular-nums text-slate-500">{t.intervento.inizio ? `${t.intervento.inizio}${t.intervento.fine ? `–${t.intervento.fine}` : ""}` : t.intervento.momento === "dopo" ? "dopo" : t.intervento.momento === "prima" ? "prima" : "in giornata"}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.intervento.titolo}</span>
            {!t.intervento.punto && <MapPin className="h-3 w-3 shrink-0 text-amber-500" aria-label="Senza posizione" />}
          </button>
        </li>
      ))}
      {sede && viaggi.rientroKm != null && (
        <li className="flex items-center gap-2 pt-0.5 text-[11px] text-slate-500"><Flag className="h-3 w-3" aria-hidden="true" />Rientro in sede · {viaggi.stradale ? "" : "~"}{viaggi.rientroKm.toLocaleString("it-IT")} km{viaggi.rientroMinuti ? ` · ${durata(viaggi.rientroMinuti)}` : ""}{viaggi.rientroAlle ? <strong className="ml-auto tabular-nums text-slate-800">{viaggi.rientroAlle}</strong> : null}</li>
      )}
      {linkNavigatore(punti) && (
        <li className="pt-1">
          <a href={linkNavigatore(punti)!} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:underline">
            <Navigation className="h-3 w-3" aria-hidden="true" />Apri il giro nel navigatore
          </a>
          {punti.length > 11 && <span className="ml-1 text-[10px] text-slate-400">(le prime 9 tappe)</span>}
        </li>
      )}
    </ol>
  );
}

type Vicino = { chi: string; colore: string; da: string; km: number; liberoDalle: string | null };
type Arrivo = { chi: string; colore: string; da: string; km: number; minuti: number; partenza: string | null; ritardo: number; stima: boolean };

function SchedaPunto({ i, numero, personaDi, mezzoDi, merce, arrivi, vicini, onApri, onChiudi }: {
  i: Intervento;
  /** Cantiere scoperto: i giri che passano più vicino. */
  vicini: Vicino[];
  /** Come ci arriva ogni giro che passa di qui. */
  arrivi: Arrivo[];
  numero: number | undefined;
  personaDi: Map<string, PersonaGiorno>;
  mezzoDi: Map<string, MezzoGiorno>;
  merce: MerceGiorno[];
  onApri: () => void;
  onChiudi: () => void;
}) {
  return (
    <section className="rounded-xl border-l-4 border-slate-200 bg-white p-2.5 shadow-sm ring-1 ring-slate-200" style={{ borderLeftColor: coloreIntervento(i) }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-400">{numero ? `${numero} · ` : ""}{i.codice ?? i.tipo}</p>
          <p className="truncate text-sm font-semibold text-slate-900">{i.titolo}</p>
        </div>
        <button type="button" onClick={onChiudi} className="text-[11px] text-slate-400 hover:text-slate-700">Chiudi</button>
      </div>
      <dl className="mt-1.5 space-y-1 text-[11px] text-slate-600">
        <div className="flex gap-1.5"><Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          {i.inizio ? `${i.inizio}${i.fine ? `–${i.fine}` : ""}` : i.momento === "dopo" ? "Dopo il cantiere" : i.momento === "prima" ? "Prima del cantiere" : "In giornata"}</div>
        {i.indirizzo && <div className="flex gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(i.indirizzo)}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{i.indirizzo}</a></div>}
        <div className="flex gap-1.5"><Users className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          {i.persone.length ? i.persone.map((p) => `${personaDi.get(p)?.nome ?? "?"}${i.capoId === p ? " (capo)" : ""}`).join(", ") : <span className="text-amber-700">nessuno</span>}</div>
        {i.mezzi.length > 0 && <div className="flex gap-1.5"><Truck className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />{i.mezzi.map((m) => mezzoDi.get(m)?.nome).filter(Boolean).join(", ")}</div>}
        {merce.length > 0 && <div className="flex gap-1.5 text-amber-800"><Package className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />Merce: {merce.map((m) => m.fornitore ?? m.numero).join(", ")}</div>}
        {i.note && <div className="italic text-slate-500">{i.note}</div>}
      </dl>
      {arrivi.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 text-[11px]">
          {arrivi.map((a) => (
            <li key={a.chi} className="flex gap-1.5">
              <span className="mt-1 block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.colore }} aria-hidden="true" />
              <span className="min-w-0 text-slate-600">
                <span className="font-medium text-slate-800">{a.chi}</span>
                {a.km === 0 ? " · già qui" : <> · da {a.da} · {a.stima ? "~" : ""}{a.km.toLocaleString("it-IT")} km, {durata(a.minuti)}{a.partenza && <> · <strong>parti alle {a.partenza}</strong></>}</>}
                {a.ritardo > 0 && <span className="font-semibold text-rose-600"> · non ci arriva: mancano {a.ritardo} min</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {vicini.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">Nessuno assegnato · i più vicini oggi</p>
          <ul className="mt-0.5 space-y-0.5">
            {vicini.map((v) => (
              <li key={v.chi} className="flex gap-1.5 text-amber-900/90">
                <span className="mt-1 block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v.colore }} aria-hidden="true" />
                <span className="min-w-0"><span className="font-medium">{v.chi}</span> · passa a ~{v.km.toLocaleString("it-IT")} km ({v.da}){v.liberoDalle ? <> · <strong>libero dalle {v.liberoDalle}</strong></> : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-[10px] text-amber-800/80">Distanze in linea d'aria. Per assegnare, «Apri l'intervento».</p>
        </div>
      )}
      <button type="button" onClick={onApri} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 hover:underline">
        Apri l'intervento <ExternalLink className="h-3 w-3" />
      </button>
    </section>
  );
}
