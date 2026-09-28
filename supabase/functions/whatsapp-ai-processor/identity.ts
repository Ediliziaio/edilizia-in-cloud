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
import {
  chiaveTelefono,
  eUtenteInterno,
  stessoTelefono,
  tipoUtenteBot,
  type TipoUtenteBot,
} from "../_shared/botOperativoRuoli.ts";

export interface ResolvedIdentity {
  matched: boolean;
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
  "cantieri.list_assigned",
  "cantieri.read_assigned",
  "spese.write",
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
];

/** Cose d'ufficio del bot (oltre agli strumenti di Silvio): PDF del preventivo e preventivo col motore listino+manodopera. */
const GRANTS_UFFICIO = ["preventivi.pdf", "preventivi.ai"];

/** Ufficio e admin fanno anche tutto quello che fa un operaio. */
function grantsPer(tipo: TipoUtenteBot): string[] {
  if (tipo === "admin") return [...GRANTS_OPERAIO, ...GRANTS_UFFICIO, ...GRANTS_TITOLARE];
  if (tipo === "ufficio") return [...GRANTS_OPERAIO, ...GRANTS_UFFICIO];
  return GRANTS_OPERAIO;
}

function unknownResult(companyId: string): ResolvedIdentity {
  return {
    matched: false,
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

function riconosciuto(
  companyId: string,
  tipo: TipoUtenteBot,
  dati: { user_id: string | null; employee_id: string | null; display_name: string; ruoli: string[] },
): ResolvedIdentity {
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
    role_grants: grantsPer(tipo),
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
  if (!chiaveTelefono(fromPhone)) return unknownResult(companyId);

  // 1) Dipendente col telefono.
  const { data: employees } = await supabase
    .from("employees")
    .select("id, user_id, first_name, last_name, phone_whatsapp, phone")
    .eq("company_id", companyId)
    .eq("is_active", true);
  const dip = (employees ?? []).find((e) =>
    stessoTelefono(e.phone_whatsapp, fromPhone) || stessoTelefono(e.phone, fromPhone)
  );
  if (dip) {
    const ruoli = dip.user_id ? await ruoliNellAzienda(supabase, dip.user_id, companyId) : [];
    return riconosciuto(companyId, tipoUtenteBot(ruoli, !!dip.user_id), {
      user_id: dip.user_id,
      employee_id: dip.id,
      display_name: `${dip.first_name ?? ""} ${dip.last_name ?? ""}`.trim() || "Operaio",
      ruoli,
    });
  }

  // 2) Utente dell'app col telefono nel profilo (i clienti hanno un profilo
  //    anche loro: senza un ruolo interno qui non entrano).
  const { data: profili } = await supabase
    .from("profiles")
    .select("id, phone, first_name, last_name, full_name")
    .eq("company_id", companyId)
    .not("phone", "is", null);
  const prof = (profili ?? []).find((p) => stessoTelefono(p.phone, fromPhone));
  if (prof) {
    const ruoli = await ruoliNellAzienda(supabase, prof.id, companyId);
    if (eUtenteInterno(ruoli)) {
      return riconosciuto(companyId, tipoUtenteBot(ruoli, true), {
        user_id: prof.id,
        employee_id: null,
        display_name: prof.full_name || `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Utente",
        ruoli,
      });
    }
  }

  return unknownResult(companyId);
}
