import type { SupabaseClient } from "@supabase/supabase-js";
import { caricoPerGiorno, type DisponibilitaCantiere, type ImpegnoCantiere } from "./disponibilitaCantiere";
import { dateLavorative, type PianoPrevisto } from "./previsionaleSalvato";

type Ordine = { id: string; order_code: string | null; work_start_date: string | null; work_end_date: string | null; assigned_to: string | null; destination_warehouse_id: string | null };
type Fase = { id: string; order_id: string; start_date: string | null; end_date: string | null; status: string };
type Assegnazione = { employee_id: string; order_id: string; phase_id: string | null; dal?: string | null; al?: string | null };
type Voce = { subphase_id: string; order_id: string; employee_id: string | null; external_team_id: string | null };
type Sottofase = { id: string; phase_id: string; data_inizio: string | null; data_fine: string | null; fatta: boolean };
type Squadra = { squadra_id: string; order_id: string; phase_id: string | null; dal: string | null; al: string | null };

function lotti<T>(righe: readonly T[], size = 100) {
  return Array.from({ length: Math.ceil(righe.length / size) }, (_, i) => righe.slice(i * size, (i + 1) * size));
}

export async function disponibilitaAltriCantieri(client: SupabaseClient, azienda: string, commessa: string,
  { persone, dal, al }: { persone: string[]; dal: string; al: string },
  archivi: Array<{ commessa: string; piani: PianoPrevisto[] }>,
): Promise<DisponibilitaCantiere> {
  const ids = [...new Set(persone)];
  const richieste = new Set(ids);
  const idDipendenti = ids.filter((id) => !id.startsWith("hr:"));
  const idProfili = ids.filter((id) => id.startsWith("hr:")).map((id) => id.slice(3));
  const vuoto = { data: [], error: null };
  const [dip, prof, singoli] = await Promise.all([
    idDipendenti.length ? client.from("hr_profili").select("id,employee_id,ore_giornaliere").eq("attivo", true).eq("company_id", azienda).in("employee_id", idDipendenti) : vuoto,
    idProfili.length ? client.from("hr_profili").select("id,employee_id,ore_giornaliere").eq("attivo", true).eq("company_id", azienda).in("id", idProfili) : vuoto,
    idDipendenti.length ? client.from("order_employees").select("employee_id,order_id,phase_id,orders!inner(company_id,deleted_at)")
      .eq("orders.company_id", azienda).is("orders.deleted_at", null).neq("order_id", commessa).in("employee_id", idDipendenti).limit(1000) : vuoto,
  ]);
  let assegnazioniVerificate = !dip.error && !prof.error && !singoli.error && (singoli.data?.length ?? 0) < 1000;
  const profili = new Map<string, string>();
  const oreGiornaliere: Record<string, number> = {};
  for (const p of [...(dip.data ?? []), ...(prof.data ?? [])]) {
    const id = p.employee_id ?? `hr:${p.id}`;
    profili.set(p.id, richieste.has(id) ? id : `hr:${p.id}`);
    const ore = Number(p.ore_giornaliere);
    if (ore > 0 && ore <= 24) oreGiornaliere[profili.get(p.id)!] = ore;
  }
  const legami = profili.size ? await client.from("squadre_componenti").select("squadra_id,hr_profilo_id").eq("company_id", azienda).in("hr_profilo_id", [...profili.keys()]) : vuoto;
  assegnazioniVerificate &&= !legami.error;
  const membri = new Map<string, Set<string>>();
  for (const l of legami.data ?? []) {
    const gruppo = membri.get(l.squadra_id) ?? new Set<string>();
    gruppo.add(profili.get(l.hr_profilo_id)!);
    membri.set(l.squadra_id, gruppo);
  }
  const filtriVoci = [
    idDipendenti.length ? `employee_id.in.(${idDipendenti.join(",")})` : "",
    membri.size ? `external_team_id.in.(${[...membri.keys()].join(",")})` : "",
  ].filter(Boolean).join(",");
  const [squadre, voci] = await Promise.all([
    membri.size ? client.from("squadre_commesse").select("squadra_id,order_id,phase_id,dal,al")
      .eq("company_id", azienda).neq("order_id", commessa).in("squadra_id", [...membri.keys()])
      .or(`al.is.null,al.gte.${dal}`).or(`dal.is.null,dal.lte.${al}`).limit(1000) : vuoto,
    filtriVoci ? client.from("order_work_subphase_chi").select("employee_id,external_team_id,order_id,subphase_id")
      .neq("order_id", commessa).or(filtriVoci).limit(1000) : vuoto,
  ]);
  assegnazioniVerificate &&= !squadre.error && !voci.error && (squadre.data?.length ?? 0) < 1000 && (voci.data?.length ?? 0) < 1000;
  const assegnazioni = (singoli.data ?? []) as Assegnazione[];
  const assegnazioniSquadre = (squadre.data ?? []) as Squadra[];
  const assegnazioniVoci = (voci.data ?? []) as Voce[];
  const sottofasiIds = [...new Set(assegnazioniVoci.map((v) => v.subphase_id))];
  const lettureSottofasi = await Promise.all(lotti(sottofasiIds).map((ids) => client.from("order_work_subphases")
    .select("id,phase_id,data_inizio,data_fine,fatta").in("id", ids)));
  assegnazioniVerificate &&= !lettureSottofasi.some((r) => r.error);
  const sottofasi = new Map(lettureSottofasi.flatMap((r) => (r.data ?? []) as Sottofase[]).map((r) => [r.id, r]));
  for (const v of assegnazioniVoci) {
    const sottofase = sottofasi.get(v.subphase_id);
    if (!sottofase || sottofase.fatta) continue;
    if (v.employee_id) assegnazioni.push({ employee_id: v.employee_id, order_id: v.order_id, phase_id: sottofase.phase_id, dal: sottofase.data_inizio, al: sottofase.data_fine });
    if (v.external_team_id) assegnazioniSquadre.push({ squadra_id: v.external_team_id, order_id: v.order_id, phase_id: sottofase.phase_id, dal: sottofase.data_inizio, al: sottofase.data_fine });
  }
  const archiviPertinenti = archivi.filter((a) => a.piani.some((p) => p.operai.some((o) => richieste.has(o.id))));
  const ordiniIds = [...new Set([...archiviPertinenti.map((a) => a.commessa), ...assegnazioni.map((a) => a.order_id), ...assegnazioniSquadre.map((a) => a.order_id)])];
  const fasiIds = [...new Set([...assegnazioni, ...assegnazioniSquadre].flatMap((a) => a.phase_id ? [a.phase_id] : []))];
  const [lettureOrdini, lettureFasi] = await Promise.all([
    Promise.all(lotti(ordiniIds).map((idsOrdine) => client.from("orders").select("id,order_code,work_start_date,work_end_date,assigned_to,destination_warehouse_id")
      .eq("company_id", azienda).is("deleted_at", null).in("id", idsOrdine))),
    Promise.all(lotti(fasiIds).map((idsFase) => client.from("order_work_phases").select("id,order_id,start_date,end_date,status")
      .eq("company_id", azienda).in("id", idsFase))),
  ]);
  assegnazioniVerificate &&= ![...lettureOrdini, ...lettureFasi].some((r) => r.error);
  const fasi = new Map(lettureFasi.flatMap((r) => (r.data ?? []) as Fase[]).map((f) => [f.id, f]));
  const finestra = (a: Assegnazione | Squadra, ordine: Ordine) => {
    const fase = a.phase_id ? fasi.get(a.phase_id) : undefined;
    if (a.phase_id && (!fase || fase.order_id !== ordine.id || fase.status === "completata")) return null;
    const inizio = a.dal ?? fase?.start_date ?? ordine.work_start_date;
    const fine = a.al ?? fase?.end_date ?? ordine.work_end_date;
    // Una data aperta nel periodo indica un possibile impegno; due date mancanti non danno un intervallo.
    if (!inizio && !fine) return null;
    const da = inizio && inizio > dal ? inizio : dal;
    const aGiorno = fine && fine < al ? fine : al;
    return da <= aGiorno ? { da, aGiorno } : null;
  };
  const candidatiPerOrdine = new Map<string, Array<Assegnazione | Squadra>>();
  for (const a of [...assegnazioni, ...assegnazioniSquadre]) {
    const altre = candidatiPerOrdine.get(a.order_id) ?? [];
    altre.push(a);
    candidatiPerOrdine.set(a.order_id, altre);
  }
  const archiviIds = new Set(archiviPertinenti.map((a) => a.commessa));
  const pertinenti = lettureOrdini.flatMap((r) => (r.data ?? []) as Ordine[])
    .filter((o) => archiviIds.has(o.id) || candidatiPerOrdine.get(o.id)?.some((a) => finestra(a, o)));
  const ordini = new Map<string, Ordine>();
  // La visibilità è la stessa usata per aprire la commessa. Verifica solo quelle che intersecano il periodo.
  for (const lotto of lotti(pertinenti, 20)) {
    const accessi = await Promise.all(lotto.map(async (o) => {
      const esito = await client.rpc("can_see_order", { _order_id: o.id, _assigned_to: o.assigned_to, _warehouse_id: o.destination_warehouse_id });
      return { o, esito };
    }));
    for (const { o, esito } of accessi) {
      assegnazioniVerificate &&= !esito.error;
      if (esito.data === true) ordini.set(o.id, o);
    }
  }
  const impegni = new Map<string, ImpegnoCantiere>();
  const registra = (persona: string, ordine: Ordine, giorno: string, ore: number | null) => {
    const k = `${persona}/${ordine.id}/${giorno}`;
    if (ore !== null || !impegni.has(k)) impegni.set(k, { persona, commessa: ordine.id, codice: ordine.order_code ?? "Commessa", giorno, ore });
  };
  for (const a of archiviPertinenti) {
    const ordine = ordini.get(a.commessa);
    if (!ordine) continue;
    for (const i of caricoPerGiorno(a.piani, richieste, dal, al)) registra(i.persona, ordine, i.giorno, i.ore);
  }
  const registraAssegnazione = (a: Assegnazione | Squadra) => {
    const ordine = ordini.get(a.order_id);
    if (!ordine) return;
    const periodo = finestra(a, ordine);
    if (!periodo) return;
    const { da, aGiorno } = periodo;
    const personeAssegnate = "employee_id" in a ? [a.employee_id] : [...(membri.get(a.squadra_id) ?? [])];
    for (const giorno of dateLavorative(da, aGiorno, () => true)) for (const persona of personeAssegnate) registra(persona, ordine, giorno, null);
  };
  for (const a of [...assegnazioni, ...assegnazioniSquadre]) registraAssegnazione(a);
  return { oreGiornaliere, impegni: [...impegni.values()], assegnazioniVerificate };
}
