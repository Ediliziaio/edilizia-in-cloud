/**
 * Lettura di un disegno DXF (ASCII) a pezzi: il file può pesare centinaia di
 * MB (un DWG da 55 MB diventa un DXF da 300 MB), quindi non si tiene mai tutto
 * il testo in memoria. Si passano i pezzi a `aggiungi()` man mano che arrivano
 * e alla fine `fine()` restituisce solo quello che serve per contare:
 *   - i blocchi inseriti (nome, layer, posizione) → simboli esatti;
 *   - i testi (nomi dei locali);
 *   - i contorni chiusi (le stanze, se il disegno ha un layer dei locali);
 *   - le linee con la loro lunghezza (corrugati, cavi, tubazioni);
 *   - i cerchi (nei disegni importati da PDF i simboli sono cerchi, non blocchi).
 *
 * Regole pure: nessun accesso al database né al DOM. Gira nel Web Worker
 * (leggiDisegno.worker.ts) e nei test.
 *
 * Limiti dichiarati:
 *   - si leggono le entità dello spazio modello; i blocchi annidati dentro
 *     altri blocchi non si esplodono (si conta il blocco esterno);
 *   - i blocchi dinamici (nomi anonimi «*U12») tornano al nome del blocco
 *     originale quando il file lo dichiara;
 *   - il DXF binario e il DWG non si leggono qui: vedi `riconosciFormato`.
 */

export interface BloccoInserito { nome: string; layer: string; x: number; y: number; /** Pezzi (MINSERT: righe × colonne). */ n: number }
export interface TestoDisegno { s: string; layer: string; x: number; y: number; h: number }
export interface ContornoChiuso { layer: string; /** x0, y0, x1, y1… */ punti: number[] }
export interface TrattoLinea { layer: string; /** Punto medio, per assegnarlo al locale. */ x: number; y: number; lunghezza: number }
export interface CerchioDisegno { layer: string; x: number; y: number; r: number }

export interface DisegnoCad {
  versione: string | null;
  /** $INSUNITS del disegno (0 = senza unità, 4 = mm, 5 = cm, 6 = m…). */
  insunits: number;
  layer: string[];
  blocchi: BloccoInserito[];
  testi: TestoDisegno[];
  contorni: ContornoChiuso[];
  tratti: TrattoLinea[];
  cerchi: CerchioDisegno[];
  /** Entità lette nello spazio modello, per tipo. */
  entita: Record<string, number>;
}

export type FormatoCad = "dxf" | "dxf_binario" | "dwg" | "sconosciuto";

/** Dai primi byte del file: DWG («AC10xx»), DXF binario o DXF di testo. */
export function riconosciFormato(inizio: Uint8Array): FormatoCad {
  const testa = String.fromCharCode(...inizio.slice(0, 22));
  if (/^AC10\d\d/.test(testa)) return "dwg";
  if (testa.startsWith("AutoCAD Binary DXF")) return "dxf_binario";
  if (/^\s*0\s*[\r\n]+\s*SECTION/.test(testa) || /^\s*999/.test(testa) || /^\s*0\s*$/.test(testa.split(/\r?\n/)[0] ?? "")) return "dxf";
  return "sconosciuto";
}

/** Versione di AutoCAD dal codice del file (AC1032 → «AutoCAD 2018»). */
export function nomeVersione(codice: string | null): string | null {
  if (!codice) return null;
  const v: Record<string, string> = {
    AC1009: "AutoCAD R12", AC1012: "AutoCAD R13", AC1014: "AutoCAD R14", AC1015: "AutoCAD 2000", AC1018: "AutoCAD 2004",
    AC1021: "AutoCAD 2007", AC1024: "AutoCAD 2010", AC1027: "AutoCAD 2013", AC1032: "AutoCAD 2018",
  };
  return v[codice] ?? codice;
}

