/**
 * I dati per programmare una giornata (26/11/2026): chi c'è, le squadre, i
 * mezzi e le commesse in calendario quel giorno. Solo letture: la giornata
 * preparata per ora resta in questo browser (vedi useBozzaGiornata), il
 * salvataggio nel database arriva col passo successivo.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { oggiRoma, useGiornataOperai, useOperai, useSquadre, chiaviOperai } from "@/hooks/useOperai";
import type { WeatherDay } from "@/hooks/useWeatherForecast";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { funzioneMancante, programmazioneAssente, segnaProgrammazioneAssente } from "@/lib/programmazione/disponibilita";
import { readSiteForecast, siteForecastAvailable, SITE_WEATHER_DAYS } from "@/lib/calendar/siteWeather";
import { useMezzi } from "@/hooks/useMezzi";
import { etichettaGiornata, statoNoto } from "@/lib/manodopera/giornata";
import {
  abilitazioniDaTitoli, aggiungiMinuti, chiaveNome, completaConProposta, giornoOraRoma, proponiGiornata, type EsternoGiorno, type Intervento, type MerceGiorno, ruoloPersona, spostaGiorno, type CommessaGiorno, type Punto, type UscitaGiorno, type Giornata, type MezzoGiorno, type PersonaGiorno, type SquadraGiorno,
} from "@/lib/programmazione/giornata";

export interface FaseGiorno {
  id: string;
  orderId: string;
  nome: string;
  stato: string;
  attivaOggi: boolean;
  percentuale: number;
  dal: string | null;
  al: string | null;
  note: string | null;
}

const SELECT_COMMESSA = "id, order_code, client_name, client_company, client_phone, description, work_address, indirizzo_lavori, work_start_time, work_start_date, work_end_date, percentuale_avanzamento, work_lat, work_lng";

type RigaCommessa = {
  id: string;
  order_code: string | null;
  client_name: string | null;
  client_company: string | null;
  description: string | null;
  work_address: string | null;
  indirizzo_lavori: string | null;
  work_start_time: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  percentuale_avanzamento: number | null;
  client_phone: string | null;
  work_lat: number | null;
  work_lng: number | null;
};

export function punto(lat: number | null | undefined, lng: number | null | undefined): Punto | null {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

export function commessaDaRiga(r: RigaCommessa): CommessaGiorno {
  return {
    id: r.id,
    codice: r.order_code,
    cliente: r.client_company || r.client_name,
    descrizione: r.description,
    indirizzo: r.work_address || r.indirizzo_lavori,
    inizio: r.work_start_time,
    dal: r.work_start_date,
    al: r.work_end_date,
    avanzamento: r.percentuale_avanzamento,
    telefono: r.client_phone,
    punto: punto(r.work_lat, r.work_lng),
  };
}

function usePersoneTutte(companyId: string | null) {
  return useQuery({
    queryKey: chiaviOperai.persone(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manodopera_persone", { p_company_id: companyId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/** Commesse con il cantiere aperto quel giorno, più quelle dove una squadra è prevista. */
