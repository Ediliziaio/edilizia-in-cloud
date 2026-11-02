/**
 * Mette insieme il piano di una commessa, uguale per la schermata e per Silvio (2/11/2026).
 */
import { calendarioAzienda, type ImpostazioniCalendario } from "../silvio-commessa/calendario.ts";
import { leggiContestoRisorse, type ClientRisorse } from "../silvio-commessa/contestoRisorse.ts";
import { oggiInItalia } from "../silvio-commessa/date.ts";
import { calcolaPiano, IPOTESI_PREDEFINITE, oreDellaVoce, type Incidenza, type Ipotesi, type PianoCantiere, type VoceCantiere, type OreVoce } from "./calcolo.ts";
import { marginePrevisto, type CostiRegistrati, type MarginePrevisto } from "./margine.ts";
import { correzioniDalloStorico, prevediFine, type Previsione } from "./previsione.ts";
import { regioneDaProvincia } from "./regioni.ts";
import { risorsePerPiano, type RisorsePiano } from "./risorse.ts";
import { conIncidenzaPrezzario, fasiDellaCommessa, testiSenzaManodopera, vociDellaCommessa, type DatiVoci, type RigaFase } from "./vociCommessa.ts";

export interface ClientPiano extends ClientRisorse {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface OpzioniPiano { al?: string | null; costoOrario?: number | null; oreGiorno?: number | null; resaPct?: number | null; oggi?: string }

export interface DatiPiano extends DatiVoci {
  commessa: { id: string; company_id: string; codice: string; descrizione: string | null; stato: string | null; inizio: string | null; fine: string | null; indirizzo: string | null };
  provincia: string | null;
  fasi: (RigaFase & { id: string; costo_registrato?: number | null })[];
  ditte: { nome: string; costo: number | null; phase_id?: string | null }[];
  economia: (CostiRegistrati & { ricavi: number }) | null;
  persone: { id: string; role_type: string | null; area: string | null; costo_orario: number | null }[];
  assegnati: { employee_id: string; phase_id: string | null }[];
  rese: { chiave: string; ore_per_unita: number }[];
  ultimo_rapportino: string | null;
  calendario: ImpostazioniCalendario | null;
  storico_fasi: { nome: string; ore_vere: number; costo_manodopera: number }[];
}

export interface EsitoPiano {
  commessa: DatiPiano["commessa"];
  ipotesi: Ipotesi;
  /** Da dove viene il costo orario, per dirlo a schermo. */
  costoOrarioDa: "scelto" | "schede" | "predefinito";
  regione: string | null;
  origineVoci: VoceCantiere["origine"] | null;
  voci: (VoceCantiere & { calcolo: OreVoce | null })[];
  piano: PianoCantiere;
  margine: MarginePrevisto | null;
  risorse: RisorsePiano;
  previsione: Previsione;
  avvisiLettura: string[];
}

const costoMedio = (d: DatiPiano) => {
  const FUORI = new Set(["staff_interno", "impiegato", "subappaltatore"]);
  const costi = d.persone.filter((p) => !FUORI.has(String(p.role_type ?? "").toLowerCase()) && Number(p.costo_orario) > 0).map((p) => Number(p.costo_orario));
  return costi.length ? Math.round(costi.reduce((t, c) => t + c, 0) / costi.length * 100) / 100 : null;
};

export async function costruisciPiano(db: ClientPiano, orderId: string, op: OpzioniPiano = {}): Promise<EsitoPiano | null> {
  const r = await db.rpc("piano_cantiere_dati", { p_order_id: orderId });
  if (r.error) throw new Error(r.error.message);
  if (!r.data) return null;
  const dati = r.data as DatiPiano;
  const oggi = op.oggi ?? oggiInItalia();
  const companyId = dati.commessa.company_id;
  const regione = regioneDaProvincia(dati.provincia);

  // Il prezzario, a piccoli gruppi: ogni chiamata ha pochi secondi di tempo.
  let voci = vociDellaCommessa(dati, dati.fasi);
  const testi = testiSenzaManodopera(voci);
  const stime = new Map<string, Incidenza>();
  const avvisiLettura: string[] = [];
  for (let i = 0; i < testi.length; i += 10) {
    const g = await db.rpc("piano_cantiere_incidenze", { p_company_id: companyId, p_testi: testi.slice(i, i + 10), p_regione: regione });
    if (g.error) { avvisiLettura.push("Il prezzario non ha risposto: alcune voci restano senza stima."); break; }
    for (const s of (g.data ?? []) as { testo: string; frazione: number; min: number; max: number }[]) {
      stime.set(s.testo, { frazione: s.frazione, min: s.min, max: s.max });
    }
  }
  voci = conIncidenzaPrezzario(voci, stime);

  const medio = costoMedio(dati);
  const ipotesi: Ipotesi = {
    costoOrario: Number(op.costoOrario) > 0 ? Number(op.costoOrario) : medio ?? IPOTESI_PREDEFINITE.costoOrario,
    oreGiorno: Number(op.oreGiorno) > 0 ? Number(op.oreGiorno) : IPOTESI_PREDEFINITE.oreGiorno,
    resaPct: Number(op.resaPct) > 0 ? Number(op.resaPct) : IPOTESI_PREDEFINITE.resaPct,
    rese: dati.rese,
  };
  const fasi = fasiDellaCommessa(dati.fasi);
  ipotesi.correzioni = correzioniDalloStorico(dati.storico_fasi.map((f) => ({ nome: f.nome, oreVere: Number(f.ore_vere), orePreviste: Number(f.costo_manodopera) / ipotesi.costoOrario })));
  const calendario = calendarioAzienda(dati.calendario, dati.commessa.indirizzo);
  const piano = calcolaPiano(voci, fasi, ipotesi, { oggi, al: op.al ?? dati.commessa.fine, calendario });
  const conFase = piano.fasi.map((f) => ({ ...f, id: dati.fasi.find((x) => x.nome?.trim() === f.nome)?.id ?? null }));
  const pianoConId: PianoCantiere = { ...piano, fasi: conFase };

  const margine = dati.economia
    ? marginePrevisto(pianoConId, voci, ipotesi, {
        ricavi: Number(dati.economia.ricavi) || 0,
        registrati: { manodopera: Number(dati.economia.manodopera) || 0, materiali: Number(dati.economia.materiali) || 0, ditte: Number(dati.economia.ditte) || 0, altri: Number(dati.economia.altri) || 0 },
        ditte: dati.ditte,
        manodoperaPerFase: new Map(dati.fasi.filter((f) => f.nome && Number(f.costo_registrato) > 0).map((f) => [f.nome!.trim(), Number(f.costo_registrato)])),
      })
    : null;
  // Una ditta senza fase: il suo lavoro non si può togliere da quello degli operai.
  for (const d of dati.ditte.filter((x) => !x.phase_id)) {
    avvisiLettura.push(`La ditta ${d.nome} non è collegata a una fase: le sue ore sono contate fra quelle degli operai, e il margine può risultare più basso. Collegala alla sua fase.`);
  }
  const ctx = await leggiContestoRisorse(companyId, [], orderId, db);
  if (ctx.lettureFallite.length) avvisiLettura.push("Non ho potuto leggere tutti gli impegni di persone e mezzi: controlla prima di assegnare.");
  const ruoli = new Map(dati.persone.map((p) => [p.id, { role_type: p.role_type, area: p.area }]));
  const assegnati = dati.assegnati.map((a) => ({ employee_id: a.employee_id, fase: dati.fasi.find((f) => f.id === a.phase_id)?.nome ?? null }));
  const risorse = risorsePerPiano(pianoConId, ctx, ruoli, assegnati);

  return {
    commessa: dati.commessa, ipotesi,
    costoOrarioDa: Number(op.costoOrario) > 0 ? "scelto" : medio ? "schede" : "predefinito",
    regione, origineVoci: voci[0]?.origine ?? null,
    voci: voci.map((v) => ({ ...v, calcolo: oreDellaVoce(v, ipotesi) })),
    piano: pianoConId, margine, risorse,
    previsione: prevediFine(fasi, dati.ultimo_rapportino, oggi, op.al ?? dati.commessa.fine, calendario),
    avvisiLettura,
  };
}
