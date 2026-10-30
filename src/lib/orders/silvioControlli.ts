/**
 * Cosa Silvio guarda in una commessa prima di aiutare (31/10/2026).
 *
 * Florin: «Silvio accanto a Ditte e contratti, un popup che mi aiuta a sistemare
 * le fasi; e in Materiali e acquisti mi aiuta a impostare le cose da acquistare».
 * Qui i controlli, fatti sui dati veri della commessa e non dal modello: ogni
 * punto dice cosa manca, su quali fasi o materiali, e quale azione lo risolve.
 * Il modello entra dopo, nella chat, con questo quadro già in mano.
 * Tutto puro: niente rete, verificabile dai test.
 */

export type AzioneSilvio = "date" | "assegna" | "ditte" | "cronoprogramma" | "articoli" | "acquisti";

export interface PuntoSilvio {
  chiave: string;
  gravita: "alta" | "media";
  titolo: string;
  dettaglio: string;
  azione: AzioneSilvio;
  etichettaAzione: string;
}

interface FaseControllo {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  percentuale: number;
  assignments: ReadonlyArray<{ source?: string; executor_type?: string; external_team_id?: string | null; cost_preventivo?: number }>;
}

const elenco = (nomi: string[], max = 3) =>
  nomi.length <= max ? nomi.join(", ") : `${nomi.slice(0, max).join(", ")} e altre ${nomi.length - max}`;
const chiusa = (f: FaseControllo) => f.status === "completata" || f.percentuale >= 100;

/** I controlli sulle fasi: date, chi le fa, ritardi, costi previsti. */
export function controlliFasi(
  fasi: ReadonlyArray<FaseControllo>,
  vociPerFase: ReadonlyMap<string, number>,
  oggi: string,
): PuntoSilvio[] {
  const aperte = fasi.filter((f) => !chiusa(f));
  const punti: PuntoSilvio[] = [];
  const senzaDate = aperte.filter((f) => !f.start_date || !f.end_date);
  if (senzaDate.length) punti.push({
    chiave: "senza-date", gravita: "alta", azione: "date", etichettaAzione: "Pianifica le date",
    titolo: `${senzaDate.length} ${senzaDate.length === 1 ? "fase senza date" : "fasi senza date"}`,
    dettaglio: `${elenco(senzaDate.map((f) => f.name))}: senza inizio e fine non entrano nel cronoprogramma.`,
  });
  const inRitardo = aperte.filter((f) => f.end_date && f.end_date < oggi);
  if (inRitardo.length) punti.push({
    chiave: "ritardo", gravita: "alta", azione: "cronoprogramma", etichettaAzione: "Apri il cronoprogramma",
    titolo: `${inRitardo.length} ${inRitardo.length === 1 ? "fase in ritardo" : "fasi in ritardo"}`,
    dettaglio: `${elenco(inRitardo.map((f) => `${f.name} (${f.percentuale}%)`))}: la fine prevista è passata.`,
  });
  const senzaNessuno = aperte.filter((f) => f.assignments.length === 0);
  if (senzaNessuno.length) punti.push({
    chiave: "senza-nessuno", gravita: "alta", azione: "assegna", etichettaAzione: "Assegna",
    titolo: `${senzaNessuno.length} ${senzaNessuno.length === 1 ? "fase senza nessuno" : "fasi senza nessuno"}`,
    dettaglio: `${elenco(senzaNessuno.map((f) => f.name))}: né persone né ditte assegnate.`,
  });
  const dittaSenzaPrevisto = aperte.filter((f) =>
    f.assignments.some((a) => (a.source === "team" || a.executor_type === "external" || !!a.external_team_id) && !Number(a.cost_preventivo)));
  if (dittaSenzaPrevisto.length) punti.push({
    chiave: "ditta-senza-costo", gravita: "media", azione: "ditte", etichettaAzione: "Ditte e contratti",
    titolo: `${dittaSenzaPrevisto.length} ${dittaSenzaPrevisto.length === 1 ? "ditta senza costo previsto" : "ditte senza costo previsto"}`,
    dettaglio: `${elenco(dittaSenzaPrevisto.map((f) => f.name))}: il costo si prende dalle voci del listino.`,
  });
  const senzaVoci = aperte.filter((f) => !(vociPerFase.get(f.id) ?? 0));
  if (senzaVoci.length && senzaVoci.length < fasi.length) punti.push({
    chiave: "senza-voci", gravita: "media", azione: "ditte", etichettaAzione: "Voci dal listino",
    titolo: `${senzaVoci.length} ${senzaVoci.length === 1 ? "fase senza voci di lavoro" : "fasi senza voci di lavoro"}`,
    dettaglio: `${elenco(senzaVoci.map((f) => f.name))}: senza voci non c'è un costo del lavoro da confrontare.`,
  });
  return punti;
}

