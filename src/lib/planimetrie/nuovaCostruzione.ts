/**
 * Il computo di una nuova costruzione (24/11/2026).
 *
 * Lo studio della variante conta cosa cambia fra «com'è oggi» e il progetto: per una casa da
 * fare da zero mancherebbero scavi, fondazioni, struttura, solai, copertura, cappotto,
 * massetti, impianti ed esterni. Qui quelle voci si ricavano dalla geometria dei piani
 * (`geometriaPiano`: superficie lorda, perimetro, pareti di perimetro) e dalle scelte della
 * costruzione (`doc.costruzione`). Ogni voce dice la sua formula; dove la pianta non basta
 * (la struttura in elevazione prima dei calcoli strutturali) la quantità è una stima
 * parametrica dichiarata come tale.
 *
 * Le voci sono righe dello studio come le altre: prendono prezzo (listino, prezzario,
 * indicativo), tempi e costi in più dalle stesse regole, e diventano il computo metrico con un
 * capitolo per lavorazione (scavi, fondazioni, strutture…).
 */
import { COSTRUZIONE_PREDEFINITA, geometriaPiano, modoPiano, type Costruzione, type GeometriaPiano, type ModoPiano } from "../../../shared/planimetrie/costruzione.ts";
import { eAmbienteInterno, type AreaEsterna, type Livello, type Locale, type Planimetria, type Proposta } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono, perimetroPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { RigaStudio } from "./studioImmobiliare";

/** Le lavorazioni proprie della nuova costruzione: l'id della riga è `nc:<piano>:<tipo>[:<n>]`. */
export const TIPI_COSTRUZIONE = [
  "ponteggio", "micropali", "adeguamento_sismico", "rimozione_copertura", "svuotamento", "scavo", "rinterro", "trasporto_terre", "magrone", "fondazioni_ca", "muri_controterra", "impermeabilizzazione_controterra",
  "vespaio", "struttura_ca", "cordoli_ca", "struttura_legno", "solaio_laterocemento", "solaio_predalles", "solaio_legno",
  "copertura", "terrazzo", "scala", "tamponatura", "cappotto", "intonaco_esterno", "massetto", "isolamento_pavimento",
  "impianto_elettrico", "bagno_completo", "attacchi_cucina", "riscaldamento_radiante", "riscaldamento_radiatori",
  "pompa_di_calore", "caldaia", "portoncino", "marciapiede", "allacciamenti",
  "prato", "pavimentazione_esterna", "vialetto", "ghiaia", "parcheggio_esterno", "aiuola", "recinzione", "piscina", "pergola", "idromassaggio",
] as const;
export type TipoCostruzione = typeof TIPI_COSTRUZIONE[number];

/** Il capitolo del computo metrico di ogni lavorazione, nell'ordine del cantiere. */
export const CAPITOLI_COSTRUZIONE = [
  "01 Opere provvisionali", "02 Scavi e movimenti di terra", "03 Fondazioni", "04 Strutture in elevazione", "05 Solai, scale e coperture",
  "06 Murature e tamponature", "07 Isolamenti e facciate", "08 Impianti", "09 Intonaci e tinteggiature",
  "10 Massetti, pavimenti e rivestimenti", "11 Serramenti", "12 Sistemazioni esterne",
] as const;

