/**
 * Edge Function: fv-calcolo-finanziario (§14-26, §37.1)
 *
 * Cuore del modulo. Calcola tutto lo scenario finanziario di un progetto FV:
 * produzione → autoconsumo → incentivi → cassa cumulata 25 anni → NPV/IRR/payback
 * + sensitivity ±15% + what-if (auto elettrica + pompa calore) + confronti BTP/deposito.
 *
 * Body:
 *   { progetto_id, scenario_finanziamento?, prestito_durata?, prestito_taeg? }
 *
 * Output: oggetto FinancialScenario completo, salvato in fv_calcolo_finanziario
 * e denormalizzato sui campi flat di fv_progetti.
 *
 * Pattern: tutta la logica matematica è duplicata in /src/lib/fotovoltaico/
 * (per UI live preview) e qui (per server-side authoritativeness).
 * In W2 considereremo di estrarre in libreria condivisa via import map.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

interface Payload {
  progetto_id: string;
  scenario_finanziamento?: "cash" | "prestito" | "leasing" | "cessione";
  prestito_durata_anni?: number;
  prestito_taeg?: number;
  reddito_annuo?: number;
  // override sensitivity / what-if
  prezzo_energia_delta_pct?: number;
  scenario_auto_elettrica?: boolean;
  scenario_pompa_calore?: boolean;
}

interface ParametroDb { chiave: string; valore: number }

const ORIZZONTE_DEFAULT = 25;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;
  let userId: string | null = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    const p = (await req.json()) as Payload;
    if (!p.progetto_id) return errorResponse("progetto_id mancante", 400, corsHeaders);

    // ── 1. Carica progetto + parametri + profilo + incentivi catalogo ─────
    const [progettoRes, paramsRes, profiliRes, catalogoRes, componentiRes, manodoperaRes, serviziRes] = await Promise.all([
      supabaseAdmin.from("fv_progetti").select("*").eq("id", p.progetto_id).maybeSingle(),
      supabaseAdmin.from("fv_parametri_calcolo").select("chiave, valore"),
      supabaseAdmin.from("fv_profili_autoconsumo").select("*"),
      supabaseAdmin.from("fv_incentivi_catalogo").select("*").eq("attivo", true),
      supabaseAdmin.from("fv_componenti_progetto").select("*").eq("progetto_id", p.progetto_id),
      supabaseAdmin.from("fv_manodopera_progetto").select("*").eq("progetto_id", p.progetto_id),
      supabaseAdmin.from("fv_servizi_progetto").select("*").eq("progetto_id", p.progetto_id),
    ]);

    if (progettoRes.error || !progettoRes.data) {
      return errorResponse("Progetto non trovato", 404, corsHeaders);
    }
    const prog = progettoRes.data;

    // ── SICUREZZA (IDOR): il progetto è caricato via service-role (bypassa RLS),
    // quindi qui ripristiniamo il confine tenant a livello applicativo. Senza
    // questo controllo un utente autenticato potrebbe leggere margini/costi e
    // ANCHE eseguire UPDATE/INSERT (sotto) su progetti di altre aziende.
    // FAIL-CLOSED: requireCompanyAccess lancia un Response 403 (gestito dal
    // catch in fondo) se la company dell'utente è nulla o ≠ prog.company_id.
    // Eccezioni gestite dall'helper: super_admin e multi_company_access.
    await requireCompanyAccess(supabaseAdmin, userId, prog.company_id, corsHeaders);
    const params = (paramsRes.data ?? []) as ParametroDb[];
    const par = (k: string, def: number): number => params.find((x) => x.chiave === k)?.valore ?? def;
    const profili = profiliRes.data ?? [];
    const catalogo = catalogoRes.data ?? [];

    // ── 2. Calcoli base ────────────────────────────────────────────────────

    if (!prog.potenza_kwp || !prog.ore_sole_annue || !prog.consumo_annuo_kwh) {
      return errorResponse("Progetto incompleto: serve potenza_kwp + ore_sole_annue + consumo", 400, corsHeaders);
    }

    // Costi totali dal sommatorio componenti + manodopera + servizi
    const componenti = componentiRes.data ?? [];
    const manodopera = manodoperaRes.data ?? [];
    const servizi = serviziRes.data ?? [];
    const costo_componenti_netto = componenti.reduce((s: number, c: { quantita: number; prezzo_unitario_netto: number }) => s + c.quantita * c.prezzo_unitario_netto, 0);
    const costo_componenti_vendita = componenti.reduce((s: number, c: { quantita: number; prezzo_unitario_vendita: number }) => s + c.quantita * c.prezzo_unitario_vendita, 0);
    const costo_manodopera_netto = manodopera.reduce((s: number, m: { ore: number; tariffa_oraria_netta: number }) => s + m.ore * m.tariffa_oraria_netta, 0);
    const costo_manodopera_vendita = manodopera.reduce((s: number, m: { ore: number; tariffa_oraria_vendita: number }) => s + m.ore * m.tariffa_oraria_vendita, 0);
    const costo_servizi_netto = servizi.reduce((s: number, x: { prezzo_netto: number; quantita: number }) => s + (x.prezzo_netto * x.quantita), 0);
    const costo_servizi_vendita = servizi.reduce((s: number, x: { prezzo_vendita: number; quantita: number }) => s + (x.prezzo_vendita * x.quantita), 0);

    const costo_totale_netto = costo_componenti_netto + costo_manodopera_netto + costo_servizi_netto;
    const prezzo_vendita_netto = costo_componenti_vendita + costo_manodopera_vendita + costo_servizi_vendita;
    const iva_aliquota = prog.iva_aliquota ?? 0.10;
    const prezzo_vendita_iva_inclusa = prezzo_vendita_netto * (1 + iva_aliquota);
    const margine_eur = prezzo_vendita_netto - costo_totale_netto;
    const margine_pct = prezzo_vendita_netto > 0 ? margine_eur / prezzo_vendita_netto : 0;

    // ── 3. Produzione anno 1 ──────────────────────────────────────────────
    const PR = par("performance_ratio_default", 0.85);
    const perdite =
      par("perdita_temperatura_pct", 0.04) +
      par("perdita_mismatch_pct", 0.02) +
      par("perdita_sporcamento_pct", 0.03) +
      par("perdita_inverter_pct", 0.02);
    const eff_netta = Math.max(0, 1 - perdite);
    const produzione_anno_1 =
      prog.potenza_kwp * prog.ore_sole_annue * PR * eff_netta;

    // ── 4. Autoconsumo % dal profilo ───────────────────────────────────────
    let autoconsumo_pct = prog.autoconsumo_pct ?? 0.35;
    if (prog.profilo_consumo) {
      const prof = profili.find((x: { codice: string }) => x.codice === prog.profilo_consumo);
      if (prof) {
        const cap = prog.capacita_accumulo_kwh ?? 0;
        autoconsumo_pct =
          cap <= 0 ? prof.autoconsumo_no_accumulo :
          cap <= 5 ? prof.autoconsumo_accumulo_5kwh :
          cap <= 10 ? prof.autoconsumo_accumulo_10kwh :
          prof.autoconsumo_accumulo_15kwh;
      }
    }

    // Vincolo: produzione > consumo cap autoconsumo a consumo
    const energia_autoconsumata_max = prog.consumo_annuo_kwh;
    let energia_autoconsumata = produzione_anno_1 * autoconsumo_pct;
    if (energia_autoconsumata > energia_autoconsumata_max) {
      energia_autoconsumata = energia_autoconsumata_max;
    }
    const energia_immessa = Math.max(0, produzione_anno_1 - energia_autoconsumata);
    const prezzo_kwh_attuale = prog.costo_kwh_attuale ?? par("costo_kwh_default_residenziale", 0.32);
    const prezzo_rid = par("prezzo_rid_eur_kwh", 0.10);
    const risparmio_bolletta = energia_autoconsumata * prezzo_kwh_attuale;
    const ricavi_rid = energia_immessa * prezzo_rid;

    // ── 5. Selezione incentivi ────────────────────────────────────────────
    const incentivi = selezionaIncentivi({
      archetipo: prog.archetipo,
      prima_casa: prog.prima_casa ?? false,
      isee: prog.isee,
      numero_figli: prog.numero_figli ?? 0,
      costo_totale: prezzo_vendita_iva_inclusa,
      iva_aliquota_default: 0.22,
      // F9: aliquota IVA EFFETTIVAMENTE applicata al prezzo (default 10% agevolata).
      // Serve per derivare il netto in modo coerente (vedi IVA_10 sotto), invece
      // di dividere a tappeto per 1.22 mentre il prezzo è già IVA@10%.
      iva_aliquota_applicata: iva_aliquota,
      prezzo_vendita_netto,
      potenza_kwp: prog.potenza_kwp,
      capacita_accumulo_kwh: prog.capacita_accumulo_kwh ?? 0,
      energia_immessa_anno_kwh: energia_immessa,
      prezzo_rid_kwh: prezzo_rid,
      durata_simulazione_anni: ORIZZONTE_DEFAULT,
      popolazione_comune: prog.popolazione_comune,
    }, catalogo);

    // Trova detrazione applicata
    const detrazione_app = incentivi.find((i: { codice: string }) => i.codice === "DETR_50_PRIMA" || i.codice === "DETR_36_SECONDA");
    const detrazione_totale = detrazione_app?.importo_eur ?? 0;
    const detrazione_anno_eur = detrazione_totale / 10;

    // ── 6. Cassa cumulata 25 anni ─────────────────────────────────────────
    const inflazione = par("inflazione_energia_annua", 0.025);
    const degradazione = par("degradazione_annua_pannelli", 0.005);
    const manutenzione = prog.potenza_kwp * par("costo_manutenzione_eur_per_kwp_anno", 8);
    const sostInverter = par("costo_sostituzione_inverter_eur", 1500);
    const tassoNpv = par("tasso_sconto_npv", 0.04);

    const cassa = calcolaCassaCumulata({
      investimento_iniziale: prezzo_vendita_iva_inclusa,
      produzione_anno_1_kwh: produzione_anno_1,
      autoconsumo_pct,
      // F6: cap autoconsumo al consumo annuo (qui `autoconsumo_pct` è la quota
      // GREZZA da profilo, non quella già limitata: senza cap il cashflow
      // sovrastimerebbe il risparmio bolletta su impianti sovradimensionati).
      consumo_annuo_kwh: prog.consumo_annuo_kwh,
      costo_kwh_attuale: prezzo_kwh_attuale,
      prezzo_rid_kwh: prezzo_rid,
      detrazione_annua_eur: detrazione_anno_eur,
      durata_detrazione_anni: 10,
      inflazione_energia_pct: inflazione,
      degradazione_pannelli_pct: degradazione,
      costo_manutenzione_anno_eur: manutenzione,
      costo_sostituzione_inverter_eur: sostInverter,
      anno_sostituzione_inverter: 12,
      orizzonte_anni: ORIZZONTE_DEFAULT,
    });
    const payback = calcolaPayback(cassa);
    const npv = calcolaNPV(cassa, tassoNpv);
    const irr = calcolaIRR(cassa);
    const risparmio_totale_25 = cassa.reduce((s, f) => s + (f.flusso > 0 ? f.flusso : 0), 0);

    // ── 7. Capienza IRPEF ─────────────────────────────────────────────────
    const reddito = p.reddito_annuo ?? prog.reddito_annuo_dichiarato ?? 0;
    const aliquota_detrazione = (prog.archetipo === "privato_prima" || prog.prima_casa) ? 0.5 : 0.36;
    const capienza = verificaCapienzaIrpef({
      costo_lavoro_eur: prezzo_vendita_iva_inclusa,
      aliquota_detrazione,
      reddito_annuo_lordo: reddito,
    });

    // ── 8. Sensitivity ±15% prezzo energia ────────────────────────────────
    const sens_minus15 = applicaSensitivity({
      base: cassa, delta: -0.15,
      input: { autoconsumo_pct, prezzo_kwh_base: prezzo_kwh_attuale, produzione_anno_1, ricavi_rid_anno_1: ricavi_rid, detrazione_anno_eur, manutenzione, inflazione, degradazione, sostInverter, investimento: prezzo_vendita_iva_inclusa, prezzo_rid, tassoNpv, consumo_annuo_kwh: prog.consumo_annuo_kwh },
    });
    const sens_plus15 = applicaSensitivity({
      base: cassa, delta: +0.15,
      input: { autoconsumo_pct, prezzo_kwh_base: prezzo_kwh_attuale, produzione_anno_1, ricavi_rid_anno_1: ricavi_rid, detrazione_anno_eur, manutenzione, inflazione, degradazione, sostInverter, investimento: prezzo_vendita_iva_inclusa, prezzo_rid, tassoNpv, consumo_annuo_kwh: prog.consumo_annuo_kwh },
    });

    // ── 9. What-if scenari ────────────────────────────────────────────────
    // consumo_extra_kwh: EV ≈ +3000 kWh/anno, PdC ≈ +4000 kWh/anno → alzano il
    // cap autoconsumo coerentemente col delta_autoconsumo (vedi simulaScenario).
    const scenarioEv = simulaScenario({ delta_autoconsumo: 0.20, consumo_extra_kwh: 3000, autoconsumo_base: autoconsumo_pct, base_input: { investimento: prezzo_vendita_iva_inclusa, produzione_anno_1, prezzo_kwh_base: prezzo_kwh_attuale, prezzo_rid, detrazione_anno_eur, inflazione, degradazione, manutenzione, sostInverter, tassoNpv, consumo_annuo_kwh: prog.consumo_annuo_kwh } });
    const scenarioPdC = simulaScenario({ delta_autoconsumo: 0.30, risparmio_extra_annuo: 800, consumo_extra_kwh: 4000, autoconsumo_base: autoconsumo_pct, base_input: { investimento: prezzo_vendita_iva_inclusa, produzione_anno_1, prezzo_kwh_base: prezzo_kwh_attuale, prezzo_rid, detrazione_anno_eur, inflazione, degradazione, manutenzione, sostInverter, tassoNpv, consumo_annuo_kwh: prog.consumo_annuo_kwh } });

    // ── 10. Confronti alternative ─────────────────────────────────────────
    const tassoBtp = par("tasso_btp_25anni", 0.038);
    const tassoDeposito = par("tasso_deposito_vincolato", 0.025);
    const fv_montante = prezzo_vendita_iva_inclusa + risparmio_totale_25;
    const btp_montante = prezzo_vendita_iva_inclusa * Math.pow(1 + tassoBtp, ORIZZONTE_DEFAULT);
    const deposito_montante = prezzo_vendita_iva_inclusa * Math.pow(1 + tassoDeposito, ORIZZONTE_DEFAULT);

    // ── 11. CO2 evitata ───────────────────────────────────────────────────
    const co2Factor = par("co2_factor_kg_per_kwh", 0.319);
    const produzione_25 = cassa.slice(1).reduce((s, f) => s + (f.produzione_kwh ?? 0), 0);
    const co2_evitata = Math.round(produzione_25 * co2Factor);

    // ── 12. Cassa mensile anno 1 ──────────────────────────────────────────
    // F6: stesso cap autoconsumo della cassa annuale, ripartito sui mesi con la
    // stessa distribuzione (cap_mese = consumo_annuo × pct). Senza cap il mese
    // estivo di un impianto sovradimensionato sovrastimerebbe il risparmio.
    const distMensile = mensileDistribution(prog.provincia ?? null);
    const cassa_mese = distMensile.map((pct, i) => {
      const prod_mese = produzione_anno_1 * pct;
      const auto_mese = Math.min(prod_mese * autoconsumo_pct, prog.consumo_annuo_kwh * pct);
      const imm_mese = Math.max(0, prod_mese - auto_mese);
      return {
        mese: i + 1,
        produzione_kwh: round2(prod_mese),
        flusso: round2(auto_mese * prezzo_kwh_attuale + imm_mese * prezzo_rid),
      };
    });

    // ── 13. Compongo risultato ────────────────────────────────────────────
    const risultato = {
      produzione_annua_kwh: round2(produzione_anno_1),
      autoconsumo_pct: round4(autoconsumo_pct),
      energia_autoconsumata_kwh: round2(energia_autoconsumata),
      energia_immessa_rete_kwh: round2(energia_immessa),
      risparmio_bolletta_eur: round2(risparmio_bolletta),
      ricavi_rid_eur: round2(ricavi_rid),
      detrazione_anno_eur: round2(detrazione_anno_eur),
      cassa_anno_per_anno: cassa,
      cassa_mese_anno1: cassa_mese,
      payback_anni: payback,
      npv_25_anni: round2(npv),
      irr_pct: irr,
      risparmio_totale_25_anni: round2(risparmio_totale_25),
      capienza_irpef_ok: capienza.capienza_ok,
      capienza_irpef_recuperabile_pct: capienza.recupero_pct,
      capienza_irpef_warning: capienza.warning,
      sensitivity_minus15: sens_minus15,
      sensitivity_plus15: sens_plus15,
      scenario_auto_elettrica: scenarioEv,
      scenario_pompa_calore: scenarioPdC,
      confronto_btp_25anni: { tasso: tassoBtp, montante: round2(btp_montante), delta_vs_fv: round2(fv_montante - btp_montante) },
      confronto_deposito_25anni: { tasso: tassoDeposito, montante: round2(deposito_montante), delta_vs_fv: round2(fv_montante - deposito_montante) },
      incentivi,
      co2_evitata_25_anni_kg: co2_evitata,
      // metadata
      costi: {
        costo_totale_netto: round2(costo_totale_netto),
        prezzo_vendita_netto: round2(prezzo_vendita_netto),
        prezzo_vendita_iva_inclusa: round2(prezzo_vendita_iva_inclusa),
        margine_eur: round2(margine_eur),
        margine_pct: round4(margine_pct),
      },
    };

    // ── 14. Salva calcolo + denormalizza progetto ─────────────────────────
    // Disattivo precedenti
    await supabaseAdmin
      .from("fv_calcolo_finanziario")
      .update({ attivo: false })
      .eq("progetto_id", p.progetto_id)
      .eq("attivo", true);

    const { data: nuovo, error: errSalva } = await supabaseAdmin
      .from("fv_calcolo_finanziario")
      .insert({
        progetto_id: p.progetto_id,
        attivo: true,
        produzione_annua_kwh: produzione_anno_1,
        autoconsumo_pct,
        costo_kwh_attuale: prezzo_kwh_attuale,
        inflazione_energia_pct: inflazione,
        degradazione_pannelli_annua_pct: degradazione,
        performance_ratio: PR,
        prezzo_rid_eur_kwh: prezzo_rid,
        scenario_finanziamento: p.scenario_finanziamento ?? prog.scenario_finanziamento ?? "cash",
        prestito_durata_anni: p.prestito_durata_anni ?? null,
        prestito_taeg: p.prestito_taeg ?? null,
        reddito_annuo: reddito || null,
        aliquota_irpef: aliquota_detrazione,
        energia_autoconsumata_kwh: energia_autoconsumata,
        energia_immessa_rete_kwh: energia_immessa,
        risparmio_bolletta_eur: risparmio_bolletta,
        ricavi_rid_eur: ricavi_rid,
        detrazione_anno_eur: detrazione_anno_eur,
        cassa_anno_per_anno: cassa,
        cassa_mese_anno1: cassa_mese,
        payback_anni: payback,
        npv_25_anni: npv,
        irr_pct: irr,
        risparmio_totale_25_anni: risparmio_totale_25,
        capienza_irpef_ok: capienza.capienza_ok,
        capienza_irpef_recuperabile_pct: capienza.recupero_pct,
        sensitivity_minus15: sens_minus15,
        sensitivity_plus15: sens_plus15,
        scenario_auto_elettrica: scenarioEv,
        scenario_pompa_calore: scenarioPdC,
        confronto_btp_25anni: risultato.confronto_btp_25anni,
        confronto_deposito_25anni: risultato.confronto_deposito_25anni,
        incentivi,
      })
      .select()
      .single();

    if (errSalva) throw errSalva;

    // Denormalizza su progetto
    await supabaseAdmin
      .from("fv_progetti")
      .update({
        produzione_annua_kwh: produzione_anno_1,
        autoconsumo_pct,
        costo_totale_netto,
        prezzo_vendita_iva_inclusa,
        margine_eur,
        margine_pct,
        incentivi_applicati: incentivi,
        capienza_irpef_ok: capienza.capienza_ok,
        capienza_irpef_warning: capienza.warning,
        risparmio_anno1: risparmio_bolletta + ricavi_rid,
        payback_anni: payback,
        npv_25_anni: npv,
        irr_pct: irr,
        co2_evitata_25_anni_kg: co2_evitata,
        ultima_modifica_by: userId,
      })
      .eq("id", p.progetto_id);

    return jsonResponse(risultato, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fv-calcolo-finanziario] ERROR:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// ─── Funzioni matematiche (copia ridotta da src/lib/fotovoltaico/) ─────────

interface FlussoAnno {
  anno: number;
  flusso: number;
  cumulato: number;
  produzione_kwh?: number;
  risparmio_bolletta_eur?: number;
  ricavi_rid_eur?: number;
  detrazione_eur?: number;
  manutenzione_eur?: number;
  sostituzione_inverter_eur?: number;
}

function calcolaCassaCumulata(input: {
  investimento_iniziale: number;
  produzione_anno_1_kwh: number;
  autoconsumo_pct: number;
  /** Cap fisico autoconsumo (kWh/anno). Se omesso → nessun cap (storico). */
  consumo_annuo_kwh?: number;
  costo_kwh_attuale: number;
  prezzo_rid_kwh: number;
  detrazione_annua_eur: number;
  durata_detrazione_anni: number;
  inflazione_energia_pct: number;
  degradazione_pannelli_pct: number;
  costo_manutenzione_anno_eur: number;
  costo_sostituzione_inverter_eur: number;
  anno_sostituzione_inverter: number;
  orizzonte_anni: number;
}): FlussoAnno[] {
  const flussi: FlussoAnno[] = [];
  let cumulato = 0;
  for (let anno = 0; anno <= input.orizzonte_anni; anno++) {
    if (anno === 0) {
      cumulato -= input.investimento_iniziale;
      flussi.push({ anno, flusso: round2(-input.investimento_iniziale), cumulato: round2(cumulato), produzione_kwh: 0, risparmio_bolletta_eur: 0, ricavi_rid_eur: 0, detrazione_eur: 0, manutenzione_eur: 0, sostituzione_inverter_eur: 0 });
      continue;
    }
    const prod_n = input.produzione_anno_1_kwh * Math.pow(1 - input.degradazione_pannelli_pct, anno - 1);
    const prezzo_n = input.costo_kwh_attuale * Math.pow(1 + input.inflazione_energia_pct, anno - 1);
    const rid_n = input.prezzo_rid_kwh * Math.pow(1.02, anno - 1);
    // CAP autoconsumo (identico al client finanziaria.ts): non si può
    // auto-consumare più del consumo annuo. Se omesso → nessun cap (storico).
    const auto = input.consumo_annuo_kwh != null
      ? Math.min(prod_n * input.autoconsumo_pct, input.consumo_annuo_kwh)
      : prod_n * input.autoconsumo_pct;
    const imm = prod_n - auto;
    const risp = auto * prezzo_n;
    const rid = imm * rid_n;
    const det = anno <= input.durata_detrazione_anni ? input.detrazione_annua_eur : 0;
    const inv = anno === input.anno_sostituzione_inverter ? input.costo_sostituzione_inverter_eur : 0;
    const flusso = risp + rid + det - input.costo_manutenzione_anno_eur - inv;
    cumulato += flusso;
    flussi.push({ anno, flusso: round2(flusso), cumulato: round2(cumulato), produzione_kwh: round2(prod_n), risparmio_bolletta_eur: round2(risp), ricavi_rid_eur: round2(rid), detrazione_eur: round2(det), manutenzione_eur: round2(input.costo_manutenzione_anno_eur), sostituzione_inverter_eur: round2(inv) });
  }
  return flussi;
}

