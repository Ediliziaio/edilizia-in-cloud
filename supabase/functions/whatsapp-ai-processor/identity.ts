// Chi sta scrivendo al bot operativo (27/09/2026).
//
// 1) Dipendente col telefono (employees.phone_whatsapp | phone): se ha un
//    account, i suoi ruoli in QUESTA azienda decidono operaio/ufficio/admin.
// 2) Utente dell'app col telefono nel profilo, senza scheda dipendente
//    (tipico: il titolare, l'impiegata): serve un ruolo interno qui.
// Prima si cercavano ruoli inesistenti (titolare, admin, proprietario) e un
// company_admin non veniva mai riconosciuto.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ruoliNellAzienda } from "../_shared/amministraAzienda.ts";
import { ruoloPrincipaleSilvio } from "../_shared/ruoloSilvio.ts";
import { numeroWhatsAppOperativo } from "../_shared/telefonoE164.ts";
import {
  eUtenteInterno,
  tipoUtenteBot,
  type TipoUtenteBot,
} from "../_shared/botOperativoRuoli.ts";

export interface ResolvedIdentity {
  matched: boolean;
  negata?: boolean;
  solaLettura?: boolean;
  soloMieiMagazzini?: boolean;
  kind: TipoUtenteBot | "unknown";
  user_id: string | null;
  employee_id: string | null;
  display_name: string | null;
  role_grants: string[];
  /** Il ruolo con cui lo trattano gli strumenti di Silvio; null = nessun account. */
  ruolo_silvio: string | null;
  company_id: string;
  locale: "it" | "en";
}

const GRANTS_OPERAIO = [
  "rapportino.write",
  "rapportino.read_own",
  "ddt.write",
  "foto.write",
  "presenze.write",
  "segnalazione.write",
  "attivita_ufficio.write",
  "cantieri.list_assigned",
  "cantieri.read_assigned",
  "spese.write",
  "fasi.write",
];

const GRANTS_TITOLARE = [
  "cantieri.read_all",
  "cantieri.list_all",
  "marginalita.read",
  "fatture.read",
  "scadenze.read",
  "costi.read",
  "rapportini.read_all",
  "ddt.read_all",
  "approvazioni.list",
  "approvazioni.write",
  "fatture.assegna",
];

/** Cose d'ufficio del bot (oltre agli strumenti di Silvio): PDF del preventivo e preventivo col motore listino+manodopera. */
const GRANTS_UFFICIO = ["preventivi.pdf", "preventivi.ai"];

/** Ufficio e admin fanno anche tutto quello che fa un operaio. */
function grantsPer(tipo: TipoUtenteBot): string[] {
  if (tipo === "admin") return [...GRANTS_OPERAIO, ...GRANTS_UFFICIO, ...GRANTS_TITOLARE];
  if (tipo === "ufficio") return [...GRANTS_OPERAIO, ...GRANTS_UFFICIO];
  return GRANTS_OPERAIO;
}

function unknownResult(companyId: string, negata = false): ResolvedIdentity {
  return {
    matched: false,
    negata,
    kind: "unknown",
    user_id: null,
    employee_id: null,
    display_name: null,
    role_grants: [],
    ruolo_silvio: null,
    company_id: companyId,
    locale: "it",
  };
}

const DIMENSIONE_PAGINA = 250;

