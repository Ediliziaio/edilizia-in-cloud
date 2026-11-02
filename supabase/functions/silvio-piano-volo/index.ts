/**
 * silvio-piano-volo — il piano di volo delle commesse (1/11/2026, fase 5, lotto 5.3).
 * Vedi docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
 *
 * Una volta al giorno (cron: supabase/migrations-pending/20281106142500_silvio_piano_volo_cron.sql, da accendere dopo
 * il deploy), per le aziende con «Crea con Silvio» acceso:
 *   · 3 giorni lavorativi prima di ogni fase, il controllo di persone, mezzi, ordini, DURC e
 *     meteo di stagione, con le azioni pronte (`controlloFase` di shared/silvio-commessa/pianoVolo.ts);
 *   · il giorno dopo la fine di una fase, la proposta del SAL (`propostaSal`), se la commessa ha
 *     le rate a SAL.
 * Il risultato va in `silvio_piano_volo` (una riga per fase e tipo) e una campanella al
 * responsabile e al capomastro della commessa. NIENTE PARTE DA SOLO: le azioni le esegue
 * `silvio_volo_conferma` quando la persona conferma dalla commessa. Nessuna email, nessun
 * WhatsApp, nessuna chiamata AI: solo regole e letture.
 *
 * L'autonomia dell'azienda conta: con «controllo_fase» o «proposta_sal» vietati il giro salta
 * quella parte; le azioni vietate (squadra, mezzi) non si propongono.
 *
 * Risponde a pg_net entro 5 secondi e finisce in background (`serveConMetricheRapida`, vedi
 * CLAUDE.md, «la coda è una sola»). Tetti per giro: 25 aziende e 30 commesse per azienda.
 *
 * Corpo facoltativo: { company_id?: string, oggi?: "AAAA-MM-GG", anteprima?: true }.
 * Con `anteprima` legge e calcola, e restituisce cosa scriverebbe senza scrivere niente.
 *
 * Pubblicata con verify_jwt = false (supabase/config.toml): il cron porta x-cron-secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { autonomiaDaRighe, livelloDi, type SceltaAutonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { calendarioAzienda, type ImpostazioniCalendario } from "../../../shared/silvio-commessa/calendario.ts";
import { aggiungiGiorni, oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import { leggiContestoRisorse, righe, testo, uno, type ClientRisorse, type Riga } from "../../../shared/silvio-commessa/contestoRisorse.ts";
import {
  controlloFase, fasiAppenaFinite, fasiDaControllare, propostaSal, type FaseInVolo, type StatoDellaFase,
} from "../../../shared/silvio-commessa/pianoVolo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FEATURE = "silvio_crea_commessa";
const MAX_AZIENDE = 25;
const MAX_COMMESSE = 30;
const MAX_FASI = 1000;
/** La finestra delle fasi: finite da poco (per il SAL) o in partenza (per il controllo). */
const GIORNI_INDIETRO = 15;
const GIORNI_AVANTI = 21;
const STATI_CHIUSI = ["completato", "completata", "annullato", "annullata", "chiuso", "chiusa"];

interface EsitoGiro {
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

serveConMetricheRapida("silvio-piano-volo", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!cronSecretValido(req) && !(token && token === SERVICE_ROLE)) return errorResponse("Non autorizzato", 401, cors);

