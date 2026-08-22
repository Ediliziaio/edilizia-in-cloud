// ============================================================================
// useCostiPersonale — costo del personale mese per mese, per dipendente
// ============================================================================
// Incrocia due fonti:
//   - employees (contratto): stipendio lordo, oneri INPS, ore contrattuali
//   - campo_rapportini (lavoro reale): ore lavorate, straordinari, commesse
// Il link è employees.user_id ↔ campo_rapportini.user_id. I rapportini di
// utenti senza scheda dipendente finiscono in "altriOperatori" (visibili ma
// senza costo, perché non abbiamo il loro contratto).
//
// Costo orario aziendale = (lordo + oneri INPS) / ore contrattuali mese.
// Costo effettivo mese  = lordo + oneri + straordinari × costo orario
// (stima prudente: SENZA maggiorazione CCNL, dichiarato in UI).
// ============================================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { costoOrarioDipendente, oreContrattualiMese } from "@/lib/costoOrarioDipendente";

// Ore contrattuali di fallback (CCNL edilizia ~40h/sett ≈ 173 h/mese)
const DEFAULT_MONTHLY_HOURS = 173;
const DEFAULT_INPS_RATE = 28;

export interface RapportinoGiorno {
  id: string;
  data_lavoro: string;
  ore_lavorate: number;
  ore_straordinario: number;
  descrizione_lavori: string | null;
  stato: string;
  orderId: string | null;
  orderCode: string | null;
}

export interface CommessaLavorata {
  orderId: string;
  orderCode: string;
  ore: number;
  oreStraordinario: number;
  giorni: number;
}

export interface DipendenteMese {
  employeeId: string;
  nome: string;
  qualifica: string | null;
  livello: string | null;
  /** Stipendio lordo mensile da contratto */
  lordoMensile: number;
  /** Oneri contributivi stimati (lordo × inps_rate) */
  oneriMensili: number;
  inpsRate: number;
  /** Ore contrattuali del mese (monthly_hours o fallback) */
  oreContrattuali: number;
  /** Costo orario aziendale = (lordo+oneri)/ore contrattuali */
  costoOrario: number;
  /** Ore ordinarie registrate nei rapportini del mese */
  oreLavorate: number;
  /** Ore di straordinario registrate nei rapportini del mese */
  oreStraordinario: number;
  /** Stima costo straordinari (ore × costo orario, senza maggiorazione CCNL) */
  costoStraordinari: number;
  /** Costo effettivo mese = lordo + oneri + straordinari stimati */
  costoEffettivo: number;
  /** Saturazione = ore lavorate (ord+str) / ore contrattuali, 0..n */
  saturazione: number;
  giorniLavorati: number;
  commesse: CommessaLavorata[];
  rapportini: RapportinoGiorno[];
  /** true se il dipendente non ha un utente collegato → ore non tracciabili */
  senzaUtente: boolean;
}

export interface OperatoreEsterno {
  userId: string;
  nome: string;
  oreLavorate: number;
  oreStraordinario: number;
  giorniLavorati: number;
  commesse: CommessaLavorata[];
  rapportini: RapportinoGiorno[];
}

export interface CostiPersonaleTotali {
  costoTotale: number;
  lordoTotale: number;
  oneriTotali: number;
  costoStraordinari: number;
  oreLavorate: number;
  oreStraordinario: number;
  dipendentiAttivi: number;
  dipendentiConOre: number;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  qualifica: string | null;
  livello_inquadramento: string | null;
  gross_salary: number;
  inps_rate: number | null;
  monthly_hours: number;
  ore_settimana: number | null;
  costo_orario: number | null;
  user_id: string | null;
  is_active: boolean;
}

interface RapportinoRow {
  id: string;
  user_id: string;
  order_id: string | null;
  data_lavoro: string;
  ore_lavorate: number | null;
  ore_straordinario: number | null;
  descrizione_lavori: string | null;
  stato: string;
  autore: { first_name: string | null; last_name: string | null } | null;
  order: { id: string; order_code: string | null } | null;
}

