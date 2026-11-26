/**
 * Programmazione della giornata (Commesse → Programmazione, 26/11/2026).
 *
 * La sera si prepara il giorno dopo: a sinistra chi c'è (squadre, persone,
 * mezzi), a destra gli interventi. Si trascina, oppure si tocca una persona e
 * poi l'intervento. Una persona può stare in più interventi (geometra,
 * manutentore, pose in fila); da un intervento all'altro si sposta, con ⌥/Alt
 * si copia, sull'elenco si toglie.
 *
 * Per ora la giornata vive in questo browser: salvataggio e pubblicazione
 * verso l'app di cantiere arrivano col passo successivo.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, Copy, Crown, FileText, HardHat, LayoutGrid, Map as MapIcon, MapPin, MoreHorizontal, Plus,
  ShieldAlert, UserRound, Undo2, Redo2, Wand2, Printer, MessageCircle, Package, ShoppingCart, ArrowRight, Eye, CalendarClock,
  Columns3, Building2, Award, Phone,
  RotateCcw, Ruler, Search, Send, Trash2, Truck, Users, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { oggiRoma } from "@/hooks/useOperai";
import { RiepilogoCommessa, RiepilogoFase } from "@/components/programmazione/RiepiloghiProgrammazione";
import {
  chiaveMeteo, leggiBozza, useBozzaGiornata, useGiornatePreparate, useCercaCommesse, useFasiCommesse, useMeteoPunti, usePuntiCommesse, type FaseGiorno, type GiornataServer, type StatoSalvataggio,
} from "@/hooks/useProgrammazioneGiornata";
import { weatherCodeToLabel, type WeatherDay } from "@/hooks/useWeatherForecast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VistaPersone from "@/components/programmazione/VistaPersone";
import VistaGiorno from "@/components/programmazione/VistaGiorno";
import SalvaComeSquadra from "@/components/programmazione/SalvaComeSquadra";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import VistaSettimana from "@/components/programmazione/VistaSettimana";
import { FoglioStampa, MessaggiSenzaApp, PortaADomani, RiempiBuchi } from "@/components/programmazione/DialoghiProgrammazione";
import { IconaMeteo } from "@/components/programmazione/IconaMeteo";
import { coloreIntervento, TONO_SERA } from "@/components/programmazione/aspetto";
import { orarioDopoTrascinamento } from "@/lib/programmazione/calendarioGiorno";
import {
  aggiorna, aggiungiMinuti, aggiungiSquadra, leggiOrario, avvisi as calcolaAvvisi, conteggi, copiaGiornata, documentiScaduti, esitoSera,
  giorniLavorativiDopo, ripetiSuGiorni, proponiRiempimento, capoMancante, spostaGruppo, unisciIntervento, ABILITAZIONI, type EsternoGiorno, type MerceGiorno,
  type Suggerimento, type EsitoSera, type Giornata, type Punto, interventoDaCommessa, nuovoId, sposta,
  commissioniAgganciate, giornoDelCantiere, spostaGiorno, testoGiornoCantiere, togliIntervento, type Avviso, type CommessaGiorno, type Intervento, type MezzoGiorno, type PersonaGiorno, type SquadraGiorno,
} from "@/lib/programmazione/giornata";

const VistaMappa = lazy(() => import("@/components/programmazione/VistaMappa"));

type Vista = "cantieri" | "giorno" | "persone" | "settimana" | "mappa";

type Trascinato =
  | { kind: "persona"; id: string; da: string | null }
  | { kind: "mezzo"; id: string; da: string | null }
  | { kind: "squadra"; id: string; da: null }
  | { kind: "esterno"; id: string; da: string | null }
  /** I componenti di una squadra presenti in un intervento: si spostano tutti insieme. */
  | { kind: "gruppo"; id: string; da: string; persone: string[] }
  /** Un blocco del calendario del giorno: si sposta d'orario. */
  | { kind: "blocco"; id: string; da: null };

const ZONA_ELENCO = "elenco";

function etichettaGiorno(giorno: string): string {
  const oggi = oggiRoma();
  const [y, m, d] = giorno.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  if (giorno === oggi) return `Oggi, ${data}`;
  if (giorno === spostaGiorno(oggi, 1)) return `Domani, ${data}`;
  if (giorno === spostaGiorno(oggi, -1)) return `Ieri, ${data}`;
  return data.charAt(0).toUpperCase() + data.slice(1);
}

function iniziali(p: { nome: string; cognome: string }) {
  return `${p.nome?.[0] ?? ""}${p.cognome?.[0] ?? ""}`.toUpperCase() || "?";
}

function Avatar({ p, piccolo = false }: { p: PersonaGiorno; piccolo?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", piccolo ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]")}
      style={{ backgroundColor: p.colore || "#64748B" }}
    >
      {iniziali(p)}
    </span>
  );
}

