import {
  coordinateImmobile, urlFonteUrbanistica, type AmbitoCartografico, type CategoriaCartografica,
  type ParticellaIndividuata, type PosizioneImmobile, type RiscontroCartografico, type StratoCartografico,
} from "../../../shared/planimetrie/urbanistica.ts";
import { comuneNelRegistro, oggiUrbanistica } from "./fontiUrbanistiche";
import {
  CATASTO_LOMBARDIA, GEOROMA, GEOROMA_WFS, GEOROMA_WMS, PGT_LOMBARDIA, PRG_ROMA, ROMA_ISTAT, SIBA_LOMBARDIA,
} from "./riferimentiUrbanistici";

type Attributi = Record<string, unknown>;
type Elemento = { attributes?: Attributi; properties?: Attributi; geometry?: { type?: string; coordinates?: unknown } };
type Strato = Omit<StratoCartografico, "esito">;

const PGT = [
  [12, "Nuclei di antica formazione"], [13, "Ambiti di trasformazione"], [18, "Servizi e impianti"],
  [19, "Aree agricole"], [20, "Ambiti del tessuto urbano consolidato"],
] as const;
const TUTELE_LOMBARDIA = [
  [0, "Beni e immobili di notevole interesse pubblico"], [14, "Aree di notevole interesse pubblico"],
  [6, "Fasce di rispetto dei corsi d’acqua tutelati"], [7, "Territori contermini ai laghi"],
  [8, "Parchi nazionali e regionali"],
] as const;
const TUTELE_ROMA = [
  ["Edifici_Edilizia_Speciale", "Carta per la Qualità · Edifici di edilizia speciale"],
  ["Deposito_Archeologico", "Carta per la Qualità · Deposito archeologico"],
  ["Morfologie_Poligono", "Carta per la Qualità · Morfologie"],
  ["Preesistenze_Poligono", "Carta per la Qualità · Preesistenze"],
] as const;

const urlConParametri = (base: string, p: Record<string, string>) => `${base}?${new URLSearchParams(p)}`;
const testoDa = (v: unknown) => typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const descrivi = (titolo: string, campi: unknown[]) => [...new Set([titolo, ...campi.map(testoDa).filter(Boolean)])].join(" · ").slice(0, 500);

async function leggiServizio<T>(url: string, fetcher: typeof fetch, timeout = 9_000): Promise<T> {
  const risposta = await fetcher(url, { signal: AbortSignal.timeout(timeout), referrerPolicy: "no-referrer" }).catch(() => {
    throw new Error("La fonte cartografica non risponde. Riprova o consulta il portale ufficiale.");
  });
  if (!risposta.ok) throw new Error("La fonte cartografica non risponde.");
  return risposta.json() as Promise<T>;
}

async function leggiGeometrie(url: string, fetcher: typeof fetch, timeout?: number) {
  const dati = await leggiServizio<{ features?: Elemento[]; exceededTransferLimit?: boolean; error?: unknown }>(url, fetcher, timeout);
  if (dati.error || !Array.isArray(dati.features)) throw new Error("La fonte non ha restituito dati cartografici.");
  return { elementi: dati.features, parziale: dati.exceededTransferLimit === true };
}

function rettangolo(p: PosizioneImmobile) {
  const dy = 12 / 111_320, dx = dy / Math.cos(p.lat * Math.PI / 180);
  return [p.lng - dx, p.lat - dy, p.lng + dx, p.lat + dy].map(v => v.toFixed(7)).join(",");
}

function queryLombardia(p: PosizioneImmobile, fonte: string) {
  return urlConParametri(`${fonte}/query`, {
    f: "json", where: "1=1", geometry: rettangolo(p), geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", resultRecordCount: "10",
  });
}