const CAPITOLO: Record<TipoCostruzione, typeof CAPITOLI_COSTRUZIONE[number]> = {
  ponteggio: "01 Opere provvisionali",
  svuotamento: "01 Opere provvisionali", rimozione_copertura: "01 Opere provvisionali",
  micropali: "03 Fondazioni", adeguamento_sismico: "04 Strutture in elevazione",
  scavo: "02 Scavi e movimenti di terra", rinterro: "02 Scavi e movimenti di terra", trasporto_terre: "02 Scavi e movimenti di terra",
  magrone: "03 Fondazioni", fondazioni_ca: "03 Fondazioni", muri_controterra: "03 Fondazioni", impermeabilizzazione_controterra: "03 Fondazioni", vespaio: "03 Fondazioni",
  struttura_ca: "04 Strutture in elevazione", cordoli_ca: "04 Strutture in elevazione", struttura_legno: "04 Strutture in elevazione",
  solaio_laterocemento: "05 Solai, scale e coperture", solaio_predalles: "05 Solai, scale e coperture", solaio_legno: "05 Solai, scale e coperture",
  copertura: "05 Solai, scale e coperture", terrazzo: "05 Solai, scale e coperture", scala: "05 Solai, scale e coperture",
  tamponatura: "06 Murature e tamponature",
  cappotto: "07 Isolamenti e facciate", intonaco_esterno: "07 Isolamenti e facciate", isolamento_pavimento: "07 Isolamenti e facciate",
  impianto_elettrico: "08 Impianti", bagno_completo: "08 Impianti", attacchi_cucina: "08 Impianti", riscaldamento_radiante: "08 Impianti",
  riscaldamento_radiatori: "08 Impianti", pompa_di_calore: "08 Impianti", caldaia: "08 Impianti",
  massetto: "10 Massetti, pavimenti e rivestimenti",
  portoncino: "11 Serramenti",
  marciapiede: "12 Sistemazioni esterne", allacciamenti: "12 Sistemazioni esterne",
  prato: "12 Sistemazioni esterne", pavimentazione_esterna: "12 Sistemazioni esterne", vialetto: "12 Sistemazioni esterne",
  ghiaia: "12 Sistemazioni esterne", parcheggio_esterno: "12 Sistemazioni esterne", aiuola: "12 Sistemazioni esterne",
  recinzione: "12 Sistemazioni esterne", piscina: "12 Sistemazioni esterne", pergola: "12 Sistemazioni esterne", idromassaggio: "12 Sistemazioni esterne",
};

/** Il capitolo delle righe che lo studio fa già (pareti, aperture, finiture) in una nuova costruzione. */
export function capitoloRigaStudio(r: Pick<RigaStudio, "id" | "fase">): string | null {
  const tipo = tipoCostruzione(r.id);
  if (tipo) return CAPITOLO[tipo];
  if (r.fase === "Murature") return "06 Murature e tamponature";
  if (r.fase === "Aperture") return "11 Serramenti";
  if (r.fase === "Intonaci" || r.fase === "Tinteggiature") return "09 Intonaci e tinteggiature";
  if (r.fase === "Finiture") return "10 Massetti, pavimenti e rivestimenti";
  if (/^Impianti/.test(r.fase)) return "08 Impianti";
  return null;
}

export const eNuovaCostruzione = (doc: Pick<Planimetria, "costruzione">) => doc.costruzione?.tipo === "nuova_costruzione";

/** Il tipo di una riga della nuova costruzione, dal suo id; null per le altre righe. */
export function tipoCostruzione(id: string): TipoCostruzione | null {
  const tipo = /^nc:[^:]+:([a-z_]+)(?::\d+)?$/.exec(id)?.[1];
  return tipo && (TIPI_COSTRUZIONE as readonly string[]).includes(tipo) ? tipo as TipoCostruzione : null;
}

const it = (n: number, decimali = 2) => n.toLocaleString("it-IT", { maximumFractionDigits: decimali });
const arrotonda = (n: number) => Math.round(n * 100) / 100;

interface PianoCostruito {
  livello: Livello;
  modo: ModoPiano;
  stato: Pick<Proposta, "muri" | "aperture" | "locali" | "elementi" | "aree">;
  geo: GeometriaPiano;
  interni: Locale[];
  nettaMq: number;
}

/** Lo stato che si costruisce: la variante se c'è, altrimenti il disegno. */
function statoCostruito(livello: Livello, variante: string | null) {
  const p = variante ? livello.proposte.find((x) => x.id === variante) : undefined;
  return p ?? livello.fatto;
}

/**
 * Le voci della nuova costruzione. `muriMq` dà la superficie netta (vuoti detratti) di ogni
 * parete, già calcolata dallo studio: serve per tamponature, cappotto e intonaco esterno.
 */