function useCommesseDelGiorno(companyId: string | null, giorno: string, previste: string[]) {
  const chiavePreviste = [...previste].sort().join(",");
  return useQuery({
    queryKey: ["programmazione", "commesse", companyId, giorno, chiavePreviste],
    queryFn: async () => {
      const [inCalendario, conSquadra] = await Promise.all([
        supabase
          .from("orders")
          .select(SELECT_COMMESSA)
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .neq("status", "completato")
          .lte("work_start_date", giorno)
          .or(`work_end_date.gte.${giorno},and(work_end_date.is.null,work_start_date.eq.${giorno})`)
          .order("work_start_time", { ascending: true, nullsFirst: false })
          .limit(200),
        previste.length
          ? supabase.from("orders").select(SELECT_COMMESSA).eq("company_id", companyId!).is("deleted_at", null).in("id", previste)
          : Promise.resolve({ data: [] as RigaCommessa[], error: null }),
      ]);
      if (inCalendario.error) throw inCalendario.error;
      if (conSquadra.error) throw conSquadra.error;
      const visti = new Set<string>();
      const out: CommessaGiorno[] = [];
      for (const r of [...(inCalendario.data ?? []), ...(conSquadra.data ?? [])] as RigaCommessa[]) {
        if (visti.has(r.id)) continue;
        visti.add(r.id);
        out.push(commessaDaRiga(r));
      }
      return out;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useFasiCommesse(companyId: string | null, giorno: string, orderIds: string[]) {
  const chiave = [...orderIds].sort().join(",");
  return useQuery({
    queryKey: ["programmazione", "fasi", companyId, giorno, chiave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id, order_id, name, status, start_date, end_date, position, percentuale, notes")
        .eq("company_id", companyId!)
        .in("order_id", orderIds)
        .neq("status", "completata")
        .order("position");
      if (error) throw error;
      return (data ?? []).map((f): FaseGiorno => ({
        id: f.id,
        orderId: f.order_id,
        nome: f.name,
        stato: f.status,
        attivaOggi: !!f.start_date && f.start_date <= giorno && (f.end_date ?? f.start_date) >= giorno,
        percentuale: f.percentuale ?? 0,
        dal: f.start_date,
        al: f.end_date,
        note: f.notes,
      }));
    },
    enabled: !!companyId && orderIds.length > 0,
    staleTime: 60_000,
  });
}

export interface UscitaGrezza extends Omit<UscitaGiorno, "persone"> {
  /** Nomi delle persone previste (profiles), da abbinare al Personale. */
  nomi: { nome: string | null; cognome: string | null }[];
  /** Account di chi ci va: con la programmazione nel database si abbinano per account, non per nome. */
  utenti: string[];
}

type RigaSopralluogo = {
  id: string; code: string | null; address: string | null; address_number: string | null; city: string | null;
  latitude: number | null; longitude: number | null;
  scheduled_at: string | null; duration_minutes: number | null; notes: string | null; order_id: string | null; technician_id: string | null;
  order: { order_code: string | null; client_name: string | null; client_company: string | null } | null;
  survey_assignees: { user_id: string }[] | null;
};
type RigaAssistenza = {
  id: string; subject: string; indirizzo_intervento: string | null; data_intervento_prevista: string | null;
  order_id: string | null; assigned_to: string | null; tipo: string | null;
  customer: { first_name: string | null; last_name: string | null } | null;
};

/**
 * Sopralluoghi e assistenze (interventi tecnici) in programma quel giorno, con
 * i nomi di chi ci va. Le persone si abbinano al Personale per nome: il legame
 * persona↔account (hr_profili.user_id) lo legge solo l'amministratore.
 */
function useUsciteDelGiorno(companyId: string | null, giorno: string) {
  return useQuery({
    queryKey: ["programmazione", "uscite", companyId, giorno],
    queryFn: async (): Promise<UscitaGrezza[]> => {
      const da = `${spostaGiorno(giorno, -1)}T00:00:00Z`;
      const a = `${spostaGiorno(giorno, 2)}T00:00:00Z`;
      const [sop, ass] = await Promise.all([
        supabase
          .from("surveys")
          .select("id, code, address, address_number, city, latitude, longitude, scheduled_at, duration_minutes, notes, order_id, technician_id, order:orders!surveys_order_id_fkey(order_code, client_name, client_company), survey_assignees(user_id)")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .gte("scheduled_at", da)
          .lt("scheduled_at", a)
          .limit(200),
        supabase
          .from("tickets")
          .select("id, subject, indirizzo_intervento, data_intervento_prevista, order_id, assigned_to, tipo, customer:profiles!tickets_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!)
          .not("status", "in", "(risolto,chiuso)")
          .gte("data_intervento_prevista", da)
          .lt("data_intervento_prevista", a)
          .limit(200),
      ]);
      // Una fonte che non si legge (permessi, modulo spento) non ferma la giornata.
      const sopralluoghi = sop.error ? [] : ((sop.data ?? []) as unknown as RigaSopralluogo[]);
      const assistenze = ass.error ? [] : ((ass.data ?? []) as unknown as RigaAssistenza[]);

      const utenti = new Set<string>();
      for (const s of sopralluoghi) {
        for (const x of s.survey_assignees ?? []) utenti.add(x.user_id);
        if (s.technician_id) utenti.add(s.technician_id);
      }
      for (const t of assistenze) if (t.assigned_to) utenti.add(t.assigned_to);
      const nomi = new Map<string, { nome: string | null; cognome: string | null }>();
      if (utenti.size) {
        const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", [...utenti]);
        for (const p of data ?? []) nomi.set(p.id, { nome: p.first_name, cognome: p.last_name });
      }

      const out: UscitaGrezza[] = [];
      for (const s of sopralluoghi) {
        if (!s.scheduled_at) continue;
        const { giorno: g, ora: h } = giornoOraRoma(s.scheduled_at);
        if (g !== giorno) continue;
        const chi = [...new Set([...(s.survey_assignees ?? []).map((x) => x.user_id), ...(s.technician_id ? [s.technician_id] : [])])];
        out.push({
          id: s.id,
          tipo: "sopralluogo",
          titolo: s.order?.client_company || s.order?.client_name || "Sopralluogo",
          codice: s.code ?? s.order?.order_code ?? null,
          orderId: s.order_id,
          indirizzo: [[s.address, s.address_number].filter(Boolean).join(" "), s.city].filter(Boolean).join(", ") || null,
          inizio: h,
          fine: s.duration_minutes ? aggiungiMinuti(h, s.duration_minutes) : null,
          note: s.notes,
          punto: punto(s.latitude, s.longitude),
          nomi: chi.map((id) => nomi.get(id)).filter((x): x is { nome: string | null; cognome: string | null } => !!x),
          utenti: chi,
        });
      }
      for (const t of assistenze) {
        if (!t.data_intervento_prevista) continue;
        const mezzanotte = /T00:00(:00)?(\.0+)?(Z|\+00(:00)?)$/.test(t.data_intervento_prevista);
        const { giorno: g, ora: h } = mezzanotte
          ? { giorno: t.data_intervento_prevista.slice(0, 10), ora: null }
          : giornoOraRoma(t.data_intervento_prevista);
        if (g !== giorno) continue;
        const cliente = [t.customer?.first_name, t.customer?.last_name].filter(Boolean).join(" ");
        out.push({
          id: t.id,
          tipo: "manutenzione",
          titolo: cliente ? `${cliente} — ${t.subject}` : t.subject,
          codice: t.tipo === "emergenza" ? "Emergenza" : "Assistenza",
          orderId: t.order_id,
          indirizzo: t.indirizzo_intervento,
          inizio: h,
          fine: null,
          note: null,
          nomi: t.assigned_to && nomi.get(t.assigned_to) ? [nomi.get(t.assigned_to)!] : [],
          utenti: t.assigned_to ? [t.assigned_to] : [],
        });
      }
      return out;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

/** Squadre esterne e subappaltatori attivi. */
function useEsterni(companyId: string | null) {
  return useQuery({
    queryKey: ["programmazione", "esterni", companyId],
    queryFn: async (): Promise<EsternoGiorno[]> => {
      const { data, error } = await supabase.from("external_teams").select("id, name, color, phone").eq("company_id", companyId!).eq("kind", "esterna").eq("is_active", true).order("name");
      if (error) return [];
      return (data ?? []).map((t) => ({ id: t.id, nome: t.name, colore: t.color, telefono: t.phone }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

/** Merce in arrivo il giorno prima e quel giorno (ordini inviati o confermati). */
function useMerceDelGiorno(companyId: string | null, giorno: string) {
  return useQuery({
    queryKey: ["programmazione", "merce", companyId, giorno],
    queryFn: async (): Promise<MerceGiorno[]> => {
      const { data, error } = await dbLibero
        .from("purchase_orders")
        .select("id, oda_number, order_id, expected_delivery_date, delivery_address, fornitore:suppliers!purchase_orders_supplier_id_fkey(name), magazzino:warehouses!purchase_orders_delivery_warehouse_id_fkey(name, address)")
        .eq("company_id", companyId)
        .in("status", ["inviato", "confermato"])
        .gte("expected_delivery_date", spostaGiorno(giorno, -1))
        .lte("expected_delivery_date", giorno)
        .limit(100);
      if (error) return [];
      type Riga = { id: string; oda_number: string; order_id: string | null; expected_delivery_date: string; delivery_address: string | null; fornitore: { name: string } | null; magazzino: { name: string; address: string | null } | null };
      return ((data ?? []) as Riga[]).map((r) => ({
        id: r.id, numero: r.oda_number, orderId: r.order_id, fornitore: r.fornitore?.name ?? null, giorno: r.expected_delivery_date,
        magazzino: r.magazzino?.name ?? null, magazzinoIndirizzo: r.magazzino?.address ?? null, indirizzo: r.delivery_address,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export interface PersonaExtra {
  abilitazioni: string[];
  haApp: boolean;
  telefono: string | null;
  /** Solo per chi ha il permesso «Costi». */
  costoOrario: number | null;
}

/**
 * Abilitazioni (dai corsi del Personale), app e costo orario: vengono da
 * programmazione_persone_extra (migrazione). Senza, niente abilitazioni né costi.
 */
function usePersoneExtra(companyId: string | null) {
  return useQuery({
    queryKey: ["programmazione", "persone-extra", companyId],
    queryFn: async (): Promise<Map<string, PersonaExtra> | null> => {
      if (programmazioneAssente()) return null;
      const { data, error } = await dbLibero.rpc("programmazione_persone_extra", { p_company_id: companyId });
      if (error) { if (funzioneMancante(error)) segnaProgrammazioneAssente(); return null; }
      const out = new Map<string, PersonaExtra>();
      for (const r of (data ?? []) as { hr_profilo_id: string; titoli: string[] | null; ha_app: boolean; telefono: string | null; costo_orario: number | null }[]) {
        out.set(r.hr_profilo_id, { abilitazioni: abilitazioniDaTitoli(r.titoli ?? []), haApp: r.ha_app, telefono: r.telefono, costoOrario: r.costo_orario });
      }
      return out;
    },
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** Il capocantiere attuale delle commesse (order_campo_assignments.is_capocantiere), con il nome. */
function useCapiCommesse(companyId: string | null, orderIds: string[]) {
  const chiave = [...orderIds].sort().join(",");
  return useQuery({
    queryKey: ["programmazione", "capi", companyId, chiave],
    queryFn: async () => {
      const { data, error } = await dbLibero
        .from("order_campo_assignments")
        .select("order_id, user_id, profile:profiles!order_campo_assignments_user_id_fkey(first_name, last_name)")
        .eq("company_id", companyId)
        .eq("is_capocantiere", true)
        .in("order_id", orderIds);
      if (error) return [];
      return (data ?? []) as { order_id: string; user_id: string; profile: { first_name: string | null; last_name: string | null } | null }[];
    },
    enabled: !!companyId && orderIds.length > 0,
    staleTime: 60_000,
  });
}

/** Posizione delle commesse aggiunte a mano (non in calendario quel giorno). */
export function usePuntiCommesse(companyId: string | null, ids: string[]) {
  const chiave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["programmazione", "punti", companyId, chiave],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, work_lat, work_lng").eq("company_id", companyId!).in("id", ids);
      if (error) throw error;
      const out = new Map<string, Punto>();
      for (const r of data ?? []) {
        const pt = punto(r.work_lat, r.work_lng);
        if (pt) out.set(r.id, pt);
      }
      return out;
    },
    enabled: !!companyId && ids.length > 0,
    staleTime: 10 * 60_000,
  });
}

/** Ricerca commesse da aggiungere alla giornata. */
export function useCercaCommesse(testo: string) {
  const companyId = useEffectiveCompanyId();
  const q = testo.trim().replace(/[%,()]/g, " ");
  return useQuery({
    queryKey: ["programmazione", "cerca", companyId, q],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(SELECT_COMMESSA)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .neq("status", "completato")
        .order("created_at", { ascending: false })
        .limit(12);
      if (q) query = query.or(`order_code.ilike.%${q}%,client_name.ilike.%${q}%,client_company.ilike.%${q}%,work_address.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as RigaCommessa[]).map(commessaDaRiga);
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export interface GiornataServer {
  esiste: boolean;
  stato: "bozza" | "pubblicata";
  versione: number;
  pubblicata_at: string | null;
  modificata_dopo: boolean;
  /** false = preparata solo in parte da un altro giorno. */
  completa?: boolean;
  interventi: Intervento[];
  utenti: Record<string, string>;
  /** hr_profilo_id → quando ha toccato «Ok, visto». */
  visti?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbLibero = supabase as any;

/** La funzione non c'è ancora (migrazione non applicata): si lavora nel browser. */

export const chiaveServer = (companyId: string | null, giorno: string) => ["programmazione", "server", companyId, giorno] as const;

/**
 * La giornata salvata nel database. `null` = il database non ha ancora la
 * programmazione (si lavora nel browser, come prima).
 */
function useGiornataServer(companyId: string | null, giorno: string) {
  return useQuery({
    queryKey: chiaveServer(companyId, giorno),
    queryFn: async (): Promise<GiornataServer | null> => {
      if (programmazioneAssente()) return null;
      const { data, error } = await dbLibero.rpc("programmazione_leggi", { p_company_id: companyId, p_giorno: giorno });
      if (error) {
        if (funzioneMancante(error)) { segnaProgrammazioneAssente(); return null; }
        throw error;
      }
      return data as GiornataServer;
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: (n, e) => !funzioneMancante(e) && n < 2,
  });
}

export function useDatiGiornata(giorno: string) {
  const companyId = useEffectiveCompanyId();
  const serverQ = useGiornataServer(companyId, giorno);
  const oggi = useGiornataOperai(giorno);
  const tutte = usePersoneTutte(companyId);
  const squadreQ = useSquadre();
  const mezziQ = useMezzi();

  const usciteQ = useUsciteDelGiorno(companyId, giorno);
  const esterniQ = useEsterni(companyId);
  const merceQ = useMerceDelGiorno(companyId, giorno);
  const extraQ = usePersoneExtra(companyId);
  const operaiQ = useOperai();
  const conConsuntivo = giorno <= oggiRoma();

  const personeBase = useMemo(() => {
    const delGiorno = new Map((oggi.data ?? []).map((r) => [r.profilo_id, r]));
    const elenco = tutte.data ?? [];
    const base = elenco.length ? elenco : (oggi.data ?? []).map((r) => ({ id: r.profilo_id, nome: r.nome, cognome: r.cognome, colore_avatar: r.colore_avatar, mansione: r.mansione, operaio: true }));
    return base.map((p) => ({ p, g: delGiorno.get(p.id) }));
  }, [oggi.data, tutte.data]);

  /** Sopralluoghi e assistenze con le persone abbinate per nome. */
  const uscite = useMemo<UscitaGiorno[]>(() => {
    const perNome = new Map<string, string>();
    for (const { p } of personeBase) perNome.set(chiaveNome(p.nome, p.cognome), p.id);
    // Con il database: account → persona, esatto. Senza: per nome e cognome.
    const perUtente = new Map<string, string>();
    for (const [profilo, utente] of Object.entries(serverQ.data?.utenti ?? {})) perUtente.set(utente, profilo);
    return (usciteQ.data ?? []).map(({ nomi, utenti, ...u }) => ({
      ...u,
      persone: [...new Set(perUtente.size
        ? utenti.map((id) => perUtente.get(id)).filter((x): x is string => !!x)
        : nomi.map((n) => perNome.get(chiaveNome(n.nome, n.cognome))).filter((x): x is string => !!x))],
    }));
  }, [usciteQ.data, personeBase, serverQ.data]);

  const persone = useMemo<PersonaGiorno[]>(() => {
    const conUscite = new Set(uscite.flatMap((u) => u.persone));
    const documenti = new Map((operaiQ.data ?? []).map((o) => [o.id, { scaduti: o.documenti_scaduti ?? 0, prossima: o.prossima_scadenza ?? null }]));
    const schedaOperaio = new Map((operaiQ.data ?? []).map((o) => [o.id, o]));
    const extra = extraQ.data;
    return personeBase
      .map(({ p, g }): PersonaGiorno => {
        const stato = g ? statoNoto(g.stato) : null;
        const operaio = p.operaio !== false;
        return {
          id: p.id,
          nome: p.nome ?? "",
          cognome: p.cognome ?? "",
          colore: p.colore_avatar ?? null,
          mansione: p.mansione ?? null,
          operaio,
          ruolo: ruoloPersona(operaio, p.mansione, conUscite.has(p.id)),
          squadraId: g?.squadra_id ?? null,
          previstoOrderId: g?.previsto_id ?? null,
          assenza: stato === "assente" || stato === "riposo" ? etichettaGiornata(g?.stato, g?.assenza) : null,
          documenti: documenti.get(p.id) ?? null,
          abilitazioni: extra?.get(p.id)?.abilitazioni ?? [],
          haApp: extra?.get(p.id)?.haApp ?? ("ha_accesso_app" in p ? !!p.ha_accesso_app : schedaOperaio.get(p.id)?.ha_accesso_app ?? false),
          telefono: extra?.get(p.id)?.telefono ?? schedaOperaio.get(p.id)?.telefono ?? null,
          costoOrario: extra?.get(p.id)?.costoOrario ?? null,
          consuntivo: conConsuntivo && g ? { stato: g.stato, cantiereId: g.cantiere_id ?? null, ore: g.ore_lavorate ?? null, rapportino: !!g.rapportino } : null,
        };
      })
      .sort((a, b) => `${a.nome} ${a.cognome}`.localeCompare(`${b.nome} ${b.cognome}`, "it"));
  }, [personeBase, uscite, operaiQ.data, conConsuntivo, extraQ.data]);

  const squadre = useMemo<SquadraGiorno[]>(
    () => (squadreQ.data ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      colore: s.colore,
      responsabileId: s.responsabile?.id ?? null,
      componenti: s.componenti.map((c) => c.id),
    })),
    [squadreQ.data],
  );

  const mezzi = useMemo<MezzoGiorno[]>(
    () => (mezziQ.data ?? [])
      .map((m) => ({ id: m.id, nome: m.nome, targa: m.targa ?? null, orderId: m.assegnato_order_id ?? null, attrezzatura: m.classe === "attrezzatura" })),
    [mezziQ.data],
  );

  const previste = useMemo(() => [...new Set(persone.map((p) => p.previstoOrderId).filter((x): x is string => !!x))], [persone]);
  const commesseQ = useCommesseDelGiorno(companyId, giorno, previste);

  const caricamento = oggi.isLoading || tutte.isLoading || squadreQ.isLoading || mezziQ.isLoading || commesseQ.isLoading || usciteQ.isLoading || serverQ.isLoading;
  const errore = oggi.error || commesseQ.error || null;

  const commesse = useMemo(() => commesseQ.data ?? [], [commesseQ.data]);
  const capiQ = useCapiCommesse(companyId, commesse.map((c) => c.id));
  /** Commessa → hr_profili.id del suo capocantiere (per account se c'è il database, altrimenti per nome). */
  const capi = useMemo(() => {
    const perUtente = new Map<string, string>();
    for (const [profilo, utente] of Object.entries(serverQ.data?.utenti ?? {})) perUtente.set(utente, profilo);
    const perNome = new Map(personeBase.map(({ p }) => [chiaveNome(p.nome, p.cognome), p.id]));
    const out = new Map<string, string>();
    for (const r of capiQ.data ?? []) {
      const id = perUtente.get(r.user_id) ?? perNome.get(chiaveNome(r.profile?.first_name, r.profile?.last_name));
      if (id) out.set(r.order_id, id);
    }
    return out;
  }, [capiQ.data, serverQ.data, personeBase]);
  /** hr_profili.id → account (solo col database: serve a «rendi capocantiere della commessa»). */
  const utenteDi = useMemo(() => new Map(Object.entries(serverQ.data?.utenti ?? {})), [serverQ.data]);
  const server = serverQ.data ?? null;
  const esterni = useMemo(() => esterniQ.data ?? [], [esterniQ.data]);
  const merce = useMemo(() => merceQ.data ?? [], [merceQ.data]);
  return { companyId, persone, squadre, mezzi, esterni, merce, capi, utenteDi, conAbilitazioni: !!extraQ.data, conCosti: !!extraQ.data && [...extraQ.data.values()].some((x) => x.costoOrario != null), commesse, uscite, caricamento, errore, server, nelDatabase: !serverQ.isLoading && !!serverQ.data };
}

const CHIAVE_BOZZA = (companyId: string, giorno: string) => `programmazione:${companyId}:${giorno}`;

/** Scrive la bozza di un giorno (per «Ripeti nei prossimi giorni»). */
export function salvaBozza(companyId: string, g: Giornata) {
  try { localStorage.setItem(CHIAVE_BOZZA(companyId, g.giorno), JSON.stringify(g)); } catch { /* spazio pieno */ }
}

export function leggiBozza(companyId: string | null, giorno: string): Giornata | null {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(CHIAVE_BOZZA(companyId, giorno));
    if (!raw) return null;
    const g = JSON.parse(raw) as Giornata;
    return g && Array.isArray(g.interventi) ? g : null;
  } catch {
    return null;
  }
}

/**
 * La giornata in preparazione: se c'è una bozza la riprende, altrimenti parte
 * dalla proposta (squadre + commesse in calendario). Ogni modifica si salva
 * nel browser, così un ricarico non fa perdere il lavoro.
 */
export type StatoSalvataggio = "salvato" | "in_corso" | "errore" | "conflitto";

export function useBozzaGiornata(giorno: string) {
  const dati = useDatiGiornata(giorno);
  const { companyId, caricamento, server, nelDatabase } = dati;
  const qc = useQueryClient();
  const chiave = `${companyId ?? ""}:${giorno}`;
  // La storia (annulla / rifai) sta nello stato stesso: una modifica = una voce.
  const [stato, setStato] = useState<{ chiave: string; g: Giornata; daBozza: boolean; passato: Giornata[]; futuro: Giornata[] } | null>(null);
  const [salvataggio, setSalvataggio] = useState<StatoSalvataggio>("salvato");
  const [pubblicando, setPubblicando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daSalvare = useRef<Giornata | null>(null);
  const catena = useRef<Promise<unknown>>(Promise.resolve());

  const proposta = useMemo(
    () => (caricamento ? null : proponiGiornata({ giorno, commesse: dati.commesse, persone: dati.persone, squadre: dati.squadre, mezzi: dati.mezzi, uscite: dati.uscite, capi: dati.capi })),
    [caricamento, giorno, dati.commesse, dati.persone, dati.squadre, dati.mezzi, dati.uscite, dati.capi],
  );
  // Finché non si tocca niente: quella nel database, altrimenti la bozza del browser, altrimenti la proposta.
  const bozza = useMemo(() => leggiBozza(companyId, giorno), [companyId, giorno]);
  const dalServer: Giornata | null = server?.esiste ? { giorno, interventi: server.interventi, parziale: server.completa === false } : null;
  const salvata = dalServer ?? bozza;
  // Una giornata preparata solo in parte (da «fisso fino a fine lavori») si completa con la proposta.
  const iniziale = proposta ? (salvata ? (salvata.parziale ? completaConProposta(salvata, proposta) : salvata) : proposta) : null;
  const mia = stato?.chiave === chiave ? stato : null;
  const giornata = mia ? mia.g : iniziale;
  const daBozza = mia ? mia.daBozza : !!(salvata && !salvata.parziale);

  /** Manda al database l'ultima versione, una richiesta alla volta. */
  const salvaOra = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const g = daSalvare.current;
    daSalvare.current = null;
    if (!g || !companyId) return catena.current;
    const chiaveQ = chiaveServer(companyId, g.giorno);
    catena.current = catena.current.then(async () => {
      setSalvataggio("in_corso");
      const prima = qc.getQueryData<GiornataServer | null>(chiaveQ);
      const { data, error } = await dbLibero.rpc("programmazione_salva", {
        p_company_id: companyId, p_giorno: g.giorno, p_interventi: g.interventi, p_versione: prima?.versione ?? 0, p_completa: !g.parziale,
      });
      if (error) {
        setSalvataggio(error.code === "40001" ? "conflitto" : "errore");
        throw error;
      }
      qc.setQueryData<GiornataServer | null>(chiaveQ, (x) => x ? { ...x, esiste: true, completa: !g.parziale, versione: data as number, interventi: g.interventi, modificata_dopo: x.stato === "pubblicata" } : x);
      setSalvataggio("salvato");
      void qc.invalidateQueries({ queryKey: ["programmazione", "riepilogo"] });
    }).catch((): undefined => undefined);
    return catena.current;
  }, [companyId, qc]);

  const persisti = useCallback((g: Giornata) => {
    if (!companyId) return;
    try { localStorage.setItem(CHIAVE_BOZZA(companyId, giorno), JSON.stringify(g)); } catch { /* spazio pieno: resta in memoria */ }
    if (nelDatabase) {
      daSalvare.current = g;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void salvaOra(); }, 700);
    }
  }, [companyId, giorno, nelDatabase, salvaOra]);

  const cambia = useCallback((f: (g: Giornata) => Giornata) => {
    setStato((s) => {
      const mio = s?.chiave === chiave ? s : null;
      const base = mio ? mio.g : iniziale;
      if (!base || !companyId) return s;
      const g = f(base);
      if (g === base) return s;
      persisti(g);
      return { chiave, g, daBozza: true, passato: [...(mio?.passato ?? []), base].slice(-60), futuro: [] };
    });
  }, [chiave, companyId, iniziale, persisti]);

  const annulla = useCallback(() => {
    setStato((s) => {
      if (!s || s.chiave !== chiave || s.passato.length === 0) return s;
      const g = s.passato[s.passato.length - 1];
      persisti(g);
      return { ...s, g, passato: s.passato.slice(0, -1), futuro: [s.g, ...s.futuro].slice(0, 60) };
    });
  }, [chiave, persisti]);

  const rifai = useCallback(() => {
    setStato((s) => {
      if (!s || s.chiave !== chiave || s.futuro.length === 0) return s;
      const g = s.futuro[0];
      persisti(g);
      return { ...s, g, passato: [...s.passato, s.g], futuro: s.futuro.slice(1) };
    });
  }, [chiave, persisti]);

  const ricominciaDallaProposta = useCallback(() => {
    if (!companyId || !proposta) return;
    localStorage.removeItem(CHIAVE_BOZZA(companyId, giorno));
    setStato((s) => ({ chiave, g: proposta, daBozza: false, passato: s?.chiave === chiave ? [...s.passato, s.g] : giornata ? [giornata] : [], futuro: [] }));
    if (nelDatabase) { daSalvare.current = proposta; void salvaOra(); }
  }, [chiave, companyId, giorno, proposta, nelDatabase, salvaOra, giornata]);

  /** Riprende la giornata dal database (dopo un conflitto). */
  const ricarica = useCallback(async () => {
    daSalvare.current = null;
    setStato(null);
    setSalvataggio("salvato");
    await qc.invalidateQueries({ queryKey: chiaveServer(companyId, giorno) });
  }, [qc, companyId, giorno]);

  /** Pubblica: prima salva quello che manca, poi accessi e notifiche. */
  const pubblica = useCallback(async (): Promise<{ accessi: number; avvisati: number; tolti: number; senza_app: number; persone: number } | null> => {
    if (!companyId || !nelDatabase || !giornata) return null;
    setPubblicando(true);
    try {
      if (!server?.esiste && !daSalvare.current && !mia) daSalvare.current = giornata;
      await salvaOra();
      const chiaveQ = chiaveServer(companyId, giorno);
      const versione = qc.getQueryData<GiornataServer | null>(chiaveQ)?.versione ?? 0;
      const { data, error } = await dbLibero.rpc("programmazione_pubblica", { p_company_id: companyId, p_giorno: giorno, p_versione: versione });
      if (error) throw error;
      qc.setQueryData<GiornataServer | null>(chiaveQ, (x) => x ? { ...x, stato: "pubblicata", modificata_dopo: false, pubblicata_at: new Date().toISOString() } : x);
      void qc.invalidateQueries({ queryKey: ["programmazione", "riepilogo"] });
      return data;
    } finally {
      setPubblicando(false);
    }
  }, [companyId, nelDatabase, giornata, server?.esiste, mia, salvaOra, qc, giorno]);

  /** Un altro giorno già preparato (per «Copia il giorno prima»): dal database o dal browser. */
  const leggiGiorno = useCallback(async (altro: string): Promise<Giornata | null> => {
    if (!companyId) return null;
    if (nelDatabase && !programmazioneAssente()) {
      const { data, error } = await dbLibero.rpc("programmazione_leggi", { p_company_id: companyId, p_giorno: altro });
      if (!error && (data as GiornataServer)?.esiste) return { giorno: altro, interventi: (data as GiornataServer).interventi, parziale: (data as GiornataServer).completa === false };
    }
    return leggiBozza(companyId, altro);
  }, [companyId, nelDatabase]);

  /** «Ripeti nei prossimi giorni»: scrive gli altri giorni (sostituendoli). */
  const salvaAltriGiorni = useCallback(async (giornate: Giornata[]) => {
    if (!companyId) return;
    for (const g of giornate) {
      salvaBozza(companyId, g);
      if (nelDatabase) {
        const { error } = await dbLibero.rpc("programmazione_salva", { p_company_id: companyId, p_giorno: g.giorno, p_interventi: g.interventi, p_versione: null, p_completa: !g.parziale });
        if (error) throw error;
        void qc.invalidateQueries({ queryKey: chiaveServer(companyId, g.giorno) });
      }
    }
    void qc.invalidateQueries({ queryKey: ["programmazione", "preparata"] });
  }, [companyId, nelDatabase, qc]);

  const puoAnnullare = (mia?.passato.length ?? 0) > 0;
  const puoRifare = (mia?.futuro.length ?? 0) > 0;
  return { ...dati, giornata, daBozza, cambia, ricominciaDallaProposta, salvataggio, pubblica, pubblicando, ricarica, leggiGiorno, salvaAltriGiorni, annulla, rifai, puoAnnullare, puoRifare };
}

/**
 * Il meteo del giorno per ogni punto della giornata (open-meteo, come il
 * calendario). Punti vicini (~1 km) condividono la richiesta. Solo da oggi a
 * 16 giorni: oltre non ci sono previsioni.
 */
export function useMeteoPunti(punti: Punto[], giorno: string): Map<string, WeatherDay> {
  const oggi = oggiRoma();
  const attivo = siteForecastAvailable(giorno, oggi);
  const chiavi = [...new Set(punti.map(chiaveMeteo))].slice(0, 30);
  const risposte = useQueries({
    queries: chiavi.map((k) => ({
      queryKey: ["programmazione", "meteo", k, oggi],
      enabled: attivo,
      staleTime: 30 * 60_000,
      retry: 1,
      meta: { silent: true },
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const [lat, lng] = k.split(",");
        const params = new URLSearchParams({
          latitude: lat, longitude: lng, timezone: "Europe/Rome", forecast_days: String(SITE_WEATHER_DAYS),
          daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
        });
        const r = await fetchWithTimeout("https://api.open-meteo.com/v1/forecast?" + params.toString(), { signal, timeoutMs: 12_000, context: "weather.programmazione" });
        if (!r.ok) throw new Error("Meteo non disponibile");
        return readSiteForecast(await r.json());
      },
    })),
  });
  const out = new Map<string, WeatherDay>();
  chiavi.forEach((k, idx) => {
    const d = risposte[idx]?.data?.get(giorno);
    if (d) out.set(k, d);
  });
  return out;
}

export function chiaveMeteo(p: Punto): string {
  return `${Math.round(p.lat * 100) / 100},${Math.round(p.lng * 100) / 100}`;
}


/**
 * Più giorni insieme (vista settimana): dal database se c'è, altrimenti dal
 * browser. Un giorno mai preparato è null.
 */
export function useGiornatePreparate(companyId: string | null, giorni: string[], nelDatabase: boolean) {
  const r = useQueries({
    queries: giorni.map((g) => ({
      queryKey: ["programmazione", "preparata", companyId, g, nelDatabase],
      enabled: !!companyId,
      staleTime: 15_000,
      queryFn: async (): Promise<Giornata | null> => {
        if (nelDatabase && !programmazioneAssente()) {
          const { data, error } = await dbLibero.rpc("programmazione_leggi", { p_company_id: companyId, p_giorno: g });
          if (!error && (data as GiornataServer)?.esiste) return { giorno: g, interventi: (data as GiornataServer).interventi, parziale: (data as GiornataServer).completa === false };
        }
        return leggiBozza(companyId, g);
      },
    })),
  });
  return giorni.map((g, k) => ({ giorno: g, giornata: r[k]?.data ?? null, caricamento: !!r[k]?.isLoading }));
}