interface MaterialeControllo {
  id: string;
  name: string;
  quantity: number;
  phase_id: string | null;
  supplier_id: string | null;
  purchase_price: number | null;
  readiness: "magazzino" | "ordinato" | "da_ordinare";
}

const piuGiorni = (d: string, n: number) => {
  const [a, m, g] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + n)).toISOString().slice(0, 10);
};

/** I controlli sui materiali: cosa ordinare, cosa serve presto, a chi, a che prezzo. */
export function controlliAcquisti(
  materiali: ReadonlyArray<MaterialeControllo>,
  fasi: ReadonlyArray<{ id: string; name: string; start_date: string | null }>,
  oggi: string,
  giorniAnticipo = 14,
): PuntoSilvio[] {
  const daOrdinare = materiali.filter((m) => m.readiness === "da_ordinare");
  const punti: PuntoSilvio[] = [];
  const entro = piuGiorni(oggi, giorniAnticipo);
  const fasiVicine = new Map(fasi.filter((f) => f.start_date && f.start_date <= entro).map((f) => [f.id, f]));
  const urgenti = daOrdinare.filter((m) => m.phase_id && fasiVicine.has(m.phase_id));
  if (urgenti.length) punti.push({
    chiave: "urgenti", gravita: "alta", azione: "acquisti", etichettaAzione: "Ordina adesso",
    titolo: `${urgenti.length} ${urgenti.length === 1 ? "materiale da ordinare subito" : "materiali da ordinare subito"}`,
    dettaglio: `Servono a fasi che partono entro ${giorniAnticipo} giorni: ${elenco([...new Set(urgenti.map((m) => fasiVicine.get(m.phase_id!)!.name))])}.`,
  });
  const senzaFornitore = daOrdinare.filter((m) => !m.supplier_id);
  if (senzaFornitore.length) punti.push({
    chiave: "senza-fornitore", gravita: "media", azione: "articoli", etichettaAzione: "Scegli i fornitori",
    titolo: `${senzaFornitore.length} ${senzaFornitore.length === 1 ? "materiale senza fornitore" : "materiali senza fornitore"}`,
    dettaglio: `${elenco(senzaFornitore.map((m) => m.name))}: senza fornitore non si fa l'ordine.`,
  });
  const fornitori = new Set(daOrdinare.filter((m) => m.supplier_id).map((m) => m.supplier_id));
  const conFornitore = daOrdinare.filter((m) => m.supplier_id);
  if (conFornitore.length) punti.push({
    chiave: "da-ordinare", gravita: urgenti.length ? "media" : "alta", azione: "acquisti", etichettaAzione: "Prepara gli ordini",
    titolo: `${conFornitore.length} da ordinare a ${fornitori.size} ${fornitori.size === 1 ? "fornitore" : "fornitori"}`,
    dettaglio: "Un ordine per fornitore, con le righe già pronte.",
  });
  const senzaPrezzo = daOrdinare.filter((m) => !(Number(m.purchase_price) > 0));
  if (senzaPrezzo.length) punti.push({
    chiave: "senza-prezzo", gravita: "media", azione: "articoli", etichettaAzione: "Completa i prezzi",
    titolo: `${senzaPrezzo.length} ${senzaPrezzo.length === 1 ? "materiale senza prezzo d'acquisto" : "materiali senza prezzo d'acquisto"}`,
    dettaglio: `${elenco(senzaPrezzo.map((m) => m.name))}: il costo previsto della commessa resta incompleto.`,
  });
  const senzaFase = daOrdinare.filter((m) => !m.phase_id);
  if (senzaFase.length) punti.push({
    chiave: "senza-fase", gravita: "media", azione: "articoli", etichettaAzione: "Collega alle fasi",
    titolo: `${senzaFase.length} ${senzaFase.length === 1 ? "materiale senza fase" : "materiali senza fase"}`,
    dettaglio: "Senza fase non si sa quando serve in cantiere, e non si può avvisare in tempo.",
  });
  return punti;
}

/** Il quadro da dare a Silvio in chat: i punti già trovati, in poche righe. */
export function quadroPerSilvio(intestazione: string, punti: ReadonlyArray<PuntoSilvio>): string {
  return punti.length
    ? `${intestazione}\nCosa ho già visto:\n${punti.map((p) => `- ${p.titolo}: ${p.dettaglio}`).join("\n")}`
    : `${intestazione}\nNon vedo cose che mancano.`;
}
