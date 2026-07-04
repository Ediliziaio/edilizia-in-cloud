/**
 * useCrmMapPoints — sorgente dati per la Mappa CRM (tab "Mappa" della dashboard
 * commerciale). Costruisce i punti da mostrare sulla mappa d'Italia:
 *
 *  • VERDE = clienti: aziende su Edilizia in Cloud (companies) + i contatti CRM
 *    che risultano clienti di un servizio AEDIX (aedix_service_clients.contact_id).
 *  • ROSSO = prospect: i restanti marketing_contacts (target di outreach).
 *
 * Ogni punto porta una mini-scheda (nome, categoria, stato, temperatura,
 * città/indirizzo, email, telefono, fatturato, conteggi attività per canale) +
 * metadati per filtri/dimensione pin (peso fatturato, contattabilità).
 *
 * Posizione: coordinate precise se presenti (companies.operational_lat/lng o
 * marketing_contacts.lat/lng geocodificate), altrimenti centroide provincia/regione.
 *
 * Platform-scoped: companies e aedix_service_clients sono globali (super_admin);
 * marketing_contacts e le attività sono filtrate sul companyId (CRM admin).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCoord } from "@/lib/crm/provinceCentroids";

export type CrmMapTipo = "cliente" | "prospect";

export interface CrmMapActivity {
  tipo: string;
  n: number;
}

export interface CrmMapPoint {
  id: string;
  tipo: CrmMapTipo;
  nome: string;
  categoria: string | null;
  stato: string | null;
  temperatura: string | null;
  /** fatturato in € (numerico) se disponibile — per filtri e dimensione pin. */
  fatturatoNum: number | null;
  /** fatturato formattato per il popup. */
  fatturato: string | null;
  /** tier 0..4 dal fatturato → dimensione del pin. */
  pesoTier: number;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
  attivita: CrmMapActivity[];
  /** contattabile via email (ha email e non in opt-out). */
  contattabile: boolean;
  lat: number;
  lng: number;
  precise: boolean;
}

export interface CrmMapData {
  points: CrmMapPoint[];
  clienti: number;
  prospect: number;
  senzaPosizione: number;
  approssimate: number;
}

/** Estrae un valore in € da una fascia testuale (es. "1M-5M", "100k-500k"). */
function parseRevenueRange(s: string | null): number | null {
  if (!s) return null;
  const matches = s.toLowerCase().match(/\d+[.,]?\d*\s*(?:mln|milioni?|m|k|mila)?/g);
  if (!matches) return null;
  let max = 0;
  for (const tok of matches) {
    const num = parseFloat(tok.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!Number.isFinite(num)) continue;
    let val = num;
    if (/m(?:ln)?|milion/.test(tok)) val = num * 1_000_000;
    else if (/k|mila/.test(tok)) val = num * 1_000;
    max = Math.max(max, val);
  }
  return max > 0 ? max : null;
}

/** Tier 0..4 dal fatturato numerico → dimensione pin. */
export function pesoTierFromRevenue(num: number | null): number {
  if (num == null) return 0;
  if (num >= 5_000_000) return 4;
  if (num >= 1_000_000) return 3;
  if (num >= 500_000) return 2;
  if (num >= 100_000) return 1;
  return 0;
}