function queryPrgRoma(p: PosizioneImmobile) {
  return urlConParametri(GEOROMA_WMS, {
    service: "WMS", version: "1.1.1", request: "GetFeatureInfo", srs: "EPSG:4326", bbox: rettangolo(p),
    layers: "PrgSistemiRegole5000", query_layers: "PrgSistemiRegole5000", styles: "",
    width: "101", height: "101", x: "50", y: "50", feature_count: "10", info_format: "application/json", format: "image/png",
  });
}

async function riscontroStrato(strato: Strato, url: string, comune: string, codiceIstat: string, fetcher: typeof fetch, daPgt = false): Promise<{ strato: StratoCartografico; ambiti: AmbitoCartografico[] }> {
  try {
    const { elementi, parziale } = await leggiGeometrie(url, fetcher);
    const distinti = new Map<string, AmbitoCartografico>();
    for (const item of elementi) {
      const dati = item?.attributes ?? item?.properties;
      if (!dati) continue;
      const codice = daPgt ? testoDa(dati.COD_ISTAT).padStart(6, "0") : codiceIstat;
      if (!/^\d{6}$/.test(codice) || codice === "000000") continue;
      const nome = testoDa(dati.NOME_COM) || comune;
      const daPrgRoma = codiceIstat === ROMA_ISTAT && strato.categoria === "zona";
      // Il servizio espone gli articoli con markup. Conserviamo solo le sigle, con il rinvio alle NTA coordinate.
      const articoli = [...new Set(testoDa(dati.NORME_TECNICHE_DI_ATTUAZIONE).match(/Art\.\s*\d+(?:[- ](?:bis|ter|quater))?/gi) ?? [])].slice(0, 8);
      const descrizione = descrivi(strato.titolo, daPgt
        ? [dati.LEGENDA, dati.DCOD_DEST1, dati.DSPEC_DEST, dati.DSPEC_COM, dati.AMB_URB]
        : daPrgRoma ? [dati.COMPONENTE, articoli.length ? `Riferimenti sulla tavola ${articoli.join(", ")}` : ""]
        : [dati.DENOMINAZIONE, dati.DENOM, dati.NOME, dati.CLASSE, dati.TIPOLOGIA, dati.CODICE ?? dati.ID_VINCOLO]);
      const scheda = daPrgRoma ? PRG_ROMA :
        daPgt && urlFonteUrbanistica(dati.SCHEDA_NEW) && new URL(dati.SCHEDA_NEW).hostname === "www.cartografia.servizirl.it" ? dati.SCHEDA_NEW : undefined;
      distinti.set(`${codice}:${descrizione}`, {
        codiceIstat: codice, comune: nome, descrizione, tavola: strato.fonte, categoria: strato.categoria, ...(scheda ? { scheda } : {}),
      });
    }
    const ambiti = [...distinti.values()];
    const esito: StratoCartografico["esito"] = parziale || (elementi.length > 0 && !ambiti.length) ? "parziale" : ambiti.length ? "trovato" : "assente";
    return { strato: { ...strato, esito }, ambiti };
  } catch {
    return { strato: { ...strato, esito: "indisponibile" as const }, ambiti: [] };
  }
}