/** Un elemento che si può trascinare o toccare per sceglierlo. */
function Trascinabile({ dato, children, className, scelto, onScegli }: {
  dato: Trascinato;
  children: ReactNode;
  className?: string;
  scelto?: boolean;
  onScegli?: () => void;
}) {
  const id = `${dato.kind}:${dato.id}:${dato.da ?? ZONA_ELENCO}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: dato });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onScegli?.(); }}
      className={cn(
        "touch-none select-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
        isDragging && "opacity-30",
        scelto && "ring-2 ring-orange-500 ring-offset-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Zona({ id, children, className, attiva }: { id: string; children: ReactNode; className?: string; attiva?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, (isOver || attiva) && "ring-2 ring-orange-400 ring-offset-1 bg-orange-50/60")}>
      {children}
    </div>
  );
}

export default function ProgrammazioneGiornata() {
  // Dal Calendario («Programma la giornata») si arriva con ?giorno=AAAA-MM-GG.
  const [parametri] = useSearchParams();
  const [giorno, setGiornoGrezzo] = useState(() => {
    const g = parametri.get("giorno");
    return g && /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : spostaGiorno(oggiRoma(), 1);
  });
  const naviga = useNavigate();
  const { user } = useAuth();
  const dati = useBozzaGiornata(giorno);
  const qc = useQueryClient();
  const { giornata, cambia, persone, squadre, mezzi, caricamento, errore, companyId } = dati;

  const [trascinato, setTrascinato] = useState<Trascinato | null>(null);
  const [scelto, setScelto] = useState<Trascinato | null>(null);
  const setGiorno = (v: string | ((g: string) => string)) => { setScelto(null); setGiornoGrezzo(v); };
  const alt = useRef(false);
  // Le scorciatoie leggono sempre le azioni dell'ultimo disegno.
  const tasti = useRef({ annulla: () => {}, rifai: () => {}, giorno: (_n: number) => {}, nuovo: () => {} });

  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const scrivendo = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      const mod = e.metaKey || e.ctrlKey;
      if (!scrivendo && mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) tasti.current.rifai(); else tasti.current.annulla(); return; }
      if (!scrivendo && mod && e.key.toLowerCase() === "y") { e.preventDefault(); tasti.current.rifai(); return; }
      if (!scrivendo && !mod && !e.altKey) {
        if (e.key === "ArrowLeft") { tasti.current.giorno(-1); return; }
        if (e.key === "ArrowRight") { tasti.current.giorno(1); return; }
        if (e.key === "/") { e.preventDefault(); document.getElementById("cerca-programmazione")?.focus(); return; }
        if (e.key.toLowerCase() === "n") { e.preventDefault(); tasti.current.nuovo(); return; }
      }
      alt.current = e.altKey;
      if (e.key === "Escape") setScelto(null);
    };
    const su = (e: KeyboardEvent) => { alt.current = e.altKey; };
    window.addEventListener("keydown", giu);
    window.addEventListener("keyup", su);
    return () => { window.removeEventListener("keydown", giu); window.removeEventListener("keyup", su); };
  }, []);

  const sensori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const personaDi = useMemo(() => new Map(persone.map((p) => [p.id, p])), [persone]);
  const commessaDi = useMemo(() => new Map(dati.commesse.map((c) => [c.id, c])), [dati.commesse]);
  const mezzoDi = useMemo(() => new Map(mezzi.map((m) => [m.id, m])), [mezzi]);
  const squadraDi = useMemo(() => {
    const out = new Map<string, SquadraGiorno>();
    for (const s of squadre) out.set(s.id, s);
    return out;
  }, [squadre]);
  const squadraDellaPersona = useMemo(() => {
    const out = new Map<string, SquadraGiorno>();
    for (const s of squadre) for (const c of s.componenti) out.set(c, s);
    return out;
  }, [squadre]);
  const assenti = useMemo(() => new Set(persone.filter((p) => p.assenza).map((p) => p.id)), [persone]);
  const senzaDocumenti = useMemo(() => new Set(persone.filter((p) => documentiScaduti(p, giorno)).map((p) => p.id)), [persone, giorno]);
  const [vista, setVista] = useState<Vista>("cantieri");
  const [ripeti, setRipeti] = useState(false);
  const [riempi, setRiempi] = useState<Suggerimento[] | null>(null);
  const [messaggi, setMessaggi] = useState(false);
  const [portaDomani, setPortaDomani] = useState(false);
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [salvaSquadra, setSalvaSquadra] = useState<Intervento | null>(null);
  useEffect(() => {
    tasti.current = {
      annulla: dati.annulla,
      rifai: dati.rifai,
      giorno: (n: number) => setGiorno((g) => spostaGiorno(g, n)),
      nuovo: () => setNuovoAperto(true),
    };
  });

  const fuoriCalendario = useMemo(() => [...new Set((giornata?.interventi ?? []).filter((i) => !i.punto && i.orderId && !commessaDi.has(i.orderId)).map((i) => i.orderId!))], [giornata, commessaDi]);
  const puntiExtra = usePuntiCommesse(companyId, fuoriCalendario).data;
  const puntoDi = useCallback((i: Intervento): Punto | null =>
    i.punto ?? (i.orderId ? commessaDi.get(i.orderId)?.punto ?? puntiExtra?.get(i.orderId) ?? null : null), [commessaDi, puntiExtra]);
  const punti = (giornata?.interventi ?? []).map(puntoDi).filter((x): x is Punto => !!x);
  const meteo = useMeteoPunti(punti, giorno);

  const orderIds = useMemo(() => [...new Set((giornata?.interventi ?? []).map((i) => i.orderId).filter((x): x is string => !!x))], [giornata]);
  const fasiQ = useFasiCommesse(companyId, giorno, orderIds);
  const fasiPerCommessa = useMemo(() => {
    const out = new Map<string, FaseGiorno[]>();
    for (const f of fasiQ.data ?? []) out.set(f.orderId, [...(out.get(f.orderId) ?? []), f]);
    return out;
  }, [fasiQ.data]);

  const abilitazioniDi = useMemo(() => (dati.conAbilitazioni ? new Map(persone.map((p) => [p.id, p.abilitazioni ?? []])) : undefined), [persone, dati.conAbilitazioni]);
  const elencoAvvisi = useMemo(() => (giornata ? calcolaAvvisi(giornata, assenti, senzaDocumenti, abilitazioniDi) : []), [giornata, assenti, senzaDocumenti, abilitazioniDi]);
  const esternoDi = useMemo(() => new Map(dati.esterni.map((e) => [e.id, e])), [dati.esterni]);
  const utenteAPersona = useMemo(() => new Map([...dati.utenteDi.entries()].map(([hr, u]) => [u, hr])), [dati.utenteDi]);
  const mercePerCommessa = useMemo(() => {
    const out = new Map<string, MerceGiorno[]>();
    for (const m of dati.merce) if (m.orderId && m.giorno === giorno) out.set(m.orderId, [...(out.get(m.orderId) ?? []), m]);
    return out;
  }, [dati.merce, giorno]);
  const visti = dati.server?.stato === "pubblicata" ? dati.server.visti ?? {} : {};
  // Promemoria della sera: dalle 16, se domani non è pronto (o non è pubblicato) lo si dice.
  const oggiR = oggiRoma();
  const domaniR = spostaGiorno(oggiR, 1);
  const [domaniPreparato] = useGiornatePreparate(companyId, [domaniR], dati.nelDatabase);
  const dopoLe16 = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false })) >= 16;
  const promemoria = !dopoLe16 ? null
    : giorno === oggiR && !domaniPreparato.caricamento && !domaniPreparato.giornata ? "prepara"
    : giorno === domaniR && dati.nelDatabase && dati.server?.stato !== "pubblicata" && !!giornata?.interventi.length ? "pubblica"
    : null;
  // La sera (oggi o giorni passati): previsto contro timbrature e rapportini.
  const sera = useMemo(() => {
    const conteggio: Record<EsitoSera, number> = { come_previsto: 0, presente: 0, altrove: 0, non_timbrato: 0, assente: 0 };
    let rapportini = 0;
    let confrontate = 0;
    const viste = new Set<string>();
    for (const i of giornata?.interventi ?? []) {
      for (const id of i.persone) {
        const p = personaDi.get(id);
        const e = p ? esitoSera(i, p.consuntivo) : null;
        if (!e || viste.has(`${id}:${i.orderId}`)) continue;
        viste.add(`${id}:${i.orderId}`);
        conteggio[e]++;
        confrontate++;
        if (p?.consuntivo?.rapportino) rapportini++;
      }
    }
    return confrontate ? { conteggio, rapportini, confrontate } : null;
  }, [giornata, personaDi]);
  const quanti = useMemo(() => (giornata ? conteggi(giornata) : { persone: new Map(), mezzi: new Map() }), [giornata]);

  const assegna = (d: Trascinato, a: string | null) => {
    if (d.kind === "gruppo") {
      if (a) cambia((g) => spostaGruppo(g, d.persone, d.da, a));
      else cambia((g) => d.persone.reduce((acc, p) => sposta(acc, { tipo: "persona", id: p }, d.da, null), g));
      return;
    }
    if (d.kind === "esterno") {
      cambia((g) => ({ ...g, interventi: g.interventi.map((i) => {
        let esterni = i.esterni ?? [];
        if (i.id === d.da && !alt.current) esterni = esterni.filter((x) => x !== d.id);
        if (i.id === a && !esterni.includes(d.id)) esterni = [...esterni, d.id];
        return esterni === (i.esterni ?? []) ? i : { ...i, esterni };
      }) }));
      return;
    }
    if (d.kind === "squadra") {
      const sq = squadraDi.get(d.id);
      if (sq && a) cambia((g) => aggiungiSquadra(g, sq, a, assenti));
      return;
    }
    if (d.kind === "blocco") return;
    if (d.da === null && a === null) return;
    const tipo = d.kind;
    cambia((g) => sposta(g, { tipo, id: d.id }, d.da, a, alt.current));
    if (tipo === "persona" && a && assenti.has(d.id)) {
      toast.warning(`${personaDi.get(d.id)?.nome ?? "Questa persona"} risulta ${personaDi.get(d.id)?.assenza?.toLowerCase() ?? "assente"}`);
    } else if (tipo === "persona" && a && d.da === null && senzaDocumenti.has(d.id)) {
      toast.warning(`${personaDi.get(d.id)?.nome ?? "Questa persona"} ha documenti scaduti (sicurezza, visita medica…)`, { description: "Controlla la sua scheda in Manodopera prima di mandarlo in cantiere." });
    }
  };

  const fine = (e: DragEndEvent) => {
    setTrascinato(null);
    const d = e.active.data.current as Trascinato | undefined;
    if (d?.kind === "blocco") {
      const i = giornata?.interventi.find((x) => x.id === d.id);
      const g = grigliaGiorno.current?.getBoundingClientRect();
      const partenza = e.activatorEvent as PointerEvent | null;
      const y = partenza ? partenza.clientY + e.delta.y : null;
      const x = partenza ? partenza.clientX + e.delta.x : null;
      const sullaGriglia = !!g && y != null && x != null && y >= g.top && y <= g.bottom && x >= g.left && x <= g.right;
      const patch = i ? orarioDopoTrascinamento(i, e.delta.y, y, g?.top ?? null, sullaGriglia) : null;
      if (i && patch) cambia((gg) => aggiorna(gg, i.id, patch));
      return;
    }
    if (!d || !e.over) return;
    const a = e.over.id === ZONA_ELENCO ? null : String(e.over.id);
    assegna(d, a);
  };
  const grigliaGiorno = useRef<HTMLDivElement | null>(null);
  const inizio = (e: DragStartEvent) => {
    setScelto(null);
    setTrascinato((e.active.data.current as Trascinato) ?? null);
  };

  const scegli = (d: Trascinato) => setScelto((s) => (s && s.kind === d.kind && s.id === d.id && s.da === d.da ? null : d));
  const toccaIntervento = (id: string) => {
    if (!scelto) return;
    assegna(scelto, id);
    // Una persona dall'elenco resta scelta: si può mettere in altri interventi di fila.
    if (scelto.da !== null) setScelto(null);
  };

  const copiaIeri = async () => {
    const ieri = await dati.leggiGiorno(spostaGiorno(giorno, -1));
    if (!ieri || ieri.interventi.length === 0) { toast.info("Il giorno prima non è stato preparato."); return; }
    cambia(() => copiaGiornata(ieri, giorno, assenti));
    toast.success(`Copiati ${ieri.interventi.length} interventi dal giorno prima`);
  };
  const pubblica = async () => {
    if (!dati.nelDatabase) {
      toast.info("Il salvataggio nel database non è ancora attivo: per ora la giornata resta in questo browser.", { description: "Si attiva applicando la migrazione della programmazione." });
      return;
    }
    try {
      const r = await dati.pubblica();
      if (!r) return;
      const pezzi = [
        r.avvisati ? `${r.avvisati} ${r.avvisati === 1 ? "persona avvisata" : "persone avvisate"}` : "nessun cambio da avvisare",
        r.tolti ? `${r.tolti} ${r.tolti === 1 ? "tolta dal programma" : "tolte dal programma"}` : null,
        r.senza_app ? `${r.senza_app} senza app: avvisale tu` : null,
      ].filter(Boolean);
      toast.success("Giornata pubblicata", { description: pezzi.join(" · ") });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      toast.error(err.code === "40001" ? "Qualcun altro ha cambiato la giornata" : "Pubblicazione non riuscita", {
        description: err.message,
        action: err.code === "40001" ? { label: "Ricarica", onClick: () => void dati.ricarica() } : undefined,
      });
    }
  };

  const [appenaAggiunto, setAppenaAggiunto] = useState<string | null>(null);
  // Carico/scarico in magazzino dentro la scheda del cantiere; «staccati» = aperti
  // dall'utente come scheda loro (per modificarli), finché non si cambia giorno.
  const [staccati, setStaccati] = useState<Set<string>>(() => new Set());
  const allegatiDi = useMemo(() => commissioniAgganciate(giornata?.interventi ?? []), [giornata]);
  const agganciate = new Set([...allegatiDi.values()].flat().map((c) => c.id).filter((id) => !staccati.has(id)));
  const apri = (id: string) => { setVista("cantieri"); setStaccati((s) => new Set(s).add(id)); setAppenaAggiunto(id); };
  const aggiungiCommessa = (c: Parameters<typeof interventoDaCommessa>[0]) => {
    const nuovo = interventoDaCommessa(c);
    setAppenaAggiunto(nuovo.id);
    cambia((g) => ({ ...g, interventi: [...g.interventi, nuovo] }));
  };
  const aggiungiLibero = (tipo: "manutenzione" | "altro" | "commissione", titolo: string, extra?: Partial<Intervento>) => {
    const id = nuovoId();
    setAppenaAggiunto(id);
    cambia((g) => ({
      ...g,
      interventi: [...g.interventi, {
        id, tipo, orderId: null, codice: null, titolo, indirizzo: null, faseId: null,
        inizio: null, fine: null, persone: [], capoId: null, mezzi: [], note: null, ...extra,
      }],
    }));
  };

  /** Copia l'intervento sui prossimi giorni lavorativi: n giorni, o fino alla fine prevista della commessa (al massimo 40). */
  const fissaFinoAFine = async (i: Intervento, quanti: number | "fine") => {
    const al = i.orderId ? commessaDi.get(i.orderId)?.al ?? null : null;
    const giorni = quanti === "fine" ? giorniLavorativiDopo(giorno, 40).filter((d) => !!al && d <= al) : giorniLavorativiDopo(giorno, quanti);
    if (giorni.length === 0) { toast.info("La commessa finisce oggi: niente da ripetere."); return; }
    const ultimo = giorni[giorni.length - 1];
    const lunghe = new Set(assenti);
    const giornate: Giornata[] = [];
    for (const d of giorni) {
      const base = (await dati.leggiGiorno(d)) ?? { giorno: d, interventi: [], parziale: true };
      giornate.push({ ...unisciIntervento(base, i, lunghe), giorno: d, parziale: base.parziale });
    }
    try {
      await dati.salvaAltriGiorni(giornate);
      toast.success(`Fisso su ${giornate.length} giorni, fino al ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}`, {
        description: "Negli altri giorni si somma a quello che c'è; chi è in ferie oggi è escluso. Ctrl+Z non lo toglie: si toglie giorno per giorno.",
        action: { label: "Vedi la settimana", onClick: () => setVista("settimana") },
      });
    } catch (e) {
      toast.error("Non riuscito", { description: (e as Error).message });
    }
  };

  /** Il capo di oggi diventa capocantiere della commessa (funzione ufficiale, come dalla scheda commessa). */
  const rendiCapocantiere = async (orderId: string, hr: string) => {
    const utente = dati.utenteDi.get(hr);
    if (!utente) { toast.error("Questa persona non ha l'app: non può essere capocantiere nell'app."); return; }
    const { error } = await supabase.rpc("commessa_capocantiere", { p_order_id: orderId, p_user_id: utente });
    if (error) { toast.error("Non riuscito", { description: error.message }); return; }
    toast.success(`${personaDi.get(hr)?.nome ?? "Lui"} ora è il capocantiere della commessa`);
    void qc.invalidateQueries({ queryKey: ["programmazione", "capi"] });
    void qc.invalidateQueries({ queryKey: ["order-campo-assignments"] });
  };

  const portaAlGiornoDopo = async (lista: Intervento[]) => {
    const dopo = spostaGiorno(giorno, 1);
    let base = (await dati.leggiGiorno(dopo)) ?? { giorno: dopo, interventi: [], parziale: true };
    for (const i of lista) base = { ...unisciIntervento(base, i, new Set()), parziale: base.parziale };
    try {
      await dati.salvaAltriGiorni([{ ...base, giorno: dopo }]);
      toast.success(`${lista.length} ${lista.length === 1 ? "intervento portato" : "interventi portati"} al giorno dopo`, { action: { label: "Vai", onClick: () => setGiorno(dopo) } });
    } catch (e) {
      toast.error("Non riuscito", { description: (e as Error).message });
    }
  };

  if (errore) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        Non riesco a leggere persone e cantieri del giorno. Serve il permesso «Operai» oltre a «Commesse».
      </div>
    );
  }

  // Si contano chi esce (operai e tecnici) più chi dell'ufficio è stato messo in un intervento.
  const impegnate = persone.filter((p) => !p.assenza && (quanti.persone.get(p.id) ?? 0) > 0).length;
  const disponibili = persone.filter((p) => !p.assenza && (p.ruolo !== "altro" || (quanti.persone.get(p.id) ?? 0) > 0)).length;
  const avvisiSeri = elencoAvvisi.filter((a) => a.tipo !== "vuoto").length;
  const vuoti = elencoAvvisi.filter((a) => a.tipo === "vuoto").length;

  return (
    <DndContext sensors={sensori} onDragStart={inizio} onDragEnd={fine} onDragCancel={() => setTrascinato(null)}>
      <div className="space-y-3">
        {/* ── Testata: giorno, numeri, azioni ── */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Giorno prima" onClick={() => setGiorno((g) => spostaGiorno(g, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <label className="relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
              <CalendarDays className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span className="text-sm font-semibold text-slate-900">{etichettaGiorno(giorno)}</span>
              <input
                type="date"
                aria-label="Scegli il giorno"
                value={giorno}
                onChange={(e) => e.target.value && setGiorno(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Giorno dopo" onClick={() => setGiorno((g) => spostaGiorno(g, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-1 hidden items-center gap-1 sm:flex">
              {[0, 1].map((n) => {
                const g = spostaGiorno(oggiRoma(), n);
                return (
                  <button key={n} type="button" onClick={() => setGiorno(g)}
                    className={cn("rounded-md px-2 py-1 text-xs font-medium", giorno === g ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200" : "text-slate-500 hover:bg-slate-100")}>
                    {n === 0 ? "Oggi" : "Domani"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><strong className="tabular-nums text-slate-900">{giornata?.interventi.length ?? "…"}</strong> interventi</span>
            <span><strong className="tabular-nums text-slate-900">{impegnate}</strong> su {disponibili} persone impegnate</span>
            {vuoti > 0 && <span className="text-amber-700"><strong className="tabular-nums">{vuoti}</strong> senza nessuno</span>}
            {avvisiSeri > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /><strong className="tabular-nums">{avvisiSeri}</strong> da controllare</span>
            )}
            {sera && (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200" title="Previsto contro timbrature e rapportini">
                <span className="font-semibold text-slate-600">{giorno === oggiRoma() ? "Adesso" : "Com'è andata"}</span>
                {(Object.keys(sera.conteggio) as EsitoSera[]).filter((k) => sera.conteggio[k] > 0).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1" title={TONO_SERA[k].testo}>
                    <span className={cn("h-2 w-2 rounded-full", TONO_SERA[k].classe)} aria-hidden="true" />
                    <span className="tabular-nums">{sera.conteggio[k]}</span>
                    <span className="sr-only">{TONO_SERA[k].testo}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-0.5" title="Rapportini arrivati"><FileText className="h-3 w-3" aria-hidden="true" />{sera.rapportini}/{sera.confrontate}</span>
              </span>
            )}
          </div>

          <div role="tablist" aria-label="Vista" className="flex items-center rounded-lg bg-slate-100 p-0.5">
            {([["cantieri", "Cantieri", LayoutGrid], ["giorno", "Giorno", CalendarClock], ["persone", "Persone", UserRound], ["settimana", "Settimana", Columns3], ["mappa", "Mappa", MapIcon]] as const).map(([v, etichetta, Icona]) => (
              <button key={v} type="button" role="tab" aria-selected={vista === v} aria-label={etichetta} title={etichetta} onClick={() => setVista(v)}
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", vista === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                <Icona className="h-3.5 w-3.5" aria-hidden="true" /><span className={cn(vista === v ? "inline" : "hidden lg:inline")}>{etichetta}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center">
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Annulla (Ctrl+Z)" title="Annulla (Ctrl+Z)" disabled={!dati.puoAnnullare} onClick={dati.annulla}><Undo2 className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Rifai (Ctrl+Shift+Z)" title="Rifai (Ctrl+Shift+Z)" disabled={!dati.puoRifare} onClick={dati.rifai}><Redo2 className="h-4 w-4" /></Button>
            </span>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" title="Riempi i buchi" aria-label="Riempi i buchi" disabled={!giornata} onClick={() => giornata && setRiempi(proponiRiempimento({
              giornata, persone, senzaDocumenti, puntoDi,
              squadraDi: new Map(persone.map((p) => [p.id, squadraDellaPersona.get(p.id)?.id ?? null])),
            }))}>
              <Wand2 className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Riempi i buchi</span>
            </Button>
            <NuovoIntervento onCommessa={aggiungiCommessa} onLibero={aggiungiLibero} merce={dati.merce} commessaDi={commessaDi} aperto={nuovoAperto} onAperto={setNuovoAperto} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Altre azioni"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void copiaIeri()}>
                  <Copy className="mr-2 h-4 w-4" /> Copia il giorno prima
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!giornata?.interventi.length} onSelect={() => setRipeti(true)}>
                  <CalendarRange className="mr-2 h-4 w-4" /> Ripeti nei prossimi giorni…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => dati.ricominciaDallaProposta()}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Riparti dalle squadre
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => cambia((g) => ({ ...g, interventi: g.interventi.map((i): Intervento => ({ ...i, persone: [], capoId: null, mezzi: [] })) }))}>
                  <X className="mr-2 h-4 w-4" /> Svuota persone e mezzi
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!giornata?.interventi.length} onSelect={() => setPortaDomani(true)}>
                  <ArrowRight className="mr-2 h-4 w-4" /> Porta al giorno dopo…
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!giornata?.interventi.length} onSelect={() => setMessaggi(true)}>
                  <MessageCircle className="mr-2 h-4 w-4" /> Messaggi per chi non ha l'app
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => {
                  // Il Calendario ricorda il giorno per azienda e utente (useDataMappaCalendario): lo si porta lì.
                  qc.setQueryData(["memoria-mappa", "giorno:lavori", `${companyId ?? ""}:${user?.id ?? ""}`], new Date(`${giorno}T12:00:00`));
                  naviga("/azienda/calendario?view=day");
                }}>
                  <CalendarDays className="mr-2 h-4 w-4" /> Vedi nel calendario
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!giornata?.interventi.length} onSelect={() => setTimeout(() => window.print(), 50)}>
                  <Printer className="mr-2 h-4 w-4" /> Stampa la giornata
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-8 gap-1.5 bg-orange-500 hover:bg-orange-600" disabled={dati.pubblicando} onClick={() => void pubblica()}>
              <Send className="h-3.5 w-3.5" /> {dati.pubblicando ? "Pubblico…" : dati.server?.stato === "pubblicata" && !dati.server.modificata_dopo ? "Pubblicata" : "Pubblica"}
            </Button>
          </div>
        </div>

        {promemoria === "prepara" && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
            <span>È sera e domani non è ancora preparato.</span>
            <button type="button" onClick={() => setGiorno(domaniR)} className="rounded-md bg-amber-500 px-2.5 py-1 font-semibold text-white hover:bg-amber-600">Prepara domani</button>
          </div>
        )}
        {promemoria === "pubblica" && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
            <span>Domani è pronto ma non è pubblicato: gli operai non lo vedono ancora.</span>
            <button type="button" onClick={() => void pubblica()} className="rounded-md bg-orange-500 px-2.5 py-1 font-semibold text-white hover:bg-orange-600">Pubblica ora</button>
          </div>
        )}
        <StatoGiornata nelDatabase={dati.nelDatabase} salvataggio={dati.salvataggio} server={dati.server} onRicarica={() => void dati.ricarica()} />

        {scelto && (
          <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-xl">
            <span>
              Tocca un intervento per metterci <strong>{nomeDi(scelto, personaDi, mezzoDi, squadraDi)}</strong>
              {scelto.da === null && scelto.kind !== "squadra" ? " — resta scelto, puoi metterlo in più interventi" : ""}
            </span>
            <button type="button" className="rounded-full bg-white/15 px-2.5 py-0.5 font-semibold hover:bg-white/25" onClick={() => setScelto(null)}>Fatto · Esc</button>
          </div>
        )}

        {vista === "settimana" && (
          <VistaSettimana companyId={companyId} giorno={giorno} nelDatabase={dati.nelDatabase} persone={persone} squadraDellaPersona={squadraDellaPersona}
            onApriGiorno={(g) => { setGiorno(g); setVista("cantieri"); }} onSalvaGiorni={dati.salvaAltriGiorni} />
        )}
        {vista === "persone" && giornata && (
          <VistaPersone companyId={companyId} giornata={giornata} persone={persone} squadraDellaPersona={squadraDellaPersona} puntoDi={puntoDi} onApri={apri} />
        )}
        {vista === "mappa" && giornata && (
          <Suspense fallback={<div className="h-[28rem] animate-pulse rounded-xl bg-slate-50" />}>
            <VistaMappa companyId={companyId} giornata={giornata} persone={persone} personaDi={personaDi} mezzoDi={mezzoDi}
              utenteAPersona={utenteAPersona} merce={dati.merce} puntoDi={puntoDi} onApri={apri} />
          </Suspense>
        )}

        <div className={cn("grid gap-3 md:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]", vista !== "cantieri" && vista !== "giorno" && "hidden")}>
          <Elenco
            persone={persone}
            squadre={squadre}
            mezzi={mezzi}
            quanti={quanti}
            squadraDellaPersona={squadraDellaPersona}
            scelto={scelto}
            onScegli={scegli}
            trascinando={!!trascinato && trascinato.da !== null}
            senzaDocumenti={senzaDocumenti}
            esterni={dati.esterni}
          />

          <div>
            {vista === "giorno" && giornata ? (
              <VistaGiorno companyId={companyId} puntoDi={puntoDi} giornata={giornata} personaDi={personaDi} attiva={!!scelto} onTocca={toccaIntervento} onApri={apri}
                onNodoGriglia={(n) => { grigliaGiorno.current = n; }}
                onCambia={(id, patch) => cambia((g) => aggiorna(g, id, patch))} />
            ) : caricamento || !giornata ? (
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr))]">
                {[0, 1, 2, 3].map((n) => <div key={n} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />)}
              </div>
            ) : giornata.interventi.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <HardHat className="h-8 w-8 text-slate-300" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Nessun cantiere in calendario per questo giorno</p>
                  <p className="text-xs text-slate-500">Aggiungi una commessa, una manutenzione o un sopralluogo e trascinaci le persone.</p>
                </div>
                <NuovoIntervento onCommessa={aggiungiCommessa} onLibero={aggiungiLibero} merce={dati.merce} commessaDi={commessaDi} />
              </div>
            ) : (
              <div className="grid items-start gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr))]">
                {giornata.interventi.filter((i) => !agganciate.has(i.id)).map((i) => (
                  <SchedaIntervento
                    key={i.id}
                    i={i}
                    allegati={allegatiDi.get(i.id)?.filter((c) => !staccati.has(c.id)) ?? []}
                    onStacca={(id) => { setStaccati((s) => new Set(s).add(id)); setAppenaAggiunto(id); }}
                    giorno={giorno}
                    appenaAggiunto={appenaAggiunto === i.id}
                    commessa={i.orderId ? commessaDi.get(i.orderId) : undefined}
                    meteo={(() => { const pt = puntoDi(i); return pt ? meteo.get(chiaveMeteo(pt)) : undefined; })()}
                    senzaDocumenti={senzaDocumenti}
                    esternoDi={esternoDi}
                    merce={i.orderId ? mercePerCommessa.get(i.orderId) ?? [] : []}
                    visti={visti}
                    conAbilitazioni={dati.conAbilitazioni}
                    onFisso={(quanti) => void fissaFinoAFine(i, quanti)}
                    capoCommessa={i.orderId ? dati.capi.get(i.orderId) ?? null : null}
                    squadre={squadre}
                    onRendiCapo={i.orderId ? (hr) => void rendiCapocantiere(i.orderId!, hr) : undefined}
                    puoRendereCapo={!!dati.nelDatabase}
                    onSalvaSquadra={() => setSalvaSquadra(i)}
                    fineLavori={i.orderId ? commessaDi.get(i.orderId)?.al ?? null : null}
                    personaDi={personaDi}
                    mezzoDi={mezzoDi}
                    squadraDellaPersona={squadraDellaPersona}
                    fasi={i.orderId ? fasiPerCommessa.get(i.orderId) ?? [] : []}
                    avvisi={elencoAvvisi}
                    quanti={quanti}
                    assenti={assenti}
                    scelto={scelto}
                    onScegli={scegli}
                    attiva={!!scelto}
                    onTocca={() => toccaIntervento(i.id)}
                    onCambia={(patch) => cambia((g) => aggiorna(g, i.id, patch))}
                    onTogli={() => cambia((g) => togliIntervento(g, i.id))}
                    onDuplica={() => cambia((g) => {
                      const pos = g.interventi.findIndex((x) => x.id === i.id);
                      const copia: Intervento = { ...i, id: nuovoId(), persone: [], capoId: null, mezzi: [], inizio: null, fine: null };
                      return { ...g, interventi: [...g.interventi.slice(0, pos + 1), copia, ...g.interventi.slice(pos + 1)] };
                    })}
                    onTogliRisorsa={(r) => cambia((g) => sposta(g, r, i.id, null))}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Trascina o tocca una persona e poi l'intervento. Dall'elenco si aggiunge (anche a più interventi), da un intervento all'altro si sposta, con ⌥/Alt si copia, sull'elenco si toglie.
              {!dati.daBozza ? " Proposta dalle squadre, dal calendario delle commesse, dai sopralluoghi e dalle assistenze." : ""}
            </p>
          </div>
        </div>
      </div>

      {salvaSquadra && (
        <SalvaComeSquadra intervento={salvaSquadra} personaDi={personaDi} squadraDellaPersona={squadraDellaPersona} onChiudi={() => setSalvaSquadra(null)} />
      )}
      {giornata && (
        <>
          <FoglioStampa giornata={giornata} titolo={etichettaGiorno(giorno)} personaDi={personaDi} mezzoDi={mezzoDi} />
          {riempi && (
            <RiempiBuchi aperto onChiudi={() => setRiempi(null)} suggerimenti={riempi} giornata={giornata} personaDi={personaDi}
              onApplica={(sc) => {
                cambia((g) => sc.reduce((acc, x) => sposta(acc, { tipo: "persona", id: x.personaId }, null, x.interventoId), g));
                toast.success(`${sc.length} ${sc.length === 1 ? "persona messa" : "persone messe"}`, { description: "Ctrl+Z per tornare indietro." });
              }} />
          )}
          {messaggi && <MessaggiSenzaApp aperto onChiudi={() => setMessaggi(false)} giornata={giornata} personaDi={personaDi} mezzoDi={mezzoDi} giornoTesto={etichettaGiorno(giorno).split(",")[0].toLowerCase()} />}
          {portaDomani && (
            <PortaADomani aperto onChiudi={() => setPortaDomani(false)} giornata={giornata} domaniTesto={etichettaGiorno(spostaGiorno(giorno, 1)).split(",")[0].toLowerCase()}
              onConferma={(lista) => void portaAlGiornoDopo(lista)} />
          )}
        </>
      )}
      {giornata && companyId && (
        <RipetiGiorni key={giorno} aperto={ripeti} onChiudi={() => setRipeti(false)} giornata={giornata} companyId={companyId} salva={dati.salvaAltriGiorni}
          assentiOggi={assenti} onFatto={(n) => toast.success(`Giornata copiata su ${n} ${n === 1 ? "giorno" : "giorni"}`, { description: "Le trovi andando avanti coi giorni: lì si ritoccano." })} />
      )}

      <DragOverlay dropAnimation={null}>
        {trascinato && trascinato.kind !== "blocco" ? (
          <div className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-lg ring-1 ring-orange-300">
            {nomeDi(trascinato, personaDi, mezzoDi, squadraDi)}
            {trascinato.kind === "squadra" && <span className="ml-1 font-normal text-slate-500">· tutta la squadra</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function nomeDi(d: Trascinato, personaDi: Map<string, PersonaGiorno>, mezzoDi: Map<string, MezzoGiorno>, squadraDi: Map<string, SquadraGiorno>) {
  if (d.kind === "persona") {
    const p = personaDi.get(d.id);
    return p ? `${p.nome} ${p.cognome}`.trim() : "Persona";
  }
  if (d.kind === "mezzo") return mezzoDi.get(d.id)?.nome ?? "Mezzo";
  if (d.kind === "esterno") return "Subappaltatore";
  if (d.kind === "blocco") return "";
  if (d.kind === "gruppo") return `${squadraDi.get(d.id)?.nome ?? "Squadra"} · ${d.persone.length} ${d.persone.length === 1 ? "persona" : "persone"}`;
  return squadraDi.get(d.id)?.nome ?? "Squadra";
}

// ── Dove sta la giornata: browser o database, salvata, pubblicata ──────────

function StatoGiornata({ nelDatabase, salvataggio, server, onRicarica }: {
  nelDatabase: boolean;
  salvataggio: StatoSalvataggio;
  server: GiornataServer | null;
  onRicarica: () => void;
}) {
  if (!nelDatabase) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />
        Per ora la giornata resta in questo browser: il salvataggio condiviso e «Pubblica» si attivano con la migrazione.
      </p>
    );
  }
  const ora = server?.pubblicata_at ? new Date(server.pubblicata_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px]">
      {salvataggio === "conflitto" ? (
        <span className="inline-flex items-center gap-1.5 text-rose-700">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />Qualcun altro ha cambiato questa giornata.
          <button type="button" onClick={onRicarica} className="font-semibold underline">Ricarica la sua versione</button>
        </span>
      ) : salvataggio === "errore" ? (
        <span className="text-rose-700">Non salvato: controlla la connessione, riprovo alla prossima modifica.</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <span className={cn("h-1.5 w-1.5 rounded-full", salvataggio === "in_corso" ? "animate-pulse bg-amber-400" : "bg-emerald-500")} aria-hidden="true" />
          {salvataggio === "in_corso" ? "Salvo…" : "Salvata per tutto l'ufficio"}
        </span>
      )}
      {server?.stato === "pubblicata" && (
        server.modificata_dopo
          ? <span className="font-medium text-amber-700">Cambiata dopo la pubblicazione{ora ? ` (${ora})` : ""}: ripubblica per avvisare chi è toccato</span>
          : <span className="text-emerald-700">Pubblicata{ora ? ` il ${ora}` : ""}: gli operai la vedono nell'app</span>
      )}
    </div>
  );
}

// ── Elenco delle risorse (colonna di sinistra) ─────────────────────────────

function Elenco({ persone, squadre, mezzi, quanti, squadraDellaPersona, scelto, onScegli, trascinando, senzaDocumenti, esterni }: {
  persone: PersonaGiorno[];
  squadre: SquadraGiorno[];
  mezzi: MezzoGiorno[];
  quanti: { persone: Map<string, number>; mezzi: Map<string, number> };
  squadraDellaPersona: Map<string, SquadraGiorno>;
  scelto: Trascinato | null;
  onScegli: (d: Trascinato) => void;
  trascinando: boolean;
  senzaDocumenti: Set<string>;
  esterni: EsternoGiorno[];
}) {
  const [mostraAttrezzi, setMostraAttrezzi] = useState(false);
  const [cerca, setCerca] = useState("");
  const [soloLiberi, setSoloLiberi] = useState(false);
  const [mostraAltri, setMostraAltri] = useState(false);
  const q = cerca.trim().toLowerCase();
  const corrisponde = (t: string) => !q || t.toLowerCase().includes(q);
  const èScelto = (kind: string, id: string) => scelto?.kind === kind && scelto.id === id && scelto.da === null;

  const visibile = (p: PersonaGiorno) =>
    !p.assenza && corrisponde(`${p.nome} ${p.cognome} ${p.mansione ?? ""} ${squadraDellaPersona.get(p.id)?.nome ?? ""}`) && (!soloLiberi || !quanti.persone.get(p.id));
  const presenti = persone.filter(visibile);
  const conSquadra = new Map<string, PersonaGiorno[]>();
  const senzaSquadra: PersonaGiorno[] = [];
  const tecnici: PersonaGiorno[] = [];
  const altri: PersonaGiorno[] = [];
  for (const p of presenti) {
    const sq = squadraDellaPersona.get(p.id);
    if (sq && p.ruolo !== "altro") conSquadra.set(sq.id, [...(conSquadra.get(sq.id) ?? []), p]);
    else if (p.ruolo === "operaio") senzaSquadra.push(p);
    else if (p.ruolo === "tecnico") tecnici.push(p);
    else altri.push(p);
  }
  const assenti = persone.filter((p) => p.assenza && p.ruolo !== "altro" && corrisponde(`${p.nome} ${p.cognome}`));
  const mezziTutti = mezzi.filter((m) => corrisponde(`${m.nome} ${m.targa ?? ""}`) && (!soloLiberi || !quanti.mezzi.get(m.id)));
  const mezziVisibili = mezziTutti.filter((m) => !m.attrezzatura);
  const attrezzi = mezziTutti.filter((m) => m.attrezzatura);
  const esterniVisibili = esterni.filter((e) => corrisponde(e.nome));
  const altriAperti = mostraAltri || (!!q && altri.length > 0);
  const vuoto = conSquadra.size === 0 && senzaSquadra.length === 0 && tecnici.length === 0;

  const riga = (p: PersonaGiorno, inSquadra = false) => {
    const n = quanti.persone.get(p.id) ?? 0;
    const sq = squadraDellaPersona.get(p.id);
    const sotto = [inSquadra ? (sq?.responsabileId === p.id ? "Responsabile" : null) : sq?.nome, p.mansione].filter(Boolean).join(" · ");
    return (
      <li key={p.id}>
        <Trascinabile dato={{ kind: "persona", id: p.id, da: null }} scelto={èScelto("persona", p.id)} onScegli={() => onScegli({ kind: "persona", id: p.id, da: null })}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
          <Avatar p={p} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-xs font-medium text-slate-800">
              <span className="truncate">{p.nome} {p.cognome}</span>
              {senzaDocumenti.has(p.id) && <ShieldAlert className="h-3 w-3 shrink-0 text-rose-500" aria-label="Documenti scaduti" />}
              {p.haApp === false && <Phone className="h-2.5 w-2.5 shrink-0 text-slate-300" aria-label="Senza app: avvisalo con un messaggio" />}
              {!!p.abilitazioni?.length && (
                <span title={p.abilitazioni.map((k) => ABILITAZIONI.find((a) => a.chiave === k)?.nome ?? k).join(", ")}>
                  <Award className="h-2.5 w-2.5 shrink-0 text-violet-500" aria-label="Abilitazioni" />
                </span>
              )}
            </span>
            {sotto && <span className="block truncate text-[10px] text-slate-400">{sotto}</span>}
          </span>
          {n === 0
            ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Libero" aria-label="Libero" />
            : <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", n > 1 ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500")} title={`In ${n} interventi`}>{n > 1 ? `in ${n}` : "✓"}</span>}
        </Trascinabile>
      </li>
    );
  };

  return (
    <Zona id={ZONA_ELENCO} attiva={trascinando}
      className="h-fit max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm md:sticky md:top-2 md:max-h-[calc(100vh-7rem)]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input id="cerca-programmazione" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca persona, squadra o mezzo  ( / )" className="h-8 pl-7 text-xs" aria-label="Cerca persona, squadra o mezzo" />
      </div>
      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 px-0.5 text-[11px] text-slate-500">
        <input type="checkbox" checked={soloLiberi} onChange={(e) => setSoloLiberi(e.target.checked)} className="h-3 w-3 accent-orange-500" />
        Solo chi è ancora libero
      </label>
      {trascinando && <p className="mt-2 rounded-md bg-orange-50 px-2 py-1 text-center text-[11px] text-orange-700">Lascia qui per toglierlo dall'intervento</p>}

      {squadre.filter((s) => conSquadra.has(s.id)).map((s) => (
        <section key={s.id} className="mt-3 rounded-lg ring-1 ring-slate-100">
          <Trascinabile dato={{ kind: "squadra", id: s.id, da: null }} scelto={èScelto("squadra", s.id)} onScegli={() => onScegli({ kind: "squadra", id: s.id, da: null })}
            className="flex items-center gap-1.5 rounded-t-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.colore || "#94A3B8" }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.nome}</span>
            <span className="shrink-0 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-500" title="Trascina la testata per portare tutta la squadra">
              <Users className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />tutta · {conSquadra.get(s.id)!.length}
            </span>
          </Trascinabile>
          <ul className="space-y-0.5 px-0.5 pb-1">{conSquadra.get(s.id)!.map((p) => riga(p, true))}</ul>
        </section>
      ))}

      {senzaSquadra.length > 0 && (
        <Sezione titolo={`${conSquadra.size ? "Operai senza squadra" : "Operai"} · ${senzaSquadra.length}`} icona={<HardHat className="h-3.5 w-3.5" />}>
          <ul className="space-y-0.5">{senzaSquadra.map((p) => riga(p))}</ul>
        </Sezione>
      )}

      {tecnici.length > 0 && (
        <Sezione titolo={`Tecnici e sopralluoghi · ${tecnici.length}`} icona={<Ruler className="h-3.5 w-3.5" />}>
          <ul className="space-y-0.5">{tecnici.map((p) => riga(p))}</ul>
        </Sezione>
      )}

      {vuoto && <p className="mt-3 px-1.5 text-[11px] text-slate-400">{soloLiberi ? "Tutti hanno un intervento." : q ? "Nessuno con questo nome." : "Nessun operaio o tecnico: segna «Lavora in cantiere» nel Personale."}</p>}

      {altri.length > 0 && (
        <section className="mt-3">
          <button type="button" onClick={() => setMostraAltri((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-0.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
            <ChevronRight className={cn("h-3 w-3 transition-transform", altriAperti && "rotate-90")} aria-hidden="true" />
            Ufficio e senza mansione · {altri.length}
          </button>
          {altriAperti && <ul className="mt-1 space-y-0.5 opacity-80">{altri.map((p) => riga(p))}</ul>}
        </section>
      )}

      {mezziVisibili.length > 0 && (
        <Sezione titolo={`Mezzi · ${mezziVisibili.length}`} icona={<Truck className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {mezziVisibili.map((m) => {
              const n = quanti.mezzi.get(m.id) ?? 0;
              return (
                <Trascinabile key={m.id} dato={{ kind: "mezzo", id: m.id, da: null }} scelto={èScelto("mezzo", m.id)} onScegli={() => onScegli({ kind: "mezzo", id: m.id, da: null })}
                  className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs", n ? "border-slate-200 bg-slate-50 text-slate-400" : "border-amber-200 bg-amber-50 text-amber-800")}>
                  <Truck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{m.nome}</span>
                  {m.targa && <span className="shrink-0 font-mono text-[10px] opacity-70">{m.targa}</span>}
                </Trascinabile>
              );
            })}
          </div>
        </Sezione>
      )}

      {esterniVisibili.length > 0 && (
        <Sezione titolo={`Subappaltatori · ${esterniVisibili.length}`} icona={<Building2 className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {esterniVisibili.map((e) => (
              <Trascinabile key={e.id} dato={{ kind: "esterno", id: e.id, da: null }} scelto={èScelto("esterno", e.id)} onScegli={() => onScegli({ kind: "esterno", id: e.id, da: null })}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-800">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.colore || "#8B5CF6" }} aria-hidden="true" />
                <span className="truncate">{e.nome}</span>
              </Trascinabile>
            ))}
          </div>
        </Sezione>
      )}

      {attrezzi.length > 0 && (
        <section className="mt-3">
          <button type="button" onClick={() => setMostraAttrezzi((v) => !v)} className="flex w-full items-center gap-1.5 px-0.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
            <ChevronRight className={cn("h-3 w-3 transition-transform", (mostraAttrezzi || q) && "rotate-90")} aria-hidden="true" />
            <Package className="h-3.5 w-3.5" aria-hidden="true" /> Attrezzature · {attrezzi.length}
          </button>
          {(mostraAttrezzi || !!q) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {attrezzi.map((m) => (
                <Trascinabile key={m.id} dato={{ kind: "mezzo", id: m.id, da: null }} scelto={èScelto("mezzo", m.id)} onScegli={() => onScegli({ kind: "mezzo", id: m.id, da: null })}
                  className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs", quanti.mezzi.get(m.id) ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-700")}>
                  <Package className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{m.nome}</span>
                </Trascinabile>
              ))}
            </div>
          )}
        </section>
      )}

      {assenti.length > 0 && (
        <Sezione titolo={`Assenti · ${assenti.length}`}>
          <ul className="space-y-0.5">
            {assenti.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-1.5 py-0.5 opacity-60">
                <Avatar p={p} piccolo />
                <span className="truncate text-[11px] text-slate-600">{p.nome} {p.cognome}</span>
                <span className="ml-auto shrink-0 text-[10px] text-sky-700">{p.assenza}</span>
              </li>
            ))}
          </ul>
        </Sezione>
      )}
    </Zona>
  );
}

function Sezione({ titolo, icona, children }: { titolo: string; icona?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-slate-500">{icona}{titolo}</h3>
      {children}
    </section>
  );
}

// ── Scheda di un intervento ────────────────────────────────────────────────

function SchedaIntervento({
  i, allegati, onStacca, giorno, appenaAggiunto, commessa, meteo, senzaDocumenti, esternoDi, merce, visti, conAbilitazioni, onFisso, fineLavori,
  capoCommessa, squadre, onRendiCapo, puoRendereCapo, onSalvaSquadra, personaDi, mezzoDi, squadraDellaPersona, fasi, avvisi, quanti, assenti, scelto, onScegli, attiva, onTocca, onCambia, onTogli, onDuplica, onTogliRisorsa,
}: {
  i: Intervento;
  /** Carico/scarico in magazzino della stessa squadra, mostrati qui dentro. */
  allegati: Intervento[];
  onStacca: (id: string) => void;
  giorno: string;
  appenaAggiunto: boolean;
  commessa: CommessaGiorno | undefined;
  meteo: WeatherDay | undefined;
  senzaDocumenti: Set<string>;
  esternoDi: Map<string, EsternoGiorno>;
  merce: MerceGiorno[];
  visti: Record<string, string>;
  conAbilitazioni: boolean;
  onFisso: (quanti: number | "fine") => void;
  fineLavori: string | null;
  capoCommessa: string | null;
  squadre: SquadraGiorno[];
  onRendiCapo?: (hrProfiloId: string) => void;
  puoRendereCapo: boolean;
  onSalvaSquadra: () => void;
  personaDi: Map<string, PersonaGiorno>;
  mezzoDi: Map<string, MezzoGiorno>;
  squadraDellaPersona: Map<string, SquadraGiorno>;
  fasi: FaseGiorno[];
  avvisi: Avviso[];
  quanti: { persone: Map<string, number>; mezzi: Map<string, number> };
  assenti: Set<string>;
  scelto: Trascinato | null;
  onScegli: (d: Trascinato) => void;
  attiva: boolean;
  onTocca: () => void;
  onCambia: (patch: Partial<Intervento>) => void;
  onTogli: () => void;
  onDuplica: () => void;
  onTogliRisorsa: (r: { tipo: "persona" | "mezzo"; id: string }) => void;
}) {
  const colore = coloreIntervento(i);
  const doppi = new Set(avvisi.filter((a) => a.tipo === "doppio_persona" && a.interventi.includes(i.id)).map((a) => (a as { personaId: string }).personaId));
  const mezziDoppi = new Set(avvisi.filter((a) => a.tipo === "doppio_mezzo" && a.interventi.includes(i.id)).map((a) => (a as { mezzoId: string }).mezzoId));
  // Le squadre presenti, coi loro componenti qui: l'etichetta si trascina per spostarle tutte.
  const squadreQui = squadre
    .map((sq) => ({ sq, qui: i.persone.filter((p) => squadraDellaPersona.get(p)?.id === sq.id) }))
    .filter((x) => x.qui.length > 0);
  const capoProposto = capoMancante(i, capoCommessa, squadre);
  const capoDiverso = !!i.capoId && !!i.orderId && i.tipo === "commessa" && i.capoId !== capoCommessa;
  const aperte = fasi.filter((f) => f.stato !== "completata");
  const oggi = aperte.filter((f) => f.attivaOggi);
  // Le lavorazioni da mostrare: quelle in calendario oggi, altrimenti le prime aperte; la scelta sempre.
  const inVista = (() => {
    const base = (oggi.length ? oggi : aperte).slice(0, 3);
    const scelta = fasi.find((f) => f.id === i.faseId);
    return scelta && !base.includes(scelta) ? [scelta, ...base.slice(0, 2)] : base;
  })();
  const restano = aperte.length - inVista.filter((f) => f.stato !== "completata").length;
  const g = commessa ? giornoDelCantiere(giorno, commessa.dal ?? null, commessa.al ?? null) : null;
  const scegliFase = (faseId: string | null) => onCambia({ faseId });
  const nodo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (appenaAggiunto) nodo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [appenaAggiunto]);
  const etichettaTipo = i.tipo === "sopralluogo" ? "Sopralluogo" : i.tipo === "manutenzione" ? (i.codice ?? "Assistenza") : i.tipo === "commissione" ? "Commissione" : null;
  // Ore della giornata (persone × durata) e costo, se si può vedere.
  const ore = (() => {
    if (!i.inizio || !i.fine || i.persone.length === 0) return null;
    const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    return ((m(i.fine) - m(i.inizio)) / 60) * i.persone.length;
  })();
  const costo = ore != null && i.persone.every((p) => personaDi.get(p)?.costoOrario != null)
    ? i.persone.reduce((t, p) => t + (personaDi.get(p)!.costoOrario! * (ore / i.persone.length)), 0)
    : null;
  const mancaAbilitazione = avvisi.filter((a) => a.tipo === "abilitazione" && a.interventoId === i.id).map((a) => (a as { manca: string }).manca);

  return (
    <Zona id={i.id} className="rounded-xl transition-shadow">
      <article
        ref={nodo}
        onClick={onTocca}
        className={cn("relative overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow", attiva ? "cursor-copy border-orange-200 hover:border-orange-400" : "border-slate-200", appenaAggiunto && "ring-2 ring-orange-300")}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: colore }} aria-hidden="true" />
        <div className="space-y-2 py-2.5 pl-3.5 pr-2.5">
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                {etichettaTipo && (
                  <span className={cn("inline-flex items-center gap-0.5 rounded px-1 font-semibold", i.tipo === "sopralluogo" ? "bg-violet-50 text-violet-700" : i.tipo === "commissione" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700")}>
                    {i.tipo === "sopralluogo" ? <Ruler className="h-2.5 w-2.5" aria-hidden="true" /> : i.tipo === "commissione" ? <ShoppingCart className="h-2.5 w-2.5" aria-hidden="true" /> : <Wrench className="h-2.5 w-2.5" aria-hidden="true" />}{etichettaTipo}
                  </span>
                )}
                <span className="truncate">{i.tipo === "sopralluogo" || i.tipo === "commissione" ? i.codice : i.tipo === "manutenzione" ? null : i.codice}</span>
                {squadreQui.map(({ sq, qui }) => (
                  <Trascinabile key={sq.id} dato={{ kind: "gruppo", id: sq.id, da: i.id, persone: qui }}
                    scelto={scelto?.kind === "gruppo" && scelto.id === sq.id && scelto.da === i.id}
                    onScegli={() => onScegli({ kind: "gruppo", id: sq.id, da: i.id, persone: qui })}
                    className="inline-flex max-w-[8rem] items-center gap-1 rounded px-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: sq.colore || "#94A3B8" }} aria-hidden="true" />
                    <span className="truncate" title={`${sq.nome}: trascina per spostare tutta la squadra`}>{sq.nome}</span>
                  </Trascinabile>
                ))}
              </div>
              {i.orderId && i.tipo !== "commissione" ? (
                <RiepilogoCommessa orderId={i.orderId} giorno={giorno} fasi={fasi} faseScelta={i.faseId} onScegliFase={scegliFase}>
                  <button type="button" className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 underline-offset-2 hover:underline" title="Riepilogo della commessa">
                    {i.titolo}
                  </button>
                </RiepilogoCommessa>
              ) : (
                <h3 className="truncate text-sm font-semibold text-slate-900" title={i.titolo}>{i.titolo}</h3>
              )}
              {i.indirizzo ? (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.indirizzo)}`} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 truncate text-[11px] text-slate-500 hover:text-slate-800">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{i.indirizzo}</span>
                </a>
              ) : (
                <p className="flex items-center gap-1 text-[11px] italic text-slate-400"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />Indirizzo da completare</p>
              )}
              {(g || commessa?.avanzamento != null) && (
                <p className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                  {g && <span className={cn(g.ritardo > 0 && "text-rose-600")}>{testoGiornoCantiere(g)}</span>}
                  {commessa?.avanzamento != null && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, commessa.avanzamento))}%` }} /></span>
                      {Math.round(commessa.avanzamento)}%
                    </span>
                  )}
                </p>
              )}
              {i.note && <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{i.note}</p>}
              {merce.length > 0 && (
                <p className="mt-0.5 flex items-start gap-1 text-[10px] font-medium text-amber-800" title={merce.map((m) => `${m.numero}${m.fornitore ? ` · ${m.fornitore}` : ""}${m.magazzino ? ` → ${m.magazzino}` : " → in cantiere"}`).join("\n")}>
                  <Package className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                  Merce in arrivo: {merce.map((m) => `${m.fornitore ?? m.numero}${m.magazzino ? " (in magazzino)" : ""}`).join(", ")}
                </p>
              )}
              {i.tipo === "commessa" && capoCommessa && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                  <HardHat className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Capocantiere: {personaDi.get(capoCommessa) ? `${personaDi.get(capoCommessa)!.nome} ${personaDi.get(capoCommessa)!.cognome}` : "—"}
                  {capoDiverso && <span className="text-orange-600">· oggi capo {personaDi.get(i.capoId!)?.nome ?? ""}</span>}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button type="button" aria-label="Azioni intervento" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onDuplica}><Plus className="mr-2 h-4 w-4" /> Un altro intervento qui</DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><CalendarRange className="mr-2 h-4 w-4" /> Ripeti nei giorni dopo</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onSelect={() => onFisso(1)}>Anche domani</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onFisso(5)}>Per una settimana (5 giorni)</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onFisso(10)}>Per due settimane</DropdownMenuItem>
                    {fineLavori && fineLavori > giorno && (
                      <DropdownMenuItem onSelect={() => onFisso("fine")}>
                        Fino a fine lavori ({fineLavori.slice(8, 10)}/{fineLavori.slice(5, 7)}{giorniLavorativiDopo(giorno, 40).filter((d) => d <= fineLavori).length >= 40 ? ", max 40 giorni" : ""})
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {i.orderId && <DropdownMenuItem asChild><a href={`/azienda/ordini/${i.orderId}`} target="_blank" rel="noreferrer"><HardHat className="mr-2 h-4 w-4" /> Apri la commessa</a></DropdownMenuItem>}
                {capoDiverso && onRendiCapo && (
                  <DropdownMenuItem disabled={!puoRendereCapo} onSelect={() => onRendiCapo(i.capoId!)}>
                    <Crown className="mr-2 h-4 w-4" />
                    <span>Rendi {personaDi.get(i.capoId!)?.nome ?? ""} capocantiere della commessa{!puoRendereCapo && <span className="block text-[10px] text-slate-400">si attiva con la migrazione</span>}</span>
                  </DropdownMenuItem>
                )}
                {i.persone.length >= 2 && (
                  <DropdownMenuItem onSelect={onSalvaSquadra}><Users className="mr-2 h-4 w-4" /> Salva queste persone come squadra…</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-600" onSelect={onTogli}><Trash2 className="mr-2 h-4 w-4" /> Togli dalla giornata</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <div className="flex flex-wrap items-center gap-1.5">
            <Orario inizio={i.inizio} fine={i.fine} momento={i.momento} onCambia={onCambia} />
            <Servono messe={i.persone.length} servono={i.servono ?? null} onCambia={(n) => onCambia({ servono: n })} />
            <Abilitazioni scelte={i.richiede ?? []} mancano={mancaAbilitazione} attive={conAbilitazioni} onCambia={(richiede) => onCambia({ richiede })} />
            {ore != null && (
              <span className="inline-flex h-6 items-center text-[10px] tabular-nums text-slate-400" title={costo != null ? "Ore × costo orario di chi c'è" : "Ore della squadra (persone × durata)"}>
                {Math.round(ore * 10) / 10} h{costo != null ? ` · ${Math.round(costo).toLocaleString("it-IT")} €` : ""}
              </span>
            )}
            {meteo && (
              <span title={`${weatherCodeToLabel(meteo.code)} · ${Math.round(meteo.minTemp)}–${Math.round(meteo.maxTemp)}°C · ${meteo.precip.toLocaleString("it-IT")} mm`}
                className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums", meteo.precip >= 5 ? "bg-sky-100 text-sky-800" : "text-slate-500")}>
                <IconaMeteo codice={meteo.code} />{Math.round(meteo.maxTemp)}°
                {meteo.precip >= 1 && <span>{Math.round(meteo.precip)} mm</span>}
              </span>
            )}
          </div>

          {aperte.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {inVista.map((f) => {
                const scelta = i.faseId === f.id;
                return (
                  <RiepilogoFase key={f.id} fase={f} giorno={giorno} scelta={scelta} onScegli={scegliFase}>
                    <button type="button"
                      className={cn("inline-flex max-w-[11rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
                        scelta ? "bg-orange-500 font-medium text-white" : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300")}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", scelta ? "bg-white" : f.attivaOggi ? "bg-orange-500" : "bg-slate-300")} aria-hidden="true" />
                      <span className="truncate">{f.nome}</span>
                      <span className={cn("shrink-0 tabular-nums", scelta ? "text-white/80" : "text-slate-400")}>{Math.round(f.percentuale)}%</span>
                    </button>
                  </RiepilogoFase>
                );
              })}
              {restano > 0 && i.orderId && (
                <RiepilogoCommessa orderId={i.orderId} giorno={giorno} fasi={fasi} faseScelta={i.faseId} onScegliFase={scegliFase}>
                  <button type="button" className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100">+{restano} lavorazioni</button>
                </RiepilogoCommessa>
              )}
            </div>
          )}

          <div>
            <div className="flex flex-wrap gap-1">
              {i.persone.map((id) => {
                const p = personaDi.get(id);
                if (!p) return null;
                const capo = i.capoId === id;
                const problema = assenti.has(id) ? "assente" : senzaDocumenti.has(id) ? "documenti" : doppi.has(id) ? "doppio" : null;
                const esito = esitoSera(i, p.consuntivo);
                const n = quanti.persone.get(id) ?? 0;
                return (
                  <Trascinabile key={id} dato={{ kind: "persona", id, da: i.id }}
                    scelto={scelto?.kind === "persona" && scelto.id === id && scelto.da === i.id}
                    onScegli={() => onScegli({ kind: "persona", id, da: i.id })}
                    className={cn(
                      "group inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1 text-[11px] font-medium ring-1",
                      problema === "assente" || problema === "documenti" ? "bg-rose-50 text-rose-800 ring-rose-200" : problema === "doppio" ? "bg-amber-50 text-amber-800 ring-amber-200" : capo ? "bg-orange-50 text-orange-900 ring-orange-200" : "bg-slate-50 text-slate-700 ring-slate-200",
                    )}>
                    <span className="relative rounded-full" style={squadraDellaPersona.get(id)?.colore ? { boxShadow: `0 0 0 1.5px ${squadraDellaPersona.get(id)!.colore}` } : undefined}
                      title={squadraDellaPersona.get(id)?.nome}>
                      <Avatar p={p} piccolo />
                      {esito && <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white", TONO_SERA[esito].classe)} title={TONO_SERA[esito].testo} aria-label={TONO_SERA[esito].testo} />}
                    </span>
                    {problema === "documenti" && <ShieldAlert className="h-3 w-3 text-rose-500" aria-label="Documenti scaduti" />}
                    {p.consuntivo?.rapportino && <FileText className="h-3 w-3 text-emerald-600" aria-label="Rapportino arrivato" />}
                    {visti[id] && !p.consuntivo && <Eye className="h-3 w-3 text-sky-600" aria-label="Ha visto il programma" />}
                    <span className="max-w-[7.5rem] truncate">{p.nome} {p.cognome?.[0] ? `${p.cognome[0]}.` : ""}</span>
                    {capo && <Crown className="h-3 w-3 text-orange-500" aria-label="Capocantiere" />}
                    {n > 1 && !problema && <span className="text-[9px] text-sky-600" title={`In ${n} interventi`}>×{n}</span>}
                    <button type="button" aria-label={capo ? "Togli capocantiere" : "Fai capocantiere"} title={capo ? "Togli capocantiere" : "Fai capocantiere"}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onCambia({ capoId: capo ? null : id }); }}
                      className="hidden rounded-full p-0.5 text-slate-400 hover:bg-white hover:text-orange-600 group-hover:inline-flex">
                      <Crown className="h-3 w-3" />
                    </button>
                    <button type="button" aria-label="Togli" title="Togli"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onTogliRisorsa({ tipo: "persona", id }); }}
                      className="hidden rounded-full p-0.5 text-slate-400 hover:bg-white hover:text-rose-600 group-hover:inline-flex">
                      <X className="h-3 w-3" />
                    </button>
                  </Trascinabile>
                );
              })}
              {i.persone.length === 0 && !(i.esterni?.length) && (
                <span className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-2 py-1.5 text-center text-[11px] text-amber-700">
                  Trascina qui persone o una squadra
                </span>
              )}
            </div>
          </div>

          {(i.esterni ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(i.esterni ?? []).map((id) => {
                const e = esternoDi.get(id);
                if (!e) return null;
                return (
                  <Trascinabile key={id} dato={{ kind: "esterno", id, da: i.id }} scelto={scelto?.kind === "esterno" && scelto.id === id && scelto.da === i.id}
                    onScegli={() => onScegli({ kind: "esterno", id, da: i.id })}
                    className="group inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-800 ring-1 ring-violet-200">
                    <Building2 className="h-3 w-3" aria-hidden="true" /><span className="max-w-[9rem] truncate">{e.nome}</span>
                    <button type="button" aria-label="Togli subappaltatore" onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => { ev.stopPropagation(); onCambia({ esterni: (i.esterni ?? []).filter((x) => x !== id) }); }}
                      className="hidden rounded p-0.5 hover:text-rose-600 group-hover:inline-flex"><X className="h-3 w-3" /></button>
                  </Trascinabile>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-1.5">
            {i.mezzi.map((id) => {
              const m = mezzoDi.get(id);
              if (!m) return null;
              return (
                <Trascinabile key={id} dato={{ kind: "mezzo", id, da: i.id }}
                  scelto={scelto?.kind === "mezzo" && scelto.id === id && scelto.da === i.id}
                  onScegli={() => onScegli({ kind: "mezzo", id, da: i.id })}
                  className={cn("group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1", mezziDoppi.has(id) ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-amber-50 text-amber-800 ring-amber-200")}>
                  <Truck className="h-3 w-3" aria-hidden="true" />
                  <span className="max-w-[8rem] truncate">{m.nome}</span>
                  <button type="button" aria-label="Togli mezzo" onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onTogliRisorsa({ tipo: "mezzo", id }); }}
                    className="hidden rounded p-0.5 hover:text-rose-600 group-hover:inline-flex"><X className="h-3 w-3" /></button>
                </Trascinabile>
              );
            })}
            {i.mezzi.length === 0 && <span className="text-[10px] text-slate-400"><Truck className="mr-1 inline h-3 w-3" aria-hidden="true" />Nessun mezzo</span>}
          </div>

          {allegati.length > 0 && (
            <ul className="space-y-0.5 border-t border-slate-100 pt-1.5">
              {allegati.map((c) => (
                <li key={c.id}>
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onStacca(c.id); }}
                    title="Apri come scheda per modificarla"
                    className="flex w-full min-w-0 items-center gap-1.5 rounded-md bg-amber-50/70 px-1.5 py-1 text-left text-[11px] text-slate-700 ring-1 ring-amber-100 hover:bg-amber-50">
                    <ShoppingCart className="h-3 w-3 shrink-0 text-amber-700" aria-hidden="true" />
                    <span className="shrink-0 font-semibold text-amber-800">{c.momento === "prima" ? "Prima:" : "Dopo:"}</span>
                    <span className="min-w-0 flex-1 truncate">{c.titolo}{c.indirizzo ? ` · ${c.indirizzo.split(",").at(-1)?.trim()}` : ""}</span>
                    {c.mezzi.length > 0 && <Truck className="h-3 w-3 shrink-0 text-slate-400" aria-label="Con mezzo" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {capoProposto && (
            <p className="flex items-center gap-1.5 text-[10px] text-amber-700">
              <Crown className="h-3 w-3 shrink-0" aria-hidden="true" /> Nessun capocantiere
              <button type="button" onClick={(e) => { e.stopPropagation(); onCambia({ capoId: capoProposto }); }}
                className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-200">
                Metti {personaDi.get(capoProposto)?.nome ?? "lui"}
              </button>
            </p>
          )}
          {(() => {
            const manca = avvisi.find((a) => a.tipo === "mancano" && a.interventoId === i.id) as { mancano: number } | undefined;
            return manca ? <p className="text-[10px] font-medium text-amber-700">{manca.mancano === 1 ? "Manca 1 persona" : `Mancano ${manca.mancano} persone`}</p> : null;
          })()}
          {(doppi.size > 0 || mancaAbilitazione.length > 0 || i.persone.some((p) => assenti.has(p) || senzaDocumenti.has(p))) && (
            <p className="flex items-start gap-1 text-[10px] leading-snug text-rose-700">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              {[
                ...i.persone.filter((p) => assenti.has(p)).map((p) => `${personaDi.get(p)?.nome ?? "?"} è ${personaDi.get(p)?.assenza?.toLowerCase() ?? "assente"}`),
                ...i.persone.filter((p) => senzaDocumenti.has(p) && !assenti.has(p)).map((p) => `${personaDi.get(p)?.nome ?? "?"} ha documenti scaduti`),
                ...mancaAbilitazione.map((k) => `nessuno ha l'abilitazione «${ABILITAZIONI.find((a) => a.chiave === k)?.nome ?? k}»`),
                ...[...doppi].map((p) => `${personaDi.get(p)?.nome ?? "?"} è anche in un altro intervento alla stessa ora`),
              ].join(" · ")}
            </p>
          )}
        </div>
      </article>
    </Zona>
  );
}

