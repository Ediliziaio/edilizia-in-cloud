/**
 * quadro_commessa — tutto quello che serve per aiutare su UNA commessa (31/10/2026).
 *
 * Fino a oggi Silvio sapeva della commessa aperta solo descrizione, importo e
 * scadenza. Per aiutare a «sistemare le fasi» o «capire cosa manca» deve vedere
 * quello che vede chi lavora: fasi con date e avanzamento, sottofasi, chi c'è
 * su ogni fase (persone e ditte, con il costo previsto senza IVA), contratti
 * delle ditte, mezzi prenotati e sul cantiere, rapportini da approvare e quelli
 * mancanti, materiali da ordinare. E i punti già trovati (fasi senza date, in
 * ritardo, senza nessuno), con le stesse regole dei popup della commessa
 * (src/lib/orders/silvioControlli.ts), così chat e pagina dicono la stessa cosa.
 *
 * Sola lettura. Le tabelle senza company_id si leggono solo dopo aver trovato la
 * commessa dell'azienda corrente. I margini non si calcolano qui: per quelli c'è
 * report_commessa, con le sue regole di affidabilità.
 */
import type { ToolContext } from "./silvioTools.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oggiRoma = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const piuGiorni = (d: string, n: number) => {
  const [a, m, g] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + n)).toISOString().slice(0, 10);
};
const nome = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";