async function trovaIdentitaTelefoniche<T extends { id: string }>(
  leggi: (dopo: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
  combacia: (riga: T) => boolean,
  errore: string,
): Promise<T[]> {
  const corrispondenze: T[] = [];
  let dopo: string | null = null;
  do {
    const { data, error } = await leggi(dopo);
    if (error) throw new Error(errore);
    const pagina = data ?? [];
    corrispondenze.push(...pagina.filter(combacia));
    dopo = pagina.length === DIMENSIONE_PAGINA ? pagina[pagina.length - 1].id : null;
  } while (dopo && corrispondenze.length < 2);
  return corrispondenze;
}

async function riconosciuto(
  db: SupabaseClient,
  companyId: string,
  tipo: TipoUtenteBot,
  dati: { user_id: string | null; employee_id: string | null; display_name: string; ruoli: string[] },
): Promise<ResolvedIdentity> {
  let solaLettura = false;
  let soloMieiMagazzini = false;
  const grants = grantsPer(tipo);
  if (tipo !== "admin" && dati.user_id) {
    const { data, error } = await db.from("staff_permissions").select("sola_lettura, only_my_warehouse, can_view_billing")
      .eq("user_id", dati.user_id).eq("company_id", companyId).maybeSingle();
    if (error) throw new Error("identity_permissions_lookup_unavailable");
    solaLettura = data?.sola_lettura === true;
    soloMieiMagazzini = data?.only_my_warehouse === true;
    if (tipo === "ufficio" && data?.can_view_billing === true) grants.push("fatture.read");
  }
  if (tipo === "admin") {
    console.warn(
      "[whatsapp-identity][SECURITY] poteri ADMIN concessi dal numero di telefono",
      JSON.stringify({ company_id: companyId, user_id: dati.user_id, employee_id: dati.employee_id }),
    );
  }
  return {
    matched: true,
    kind: tipo,
    user_id: dati.user_id,
    employee_id: dati.employee_id,
    display_name: dati.display_name,
    role_grants: grants.filter(g => (g !== "attivita_ufficio.write" || !!dati.user_id) &&
      (!solaLettura || !/\.write$|\.assegna$|^preventivi\./.test(g))),
    solaLettura,
    soloMieiMagazzini,
    ruolo_silvio: dati.ruoli.length > 0 ? ruoloPrincipaleSilvio(dati.ruoli) : null,
    company_id: companyId,
    locale: "it",
  };
}

export async function resolveIdentity(
  supabase: SupabaseClient,
  fromPhone: string,
  companyId: string,
): Promise<ResolvedIdentity> {
  const mittente = fromPhone.replace(/^\+/, "");
  if (!/^[1-9]\d{7,14}$/.test(mittente)) return unknownResult(companyId);
  const corrisponde = (telefono: string | null | undefined) => numeroWhatsAppOperativo(telefono) === mittente;

  const matches = await trovaIdentitaTelefoniche(dopo => {
    const query = supabase.from("employees").select("id, user_id, first_name, last_name, phone_whatsapp, phone, is_active")
      .eq("company_id", companyId).order("id").limit(DIMENSIONE_PAGINA);
    return dopo ? query.gt("id", dopo) : query;
  }, e => corrisponde(e.phone_whatsapp) || corrisponde(e.phone), "identity_employee_lookup_unavailable");
  if (matches.length > 1) return unknownResult(companyId, true);
  const dip = matches[0];
  if (dip?.is_active === false) return unknownResult(companyId, true);
  const profileMatches = await trovaIdentitaTelefoniche(dopo => {
    const query = supabase.from("profiles").select("id, phone, first_name, last_name, is_blocked")
      .eq("company_id", companyId).not("phone", "is", null).order("id").limit(DIMENSIONE_PAGINA);
    return dopo ? query.gt("id", dopo) : query;
  }, p => corrisponde(p.phone), "identity_profile_lookup_unavailable");
  if (profileMatches.length > 1) return unknownResult(companyId, true);
  const prof = profileMatches[0];
  if (prof?.is_blocked) return unknownResult(companyId, true);
  if (dip) {
    if (prof && prof.id !== dip.user_id) return unknownResult(companyId, true);
    const ruoli = dip.user_id ? await ruoliNellAzienda(supabase, dip.user_id, companyId) : [];
    if (dip.user_id && !eUtenteInterno(ruoli)) return unknownResult(companyId, true);
    return riconosciuto(supabase, companyId, tipoUtenteBot(ruoli, !!dip.user_id), {
      user_id: dip.user_id,
      employee_id: dip.id,
      display_name: `${dip.first_name ?? ""} ${dip.last_name ?? ""}`.trim() || "Operaio",
      ruoli,
    });
  }

  if (prof) {
    const ruoli = await ruoliNellAzienda(supabase, prof.id, companyId);
    if (eUtenteInterno(ruoli)) {
      return riconosciuto(supabase, companyId, tipoUtenteBot(ruoli, true), {
        user_id: prof.id,
        employee_id: null,
        display_name: `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Utente",
        ruoli,
      });
    }
  }

  return unknownResult(companyId);
}
