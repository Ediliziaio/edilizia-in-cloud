/**
 * Silvio risponde su operai, durata e margine con il calcolo, non a occhio (2/11/2026).
 * Acceso per azienda con lo stesso interruttore di «Crea con Silvio».
 */
import { costruisciPiano, type ClientPiano } from "../../../shared/piano-cantiere/costruisci.ts";
import { FONTE_A_PAROLE } from "../../../shared/piano-cantiere/calcolo.ts";
import { fasiDellaCommessa, type RigaFase } from "../../../shared/piano-cantiere/vociCommessa.ts";
import { prevediFine } from "../../../shared/piano-cantiere/previsione.ts";
import { calendarioAzienda } from "../../../shared/silvio-commessa/calendario.ts";
import { dataVera, oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
// deno-lint-ignore no-explicit-any
type Ctx = { supabase: any; companyId: string };

const NON_ATTIVO = {
  disponibile: false,
  messaggio: "Il calcolo del cantiere non è ancora attivo per questa azienda. Non dare numeri su operai o margine come se fossero calcolati.",
};

async function attivo(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.supabase.from("company_feature_overrides").select("is_enabled")
    .eq("company_id", ctx.companyId).eq("feature_key", "silvio_crea_commessa").maybeSingle();
  return data?.is_enabled === true;
}

export async function silvioCalcolaPiano(args: Record<string, unknown>, ctx: Ctx) {
  if (!await attivo(ctx)) return NON_ATTIVO;
  const codice = typeof args?.commessa_codice === "string" ? args.commessa_codice.trim() : "";
  const orderId = typeof args?.order_id === "string" ? args.order_id : "";
  if (!codice && !orderId) return { errore: "Dimmi su quale commessa fare il calcolo." };
  if (args?.data_fine != null && !dataVera(args.data_fine)) return { errore: "Dimmi la data di fine come giorno preciso (AAAA-MM-GG)." };
  let q = ctx.supabase.from("orders").select("id").eq("company_id", ctx.companyId).is("deleted_at", null);
  q = orderId ? q.eq("id", orderId) : q.eq("order_code", codice);
  const { data: trovata, error } = await q.maybeSingle();
  if (error) return { errore: "Non riesco a leggere la commessa." };
  if (!trovata) return { errore: `Non trovo la commessa ${codice || orderId}.` };

  const e = await costruisciPiano(ctx.supabase as ClientPiano, trovata.id, {
    al: typeof args?.data_fine === "string" ? args.data_fine : null,
    costoOrario: Number(args?.costo_orario) || null,
    oreGiorno: Number(args?.ore_giorno) || null,
  });
  if (!e) return { errore: "Commessa non trovata." };
  const perFase = (fase: string) => e.risorse.persone.filter((p) => p.fase === fase).map((p) => `${p.nome} (${p.motivo})`);
  return {
    disponibile: true,
    come_leggere: "Questi numeri sono calcolati: riportali così, con la loro fonte, senza cambiarli. Le ore con «stima dal prezzario» sono una stima: dillo e dai l'intervallo. Se margine è null, di' «al massimo» e cosa manca. Può differire dal margine previsto in commessa, che non conta la manodopera dei dipendenti non ancora assegnati: dillo. «fattibile» vuol dire solo che i giorni bastano con quegli operai, non che il cantiere andrà così: non dirlo come una certezza. Le persone sono scelte fra chi è libero, il mestiere va controllato. Non assegna nessuno: chiedi conferma, o manda a Silvio AI > Calcola come finire nella commessa.",
    commessa: e.commessa.codice,
    periodo: { dal: e.piano.dal, al: e.piano.al, giorni_lavorativi: e.piano.giorniDisponibili, fattibile: e.piano.fattibile },
    ipotesi: { costo_orario: e.ipotesi.costoOrario, costo_orario_da: e.costoOrarioDa, ore_giorno: e.ipotesi.oreGiorno, resa_pct: e.ipotesi.resaPct, regione_prezzario: e.regione ?? "tutta Italia" },
    ore: { totali: e.piano.oreTotali, da: e.piano.oreMin, a: e.piano.oreMax, voci: e.piano.voci, voci_senza_dati: e.piano.vociSenzaDato, importo_coperto_pct: e.piano.coperturaPct, voci_da: e.origineVoci },
    operai_massimi_insieme: e.piano.operaiMassimi,
    fasi: e.piano.fasi.filter((f) => f.giorni).map((f) => ({
      nome: f.nome, dal: f.dal, al: f.al, giorni: f.giorni, ore: f.ore, ore_da: f.oreMin, ore_a: f.oreMax,
      operai_necessari: f.operaiNecessari, ditta: f.ditta, fonti: f.fonti.map((x) => FONTE_A_PAROLE[x]), persone: perFase(f.nome),
    })),
    persone_che_mancano: e.risorse.mancano,
    mezzi: e.risorse.mezzi.map((m) => ({ mezzo: m.nome, fase: m.fase, dal: m.dal, al: m.al, motivo: m.motivo })),
    mezzi_che_mancano: e.risorse.mezziMancanti,
    margine: e.margine,
    previsione_di_fine: e.previsione,
    avvisi: [...e.piano.avvisi, ...e.avvisiLettura],
  };
}

export async function silvioPrevediRitardi(_args: Record<string, unknown>, ctx: Ctx) {
  if (!await attivo(ctx)) return NON_ATTIVO;
  const { data, error } = await ctx.supabase.rpc("piano_cantiere_avanzamenti", { p_company_id: ctx.companyId });
  if (error) return { errore: "Non riesco a leggere le commesse." };
  const oggi = oggiInItalia();
  // Le chiusure dell'azienda valgono anche qui, come nel piano.
  const [{ data: calendarioRiga }, { data: festivita }] = await Promise.all([
    ctx.supabase.from("silvio_calendario").select("*").eq("company_id", ctx.companyId).maybeSingle(),
    ctx.supabase.from("hr_festivita").select("data, descrizione, ricorrente").eq("company_id", ctx.companyId),
  ]);
  const impostazioni = { calendario: calendarioRiga ?? null, festivita: festivita ?? [] };
  const righe = ((data ?? []) as { codice: string; descrizione: string | null; fine: string | null; indirizzo: string | null; ultimo_rapportino: string | null; fasi: RigaFase[] }[])
    .map((c) => ({ c, p: prevediFine(fasiDellaCommessa(c.fasi), c.ultimo_rapportino, oggi, c.fine, calendarioAzienda(impostazioni, c.indirizzo)) }));
  const inRitardo = righe.filter((r) => r.p.affidabile && (r.p.ritardoGiorni ?? 0) > 0)
    .sort((a, b) => (b.p.ritardoGiorni ?? 0) - (a.p.ritardoGiorni ?? 0));
  const nonPrevedibili = righe.filter((r) => !r.p.affidabile);
  return {
    disponibile: true,
    come_leggere: "«finiranno_in_ritardo» è una proporzione sull'avanzamento scritto nelle fasi, valida solo se i rapportini sono recenti. «senza_previsione» non significa che vadano bene: di' quanti sono e perché non si può prevedere.",
    commesse_guardate: righe.length,
    finiranno_in_ritardo: inRitardo.slice(0, 30).map((r) => ({ commessa: r.c.codice, descrizione: r.c.descrizione, scadenza: r.c.fine, fine_prevista: r.p.dataPrevista, ritardo_giorni_lavorativi: r.p.ritardoGiorni, avanzamento_pct: r.p.avanzamentoPct, perche: r.p.perche })),
    in_orario: righe.filter((r) => r.p.affidabile && r.p.ritardoGiorni === 0).length,
    senza_previsione: nonPrevedibili.length,
    senza_previsione_scaduti: nonPrevedibili.filter((r) => (r.p.ritardoGiorni ?? 0) > 0).slice(0, 15).map((r) => ({ commessa: r.c.codice, scadenza: r.c.fine, ritardo_gia_maturato_giorni: r.p.ritardoGiorni, perche: r.p.perche })),
  };
}
