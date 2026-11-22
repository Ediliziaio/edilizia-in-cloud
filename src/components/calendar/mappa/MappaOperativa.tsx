import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, ChevronRight, LocateFixed, MapPin, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import {
  dataAdiacente, kmDocumentati, ordineTappe, partiNelFuso, riepilogoPercorso,
  type Coordinate, type Tappa,
} from "../../../../shared/mappa-operativa/calcoli";
import CartografiaOperativa from "./CartografiaOperativa";
import { etichettaStato, type Risorsa, type VoceMappa } from "./dati";
import PianificaIntervento from "./PianificaIntervento";
import PosizioneOperativa from "./PosizioneOperativa";
import { calcolaPercorso, formatoKm, servizioMappa, tilesMappa, type Ambito, type Profilo } from "./servizio";
import type { StatoMappa } from "./useMappaCalendario";

interface Props {
  giorno: string; onGiorno: (giorno: string) => void;
  state: StatoMappa; onState: (patch: Partial<StatoMappa>) => void;
  voci: VoceMappa[]; ambito: Ambito; personale?: boolean; loading?: boolean; erroreDati?: boolean;
  modifica?: boolean; registroMezzi?: boolean; onRiprova?: () => void; onScheda?: (id: string) => void;
  vendite?: boolean; lavori?: boolean; consumo?: boolean; nuovo?: () => void;
}

const hhmm = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const fascia = (inizio: number | null, fine: number | null) => inizio == null ? "Orario non definito" :
  hhmm(inizio) + (fine == null ? "" : `–${hhmm(fine)}${fine >= 1440 ? " (+1)" : ""}`);
const idRisorsa = (r: Risorsa) => `${r.tipo}:${r.id}`;
const nessuna: Coordinate[][] = [];
const viaggiVuoti: NonNullable<import("@/integrations/supabase/appDatabase").AppDatabase["public"]["Functions"]["mappa_km_effettivi"]["Returns"]> = [];
type TrattaData = Awaited<ReturnType<typeof calcolaPercorso>>;