function aggregaCommesse(rapportini: RapportinoGiorno[]): CommessaLavorata[] {
  const byOrder = new Map<string, CommessaLavorata & { giorniSet: Set<string> }>();
  for (const r of rapportini) {
    const key = r.orderId ?? "__senza_commessa__";
    let entry = byOrder.get(key);
    if (!entry) {
      entry = {
        orderId: r.orderId ?? key,
        orderCode: r.orderCode ?? "Senza commessa",
        ore: 0,
        oreStraordinario: 0,
        giorni: 0,
        giorniSet: new Set<string>(),
      };
      byOrder.set(key, entry);
    }
    entry.ore += r.ore_lavorate;
    entry.oreStraordinario += r.ore_straordinario;
    entry.giorniSet.add(r.data_lavoro);
  }
  return Array.from(byOrder.values())
    .map(({ giorniSet, ...rest }) => ({ ...rest, giorni: giorniSet.size }))
    .sort((a, b) => b.ore + b.oreStraordinario - (a.ore + a.oreStraordinario));
}

export function useCostiPersonale(companyId: string | undefined, month: Date) {
  const monthKey = format(month, "yyyy-MM");
  const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

  const employeesQuery = useQuery({
    queryKey: ["costi-personale-employees", companyId],
    queryFn: async (): Promise<EmployeeRow[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, first_name, last_name, qualifica, livello_inquadramento, gross_salary, inps_rate, monthly_hours, ore_settimana, costo_orario, user_id, is_active",
        )
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const rapportiniQuery = useQuery({
    queryKey: ["costi-personale-rapportini", companyId, monthKey],
    queryFn: async (): Promise<RapportinoRow[]> => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select(
          // NB: profiles va disambiguato per FK (user_id vs approvato_da),
          // altrimenti PostgREST rifiuta l'embed ("more than one relationship").
          "id, user_id, order_id, data_lavoro, ore_lavorate, ore_straordinario, descrizione_lavori, stato, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name), order:orders(id, order_code)",
        )
        .eq("company_id", companyId!)
        .gte("data_lavoro", monthStart)
        .lte("data_lavoro", monthEnd)
        .neq("stato", "rifiutato")
        .order("data_lavoro", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as RapportinoRow[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const rapportiniRaw = useMemo(() => rapportiniQuery.data ?? [], [rapportiniQuery.data]);

  const { dipendenti, altriOperatori, totali } = useMemo(() => {
    // Rapportini normalizzati + indicizzati per user_id
    const byUser = new Map<string, RapportinoGiorno[]>();
    const nomiByUser = new Map<string, string>();
    for (const r of rapportiniRaw) {
      const norm: RapportinoGiorno = {
        id: r.id,
        data_lavoro: r.data_lavoro,
        ore_lavorate: Number(r.ore_lavorate) || 0,
        ore_straordinario: Number(r.ore_straordinario) || 0,
        descrizione_lavori: r.descrizione_lavori,
        stato: r.stato,
        orderId: r.order?.id ?? r.order_id ?? null,
        orderCode: r.order?.order_code ?? null,
      };
      const list = byUser.get(r.user_id) ?? [];
      list.push(norm);
      byUser.set(r.user_id, list);
      if (r.autore) {
        nomiByUser.set(
          r.user_id,
          [r.autore.first_name, r.autore.last_name].filter(Boolean).join(" ") || "Operatore",
        );
      }
    }

    const dipendenti: DipendenteMese[] = employees.map((emp) => {
      const lordo = Number(emp.gross_salary) || 0;
      const inpsRate = Number(emp.inps_rate) || DEFAULT_INPS_RATE;
      const oneri = lordo * (inpsRate / 100);
      const oreContrattuali = oreContrattualiMese(emp);
      // Unica formula, condivisa col database e con le altre schermate: se il
      // dipendente ha una tariffa scritta a mano vince quella, ed è la stessa
      // che finisce nel costo di commessa.
      const costoOrario = costoOrarioDipendente(emp);

      const rapportini = emp.user_id ? (byUser.get(emp.user_id) ?? []) : [];
      if (emp.user_id) byUser.delete(emp.user_id);

      const oreLavorate = rapportini.reduce((s, r) => s + r.ore_lavorate, 0);
      const oreStraordinario = rapportini.reduce((s, r) => s + r.ore_straordinario, 0);
      const giorniLavorati = new Set(rapportini.map((r) => r.data_lavoro)).size;
      const costoStraordinari = oreStraordinario * costoOrario;
      const costoEffettivo = lordo + oneri + costoStraordinari;

      return {
        employeeId: emp.id,
        nome: `${emp.first_name} ${emp.last_name}`.trim(),
        qualifica: emp.qualifica,
        livello: emp.livello_inquadramento,
        lordoMensile: lordo,
        oneriMensili: oneri,
        inpsRate,
        oreContrattuali,
        costoOrario,
        oreLavorate,
        oreStraordinario,
        costoStraordinari,
        costoEffettivo,
        saturazione: oreContrattuali > 0 ? (oreLavorate + oreStraordinario) / oreContrattuali : 0,
        giorniLavorati,
        commesse: aggregaCommesse(rapportini),
        rapportini,
        senzaUtente: !emp.user_id,
      };
    });

    // Ordina: prima chi costa di più nel mese
    dipendenti.sort((a, b) => b.costoEffettivo - a.costoEffettivo);

    // Rapportini rimasti = utenti con ore ma senza scheda dipendente
    const altriOperatori: OperatoreEsterno[] = Array.from(byUser.entries())
      .map(([userId, rapportini]) => ({
        userId,
        nome: nomiByUser.get(userId) ?? "Operatore senza scheda",
        oreLavorate: rapportini.reduce((s, r) => s + r.ore_lavorate, 0),
        oreStraordinario: rapportini.reduce((s, r) => s + r.ore_straordinario, 0),
        giorniLavorati: new Set(rapportini.map((r) => r.data_lavoro)).size,
        commesse: aggregaCommesse(rapportini),
        rapportini,
      }))
      .sort((a, b) => b.oreLavorate - a.oreLavorate);

    const totali: CostiPersonaleTotali = {
      costoTotale: dipendenti.reduce((s, d) => s + d.costoEffettivo, 0),
      lordoTotale: dipendenti.reduce((s, d) => s + d.lordoMensile, 0),
      oneriTotali: dipendenti.reduce((s, d) => s + d.oneriMensili, 0),
      costoStraordinari: dipendenti.reduce((s, d) => s + d.costoStraordinari, 0),
      oreLavorate:
        dipendenti.reduce((s, d) => s + d.oreLavorate, 0) +
        altriOperatori.reduce((s, o) => s + o.oreLavorate, 0),
      oreStraordinario:
        dipendenti.reduce((s, d) => s + d.oreStraordinario, 0) +
        altriOperatori.reduce((s, o) => s + o.oreStraordinario, 0),
      dipendentiAttivi: dipendenti.length,
      dipendentiConOre: dipendenti.filter((d) => d.oreLavorate + d.oreStraordinario > 0).length,
    };

    return { dipendenti, altriOperatori, totali };
  }, [employees, rapportiniRaw]);

  return {
    dipendenti,
    altriOperatori,
    totali,
    isLoading: employeesQuery.isLoading || rapportiniQuery.isLoading,
    isError: !!employeesQuery.error || !!rapportiniQuery.error,
    errorMessage:
      employeesQuery.error instanceof Error
        ? employeesQuery.error.message
        : rapportiniQuery.error instanceof Error
          ? rapportiniQuery.error.message
          : null,
    refetch: () => {
      void employeesQuery.refetch();
      void rapportiniQuery.refetch();
    },
  };
}