function calcolaPayback(cassa: FlussoAnno[]): number | null {
  for (let i = 1; i < cassa.length; i++) {
    if (cassa[i].cumulato >= 0) {
      const prev = cassa[i - 1].cumulato;
      const curr = cassa[i].cumulato;
      if (curr === prev) return cassa[i].anno;
      return Math.round((cassa[i].anno - 1 + (-prev / (curr - prev))) * 10) / 10;
    }
  }
  return null;
}

function calcolaNPV(cassa: FlussoAnno[], tasso: number): number {
  return cassa.reduce((s, x) => s + x.flusso / Math.pow(1 + tasso, x.anno), 0);
}

function calcolaIRR(cassa: FlussoAnno[], guess = 0.1): number | null {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const npv = cassa.reduce((s, x) => s + x.flusso / Math.pow(1 + r, x.anno), 0);
    const dnpv = cassa.reduce((s, x) => s - (x.anno * x.flusso) / Math.pow(1 + r, x.anno + 1), 0);
    if (Math.abs(dnpv) < 1e-10) break;
    const rn = r - npv / dnpv;
    if (Math.abs(rn - r) < 1e-4) {
      if (rn < -0.5 || rn > 1) return null;
      return Math.round(rn * 10000) / 10000;
    }
    r = rn;
  }
  return null;
}