/** Il testo di un MTEXT senza i codici di formato (\P a capo, {\fArial;…}, \A1;…). */
export function pulisciMtext(s: string): string {
  return s
    .replace(/\\P/g, " ")
    .replace(/\\[ACFHQTWfhqtwacp][^;\\{}]*;/g, "")
    .replace(/\\S([^;]*)\^([^;]*);/g, "$1/$2")
    .replace(/\\[LlOoKkNX]/g, "")
    .replace(/\\~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lunghezza di un tratto di polilinea con bulge (arco) tra due vertici. */
export function lunghezzaTratto(x1: number, y1: number, x2: number, y2: number, bulge: number): number {
  const corda = Math.hypot(x2 - x1, y2 - y1);
  if (!bulge || corda === 0) return corda;
  const theta = 4 * Math.atan(Math.abs(bulge));
  return (corda / (2 * Math.sin(theta / 2))) * theta;
}

interface Vertice { x: number; y: number; b: number }
interface EntitaInCorso {
  tipo: string;
  layer: string;
  spazioCarta: boolean;
  nome: string;
  testo: string[];
  testo1: string;
  x: number; y: number; x2: number; y2: number;
  h: number; r: number; a1: number; a2: number;
  flag: number; colonne: number; righe: number;
  vertici: Vertice[];
  // xdata dei BLOCK: «AcDbBlockRepBTag» → handle del blocco originale.
  xdataApp: string; handleOriginale: string;
}

const nuova = (tipo: string): EntitaInCorso => ({
  tipo, layer: "0", spazioCarta: false, nome: "", testo: [], testo1: "",
  x: NaN, y: NaN, x2: NaN, y2: NaN, h: 0, r: 0, a1: 0, a2: 360, flag: 0, colonne: 1, righe: 1, vertici: [],
  xdataApp: "", handleOriginale: "",
});

const ENTITA_UTILI = new Set(["INSERT", "TEXT", "MTEXT", "LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "SPLINE"]);
/** Contorni oltre questo numero di vertici non sono stanze (sono retini, curve): non si tengono. */
const MAX_VERTICI_CONTORNO = 400;

export class LettoreDxf {
  private resto = "";
  private codice: number | null = null;
  private sezione = "";
  private tabella = "";
  private ultimoCodice0 = "";
  private varHeader = "";
  private corrente: EntitaInCorso | null = null;
  /** POLYLINE vecchio stile: i vertici arrivano come entità VERTEX fino a SEQEND. */
  private polilineaAperta: EntitaInCorso | null = null;
  private recordBlocco: { handle: string; nome: string; app: string; originale: string } | null = null;
  private handleNomi = new Map<string, string>();
  /** Blocchi anonimi e handle del loro originale (xdata «AcDbBlockRepBTag»). */
  private anonimiDaRisolvere: { nome: string; originale: string }[] = [];
  private anonimi = new Map<string, string>();
  private layerSet = new Set<string>();

  readonly risultato: DisegnoCad = {
    versione: null, insunits: 0, layer: [], blocchi: [], testi: [], contorni: [], tratti: [], cerchi: [], entita: {},
  };

  aggiungi(pezzo: string): void {
    const testo = this.resto + pezzo;
    let inizio = 0;
    for (;;) {
      const a = testo.indexOf("\n", inizio);
      if (a < 0) break;
      let riga = testo.slice(inizio, a);
      if (riga.endsWith("\r")) riga = riga.slice(0, -1);
      this.riga(riga);
      inizio = a + 1;
    }
    this.resto = testo.slice(inizio);
  }

  fine(): DisegnoCad {
    if (this.resto) { this.riga(this.resto.replace(/\r$/, "")); this.resto = ""; }
    this.chiudiEntita();
    this.chiudiPolilineaAperta();
    this.chiudiRecordBlocco();
    for (const a of this.anonimiDaRisolvere) {
      const nome = this.handleNomi.get(a.originale);
      if (nome && !this.anonimi.has(a.nome)) this.anonimi.set(a.nome, nome);
    }
    // Blocchi dinamici: «*U12» → nome del blocco originale.
    for (const b of this.risultato.blocchi) {
      if (b.nome.startsWith("*")) b.nome = this.anonimi.get(b.nome) ?? b.nome;
    }
    this.risultato.layer = [...this.layerSet].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
    return this.risultato;
  }

  private riga(riga: string) {
    if (this.codice === null) {
      const c = parseInt(riga, 10);
      this.codice = Number.isFinite(c) ? c : -1;
      return;
    }
    const codice = this.codice;
    this.codice = null;
    this.coppia(codice, riga);
  }

  private coppia(codice: number, valore: string) {
    if (codice === 0) {
      const v = valore.trim();
      this.chiudiEntita();
      this.chiudiRecordBlocco();
      this.ultimoCodice0 = v;
      if (v === "SECTION" || v === "ENDSEC" || v === "EOF") { if (v !== "SECTION") this.sezione = ""; this.tabella = ""; return; }
      if (this.sezione === "TABLES") {
        if (v === "TABLE" || v === "ENDTAB") { this.tabella = ""; return; }
        if (v === "BLOCK_RECORD") this.recordBlocco = { handle: "", nome: "", app: "", originale: "" };
        return;
      }
      if (this.sezione === "BLOCKS") {
        if (v === "BLOCK") this.corrente = nuova("BLOCK");
        return;
      }
      if (this.sezione === "ENTITIES") {
        if (v === "VERTEX" && this.polilineaAperta) { this.corrente = nuova("VERTEX"); return; }
        if (v === "SEQEND") { this.chiudiPolilineaAperta(); return; }
        if (this.polilineaAperta) this.chiudiPolilineaAperta();
        this.risultato.entita[v] = (this.risultato.entita[v] ?? 0) + 1;
        if (ENTITA_UTILI.has(v)) this.corrente = nuova(v);
      }
      return;
    }
    // Il nome della sezione è la coppia subito dopo «0 SECTION» (nell'HEADER
    // altre variabili hanno il codice 2, come $DIMSTYLE: non vanno confuse).
    if (this.ultimoCodice0 === "SECTION") {
      this.ultimoCodice0 = "";
      if (codice === 2) { this.sezione = valore.trim(); return; }
    }

    if (this.sezione === "HEADER") {
      if (codice === 9) { this.varHeader = valore.trim(); return; }
      if (this.varHeader === "$ACADVER" && codice === 1) this.risultato.versione = valore.trim();
      if (this.varHeader === "$INSUNITS" && codice === 70) this.risultato.insunits = parseInt(valore, 10) || 0;
      return;
    }
    if (this.sezione === "TABLES") {
      if (codice === 2 && this.ultimoCodice0 === "TABLE") { this.tabella = valore.trim(); return; }
      if (this.recordBlocco && this.ultimoCodice0 === "BLOCK_RECORD") {
        if (codice === 5) this.recordBlocco.handle = valore.trim().toUpperCase();
        if (codice === 2) this.recordBlocco.nome = valore.trim();
        if (codice === 1001) this.recordBlocco.app = valore.trim();
        if (codice === 1005 && this.recordBlocco.app === "AcDbBlockRepBTag") this.recordBlocco.originale = valore.trim().toUpperCase();
      }
      if (this.tabella === "LAYER" && this.ultimoCodice0 === "LAYER" && codice === 2) this.layerSet.add(valore.trim());
      return;
    }

    const e = this.corrente;
    if (!e) return;
    switch (codice) {
      case 1: e.testo1 = valore; break;
      case 3: e.testo.push(valore); break;
      case 2: e.nome = valore.trim(); break;
      case 8: e.layer = valore.trim(); break;
      case 67: e.spazioCarta = valore.trim() === "1"; break;
      case 10:
        if (e.tipo === "LWPOLYLINE" || (e.tipo === "SPLINE")) e.vertici.push({ x: parseFloat(valore), y: NaN, b: 0 });
        else e.x = parseFloat(valore);
        break;
      case 20:
        if ((e.tipo === "LWPOLYLINE" || e.tipo === "SPLINE") && e.vertici.length) e.vertici[e.vertici.length - 1].y = parseFloat(valore);
        else e.y = parseFloat(valore);
        break;
      case 11:
        if (e.tipo === "SPLINE") { e.testo.push(valore); } // punti di passaggio: vedi sotto
        else e.x2 = parseFloat(valore);
        break;
      case 21:
        if (e.tipo === "SPLINE") { e.testo.push(valore); }
        else e.y2 = parseFloat(valore);
        break;
      case 40: e.h = parseFloat(valore); e.r = e.h; break;
      case 42: if (e.tipo === "LWPOLYLINE" && e.vertici.length) e.vertici[e.vertici.length - 1].b = parseFloat(valore) || 0; else if (e.tipo === "VERTEX") e.h = parseFloat(valore) || 0; break;
      case 50: e.a1 = parseFloat(valore); break;
      case 51: e.a2 = parseFloat(valore); break;
      case 70: e.flag = parseInt(valore, 10) || 0; if (e.tipo === "INSERT") e.colonne = Math.max(1, e.flag); break;
      case 71: if (e.tipo === "INSERT") e.righe = Math.max(1, parseInt(valore, 10) || 1); break;
      case 1001: e.xdataApp = valore.trim(); break;
      case 1005: if (e.xdataApp === "AcDbBlockRepBTag") e.handleOriginale = valore.trim().toUpperCase(); break;
      default: break;
    }
  }

  private chiudiRecordBlocco() {
    const r = this.recordBlocco;
    this.recordBlocco = null;
    if (!r || !r.nome) return;
    if (r.handle) this.handleNomi.set(r.handle, r.nome);
    if (r.nome.startsWith("*") && r.originale) this.anonimiDaRisolvere.push({ nome: r.nome, originale: r.originale });
  }

  private chiudiEntita() {
    const e = this.corrente;
    this.corrente = null;
    if (!e) return;
    if (e.tipo === "BLOCK") {
      if (e.nome.startsWith("*") && e.handleOriginale) this.anonimiDaRisolvere.push({ nome: e.nome, originale: e.handleOriginale });
      return;
    }
    if (e.tipo === "VERTEX") {
      // Un VERTEX ha il bulge in 42 (salvato in h) e la posizione in 10/20.
      if (this.polilineaAperta && Number.isFinite(e.x) && Number.isFinite(e.y) && !(e.flag & 16)) {
        this.polilineaAperta.vertici.push({ x: e.x, y: e.y, b: e.h });
      }
      return;
    }
    if (e.spazioCarta) return;
    if (e.layer) this.layerSet.add(e.layer);
    const r = this.risultato;
    switch (e.tipo) {
      case "INSERT":
        if (e.nome && Number.isFinite(e.x)) r.blocchi.push({ nome: e.nome, layer: e.layer, x: e.x, y: Number.isFinite(e.y) ? e.y : 0, n: e.colonne * e.righe });
        break;
      case "TEXT": {
        const s = pulisciMtext(e.testo1);
        if (s && Number.isFinite(e.x)) r.testi.push({ s, layer: e.layer, x: e.x, y: e.y, h: e.h || 0 });
        break;
      }
      case "MTEXT": {
        const s = pulisciMtext(e.testo.join("") + e.testo1);
        if (s && Number.isFinite(e.x)) r.testi.push({ s, layer: e.layer, x: e.x, y: e.y, h: e.h || 0 });
        break;
      }
      case "LINE": {
        if (![e.x, e.y, e.x2, e.y2].every(Number.isFinite)) break;
        const l = Math.hypot(e.x2 - e.x, e.y2 - e.y);
        if (l > 0) r.tratti.push({ layer: e.layer, x: (e.x + e.x2) / 2, y: (e.y + e.y2) / 2, lunghezza: l });
        break;
      }
      case "ARC": {
        if (!Number.isFinite(e.x) || !(e.r > 0)) break;
        let gradi = e.a2 - e.a1;
        if (gradi <= 0) gradi += 360;
        const medio = ((e.a1 + gradi / 2) * Math.PI) / 180;
        r.tratti.push({ layer: e.layer, x: e.x + e.r * Math.cos(medio), y: e.y + e.r * Math.sin(medio), lunghezza: (e.r * gradi * Math.PI) / 180 });
        break;
      }
      case "CIRCLE":
        if (Number.isFinite(e.x) && e.r > 0) r.cerchi.push({ layer: e.layer, x: e.x, y: e.y, r: e.r });
        break;
      case "LWPOLYLINE":
        this.salvaPolilinea(e.layer, e.vertici, (e.flag & 1) === 1);
        break;
      case "SPLINE": {
        // Lunghezza approssimata: i punti di passaggio se ci sono, altrimenti
        // il poligono dei punti di controllo (un po' più lungo della curva).
        const passaggio: Vertice[] = [];
        for (let i = 0; i + 1 < e.testo.length; i += 2) passaggio.push({ x: parseFloat(e.testo[i]), y: parseFloat(e.testo[i + 1]), b: 0 });
        this.salvaPolilinea(e.layer, passaggio.length >= 2 ? passaggio : e.vertici, false, false);
        break;
      }
      case "POLYLINE":
        // I vertici arrivano dopo: la si chiude a SEQEND.
        if (!(e.flag & (16 | 64))) this.polilineaAperta = e; // niente mesh 3D / polyface
        break;
      default: break;
    }
  }

  private chiudiPolilineaAperta() {
    const p = this.polilineaAperta;
    this.polilineaAperta = null;
    if (p) this.salvaPolilinea(p.layer, p.vertici, (p.flag & 1) === 1);
  }

  private salvaPolilinea(layer: string, vertici: Vertice[], chiusa: boolean, puoEssereContorno = true) {
    const v = vertici.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (v.length < 2) return;
    let lunghezza = 0;
    let mx = 0;
    let my = 0;
    const n = chiusa ? v.length : v.length - 1;
    for (let i = 0; i < n; i++) {
      const a = v[i];
      const b = v[(i + 1) % v.length];
      const l = lunghezzaTratto(a.x, a.y, b.x, b.y, a.b);
      lunghezza += l;
      mx += ((a.x + b.x) / 2) * l;
      my += ((a.y + b.y) / 2) * l;
    }
    if (lunghezza > 0) this.risultato.tratti.push({ layer, x: mx / lunghezza, y: my / lunghezza, lunghezza });
    if (chiusa && puoEssereContorno && v.length >= 3 && v.length <= MAX_VERTICI_CONTORNO) {
      const punti: number[] = [];
      for (const p of v) punti.push(p.x, p.y);
      this.risultato.contorni.push({ layer, punti });
    }
  }
}

/** Comodo per i test e i file piccoli: tutto il testo in una volta. */
export function leggiDxf(testo: string): DisegnoCad {
  const l = new LettoreDxf();
  l.aggiungi(testo);
  return l.fine();
}
