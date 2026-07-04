/**
 * useCrmMapPoints — sorgente dati per la Mappa CRM (tab "Mappa" della dashboard
 * commerciale). Costruisce i punti da mostrare sulla mappa d'Italia:
 *
 *  • VERDE = clienti: aziende su Edilizia in Cloud (companies) + i contatti CRM
 *    che risultano clienti di un servizio AEDIX (aedix_service_clients.contact_id).
 *  • ROSSO = prospect: i restanti marketing_contacts (target di outreach).
 *
 * Ogni punto porta con sé una mini-scheda (nome, categoria, stato, temperatura,
 * città/indirizzo, email, telefono, fatturato quando disponibile e i conteggi
 * delle attività fatte per canale) mostrata nel popup della mappa.
 *
 * Posizione: coordinate precise se presenti (companies.operational_lat/lng),
 * altrimenti centroide provincia/regione (vedi resolveCoord).
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
  /** temperatura lead (ai_score_tier) — solo prospect/contatti. */
  temperatura: string | null;
  /** fascia fatturato (annual_revenue_range) — solo aziende clienti. */
  fatturato: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
  /** conteggio attività per canale (email/whatsapp/chiamata…). */
  attivita: CrmMapActivity[];
  lat: number;
  lng: number;
  /** true = coordinate precise, false = centroide provincia/regione. */
  precise: boolean;
}

export interface CrmMapData {
  points: CrmMapPoint[];
  clienti: number;
  prospect: number;
  /** entità senza provincia/regione né coordinate → non mostrabili. */
  senzaPosizione: number;
  /** quante posizionate su centroide (approssimate) vs precise. */
  approssimate: number;
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
        .select("id, company_name, first_name, last_name, tags, email, phone, city, province, region, address, stato, ai_score_tier")
        .eq("company_id", companyId)
        .limit(20000);
      if (contactsRes.error) throw contactsRes.error;

      // 4) Conteggio attività per contatto e canale (best-effort: se fallisce,
      //    la mappa funziona comunque senza i conteggi).
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
        points.push({
          id: `comp-${c.id}`,
          tipo: "cliente",
          nome: c.business_name || c.name || "Azienda",
          categoria: c.vertical ?? null,
          stato: c.status ?? null,
          temperatura: null,
          fatturato: c.annual_revenue_range ?? null,
          email: c.email ?? null,
          telefono: c.phone ?? null,
          citta: c.operational_city ?? c.legal_city ?? null,
          provincia: prov,
          regione: c.region ?? null,
          indirizzo: null,
          attivita: [],
          lat: coord.lat,
          lng: coord.lng,
          precise: coord.precise,
        });
      }

      // marketing_contacts → verde se cliente-servizio, altrimenti rosso
      for (const m of (contactsRes.data ?? []) as any[]) {
        const coord = resolveCoord(`mkt-${m.id}`, null, null, m.province, m.region);
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
          ? Array.from(actMap.entries())
              .map(([tipo, n]) => ({ tipo, n }))
              .sort((a, b) => b.n - a.n)
          : [];
        points.push({
          id: `mkt-${m.id}`,
          tipo: isClient ? "cliente" : "prospect",
          nome,
          categoria: tags[0] ?? null,
          stato: m.stato ?? null,
          temperatura: m.ai_score_tier ?? null,
          fatturato: null,
          email: m.email ?? null,
          telefono: m.phone ?? null,
          citta: m.city ?? null,
          provincia: m.province ?? null,
          regione: m.region ?? null,
          indirizzo: m.address ?? null,
          attivita,
          lat: coord.lat,
          lng: coord.lng,
          precise: coord.precise,
        });
      }

      return { points, clienti, prospect, senzaPosizione, approssimate };
    },
  });
}
