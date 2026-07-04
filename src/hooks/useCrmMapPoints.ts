/**
 * useCrmMapPoints — sorgente dati per la Mappa CRM (tab "Mappa" della dashboard
 * commerciale). Costruisce i punti da mostrare sulla mappa d'Italia:
 *
 *  • VERDE = clienti: aziende su Edilizia in Cloud (companies) + i contatti CRM
 *    che risultano clienti di un servizio AEDIX (aedix_service_clients.contact_id).
 *  • ROSSO = prospect: i restanti marketing_contacts (target di outreach).
 *
 * Posizione: coordinate precise se presenti (companies.operational_lat/lng),
 * altrimenti centroide provincia/regione (vedi resolveCoord). I punti non
 * posizionabili (senza provincia/regione né coordinate) vengono contati a parte.
 *
 * Platform-scoped: companies e aedix_service_clients sono globali (super_admin);
 * marketing_contacts è filtrato sul companyId (CRM admin di piattaforma).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCoord } from "@/lib/crm/provinceCentroids";

export type CrmMapTipo = "cliente" | "prospect";

export interface CrmMapPoint {
  id: string;
  tipo: CrmMapTipo;
  nome: string;
  categoria: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
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
        .select("id, name, business_name, vertical, operational_lat, operational_lng, operational_province, legal_province, region, is_platform_admin_company")
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
        .select("id, company_name, first_name, last_name, tags, province, region, address")
        .eq("company_id", companyId)
        .limit(20000);
      if (contactsRes.error) throw contactsRes.error;

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
          provincia: prov,
          regione: c.region ?? null,
          indirizzo: null,
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
        points.push({
          id: `mkt-${m.id}`,
          tipo: isClient ? "cliente" : "prospect",
          nome,
          categoria: tags[0] ?? null,
          provincia: m.province ?? null,
          regione: m.region ?? null,
          indirizzo: m.address ?? null,
          lat: coord.lat,
          lng: coord.lng,
          precise: coord.precise,
        });
      }

      return { points, clienti, prospect, senzaPosizione, approssimate };
    },
  });
}