export function righeNuovaCostruzione(doc: Planimetria, variante: string | null, muriMq: ReadonlyMap<string, number> = new Map()): {
  righe: RigaStudio[];
  /** Pareti di perimetro per piano: lo studio le chiama tamponature e intonaca una faccia sola. */
  perimetro: Map<string, Set<string>>;
} {
  const c: Costruzione = doc.costruzione ?? COSTRUZIONE_PREDEFINITA;
  const piani: PianoCostruito[] = [...doc.livelli].sort((a, b) => a.quota - b.quota).map((livello) => {
    const stato = statoCostruito(livello, variante);
    const interni = stato.locali.filter((l) => eAmbienteInterno(l));
    return { livello, modo: modoPiano(doc.costruzione, livello.id), stato, geo: geometriaPiano(stato.muri, stato.locali), interni,
      nettaMq: arrotonda(interni.reduce((s, l) => s + areaPoligono(l.contorno) / 10_000, 0)) };
  }).filter((p) => p.geo.lordaMq > 0);
  const righe: RigaStudio[] = [];
  // Le pareti di perimetro diventano tamponature solo sui piani da costruire: sugli esistenti c'è già l'involucro.
  const perimetro = new Map(piani.filter((p) => p.modo === "nuovo").map((p) => [p.livello.id, p.geo.muriPerimetro]));
  if (!piani.length) return { righe, perimetro };

  const voce = (p: PianoCostruito | null, tipo: TipoCostruzione, descrizione: string, unita: RigaStudio["unita"], quantita: number, criterio: string, n?: number): void => {
    if (!(quantita > 0)) return;
    const livelloId = p?.livello.id ?? piani[0].livello.id;
    righe.push({
      id: `nc:${livelloId}:${tipo}${n === undefined ? "" : `:${n}`}`, livelloId, piano: p?.livello.nome ?? "Edificio",
      fase: CAPITOLO[tipo].slice(3), gruppo: CAPITOLO[tipo], descrizione, unita, quantita: arrotonda(quantita), criterio, stimata: true,
    });
  };

  const nuovo = (p: PianoCostruito) => p.modo === "nuovo";
  const sitocca = (p: PianoCostruito) => p.modo !== "esistente";

  // ── Opere provvisionali: il ponteggio sulle facciate dei piani su cui si lavora.
  const conPonteggio = piani.filter(sitocca);
  voce(null, "ponteggio", "Ponteggio di facciata, montaggio, nolo e smontaggio", "m²", conPonteggio.reduce((s, p) => s + p.geo.perimetroM * p.geo.altezzaM, 0),
    conPonteggio.map((p) => `${p.livello.nome} ${it(p.geo.perimetroM)} m × ${it(p.geo.altezzaM)} m`).join(" + "));
  for (const p of piani.filter((x) => x.modo === "esistente_da_rifare")) {
    voce(p, "svuotamento", `Svuotamento del ${p.livello.nome.toLowerCase()} esistente: tramezzi, impianti e finiture, con smaltimento`, "m²", p.geo.lordaMq,
      `${it(p.geo.lordaMq)} m² lordi · si tengono struttura e involucro`);
  }

  // ── Sopraelevazione: piani nuovi sopra un edificio che c'è già.
  const base = piani[0];
  const sopraEsistente = piani.some((p, i) => nuovo(p) && piani.slice(0, i).some((q) => !nuovo(q)));
  if (sopraEsistente) {
    const pali = Math.ceil(base.geo.perimetroM / 1.5);
    voce(base, "micropali", "Consolidamento delle fondazioni esistenti con micropali (perforazione, armatura e iniezione)", "m", pali * 12,
      `${pali} micropali (uno ogni 1,50 m di perimetro) × 12 m · da confermare con la relazione geotecnica e i calcoli`);
    voce(base, "cordoli_ca", "Cordolo in c.a. di collegamento dei micropali alla fondazione esistente", "m³", base.geo.perimetroM * 0.6 * 0.5,
      `${it(base.geo.perimetroM)} m × 0,60 × 0,50 m`, 0);
    const esistenti = piani.filter((p) => !nuovo(p));
    voce(null, "adeguamento_sismico", "Adeguamento sismico della struttura esistente per i nuovi carichi", "m²", esistenti.reduce((s, p) => s + p.geo.lordaMq, 0),
      `${esistenti.map((p) => `${p.livello.nome} ${it(p.geo.lordaMq)} m²`).join(" + ")} · stima: dipende dalla verifica di vulnerabilità`);
    piani.forEach((p, i) => {
      const sopra = piani[i + 1];
      if (!nuovo(p) && sopra && nuovo(sopra)) voce(p, "rimozione_copertura", `Rimozione della copertura esistente del ${p.livello.nome.toLowerCase()}, con smaltimento`, "m²",
        Math.min(p.geo.lordaMq, sopra.geo.lordaMq), "La superficie su cui si costruisce sopra");
    });
  }

  // ── Scavi e fondazioni sotto il piano più basso, se è da costruire.
  if (nuovo(base)) {
  const interrato = Math.max(0, -base.livello.quota / 100);
  const profondita = c.scavoCm / 100 + interrato;
  const scavo = base.geo.lordaMq * 1.1 * profondita;
  voce(base, "scavo", "Scavo di sbancamento a sezione aperta, con mezzi meccanici", "m³", scavo,
    `${it(base.geo.lordaMq)} m² di impronta × 1,10 di sovrascavo × ${it(profondita)} m di profondità`);
  const rinterro = base.geo.perimetroM * 0.8 * profondita;
  voce(base, "rinterro", "Rinterro intorno alle fondazioni con il materiale di scavo", "m³", Math.min(rinterro, scavo * 0.5),
    `${it(base.geo.perimetroM)} m di perimetro × 0,80 m × ${it(profondita)} m`);
  voce(base, "trasporto_terre", "Carico, trasporto e conferimento delle terre di scavo eccedenti", "m³", scavo - Math.min(rinterro, scavo * 0.5),
    "Scavo meno rinterro");
  const internePortanti = base.stato.muri.filter((m) => m.stato !== "da_demolire" && !base.geo.muriPerimetro.has(m.id))
    .reduce((s, m) => s + Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) / 100, 0) * 0.5;
  if (c.fondazione === "platea") {
    voce(base, "magrone", "Magrone di sottofondazione, 10 cm", "m²", base.geo.lordaMq * 1.05, `${it(base.geo.lordaMq)} m² × 1,05 di debordo`);
    voce(base, "fondazioni_ca", "Platea di fondazione in c.a. (calcestruzzo, ferro e casseri), 40 cm", "m³", base.geo.lordaMq * 1.05 * 0.4,
      `${it(base.geo.lordaMq)} m² × 1,05 × 0,40 m · ferro ≈ 90 kg/m³ compreso`);
  } else if (c.fondazione === "plinti") {
    const plinti = Math.ceil(base.geo.lordaMq / 20);
    voce(base, "magrone", "Magrone di sottofondazione, 10 cm", "m²", plinti * 2.25 + base.geo.perimetroM * 0.5, `${plinti} plinti × 2,25 m² + cordoli`);
    voce(base, "fondazioni_ca", "Plinti e cordoli di collegamento in c.a. (calcestruzzo, ferro e casseri)", "m³", plinti * 1.2 + base.geo.perimetroM * 0.3 * 0.5,
      `${plinti} plinti (uno ogni 20 m²) × 1,20 m³ + ${it(base.geo.perimetroM)} m di cordoli × 0,30 × 0,50 m`);
  } else {
    const lunghezza = base.geo.perimetroM + internePortanti;
    voce(base, "magrone", "Magrone di sottofondazione, 10 cm", "m²", lunghezza * 1.0, `${it(lunghezza)} m di travi × 1,00 m di larghezza`);
    voce(base, "fondazioni_ca", "Travi rovesce di fondazione in c.a. (calcestruzzo, ferro e casseri)", "m³", lunghezza * 0.8 * 0.6,
      `(${it(base.geo.perimetroM)} m di perimetro + ${it(internePortanti)} m sotto metà delle pareti interne) × 0,80 × 0,60 m · ferro ≈ 90 kg/m³ compreso`);
  }
  if (interrato > 0) {
    voce(base, "muri_controterra", "Muri controterra in c.a., 30 cm", "m³", base.geo.perimetroM * interrato * 0.3,
      `${it(base.geo.perimetroM)} m × ${it(interrato)} m × 0,30 m`);
    voce(base, "impermeabilizzazione_controterra", "Impermeabilizzazione, protezione e drenaggio dei muri controterra", "m²", base.geo.perimetroM * interrato,
      `${it(base.geo.perimetroM)} m × ${it(interrato)} m`);
  }
  voce(base, "vespaio", "Vespaio aerato con casseri a perdere (igloo) e soletta", "m²", base.geo.lordaMq, `Impronta del ${base.livello.nome.toLowerCase()}`);
  }

  piani.forEach((p, i) => {
    const sopra = piani[i + 1];
    if (!sitocca(p)) return;
    // ── Struttura in elevazione: prima dei calcoli strutturali è una stima per m² di piano.
    if (!nuovo(p)) { /* struttura esistente: si tiene */ } else if (c.struttura === "telaio_ca") {
      voce(p, "struttura_ca", "Pilastri, travi e cordoli in c.a. (calcestruzzo, ferro e casseri)", "m³", p.geo.lordaMq * 0.12,
        `Stima parametrica: ${it(p.geo.lordaMq)} m² lordi × 0,12 m³/m² · da sostituire con i calcoli strutturali`);
    } else if (c.struttura === "muratura_portante") {
      voce(p, "cordoli_ca", "Cordoli di piano in c.a. sulla muratura portante", "m³", p.geo.perimetroM * 1.5 * 0.3 * 0.25,
        `${it(p.geo.perimetroM)} m di perimetro × 1,5 (pareti interne portanti) × 0,30 × 0,25 m`);
    } else {
      voce(p, "struttura_legno", "Struttura portante in legno X-Lam (pareti e solai), fornitura e montaggio", "m³", p.geo.lordaMq * 0.32,
        `Stima parametrica: ${it(p.geo.lordaMq)} m² lordi × 0,32 m³/m² di pannelli`);
    }
    // ── Solaio sopra questo piano, copertura o terrazzo dove il piano sopra è più piccolo.
    const tipoSolaio = c.struttura === "legno_xlam" ? null : (`solaio_${c.solaio}` as const);
    if (sopra && (nuovo(p) || nuovo(sopra))) {
      const coperto = Math.min(p.geo.lordaMq, sopra.geo.lordaMq);
      if (tipoSolaio) voce(p, tipoSolaio, `Solaio in ${c.solaio === "laterocemento" ? "laterocemento" : c.solaio === "predalles" ? "lastre predalles" : "legno"} fra ${p.livello.nome.toLowerCase()} e ${sopra.livello.nome.toLowerCase()}`, "m²", coperto,
        `Superficie del ${sopra.livello.nome.toLowerCase()}: ${it(coperto)} m²`);
      if (nuovo(p)) voce(p, "terrazzo", "Copertura piana praticabile (terrazzo): solaio, isolamento, impermeabilizzazione e pavimento", "m²", p.geo.lordaMq - sopra.geo.lordaMq,
        `${it(p.geo.lordaMq)} m² del ${p.livello.nome.toLowerCase()} − ${it(sopra.geo.lordaMq)} m² del piano sopra`);
      voce(p, "scala", `Scala in c.a. fra ${p.livello.nome.toLowerCase()} e ${sopra.livello.nome.toLowerCase()}, con gradini e parapetto`, "cad", 1, "Una rampa per ogni piano");
    } else if (!sopra && nuovo(p)) {
      const tetto = p.livello.tetto;
      const falde = tetto && tetto.tipo !== "piano";
      const inclinazione = falde ? Math.sqrt(1 + (tetto.pendenza / 100) ** 2) : 1;
      const gronda = falde ? p.geo.perimetroM * tetto.sporto / 100 : 0;
      voce(p, "copertura", falde ? "Copertura a falde: struttura, isolamento, impermeabilizzazione e manto" : "Copertura piana: solaio, isolamento e impermeabilizzazione", "m²",
        p.geo.lordaMq * inclinazione + gronda,
        `${it(p.geo.lordaMq)} m²${falde ? ` × ${it(inclinazione, 3)} (pendenza ${it(tetto.pendenza)}%) + ${it(gronda)} m² di gronda` : ""}`);
    }
    // ── Pareti di perimetro: superficie netta dallo studio (vuoti detratti).
    // Sui piani esistenti le pareti non sono nello studio: perimetro × altezza, meno il 15% di vuoti.
    const esterne = nuovo(p) ? [...p.geo.muriPerimetro].reduce((s, id) => s + (muriMq.get(`${p.livello.id}:${id}`) ?? 0), 0) : p.geo.perimetroM * p.geo.altezzaM * 0.85;
    const criterioFacciate = nuovo(p) ? "Superficie netta delle pareti di perimetro"
      : `${it(p.geo.perimetroM)} m × ${it(p.geo.altezzaM)} m × 0,85 (vuoti delle finestre)`;
    if (c.cappottoCm > 0) voce(p, "cappotto", `Isolamento a cappotto ${c.cappottoCm} cm, rasato e finito`, "m²", esterne, criterioFacciate);
    else voce(p, "intonaco_esterno", "Intonaco esterno e finitura delle facciate", "m²", esterne, criterioFacciate);
    // ── Massetti, isolamento a terra, soffitti, pavimenti e rivestimenti dove lo studio non li ha.
    voce(p, "massetto", "Massetto di sottofondo alleggerito e sabbia-cemento", "m²", p.nettaMq, `Superficie netta delle stanze: ${it(p.nettaMq)} m²`);
    if (p === base) voce(p, "isolamento_pavimento", "Isolamento termico del pavimento a terra", "m²", p.nettaMq, "Superficie netta delle stanze del piano a terra");
    // ── Impianti: a superficie, per bagno, per cucina, per alloggio.
    voce(p, "impianto_elettrico", "Impianto elettrico e dati completo, quadro compreso", "m²", p.nettaMq, `Superficie netta: ${it(p.nettaMq)} m²`);
    const bagni = p.interni.filter((l) => l.destinazione === "bagno");
    bagni.forEach((b, n) => voce(p, "bagno_completo", `Impianto idrico-sanitario e sanitari · ${b.nome}`, "cad", 1, `${it(areaPoligono(b.contorno) / 10_000)} m²`, n + 1));
    const cucine = p.interni.filter((l) => l.destinazione === "cucina" || /cottura|cucina|pranzo|a\.c\./i.test(l.nome));
    cucine.forEach((k, n) => voce(p, "attacchi_cucina", `Attacchi idrici e scarichi della cucina · ${k.nome}`, "cad", 1, "Una cucina", n + 1));
    if (c.riscaldamento === "radiante_pompa_di_calore") voce(p, "riscaldamento_radiante", "Impianto di riscaldamento e raffrescamento a pavimento", "m²", p.nettaMq, "Superficie netta delle stanze");
    else voce(p, "riscaldamento_radiatori", "Impianto di riscaldamento a radiatori", "m²", p.nettaMq, "Superficie netta delle stanze");
    // Pavimenti e rivestimenti per stanza: lo studio li aggiunge solo quando c'è una finitura scelta.
    p.interni.forEach((l) => {
      const mq = areaPoligono(l.contorno) / 10_000;
      righe.push({ id: `${l.id}-pavimento`, livelloId: p.livello.id, piano: p.livello.nome, fase: "Finiture", gruppo: "10 Massetti, pavimenti e rivestimenti",
        descrizione: `Posa pavimento · ${l.nome}`, unita: "m²", quantita: arrotonda(mq), criterio: "Superficie netta del contorno interno", stimata: true,
        riferimento: { tipo: "locale", id: l.id } });
      if (l.destinazione === "bagno") righe.push({ id: `${l.id}-rivestimento`, livelloId: p.livello.id, piano: p.livello.nome, fase: "Finiture",
        gruppo: "10 Massetti, pavimenti e rivestimenti", descrizione: `Rivestimento · ${l.nome}`, unita: "m²",
        quantita: arrotonda(perimetroPoligono(l.contorno) / 100 * 2.2), criterio: `Perimetro ${it(perimetroPoligono(l.contorno) / 100)} m × 2,20 m`, stimata: true,
        riferimento: { tipo: "locale", id: l.id } });
    });
  });

  // ── Alloggi: generatore e portoncino per ognuno.
  const unita = new Set(piani.flatMap((p) => p.interni.map((l) => l.unita?.trim()).filter(Boolean)));
  const alloggi = unita.size || Math.max(1, piani.reduce((s, p) => s + p.interni.filter((l) => l.destinazione === "soggiorno" || /sogg/i.test(l.nome)).length, 0));
  const criterioAlloggi = unita.size ? `${alloggi} unità nella pianta` : `${alloggi} alloggi, uno per soggiorno (assegna le unità alle stanze per contarli esatti)`;
  voce(null, c.riscaldamento === "radiante_pompa_di_calore" ? "pompa_di_calore" : "caldaia",
    c.riscaldamento === "radiante_pompa_di_calore" ? "Pompa di calore aria-acqua con accumulo sanitario" : "Caldaia a condensazione con produzione sanitaria", "cad", alloggi, criterioAlloggi);
  voce(null, "portoncino", "Portoncino d'ingresso blindato", "cad", alloggi, criterioAlloggi);
  // ── Esterni.
  // Sopraelevazione: il piano più basso c'è già, e con lui il lotto. Il marciapiede intorno alla
  // casa non si rifà, e le aree disegnate senza stato (prati, vialetti del DWG) sono quelle che ci
  // sono: si contano solo quelle segnate «nuove». Le opere disegnate (piscine, pergole) restano,
  // nel loro capitolo: si tolgono dall'editor se esistono già (Callimaco, 25/11/2026).
  const lottoEsistente = !nuovo(base);
  if (c.marciapiedeCm > 0 && !lottoEsistente) voce(base, "marciapiede", "Marciapiede perimetrale con cordolo", "m²", base.geo.perimetroM * c.marciapiedeCm / 100,
    `${it(base.geo.perimetroM)} m × ${it(c.marciapiedeCm / 100)} m`);
  voce(null, "allacciamenti", "Allacciamenti alle reti (acqua, fognatura, energia elettrica) e pozzetti", "a corpo", 1, "Ordine di grandezza: dipende dalle distanze dalle reti");

  // ── Esterni disegnati: aree del lotto, recinzione, piscine e arredi da giardino. In una
  // sopraelevazione sono un lavoro a sé: nel computo vanno a parte, col loro totale.
  const primaDegliEsterni = righe.length;
  const AREE: Partial<Record<string, [TipoCostruzione, string]>> = {
    prato: ["prato", "Sistemazione a prato: terra vegetale, semina e irrigazione"],
    pavimentato: ["pavimentazione_esterna", "Pavimentazione esterna su massetto"],
    vialetto: ["vialetto", "Vialetto pedonale pavimentato"],
    ghiaia: ["ghiaia", "Area in ghiaia su telo"],
    parcheggio: ["parcheggio_esterno", "Parcheggio e passo carraio: sottofondo e pavimentazione drenante"],
    aiuola: ["aiuola", "Aiuola: terra vegetale, bordure e piantumazione"],
  };
  const perTipo = new Map<TipoCostruzione, { mq: number; descrizione: string }>();
  let recinzioneM = 0;
  for (const p of piani) {
    for (const a of (p.stato as { aree?: AreaEsterna[] }).aree ?? []) {
      if (a.stato === "da_demolire" || a.stato === "esistente" || a.contorno.length < 3) continue;
      if (lottoEsistente && a.stato !== "nuovo") continue;
      if (a.tipo === "lotto") { if (a.recinzione !== false) recinzioneM += perimetroPoligono(a.contorno) / 100; continue; }
      const regola = AREE[a.tipo];
      if (!regola) continue;
      const prima = perTipo.get(regola[0]) ?? { mq: 0, descrizione: regola[1] };
      perTipo.set(regola[0], { ...prima, mq: prima.mq + areaPoligono(a.contorno) / 10_000 });
    }
  }
  for (const [tipo, { mq, descrizione }] of perTipo) voce(base, tipo, descrizione, "m²", mq, "Superficie delle aree disegnate nel lotto");
  voce(base, "recinzione", "Recinzione del lotto: muretto, paletti e rete o pannelli", "m", recinzioneM, "Perimetro del lotto recintato");
  const elementi = piani.flatMap((p) => p.stato.elementi ?? []).filter((e) => e.stato !== "da_demolire" && e.stato !== "esistente");
  elementi.filter((e) => e.tipo === "piscina").forEach((e, n) => voce(base, "piscina", "Piscina interrata: scavo, vasca in c.a., impermeabilizzazione, bordo e impianto di filtrazione", "m²",
    e.larghezza * e.profondita / 10_000, `Vasca ${it(e.larghezza / 100)} × ${it(e.profondita / 100)} m`, n + 1));
  voce(base, "pergola", "Pergola in legno o alluminio, fornitura e posa", "cad", elementi.filter((e) => e.tipo === "pergola").length, "Pergole disegnate");
  voce(base, "idromassaggio", "Minipiscina idromassaggio, fornitura e posa", "cad", elementi.filter((e) => e.tipo === "idromassaggio").length, "Minipiscine disegnate");
  // Gli esterni non sono di un piano: con il nome del più basso finivano «Cantina · Vasca 8 × 5».
  for (const r of righe.slice(primaDegliEsterni)) {
    r.piano = "Esterni";
    if (lottoEsistente) r.aParte = true;
  }
  return { righe, perimetro };
}