function calcolaIrpefLorda(reddito: number): number {
  if (reddito <= 0) return 0;
  if (reddito <= 28000) return reddito * 0.23;
  if (reddito <= 50000) return 28000 * 0.23 + (reddito - 28000) * 0.35;
  return 28000 * 0.23 + 22000 * 0.35 + (reddito - 50000) * 0.43;
}

function stimaDetrazioniBase(reddito: number): number {
  if (reddito <= 15000) return 1880;
  if (reddito <= 28000) return 1880 + (1910 - 1880) * ((reddito - 15000) / 13000);
  if (reddito <= 50000) return Math.max(0, 1910 * ((50000 - reddito) / 22000));
  return 0;
}

function verificaCapienzaIrpef(input: { costo_lavoro_eur: number; aliquota_detrazione: number; reddito_annuo_lordo: number }): { capienza_ok: boolean; recupero_pct: number; warning: string | null } {
  if (input.reddito_annuo_lordo === 0) {
    return { capienza_ok: false, recupero_pct: 0, warning: "Reddito non dichiarato — verifica capienza con commercialista" };
  }
  const det_totale = input.costo_lavoro_eur * input.aliquota_detrazione;
  const det_annua = det_totale / 10;
  const irpef_lorda = calcolaIrpefLorda(input.reddito_annuo_lordo);
  const det_base = stimaDetrazioniBase(input.reddito_annuo_lordo);
  const irpef_netta = Math.max(0, irpef_lorda - det_base);
  const det_recuperabile = Math.min(det_annua, irpef_netta);
  const recupero = det_annua > 0 ? det_recuperabile / det_annua : 0;
  let warning: string | null = null;
  if (recupero < 0.8) warning = "Capienza insufficiente — considera Reddito Energetico o cessione del credito";
  return { capienza_ok: recupero >= 1, recupero_pct: round4(recupero), warning };
}

