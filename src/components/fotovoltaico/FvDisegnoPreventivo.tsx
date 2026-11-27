import { UniformSelect } from "@/components/ui/uniform-select";
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Download, Grid2X2, Hand, Home, LayoutGrid, MousePointer2, PencilRuler, Plus, Redo2, RotateCw, Trash2, Undo2 } from "lucide-react";
import {
  aggiornaOstacoloConPosa, areaPoligono, arrotondaMetro, creaDisegnoTetto, disponiModuliAutomaticamente, disponiModuliOttimizzati, ingombroModulo,
  limiteModuliDisegno,limitiDisegno, pannelliDaRivedere, poligonoValido, posizioneModuloValida, puntoNelPoligono,
  rettangoloNellaFalda, svgDisegnoCommerciale,
  type DisegnoCommercialeFv, type ModuloPosatoFv, type OstacoloFv, type PuntoFv,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import "./FvDisegnoPreventivo.css";
import { svgVistaTetto } from "../../../supabase/functions/_shared/fvRenderCommerciale";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Tool = "seleziona" | "pannello" | "falda" | "ostacolo";
export type FvDisegnoPreventivoProps = {
  companyId?: string;
  value: DisegnoCommercialeFv | null;
  onChange: (value: DisegnoCommercialeFv) => void;
  modulo: DisegnoCommercialeFv["modulo"];
  potenzaModuloW: number;
  quantitaIniziale: number;
  modificabile: boolean;
  nomeModulo?: string;
  consentiCapannone?: boolean;
  localita?: {lat:number;lng:number}|null;
  riepilogoProposta?: (piano:DisegnoCommercialeFv)=>{kwp:number;totale:number|null};
  contorniBloccati?: boolean;
  visteAggiuntive?: Array<{ id: string; nome: string; secondaria?: boolean; contenuto: ReactNode | ((salva: (piano: DisegnoCommercialeFv) => void) => ReactNode) }>;
  vistaIniziale?: string;
};
type Drag = { tipo: "pannello"; id: string; start: PuntoFv; original: ModuloPosatoFv } | { tipo: "ostacolo"; id: string; start: PuntoFv; original: OstacoloFv } | { tipo: "vertice"; faldaId: string; indice: number };
const num = (n: number, max = 2) => n.toLocaleString(intlCampo(), { maximumFractionDigits: max });
function ContenutoVista({contenuto,onChange}:{contenuto:NonNullable<FvDisegnoPreventivoProps["visteAggiuntive"]>[number]["contenuto"];onChange:(piano:DisegnoCommercialeFv)=>void}) {
  return <>{typeof contenuto === "function" ? contenuto(onChange) : contenuto}</>;
}

export function FvDisegnoPreventivo({ value, onChange, modulo, potenzaModuloW, quantitaIniziale, modificabile, nomeModulo, contorniBloccati=false, visteAggiuntive=[], vistaIniziale }: FvDisegnoPreventivoProps) {
  const tr = useT();
  const [vistaExtra, setVistaExtra] = useState<string | null>(vistaIniziale ?? null);
  const vistaAggiuntiva = visteAggiuntive.find(v => v.id === vistaExtra);
  const [vistaTetto, setVistaTetto] = useState(false);
  const [latoVista, setLatoVista] = useState(0);
  const [copertura, setCopertura] = useState<"antracite" | "tegole">("antracite");
  const [sezione, setSezione] = useState<"tetto" | "moduli">(value ? "moduli" : "tetto");
  const [tool, setTool] = useState<Tool>("seleziona");
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const [faldaScelta, setFaldaAttiva] = useState("");
  const faldaAttiva = value?.falde.some(f=>f.id===faldaScelta) ? faldaScelta : "";
  const [orient, setOrient] = useState(false);
  const [richiesti, setRichiesti] = useState(value?.pannelli.length || Math.max(1, quantitaIniziale));
  const [rotazioneNuovi, setRotazioneNuovi] = useState(0);
  const [punti, setPunti] = useState<PuntoFv[]>([]);
  const [nota, setNota] = useState("");
  const [undo, setUndo] = useState<DisegnoCommercialeFv[]>([]);
  const [redo, setRedo] = useState<DisegnoCommercialeFv[]>([]);
  const [bozza, setBozza] = useState<DisegnoCommercialeFv | null>(null);
  const [tipoTetto, setTipoTetto] = useState<"due_falde" | "singola" | "elle">(value?.falde.length === 1 ? value.falde[0].punti.length === 6 ? "elle" : "singola" : "due_falde");
  const [larghezza, setLarghezza] = useState(value ? limitiDisegno(value).w : 12);
  const [altezza, setAltezza] = useState(value ? limitiDisegno(value).h : 8);
  const moduliAttivi=value?.pannelli.filter(p=>!faldaAttiva||p.faldaId===faldaAttiva).length;
  const [quantitaPrecedente, setQuantitaPrecedente] = useState(moduliAttivi);
  if (quantitaPrecedente !== moduliAttivi) {
    setQuantitaPrecedente(moduliAttivi);
    if (moduliAttivi !== undefined) setRichiesti(moduliAttivi);
  }
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const draftRef = useRef<DisegnoCommercialeFv | null>(null);
  const idPrefix = useId().replace(/[^a-z0-9]/gi, "");
  const seriale = useRef(0);
  const id = () => idPrefix + "-" + (++seriale.current);
  const piano = bozza ?? value;
  const salva = (next: DisegnoCommercialeFv) => {
    if (!modificabile) return;
    if (value) setUndo(h => [...h.slice(-29), value]);
    setRedo([]); setBozza(null); draftRef.current = null;
    onChange({ ...next, modulo });
  };
  const ripristina = (next: DisegnoCommercialeFv) => {
    const bounds = limitiDisegno(next);
    setLarghezza(bounds.w); setAltezza(bounds.h);
    setTipoTetto(next.falde.length === 1 ? next.falde[0].punti.length === 6 ? "elle" : "singola" : "due_falde");
    setFaldaAttiva(""); setRichiesti(next.pannelli.length); setSelezionato(null); setNota("");
    onChange({ ...next, modulo });
  };
  const scegliFalda = (faldaId: string) => {
    setFaldaAttiva(faldaId);
    if (value) setRichiesti(value.pannelli.filter(p => !faldaId || p.faldaId === faldaId).length);
  };
  const scegliTool = (t: Tool) => { setTool(t); setVistaExtra(null); setVistaTetto(false); setPunti([]); setNota(""); };
  const applicaOstacolo = (o: OstacoloFv) => {
    if (!value) return;
    const next = aggiornaOstacoloConPosa(value, o);
    if (!next) { setNota(tr("L’ostacolo deve restare nella falda senza sovrapporsi ad altri ostacoli.")); return; }
    salva(next); setSelezionato(o.id);
    setNota(next.pannelli.length < value.pannelli.length ? tr("Ostacolo aggiornato. Posa ricalcolata: {n} moduli dei {prima} precedenti. Controlla il totale prima di confermare.", { n: next.pannelli.length, prima: value.pannelli.length }) : tr("Ostacolo aggiornato. Posa ricalcolata: {n} moduli. Controlla il totale prima di confermare.", { n: next.pannelli.length }));
  };
  const preset = (tipo = tipoTetto, w = larghezza, h = altezza) => {
    const schema = creaDisegnoTetto(tipo, w, h, modulo);
    const ostacoli = value?.ostacoli ?? [];
    if (ostacoli.some(o => !schema.falde.some(f => rettangoloNellaFalda(o, f, 0)))) {
      setNota(tr("Un ostacolo resterebbe fuori dal nuovo tetto. Rimuovilo o modifica le misure prima di applicare lo schema."));
      return;
    }
    const nuovo = disponiModuliAutomaticamente({ ...schema, ostacoli }, value?.pannelli.length ?? quantitaIniziale, orient);
    salva(nuovo); setTipoTetto(tipo); setFaldaAttiva(""); setSelezionato(null);
    const richiesti = value?.pannelli.length ?? quantitaIniziale;
    setNota(nuovo.pannelli.length < richiesti ? tr("Nel nuovo tetto entrano {n} dei {richiesti} moduli. Controlla quantità e totale prima di confermare.", { n: nuovo.pannelli.length, richiesti }) : tr("Schema aggiornato. Misure e disposizione sono da confermare con sopralluogo."));
  };
  if (!piano) return <section className="fv-roof-start"><Home size={28} /><h3>{tr("Disegna il tetto per il preventivo")}</h3>
    <p>{tr("Parti da uno schema, inserisci le misure e disponi i pannelli. Quantità e potenza seguono il disegno.")}</p>
    <button type="button" className="fv-roof-primary" disabled={!modificabile} onClick={() => preset()}>{tr("Crea il disegno del tetto")}</button></section>;
  const b = limitiDisegno(piano), margine = 1.2;
  const view = { x: b.x - margine, y: b.y - margine, w: b.w + 2 * margine, h: b.h + 2 * margine };
  const punto = (e: ReactPointerEvent): PuntoFv => {
    const el = svg.current!;
    const rect = el.getBoundingClientRect();
    // preserveAspectRatio meet: sottrai le bande, mantenendo lo stesso fattore sui due assi.
    const scala = Math.min(rect.width / view.w, rect.height / view.h) || 1;
    const ox = (rect.width - view.w * scala) / 2, oy = (rect.height - view.h * scala) / 2;
    return { x: arrotondaMetro(view.x + (e.clientX - rect.left - ox) / scala), y: arrotondaMetro(view.y + (e.clientY - rect.top - oy) / scala) };
  };
  const snap = (p: PuntoFv) => ({ x: Math.round(p.x * 20) / 20, y: Math.round(p.y * 20) / 20 });
  const cattura = (e: ReactPointerEvent) => { e.preventDefault(); e.stopPropagation(); svg.current?.setPointerCapture?.(e.pointerId); };
  const draft = (next: DisegnoCommercialeFv) => { draftRef.current = next; setBozza(next); };
  const muovi = (e: ReactPointerEvent) => {
    if (!drag.current || !value) return;
    const pos = snap(punto(e)), d = drag.current;
    if (d.tipo === "pannello") {
      const next = value.pannelli.map(p => {
        if (p.id !== d.id) return p;
        const mosso = { ...p, x: arrotondaMetro(d.original.x + pos.x - d.start.x), y: arrotondaMetro(d.original.y + pos.y - d.start.y) };
        const destinazione = value.falde.find(f => posizioneModuloValida(value, { ...mosso, faldaId: f.id }));
        return { ...mosso, faldaId: destinazione?.id ?? p.faldaId };
      });
      draft({ ...value, pannelli: next });
    } else if (d.tipo === "ostacolo") draft({ ...value, ostacoli: value.ostacoli.map(o => o.id !== d.id ? o : { ...o, x: arrotondaMetro(d.original.x + pos.x - d.start.x), y: arrotondaMetro(d.original.y + pos.y - d.start.y) }) });
    else draft({ ...value, falde: value.falde.map(f => f.id !== d.faldaId ? f : { ...f, punti: f.punti.map((p, i) => i === d.indice ? pos : p) }) });
  };
  const rilascia = () => {
    const d = drag.current, next = draftRef.current;
    drag.current = null; setBozza(null); draftRef.current = null;
    if (!d || !next) return;
    if (d.tipo === "ostacolo") { applicaOstacolo(next.ostacoli.find(o => o.id === d.id)!); return; }
    const valido = d.tipo === "pannello"
      ? posizioneModuloValida(next, next.pannelli.find(p => p.id === d.id)!)
      : next.falde.every(f => poligonoValido(f.punti));
    if (valido) { salva(next); setNota(""); }
    else setNota(d.tipo === "pannello" ? tr("Il modulo deve restare nella falda, libero da ostacoli e sovrapposizioni.") : tr("La falda deve avere un contorno semplice, senza incroci."));
  };
  const aggiungi = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!modificabile || drag.current || tool === "seleziona") { if (tool === "seleziona") setSelezionato(null); return; }
    const pos = snap(punto(e));
    if (tool === "falda") { setPunti(v => v.length < 64 ? [...v, pos] : v); return; }
    const falda = piano.falde.find(f => (!faldaAttiva || f.id === faldaAttiva) && puntoNelPoligono(pos, f.punti));
    if (!falda) { setNota(tr("Fai clic all’interno della falda selezionata.")); return; }
    if (tool === "ostacolo") {
      if (piano.ostacoli.length >= 100) { setNota(tr("Puoi inserire fino a 100 ostacoli.")); return; }
      const o = { id: id(), ...pos, w: 1, h: 1 };
      if (!rettangoloNellaFalda(o, falda, 0)) { setNota(tr("L’ostacolo deve restare completamente nella falda.")); return; }
      applicaOstacolo(o); return;
    }
    if (piano.pannelli.length >= limiteModuliDisegno(piano)) { setNota(tr("Limite di {n} moduli raggiunto.", { n: limiteModuliDisegno(piano) })); return; }
    const p = { id: id(), faldaId: falda.id, ...pos, orizzontale: orient, rotazione: rotazioneNuovi };
    if (!posizioneModuloValida(piano, p)) { setNota(tr("Qui il modulo non entra: rispetta il bordo e lascia libero lo spazio degli altri pannelli.")); return; }
    salva({ ...piano, pannelli: [...piano.pannelli, p] }); setSelezionato(p.id); setNota(tr("Modulo aggiunto alla disposizione."));
  };
  const chiudi = () => {
    if (!poligonoValido(punti)) { setNota(tr("Disegna almeno tre punti e un contorno senza incroci.")); return; }
    if (!faldaAttiva && piano.falde.length >= 12) { setNota(tr("Puoi disegnare fino a 12 falde.")); return; }
    const precedente = piano.falde.find(f => f.id === faldaAttiva);
    const nuova = { id: precedente?.id ?? id(), nome: precedente?.nome ?? "Falda " + (piano.falde.length + 1), punti };
    salva({ ...piano, falde: precedente ? piano.falde.map(f => f.id === precedente.id ? nuova : f) : [...piano.falde, nuova] }); setFaldaAttiva(nuova.id); setPunti([]); setTool("seleziona"); setNota(precedente ? tr("Contorno della falda aggiornato. Controlla i moduli evidenziati.") : tr("Falda aggiunta. Ora puoi disporre i pannelli."));
  };
  const pSel = piano.pannelli.find(p => p.id === selezionato);
  const oSel = piano.ostacoli.find(o => o.id === selezionato);
  const cambiaPannello = (patch: Partial<ModuloPosatoFv>) => {
    if (!pSel) return;
    const p = { ...pSel, ...patch };
    if (!posizioneModuloValida(piano, p)) { setNota(tr("Posizione non disponibile: il modulo uscirebbe dalla falda o si sovrapporrebbe.")); return; }
    salva({ ...piano, pannelli: piano.pannelli.map(v => v.id === p.id ? p : v) }); setNota("");
  };
  const elimina = () => { salva({ ...piano, pannelli: piano.pannelli.filter(p => p.id !== selezionato), ostacoli: piano.ostacoli.filter(o => o.id !== selezionato) }); setSelezionato(null); setNota(tr("Elemento rimosso dalla disposizione.")); };
  const bad = new Set(pannelliDaRivedere(piano));
  const scarica = () => {
    const url = URL.createObjectURL(new Blob([vistaTetto ? svgVistaTetto(piano, latoVista, piano.mappa ? undefined : copertura) : svgDisegnoCommerciale(piano)], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = "disposizione-pannelli.svg"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className={"fv-roof-editor" + (vistaTetto ? " fv-roof-render-mode" : "")} aria-label={tr("Disegno commerciale del tetto")}>
    <header className="fv-roof-heading"><div><h3>{tr("Disposizione dei pannelli")}</h3><p>{tr("Imposta le falde e posiziona i moduli del pannello selezionato.")}</p></div>
      <div className="fv-roof-heading-actions"><div className="fv-roof-view-switch" role="group" aria-label={tr("Vista del tetto")}><button type="button" aria-pressed={!vistaTetto && !vistaExtra} onClick={() => {setVistaTetto(false);setVistaExtra(null);}}>{contorniBloccati ? tr("Pianta delle falde") : tr("Pianta e posa")}</button>{(!contorniBloccati || !!piano.mappa) && <button type="button" aria-pressed={vistaTetto} onClick={() => {setVistaTetto(true);setVistaExtra(null);}}>{tr("Vista della casa")}</button>}{visteAggiuntive.filter(v => !v.secondaria).map(v => <button key={v.id} type="button" aria-pressed={vistaExtra === v.id} onClick={() => {setVistaTetto(false);setVistaExtra(v.id);}}>{v.nome}</button>)}{visteAggiuntive.some(v => v.secondaria) && <details className="fv-roof-more-views"><summary>{tr("Altri strumenti")}</summary><div>{visteAggiuntive.filter(v => v.secondaria).map(v => <button key={v.id} type="button" aria-pressed={vistaExtra === v.id} onClick={() => {setVistaTetto(false);setVistaExtra(v.id);}}>{v.nome}</button>)}</div></details>}</div><button type="button" onClick={scarica} title={tr("Scarica il disegno in SVG")}><Download size={16} /> {tr("Scarica tavola")}</button></div></header>
    <div className="fv-roof-body"><aside className="fv-roof-controls">
      <div className="fv-roof-sections" role="group" aria-label={tr("Comandi del disegno")}><button type="button" disabled={contorniBloccati} aria-pressed={sezione === "tetto"} onClick={() => setSezione("tetto")}>{tr("Tetto e misure")}</button><button type="button" aria-pressed={sezione === "moduli"} onClick={() => setSezione("moduli")}>{tr("Pannelli e posa")}</button></div>
      <div className="fv-roof-control-section" hidden={sezione !== "tetto"}><h4>01 <span>{tr("Forma del tetto")}</span></h4><div className="fv-roof-presets">{([
        ["due_falde", "Due falde"], ["singola", "Falda singola"], ["elle", "Tetto a L"],
      ] as const).map(([key, label]) => <button type="button" key={key} disabled={!modificabile} aria-pressed={tipoTetto === key} onClick={() => preset(key)}><Home size={20} /><span>{tr(label)}</span></button>)}</div>
        <div className="fv-roof-measures"><label>{tr("Larghezza")} <span>m</span><input aria-label={tr("Larghezza del tetto")} type="number" min={3} max={100} step={0.5} disabled={!modificabile} value={larghezza} onChange={e => setLarghezza(Number(e.target.value))} /></label><label>{tr("Profondità")} <span>m</span><input aria-label={tr("Profondità del tetto")} type="number" min={3} max={100} step={0.5} disabled={!modificabile} value={altezza} onChange={e => setAltezza(Number(e.target.value))} /></label></div>
        <button className="fv-roof-text-button" type="button" disabled={!modificabile || !(larghezza >= 3 && larghezza <= 100 && altezza >= 3 && altezza <= 100)} onClick={() => preset()}>{tr("Applica misure e ridisponi")}</button>
        <p className="fv-roof-hint">{tr("Misure dello schema in pianta. Usa il rilievo per rappresentare il tetto del cliente.")}</p>
      </div>
      <div className="fv-roof-control-section" hidden={sezione !== "moduli"}><h4>02 <span>{tr("Disposizione")}</span></h4>
        <label className="fv-roof-label">{tr("Falde da riempire")}<UniformSelect aria-label={tr("Falde da riempire")} disabled={!modificabile} value={faldaAttiva} onChange={e => scegliFalda(e.target.value)}><option value="">{tr("Tutte le falde")}</option>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</UniformSelect></label>
        <div className="fv-roof-orient">{[[false, "Verticale"], [true, "Orizzontale"]].map(([key, label]) => <button type="button" key={String(label)} disabled={!modificabile} aria-pressed={orient === key} onClick={() => setOrient(key as boolean)}>{key ? <LayoutGrid size={15} /> : <Grid2X2 size={15} />}{tr(String(label))}</button>)}</div>
        <label className="fv-roof-label">{tr("Rotazione nuovi pannelli (°)")}<input aria-label={tr("Rotazione nuovi pannelli in pianta")} type="number" min={0} max={359} step={1} value={rotazioneNuovi} disabled={!modificabile || (!!piano.industriale && piano.industriale.posa !== "aderente")} onChange={e => { const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n<360)setRotazioneNuovi(n); }}/></label>
        <label className="fv-roof-label">{faldaAttiva ? tr("Moduli nella falda selezionata") : tr("Moduli totali da disporre")}<input aria-label={tr("Moduli da disporre")} type="number" min={0} max={limiteModuliDisegno(piano)} step={1} disabled={!modificabile} value={richiesti} onChange={e => setRichiesti(Number(e.target.value))} /></label>
        <button type="button" className="fv-roof-primary" disabled={!modificabile || !Number.isSafeInteger(richiesti) || richiesti < 0 || richiesti > limiteModuliDisegno(piano)} onClick={() => {
          const next = disponiModuliAutomaticamente(piano, richiesti, orient, faldaAttiva || undefined, rotazioneNuovi); salva(next); setSelezionato(null);
          const posati = next.pannelli.filter(p => !faldaAttiva || p.faldaId === faldaAttiva).length;
          setNota(posati < richiesti
            ? (faldaAttiva
              ? tr("Entrano {posati} dei {richiesti} moduli richiesti nella falda selezionata. Totale disposizione: {totale}.", { posati, richiesti, totale: next.pannelli.length })
              : tr("Entrano {posati} dei {richiesti} moduli richiesti. Totale disposizione: {totale}.", { posati, richiesti, totale: next.pannelli.length }))
            : (faldaAttiva
              ? tr("Disposizione aggiornata: {totale} moduli totali; altre falde conservate.", { totale: next.pannelli.length })
              : tr("Disposizione aggiornata: {totale} moduli totali.", { totale: next.pannelli.length })));
        }}><Grid2X2 size={16} /> {tr("Disponi automaticamente")}</button>
        <button type="button" disabled={!modificabile || !Number.isSafeInteger(richiesti) || richiesti < 0 || richiesti > limiteModuliDisegno(piano)} onClick={() => {
          const verticale = disponiModuliOttimizzati(piano, richiesti, false, faldaAttiva || undefined, rotazioneNuovi), orizzontale = disponiModuliOttimizzati(piano, richiesti, true, faldaAttiva || undefined, rotazioneNuovi);
          const migliore = orizzontale.pannelli.length > verticale.pannelli.length ? orizzontale : verticale;
          salva(migliore); setSelezionato(null);
          const conta = (p: DisegnoCommercialeFv) => p.pannelli.filter(m => !faldaAttiva || m.faldaId === faldaAttiva).length;
          setNota(faldaAttiva
            ? tr("Confronto pose: {verticali} verticali / {orizzontali} orizzontali. Applicata la proposta con {moduli} moduli; altre falde conservate. Capacità indicativa, da verificare sul tetto.", { verticali: conta(verticale), orizzontali: conta(orizzontale), moduli: conta(migliore) })
            : tr("Confronto pose: {verticali} verticali / {orizzontali} orizzontali. Applicata la proposta con {moduli} moduli. Capacità indicativa, da verificare sul tetto.", { verticali: conta(verticale), orizzontali: conta(orizzontale), moduli: conta(migliore) }));
        }}>{tr("Confronta pose e allineamenti")}</button>
        <label className="fv-roof-label">{tr("Distanza dal bordo")} <span>m</span><input aria-label={tr("Distanza dal bordo")} type="number" min={0} max={2} step={0.05} value={piano.distanzaBordo} disabled={!modificabile} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 2) salva({ ...piano, distanzaBordo: n }); }} /></label>
      </div>
      <div className="fv-roof-module"><div className="fv-roof-mini-panel" /><div><strong>{nomeModulo || tr("Modulo selezionato")}</strong><span>{potenzaModuloW>0?tr("{potenzaModuloW} Wp", { potenzaModuloW: String(num(potenzaModuloW,0) ?? "") }):tr("Potenza da definire")} · {num(modulo.corto)} × {num(modulo.lungo)} m</span><small>{modulo.stimato ? tr("Misure indicative: completa la scheda del pannello.") : tr("Dimensioni dalla scheda del pannello.")}</small></div></div>
    </aside><div className="fv-roof-workspace">{vistaTetto ? <div className="fv-roof-toolbar"><span className="fv-roof-hint">{piano.mappa ? tr("Casa ricostruita dalle falde tracciate sulla mappa") : tr("Pannelli full black · resa illustrativa")}</span><div className="fv-roof-tools">{!piano.mappa && <UniformSelect aria-label={tr("Copertura della vista illustrativa")} value={copertura} onChange={e => setCopertura(e.target.value as "antracite" | "tegole")}><option value="antracite">{tr("Tetto antracite")}</option><option value="tegole">{tr("Tetto in tegole")}</option></UniformSelect>}<button type="button" onClick={() => setLatoVista(v => (v + 1) % 4)}><RotateCw size={16} /> {tr("Ruota vista")}</button></div></div> : <div className="fv-roof-toolbar"><div className="fv-roof-tools">{([
      ["seleziona", "Seleziona e sposta", MousePointer2], ["pannello", "Aggiungi pannello", Plus], ["falda", "Disegna una falda", PencilRuler], ["ostacolo", "Aggiungi ostacolo", Home],
    ] as const).map(([t, label, Icon]) => <button key={t} type="button" hidden={contorniBloccati && t === "falda"} title={tr(label)} aria-label={tr(label)} aria-pressed={tool === t} disabled={!modificabile||(t==="pannello"&&!!piano.industriale&&piano.industriale.posa!=="aderente")} onClick={() => scegliTool(t)}><Icon size={17} /><span>{t === "seleziona" ? tr("Seleziona") : t === "pannello" ? tr("Pannello") : t === "falda" ? tr("Falda") : tr("Ostacolo")}</span></button>)}</div>
      <div className="fv-roof-tools"><button type="button" aria-label={tr("Annulla ultima modifica")} title={tr("Annulla")} disabled={!modificabile || !undo.length} onClick={() => { const prev = undo[undo.length - 1]; setUndo(h => h.slice(0, -1)); if (value) setRedo(h => [...h, value]); ripristina(prev); }}><Undo2 size={17} /></button><button type="button" aria-label={tr("Ripeti modifica")} title={tr("Ripeti")} disabled={!modificabile || !redo.length} onClick={() => { const next = redo[redo.length - 1]; setRedo(h => h.slice(0, -1)); if (value) setUndo(h => [...h, value]); ripristina(next); }}><Redo2 size={17} /></button></div></div>}
      {vistaAggiuntiva ? <div className="fv-roof-extra"><ContenutoVista contenuto={vistaAggiuntiva.contenuto} onChange={salva}/></div> : vistaTetto ? <div className="fv-roof-render" dangerouslySetInnerHTML={{ __html: svgVistaTetto(piano, latoVista, piano.mappa ? undefined : copertura) }} /> : <div className="fv-roof-canvas"><svg ref={svg} viewBox={[view.x, view.y, view.w, view.h].join(" ")} role="group" aria-label={tr("Pianta del tetto con disposizione dei pannelli")} onPointerDown={aggiungi} onPointerMove={muovi} onPointerUp={rilascia} onPointerCancel={() => { drag.current = null; draftRef.current = null; setBozza(null); }} style={{ touchAction: "none", cursor: tool === "seleziona" ? "default" : "crosshair" }}>
        <defs><pattern id={idPrefix + "grid"} width={1} height={1} patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dce5eb" strokeWidth=".015" /><circle cx={0} cy={0} r={0.025} fill="#c4d1dc" /></pattern><linearGradient id={idPrefix + "panel"} x2="1" y2="1"><stop stopColor="#303a40" /><stop offset=".45" stopColor="#171e23" /><stop offset="1" stopColor="#0d1317" /></linearGradient></defs>
        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={"url(#" + idPrefix + "grid)"} />
        {piano.falde.map((f, i) => <g key={f.id}><polygon points={f.punti.map(p => p.x + "," + p.y).join(" ")} fill={i % 2 ? "#dce3e7" : "#eaf0f2"} stroke={faldaAttiva === f.id ? "#ea7a21" : "#8a9ba6"} strokeWidth=".045" strokeLinejoin="round" /><text x={f.punti.reduce((n, p) => n + p.x, 0) / f.punti.length} y={Math.min(...f.punti.map(p => p.y)) + 0.22} fontSize=".15" fill="#64748b" textAnchor="middle">{f.nome.toUpperCase()}</text>
          {tool === "falda" && f.punti.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={0.09} fill="white" stroke="#e57a20" strokeWidth=".035" aria-label={"Vertice " + (j + 1) + " " + f.nome} onPointerDown={e => { if (!modificabile) return; cattura(e); drag.current = { tipo: "vertice", faldaId: f.id, indice: j }; }} />)}</g>)}
        {piano.ostacoli.map(o => <g key={o.id} role="button" tabIndex={0} aria-label={"Ostacolo " + o.id} onPointerDown={e => { if (tool !== "seleziona") return; e.stopPropagation(); setSelezionato(o.id); if (modificabile) { cattura(e); drag.current = { tipo: "ostacolo", id: o.id, start: snap(punto(e)), original: o }; } }} onKeyDown={e => { if (e.key === "Enter") setSelezionato(o.id); if (modificabile && e.key === "Delete") { salva({ ...piano, ostacoli: piano.ostacoli.filter(v => v.id !== o.id) }); } }}><rect x={o.x} y={o.y} width={o.w} height={o.h} rx=".04" fill="#d9af82" stroke={selezionato === o.id ? "#e57a20" : "#9d7953"} strokeWidth=".05" /><path d={"M" + o.x + " " + o.y + "l" + o.w + " " + o.h + " M" + (o.x + o.w) + " " + o.y + "l" + (-o.w) + " " + o.h} stroke="#9d7953" strokeWidth=".025" /></g>)}
        {piano.pannelli.map((p, i) => { const r = ingombroModulo(p, modulo); return <g key={p.id} transform={`rotate(${p.rotazione ?? 0} ${r.x+r.w/2} ${r.y+r.h/2})`} role="button" tabIndex={0} aria-label={"Modulo " + (i + 1)} onPointerDown={e => { if (tool !== "seleziona") return; e.stopPropagation(); setSelezionato(p.id); if (!modificabile || tool !== "seleziona") return; cattura(e); drag.current = { tipo: "pannello", id: p.id, start: snap(punto(e)), original: p }; }} onKeyDown={e => { if (e.key === "Enter" || e.key === " "){e.preventDefault();setSelezionato(p.id);} if (!modificabile) return; if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); salva({ ...piano, pannelli: piano.pannelli.filter(v => v.id !== p.id) }); } }} style={{ cursor: modificabile ? "grab" : "default" }}>
          <rect x={r.x + .04} y={r.y + .04} width={r.w} height={r.h} rx=".04" fill="#6b7d8a" opacity=".22" /><rect x={r.x} y={r.y} width={r.w} height={r.h} rx=".035" fill={bad.has(p.id) ? "#b44242" : "url(#" + idPrefix + "panel)"} stroke={selezionato === p.id ? "#f98b36" : "#566168"} strokeWidth={selezionato === p.id ? .06 : .026} />
          <path d={"M" + (r.x + r.w / 2) + " " + r.y + "v" + r.h + " M" + r.x + " " + (r.y + r.h / 3) + "h" + r.w + " M" + r.x + " " + (r.y + 2 * r.h / 3) + "h" + r.w} fill="none" stroke="#7e8b90" strokeOpacity=".3" strokeWidth=".009" /><text x={r.x + r.w / 2} y={r.y + r.h / 2 + .06} textAnchor="middle" fill="#c5cfd2" fontSize=".14" pointerEvents="none">{i + 1}</text></g>; })}
        {punti.length > 0 && <g><polyline points={punti.map(p => p.x + "," + p.y).join(" ")} fill="rgba(249,115,22,.08)" stroke="#f07829" strokeWidth=".05" strokeDasharray=".12 .08" />{punti.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r=".07" fill="#f07829" />)}</g>}
        <g transform={"translate(" + b.x + " " + (b.y + b.h + .65) + ")"}><path d={"M0 -.1v.2 M0 0h" + b.w + " M" + b.w + " -.1v.2"} stroke="#8c9da9" strokeWidth=".02" /><rect x={b.w / 2 - .5} y={-.13} width={1} height={.26} fill="#f8fbfc" /><text x={b.w / 2} y={.055} textAnchor="middle" fontSize=".17" fill="#607687">{num(b.w)} m</text></g>
      </svg>
      <span className="fv-roof-scale">{tr("Scala metrica · vista in pianta")}</span><span className="fv-roof-canvas-hint"><Hand size={13} />{tool === "pannello" ? tr("Fai clic nella falda per aggiungere") : tool === "falda" ? tr("Fai clic per tracciare il contorno") : tool === "ostacolo" ? tr("Fai clic per inserire un ostacolo") : tr("Seleziona e trascina un pannello")}</span></div>}
      {tool === "falda" && <div className="fv-roof-selection"><label>{tr("Contorno")} <UniformSelect aria-label={tr("Falda da disegnare")} value={faldaAttiva} disabled={!modificabile} onChange={e => { setFaldaAttiva(e.target.value); setPunti([]); }}><option value="">{tr("Aggiungi una falda")}</option>{piano.falde.map(f => <option key={f.id} value={f.id}>{tr("Ridisegna {nome}", { nome: String(f.nome ?? "") })}</option>)}</UniformSelect></label><span>{tr("{n} punti", { n: punti.length })}</span><button type="button" disabled={!modificabile || !poligonoValido(punti)} onClick={chiudi}><Check size={15} /> {tr("Chiudi falda")}</button><button type="button" onClick={() => setPunti([])}>{tr("Ricomincia contorno")}</button></div>}
      {(pSel || oSel) && <div className="fv-roof-selection"><strong>{pSel ? tr("Pannello selezionato") : tr("Ostacolo selezionato")}</strong>{oSel && <>{(["x", "y", "w", "h"] as const).map(k => <label key={k}>{tr(({x:"Posizione X",y:"Posizione Y",w:"Larghezza",h:"Profondità"})[k])} (m)<input aria-label={tr("Ostacolo {asse}", { asse: k })} type="number" step={.1} min={k === "w" || k === "h" ? .1 : -200} max={k === "w" || k === "h" ? 20 : 200} disabled={!modificabile} value={oSel[k]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && ((k === "w" || k === "h") ? n >= .1 && n <= 20 : Math.abs(n) <= 200)) applicaOstacolo({...oSel, [k]:n}); }} /></label>)}</>}{pSel && <><button type="button" disabled={!modificabile} aria-label={tr("Sposta pannello a sinistra")} onClick={() => cambiaPannello({ x: arrotondaMetro(pSel.x - .05) })}><ArrowLeft size={14} /></button><button type="button" disabled={!modificabile} aria-label={tr("Sposta pannello a destra")} onClick={() => cambiaPannello({ x: arrotondaMetro(pSel.x + .05) })}><ArrowRight size={14} /></button><button type="button" disabled={!modificabile} aria-label={tr("Sposta pannello in alto")} onClick={() => cambiaPannello({ y: arrotondaMetro(pSel.y - .05) })}><ArrowUp size={14} /></button><button type="button" disabled={!modificabile} aria-label={tr("Sposta pannello in basso")} onClick={() => cambiaPannello({ y: arrotondaMetro(pSel.y + .05) })}><ArrowDown size={14} /></button><button type="button" disabled={!modificabile} onClick={() => { const r=ingombroModulo(pSel,modulo),next=ingombroModulo({...pSel,orizzontale:!pSel.orizzontale},modulo);cambiaPannello({orizzontale:!pSel.orizzontale,x:pSel.x+(r.w-next.w)/2,y:pSel.y+(r.h-next.h)/2}); }}><RotateCw size={14} /> {tr("Ruota")}</button><label>{tr("Rotazione (°)")}<input aria-label={tr("Rotazione pannello selezionato")} type="number" min={0} max={359} step={1} value={pSel.rotazione ?? 0} disabled={!modificabile || !!pSel.supporto} onChange={e => { const n=Number(e.target.value);if(Number.isFinite(n)&&n>=0&&n<360)cambiaPannello({rotazione:n}); }}/></label></>}<button type="button" disabled={!modificabile} className="fv-roof-danger" onClick={elimina}><Trash2 size={14} /> {tr("Rimuovi")}</button></div>}
      {piano.industriale&&piano.industriale.posa!=="aderente"&&<p className="fv-roof-hint">{tr("Per aggiungere moduli su supporti usa la quantità e la posa automatica: conserva inclinazione e distanze fra file.")}</p>}
      <footer className="fv-roof-canvas-footer"><span><i className="fv-roof-dot" />{tr("{n} moduli posizionati", { n: piano.pannelli.length })}</span><span>{potenzaModuloW>0?`${num(piano.pannelli.length*potenzaModuloW/1000)} kWp`:tr("Potenza da definire")}</span><span>{num(piano.falde.reduce((n, f) => n + areaPoligono(f.punti), 0))} {tr("m² disegnati")}</span></footer>
    </div></div>
    {nota && <p role="status" className="fv-roof-notice">{nota}</p>}
    {!!bad.size && <p role="alert" className="fv-roof-notice fv-roof-warning">{tr("{size} moduli da riposizionare dopo le modifiche: sono evidenziati in rosso.", { size: String(bad.size ?? "") })}</p>}
    <div className="fv-roof-disclaimer"><PencilRuler size={15} /><span>{tr("Disposizione commerciale indicativa. Misure, posa e condizioni del tetto saranno confermate nel sopralluogo.")}</span></div>
  </section>;
}