/** La variante in cui si costruisce, quando il disegno passa tutto nel progetto. */
export const ID_VARIANTE_COSTRUZIONE = "A";

/**
 * Il disegno passa nella variante «Costruzione», piano per piano secondo `costruzione.piani`:
 * - da costruire: tutto nuovo, e lo stato di oggi resta vuoto (il terreno o il tetto sotto);
 * - esistente da rifare dentro: oggi restano le pareti di perimetro (struttura e involucro);
 *   nella variante tramezzi, stanze, porte e finestre sono nuovi;
 * - esistente che non si tocca: resta com'è.
 * I piani che hanno già una variante non si toccano: lì il progetto c'è già.
 */
export function disegnoDaCostruire(doc: Planimetria, costruzione: Pick<Costruzione, "piani"> | undefined = doc.costruzione): Planimetria {
  return {
    ...doc,
    livelli: doc.livelli.map((l) => {
      const modo = modoPiano(costruzione, l.id);
      if (modo === "esistente" || l.proposte.length || !(l.fatto.muri.length || l.fatto.locali.length)) return l;
      const nuovo = <T extends object>(x: readonly T[] | undefined) => (x ?? []).map((e) => ({ ...e, stato: "nuovo" as const }));
      const f = l.fatto;
      if (modo === "nuovo") return {
        ...l,
        proposte: [{ ...f, id: ID_VARIANTE_COSTRUZIONE, nome: "Costruzione", muri: nuovo(f.muri), aperture: nuovo(f.aperture), locali: f.locali,
          elementi: nuovo(f.elementi) } as unknown as Proposta],
        fatto: { ...f, muri: [], aperture: [], locali: [], elementi: [] },
      };
      const involucro = geometriaPiano(f.muri, f.locali).muriPerimetro;
      const esistenti = f.muri.filter((m) => involucro.has(m.id));
      return {
        ...l,
        proposte: [{ ...f, id: ID_VARIANTE_COSTRUZIONE, nome: "Costruzione",
          muri: [...esistenti, ...nuovo(f.muri.filter((m) => !involucro.has(m.id)))], aperture: nuovo(f.aperture), locali: f.locali,
          elementi: nuovo(f.elementi) } as unknown as Proposta],
        fatto: { ...f, muri: esistenti, aperture: [], locali: [], elementi: [] },
      };
    }),
  };
}