export default function MappaOperativa({
  giorno, onGiorno, state, onState, voci, ambito, personale = false, loading, erroreDati,
  modifica, registroMezzi, onRiprova, onScheda, vendite = false, lavori = false, consumo, nuovo,
}: Props) {
  const { effectiveCompany, company: home, user } = useAuth();
  const company = (effectiveCompany ?? home)?.id;
  const queryClient = useQueryClient();
  const sede = useCompanyBase();
  const identita = [company, user?.id, ambito, personale];
  const [posiziona, setPosiziona] = useState<VoceMappa | "destinazione" | null>(null);
  const [bozza, setBozza] = useState<Coordinate | null>(null);
  const [destinazione, setDestinazione] = useState<{ punto: Coordinate; titolo: string } | null>(null);
  const [profilo, setProfilo] = useState<Profilo>("auto");
  const [usaSede, setUsaSede] = useState(true);
  const [trattaGruppo, setTrattaGruppo] = useState("");
  const [esitoPercorso, setEsitoPercorso] = useState<{ firma: string; dati: TrattaData }>();
  const [routing, setRouting] = useState(false);
  const [vediConsumo, setVediConsumo] = useState(false);
  const apertura = useRef<string | null>(null);
  const [tilesConfermati, setTilesConfermati] = useState<string | null>(null);
  const [erroreTiles, setErroreTiles] = useState("");
  const righe = useRef(new Map<string, HTMLButtonElement>());

  const ids = useMemo(() => [...new Set(voci.map(v => v.id))].sort(), [voci]);
  const ordini = useMemo(() => voci.filter(v => v.tipo === "cantiere").map(v => v.id).sort(), [voci]);
  const tipoRecord = ambito === "vendite" ? "appuntamento" : "cantiere";
  const posizioni = useQuery({
    queryKey: ["mappa-posizioni", ...identita, ids], enabled: !!company && !!ids.length,
    queryFn: async ({ signal }) => {
      const righe = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from("mappa_posizioni")
          .select("record_id,lat,lng,fonte,aggiornato_il").eq("company_id", company!).eq("tipo", tipoRecord)
          .in("record_id", ids.slice(i, i + 100)).abortSignal(signal);
        if (error) throw error;
        righe.push(...data);
      }
      return righe;
    },
    staleTime: 0, retry: false,
  });
  const assegnati = useQuery({
    queryKey: ["mappa-assegnati", ...identita, giorno, ordini],
    enabled: !!company && ambito === "lavori" && !personale && !!ordini.length && lavori,
    queryFn: async ({ signal }) => {
      const righe = [];
      for (let i = 0; i < ordini.length; i += 200) {
        const { data, error } = await supabase.rpc("mappa_assegnati", {
          p_company: company!, p_giorno: giorno, p_ordini: ordini.slice(i, i + 200),
        }).abortSignal(signal);
        if (error) throw error;
        righe.push(...data);
      }
      return righe;
    },
    retry: false,
  });
  const presenze = useQuery({
    queryKey: ["mappa-presenze", ...identita, giorno, ordini], enabled: !!company && !!ordini.length,
    queryFn: async ({ signal }) => {
      const righe = [];
      for (let i = 0; i < ordini.length; i += 200) {
        const { data, error } = await supabase.rpc("mappa_presenze", {
          p_company: company!, p_giorno: giorno, p_ordini: ordini.slice(i, i + 200), p_personale: personale,
        }).abortSignal(signal);
        if (error) throw error;
        righe.push(...data);
      }
      return righe;
    },
    refetchInterval: giorno === partiNelFuso(new Date()).giorno ? 60_000 : false, retry: false,
  });
  const effettivi = useQuery({
    queryKey: ["mappa-km", ...identita, giorno], enabled: !!company,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mappa_km_effettivi", {
        p_company: company!, p_giorno: giorno, p_personale: personale,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const conteggi = useQuery({
    queryKey: ["consumo-mappa", ...identita], enabled: !!company && !!consumo && vediConsumo,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mappa_consumo_mese", { p_company: company! }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
    staleTime: 0, retry: false,
  });

  useEffect(() => {
    if (!company || !user?.id) return;
    const firma = `${company}:${user.id}:${ambito}`;
    if (apertura.current === firma) return;
    apertura.current = firma;
    void servizioMappa(company, ambito, { azione: "vista", tile: !!tilesMappa })
      .then(() => setTilesConfermati(firma))
      .catch(e => { if (tilesMappa) setErroreTiles((e as Error).message); });
    if (consumo) void queryClient.invalidateQueries({ queryKey: ["consumo-mappa", company, user.id] });
  }, [company, user?.id, ambito, consumo, queryClient]);

  const mappate = useMemo(() => {
    const salvate = new Map(posizioni.data?.map(p => [p.record_id, p]));
    return voci.map(v => {
      const correzione = salvate.get(v.id);
      const attivita = v.attivita.map(a => {
        const noti = new Set(a.risorse.map(r => r.id));
        const collegate = assegnati.data?.filter(r => r.order_id === v.id &&
          (noti.has(r.employee_id ?? r.user_id) || (r.squadra_id ? noti.has(r.squadra_id) : v.attivita.length === 1))) ?? [];
        const risorse = new Map(a.risorse.map(r => [idRisorsa(r), r]));
        for (const r of collegate) {
          const operaio: Risorsa = { id: r.employee_id ?? r.user_id, nome: r.nome ?? "", tipo: "operaio" };
          if (r.nome && !noti.has(operaio.id)) risorse.set(idRisorsa(operaio), operaio);
          if (r.mezzo && r.mezzo_id) risorse.set(`mezzo:${r.mezzo_id}`, { id: r.mezzo_id, nome: r.mezzo, tipo: "mezzo" });
        }
        return { ...a, risorse: [...risorse.values()] };
      });
      const aggiuntivi = assegnati.data?.filter(r => r.order_id === v.id && !r.squadra_id && r.nome
        && !attivita.some(a => a.risorse.some(s => s.id === (r.employee_id ?? r.user_id))));
      if (aggiuntivi?.length) attivita.push({
        id: v.id + "-assegnati", inizio: v.inizio, fine: v.fine, nome: "Assegnazione alla commessa",
        risorse: [...new Map(aggiuntivi.flatMap((r): Risorsa[] => [
          { id: r.employee_id ?? r.user_id, nome: r.nome!, tipo: "operaio" },
          ...(r.mezzo && r.mezzo_id ? [{ id: r.mezzo_id, nome: r.mezzo, tipo: "mezzo" as const }] : []),
        ]).map(r => [idRisorsa(r), r])).values()],
      });
      if (!correzione || v.escluso) return { ...v, attivita };
      return { ...v, attivita, punto: { lat: correzione.lat, lng: correzione.lng }, motivo: undefined };
    });
  }, [voci, posizioni.data, assegnati.data]);
  const risorse = useMemo(() => {
    const mappa = new Map<string, Risorsa>();
    mappate.flatMap(v => v.attivita).flatMap(a => a.risorse).forEach(r => mappa.set(idRisorsa(r), r));
    return [...mappa].sort(([, a], [, b]) => a.nome.localeCompare(b.nome, "it"));
  }, [mappate]);
  const stati = useMemo(() => [...new Set(mappate.map(v => v.stato))].sort(), [mappate]);
  const filtrate = useMemo(() => {
    const filtrate = mappate.filter(v => (!state.stato || v.stato === state.stato) &&
      (!state.cantiere || v.id === state.cantiere) &&
      (!state.risorsa || v.attivita.some(a => a.risorse.some(r => idRisorsa(r) === state.risorsa))));
    return ordineTappe(filtrate) as VoceMappa[];
  }, [mappate, state.cantiere, state.risorsa, state.stato]);
  const pin = useMemo(() => {
    let numero = 0;
    return filtrate.flatMap(v => v.punto && !v.escluso
      ? [{ id: v.id, titolo: v.titolo, punto: v.punto, numero: ambito === "vendite" ? ++numero : undefined }] : []);
  }, [filtrate, ambito]);

  const gruppi = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const v of filtrate) {
      if (v.escluso) continue;
      const tutti = v.attivita.flatMap(a => a.risorse);
      for (const r of tutti.filter(r => r.tipo !== "operaio" || state.risorsa === idRisorsa(r) || !tutti.some(a => a.tipo === "squadra"))) {
        mappa.set(idRisorsa(r), r.nome);
      }
    }
    return [...mappa].sort(([, a], [, b]) => a.localeCompare(b, "it"));
  }, [filtrate, state.risorsa]);
  const gruppo = gruppi.some(([key]) => key === trattaGruppo) ? trattaGruppo : gruppi[0]?.[0] ?? "";
  const tappe = useMemo(() => {
    const dati = filtrate.flatMap(v => {
      if (v.escluso) return [];
      const attivita = gruppo ? v.attivita.filter(a => a.risorse.some(r => idRisorsa(r) === gruppo)) : personale ? v.attivita : [];
      if (!attivita.length) return [];
      const inizio = attivita.flatMap(a => a.inizio == null ? [] : [a.inizio]);
      const fine = attivita.flatMap(a => a.fine == null ? [] : [a.fine]);
      return [{ ...v, inizio: inizio.length ? Math.min(...inizio) : null, fine: fine.length ? Math.max(...fine) : null }];
    });
    const ordinate: Tappa[] = ordineTappe(dati);
    const origine = dati[0]?.base ?? sede;
    const ritorno = dati[dati.length - 1]?.base ?? sede;
    if (usaSede && ordinate.length) {
      if (origine) ordinate.unshift({ id: "partenza", titolo: "Sede · partenza", punto: origine, inizio: null, fine: null });
      if (ritorno) ordinate.push({ id: "rientro", titolo: "Sede · rientro", punto: ritorno, inizio: null, fine: null });
    }
    return ordinate;
  }, [filtrate, gruppo, personale, sede, usaSede]);
  const firma = JSON.stringify([identita, giorno, gruppo, profilo, tappe]);
  const percorso = esitoPercorso?.firma === firma ? esitoPercorso.dati : undefined;
  const tratte = percorso ? riepilogoPercorso(tappe, percorso.tratte) : [];
  const selezionata = filtrate.find(v => v.id === state.id);
  const aggiornaSelezione = useCallback((id: string) => {
    onState({ id });
    righe.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [onState]);

  const calcola = async () => {
    if (!company || tappe.length < 2) return;
    setRouting(true);
    try {
      setEsitoPercorso({ firma, dati: await calcolaPercorso(company, ambito, tappe, profilo) });
      if (consumo) void conteggi.refetch();
    }
    finally { setRouting(false); }
  };
  const cambiaData = (data: string) => {
    if (!data) return;
    setDestinazione(null);
    setPosiziona(null);
    setBozza(null);
    onGiorno(data);
  };
  const avviaPosizione = (voce: VoceMappa | "destinazione") => {
    setPosiziona(voce);
    setBozza(voce === "destinazione" ? null : voce.punto);
    setDestinazione(null);
  };
  const salvaPosizione = (punto: Coordinate) => {
    if (posiziona === "destinazione") setDestinazione({ punto, titolo: "Posizione confermata" });
    else void queryClient.invalidateQueries({ queryKey: ["mappa-posizioni", company, user?.id] });
    setPosiziona(null);
    setBozza(null);
  };
  const viaggi = effettivi.data ?? viaggiVuoti;
  const posa = posiziona && posiziona !== "destinazione" ? posiziona : undefined;
  const distanzaTotale = percorso?.tratte.reduce((n, t) => n + (t?.metri ?? 0), 0);
  const tempoTotale = percorso?.tratte.reduce((n, t) => n + (t?.secondi ?? 0), 0);
  const opzioniTeam = ambito !== "vendite";
  if (!company) return null;

  return <section className="min-w-0 space-y-3" aria-label="Vista Mappa operativa">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label="Giorno precedente" onClick={() => cambiaData(dataAdiacente(giorno, -1))}><ChevronLeft className="size-4" /></Button>
        <Input className="w-36" aria-label="Giorno della mappa" type="date" value={giorno} onChange={e => cambiaData(e.target.value)} />
        <Button size="icon" variant="ghost" aria-label="Giorno successivo" onClick={() => cambiaData(dataAdiacente(giorno, 1))}><ChevronRight className="size-4" /></Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => cambiaData(partiNelFuso(new Date()).giorno)}>Oggi</Button>
      <select aria-label={opzioniTeam ? "Filtra squadra o operaio" : "Filtra commerciale"} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
        value={state.risorsa} onChange={e => onState({ risorsa: e.target.value })}>
        <option value="">{opzioniTeam ? "Tutte le risorse" : "Tutti i commerciali"}</option>
        {risorse.map(([key, r]) => <option key={key} value={key}>{r.nome}{r.tipo === "squadra" ? " · squadra" : r.tipo === "mezzo" ? " · mezzo" : ""}</option>)}
        {state.risorsa && !risorse.some(([key]) => key === state.risorsa) && <option value={state.risorsa}>Risorsa selezionata</option>}
      </select>
      {opzioniTeam && <select aria-label="Filtra cantiere" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={state.cantiere}
        onChange={e => onState({ cantiere: e.target.value })}>
        <option value="">Tutti i cantieri</option>
        {mappate.map(v => <option key={v.id} value={v.id}>{v.titolo}</option>)}
        {state.cantiere && !mappate.some(v => v.id === state.cantiere) && <option value={state.cantiere}>Cantiere selezionato</option>}
      </select>}
      <select aria-label="Filtra stato" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={state.stato} onChange={e => onState({ stato: e.target.value })}>
        <option value="">Tutti gli stati</option>{stati.map(s => <option key={s} value={s}>{etichettaStato(s)}</option>)}
        {state.stato && !stati.includes(state.stato) && <option value={state.stato}>{etichettaStato(state.stato)}</option>}
      </select>
      {(vendite || lavori) && <Button variant="outline" className="ml-auto" onClick={() => avviaPosizione("destinazione")}><LocateFixed className="size-4" /> Chi è più vicino?</Button>}
    </div>

    {(erroreDati || posizioni.isError || presenze.isError || assegnati.isError) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
      Alcuni dati della mappa sono temporaneamente indisponibili. <button className="underline" onClick={() => { onRiprova?.(); if (ids.length) void posizioni.refetch();
        if (ordini.length) { void presenze.refetch(); if (!personale && lavori) void assegnati.refetch(); } }}>Riprova</button>
    </p>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
      <CartografiaOperativa pin={pin} selezionato={state.id} percorso={percorso?.geometrie ?? nessuna}
        tileConsentito={tilesConfermati === `${company}:${user?.id}:${ambito}`} erroreTiles={erroreTiles}
        bozza={bozza} onSeleziona={aggiornaSelezione} onPunto={posiziona ? setBozza : undefined} />
      <div className="min-w-0 rounded-lg border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-1 border-b px-3 py-2">
          <h2 className="font-medium">{ambito === "vendite" ? "Appuntamenti" : "Cantieri"}</h2>
          <span className="text-xs text-muted-foreground">{filtrate.length} in elenco · {pin.length} sulla mappa</span>
        </div>
        <div className="min-w-0 divide-y lg:max-h-[31rem] lg:overflow-auto">
          {loading && <p className="p-4 text-sm text-muted-foreground" role="status">Caricamento attività…</p>}
          {!loading && !filtrate.length && <p className="p-4 text-sm text-muted-foreground">Nessuna attività per la giornata e i filtri scelti.</p>}
          {filtrate.map(v => {
            const numero = pin.find(p => p.id === v.id)?.numero;
            const attivo = state.id === v.id;
            return <article key={v.id} className={attivo ? "bg-primary/5" : undefined}>
              <button ref={el => { if (el) righe.current.set(v.id, el); else righe.current.delete(v.id); }} type="button"
                onClick={() => onState({ id: attivo ? null : v.id })} aria-expanded={attivo}
                className="flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-ring">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {numero ?? <MapPin className={v.punto ? "size-3.5" : "size-3.5 text-muted-foreground"} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{v.titolo}</span>
                  <span className="block break-words text-xs text-muted-foreground">{fascia(v.inizio, v.fine)} · {etichettaStato(v.stato)}</span>
                  {v.cliente && <span className="block break-words text-xs">{v.cliente}</span>}
                  <span className="block break-words text-xs text-muted-foreground">{v.indirizzo || "Indirizzo mancante"}</span>
                  {!v.punto && (v.motivo || v.indirizzo) && <span className="block text-xs font-medium text-amber-800">{v.motivo || "Coordinate da confermare"}</span>}
                </span>
              </button>
              {attivo && <div className="space-y-2 px-3 pb-3 text-xs">
                {v.attivita.map(a => <div key={a.id} className="rounded-md border bg-background p-2">
                  {v.tipo === "cantiere" && <div className="font-medium">{a.nome} · {fascia(a.inizio, a.fine)}{a.stato && ` · ${etichettaStato(a.stato)}`}</div>}
                  {a.risorse.map(r => <p key={idRisorsa(r)} className="mt-0.5 break-words">{r.nome} <span className="text-muted-foreground">· {r.tipo === "squadra" ? "Squadra assegnata" : r.tipo === "mezzo" ? "Mezzo assegnato al conducente" : "Assegnato"}</span></p>)}
                  {personale && v.tipo === "cantiere" && a.risorse.length === 0 && <p>Assegnato a te</p>}
                </div>)}
                {presenze.data?.filter(p => p.order_id === v.id).map(p => <p key={`${p.user_id}:${p.ora}:${p.tipo}`} className="break-words rounded bg-emerald-50 px-2 py-1.5 text-emerald-950">
                  {p.nome ?? "Operaio"} · {p.tipo === "uscita" ? "Uscita registrata" : p.tipo === "entrata" ? "Presenza registrata" : "Pausa registrata"} · {partiNelFuso(p.ora).ora} · {p.fonte}
                </p>)}
                <div className="flex flex-wrap gap-1">
                  {v.link && <Button asChild size="sm" variant="outline"><Link to={v.link}>Apri commessa <ArrowUpRight className="size-3.5" /></Link></Button>}
                  {!v.link && onScheda && <Button size="sm" variant="outline" onClick={() => onScheda(v.id)}>Apri scheda <ArrowUpRight className="size-3.5" /></Button>}
                  {modifica && !v.escluso && <Button size="sm" variant="outline" onClick={() => avviaPosizione(v)}>Posiziona pin</Button>}
                  {(vendite || lavori) && v.punto && <Button size="sm" variant="outline" onClick={() => {
                    setDestinazione({ titolo: v.titolo, punto: v.punto! }); setPosiziona(null); setBozza(null);
                  }}><Users className="size-3.5" /> Chi è più vicino?</Button>}
                </div>
              </div>}
            </article>;
          })}
        </div>
        {!!selezionata && posa?.id === selezionata.id && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">Posizionamento in corso</p>}
      </div>
    </div>

    {posiziona && <PosizioneOperativa key={posa?.id ?? "destinazione"} company={company} ambito={ambito} voce={posa}
      punto={bozza} onPunto={setBozza} onSalva={salvaPosizione} onChiudi={() => { setPosiziona(null); setBozza(null); }} />}
    {destinazione && <PianificaIntervento key={`${giorno}:${destinazione.punto.lat}:${destinazione.punto.lng}`}
      company={company} ambito={ambito} giorno={giorno} nomeDestinazione={destinazione.titolo} meta={destinazione.punto}
      vendite={vendite} lavori={lavori} onChiudi={() => setDestinazione(null)} />}
    {destinazione && nuovo && <Button variant="outline" onClick={nuovo}>Nuovo appuntamento</Button>}

    <div className="grid gap-3 lg:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-lg border bg-card p-3" aria-label="Percorso pianificato">
        <div className="flex items-center gap-2 font-medium"><Route className="size-4" /> Percorso pianificato</div>
        <div className="flex flex-wrap items-center gap-2">
          {!!gruppi.length && <select aria-label="Risorsa del percorso" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={gruppo}
            onChange={e => setTrattaGruppo(e.target.value)}>{gruppi.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>}
          {import.meta.env.VITE_MAPPA_OPERATIVA_FURGONE === "true" && <select aria-label="Profilo mezzo" className="h-9 rounded-md border bg-background px-2 text-sm"
            value={profilo} onChange={e => setProfilo(e.target.value as Profilo)}><option value="auto">Auto</option><option value="furgone">Furgone</option></select>}
          {(sede || filtrate.some(v => v.base)) && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={usaSede}
            onChange={e => setUsaSede(e.target.checked)} /> Includi sede</label>}
          <Button variant="outline" size="sm" onClick={() => void calcola()} disabled={routing || tappe.length < 2}>{routing ? "Calcolo in corso…" : "Calcola percorso"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{tappe.length < 2 ? "Percorso non calcolabile" :
          tappe[0].id === "partenza" || tappe.at(-1)?.id === "rientro" ? "Tappe della giornata e sedi indicate." : "Totale tra le tappe della giornata."}</p>
        {percorso && <div aria-live="polite" className="space-y-2 text-sm">
          <p className="font-medium">{percorso.tratte.some(Boolean) ? `${percorso.tratte.some(t => !t) ? "Totale parziale" : "Totale stimato"} · ${formatoKm(distanzaTotale ?? 0)} · ${Math.round((tempoTotale ?? 0) / 60)} min` : "Stima stradale non disponibile"}</p>
          {percorso.errori.map(e => <p key={e} className="text-xs text-amber-800">{e}</p>)}
          <ul className="space-y-1">
            {tratte.map((t, i) => <li key={`${i}:${t.da.id}:${t.a.id}`} className="rounded bg-muted/40 px-2 py-1.5">
              <p className="break-words">{t.da.titolo} → {t.a.titolo}</p>
              <p className="text-xs text-muted-foreground">{t.tratta ? `${formatoKm(t.tratta.metri)} · ${Math.round(t.tratta.secondi / 60)} min` : "Tratta mancante"}</p>
              {t.conflitto && <p className="text-xs font-medium text-amber-800">{t.conflitto}</p>}
            </li>)}
          </ul>
        </div>}
      </section>
      <section className="min-w-0 space-y-2 rounded-lg border bg-card p-3" aria-label="Km effettivi registrati">
        <h3 className="font-medium">Km effettivi registrati</h3>
        {effettivi.isPending ? <p className="text-sm text-muted-foreground">Caricamento viaggi…</p> :
          effettivi.isError ? <p className="text-sm text-muted-foreground">Registro temporaneamente non disponibile.</p> :
          viaggi.length ? <>
            <p className="text-sm font-medium tabular-nums">{formatoKm(kmDocumentati(viaggi))} · viaggi partiti nel giorno selezionato</p>
            {viaggi.map(v => <p key={v.id} className="break-words text-xs text-muted-foreground">
              {v.mezzo} · {partiNelFuso(v.partenza).ora} · {formatoKm(v.metri)} · {v.fonte}
            </p>)}
          </> : <p className="text-sm text-muted-foreground">Da registrare</p>}
        {registroMezzi && <Button asChild variant="link" className="h-auto px-0"><Link to="/azienda/manodopera?tab=mezzi">Apri registro mezzi</Link></Button>}
      </section>
    </div>
    {consumo && <details onToggle={e => setVediConsumo(e.currentTarget.open)} className="rounded-lg border bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Consumo cartografico del mese</summary>
      {conteggi.isError && <p className="mt-2 text-xs">Conteggi non disponibili.</p>}
      {conteggi.data?.map(c => <p key={`${c.provider}:${c.voce}`} className="mt-1 text-xs">{c.provider.replaceAll("_", " ")} · {c.voce.replaceAll("_", " ")} · {Number(c.unita).toLocaleString("it-IT")}</p>)}
    </details>}
  </section>;
}