export async function cercaCartografiaUrbanistica(p: PosizioneImmobile, codiceIstat: string, regione: string, comune: string, fetcher = fetch): Promise<RiscontroCartografico> {
  if (!p.confermata || !coordinateImmobile(p.lat, p.lng) || !/^\d{6}$/.test(codiceIstat)) throw new Error("Conferma il punto dell’immobile e il Comune.");
  const lombardia = regione === "Lombardia";
  if (lombardia && (p.lat < 44.6 || p.lat > 47 || p.lng < 8.4 || p.lng > 11.6)) throw new Error("Il punto è fuori dalla copertura della cartografia lombarda.");
  if (codiceIstat === ROMA_ISTAT && (p.lat < 41.65 || p.lat > 42.18 || p.lng < 12.16 || p.lng > 12.85)) throw new Error("Il punto è fuori dall’area di ricerca di Roma Capitale.");
  const query = (id: number, titolo: string, base: string, categoria: CategoriaCartografica) => {
    const fonte = `${base}/${id}`;
    return riscontroStrato({ titolo, fonte, categoria }, queryLombardia(p, fonte), comune, codiceIstat, fetcher, base === PGT_LOMBARDIA);
  };
  const richieste = lombardia ? [
    ...PGT.map(([id, nome]) => query(id, nome, PGT_LOMBARDIA, "zona")),
    ...TUTELE_LOMBARDIA.map(([id, nome]) => query(id, nome, SIBA_LOMBARDIA, "tutela")),
  ] : codiceIstat === ROMA_ISTAT ? [
    riscontroStrato({ titolo: "PRG · Sistemi e Regole 1:5.000", fonte: GEOROMA, categoria: "zona" }, queryPrgRoma(p), "Roma", ROMA_ISTAT, fetcher),
    ...TUTELE_ROMA.map(([id, titolo]) => {
      const url = urlConParametri(GEOROMA_WFS, {
        service: "WFS", version: "1.0.0", request: "GetFeature", typeName: `DIPAU:CartaPerLaQualita_${id}`,
        srsName: "EPSG:4326", bbox: `${rettangolo(p)},EPSG:4326`, outputFormat: "application/json", maxFeatures: "10",
      });
      return riscontroStrato({ titolo, fonte: GEOROMA, categoria: "tutela" }, url, "Roma", ROMA_ISTAT, fetcher);
    }),
  ] : [];
  const risultati = await Promise.all(richieste);
  const strati = risultati.map(r => r.strato);
  const ambiti = risultati.flatMap(r => r.ambiti);
  const discordante = ambiti.some(a => a.codiceIstat !== codiceIstat);
  const parziale = ambiti.length > 40 || strati.some(s => s.esito === "indisponibile" || s.esito === "parziale");
  return { data: oggiUrbanistica(), esito: discordante ? "discordante" : parziale ? "parziale" : ambiti.length ? "trovato" : "assente",
    ambiti: ambiti.slice(0, 40), strati };
}

export interface RicercaParticella { foglio: string; particella: string; sezione?: string }
export type PosizioneParticella = ParticellaIndividuata & { lat: number; lng: number };
const normalizzaNumero = (v: string) => v.trim().toUpperCase().replace(/^0+(?=\d)/, "");
const normalizzaSezione = (v: string) => v.trim().toUpperCase().replace(/^[_-]$/, "");

export function riferimentiCatastali(input: RicercaParticella) {
  const foglio = normalizzaNumero(input.foglio), numero = normalizzaNumero(input.particella), sezione = normalizzaSezione(input.sezione ?? "");
  if (!/^\d{1,5}$/.test(foglio) || !/^[A-Z0-9]{1,12}(?:\/[A-Z0-9]{1,8})?$/.test(numero)
    || !/^[A-Z0-9]{0,8}$/.test(sezione)) throw new Error("Inserisci foglio, particella ed eventuale sezione come riportati nella visura.");
  return { foglio, numero, sezione };
}

type Coppia = [number, number];
const coppiaValida = (v: unknown): v is Coppia => Array.isArray(v) && v.length >= 2
  && typeof v[0] === "number" && typeof v[1] === "number" && coordinateImmobile(v[1], v[0]);

