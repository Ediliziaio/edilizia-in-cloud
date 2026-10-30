/**
 * useCrmSegmenti — i conteggi sui contatti per i riquadri «Fonti»,
 * «Segmentazione», «Settore e dimensione», «Aziende / Account» e «Alert intelligenti».
 *
 * Prima ogni riquadro scaricava 5.000 contatti (su ~96.000) e contava in
 * memoria: un campione arbitrario, senza ORDER BY. Ora conta il database con
 * `crm_dashboard_segmenti(p_company)`, una chiamata sola.
 *
 * Ripiego finché la funzione non è applicata: dal campione si prendono solo le
 * VOCI (quali fonti, mestieri, zone, aziende) e poi ogni voce si conta in modo
 * esatto con una head-query. Restano stimati solo il valore previsto per
 * mestiere e le «aziende calde senza decision maker» (`approssimato: true`).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CrmSegmenti {
  fonti: { fonte: string; n: number }[];
  mestieri: { mestiere: string; n: number; valore: number }[];
  zone: { zona: string; n: number }[];
  ateco: { ateco: string; n: number }[];
  dimensioni: { dimensione: string; n: number }[];
  aziende: {
    azienda: string;
    contatti: number;
    pipeline: number;
    caldi: number;
    mestiere: string | null;
    decision_maker: string | null;
  }[];
  caldi_senza_followup: number;
  aziende_calde_senza_dm: number;
  /** true = ripiego client-side (la funzione SQL non c'è ancora). */
  approssimato?: boolean;
}

const HOT_TIERS = ["hot", "caldo", "high", "alto", "a", "A"];
const isHot = (t: string | null) => /hot|cald|high|alto|^a$/i.test(t || "");
const DAY = 86_400_000;

/** Prime N chiavi per frequenza nel campione. */
function topKeys(values: (string | null)[], n: number): string[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v || "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

async function ripiego(companyId: string): Promise<CrmSegmenti> {
  const base = () =>
    supabase.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  const cnt = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);

  const [sample, opps] = await Promise.all([
    supabase
      .from("marketing_contacts")
      .select("id,source,tipo,province,ateco_code,company_size,company_name,first_name,last_name,is_decision_maker,ai_score_tier,ai_predicted_value_eur")
      .eq("company_id", companyId)
      .limit(5000),
    supabase
      .from("marketing_opportunities")
      .select("contact_id,value")
      .eq("company_id", companyId)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(5000),
  ]);
  if (sample.error) throw sample.error;
  const rows = (sample.data ?? []) as {
    id: string;
    source: string | null;
    tipo: string | null;
    province: string | null;
    ateco_code: string | null;
    company_size: string | null;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    is_decision_maker: boolean | null;
    ai_score_tier: string | null;
    ai_predicted_value_eur: number | null;
  }[];

  const fontiK = topKeys(rows.map((r) => r.source), 12);
  const mestieriK = topKeys(rows.map((r) => r.tipo), 6);
  const zoneK = topKeys(rows.map((r) => r.province), 6);
  const atecoK = topKeys(rows.map((r) => r.ateco_code), 6);
  const dimK = topKeys(rows.map((r) => r.company_size), 6);

  // Aziende: pipeline aperta per contatto, poi le prime 8 del campione.
  const pipeByContact = new Map<string, number>();
  for (const o of (opps.data ?? []) as { contact_id: string | null; value: number | null }[]) {
    if (o.contact_id) pipeByContact.set(o.contact_id, (pipeByContact.get(o.contact_id) ?? 0) + (o.value ?? 0));
  }
  const az = new Map<string, { pipeline: number; caldi: number; mestiere: string | null; dm: string | null; n: number }>();
  for (const r of rows) {
    const k = (r.company_name || "").trim();
    if (!k) continue;
    const cur = az.get(k) ?? { pipeline: 0, caldi: 0, mestiere: null, dm: null, n: 0 };
    cur.n += 1;
    cur.pipeline += pipeByContact.get(r.id) ?? 0;
    if (isHot(r.ai_score_tier)) cur.caldi += 1;
    if (!cur.mestiere && r.tipo) cur.mestiere = r.tipo;
    if (r.is_decision_maker && !cur.dm) cur.dm = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
    az.set(k, cur);
  }
  const aziendeK = [...az.entries()].sort((a, b) => b[1].pipeline - a[1].pipeline || b[1].n - a[1].n).slice(0, 8);

  const fiveDaysAgoIso = new Date(Date.now() - 5 * DAY).toISOString();
  const [fontiC, mestieriC, zoneC, atecoC, dimC, aziendeC, caldi] = await Promise.all([
    Promise.all(fontiK.map((k) => base().eq("source", k))),
    Promise.all(mestieriK.map((k) => base().eq("tipo", k))),
    Promise.all(zoneK.map((k) => base().eq("province", k))),
    Promise.all(atecoK.map((k) => base().eq("ateco_code", k))),
    Promise.all(dimK.map((k) => base().eq("company_size", k))),
    Promise.all(aziendeK.map(([k]) => base().eq("company_name", k))),
    base()
      .in("ai_score_tier", HOT_TIERS)
      .or(`last_activity_at.is.null,last_activity_at.lt.${fiveDaysAgoIso}`),
  ]);

  const dmByCompany = new Map<string, boolean>();
  for (const r of rows) {
    const k = (r.company_name || "").trim();
    if (!k) continue;
    dmByCompany.set(k, (dmByCompany.get(k) ?? false) || !!r.is_decision_maker);
  }
  const aziendeCaldeSenzaDm = [...az.entries()].filter(([k, v]) => v.caldi > 0 && !dmByCompany.get(k)).length;

  return {
    fonti: fontiK.map((fonte, i) => ({ fonte, n: cnt(fontiC[i]) })).sort((a, b) => b.n - a.n),
    mestieri: mestieriK
      .map((mestiere, i) => ({
        mestiere,
        n: cnt(mestieriC[i]),
        valore: rows.filter((r) => (r.tipo || "").trim() === mestiere).reduce((s, r) => s + (r.ai_predicted_value_eur ?? 0), 0),
      }))
      .sort((a, b) => b.n - a.n),
    zone: zoneK.map((zona, i) => ({ zona, n: cnt(zoneC[i]) })).sort((a, b) => b.n - a.n),
    ateco: atecoK.map((ateco, i) => ({ ateco, n: cnt(atecoC[i]) })).sort((a, b) => b.n - a.n),
    dimensioni: dimK.map((dimensione, i) => ({ dimensione, n: cnt(dimC[i]) })).sort((a, b) => b.n - a.n),
    aziende: aziendeK.map(([azienda, v], i) => ({
      azienda,
      contatti: cnt(aziendeC[i]) || v.n,
      pipeline: v.pipeline,
      caldi: v.caldi,
      mestiere: v.mestiere,
      decision_maker: v.dm,
    })),
    caldi_senza_followup: cnt(caldi),
    aziende_calde_senza_dm: aziendeCaldeSenzaDm,
    approssimato: true,
  };
}

export function useCrmSegmenti(companyId: string) {
  return useQuery({
    queryKey: ["crm-dash", "segmenti", companyId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CrmSegmenti> => {
      // La funzione non è nei tipi generati: cast locale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("crm_dashboard_segmenti", { p_company: companyId });
      if (!error && data) return data as CrmSegmenti;
      return ripiego(companyId);
    },
  });
}