// ── Persone che servono: «2/3» si capisce al volo ──────────────────────────

function Servono({ messe, servono, onCambia }: { messe: number; servono: number | null; onCambia: (n: number | null) => void }) {
  const [aperto, setAperto] = useState(false);
  const tono = servono == null ? "text-slate-400 border border-dashed border-slate-200" : messe < servono ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : messe > servono ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button" title="Persone messe / persone che servono" className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums", tono)}>
          <Users className="h-3 w-3" aria-hidden="true" />{messe}/{servono ?? "–"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-[10px] font-semibold text-slate-500">Quante persone servono?</p>
        <div className="grid grid-cols-5 gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
            <button key={n} type="button" onClick={() => { onCambia(n); setAperto(false); }}
              className={cn("rounded py-1 text-xs tabular-nums", servono === n ? "bg-orange-500 font-semibold text-white" : "bg-slate-50 text-slate-700 hover:bg-orange-50")}>{n}</button>
          ))}
        </div>
        {servono != null && <button type="button" onClick={() => { onCambia(null); setAperto(false); }} className="mt-1.5 w-full rounded py-1 text-[11px] text-slate-500 hover:bg-slate-50">Non lo dico</button>}
      </PopoverContent>
    </Popover>
  );
}

// ── Abilitazioni che servono (gru, PLE…) ────────────────────────────────────