interface ScenarioInput {
  investimento: number;
  produzione_anno_1: number;
  prezzo_kwh_base: number;
  prezzo_rid: number;
  detrazione_anno_eur: number;
  inflazione: number;
  degradazione: number;
  manutenzione: number;
  sostInverter: number;
  tassoNpv: number;
  /** Cap autoconsumo (kWh/anno). Se omesso → nessun cap (storico). */
  consumo_annuo_kwh?: number;
}

function applicaSensitivity(args: { base: FlussoAnno[]; delta: number; input: ScenarioInput & { autoconsumo_pct: number; ricavi_rid_anno_1: number } }) {
  const cassa = calcolaCassaCumulata({
    investimento_iniziale: args.input.investimento,
    produzione_anno_1_kwh: args.input.produzione_anno_1,
    autoconsumo_pct: args.input.autoconsumo_pct,
    // Sensitivity varia solo il prezzo energia, non l'autoconsumo: cap = consumo base.
    consumo_annuo_kwh: args.input.consumo_annuo_kwh,
    costo_kwh_attuale: args.input.prezzo_kwh_base * (1 + args.delta),
    prezzo_rid_kwh: args.input.prezzo_rid,
    detrazione_annua_eur: args.input.detrazione_anno_eur,
    durata_detrazione_anni: 10,
    inflazione_energia_pct: args.input.inflazione,
    degradazione_pannelli_pct: args.input.degradazione,
    costo_manutenzione_anno_eur: args.input.manutenzione,
    costo_sostituzione_inverter_eur: args.input.sostInverter,
    anno_sostituzione_inverter: 12,
    orizzonte_anni: ORIZZONTE_DEFAULT,
  });
  return { payback_anni: calcolaPayback(cassa), npv: round2(calcolaNPV(cassa, args.input.tassoNpv)) };
}