/** Formatta € in forma breve (1,5 Mln € / 300k € / 900 €). */
function formatEuroShort(num: number | null): string | null {
  if (num == null) return null;
  if (num >= 1_000_000) return `${(num / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} Mln €`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k €`;
  return `${Math.round(num)} €`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useCrmMapPoints(companyId: string | undefined) {
  return useQuery<CrmMapData>({
    queryKey: ["crm-map-points", companyId ?? "*"],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1) Aziende clienti EiC (globali). Escludiamo l'azienda platform-admin.
      const companiesRes = await (supabase as any)
        .from("companies")
        .select("id, name, business_name, vertical, email, phone, operational_lat, operational_lng, operational_city, legal_city, operational_province, legal_province, region, annual_revenue_range, status, is_platform_admin_company")
        .limit(5000);
      if (companiesRes.error) throw companiesRes.error;

      // 2) Contatti che sono clienti di un servizio → vanno in VERDE.
      const svcRes = await (supabase as any)
        .from("aedix_service_clients")
        .select("contact_id")
        .not("contact_id", "is", null)
        .limit(5000);
      if (svcRes.error) throw svcRes.error;
      const clientContactIds = new Set<string>(
        ((svcRes.data ?? []) as { contact_id: string | null }[])
          .map((r) => r.contact_id)
          .filter((x): x is string => !!x),
      );

      // 3) Prospect / contatti CRM di piattaforma.
      const contactsRes = await (supabase as any)
        .from("marketing_contacts")
        .select("id, company_name, first_name, last_name, tags, email, phone, city, province, region, address, stato, ai_score_tier, fatturato, lat, lng, optout_email")
        .eq("company_id", companyId)
        .limit(20000);
      if (contactsRes.error) throw contactsRes.error;

      // 4) Conteggio attività per contatto e canale (best-effort).
      const activityByContact = new Map<string, Map<string, number>>();
      try {
        const actRes = await (supabase as any)
          .from("marketing_contact_activities")
          .select("contact_id, activity_type")
          .eq("company_id", companyId)
          .limit(50000);
        if (!actRes.error) {
          for (const a of (actRes.data ?? []) as any[]) {
            if (!a.contact_id) continue;
            let m = activityByContact.get(a.contact_id);
            if (!m) { m = new Map(); activityByContact.set(a.contact_id, m); }
            const t = (a.activity_type as string) || "altro";
            m.set(t, (m.get(t) ?? 0) + 1);
          }
        }
      } catch { /* attività opzionali */ }

      const points: CrmMapPoint[] = [];
      let clienti = 0;
      let prospect = 0;
      let senzaPosizione = 0;
      let approssimate = 0;

      // Companies → verde
      for (const c of (companiesRes.data ?? []) as any[]) {
        if (c.is_platform_admin_company === true) continue;
        const prov = c.operational_province ?? c.legal_province ?? null;
        const coord = resolveCoord(`comp-${c.id}`, c.operational_lat, c.operational_lng, prov, c.region);
        if (!coord) { senzaPosizione++; continue; }
        if (!coord.precise) approssimate++;
        clienti++;
        const fatturatoNum = parseRevenueRange(c.annual_revenue_range ?? null);
        points.push({
          id: `comp-${c.id}`,
          tipo: "cliente",
          nome: c.business_name || c.name || "Azienda",
          categoria: c.vertical ?? null,
          stato: c.status ?? null,
          temperatura: null,
          fatturatoNum,
          fatturato: c.annual_revenue_range ?? formatEuroShort(fatturatoNum),
          pesoTier: pesoTierFromRevenue(fatturatoNum),
          email: c.email ?? null,
          telefono: c.phone ?? null,
          citta: c.operational_city ?? c.legal_city ?? null,
          provincia: prov,
          regione: c.region ?? null,
          indirizzo: null,
          attivita: [],
          contattabile: !!c.email,
          lat: coord.lat,
          lng: coord.lng,
          precise: coord.precise,
        });
      }

      // marketing_contacts → verde se cliente-servizio, altrimenti rosso
      for (const m of (contactsRes.data ?? []) as any[]) {
        const coord = resolveCoord(`mkt-${m.id}`, m.lat, m.lng, m.province, m.region);
        if (!coord) { senzaPosizione++; continue; }
        if (!coord.precise) approssimate++;
        const isClient = clientContactIds.has(m.id);
        if (isClient) clienti++; else prospect++;
        const nome =
          m.company_name ||
          [m.first_name, m.last_name].filter(Boolean).join(" ").trim() ||
          "Contatto";
        const tags: string[] = Array.isArray(m.tags) ? m.tags : [];
        const actMap = activityByContact.get(m.id);
        const attivita: CrmMapActivity[] = actMap
          ? Array.from(actMap.entries()).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n)
          : [];
        const fatturatoNum = typeof m.fatturato === "number" ? m.fatturato : null;
        points.push({
          id: `mkt-${m.id}`,
          tipo: isClient ? "cliente" : "prospect",
          nome,
          categoria: tags[0] ?? null,
          stato: m.stato ?? null,
          temperatura: m.ai_score_tier ?? null,
          fatturatoNum,
          fatturato: formatEuroShort(fatturatoNum),
          pesoTier: pesoTierFromRevenue(fatturatoNum),
          email: m.email ?? null,
          telefono: m.phone ?? null,
          citta: m.city ?? null,
          provincia: m.province ?? null,
          regione: m.region ?? null,
          indirizzo: m.address ?? null,
          attivita,
          contattabile: !!m.email && m.optout_email !== true,
          lat: coord.lat,
          lng: coord.lng,
          precise: coord.precise,
        });
      }

      return { points, clienti, prospect, senzaPosizione, approssimate };
    },
  });
}
