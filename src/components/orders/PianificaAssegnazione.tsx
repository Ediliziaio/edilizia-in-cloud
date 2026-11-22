import type { PropostaCommessaMappa } from "@/components/calendar/mappa/servizio";
import { DisponibilitaOperai } from "./DisponibilitaOperai";
import type { DisponibilitaCantiere } from "@/lib/orders/disponibilitaCantiere";
import { plannedLaborCost } from "@/lib/orders/laborEconomics";
import { AzioniLavorazioni } from "./AzioniLavorazioni";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { ambitiOperativi, giorniPrevisti, previsionalePersone, type AmbitoLavoro } from "@/lib/orders/previsionaleLavoro";
import { useCostiOrariPrevisione, useDipendentiDeiProfili } from "@/hooks/useAssignmentHourlyCost";
import type { CalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import type { ExecutorOption } from "@/hooks/useOrderWorkPhases";
import { dateLavorative, ripartisciMicroOre, validaRipartizione, type PianoPrevisto } from "@/lib/orders/previsionaleSalvato";
import type { Squadra } from "@/hooks/useOperai";

export interface PianoAssegnazione {
  ambiti: AmbitoLavoro[];
  persone: string[];
  squadre: string[];
  periodo: { dal: string; al: string } | null;
  ore: number[];
  personeConTariffa: Set<string>;
}

export interface PassaggioPiano {
  nome: string;
  esegui: () => Promise<unknown>;
}

export interface InputPrevisione {
  ambiti: AmbitoLavoro[];
  persone: string[];
  squadre: string[];
  dal: string;
  al: string;
  oreGiorno: number;
  microOrePerAmbito: number[];
}

export function PianificaAssegnazione({ ambiti, persone, squadre, calendario, puoPersone, puoSquadre, puoDate, puoVoci, doveAssegnato, onPassaggi, onOccupato, previsionale, proposta }: {
  ambiti: AmbitoLavoro[];
  persone: ExecutorOption[];
  squadre: Squadra[];
  calendario: Pick<CalendarioCantiere, "lavorativo" | "sabato">;
  puoPersone: boolean;
  puoSquadre: boolean;
  puoDate: boolean;
  puoVoci: boolean;
  doveAssegnato?: (id: string, tipo: "persona" | "squadra", ambiti: readonly AmbitoLavoro[]) => number;
  onPassaggi?: (piano: PianoAssegnazione) => PassaggioPiano[];
  proposta?: PropostaCommessaMappa;
  previsionale?: {
    salvato?: PianoPrevisto;
    quoteSalvate?: Record<string, number>;
    chiaveDisponibilita?: readonly unknown[];
    disponibilita?: (dati: { persone: string[]; dal: string; al: string }) => Promise<DisponibilitaCantiere>;
    salva: (dati: InputPrevisione, operazione: string) => Promise<void>;
  };
  onOccupato: (si: boolean) => void;
}) {
  const bersagli = ambitiOperativi(ambiti);
  const iniziale = bersagli.length === 1 ? bersagli[0] : undefined;
  const salvato = previsionale?.salvato;
  const [dal, setDal] = useState(salvato?.dal ?? iniziale?.dal ?? "");
  const [al, setAl] = useState(salvato?.al ?? iniziale?.al ?? "");
  const totaliSalvate = previsionale?.quoteSalvate
    ? Object.values(previsionale.quoteSalvate).reduce((totale, n) => totale + n, 0)
    : salvato?.microOreGiorno;
  const [oreGiorno, setOreGiorno] = useState(totaliSalvate ? String(totaliSalvate / 1e6).replace(".", ",") : "8");
  const [quoteScritte, setQuoteScritte] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(previsionale?.quoteSalvate ?? {}).map(([id, ore]) => [id, String(ore / 1e6).replace(".", ",")]),
  ));
  const idPersonaProposta = proposta?.tipo === "operai" && puoPersone ? persone.find(p => p.campoUserId === proposta.id)?.id : undefined;
  const idSquadraProposta = proposta?.tipo === "squadre" && puoSquadre ? squadre.find(s => s.id === proposta.id)?.id : undefined;
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<string[]>(salvato?.persone ?? (idPersonaProposta ? [idPersonaProposta] : []));
  const [team, setTeam] = useState<string[]>(salvato?.squadre.map((s) => s.id) ?? (idSquadraProposta ? [idSquadraProposta] : []));
  const [salvaDate, setSalvaDate] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState("");
  const [inRipresa, setInRipresa] = useState(false);
  const pianoInCorso = useRef<{ passaggi: PassaggioPiano[]; indice: number } | null>(null);
  const lock = useRef(false);
  const attivo = useRef(false);
  useEffect(() => { attivo.current = true; return () => { attivo.current = false; }; }, []);

  const su = (id: string, tipo: "persona" | "squadra") => doveAssegnato?.(id, tipo, bersagli) ?? 0;
  const giaSuTutte = (id: string, tipo: "persona" | "squadra") => bersagli.length > 0 && su(id, tipo) >= bersagli.length;
  const squadreScelte = squadre.filter((s) => (!proposta || puoSquadre) && team.includes(s.id) && !giaSuTutte(s.id, "squadra"));
  const profili = squadreScelte.flatMap((s) => s.componenti);
  const legami = useDipendentiDeiProfili(profili.map((p) => p.id));
  const idDipendente = (id: string) => legami.data?.get(id) ?? (previsionale?.disponibilita ? `hr:${id}` : id);
  const componenti = new Set(profili.map((p) => idDipendente(p.id)));
  const personeScelte = scelte.filter((id) => (!proposta || (puoPersone && persone.some(p => p.id === id))) && !componenti.has(id) && !giaSuTutte(id, "persona"));
  const partecipanti = [...new Set([...componenti, ...personeScelte])];
  const tariffe = useCostiOrariPrevisione(partecipanti.filter((id) => !id.startsWith("hr:")));
  const nomi = new Map<string, string>(profili.map((p) => [idDipendente(p.id), `${p.nome} ${p.cognome}`] as const));
  for (const p of persone) nomi.set(p.id, p.label);
  const caricaTariffe = (partecipanti.some((id) => !id.startsWith("hr:")) && tariffe.isPending) || (profili.length > 0 && legami.isLoading);
  const parziali = personeScelte.some((id) => su(id, "persona") > 0) || squadreScelte.some((s) => su(s.id, "squadra") > 0);
  const periodo = dal && al ? { dal, al } : null;
  const giorni = periodo ? giorniPrevisti(dal, al, calendario.lavorativo) : null;
  const ore = parseAssignmentAmount(oreGiorno, previsionale ? 6 : 2);
  const valido = !periodo || (giorni !== null && giorni > 0 && ore !== null && ore > 0 && ore <= 24);
  const oreTotali = valido && giorni && ore ? giorni * ore : 0;
  const previsione = previsionalePersone(partecipanti.map((id) => ({ id, tariffa: tariffe.data?.get(id) ?? null })), oreTotali, bersagli.length);
  const quoteBase = ripartisciMicroOre(ore ?? 0, bersagli.length);
  const quote = bersagli.map(({ id }, i) => {
    const testo = quoteScritte[id];
    if (testo === undefined) return quoteBase[i];
    const n = parseAssignmentAmount(testo, 6);
    return n != null ? Math.round(n * 1e6) : -1;
  });
  const quoteValide = !!ore && validaRipartizione(quote, ore, bersagli.length);
  const sommaQuote = quote.reduce((totale, n) => totale + Math.max(n, 0), 0) / 1e6;
  const giorniDiLavoro = previsionale && periodo && (giorni ?? 0) > 0 && (giorniPrevisti(dal, al, () => true) ?? Infinity) <= 366
    ? dateLavorative(dal, al, calendario.lavorativo) : [];
  const costoRipartito = previsionale && giorni && quoteValide ? partecipanti.reduce((totale, id) => {
    const tariffa = tariffe.data?.get(id);
    return totale + quote.reduce((somma, q) => somma + Math.round((plannedLaborCost(q / 1e6 * giorni, tariffa) ?? 0) * 100), 0);
  }, 0) / 100 : null;
  const senzaSottofase = !previsionale && bersagli.some((a) => a.voceId && !a.sottofaseId);
  const haVoci = bersagli.some((a) => !!a.sottofaseId);
  const haFasi = bersagli.some((a) => a.faseId && !a.sottofaseId && !a.voceId);
  const mostraDateFase = !previsionale && puoDate && (haVoci || haFasi);
  const puoCalcolare = !previsionale || (!!periodo && valido && giorniDiLavoro.length > 0 && quoteValide && bersagli.every((a) => !!a.faseId));
  const operazionePrevista = useRef<{ chiave: string; id: string } | null>(null);
  const filtro = cerca.trim().toLocaleLowerCase("it");
  const visibile = (nome: string) => nome.toLocaleLowerCase("it").includes(filtro);

  const salva = async () => {
    if (lock.current || (!pianoInCorso.current && (!valido || !bersagli.length || senzaSottofase))) return;
    lock.current = true;
    setInCorso(true);
    onOccupato(true);
    let ancoraDaFare = false;
    try {
      if (previsionale && ore && periodo) {
        const dati = { ambiti: bersagli, persone: personeScelte, squadre: squadreScelte.map((s) => s.id), ...periodo, oreGiorno: ore, microOrePerAmbito: quote };
        const chiave = JSON.stringify(dati);
        if (operazionePrevista.current?.chiave !== chiave) operazionePrevista.current = { chiave, id: crypto.randomUUID() };
        await previsionale.salva(dati, operazionePrevista.current.id);
        operazionePrevista.current = null;
        setEsito("");
        toast.success("Previsionale salvato");
        return;
      }
      if (!pianoInCorso.current) {
        const passaggi = onPassaggi?.({
          ambiti: bersagli,
          persone: personeScelte,
          squadre: squadreScelte.map((s) => s.id),
          periodo: salvaDate || bersagli.some((a) => !a.faseId) ? periodo : null,
          ore: previsione.ripartizione,
          personeConTariffa: new Set(tariffe.allowed && oreTotali > 0 ? personeScelte.filter((id) => tariffe.data?.get(id) != null) : []),
        });
        if (!passaggi?.length) throw new Error("Le date e le assegnazioni selezionate sono già registrate.");
        pianoInCorso.current = { passaggi, indice: 0 };
      }
      const piano = pianoInCorso.current;
      while (piano.indice < piano.passaggi.length) {
        if (!attivo.current) return;
        await piano.passaggi[piano.indice].esegui();
        piano.indice++;
      }
      if (!attivo.current) return;
      pianoInCorso.current = null;
      setEsito("");
      setScelte([]);
      setTeam([]);
      toast.success("Pianificazione salvata");
    } catch (e) {
      if (!attivo.current) return;
      const dettaglio = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Errore durante il salvataggio.";
      const rimasto = pianoInCorso.current;
      ancoraDaFare = !!rimasto;
      setEsito(rimasto ? `${rimasto.indice} di ${rimasto.passaggi.length} operazioni confermate. Da completare: ${rimasto.passaggi[rimasto.indice].nome}. ${dettaglio}` : dettaglio);
    } finally {
      lock.current = false;
      if (attivo.current) {
        setInCorso(false);
        setInRipresa(ancoraDaFare);
        onOccupato(ancoraDaFare);
      }
    }
  };

  const dateParziali = (!!dal !== !!al) && (salvaDate || bersagli.some((a) => !a.faseId));
  const ContenitorePeriodo = previsionale ? "div" : "details";
  const titoloPeriodo = <h4 className="inline-flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" aria-hidden="true" />Periodo previsto</h4>;
  return (
    <section aria-label="Pianifica assegnazione" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2.5">
      {proposta && <div className="rounded-md border bg-muted/35 p-2 text-xs">
        <p className="font-medium">Proposta dalla mappa · {proposta.nome} · {proposta.giorno.split("-").reverse().join("/")} · {proposta.inizio}–{proposta.fine}</p>
        <p className="text-muted-foreground">{idPersonaProposta || idSquadraProposta
          ? "Verifica le lavorazioni, il periodo e le ore prima di confermare."
          : "La risorsa non è disponibile tra le scelte di questa commessa."}</p>
      </div>}
        <h4 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />{previsionale ? salvato ? "Modifica previsione" : "Nuova previsione" : "Nuova assegnazione"}</h4>
        <p className="max-w-full truncate text-xs text-muted-foreground" title={iniziale?.nome}>
          {iniziale?.nome ?? (bersagli.length ? `${bersagli.length} lavorazioni selezionate` : "Seleziona almeno una lavorazione.")}
        </p>
      </div>
      {senzaSottofase && <p role="status" className="text-sm text-muted-foreground">Per assegnare questa voce agli operai, crea la sottofase dal suo riepilogo oppure seleziona la fase.</p>}
      {!previsionale && haVoci && !puoVoci && <p role="status" className="text-sm text-muted-foreground">Le assegnazioni sulle sottofasi non sono disponibili per questa commessa.</p>}
      <fieldset disabled={inCorso || inRipresa} className="min-w-0 space-y-3">
        <div className={previsionale ? "grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]" : "space-y-3"}>
          <div className="min-w-0 space-y-3">
            <Input aria-label="Cerca operai e squadre" placeholder="Cerca operai e squadre" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              {puoPersone && <div className="space-y-2">
                <h4 className="text-sm font-semibold">Operai</h4>
                <div className="max-h-44 overflow-y-auto rounded-lg border p-2">
                  {persone.filter((p) => visibile(p.label)).map((p) => (
                    <label key={p.id} className="flex min-h-8 items-center gap-2 rounded px-1 text-sm hover:bg-muted">
                      <Checkbox checked={componenti.has(p.id) || scelte.includes(p.id)} disabled={componenti.has(p.id) || giaSuTutte(p.id, "persona") || inCorso || inRipresa}
                        onCheckedChange={(si) => setScelte((prima) => si ? [...prima, p.id] : prima.filter((id) => id !== p.id))} />
                      {p.label}{componenti.has(p.id) && <span className="text-xs text-muted-foreground">in squadra</span>}
                      {su(p.id, "persona") > 0 && <span className="text-xs text-muted-foreground">già assegnato{bersagli.length > 1 ? ` · ${su(p.id, "persona")}/${bersagli.length}` : ""}</span>}
                    </label>
                  ))}
                  {!persone.some((p) => visibile(p.label)) && <p className="p-1 text-sm text-muted-foreground">Nessun operaio.</p>}
                </div>
              </div>}
              {puoSquadre && <div className="space-y-2">
                <h4 className="text-sm font-semibold">Squadre interne</h4>
                <div className="max-h-44 overflow-y-auto rounded-lg border p-2">
                  {squadre.filter((s) => visibile(s.nome)).map((s) => (
                    <label key={s.id} className="flex min-h-8 items-center gap-2 rounded px-1 text-sm hover:bg-muted">
                      <Checkbox checked={team.includes(s.id)} disabled={giaSuTutte(s.id, "squadra") || inCorso || inRipresa}
                        onCheckedChange={(si) => setTeam((prima) => si ? [...prima, s.id] : prima.filter((id) => id !== s.id))} />
                      <span>{s.nome} <span className="text-xs text-muted-foreground">· {s.componenti.length}</span></span>
                      {su(s.id, "squadra") > 0 && <span className="text-xs text-muted-foreground">già assegnata{bersagli.length > 1 ? ` · ${su(s.id, "squadra")}/${bersagli.length}` : ""}</span>}
                    </label>
                  ))}
                  {!squadre.some((s) => visibile(s.nome)) && <p className="p-1 text-sm text-muted-foreground">Nessuna squadra.</p>}
                </div>
              </div>}
            </div>
          </div>
          <ContenitorePeriodo className="group space-y-2 rounded-lg border p-3">
            {previsionale ? titoloPeriodo : <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              {titoloPeriodo}
              <span className="ml-auto text-xs text-muted-foreground">{periodo ? "Date impostate" : "Facoltativo"}</span>
              <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
            </summary>}
            <div className={previsionale ? "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
              <label className="min-w-0 space-y-1 text-sm">Dal<Input aria-label="Dal" className="w-full min-w-0" type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
              <label className="min-w-0 space-y-1 text-sm">Al<Input aria-label="Al" className="w-full min-w-0" type="date" min={dal || undefined} value={al} onChange={(e) => setAl(e.target.value)} /></label>
              <label className="space-y-1 text-sm">Ore al giorno per persona<Input inputMode="decimal" value={oreGiorno} onChange={(e) => { setOreGiorno(e.target.value); setQuoteScritte({}); }} /></label>
            </div>
            <p className="text-xs text-muted-foreground">Calendario di cantiere · {calendario.sabato ? "sabato incluso" : "lunedì–venerdì"} · festività escluse</p>
            {mostraDateFase && <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={salvaDate} disabled={inCorso || inRipresa} onCheckedChange={(si) => setSalvaDate(si === true)} />Applica il periodo alle lavorazioni selezionate
            </label>}
            {periodo && !valido && <p role="alert" className="text-sm text-destructive">Controlla le date. Serve almeno un giorno lavorativo e un numero di ore maggiore di 0 e fino a 24.</p>}
          </ContenitorePeriodo>
        </div>
        {previsionale && bersagli.length > 1 && <section className="space-y-2 rounded-lg border p-3" aria-label="Ripartizione delle ore">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Ripartizione delle ore</h4>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setQuoteScritte({})}>Dividi in parti uguali</Button>
          </div>
          <div className="divide-y">
            {bersagli.map((a, i) => <label key={a.id} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span>{a.nome}</span>
              <span className="flex shrink-0 items-center gap-1">
                <Input className="h-8 w-24 text-right" inputMode="decimal" aria-label={`Ore giornaliere per ${a.nome}`}
                  value={quoteScritte[a.id] ?? String(quoteBase[i] / 1e6).replace(".", ",")}
                  onChange={(e) => setQuoteScritte((prima) => ({ ...prima, [a.id]: e.target.value }))} /> h
              </span>
            </label>)}
          </div>
          <p className={`text-xs ${quoteValide ? "text-muted-foreground" : "text-destructive"}`} aria-live="polite">
            {sommaQuote.toLocaleString("it-IT", { maximumFractionDigits: 6 })} di {ore?.toLocaleString("it-IT", { maximumFractionDigits: 6 }) ?? "—"} h/giorno per persona.
            {!quoteValide && " Assegna una quota positiva a ogni lavorazione e completa il totale."}
          </p>
        </section>}
      </fieldset>

      {previsionale?.disponibilita && profili.length > 0 && legami.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">Impossibile verificare tutti i componenti della squadra.
          <Button type="button" size="sm" variant="outline" onClick={() => void legami.refetch()}>Riprova</Button>
        </div>
      )}
      {previsionale?.disponibilita && previsionale.chiaveDisponibilita && !!giorniDiLavoro.length && !!partecipanti.length && !legami.isLoading && !legami.isError && (
        <DisponibilitaOperai chiave={previsionale.chiaveDisponibilita} leggi={previsionale.disponibilita} persone={partecipanti}
          nomi={nomi} giorni={giorniDiLavoro} dal={dal} al={al} ore={ore ?? 0} />
      )}
      {previsionale && periodo && (giorni ?? 0) > 0 && !giorniDiLavoro.length && <p role="alert" className="text-sm text-destructive">Scegli un periodo di massimo 366 giorni.</p>}
      {periodo && valido && partecipanti.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Manodopera prevista</p>
              <p className="text-sm text-muted-foreground">{partecipanti.length} persone × {giorni} giorni × {ore} ore · {(partecipanti.length * oreTotali).toLocaleString("it-IT")} ore totali</p>
            </div>
            {tariffe.allowed && <strong className="text-xl tabular-nums text-slate-900">{caricaTariffe ? "Calcolo…" : previsione.mancanti || tariffe.isError || (previsionale && !quoteValide) ? "Da completare" : formatCurrency(costoRipartito ?? previsione.costo)}</strong>}
          </div>
          {!previsionale && bersagli.length > 1 && <p className="mt-1 text-xs text-muted-foreground">Le ore di ciascuna persona sono ripartite tra {bersagli.length} lavorazioni.</p>}
          {tariffe.allowed && !caricaTariffe && previsione.mancanti > 0 && <p className="mt-1 text-xs text-amber-800">Tariffa da verificare per {previsione.mancanti} persone.</p>}
          {tariffe.allowed && tariffe.isError && <Button size="sm" variant="ghost" onClick={() => void tariffe.refetch()}>Riprova a leggere i costi orari</Button>}
          {parziali && <p className="mt-1 text-xs text-muted-foreground">La stima riguarda l’intero periodo. Il salvataggio aggiunge solo le assegnazioni mancanti.</p>}
          {tariffe.allowed && tariffe.data && <details className="mt-2 border-t border-blue-100 pt-2 text-xs">
            <summary className="cursor-pointer font-medium text-primary">Tariffe orarie considerate</summary>
            <ul className="mt-1 space-y-1">
              {partecipanti.map((id) => <li key={id} className="flex justify-between gap-2">
                <span>{nomi.get(id) ?? "Operaio"}</span>
                <span>{tariffe.data.get(id) == null ? "Da impostare" : `${formatCurrency(tariffe.data.get(id)!)} / h`}</span>
              </li>)}
            </ul>
          </details>}
          {previsionale ? <p className="mt-1 text-xs text-muted-foreground">Il salvataggio registra date, ore e tariffe per le lavorazioni selezionate.</p>
            : tariffe.allowed && (squadreScelte.length > 0 || haVoci) && <p className="mt-1 text-xs text-muted-foreground">Apri Previsionale per salvare la stima di squadre e singole voci.</p>}
        </div>
      )}
      {esito && <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{esito}</p>}
      <AzioniLavorazioni><div className="flex flex-wrap justify-end gap-2">
        {inRipresa && !inCorso && <Button variant="outline" onClick={() => { pianoInCorso.current = null; setInRipresa(false); onOccupato(false); setEsito("Le operazioni già confermate restano salvate."); }}>Interrompi</Button>}
        <Button type="button" disabled={inCorso || (!inRipresa && (!bersagli.length || senzaSottofase || (!previsionale && haVoci && !puoVoci) || !puoCalcolare || !valido || dateParziali || (salvaDate && !periodo)
          || (!personeScelte.length && !squadreScelte.length && !salvaDate) || (!!oreTotali && tariffe.allowed && caricaTariffe)))} onClick={() => void salva()}>
          {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {previsionale ? "Salva previsionale" : inRipresa ? "Completa il salvataggio"
            : salvaDate && !personeScelte.length && !squadreScelte.length ? "Salva periodo" : "Salva assegnazione"}
        </Button>
      </div></AzioniLavorazioni>
    </section>
  );
}
