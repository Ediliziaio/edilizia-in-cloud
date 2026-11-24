import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, ChevronRight, ChevronDown, ClipboardCopy, LocateFixed, MapPin, Route, Truck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { queryKeys } from "@/lib/queryKeys";
import {
  coordinate, dataAdiacente, kmDocumentati, ordineTappe, partiNelFuso, riepilogoPercorso, stimaRientro,
  type Coordinate,
} from "../../../../shared/mappa-operativa/calcoli";
import CartografiaOperativa, { type InquadraturaMappa, type Pin } from "./CartografiaOperativa";
import { TimbratureMappa } from "./TimbratureMappa";
import { useMezziMappa, usePinMezziMappa, type FiltroMezzi } from "./useMezziMappa";
import { dettagliTimbratura, etichettaStato, tappeOperative, timbratureDellaVisita, type Risorsa, type TappaOperativa, type VoceMappa } from "./dati";
import { oraDaMinuti } from "./fasce";
import PianificaIntervento from "./PianificaIntervento";
import PosizioneOperativa from "./PosizioneOperativa";
import { calcolaPercorso, fonteCartografica, formatoKm, servizioMappa, type Ambito, type Profilo, type PropostaMappa, type TipoCandidato } from "./servizio";
import { aspettoTratta, type LineaPercorso } from "./tratte";
import { useMemoriaMappa, type StatoMappa } from "./useMappaCalendario";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

type FnT = ReturnType<typeof useT>;

const MezziMappa = lazy(() => import("./MezziMappa"));

interface Props {
  giorno: string; onGiorno: (giorno: string) => void;
  state: StatoMappa; onState: (patch: Partial<StatoMappa>) => void;
  voci: VoceMappa[]; ambito: Ambito; personale?: boolean; loading?: boolean; erroreDati?: boolean;
  modifica?: boolean; registroMezzi?: boolean; onRiprova?: () => void; onScheda?: (id: string) => void;
  puoProporre?: (tipo: TipoCandidato, id: string, voce?: VoceMappa) => boolean;
  onProposta?: (proposta: PropostaMappa, destinazione: Destinazione) => void;
  vendite?: boolean; lavori?: boolean; consumo?: boolean; nuovo?: () => void;
}

const fascia = (inizio: number | null, fine: number | null, t: FnT) => inizio == null ? t("Orario non definito") :
  oraDaMinuti(inizio) + (fine == null ? "" : `–${oraDaMinuti(fine)}${fine >= 1440 ? " (+1)" : ""}`);
const nomeTappa = (tappa: { id: string; titolo: string }, t: FnT) =>
  tappa.id === "partenza" || tappa.id === "rientro" ? tappa.titolo.replace(`${t("Partenza")} · `, "").replace(`${t("Rientro")} · `, "") : tappa.titolo;
const idRisorsa = (r: Risorsa) => `${r.tipo}:${r.id}`;
const nessuna: LineaPercorso[] = [];
const viaggiVuoti: NonNullable<import("@/integrations/supabase/appDatabase").AppDatabase["public"]["Functions"]["mappa_km_effettivi"]["Returns"]> = [];
type Vista = "giornata" | "percorso" | "problemi" | "timbrature" | "mezzi";
type BasePercorso = { id: string; nome: string; punto: Coordinate };
type SceltaBase = { id?: string; rientro?: string; personale?: Coordinate };
type FiltroProblemi = "tutti" | "posizioni" | "orari" | "viaggi";
type Destinazione = { punto: Coordinate; titolo: string; indirizzo?: string; voce?: VoceMappa };
type TrattaData = Awaited<ReturnType<typeof calcolaPercorso>>;
type EsitoGiro = { firma: string; dati: TrattaData };
const preferenzeGiro: {
  vista: Vista; profilo: Profilo; trattaGruppo: string; scelteBase: Record<string, SceltaBase>;
  personaGps: string; filtroProblemi: FiltroProblemi; trattaScelta: { firma: string; indice: number } | null; tappaScelta: string | null;
  tipoMezzi: FiltroMezzi; cercaMezzi: string; mezzoScelto: string | null;
} = {
  vista: "giornata", profilo: "auto", trattaGruppo: "", scelteBase: {},
  personaGps: "", filtroProblemi: "tutti", trattaScelta: null, tappaScelta: null,
  tipoMezzi: "tutti", cercaMezzi: "", mezzoScelto: null,
};

function problemiVoce(v: VoceMappa) {
  return {
    posizione: v.escluso ? "" : !v.indirizzo ? "Indirizzo mancante" : !v.punto ? v.motivo || "Coordinate da confermare" : "",
    orario: !v.escluso && (v.orarioIncompleto || v.inizio == null || v.fine == null ||
      v.attivita.some(a => a.inizio == null || a.fine == null)),
  };
}

const statoPresenza = (tipo: string) => tipo === "uscita" ? "Uscita registrata" :
  tipo === "entrata" ? "Presenza registrata" : tipo === "pausa_fine" || tipo === "fine_pausa" ? "Fine pausa registrata" : "Pausa registrata";