/** Cerca un punto interno anche quando il centro del rettangolo ricade fuori dalla particella. */
function puntoSuParticella(g: Elemento["geometry"]) {
  if (!Array.isArray(g?.coordinates)) return null;
  const poligoni = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let migliore: { lat: number; lng: number; larghezza: number } | null = null;
  for (const poligono of poligoni) {
    if (!Array.isArray(poligono)) continue;
    const anelli = poligono.map((a: unknown) => Array.isArray(a) ? a.filter(coppiaValida) : []).filter((a: Coppia[]) => a.length >= 4);
    if (!anelli.length) continue;
    let sud = 90, nord = -90;
    for (const [, y] of anelli[0]) { sud = Math.min(sud, y); nord = Math.max(nord, y); }
    for (const quota of [.5, .3, .7]) {
      const lat = sud + (nord - sud) * quota;
      const sezioni: number[] = [];
      for (const anello of anelli) for (let i = 0; i < anello.length - 1; i++) {
        const [x, y] = anello[i], [x2, y2] = anello[i + 1];
        if ((y <= lat && y2 > lat) || (y2 <= lat && y > lat)) sezioni.push(x + (x2 - x) * (lat - y) / (y2 - y));
      }
      sezioni.sort((a, b) => a - b);
      for (let i = 1; i < sezioni.length; i += 2) {
        const larghezza = sezioni[i] - sezioni[i - 1];
        if (larghezza > (migliore?.larghezza ?? 0)) migliore = { lat, lng: (sezioni[i] + sezioni[i - 1]) / 2, larghezza };
      }
    }
  }
  return migliore;
}

export async function cercaParticelleLombardia(codiceIstat: string, input: RicercaParticella, fetcher = fetch): Promise<PosizioneParticella[]> {
  const comune = comuneNelRegistro(codiceIstat);
  if (comune?.regione !== "Lombardia" || !/^[A-Z]\d{3}$/.test(comune.codiceCatastale)) throw new Error("Scegli un Comune lombardo dall’elenco ISTAT.");
  const { foglio, numero, sezione } = riferimentiCatastali(input);
  const criterioFoglio = `CODICE_BELFIORE = '${comune.codiceCatastale}' AND FOGLIO = ${foglio}`;
  const dove = [
    criterioFoglio, `NUMERO = '${numero}'`,
    ...(sezione ? [`SEZIONE = '${sezione}'`] : []),
  ].join(" AND ");
  const layer = ["PV", "SO"].includes(comune.provincia) ? 17 : 16;
  const fonte = `${CATASTO_LOMBARDIA}/${layer}`;
  // Restringi la ricerca al foglio catastale. La stessa query su tutta la
  // regione richiede una scansione molto più ampia del servizio pubblico.
  const risultatoFoglio = await leggiServizio<{ extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }>(
    urlConParametri(`${CATASTO_LOMBARDIA}/${layer + 2}/query`, { f: "json", where: criterioFoglio, outSR: "4326", returnExtentOnly: "true" }),
    fetcher,
  ).catch((): null => null);
  const e = risultatoFoglio?.extent;
  const estensione = e && coordinateImmobile(e.ymin, e.xmin) && coordinateImmobile(e.ymax, e.xmax) && e.xmin < e.xmax && e.ymin < e.ymax
    ? { geometry: [e.xmin, e.ymin, e.xmax, e.ymax].join(","), inSR: "4326", geometryType: "esriGeometryEnvelope", spatialRel: "esriSpatialRelIntersects" }
    : undefined;
  const { elementi, parziale } = await leggiGeometrie(urlConParametri(`${fonte}/query`, {
    ...estensione, f: "geojson", where: dove, outFields: "CODICE_BELFIORE,FOGLIO,NUMERO,SEZIONE", outSR: "4326", returnGeometry: "true", resultRecordCount: "12",
  }), fetcher, estensione ? 9_000 : 18_000);
  if (parziale || elementi.length >= 12) throw new Error("Sono presenti più riscontri. Inserisci la sezione dalla visura e riprova.");
  return elementi.flatMap(item => {
    const a = item?.properties;
    if (!a || a.CODICE_BELFIORE !== comune.codiceCatastale || normalizzaNumero(testoDa(a.FOGLIO)) !== foglio || normalizzaNumero(testoDa(a.NUMERO)) !== numero) return [];
    const sezioneLetta = normalizzaSezione(testoDa(a.SEZIONE));
    if (sezione && sezioneLetta !== sezione) return [];
    const punto = puntoSuParticella(item.geometry);
    return punto ? [{ lat: punto.lat, lng: punto.lng, foglio, numero, sezione: sezioneLetta, fonte, data: oggiUrbanistica() }] : [];
  });
}
