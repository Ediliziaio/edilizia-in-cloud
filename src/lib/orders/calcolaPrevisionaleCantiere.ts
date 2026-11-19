import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarioCantiere } from "./sottofasi";
import { giorniPrevisti } from "./previsionaleLavoro";
import { chiavePrevisto, dateLavorative, ripartisciMicroOre, validaRipartizione, type BozzaPrevisto, type OperaioPrevisto, type PianoPrevisto } from "./previsionaleSalvato";
import { reviewHourlyCost, type LaborEmployee } from "../campo/laborCostReview";
import { parametriDaRighe } from "../costoPersonale";
import { italianHolidays, projectHoliday, type Holiday } from "../personale/calendarioLavorativo";

type SquadraLetta = { id: string; nome: string; componenti: { id: string; nome: string; cognome: string }[] };
type RigaOperaio = LaborEmployee & { first_name: string | null; last_name: string | null };
const RISPOSTA_VUOTA: { data: never[]; error: null } = { data: [], error: null };

export async function preparaPiani(client: SupabaseClient, azienda: string, commessa: string, bozza: BozzaPrevisto): Promise<PianoPrevisto[]> {
  const finestra = giorniPrevisti(bozza.dal, bozza.al, () => true);
  if (!finestra || finestra > 366) throw new Error("Indica un periodo valido, fino a 366 giorni.");
  if (new Set(bozza.ambiti.map(chiavePrevisto)).size !== bozza.ambiti.length) throw new Error("Una lavorazione è presente due volte.");
  const fasi = [...new Set(bozza.ambiti.map((a) => a.faseId))];
  const sottofasi = bozza.ambiti.filter((a) => a.tipo === "sottofase").map((a) => a.id);
  const voci = bozza.ambiti.filter((a) => a.tipo === "voce").map((a) => a.id);
  const [{ data: fasiLette, error: ef }, { data: sottofasiLette, error: es }, { data: vociLette, error: ev },
    { data: squadreLette, error: eq }, { data: parametri, error: ep }, { data: festivita, error: et }] = await Promise.all([
    client.from("order_work_phases").select("id").eq("company_id", azienda).eq("order_id", commessa).in("id", fasi),
    sottofasi.length ? client.from("order_work_subphases").select("id,phase_id").in("phase_id", fasi).in("id", sottofasi) : RISPOSTA_VUOTA,
    voci.length ? client.from("order_work_phase_voci").select("id,phase_id").eq("company_id", azienda).eq("order_id", commessa).in("id", voci) : RISPOSTA_VUOTA,
    bozza.squadre.length ? client.rpc("manodopera_squadre", { p_company_id: azienda }, { get: true }) : RISPOSTA_VUOTA,
    client.from("costo_personale_parametri").select("profilo,mensilita,inps,inail,cassa_edile,tfr,altri,ore_produttive").eq("company_id", azienda),
    client.from("hr_festivita").select("data,descrizione,ricorrente").eq("company_id", azienda),
  ]);
  if (ef || es || ev || eq || ep || et) throw new Error("Impossibile verificare lavorazioni, squadra, tariffe o calendario. Riprova.");
  for (const a of bozza.ambiti) {
    const collegata = a.tipo === "fase" ? a.id === a.faseId
      : (a.tipo === "sottofase" ? sottofasiLette : vociLette)?.some((r) => r.id === a.id && r.phase_id === a.faseId);
    if (!collegata || !fasiLette?.some((f) => f.id === a.faseId)) throw new Error("Una lavorazione non appartiene più alla commessa.");
  }
  const richieste = new Set(bozza.squadre);
  const squadreScelte = ((squadreLette ?? []) as SquadraLetta[]).filter((s) => richieste.has(s.id));
  if (squadreScelte.length !== richieste.size || squadreScelte.some((s) => !s.componenti.length)) throw new Error("Una squadra è indisponibile o senza componenti.");
  const profili = new Map(squadreScelte.flatMap((s) => s.componenti.map((p) => [p.id, p] as const)));
  if (profili.size + new Set(bozza.persone).size > 200) throw new Error("Seleziona fino a 100 operai per piano.");
  const legami = profili.size ? await client.from("hr_profili").select("id,employee_id")
    .eq("company_id", azienda).in("id", [...profili.keys()]) : RISPOSTA_VUOTA;
  if (legami.error || legami.data?.length !== profili.size) throw new Error("Impossibile leggere i profili dei componenti della squadra.");
  const dipendentePerProfilo = new Map((legami.data ?? []).map((p) => [p.id, p.employee_id as string | null]));
  const squadre = squadreScelte.map((s) => ({
    id: s.id, nome: s.nome, componenti: [...new Set(s.componenti.map((p) => dipendentePerProfilo.get(p.id) ?? `hr:${p.id}`))],
  }));
  const inclusi = new Set(squadre.flatMap((s) => s.componenti));
  const persone = [...new Set(bozza.persone)].filter((id) => !inclusi.has(id));
  const ids = [...inclusi, ...persone].filter((id) => !id.startsWith("hr:"));
  if (!ids.length && !inclusi.size || inclusi.size + persone.length > 100) throw new Error("Seleziona da 1 a 100 operai, compresi i componenti delle squadre.");
  const { data: dipendenti, error } = ids.length ? await client.from("employees")
    .select("id,user_id,first_name,last_name,costo_orario,gross_salary,inps_rate,monthly_hours,profilo_costo,role_type,qualifica,area")
    .eq("company_id", azienda).eq("is_active", true).in("id", ids) : RISPOSTA_VUOTA;
  if (error || dipendenti?.length !== ids.length) throw new Error("Una persona non è più disponibile in azienda.");
  const parametriCosto = parametriDaRighe(parametri);
  const operai: OperaioPrevisto[] = (dipendenti as RigaOperaio[]).map((p) => ({
    id: p.id, nome: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Operaio", tariffa: reviewHourlyCost(p, parametriCosto).amount,
  }));
  for (const profilo of profili.values()) {
    if (!dipendentePerProfilo.get(profilo.id)) operai.push({ id: `hr:${profilo.id}`, nome: `${profilo.nome} ${profilo.cognome}`.trim(), tariffa: null });
  }
  const chiusure = new Set<string>();
  for (let anno = Number(bozza.dal.slice(0, 4)); anno <= Number(bozza.al.slice(0, 4)); anno++) {
    const elenco = festivita?.length ? festivita as Holiday[] : italianHolidays(anno);
    for (const h of elenco) {
      const proiettata = projectHoliday(h, anno);
      if (proiettata) chiusure.add(proiettata.projectedDate);
    }
  }
  const giorni = dateLavorative(bozza.dal, bozza.al, calendarioCantiere({ sabato: bozza.sabato, chiusure }));
  if (!giorni.length) throw new Error("Il periodo deve includere un giorno lavorativo.");
  const microOre = Math.round(bozza.oreGiorno * 1e6);
  if (microOre < bozza.ambiti.length) throw new Error("Aumenta le ore da ripartire.");
  const quote = bozza.microOrePerAmbito ?? ripartisciMicroOre(bozza.oreGiorno, bozza.ambiti.length);
  if (!validaRipartizione(quote, bozza.oreGiorno, bozza.ambiti.length)) {
    throw new Error("Distribuisci tutte le ore giornaliere tra le lavorazioni selezionate.");
  }
  return bozza.ambiti.map((ambito, i) => ({
    ambito, persone, squadre, operai, dal: bozza.dal, al: bozza.al, giorni, oreGiorno: bozza.oreGiorno, sabato: bozza.sabato,
    microOreGiorno: quote[i],
  }));
}
