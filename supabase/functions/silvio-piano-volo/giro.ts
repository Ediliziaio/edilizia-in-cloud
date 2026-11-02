/**
 * Il giro del piano di volo per un'azienda (revisione 2/11/2026): fuori da `index.ts` perché lo
 * provano i test, e quindi senza niente di Deno. Vedi `index.ts` per cosa fa e quando.
 *
 * Le letture passano da `righeCerte` (D10): un errore si alza e salta la commessa, o tutta
 * l'azienda se non si sa cosa ha vietato il titolare. Un elenco vuoto vuol dire vuoto davvero.
 */
import { autonomiaDaRighe, livelloDi, type SceltaAutonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { calendarioAzienda, type ImpostazioniCalendario } from "../../../shared/silvio-commessa/calendario.ts";
import { aggiungiGiorni } from "../../../shared/silvio-commessa/date.ts";
import { leggiContestoRisorse, righeCerte, testo, uno, type ClientRisorse, type Riga } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import {
  controlloDaSegnalare, controlloFase, fasiAppenaFinite, fasiDaControllare, propostaSal, type DatiSal, type FaseInVolo, type StatoDellaFase,
} from "../../../shared/silvio-commessa/pianoVolo.ts";

export const MAX_AZIENDE = 25;
const MAX_COMMESSE = 30;
const MAX_FASI = 1000;
/** La finestra delle fasi: finite da poco (per il SAL) o in partenza (per il controllo). */
const GIORNI_INDIETRO = 15;
const GIORNI_AVANTI = 21;
const STATI_CHIUSI = ["completato", "completata", "annullato", "annullata", "chiuso", "chiusa"];

export interface EsitoGiro {
  oggi: string;
  aziende: number;
  commesse: number;
  controlli: number;
  sal: number;
  notifiche: number;
  scadute: number;
  anteprima?: unknown[];
  errori: string[];
}

interface RispostaRpc { data: unknown; error: { message: string } | null }
/** Il client del giro: le query di ClientRisorse, le RPC, le notifiche. */
export type ClientGiro = {
  rpc: (nome: string, argomenti: Record<string, unknown>) => PromiseLike<RispostaRpc>;
  from: (tabella: "notifications") => { insert: (righe: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }> };
};

/**
 * Le aziende di oggi, al massimo `max` (D11): si scorrono in ordine, ripartendo ogni giorno da
 * dove è finito il giorno prima. Senza, oltre le 25 restavano fuori sempre le stesse.
 */
export function aziendeDelGiro(ids: readonly string[], oggi: string, max = MAX_AZIENDE): string[] {
  const ordinate = [...new Set(ids)].sort();
  if (ordinate.length <= max) return ordinate;
  const giorno = Math.floor(Date.parse(`${oggi}T00:00:00Z`) / 86_400_000);
  const inizio = (giorno * max) % ordinate.length;
  return Array.from({ length: max }, (_, i) => ordinate[(inizio + i) % ordinate.length]);
}

/** Le fasi per il SAL: tutte quelle della commessa; senza date, la durata la dicono le sottofasi. */
export function fasiPerSal(righeFasi: readonly Riga[]): DatiSal["fasi"] {
  return righeFasi.map((f) => {
    const sottofasi = Array.isArray(f.sottofasi) ? (f.sottofasi as Riga[]) : [];
    const giorni = sottofasi.reduce((t, s) => t + (Number(s.giorni) || 0), 0);
    const dal = (f.start_date as string | null) ?? null;
    const al = (f.end_date as string | null) ?? null;
    return { id: f.id as string, nome: testo(f.name), dal, al, ...(!dal && !al && giorni > 0 ? { giorni } : {}) };
  });
}

export async function giroAzienda(admin: ClientGiro, db: ClientRisorse, companyId: string, oggi: string, anteprima: boolean, esito: EsitoGiro) {
  const [scelte, calendario, festivita] = await Promise.all([
    righeCerte("autonomia", db.from("silvio_autonomia").select("azione, livello, soglia_eur").eq("company_id", companyId)),
    righeCerte("calendario", db.from("silvio_calendario").select("chiusura_dal, chiusura_al, patrono, patrono_nome, sabato_lavorativo").eq("company_id", companyId).limit(1)),
    righeCerte("festività", db.from("hr_festivita").select("data, descrizione, ricorrente").eq("company_id", companyId)),
  ]);
  const autonomia = autonomiaDaRighe(scelte as unknown as SceltaAutonomia[]);
  const controlli = livelloDi(autonomia, "controllo_fase") !== "vietata";
  const sal = livelloDi(autonomia, "proposta_sal") !== "vietata";
  if (!controlli && !sal) return;
  const impostazioni: ImpostazioniCalendario = {
    calendario: (calendario[0] ?? null) as ImpostazioniCalendario["calendario"],
    festivita: festivita as unknown as ImpostazioniCalendario["festivita"],
  };

  // Le fasi vicine (revisione 1/11, E4): quelle che partono entro tre settimane e quelle
  // finite da poco, delle sole commesse aperte, filtrate nel database. Prima era «da 120 giorni
  // fa in poi», senza fine e con un tetto che PostgREST taglia a 1000 righe.
  const dal = aggiungiGiorni(oggi, -GIORNI_INDIETRO);
  const fasi = await righeCerte("le fasi vicine", db.from("order_work_phases")
    .select("id, name, start_date, end_date, position, order_id, ordine:orders!inner(id, order_code, company_id, deleted_at, status, assigned_to, capomastro_user_id, indirizzo_lavori, work_address, total_amount, vat_rate)")
    .eq("ordine.company_id", companyId).is("ordine.deleted_at", null)
    .not("ordine.status", "in", `(${STATI_CHIUSI.join(",")})`)
    .lte("start_date", aggiungiGiorni(oggi, GIORNI_AVANTI))
    .or(`end_date.gte.${dal},and(end_date.is.null,start_date.gte.${dal})`)
    .order("start_date").limit(MAX_FASI));
  if (fasi.length >= MAX_FASI) esito.errori.push(`${companyId}: più di ${MAX_FASI} fasi vicine, lette le prime`);
  const perCommessa = new Map<string, { ordine: Riga; fasi: (FaseInVolo & { position: number })[] }>();
  for (const f of fasi) {
    const ordine = uno(f.ordine as Riga | Riga[] | null);
    if (!ordine || /complet|annull|chius/i.test(testo(ordine.status))) continue;
    const g = perCommessa.get(f.order_id as string) ?? { ordine, fasi: [] };
    g.fasi.push({ id: f.id as string, nome: testo(f.name), dal: (f.start_date as string | null) ?? null, al: (f.end_date as string | null) ?? null, position: Number(f.position) || 0 });
    perCommessa.set(f.order_id as string, g);
  }

  // A rotazione, col tetto per giro (CLAUDE.md, «il lavoro che cresce coi dati»): prima le
  // commesse che il piano di volo non guarda da più tempo, così oltre le 30 non restano
  // sempre fuori le stesse.
  const visteIl = new Map<string, string>();
  for (const v of await righeCerte("le commesse già viste", db.from("silvio_piano_volo").select("order_id, updated_at").eq("company_id", companyId)
    .gte("updated_at", `${aggiungiGiorni(oggi, -GIORNI_AVANTI)}T00:00:00Z`).order("updated_at", { ascending: false }).limit(1000))) {
    if (!visteIl.has(v.order_id as string)) visteIl.set(v.order_id as string, String(v.updated_at ?? ""));
  }
  const inOrdine = [...perCommessa.entries()].sort(([a], [b]) => (visteIl.get(a) ?? "").localeCompare(visteIl.get(b) ?? ""));

  let commesse = 0;
  for (const [orderId, { ordine, fasi: fasiOrdine }] of inOrdine) {
    const cal = calendarioAzienda(impostazioni, testo(ordine.indirizzo_lavori) || testo(ordine.work_address) || null);
    const daControllare = controlli ? fasiDaControllare(fasiOrdine, oggi, cal) : [];
    const finite = sal ? fasiAppenaFinite(fasiOrdine, oggi, cal) : [];
    if (!daControllare.length && !finite.length) continue;
    if (++commesse > MAX_COMMESSE) break;
    esito.commesse += 1;
    const codice = testo(ordine.order_code) || "senza numero";
    const nuove: string[] = [];

    // Una commessa che non si riesce a leggere si salta tutta, e si dice (D10): meglio nessuna
    // proposta di una che dice «nessuno è assegnato» perché la lettura è andata male.
    try {
      if (daControllare.length) {
        // Il contesto della fase 4, con questa commessa esclusa: i suoi impegni non sono conflitti.
        const ctx = await leggiContestoRisorse(companyId, [], orderId, db);
        if (ctx.lettureFallite.length) throw new Error(`non letti: ${ctx.lettureFallite.join(", ")}`);
        for (const fase of daControllare) {
          const c = controlloFase(fase, await statoDellaFase(db, orderId, fase), ctx, autonomia);
          if (anteprima) { esito.anteprima!.push({ commessa: codice, tipo: "controllo", ...c }); continue; }
          const { data: reg, error } = await admin.rpc("silvio_volo_registra", {
            p_company: companyId, p_order: orderId, p_fase: fase.id, p_tipo: "controllo", p_giorno: oggi,
            p_riassunto: c.riassunto, p_problemi: c.problemi, p_azioni: c.azioni,
          });
          if (error) { esito.errori.push(`${codice}: ${error.message}`); continue; }
          esito.controlli += 1;
          // «Tutto pronto» resta sulla commessa, senza campanella (D11).
          if (daNotificare(reg) && controlloDaSegnalare(c)) nuove.push(c.riassunto);
        }
      }

      if (finite.length) {
        // TUTTE le fasi della commessa (D8): `fasiOrdine` sono solo quelle vicine, e il conto
        // dell'avanzamento sulle sole vicine dava 50 % a chi ne aveva fatto il 30.
        const [tutte, rate, salFatti] = await Promise.all([
          righeCerte("le fasi della commessa", db.from("order_work_phases")
            .select("id, name, start_date, end_date, position, sottofasi:order_work_subphases(giorni)").eq("order_id", orderId).order("position")),
          righeCerte("le rate", db.from("order_installments").select("trigger_evento, trigger_numero, amount, label").eq("order_id", orderId)),
          righeCerte("i SAL", db.from("sal").select("numero_progressivo, importo, status").eq("order_id", orderId)),
        ]);
        for (const fase of finite) {
          const proposta = propostaSal({
            fasi: fasiPerSal(tutte), finita: fase, totale: Number(ordine.total_amount) || 0,
            iva: ordine.vat_rate == null ? null : Number(ordine.vat_rate),
            salFatti: salFatti.filter((s) => s.status !== "annullato").map((s) => ({ numero: Number(s.numero_progressivo) || 0, importo: Number(s.importo) || 0 })),
            rate: rate.map((r) => ({ trigger_evento: (r.trigger_evento as string | null) ?? null, trigger_numero: r.trigger_numero == null ? null : Number(r.trigger_numero), amount: Number(r.amount) || 0, label: testo(r.label) })),
          }, cal);
          if (!proposta) continue;
          const riassunto = `SAL n. ${proposta.numero} pronto in bozza: ${proposta.motivo}`;
          if (anteprima) { esito.anteprima!.push({ commessa: codice, tipo: "sal", fase, proposta }); continue; }
          const { data: reg, error } = await admin.rpc("silvio_volo_registra", {
            p_company: companyId, p_order: orderId, p_fase: fase.id, p_tipo: "sal", p_giorno: oggi,
            p_riassunto: riassunto, p_problemi: [], p_azioni: [proposta],
          });
          if (error) { esito.errori.push(`${codice}: ${error.message}`); continue; }
          esito.sal += 1;
          if (daNotificare(reg)) nuove.push(riassunto);
        }
      }
    } catch (e) {
      const messaggio = `${codice} saltata: ${e instanceof Error ? e.message : String(e)}`;
      console.error(`[silvio-piano-volo] ${companyId}, ${messaggio}`);
      esito.errori.push(messaggio);
    }

    // Una campanella per commessa al responsabile e al capomastro: in app, mai email o WhatsApp.
    const destinatari = [...new Set([ordine.assigned_to, ordine.capomastro_user_id].filter((x): x is string => typeof x === "string"))];
    if (nuove.length && destinatari.length) {
      const { error } = await admin.from("notifications").insert(destinatari.map((userId) => ({
        company_id: companyId, user_id: userId, type: "silvio_piano_volo",
        title: `Silvio, commessa ${codice}: ${nuove.length === 1 ? "una cosa da guardare" : `${nuove.length} cose da guardare`}`,
        body: nuove.join(" "), entity_type: "order", entity_id: orderId, action_url: `/azienda/ordini/${orderId}`,
      })));
      if (!error) esito.notifiche += destinatari.length;
    }
  }
}

/**
 * La campanella suona solo per una proposta nuova o con azioni diverse da ieri (revisione 1/11,
 * S6): `silvio_volo_registra` aggiorna la riga aperta ogni giorno, e prima ogni giorno era
 * «una cosa da guardare» anche se non era cambiato niente.
 */
function daNotificare(reg: unknown): boolean {
  const r = (reg ?? {}) as { nuova?: unknown; cambiata?: unknown };
  return r.nuova === true || r.cambiata === true;
}

/** Quello che la commessa ha già per la fase: persone, mezzi, ditte, contratti, ordini da consegnare. */
async function statoDellaFase(db: ClientRisorse, orderId: string, fase: FaseInVolo): Promise<StatoDellaFase> {
  const [persone, mezzi, ditte, contratti, ordini] = await Promise.all([
    righeCerte("la squadra", db.from("order_employees").select("employee_id, phase_id, dipendente:employees(first_name, last_name)").eq("order_id", orderId)),
    righeCerte("i mezzi prenotati", db.from("mezzi_piani_cantiere").select("mezzo_id, fase_ids, mezzo:mezzi(nome)").eq("order_id", orderId).eq("annullato", false)),
    righeCerte("le ditte assegnate", db.from("order_external_teams").select("external_team_id, phase_id, ditta:external_teams(name, subappaltatore_id, kind)").eq("order_id", orderId)),
    righeCerte("i contratti", db.from("contratti_subappalto").select("stato, scheda:subappaltatori_sicurezza(campo_subappaltatore_id)").eq("order_id", orderId)),
    righeCerte("gli ordini", db.from("purchase_orders").select("id, oda_number, status, expected_delivery_date, fornitore:suppliers(name)").eq("order_id", orderId)),
  ]);
  // Il contratto che conta per una ditta: il più avanti, se per sbaglio ce ne sono due.
  const valore = (s: string | null) => ["attivo", "completato", "sospeso", "risolto", "bozza"].indexOf(s ?? "");
  const contrattoDi = new Map<string, string>();
  for (const c of contratti) {
    const sub = testo(uno(c.scheda as Riga | Riga[] | null)?.campo_subappaltatore_id);
    const stato = testo(c.stato);
    if (!sub) continue;
    const prima = contrattoDi.get(sub) ?? null;
    if (prima === null || valore(stato) < valore(prima)) contrattoDi.set(sub, stato);
  }
  const fine = fase.al ?? fase.dal ?? "9999-12-31";
  return {
    // Le persone della fase, o di tutta la commessa (senza fase).
    persone: persone.filter((p) => !p.phase_id || p.phase_id === fase.id).map((p) => {
      const d = uno(p.dipendente as Riga | Riga[] | null);
      return { employee_id: p.employee_id as string, nome: `${testo(d?.first_name)} ${testo(d?.last_name)}`.trim() || "Dipendente" };
    }),
    mezzi: mezzi.filter((m) => Array.isArray(m.fase_ids) && (m.fase_ids as string[]).includes(fase.id)).map((m) => ({
      mezzo_id: m.mezzo_id as string, nome: testo(uno(m.mezzo as Riga | Riga[] | null)?.nome) || "Mezzo",
    })),
    ditte: ditte.filter((d) => d.phase_id === fase.id).map((d) => {
      const t = uno(d.ditta as Riga | Riga[] | null);
      const subappaltatore = (t?.subappaltatore_id as string | null) ?? null;
      return {
        external_team_id: d.external_team_id as string, nome: testo(t?.name) || "Ditta", subappaltatore_id: subappaltatore,
        interna: t?.kind === "interna", contratto: subappaltatore ? contrattoDi.get(subappaltatore) ?? null : null,
      };
    }),
    // Gli ordini che servono entro la fine della fase (o senza data, che vanno chiariti).
    ordini: ordini.filter((o) => !o.expected_delivery_date || (o.expected_delivery_date as string) <= fine).map((o) => ({
      id: o.id as string, numero: (o.oda_number as string | null) ?? null, stato: testo(o.status),
      fornitore: testo(uno(o.fornitore as Riga | Riga[] | null)?.name) || "fornitore", consegna: (o.expected_delivery_date as string | null) ?? null,
    })),
  };
}