function simulaScenario(args: { delta_autoconsumo: number; risparmio_extra_annuo?: number; consumo_extra_kwh?: number; autoconsumo_base: number; base_input: ScenarioInput }) {
  const newAuto = Math.min(1, args.autoconsumo_base + args.delta_autoconsumo);
  // EV/PdC alzano i consumi: se la base ha un cap, alzalo della stessa quota,
  // così il maggior autoconsumo non viene tagliato dal min() (coerente col client).
  const consumoCap = args.base_input.consumo_annuo_kwh != null
    ? args.base_input.consumo_annuo_kwh + (args.consumo_extra_kwh ?? 0)
    : undefined;
  const cassa = calcolaCassaCumulata({
    investimento_iniziale: args.base_input.investimento,
    produzione_anno_1_kwh: args.base_input.produzione_anno_1,
    autoconsumo_pct: newAuto,
    consumo_annuo_kwh: consumoCap,
    costo_kwh_attuale: args.base_input.prezzo_kwh_base,
    prezzo_rid_kwh: args.base_input.prezzo_rid,
    detrazione_annua_eur: args.base_input.detrazione_anno_eur,
    durata_detrazione_anni: 10,
    inflazione_energia_pct: args.base_input.inflazione,
    degradazione_pannelli_pct: args.base_input.degradazione,
    costo_manutenzione_anno_eur: args.base_input.manutenzione,
    costo_sostituzione_inverter_eur: args.base_input.sostInverter,
    anno_sostituzione_inverter: 12,
    orizzonte_anni: ORIZZONTE_DEFAULT,
  });
  // Aggiungo risparmio extra (es. gas) se presente
  if (args.risparmio_extra_annuo) {
    let cum = 0;
    for (let i = 0; i < cassa.length; i++) {
      if (i > 0) cassa[i].flusso = round2(cassa[i].flusso + args.risparmio_extra_annuo * Math.pow(1.03, i - 1));
      cum += cassa[i].flusso;
      cassa[i].cumulato = round2(cum);
    }
  }
  return { payback_anni: calcolaPayback(cassa), npv: round2(calcolaNPV(cassa, args.base_input.tassoNpv)), autoconsumo: round4(newAuto) };
}