export default function MappaOperativa({
  giorno, onGiorno, state, onState, voci, ambito, personale = false, loading, erroreDati,
  modifica, registroMezzi, onRiprova, onScheda, puoProporre, onProposta, vendite = false, lavori = false, consumo, nuovo,
}: Props) {
  const t = useT();
  const { effectiveCompany, company: home, user } = useAuth();
  const company = (effectiveCompany ?? home)?.id;
  const queryClient = useQueryClient();
  const sede = useCompanyBase();
  const identita = [company, user?.id, ambito, personale];
  const [posiziona, setPosiziona] = useState<VoceMappa | "destinazione" | "partenza" | null>(null);
  const [bozza, setBozza] = useState<Coordinate | null>(null);
  const [destinazione, setDestinazione] = useState<Destinazione | null>(null);
  const chiaveMemoria = JSON.stringify(identita);
  const [preferenze, setPreferenze] = useMemoriaMappa("giro", chiaveMemoria, preferenzeGiro);
  const { vista: vistaSalvata, profilo, trattaGruppo, scelteBase, personaGps, filtroProblemi, trattaScelta, tappaScelta } = preferenze;
  const puoVedereMezziMappa = ambito === "lavori" && Boolean(registroMezzi);
  const vista = vistaSalvata === "mezzi" && !puoVedereMezziMappa ? "giornata" : vistaSalvata;
  const vistaMezzi = vista === "mezzi";
  const preferisci = (patch: Partial<typeof preferenzeGiro>) => setPreferenze(p => ({ ...p, ...patch }));
  const [esitoPercorso, salvaGiro] = useMemoriaMappa<EsitoGiro | null>("ultimo-giro", chiaveMemoria, null);
  const [inquadratura, salvaInquadratura] = useMemoriaMappa<InquadraturaMappa | null>(`zoom:${vista}`, chiaveMemoria, null);
  const [lavoro, setLavoro] = useState<{ firma: string; inCorso: boolean; signal?: AbortSignal; dati?: TrattaData; errore?: string } | null>(null);
  const calcoloInCorso = useRef<{ firma: string; controller: AbortController } | null>(null);
  const [vediConsumo, setVediConsumo] = useState(false);
  const [gpsScelto, setGpsScelto] = useState<string | null>(null);
  const riferimentiTratte = useRef(new Map<number, HTMLButtonElement>());
  const [elencoAperto, setElencoAperto] = useState(true);
  const areaAzioni = useRef<HTMLDivElement>(null);
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
  const giornoDopo = vista === "percorso" && voci.some(v => v.tipo === "cantiere" &&
    v.attivita.some(a => a.fine != null && a.fine >= 1440)) ? dataAdiacente(giorno, 1) : null;
  const presenze = useQuery({
    queryKey: ["mappa-presenze", ...identita, giorno, ordini, giornoDopo], enabled: !!company && !!ordini.length,
    queryFn: async ({ signal }) => {
      const righe = [];
      for (const dataPresenze of giornoDopo ? [giorno, giornoDopo] : [giorno]) {
        for (let i = 0; i < ordini.length; i += 200) {
          const { data, error } = await supabase.rpc("mappa_presenze", {
            p_company: company!, p_giorno: dataPresenze, p_ordini: ordini.slice(i, i + 200), p_personale: personale,
          }).abortSignal(signal);
          if (error) throw error;
          righe.push(...data);
        }
      }
      return righe;
    },
    refetchInterval: giorno === partiNelFuso(new Date()).giorno ? 60_000 : false, retry: false,
  });
  const sediPartenza = useQuery({
    queryKey: ["mappa-sedi-partenza", ...identita],
    enabled: !!company && vista === "percorso" && ambito !== "vendite",
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("hr_sedi").select("id,nome,lat,lng").eq("company_id", company!)
        .eq("attiva", true).not("lat", "is", null).not("lng", "is", null).order("nome").abortSignal(signal);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000, retry: false,
  });
  const vistaGps = vista === "timbrature";
  const gps = useQuery({
    queryKey: ["mappa-timbrature-gps", ...identita, giorno, vistaGps],
    enabled: !!company && !!user?.id && ambito !== "vendite" && vistaGps,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mappa_timbrature_gps", {
        p_company: company!, p_giorno: giorno, p_personale: personale || ambito === "campo",
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
    gcTime: 0, retry: false,
  });
  const mezzi = useMezziMappa(company, user?.id, giorno, personale, vistaMezzi);
  const { visibili: mezziVisibili, pin: pinMezzi, inMappa: mezziInMappa } = usePinMezziMappa(
    mezzi.data?.elenco, preferenze, preferenze.mezzoScelto);
  const soloAttrezzature = mezziVisibili.length > 0 && mezziVisibili.every(m => m.attrezzatura);
  const tipoRisorse = soloAttrezzature ? ["attrezzatura", "attrezzature"] :
    mezziVisibili.some(m => m.attrezzatura) ? ["risorsa", "risorse"] : ["mezzo", "mezzi"];
  const effettivi = useQuery({
    queryKey: [...viaggiKey(company ?? ""), "mappa-km", user?.id, ambito, personale, giorno], enabled: !!company && !vistaMezzi,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mappa_km_effettivi", {
        p_company: company!, p_giorno: giorno, p_personale: personale,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const vedeViaggi = ambito === "campo" || !!registroMezzi;
  const incompleti = useQuery({
    queryKey: [...viaggiKey(company ?? ""), "mappa-km-da-registrare", user?.id, ambito, personale, giorno],
    enabled: !!company && vedeViaggi && !vistaMezzi,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mappa_km_da_registrare", {
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
    void servizioMappa(company, ambito, { azione: "vista", tile: fonteCartografica !== "leaflet", cartografia: fonteCartografica })
      .then(() => setTilesConfermati(firma))
      .catch(e => { if (fonteCartografica !== "leaflet") setErroreTiles((e as Error).message); });
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
        id: v.id + "-assegnati", inizio: v.inizio, fine: v.fine, nome: t("Assegnazione alla commessa"),
        risorse: [...new Map(aggiuntivi.flatMap((r): Risorsa[] => [
          { id: r.employee_id ?? r.user_id, nome: r.nome!, tipo: "operaio" },
          ...(r.mezzo && r.mezzo_id ? [{ id: r.mezzo_id, nome: r.mezzo, tipo: "mezzo" as const }] : []),
        ]).map(r => [idRisorsa(r), r])).values()],
      });
      if (!correzione || v.escluso) return { ...v, attivita };
      return { ...v, attivita, punto: { lat: correzione.lat, lng: correzione.lng }, motivo: undefined };
    });
  }, [voci, posizioni.data, assegnati.data, t]);
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
    return ordineTappe(filtrate);
  }, [mappate, state.cantiere, state.risorsa, state.stato]);
  const pinGiornata = useMemo(() => {
    let numero = 0;
    return filtrate.flatMap(v => v.punto && !v.escluso
      ? [{ id: v.id, titolo: v.titolo, punto: v.punto, numero: ambito === "vendite" ? ++numero : undefined }] : []);
  }, [filtrate, ambito]);

  const gruppi = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const v of mappate) {
      if (v.escluso) continue;
      const tutti = v.attivita.flatMap(a => a.risorse);
      for (const r of tutti) {
        const chiave = idRisorsa(r);
        if (state.risorsa && chiave !== state.risorsa) continue;
        if (!state.risorsa && r.tipo === "operaio" && tutti.some(a => a.tipo === "squadra")) continue;
        mappa.set(chiave, r.nome);
      }
    }
    return [...mappa].sort(([, a], [, b]) => a.localeCompare(b, "it"));
  }, [mappate, state.risorsa]);
  const gruppo = gruppi.some(([key]) => key === trattaGruppo) ? trattaGruppo : gruppi[0]?.[0] ?? "";
  const impegni = useMemo(() => tappeOperative(filtrate, a =>
    gruppo ? a.risorse.some(r => idRisorsa(r) === gruppo) : personale), [filtrate, gruppo, personale]);
  const impegniCompleti = useMemo(() => tappeOperative(mappate, a =>
    gruppo ? a.risorse.some(r => idRisorsa(r) === gruppo) : personale), [mappate, gruppo, personale]);
  const giroFiltrato = (!!state.cantiere || !!state.stato) && impegni.length < impegniCompleti.length;
  const puoUsarePartenzaPersonale = ambito === "vendite" && !!user?.id && gruppo === `commerciale:${user.id}`;
  const chiaveBase = JSON.stringify([identita, giorno, gruppo]);
  const sceltaBase = scelteBase[chiaveBase];
  const baseCalendario = puoUsarePartenzaPersonale ? impegni[0]?.voce?.base : null;
  const basePersonale = puoUsarePartenzaPersonale ? sceltaBase?.personale : null;
  const basi = useMemo(() => {
    const voci: BasePercorso[] = (sediPartenza.data ?? []).flatMap(s => {
      const punto = coordinate(s.lat, s.lng);
      return punto ? [{ id: s.id, nome: s.nome, punto }] : [];
    });
    const sedeOperativa = sede && coordinate(sede.lat, sede.lng);
    if (sedeOperativa) voci.unshift({ id: "sede", nome: t("Sede operativa"), punto: sedeOperativa });
    if (baseCalendario) voci.unshift({ id: "calendario", nome: t("Base del commerciale"), punto: baseCalendario });
    if (basePersonale) voci.push({ id: "personale", nome: t("Partenza personale"), punto: basePersonale });
    return voci;
  }, [sediPartenza.data, sede, baseCalendario, basePersonale, t]);
  const base = sceltaBase?.id == null ? basi.find(s => s.id === "calendario" || s.id === "sede") : basi.find(s => s.id === sceltaBase.id);
  const aggiornaBase = (patch: Partial<SceltaBase>) => setPreferenze(p => ({
    ...p, scelteBase: { ...p.scelteBase, [chiaveBase]: { ...p.scelteBase[chiaveBase], ...patch } },
  }));
  const sceltaRientro = sceltaBase?.rientro ?? (base ? "partenza" : "");
  const baseRientro = sceltaRientro === "partenza" ? base : basi.find(s => s.id === sceltaRientro);
  const tappe = useMemo((): TappaOperativa[] => {
    if (!impegni.length) return impegni;
    const partenza: TappaOperativa[] = base ? [{ id: "partenza", titolo: base.id === "personale" ? base.nome : `${t("Partenza")} · ${base.nome}`,
      punto: base.punto, inizio: null, fine: null }] : [];
    const rientro: TappaOperativa[] = baseRientro ? [{ id: "rientro", titolo: `${t("Rientro")} · ${baseRientro.nome}`,
      punto: baseRientro.punto, inizio: null, fine: null }] : [];
    return [...partenza, ...impegni, ...rientro];
  }, [base, baseRientro, impegni, t]);
  const attesaPunti = Boolean(loading || (ids.length && posizioni.isLoading));
  const attesaPercorso = attesaPunti || sediPartenza.isLoading || assegnati.isLoading;
  const haPartenza = tappe[0]?.id === "partenza";
  const haRientro = tappe.at(-1)?.id === "rientro";
  const problemi = filtrate.map(voce => ({ voce, ...problemiVoce(voce) }));
  const posizioniDaCompletare = problemi.filter(v => v.posizione).length;
  const orariDaCompletare = problemi.filter(v => v.orario).length;
  const daSistemare = problemi.filter(p => p.posizione || p.orario);
  const attivitaDaMostrare = daSistemare.filter(p => filtroProblemi === "tutti" ||
    (filtroProblemi === "posizioni" && p.posizione) || (filtroProblemi === "orari" && p.orario));
  const firma = JSON.stringify([identita, giorno, gruppo, profilo, tappe.map(t => [t.id, t.punto, t.inizio, t.fine]), base?.id, baseRientro?.id]);
  const calcoloAttuale = lavoro?.firma === firma && !lavoro.signal?.aborted ? lavoro : null;
  const routing = calcoloAttuale?.inCorso ?? false;
  const percorso = calcoloAttuale?.dati ?? (esitoPercorso?.firma === firma ? esitoPercorso.dati : undefined);
  useEffect(() => () => {
    if (calcoloInCorso.current?.firma === firma) {
      calcoloInCorso.current.controller.abort();
      calcoloInCorso.current = null;
    }
  }, [firma]);
  const pinTappe = useMemo((): Pin[] => tappe.flatMap((t, i) => t.punto ? [{ id: t.id, titolo: t.titolo, punto: t.punto, numero: t.voce ? i + (haPartenza ? 0 : 1) : undefined,
    avviso: percorso?.fuoriCopertura.includes(i),
    ...(t.voce ? {} : { tipo: "base" as const, etichetta: t.id === "partenza" ? "P" : "R" }),
  }] : []), [tappe, haPartenza, percorso]);
  const timbrature = vistaGps ? (gps.data ?? []).slice(0, 500) : [];
  const personeGps = new Map(timbrature.flatMap(ev => ev.persona_id ? [[ev.persona_id, ev.nome ?? t("Operaio")] as const] : []));
  const filtroPersonaGps = personeGps.has(personaGps) ? personaGps : "";
  const timbratureVisibili = timbrature.filter(t => !filtroPersonaGps || t.persona_id === filtroPersonaGps);
  const pinGps: Pin[] = timbratureVisibili.flatMap(ev => {
    const punto = coordinate(ev.lat, ev.lng);
    return punto ? [{ id: ev.id, punto, tipo: "gps", etichetta: dettagliTimbratura(ev.tipo).simbolo,
      titolo: `${partiNelFuso(ev.ora).ora} · ${ev.nome ?? t("Operaio")} · ${t(dettagliTimbratura(ev.tipo).label)}`,
    }] : [];
  });
  const pinProblemi = vista === "problemi" ? new Set(attivitaDaMostrare.map(({ voce }) => voce.id)) : null;
  const pin = vistaMezzi ? pinMezzi : vistaGps ? pinGps : vista === "percorso" ? pinTappe : pinProblemi ? pinGiornata.filter(p => pinProblemi.has(p.id)) : pinGiornata;
  const numeriGiornata = new Map(pinGiornata.map(p => [p.id, p.numero]));
  const presenzePerCantiere = new Map<string, NonNullable<typeof presenze.data>>();
  for (const presenza of presenze.data ?? []) {
    const eventi = presenzePerCantiere.get(presenza.order_id) ?? [];
    eventi.push(presenza);
    presenzePerCantiere.set(presenza.order_id, eventi);
  }
  const viaggiDaSistemare = incompleti.data ?? [];
  const mostraViaggi = vedeViaggi && (filtroProblemi === "tutti" || filtroProblemi === "viaggi");
  const viaggiDaMostrare = mostraViaggi ? viaggiDaSistemare : [];
  const caricamentoViaggi = mostraViaggi && incompleti.isPending;
  const tratte = riepilogoPercorso(tappe, percorso?.tratte ?? []);
  const linee = useMemo((): LineaPercorso[] => {
    if (!percorso) return nessuna;
    const panoramiche = percorso.panoramiche.map(punti => ({ punti, colore: "#475569", titolo: t("Tracciato complessivo") }));
    const dettagli = percorso.geometrieTratte.flatMap((punti, indice): LineaPercorso[] => {
      if (punti.length < 2) return [];
      const aspetto = aspettoTratta(indice, tappe[indice + 1]?.id === "rientro");
      return [{ ...aspetto, punti, indice, titolo: `${aspetto.rientro ? t("Rientro") : t("Tratta {n}", { n: indice + 1 })} · ${nomeTappa(tappe[indice], t)} → ${nomeTappa(tappe[indice + 1], t)}` }];
    });
    return [...panoramiche, ...dettagli];
  }, [percorso, tappe, t]);
  const indiceTratta = trattaScelta?.firma === firma ? trattaScelta.indice : null;
  const mostraTratta = useCallback((indice: number) => {
    setPreferenze(p => ({ ...p, trattaScelta: { firma, indice } }));
    setElencoAperto(true);
    requestAnimationFrame(() => {
      const riga = riferimentiTratte.current.get(indice);
      riga?.scrollIntoView({ block: "nearest" });
      riga?.focus({ preventScroll: true });
    });
  }, [firma, setPreferenze]);
  const selezioneTappa = tappe.find(t => t.id === tappaScelta && (t.voce?.id ?? null) === state.id)
    ?? tappe.find(t => t.voce?.id === state.id);
  const selezione = vistaMezzi ? preferenze.mezzoScelto : vistaGps ? gpsScelto : vista === "percorso" ? selezioneTappa?.id ?? null : state.id;
  const criticita = tratte.filter(t => t.conflitto || (percorso && !routing && !t.tratta));
  const selezionaRiga = useCallback((id: string | null) => {
    if (vista === "mezzi") {
      setPreferenze(p => ({ ...p, mezzoScelto: id?.replace(/^meta:/, "") ?? null }));
      return;
    }
    if (vista === "timbrature") { setGpsScelto(id); return; }
    const tappa = vista === "percorso" ? tappe.find(t => t.id === id) : undefined;
    setPreferenze(p => ({ ...p, tappaScelta: tappa?.id ?? null }));
    onState({ id: vista === "percorso" ? tappa?.voce?.id ?? null : id });
  }, [onState, setPreferenze, tappe, vista]);
  const aggiornaSelezione = useCallback((id: string) => {
    setElencoAperto(true);
    selezionaRiga(id);
    requestAnimationFrame(() => {
      const riga = righe.current.get(vistaMezzi ? id.replace(/^meta:/, "") : id);
      riga?.scrollIntoView({ block: "nearest" });
      riga?.focus({ preventScroll: true });
    });
  }, [selezionaRiga, vistaMezzi]);

  const calcola = async () => {
    if (!company || attesaPercorso || tappe.length < 2 || calcoloInCorso.current?.firma === firma) return;
    calcoloInCorso.current?.controller.abort();
    const controller = new AbortController();
    const { signal } = controller;
    calcoloInCorso.current = { firma, controller };
    preferisci({ vista: "percorso", trattaScelta: null });
    setElencoAperto(true);
    setLavoro({ firma, inCorso: true, signal });
    try {
      const dati = await calcolaPercorso(company, ambito, tappe, profilo, {
        signal, onParziale: parziale => setLavoro({ firma, inCorso: true, signal, dati: parziale }),
      });
      if (signal.aborted) return;
      if (dati.tratte.some(Boolean)) salvaGiro({ firma, dati });
      setLavoro({ firma, inCorso: false, dati });
      if (consumo && vediConsumo) void conteggi.refetch();
    } catch {
      if (!signal.aborted) setLavoro({ firma, inCorso: false, errore: t("Calcolo interrotto. Riprova.") });
    } finally {
      if (calcoloInCorso.current?.controller === controller) calcoloInCorso.current = null;
    }
  };
  const cambiaData = (data: string) => {
    if (!data) return;
    setDestinazione(null);
    setPosiziona(null);
    setBozza(null);
    preferisci({ personaGps: "" });
    if (data !== giorno) selezionaRiga(null);
    onGiorno(data);
  };
  const scorriAlleAzioni = () => requestAnimationFrame(() => areaAzioni.current?.scrollIntoView({ block: "nearest" }));
  const avviaPosizione = (voce: VoceMappa | "destinazione" | "partenza") => {
    setPosiziona(voce);
    setBozza(voce === "partenza" ? sceltaBase?.personale ?? null : voce === "destinazione" ? null : voce.punto);
    setDestinazione(null);
    scorriAlleAzioni();
  };
  const salvaPosizione = (punto: Coordinate, indirizzo?: string) => {
    if (posiziona === "destinazione") setDestinazione({ punto, titolo: indirizzo || t("Posizione confermata"), indirizzo });
    else if (posiziona === "partenza" && puoUsarePartenzaPersonale) aggiornaBase({ id: "personale", personale: punto, rientro: sceltaRientro === "partenza" ? "" : sceltaRientro });
    else {
      void queryClient.invalidateQueries({ queryKey: ["mappa-posizioni", company, user?.id] });
      if (ambito === "lavori") void queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.storicoMappa(company) });
    }
    setPosiziona(null);
    setBozza(null);
  };
  const viaggi = effettivi.data ?? viaggiVuoti;
  const posa = posiziona && typeof posiziona !== "string" ? posiziona : undefined;
  const chiudiPosizione = () => { setPosiziona(null); setBozza(null); };
  const cambiaVista = (v: Vista) => {
    preferisci({ vista: v });
    setGpsScelto(null);
    chiudiPosizione();
  };
  const valoriTratte = percorso?.tratte ?? [];
  const totali = valoriTratte.reduce((totale, t) => ({
    metri: totale.metri + (t?.metri ?? 0), secondi: totale.secondi + (t?.secondi ?? 0),
  }), { metri: 0, secondi: 0 });
  const ultimaTratta = haRientro ? valoriTratte.at(-1) : null;
  const stimaArrivo = haRientro ? stimaRientro(impegni, valoriTratte, haPartenza) : null;
  const arrivoRientro = stimaArrivo?.arrivoMinuti;
  const opzioniTeam = ambito !== "vendite";
  if (!company) return null;

  const riga = (v: VoceMappa, numero?: number, id = v.id) => {
    const attivo = selezione === id;
    const eventiCantiere = presenzePerCantiere.get(v.id) ?? [];
    const assegnazioni = v.attivita.flatMap(a => a.risorse);
    const utentiVisita = new Set(assegnazioni.filter(r => r.tipo === "operaio" &&
      (!gruppo.startsWith("operaio:") || idRisorsa(r) === gruppo)).map(r => r.id));
    if (personale && user?.id && (ambito === "campo" || !utentiVisita.size)) utentiVisita.add(user.id);
    for (const assegnato of assegnati.data ?? []) {
      if (v.id !== assegnato.order_id) continue;
      if (utentiVisita.has(assegnato.employee_id ?? assegnato.user_id)) utentiVisita.add(assegnato.user_id);
    }
    const eventi = vista === "percorso" && v.tipo === "cantiere"
      ? timbratureDellaVisita(eventiCantiere, v, giorno, utentiVisita) : eventiCantiere;
    const ultimo = eventi.at(-1);
    const tipoRisorsa = opzioniTeam ? (assegnazioni.some(r => r.tipo === "squadra") ? "squadra" : "operaio") : "commerciale";
    const nomi = [...new Set(assegnazioni.filter(r => r.tipo === tipoRisorsa).map(r => r.nome))];
    const riepilogoNomi = [...nomi.slice(0, 2), ...(nomi.length > 2 ? [`+${nomi.length - 2}`] : [])].join(", ");
    const { posizione, orario } = problemiVoce(v);
    const avvisi = [posizione, orario ? "Orario da completare" : ""].filter(Boolean);
    return <article className={attivo ? "bg-primary/5" : undefined}>
      <button ref={el => { if (el) righe.current.set(id, el); else righe.current.delete(id); }} type="button"
        onClick={() => selezionaRiga(attivo ? null : id)} aria-expanded={attivo}
        className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-ring">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
          {numero ?? <MapPin className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="break-words text-sm font-medium">{v.titolo}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{fascia(v.inizio, v.fine, t)}</span>
          </span>
          <span className="block break-words text-xs text-muted-foreground">
            {[riepilogoNomi, t(etichettaStato(v.stato)), ultimo && t("{stato} alle {ora}", { stato: t(statoPresenza(ultimo.tipo)), ora: partiNelFuso(ultimo.ora).ora })].filter(Boolean).join(" · ")}
          </span>
          {!attivo && (v.motivo || v.indirizzo || avvisi.length > 0) && <span className="block truncate text-xs text-muted-foreground">{avvisi.length ? avvisi.map(avviso => t(avviso)).join(" · ") : (v.motivo && t(v.motivo)) || v.indirizzo}</span>}
        </span>
        <ChevronDown aria-hidden="true" className={`mt-1 size-3.5 shrink-0 text-muted-foreground ${attivo ? "rotate-180" : ""}`} />
      </button>
      {attivo && <div className="space-y-2 px-3 pb-3 text-xs">
        <p className="break-words text-muted-foreground">{[v.cliente, v.indirizzo || (v.motivo && t(v.motivo)) || t("Indirizzo mancante")].filter(Boolean).join(" · ")}</p>
        {avvisi.some(avviso => avviso !== "Indirizzo mancante") &&
          <p className="font-medium text-amber-800 dark:text-amber-300">{avvisi.filter(avviso => avviso !== "Indirizzo mancante").map(avviso => t(avviso)).join(" · ")}</p>}
        {v.attivita.map(a => <div key={a.id} className="rounded-md border bg-background px-2 py-1.5">
          {v.tipo === "cantiere" && <div className="font-medium">{a.nome} · {fascia(a.inizio, a.fine, t)}{a.stato && ` · ${t(etichettaStato(a.stato))}`}</div>}
          {a.risorse.map(r => <p key={idRisorsa(r)} className="mt-0.5 break-words">{r.nome} <span className="text-muted-foreground">· {r.tipo === "squadra" ? t("Squadra assegnata") : r.tipo === "mezzo" ? t("Mezzo assegnato al conducente") : t("Assegnato")}</span></p>)}
          {personale && v.tipo === "cantiere" && a.risorse.length === 0 && <p>{t("Assegnato a te")}</p>}
        </div>)}
        {eventi.map(p => <p key={`${p.user_id}:${p.ora}:${p.tipo}`} className="break-words rounded bg-emerald-50 px-2 py-1.5 text-emerald-950">
          {p.nome ?? t("Operaio")} · {t(statoPresenza(p.tipo))} · {partiNelFuso(p.ora).ora} · {p.fonte}
        </p>)}
        <div className="flex flex-wrap gap-1">
          {v.link && <Button asChild size="sm" variant="outline"><Link to={v.link}>{t("Apri commessa")} <ArrowUpRight className="size-3.5" /></Link></Button>}
          {vista === "problemi" && v.link && ambito === "lavori" && modifica && orario &&
            <Button asChild size="sm" variant="outline"><Link to={`${v.link}?tab=cantiere&vista_cantiere=cronoprogramma`}>{t("Rivedi orari")}</Link></Button>}
          {!v.link && onScheda && <Button size="sm" variant="outline" onClick={() => onScheda(v.id)}>{t("Apri scheda")} <ArrowUpRight className="size-3.5" /></Button>}
          {modifica && !v.escluso && <Button size="sm" variant="outline" onClick={() => avviaPosizione(v)}>{t("Posiziona pin")}</Button>}
          {(vendite || lavori) && v.punto && <Button size="sm" variant="outline" onClick={() => {
            setDestinazione({ titolo: v.titolo, punto: v.punto!, indirizzo: v.indirizzo, voce: v });
            setPosiziona(null);
            setBozza(null);
            scorriAlleAzioni();
          }}><Users className="size-3.5" /> {t("Chi è più vicino?")}</Button>}
        </div>
      </div>}
    </article>;
  };

  return <section className="min-w-0 space-y-3" aria-label={t("Vista Mappa operativa")}>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label={t("Giorno precedente")} onClick={() => cambiaData(dataAdiacente(giorno, -1))}><ChevronLeft className="size-4" /></Button>
        <Input className="w-36" aria-label={t("Giorno della mappa")} type="date" value={giorno} onChange={e => cambiaData(e.target.value)} />
        <Button size="icon" variant="ghost" aria-label={t("Giorno successivo")} onClick={() => cambiaData(dataAdiacente(giorno, 1))}><ChevronRight className="size-4" /></Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => cambiaData(partiNelFuso(new Date()).giorno)}>{t("Oggi")}</Button>
      {!vistaGps && !vistaMezzi && <><select aria-label={opzioniTeam ? t("Filtra squadra o operaio") : t("Filtra commerciale")} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm"
        value={state.risorsa} onChange={e => onState({ risorsa: e.target.value })}>
        <option value="">{opzioniTeam ? t("Tutte le risorse") : t("Tutti i commerciali")}</option>
        {risorse.map(([key, r]) => <option key={key} value={key}>{r.nome}{r.tipo === "squadra" ? ` · ${t("squadra")}` : r.tipo === "mezzo" ? ` · ${t("mezzo")}` : ""}</option>)}
        {state.risorsa && !risorse.some(([key]) => key === state.risorsa) && <option value={state.risorsa}>{t("Risorsa selezionata")}</option>}
      </select>
      {opzioniTeam && <select aria-label={t("Filtra cantiere")} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={state.cantiere}
        onChange={e => onState({ cantiere: e.target.value })}>
        <option value="">{t("Tutti i cantieri")}</option>
        {mappate.map(v => <option key={v.id} value={v.id}>{v.titolo}</option>)}
        {state.cantiere && !mappate.some(v => v.id === state.cantiere) && <option value={state.cantiere}>{t("Cantiere selezionato")}</option>}
      </select>}
      <select aria-label={t("Filtra stato")} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={state.stato} onChange={e => onState({ stato: e.target.value })}>
        <option value="">{t("Tutti gli stati")}</option>{stati.map(s => <option key={s} value={s}>{t(etichettaStato(s))}</option>)}
        {state.stato && !stati.includes(state.stato) && <option value={state.stato}>{t(etichettaStato(state.stato))}</option>}
      </select>
      {(vendite || lavori) && <Button variant="outline" className="ml-auto" onClick={() => avviaPosizione("destinazione")}><LocateFixed className="size-4" /> {t("Chi è più vicino?")}</Button>}</>}
    </div>

    {(erroreDati || posizioni.isError || presenze.isError || assegnati.isError) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
      {t("Alcuni dati della mappa sono temporaneamente indisponibili.")} <button className="underline" onClick={() => { onRiprova?.(); if (ids.length) void posizioni.refetch();
        if (ordini.length) { void presenze.refetch(); if (!personale && lavori) void assegnati.refetch(); } }}>{t("Riprova")}</button>
    </p>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
      <CartografiaOperativa pin={pin} selezionato={selezione} percorso={vista === "percorso" ? linee : nessuna}
        trattaSelezionata={vista === "percorso" ? indiceTratta : null} onTratta={mostraTratta}
        tileConsentito={tilesConfermati === `${company}:${user?.id}:${ambito}`} erroreTiles={erroreTiles}
        bozza={bozza} attesaPunti={vistaMezzi ? mezzi.isPending : attesaPunti}
        contesto={`${giorno}:${vista}`} inquadratura={inquadratura} onInquadratura={salvaInquadratura} onSeleziona={aggiornaSelezione} onPunto={posiziona ? setBozza : undefined} />
      <div className="min-w-0 rounded-lg border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">{vistaMezzi ? t("{n} {tipo} · {m} sulla mappa", { n: mezziVisibili.length, tipo: t(tipoRisorse[mezziVisibili.length === 1 ? 0 : 1]), m: mezziInMappa }) :
            vista === "percorso" ? t("{n} tappe · {m} sulla mappa", { n: tappe.length, m: pin.length }) :
            vista === "problemi" ? t("{n} da completare · {m} sulla mappa", { n: attivitaDaMostrare.length + viaggiDaMostrare.length, m: pin.length }) :
              vistaGps ? t("{n} timbrature sulla mappa", { n: pin.length }) : t("{n} in elenco · {m} sulla mappa", { n: filtrate.length, m: pin.length })}</span>
          <Button type="button" size="sm" variant="ghost" className="lg:hidden" aria-expanded={elencoAperto}
            onClick={() => setElencoAperto(v => !v)}>{elencoAperto ? t("Nascondi elenco") : t("Mostra elenco")}</Button>
          <div role="group" aria-label={t("Contenuto elenco mappa")} className={`w-full flex-wrap gap-1 lg:flex ${elencoAperto ? "flex" : "hidden"}`}>
            <Button type="button" size="sm" variant={vista === "giornata" ? "secondary" : "ghost"}
              aria-pressed={vista === "giornata"} onClick={() => cambiaVista("giornata")}>{t("Giornata")}</Button>
            <Button type="button" size="sm" variant={vista === "percorso" ? "secondary" : "ghost"}
              aria-pressed={vista === "percorso"} onClick={() => cambiaVista("percorso")}><Route className="size-4" /> {t("Percorso")}</Button>
            {puoVedereMezziMappa && <Button type="button" size="sm" variant={vistaMezzi ? "secondary" : "ghost"}
              aria-pressed={vistaMezzi} onClick={() => cambiaVista("mezzi")}><Truck className="size-4" /> {t("Mezzi")}</Button>}
            {opzioniTeam && <Button type="button" size="sm" variant={vistaGps ? "secondary" : "ghost"}
              aria-pressed={vistaGps} onClick={() => cambiaVista("timbrature")}><LocateFixed className="size-4" /> {t("Timbrature GPS")}</Button>}
            <Button type="button" size="sm" variant={vista === "problemi" ? "secondary" : "ghost"}
              aria-pressed={vista === "problemi"} onClick={() => cambiaVista("problemi")}>{t("Da sistemare · {n}", { n: daSistemare.length + viaggiDaSistemare.length })}</Button>
          </div>
        </div>
        <div className={`min-w-0 divide-y lg:block lg:max-h-[31rem] lg:overflow-auto ${elencoAperto ? "" : "hidden"}`}>
          {loading && !vistaGps && !vistaMezzi && <p className="p-4 text-sm text-muted-foreground" role="status">{t("Caricamento attività…")}</p>}
          {vistaMezzi && <Suspense fallback={<p className="p-4 text-sm text-muted-foreground" role="status">{t("Caricamento mezzi…")}</p>}>
            <MezziMappa mezzi={mezziVisibili} selezione={selezione} giorno={giorno} personale={personale}
              tipoMezzi={preferenze.tipoMezzi} cercaMezzi={preferenze.cercaMezzi} caricamento={mezzi.isPending} aggiornamento={mezzi.isFetching} errore={mezzi.isError} nonDisponibile={mezzi.data?.nonDisponibile}
              onRiprova={() => void mezzi.refetch()} onFiltri={preferisci} onSeleziona={selezionaRiga}
              haPercorso={id => mappate.some(v => !v.escluso && v.attivita.some(a => a.risorse.some(r => r.tipo === "mezzo" && r.id === id)))}
              onPercorso={id => {
                const risorsa = `mezzo:${id}`;
                onState({ id: null, risorsa, cantiere: "", stato: "" });
                preferisci({ vista: "percorso", trattaGruppo: risorsa, trattaScelta: null });
              }}
              registraRiga={(id, el) => { if (el) righe.current.set(id, el); else righe.current.delete(id); }} />
          </Suspense>}
          {vistaGps && <TimbratureMappa eventi={timbratureVisibili} cantieri={mappate} selezione={selezione}
            persone={personeGps} persona={filtroPersonaGps} onPersona={id => { preferisci({ personaGps: id }); setGpsScelto(null); }}
            caricamento={gps.isPending} errore={gps.isError} onRiprova={() => void gps.refetch()}
            limite={(gps.data?.length ?? 0) > 500} onSeleziona={selezionaRiga}
            registraRiga={(id, el) => { if (el) righe.current.set(id, el); else righe.current.delete(id); }} />}
          {vista === "giornata" && <>
            {!loading && !filtrate.length && <p className="p-4 text-sm text-muted-foreground">{t("Nessuna attività per la giornata e i filtri scelti.")}</p>}
            {filtrate.map(v => <div key={v.id}>{riga(v, numeriGiornata.get(v.id))}</div>)}
          </>}
          {vista === "percorso" && <section aria-label={t("Percorso pianificato")}>
            <div className="space-y-2 border-b p-3">
              <div className="flex flex-wrap items-center gap-2">
                {!!gruppi.length && <select aria-label={t("Risorsa del percorso")} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={gruppo}
                  onChange={e => { preferisci({ trattaGruppo: e.target.value }); chiudiPosizione(); }}>{gruppi.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>}
                {import.meta.env.VITE_MAPPA_OPERATIVA_FURGONE === "true" && <select aria-label={t("Profilo mezzo")} className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={profilo} onChange={e => preferisci({ profilo: e.target.value as Profilo })}><option value="auto">{t("Auto")}</option><option value="furgone">{t("Furgone")}</option></select>}
                <Button variant="outline" size="sm" onClick={() => void calcola()} disabled={routing || attesaPercorso || tappe.length < 2}>{routing ? t("Calcolo in corso…") : t("Calcola percorso")}</Button>
                {ambito === "vendite" && impegni.length > 0 && <Button variant="ghost" size="sm" onClick={async () => {
                  const righe = [t("Giro appuntamenti · {data}", { data: giorno.split("-").reverse().join("/") }),
                    ...tappe.map(tp => tp.id === "partenza" || tp.id === "rientro" ? tp.titolo : [fascia(tp.inizio,tp.fine,t), tp.titolo, tp.voce?.indirizzo].filter(Boolean).join(" · "))];
                  if (percorso && valoriTratte.some(Boolean)) {
                    righe.push(`${valoriTratte.some(tr => !tr) ? t("Totale parziale") : t("Totale stimato")} · ${formatoKm(totali.metri)} · ${Math.round(totali.secondi / 60)} min`);
                  }
                  try {
                    await navigator.clipboard.writeText(righe.join("\n"));
                    toast.success(t("Giro copiato"));
                  } catch { toast.error(t("Impossibile copiare il giro")); }
                }}><ClipboardCopy className="size-4" /> {t("Copia giro")}</Button>}
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 rounded-md bg-muted/45 p-2">
                <label className="grid min-w-0 gap-1 text-xs font-medium">
                  <span className="text-teal-800 dark:text-teal-300">{t("Partenza")}</span>
                  <select aria-label={t("Partenza")} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm font-normal" value={base?.id ?? ""}
                    onChange={e => { aggiornaBase({ id: e.target.value }); chiudiPosizione(); }}>
                    <option value="">{t("Dalla prima tappa")}</option>
                    {basi.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </label>
                {(basi.length > 0 || base) && <label className="grid min-w-0 gap-1 text-xs font-medium">
                  <span className="text-pink-800 dark:text-pink-300">{t("Rientro")}</span>
                  <select aria-label={t("Rientro")} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm font-normal"
                    value={baseRientro ? sceltaRientro : ""} onChange={e => aggiornaBase({ rientro: e.target.value })}>
                    <option value="">{t("Termina all’ultima tappa")}</option>
                    {base && <option value="partenza">{t("Stessa sede di partenza")}</option>}
                    {basi.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </label>}
                {puoUsarePartenzaPersonale && <Button className="col-span-full justify-self-start" variant="outline" size="sm" onClick={() => avviaPosizione("partenza")}>
                  <MapPin className="size-3.5" /> {sceltaBase?.personale ? t("Modifica partenza personale") : t("Imposta partenza personale")}
                </Button>}
              </div>
              {sediPartenza.isError && <p role="alert" className="text-xs text-muted-foreground">{t("Altre sedi temporaneamente indisponibili.")}{" "}
                <button type="button" className="underline" onClick={() => void sediPartenza.refetch()}>{t("Riprova")}</button></p>}
              {!percorso && <p className="text-xs text-muted-foreground">{tappe.length < 2 ? t("Percorso non calcolabile") :
                haRientro ? t("Il totale include il rientro a {nome}.", { nome: baseRientro?.nome ?? "" }) :
                  haPartenza ? t("Il totale va dalla partenza all’ultima tappa.") : t("Totale tra le tappe della giornata.")}</p>}
              {giroFiltrato && <div className="flex flex-wrap items-center justify-between gap-1 rounded-md border px-2 py-1 text-xs">
                <span>{t("{n} di {totale} visite incluse", { n: impegni.length, totale: impegniCompleti.length })}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => onState({ cantiere: "", stato: "" })}>{t("Mostra giro completo")}</Button>
              </div>}
              {!!criticita.length && <Button type="button" size="sm" variant="outline"
                onClick={() => {
                  const attuale = criticita.findIndex(t => t.a.id === selezione);
                  aggiornaSelezione(criticita[(attuale + 1) % criticita.length].a.id);
                }}>{criticita.length === 1 ? t("Vai alla criticità") : t("Scorri {n} criticità", { n: criticita.length })}</Button>}
              {calcoloAttuale?.errore && <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">{calcoloAttuale.errore}</p>}
              {percorso && <div aria-live="polite" className="space-y-2 text-sm">
                <p className="font-semibold">{valoriTratte.some(Boolean) ? `${routing ? (calcoloAttuale?.dati ? t("Totale parziale · in calcolo") : t("Ultima stima · aggiornamento in corso")) : giroFiltrato ? (valoriTratte.some(tr => !tr) ? t("Totale del giro filtrato · parziale") : t("Totale del giro filtrato")) :
                  valoriTratte.some(tr => !tr) ? t("Totale parziale") : t("Totale stimato")} · ${formatoKm(totali.metri)} · ${Math.round(totali.secondi / 60)} min` : t("Stima stradale non disponibile")}</p>
                {haRientro && <dl className="space-y-1 rounded-md border px-2 py-1.5 text-xs">
                  {valoriTratte.slice(0, -1).some(Boolean) && <div className="flex flex-wrap justify-between gap-x-2">
                    <dt>{valoriTratte.slice(0, -1).some(tr => !tr) ? t("Fino all’ultima tappa · parziale") : t("Fino all’ultima tappa")}</dt>
                    <dd className="font-medium tabular-nums">{t("{km} · {minuti} min", { km: formatoKm(totali.metri - (ultimaTratta?.metri ?? 0)), minuti: Math.round((totali.secondi - (ultimaTratta?.secondi ?? 0)) / 60) })}</dd>
                  </div>}
                  <div className="flex flex-wrap justify-between gap-x-2 text-pink-800 dark:text-pink-300">
                    <dt className="break-words">{t("Rientro a {nome}", { nome: baseRientro?.nome ?? "" })}</dt>
                    <dd className="font-medium tabular-nums">{ultimaTratta ? t("{km} · {minuti} min", { km: formatoKm(ultimaTratta.metri), minuti: Math.round(ultimaTratta.secondi / 60) }) : t("Stima non disponibile")}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-muted-foreground">
                    <dt>{arrivoRientro != null ? t("Arrivo stimato in sede") : t("Arrivo in sede da verificare")}</dt>
                    {arrivoRientro != null && <dd className="tabular-nums">{oraDaMinuti(arrivoRientro)}{arrivoRientro >= 1440 ? ` (+${Math.floor(arrivoRientro / 1440)} g)` : ""}</dd>}
                    {arrivoRientro == null && <dd>{t("Completa orari e tratte del giro")}</dd>}
                  </div>
                  {!!stimaArrivo?.ritardoMinuti && <div className="flex justify-between gap-2 text-amber-800 dark:text-amber-300">
                    <dt>{t("Ritardi inclusi nel rientro")}</dt><dd className="tabular-nums">{t("+{ritardoMinuti} min", { ritardoMinuti: String(stimaArrivo.ritardoMinuti ?? "") })}</dd>
                  </div>}
                </dl>}
                {!!linee.length && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("Percorso su strada · OSRM")}</span>
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
                  {indiceTratta != null && <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => preferisci({ trattaScelta: null })}>{t("Tutte le tratte")}</Button>}
                </div>}
                {percorso.errori.map(e => <p key={e} className="text-xs text-amber-800 dark:text-amber-300">{e}</p>)}
              </div>}
            </div>
            <ol className="divide-y">
              {tappe.map((tp, i) => {
                const pinDaVerificare = percorso?.fuoriCopertura.includes(i);
                const voce = tp.voce;
                const segmento = tratte[i - 1];
                const aspetto = aspettoTratta(Math.max(0, i - 1), tp.id === "rientro");
                const lineaDisponibile = (percorso?.geometrieTratte[i - 1]?.length ?? 0) >= 2;
                const attiva = indiceTratta === i - 1;
                const etichettaTratta = aspetto.rientro ? t("Rientro") : t("Tratta {n}", { n: Math.max(0, i - 1) + 1 });
                const etichetta = segmento ? `${etichettaTratta} · ${nomeTappa(segmento.da, t)} → ${nomeTappa(segmento.a, t)}` : "";
                return <li key={tp.id}>
                  {segmento && (percorso || segmento.conflitto) && <div className="mx-3 my-1 rounded-md border-l-[3px] bg-muted/40"
                    style={{ borderLeftColor: aspetto.colore, borderLeftStyle: aspetto.rientro ? "dashed" : "solid" }}>
                    {percorso && <button type="button" ref={el => { if (el) riferimentiTratte.current.set(i - 1, el); else riferimentiTratte.current.delete(i - 1); }}
                      disabled={!lineaDisponibile} aria-pressed={attiva} aria-label={etichetta}
                      onClick={() => preferisci({ trattaScelta: attiva ? null : { firma, indice: i - 1 } })}
                      className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-r-md px-2 py-1.5 text-left text-xs hover:enabled:bg-muted aria-pressed:bg-primary/10">
                      <span className="font-semibold">{etichettaTratta}</span>
                      <span className="tabular-nums">{segmento.tratta ? t("{km} · {minuti} min", { km: formatoKm(segmento.tratta.metri), minuti: Math.round(segmento.tratta.secondi / 60) }) :
                        percorso.problemiTratte[i - 1] === "fuori_copertura" ? t("Verifica la copertura dei pin") :
                          percorso.problemiTratte[i - 1] === "nessun_percorso" ? t("Collegamento stradale assente") : t("Tratta mancante")}</span>
                      <span className="w-full break-words text-muted-foreground">{nomeTappa(segmento.da, t)} → {nomeTappa(segmento.a, t)}</span>
                    </button>}
                    {segmento.conflitto && <p className="px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">{segmento.conflitto}
                      {!!segmento.ritardoMinuti && ` · ${t("+{n} min stimati", { n: segmento.ritardoMinuti })}`}</p>}
                  </div>}
                  {pinDaVerificare && <p className="mx-3 mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {t("Pin fuori copertura")} · {nomeTappa(tp, t)}
                  </p>}
                  {voce ? riga({ ...voce, inizio: tp.inizio, fine: tp.fine }, i + (haPartenza ? 0 : 1), tp.id) :
                    <button type="button" ref={el => { if (el) righe.current.set(tp.id, el); else righe.current.delete(tp.id); }}
                      aria-pressed={selezione === tp.id} onClick={() => selezionaRiga(tp.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 aria-pressed:bg-primary/5">
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${tp.id === "rientro" ? "bg-pink-100 text-pink-900" : "bg-teal-100 text-teal-900"}`}>{tp.id === "partenza" ? "P" : "R"}</span>
                      {tp.titolo}
                    </button>}
                </li>;
              })}
            </ol>
          </section>}
          {vista === "problemi" && <>
            <div className="flex flex-wrap gap-1 p-2" role="group" aria-label={t("Tipo di criticità")}>
              {([
                ["tutti", "Tutte", daSistemare.length + viaggiDaSistemare.length],
                ["posizioni", "Posizioni", posizioniDaCompletare],
                ["orari", "Orari", orariDaCompletare],
                ["viaggi", "Km", viaggiDaSistemare.length],
              ] as const).filter(([id]) => id !== "viaggi" || vedeViaggi).map(([id, titolo, numero]) => <Button key={id} type="button" size="sm"
                variant={filtroProblemi === id ? "secondary" : "ghost"} aria-pressed={filtroProblemi === id} onClick={() => preferisci({ filtroProblemi: id })}>
                {t(titolo)} <span className={filtroProblemi === id ? "opacity-85" : "text-muted-foreground"}>{numero}</span>
              </Button>)}
            </div>
            {mostraViaggi && incompleti.isError && <p role="alert" className="px-3 py-2 text-xs">{t("Viaggi da completare temporaneamente non disponibili.")}{" "}
              <button type="button" className="underline" onClick={() => void incompleti.refetch()}>{t("Riprova")}</button></p>}
            {caricamentoViaggi && <p role="status" className="p-3 text-sm text-muted-foreground">{t("Caricamento viaggi…")}</p>}
            {!loading && !caricamentoViaggi && !attivitaDaMostrare.length && !viaggiDaMostrare.length && <p className="p-3 text-sm text-muted-foreground">{t("Nessun elemento da completare con questi filtri.")}</p>}
            {attivitaDaMostrare.map(({ voce }) => <div key={voce.id}>{riga(voce)}</div>)}
            {viaggiDaMostrare.map(v => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div><p className="font-medium">{v.mezzo}</p><p className="text-xs text-muted-foreground">{partiNelFuso(v.partenza).ora} · {t("Km da registrare")}</p></div>
              <Button asChild size="sm" variant="outline"><Link to={ambito === "campo"
                ? `/campo/mezzi?mezzo=${v.mezzo_id}&rivedi=${v.id}&giorno=${giorno}`
                : `/azienda/mezzi/${v.mezzo_id}?tab=viaggi&giorno=${giorno}&viaggio=${v.id}`}>{t("Apri viaggio")}</Link></Button>
            </div>)}
          </>}
        </div>
        {!!posa && posa.id === state.id && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">{t("Posizionamento in corso")}</p>}
      </div>
    </div>

    <div ref={areaAzioni} className={(posiziona || destinazione) ? "space-y-2" : "hidden"}>
      {posiziona && <PosizioneOperativa key={posa?.id ?? posiziona.toString()} company={company} ambito={ambito} voce={posa} partenza={posiziona === "partenza"}
        punto={bozza} onPunto={setBozza} onSalva={salvaPosizione} onChiudi={chiudiPosizione} />}
      {destinazione && <PianificaIntervento key={`${giorno}:${destinazione.voce?.id ?? "destinazione"}:${destinazione.punto.lat}:${destinazione.punto.lng}`}
        company={company} ambito={ambito} giorno={giorno} nomeDestinazione={destinazione.titolo} meta={destinazione.punto}
        escludi={destinazione.voce?.tipo === "appuntamento" ? destinazione.voce.id : undefined}
        vendite={vendite} lavori={lavori} onChiudi={() => setDestinazione(null)}
        puoProporre={(tipo, id) => !!puoProporre?.(tipo, id, destinazione.voce)}
        onProposta={onProposta ? proposta => onProposta(proposta, destinazione) : undefined} />}
      {destinazione && nuovo && <Button variant="outline" onClick={nuovo}>{t("Nuovo appuntamento")}</Button>}
    </div>

    {!vistaMezzi && <div className="max-w-xl">
      <section className="min-w-0 space-y-2 rounded-lg border bg-card p-3" aria-label={t("Km effettivi registrati")}>
        <h3 className="font-medium">{t("Km effettivi registrati")}</h3>
        {effettivi.isPending ? <p className="text-sm text-muted-foreground">{t("Caricamento viaggi…")}</p> :
          effettivi.isError ? <p className="text-sm text-muted-foreground">{t("Registro temporaneamente non disponibile.")}</p> :
          viaggi.length ? <>
            <p className="text-sm font-medium tabular-nums">{formatoKm(kmDocumentati(viaggi))} · {t("viaggi partiti nel giorno selezionato")}</p>
            {viaggi.map(v => <p key={v.id} className="break-words text-xs text-muted-foreground">
              {v.mezzo} · {partiNelFuso(v.partenza).ora} · {formatoKm(v.metri)} · {v.fonte}
            </p>)}
          </> : <p className="text-sm text-muted-foreground">{t("Da registrare")}</p>}
        {registroMezzi && <Button asChild variant="link" className="h-auto px-0"><Link to="/azienda/manodopera?tab=mezzi">{t("Apri registro mezzi")}</Link></Button>}
      </section>
    </div>}
    {consumo && <details onToggle={e => setVediConsumo(e.currentTarget.open)} className="rounded-lg border bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{t("Consumo cartografico del mese")}</summary>
      {conteggi.isError && <p className="mt-2 text-xs">{t("Conteggi non disponibili.")}</p>}
      {conteggi.data?.map(c => <p key={`${c.provider}:${c.voce}`} className="mt-1 text-xs">{c.provider.replaceAll("_", " ")} · {c.voce.replaceAll("_", " ")} · {Number(c.unita).toLocaleString(intlCampo())}</p>)}
    </details>}
  </section>;
}