function Abilitazioni({ scelte, mancano, attive, onCambia }: { scelte: string[]; mancano: string[]; attive: boolean; onCambia: (v: string[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button" title="Abilitazioni che servono"
          className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px]",
            mancano.length ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : scelte.length ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200" : "text-slate-300 hover:text-slate-600")}>
          <Award className="h-3 w-3" aria-hidden="true" />
          {scelte.length ? scelte.map((k) => ABILITAZIONI.find((a) => a.chiave === k)?.nome.split(" ")[0] ?? k).join(", ") : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-[10px] font-semibold text-slate-500">Cosa serve saper usare qui?</p>
        <div className="space-y-0.5">
          {ABILITAZIONI.map((a) => (
            <label key={a.chiave} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-slate-50">
              <input type="checkbox" className="accent-violet-600" checked={scelte.includes(a.chiave)}
                onChange={(e) => onCambia(e.target.checked ? [...scelte, a.chiave] : scelte.filter((x) => x !== a.chiave))} />
              {a.nome}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">
          {attive ? "Si controlla sui corsi di sicurezza validi del Personale." : "Il controllo sui corsi del Personale si attiva con la migrazione: intanto resta come promemoria."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ── Ripeti la giornata nei prossimi giorni ─────────────────────────────────

function RipetiGiorni({ aperto, onChiudi, giornata, companyId, salva, assentiOggi, onFatto }: {
  salva: (g: Giornata[]) => Promise<void>;
  aperto: boolean;
  onChiudi: () => void;
  giornata: Giornata;
  companyId: string;
  assentiOggi: Set<string>;
  onFatto: (n: number) => void;
}) {
  const giorni = giorniLavorativiDopo(giornata.giorno, 10);
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(giorni.slice(0, 4)));
  const giaPronti = giorni.filter((g) => leggiBozza(companyId, g));
  const sovrascritti = [...scelti].filter((g) => giaPronti.includes(g));
  const etichetta = (g: string) => new Date(`${g}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const conferma = () => {
    // Le assenze dei giorni dopo non le sappiamo qui: chi è in ferie/malattia lunga oggi resta fuori.
    const lunghe = new Set([...assentiOggi]);
    const copie = ripetiSuGiorni(giornata, [...scelti].sort(), () => lunghe);
    salva(copie).then(() => { onFatto(copie.length); onChiudi(); }, (e: Error) => toast.error("Copia non riuscita", { description: e.message }));
  };
  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ripeti questa giornata</DialogTitle>
          <DialogDescription>Stessi interventi, persone, mezzi e orari sui giorni che scegli. Poi ogni giorno si ritocca da solo.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200"
            onClick={() => setScelti(new Set(giorni.filter((g) => new Date(`${g}T12:00:00Z`) <= new Date(`${giorni.find((x) => new Date(`${x}T12:00:00Z`).getUTCDay() === 5) ?? giorni[4]}T12:00:00Z`))))}>
            Fino a venerdì
          </button>
          <button type="button" className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200" onClick={() => setScelti(new Set(giorni.slice(0, 5)))}>Prossimi 5</button>
          <button type="button" className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200" onClick={() => setScelti(new Set(giorni))}>Prossimi 10</button>
          <button type="button" className="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100" onClick={() => setScelti(new Set())}>Nessuno</button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {giorni.map((g) => (
            <label key={g} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ring-1", scelti.has(g) ? "bg-orange-50 ring-orange-200" : "ring-slate-200 hover:bg-slate-50")}>
              <input type="checkbox" className="accent-orange-500" checked={scelti.has(g)}
                onChange={(e) => setScelti((s) => { const n = new Set(s); if (e.target.checked) n.add(g); else n.delete(g); return n; })} />
              <span className="capitalize">{etichetta(g)}</span>
              {giaPronti.includes(g) && <span className="ml-auto text-[10px] text-amber-700">già preparato</span>}
            </label>
          ))}
        </div>
        {sovrascritti.length > 0 && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            {sovrascritti.length === 1 ? "Un giorno è già preparato e verrà sostituito." : `${sovrascritti.length} giorni sono già preparati e verranno sostituiti.`}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi}>Annulla</Button>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={scelti.size === 0} onClick={conferma}>
            Copia su {scelti.size} {scelti.size === 1 ? "giorno" : "giorni"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Orario: un tocco sull'inizio, uno sulla durata, oppure «8:30-12» ───────

const ORE_INIZIO = Array.from({ length: 23 }, (_, n) => aggiungiMinuti("06:30", n * 30));
const DURATE: { etichetta: string; minuti: number | null }[] = [
  { etichetta: "1 h", minuti: 60 }, { etichetta: "2 h", minuti: 120 }, { etichetta: "3 h", minuti: 180 },
  { etichetta: "4 h", minuti: 240 }, { etichetta: "8 h", minuti: 480 }, { etichetta: "Senza fine", minuti: null },
];

function Orario({ inizio, fine, momento, onCambia }: { inizio: string | null; fine: string | null; momento?: "prima" | "dopo" | null; onCambia: (p: Partial<Intervento>) => void }) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const scritto = testo.trim() ? leggiOrario(testo) : null;
  const conferma = () => {
    if (!scritto) return;
    onCambia({ inizio: scritto.inizio, fine: scritto.fine, momento: null });
    setTesto("");
    setAperto(false);
  };
  return (
    <Popover open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setTesto(""); }}>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()}
          className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums",
            inizio ? "bg-slate-900 font-semibold text-white" : momento ? "bg-amber-100 font-semibold text-amber-900" : "border border-dashed border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700")}>
          <Clock className="h-3 w-3" aria-hidden="true" />
          {inizio ? `${inizio}${fine ? `–${fine}` : ""}` : momento === "prima" ? "Prima del cantiere" : momento === "dopo" ? "Dopo il cantiere" : "In giornata"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-2.5" onClick={(e) => e.stopPropagation()}>
        <Input autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && conferma()}
          placeholder="Scrivi: 8, 8:30, 8-12" aria-label="Orario" className={cn("h-8 text-xs", testo.trim() && !scritto && "ring-1 ring-rose-300")} />
        {testo.trim() && (
          <p className={cn("text-[11px]", scritto ? "text-slate-600" : "text-rose-600")}>
            {scritto ? <>Invio per <strong>{scritto.inizio}{scritto.fine ? `–${scritto.fine}` : ""}</strong></> : "Non capisco l'orario: prova «8:30» o «8-12»."}
          </p>
        )}
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-500">Inizio</p>
          <div className="grid grid-cols-6 gap-1">
            {ORE_INIZIO.map((h) => (
              <button key={h} type="button"
                onClick={() => onCambia({ inizio: h, fine: fine && fine > h ? fine : null, momento: null })}
                className={cn("rounded px-1 py-1 text-[11px] tabular-nums", inizio === h ? "bg-orange-500 font-semibold text-white" : "bg-slate-50 text-slate-700 hover:bg-orange-50")}>
                {h}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-500">Durata</p>
          <div className="flex flex-wrap gap-1">
            {DURATE.map((d) => (
              <button key={d.etichetta} type="button" disabled={!inizio}
                onClick={() => { if (!inizio) return; onCambia({ fine: d.minuti ? aggiungiMinuti(inizio, d.minuti) : null }); setAperto(false); }}
                className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-orange-50 disabled:opacity-40">
                {d.etichetta}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-slate-500">Senza orario preciso</p>
          <div className="grid grid-cols-3 gap-1">
            {([["prima", "Prima del cantiere"], [null, "In giornata"], ["dopo", "Dopo il cantiere"]] as const).map(([m, etichetta]) => (
              <button key={etichetta} type="button" onClick={() => { onCambia({ inizio: null, fine: null, momento: m }); setAperto(false); }}
                className={cn("rounded px-1 py-1 text-[11px] leading-tight", !inizio && (momento ?? null) === m ? "bg-amber-500 font-semibold text-white" : "bg-slate-50 text-slate-700 hover:bg-amber-50")}>
                {etichetta}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">«Dopo il cantiere»: per esempio passare in magazzino stasera. Non si scontra con la giornata in cantiere.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Nuovo intervento ───────────────────────────────────────────────────────

function NuovoIntervento({ onCommessa, onLibero, merce = [], commessaDi, aperto: apertoEsterno, onAperto }: {
  onCommessa: (c: Parameters<typeof interventoDaCommessa>[0]) => void;
  onLibero: (tipo: "manutenzione" | "altro" | "commissione", titolo: string, extra?: Partial<Intervento>) => void;
  merce?: MerceGiorno[];
  commessaDi?: Map<string, CommessaGiorno>;
  aperto?: boolean;
  onAperto?: (v: boolean) => void;
}) {
  const [apertoInterno, setApertoInterno] = useState(false);
  const aperto = apertoEsterno ?? apertoInterno;
  const setAperto = (v: boolean) => { setApertoInterno(v); onAperto?.(v); };
  const [testo, setTesto] = useState("");
  const ricerca = useCercaCommesse(aperto ? testo : "");
  const daRitirare = merce.filter((m) => m.magazzino);
  const chiudi = () => { setAperto(false); setTesto(""); };
  const libero = (tipo: "manutenzione" | "altro" | "commissione", predefinito: string, extra?: Partial<Intervento>) => {
    onLibero(tipo, testo.trim() || predefinito, extra);
    chiudi();
  };
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" title="Nuovo intervento (N)"><Plus className="h-3.5 w-3.5" /> Intervento</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-2">
        <Input autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Commessa, cliente, indirizzo… o cosa fare" className="h-8 text-xs" />
        <ul className="mt-1.5 max-h-56 overflow-y-auto">
          {(ricerca.data ?? []).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onCommessa(c); chiudi(); }}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                <span className="block truncate text-xs font-medium text-slate-800">{c.cliente || c.descrizione || c.codice}</span>
                <span className="block truncate text-[10px] text-slate-400">{[c.codice, c.indirizzo].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {ricerca.isLoading && <li className="px-2 py-2 text-[11px] text-slate-400">Cerco…</li>}
          {!ricerca.isLoading && (ricerca.data ?? []).length === 0 && <li className="px-2 py-2 text-[11px] text-slate-400">Nessuna commessa trovata.</li>}
        </ul>

        {daRitirare.length > 0 && (
          <div className="mt-1.5 border-t border-slate-100 pt-1.5">
            <p className="px-1 text-[10px] font-semibold text-amber-700">Merce arrivata in magazzino da portare in cantiere</p>
            {daRitirare.map((m) => {
              const c = m.orderId ? commessaDi?.get(m.orderId) : undefined;
              return (
                <button key={m.id} type="button"
                  onClick={() => libero("commissione", "Ritiro merce", {
                    titolo: `Ritiro merce ${m.fornitore ?? m.numero}`, codice: m.numero, orderId: m.orderId, indirizzo: m.magazzinoIndirizzo ?? m.magazzino,
                    note: `In magazzino ${m.magazzino}${c ? `, poi al cantiere ${c.cliente ?? c.codice ?? ""}` : ""}`,
                  })}
                  className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-amber-50">
                  <Package className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-800">{m.fornitore ?? "Fornitore"} · {m.numero}</span>
                    <span className="block truncate text-[10px] text-slate-400">{m.magazzino}{c ? ` → ${c.cliente ?? c.codice}` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-slate-100 pt-1.5">
          <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={() => libero("commissione", "Ritiro merce in magazzino")}>
            <Package className="h-3 w-3" /> Ritiro in magazzino
          </Button>
          <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={() => libero("commissione", "Acquisto materiale")}>
            <ShoppingCart className="h-3 w-3" /> Acquisto
          </Button>
          <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={() => libero("manutenzione", "Manutenzione")}>
            <Wrench className="h-3 w-3" /> Manutenzione
          </Button>
          <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-xs" onClick={() => libero("altro", "Sopralluogo")}>
            <MapPin className="h-3 w-3" /> Sopralluogo o altro
          </Button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-slate-400">Scrivi prima cosa fare (es. «Comprare silicone da Brico») e poi scegli il tipo.</p>
      </PopoverContent>
    </Popover>
  );
}