interface IncentivoApplicato { codice: string; nome: string; tipo: string; importo_eur: number | null; durata_anni: number | null; info?: string }

function selezionaIncentivi(input: { archetipo: string; prima_casa: boolean; isee: number | null; numero_figli: number; costo_totale: number; iva_aliquota_default: number; iva_aliquota_applicata?: number; prezzo_vendita_netto?: number; potenza_kwp: number; capacita_accumulo_kwh: number; energia_immessa_anno_kwh: number; prezzo_rid_kwh: number; durata_simulazione_anni: number; popolazione_comune: number | null }, catalogo: Array<{ codice: string; nome: string; tipo: string; aliquota: number | null; plafond_max_eur: number | null }>): IncentivoApplicato[] {
  const cand: IncentivoApplicato[] = [];
  const get = (c: string) => catalogo.find((x) => x.codice === c);
  const isPriv = ["privato_prima","privato_seconda","privato_isee"].includes(input.archetipo);
  if (isPriv) {
    // Reddito Energetico
    const sogliaIsee = input.numero_figli >= 4 ? 30000 : 15000;
    if (input.prima_casa && input.isee !== null && input.isee <= sogliaIsee) {
      const re = get("REDDITO_ENERGETICO");
      if (re) {
        const importo = Math.min(input.potenza_kwp * 2000 + input.capacita_accumulo_kwh * 1500, re.plafond_max_eur ?? 11000);
        cand.push({ codice: "REDDITO_ENERGETICO", nome: re.nome, tipo: "fondo_perduto", importo_eur: round2(importo), durata_anni: 1 });
      }
    }
    const detCod = input.prima_casa ? "DETR_50_PRIMA" : "DETR_36_SECONDA";
    const det = get(detCod);
    if (det) {
      const aliq = det.aliquota ?? (input.prima_casa ? 0.5 : 0.36);
      const plf = det.plafond_max_eur ?? 96000;
      const imp = Math.min(input.costo_totale * aliq, plf * aliq);
      cand.push({ codice: detCod, nome: det.nome, tipo: "detrazione_irpef", importo_eur: round2(imp), durata_anni: 10 });
    }
    const iva = get("IVA_10");
    if (iva) {
      // F9 fix: il netto va derivato dall'aliquota EFFETTIVAMENTE applicata
      // (default 10% agevolata), non dividendo per 1.22 — `costo_totale` è già
      // IVA@10% inclusa, quindi /1.22 sottostimava il netto e gonfiava lo sconto.
      // Il prezzo agevolato è GIÀ nel `costo_totale`: l'IVA_10 non è un incentivo
      // aggiuntivo da sommare, ma il risparmio INFORMATIVO rispetto all'aliquota
      // ordinaria (22%). Lo esponiamo come info, non come importo cumulabile.
      const ivaApplicata = input.iva_aliquota_applicata ?? 0.10;
      const netto = input.prezzo_vendita_netto ?? (input.costo_totale / (1 + ivaApplicata));
      const risparmio_vs_ordinaria = netto * (input.iva_aliquota_default - ivaApplicata);
      cand.push({ codice: "IVA_10", nome: iva.nome, tipo: "sconto_iva", importo_eur: null, durata_anni: null, info: `IVA agevolata ${Math.round(ivaApplicata * 100)}% già applicata: ~${round2(risparmio_vs_ordinaria)}€ di risparmio vs IVA ordinaria ${Math.round(input.iva_aliquota_default * 100)}%` });
    }
    if (input.popolazione_comune !== null && input.popolazione_comune < 50000) {
      const cer = get("CER_INFO");
      if (cer) cand.push({ codice: "CER_INFO", nome: cer.nome, tipo: "informativa", importo_eur: null, durata_anni: 20, info: "Bonus PNRR 40% disponibile in questa zona" });
    }
  }
  if (input.archetipo === "pmi") {
    const amm = get("AMMORTAMENTO_PMI");
    if (amm) {
      // F8 fix: `costo_totale * 0.04 * 25` = 100% del costo, ma quella è la BASE
      // DEDUCIBILE (ammortamento al 4%/anno per 25 anni = 100%), NON il risparmio
      // d'imposta. Il beneficio reale è la base deducibile × aliquota fiscale.
      // Assunzione conservativa: aliquota IRES 24% (default ragionevole; la quota
      // IRAP/sovraimposte regionali varia e non è inclusa). Da validare col business.
      const ALIQUOTA_FISCALE_PMI = 0.24;
      const base_deducibile = input.costo_totale; // 4%/anno × 25 anni = 100% del costo
      cand.push({ codice: "AMMORTAMENTO_PMI", nome: amm.nome, tipo: "deducibilita_fiscale", importo_eur: round2(base_deducibile * ALIQUOTA_FISCALE_PMI), durata_anni: 25 });
    }
  }
  // RID
  const rid = get("RID");
  if (rid && input.energia_immessa_anno_kwh > 0) {
    let totale = 0;
    for (let n = 1; n <= input.durata_simulazione_anni; n++) totale += input.energia_immessa_anno_kwh * input.prezzo_rid_kwh * Math.pow(1.02, n - 1);
    cand.push({ codice: "RID", nome: rid.nome, tipo: "tariffa_incentivante", importo_eur: round2(totale), durata_anni: input.durata_simulazione_anni });
  }
  // Cumulabilità: Reddito Energetico vs Detrazione
  const idxRE = cand.findIndex((c) => c.codice === "REDDITO_ENERGETICO");
  const idxDET = cand.findIndex((c) => c.codice === "DETR_50_PRIMA" || c.codice === "DETR_36_SECONDA");
  if (idxRE >= 0 && idxDET >= 0) {
    const valRE = cand[idxRE].importo_eur ?? 0;
    const valDET = cand[idxDET].importo_eur ?? 0;
    if (valRE > valDET) cand.splice(idxDET, 1);
    else cand.splice(idxRE, 1);
  }
  return cand;
}