export async function silvioQuadroCommessa(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.companyId) return { error: "Azienda non identificata." };
  const id = String(args?.order_id ?? "").trim();
  const codice = String(args?.commessa_codice ?? "").trim();
  if (!id && !codice) return { error: "Serve il codice della commessa (o l'id della pagina aperta)." };

  let q = ctx.supabase.from("orders")
    .select("id, order_code, description, work_description, work_start_date, work_end_date, indirizzo_lavori, work_address, client_name, client_company, total_amount")
    .eq("company_id", ctx.companyId).is("deleted_at", null);
  q = id && UUID.test(id) ? q.eq("id", id) : q.ilike("order_code", codice.replace(/[\\%_]/g, "\\$&"));
  const { data: trovate, error } = await q.limit(2);
  if (error) return { error: "Non riesco a leggere la commessa. Riprova." };
  if (!trovate?.length) return { error: "Commessa non trovata nell'azienda corrente." };
  if (trovate.length > 1) return { error: "Codice commessa ambiguo: indica il codice esatto." };
  const o = trovate[0];
  const oggi = oggiRoma();

  const [fasi, persone, ditte, contratti, piani, presenze, rapportini, articoli] = await Promise.all([
    ctx.supabase.from("order_work_phases")
      .select("id, name, position, status, start_date, end_date, percentuale, completata_il, sottofasi:order_work_subphases(name, position, fatta, data_inizio, data_fine, giorni)")
      .eq("order_id", o.id).eq("company_id", ctx.companyId).order("position"),
    ctx.supabase.from("order_employees").select("phase_id, planned_hours, hours_worked, employee:employees(first_name, last_name)").eq("order_id", o.id),
    ctx.supabase.from("order_external_teams").select("phase_id, cost_preventivo, total_cost, vat_rate, team:external_teams(name, subappaltatore_id)").eq("order_id", o.id),
    ctx.supabase.from("contratti_subappalto").select("subappaltatore_id, stato, importo_contrattuale, firmato_il")
      .eq("order_id", o.id).eq("company_id", ctx.companyId),
    ctx.supabase.from("mezzi_piani_cantiere").select("dal, al, annullato, mezzo:mezzi(nome)")
      .eq("order_id", o.id).eq("company_id", ctx.companyId).eq("annullato", false),
    ctx.supabase.from("mezzi_assegnazioni").select("dal, al, mezzo:mezzi!mezzi_assegnazioni_mezzo_id_fkey(nome)").eq("order_id", o.id).eq("company_id", ctx.companyId).is("al", null),
    ctx.supabase.from("campo_rapportini").select("data_lavoro, stato").eq("order_id", o.id).eq("company_id", ctx.companyId)
      .gte("data_lavoro", piuGiorni(oggi, -30)),
    ctx.supabase.from("order_items").select("name, quantity, phase_id, supplier_id, purchase_price").eq("order_id", o.id).limit(500),
  ]);
  if (fasi.error) return { error: "Non riesco a leggere le fasi della commessa. Riprova." };

  type Fase = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; percentuale: number | null; completata_il: string | null;
    sottofasi: Array<{ name: string; position: number; fatta: boolean; data_inizio: string | null; data_fine: string | null; giorni: number | null }> };
  const elencoFasi = (fasi.data ?? []) as Fase[];
  // deno-lint-ignore no-explicit-any
  const pers = (persone.data ?? []) as any[];
  // deno-lint-ignore no-explicit-any
  const dit = (ditte.data ?? []) as any[];
  const chiusa = (f: Fase) => f.status === "completata" || Number(f.percentuale) >= 100;

  const quadroFasi = elencoFasi.map((f) => ({
    fase: f.name,
    stato: chiusa(f) ? "completata" : f.status,
    avanzamento_pct: Number(f.percentuale) || 0,
    dal: f.start_date, al: f.end_date,
    in_ritardo: !chiusa(f) && !!f.end_date && f.end_date < oggi,
    sottofasi: (f.sottofasi ?? []).sort((a, b) => a.position - b.position)
      .map((s) => `${s.name}${s.fatta ? " (fatta)" : ""}${s.data_inizio ? ` ${s.data_inizio}→${s.data_fine ?? "?"}` : s.giorni ? ` ${s.giorni} gg` : ""}`),
    persone: pers.filter((p) => p.phase_id === f.id).map((p) => `${nome(p.employee)}${p.planned_hours ? ` (${p.planned_hours} h previste)` : ""}`),
    // Le ditte: importo scritto con l'IVA della loro fattura (0 in reverse charge); qui senza IVA.
    ditte: dit.filter((d) => d.phase_id === f.id).map((d) => ({
      ditta: d.team?.name ?? "Ditta",
      previsto_senza_iva: Math.round((Number(d.cost_preventivo) || 0) / (1 + (Number(d.vat_rate) || 0) / 100) * 100) / 100,
    })),
  }));
  const generali = pers.filter((p) => !p.phase_id).map((p) => nome(p.employee));

  const aperte = quadroFasi.filter((f) => f.stato !== "completata");
  const daSistemare: string[] = [];
  const senzaDate = aperte.filter((f) => !f.dal || !f.al).map((f) => f.fase);
  if (senzaDate.length) daSistemare.push(`Fasi senza date: ${senzaDate.join(", ")}.`);
  const ritardo = aperte.filter((f) => f.in_ritardo).map((f) => `${f.fase} (${f.avanzamento_pct}%)`);
  if (ritardo.length) daSistemare.push(`Fasi in ritardo: ${ritardo.join(", ")}.`);
  const vuote = aperte.filter((f) => !f.persone.length && !f.ditte.length).map((f) => f.fase);
  if (vuote.length) daSistemare.push(`Fasi senza nessuno assegnato: ${vuote.join(", ")}.`);
  const senzaCosto = aperte.filter((f) => f.ditte.some((d) => !d.previsto_senza_iva)).map((f) => f.fase);
  if (senzaCosto.length) daSistemare.push(`Ditte senza costo previsto su: ${senzaCosto.join(", ")}.`);

  // Contratti: una ditta della commessa senza contratto, o non firmato, prima che parta la sua fase.
  // deno-lint-ignore no-explicit-any
  const contr = (contratti.data ?? []) as any[];
  const ditteCommessa = new Map<string, { nome: string; sub: string | null }>();
  for (const d of dit) if (d.team?.name) ditteCommessa.set(d.team.name, { nome: d.team.name, sub: d.team.subappaltatore_id ?? null });
  const quadroContratti = [...ditteCommessa.values()].map((d) => {
    const c = contr.find((x) => x.subappaltatore_id && x.subappaltatore_id === d.sub);
    return { ditta: d.nome, contratto: c ? (c.firmato_il ? "firmato" : c.stato) : "nessuno", importo: c ? Number(c.importo_contrattuale) || 0 : null };
  });
  const senzaContratto = quadroContratti.filter((c) => c.contratto === "nessuno" || c.contratto === "bozza").map((c) => c.ditta);
  if (senzaContratto.length) daSistemare.push(`Ditte senza contratto firmato: ${senzaContratto.join(", ")}.`);

  // Rapportini: da approvare, e giorni feriali passati senza nessun rapportino mentre una fase era in corso.
  // deno-lint-ignore no-explicit-any
  const rap = (rapportini.data ?? []) as any[];
  const daApprovare = rap.filter((r) => r.stato === "inviato").length;
  if (daApprovare) daSistemare.push(`${daApprovare} rapportini da approvare.`);
  const giorniConRapportino = new Set(rap.map((r) => r.data_lavoro));
  const mancanti: string[] = [];
  for (let d = piuGiorni(oggi, -14); d < oggi; d = piuGiorni(d, 1)) {
    const g = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (g === 0 || g === 6 || giorniConRapportino.has(d)) continue;
    if (elencoFasi.some((f) => !chiusa(f) && f.start_date && f.start_date <= d && (!f.end_date || f.end_date >= d))) mancanti.push(d);
  }
  if (mancanti.length) daSistemare.push(`Giorni di cantiere senza rapportino nelle ultime due settimane: ${mancanti.length}.`);

  // deno-lint-ignore no-explicit-any
  const art = (articoli.data ?? []) as any[];
  const senzaFornitore = art.filter((a) => !a.supplier_id).length;
  if (senzaFornitore) daSistemare.push(`${senzaFornitore} materiali senza fornitore.`);

  return {
    commessa: {
      codice: o.order_code, descrizione: o.description, lavori: o.work_description,
      cliente: o.client_company || o.client_name, indirizzo: o.indirizzo_lavori || o.work_address,
      dal: o.work_start_date, al: o.work_end_date,
      link: `/azienda/ordini/${o.id}`,
    },
    oggi,
    fasi: quadroFasi,
    persone_su_tutta_la_commessa: generali,
    contratti_ditte: quadroContratti,
    mezzi: {
      // deno-lint-ignore no-explicit-any
      prenotati: ((piani.data ?? []) as any[]).filter((p) => !p.al || p.al >= oggi).map((p) => `${p.mezzo?.nome ?? "Mezzo"} ${p.dal}→${p.al ?? "?"}`),
      // deno-lint-ignore no-explicit-any
      sul_cantiere: ((presenze.data ?? []) as any[]).map((p) => p.mezzo?.nome ?? "Mezzo"),
    },
    rapportini_ultimi_30_giorni: { totale: rap.length, da_approvare: daApprovare, giorni_senza_rapportino_14gg: mancanti },
    materiali: { righe: art.length, senza_fornitore: senzaFornitore, senza_prezzo: art.filter((a) => !(Number(a.purchase_price) > 0)).length },
    da_sistemare: daSistemare,
    come_usare:
      "Rispondi su questi dati, senza inventare. Parti da «da_sistemare» quando chiedono cosa manca o cosa fare. " +
      "Per margini e costi consuntivi usa report_commessa. Le azioni che cambiano i dati si propongono e le conferma l'utente.",
  };
}