  const corpo = await req.json().catch(() => ({})) as { company_id?: string; oggi?: string; anteprima?: boolean };
  const oggi = typeof corpo.oggi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.oggi) ? corpo.oggi : oggiInItalia();
  const anteprima = corpo.anteprima === true;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = admin as unknown as ClientRisorse;
  const esito: EsitoGiro = { oggi, aziende: 0, commesse: 0, controlli: 0, sal: 0, notifiche: 0, scadute: 0, errori: [], ...(anteprima ? { anteprima: [] } : {}) };

  // Le aziende con «Crea con Silvio» acceso (un override: la chiave è spenta per tutti).
  let qAziende = admin.from("company_feature_overrides").select("company_id")
    .eq("feature_key", FEATURE).eq("is_enabled", true).neq("access_level", "disabled").limit(MAX_AZIENDE);
  if (corpo.company_id) qAziende = qAziende.eq("company_id", corpo.company_id);
  const { data: aziende, error: errAziende } = await qAziende;
  if (errAziende) return errorResponse(`Aziende: ${errAziende.message}`, 500, cors);

  if (!anteprima) {
    const { data: n } = await admin.rpc("silvio_volo_scadute", { p_oggi: oggi });
    esito.scadute = Number(n) || 0;
  }

  for (const { company_id: companyId } of (aziende ?? []) as { company_id: string }[]) {
    try {
      await giroAzienda(admin, db, companyId, oggi, anteprima, esito);
      esito.aziende += 1;
    } catch (e) {
      esito.errori.push(`${companyId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return jsonResponse(esito, 200, cors);
});

// deno-lint-ignore no-explicit-any
type Admin = any;

async function giroAzienda(admin: Admin, db: ClientRisorse, companyId: string, oggi: string, anteprima: boolean, esito: EsitoGiro) {
  const [scelte, calendario, festivita] = await Promise.all([
    righe(db.from("silvio_autonomia").select("azione, livello, soglia_eur").eq("company_id", companyId)),
    righe(db.from("silvio_calendario").select("chiusura_dal, chiusura_al, patrono, patrono_nome, sabato_lavorativo").eq("company_id", companyId).limit(1)),
    righe(db.from("hr_festivita").select("data, descrizione, ricorrente").eq("company_id", companyId)),
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
  const fasi = await righe(db.from("order_work_phases")
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
  for (const v of await righe(db.from("silvio_piano_volo").select("order_id, updated_at").eq("company_id", companyId)
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

    if (daControllare.length) {
      // Il contesto della fase 4, con questa commessa esclusa: i suoi impegni non sono conflitti.
      const ctx = await leggiContestoRisorse(companyId, [], orderId, db);
      for (const fase of daControllare) {
        const c = controlloFase(fase, await statoDellaFase(db, orderId, fase), ctx, autonomia);
        if (anteprima) { esito.anteprima!.push({ commessa: codice, tipo: "controllo", ...c }); continue; }
        const { data: reg, error } = await admin.rpc("silvio_volo_registra", {
          p_company: companyId, p_order: orderId, p_fase: fase.id, p_tipo: "controllo", p_giorno: oggi,
          p_riassunto: c.riassunto, p_problemi: c.problemi, p_azioni: c.azioni,
        });
        if (error) { esito.errori.push(`${codice}: ${error.message}`); continue; }
        esito.controlli += 1;
        if (daNotificare(reg)) nuove.push(c.riassunto);
      }
    }

    for (const fase of finite) {
      const [rate, salFatti] = await Promise.all([
        righe(db.from("order_installments").select("trigger_evento, trigger_numero, amount, label").eq("order_id", orderId)),
        righe(db.from("sal").select("numero_progressivo, importo, status").eq("order_id", orderId)),
      ]);
      const proposta = propostaSal({
        fasi: fasiOrdine, finita: fase, totale: Number(ordine.total_amount) || 0,
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

/** Quello che la commessa ha già per la fase: persone, mezzi, ditte, ordini da consegnare. */
async function statoDellaFase(db: ClientRisorse, orderId: string, fase: FaseInVolo): Promise<StatoDellaFase> {
  const [persone, mezzi, ditte, ordini] = await Promise.all([
    righe(db.from("order_employees").select("employee_id, phase_id, dipendente:employees(first_name, last_name)").eq("order_id", orderId)),
    righe(db.from("mezzi_piani_cantiere").select("mezzo_id, fase_ids, mezzo:mezzi(nome)").eq("order_id", orderId).eq("annullato", false)),
    righe(db.from("order_external_teams").select("external_team_id, phase_id, ditta:external_teams(name, subappaltatore_id)").eq("order_id", orderId)),
    righe(db.from("purchase_orders").select("id, oda_number, status, expected_delivery_date, fornitore:suppliers(name)").eq("order_id", orderId)),
  ]);
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
      return { external_team_id: d.external_team_id as string, nome: testo(t?.name) || "Ditta", subappaltatore_id: (t?.subappaltatore_id as string | null) ?? null };
    }),
    // Gli ordini che servono entro la fine della fase (o senza data, che vanno chiariti).
    ordini: ordini.filter((o) => !o.expected_delivery_date || (o.expected_delivery_date as string) <= fine).map((o) => ({
      id: o.id as string, numero: (o.oda_number as string | null) ?? null, stato: testo(o.status),
      fornitore: testo(uno(o.fornitore as Riga | Riga[] | null)?.name) || "fornitore", consegna: (o.expected_delivery_date as string | null) ?? null,
    })),
  };
}