function mensileDistribution(provincia: string | null): number[] {
  const norte = new Set(["TO","VC","NO","CN","AT","AL","BI","VB","AO","MI","BG","BS","CO","CR","LC","LO","MN","MB","PV","SO","VA","VR","VI","BL","TV","VE","PD","RO","TN","BZ","GO","PN","TS","UD","GE","IM","SP","SV","BO","FC","FE","MO","PC","PR","RA","RE","RN"]);
  const sud = new Set(["AQ","CH","PE","TE","CB","IS","AV","BN","CE","NA","SA","BA","BT","BR","FG","LE","TA","CS","CZ","KR","RC","VV","MT","PZ"]);
  const isole = new Set(["AG","CL","CT","EN","ME","PA","RG","SR","TP","CA","NU","OR","SS","SU"]);
  const p = (provincia ?? "").toUpperCase();
  if (norte.has(p)) return [0.035,0.05,0.08,0.095,0.12,0.13,0.135,0.12,0.095,0.07,0.04,0.03];
  if (sud.has(p)) return [0.045,0.06,0.09,0.10,0.115,0.12,0.125,0.115,0.10,0.08,0.05,0.04];
  if (isole.has(p)) return [0.05,0.06,0.09,0.10,0.115,0.12,0.125,0.115,0.10,0.08,0.05,0.045];
  return [0.04,0.055,0.085,0.10,0.115,0.125,0.13,0.115,0.10,0.075,0.045,0.035];
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
