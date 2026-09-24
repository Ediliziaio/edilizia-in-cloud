/**
 * Revoca delle sessioni: si chiude l'accesso vero, non solo la riga.
 *
 * Fino al 24/09/2026 revoke-user-session segnava come terminata la riga di
 * user_sessions e basta: auth.sessions restava, l'app rinnovava il token e la
 * persona restava dentro mentre l'amministratore leggeva «Terminata». Ora la
 * revoca passa da `chiudi_accessi_utente` (migrazione 20280924233000), che
 * cancella l'accesso — come il logout di GoTrue — e segna le righe nella
 * stessa transazione.
 *
 * - Una riga collegata a un accesso (`auth_session_id`) chiude quel solo
 *   accesso: il dispositivo, con tutte le sue schede.
 * - Una riga non collegata (di prima del 24/09) non dice quale dispositivo sia:
 *   si chiudono tutti gli accessi della persona, e la risposta lo dichiara
 *   (`tutti_i_dispositivi`). Meglio uno di troppo che uno che resta dentro.
 *
 * Qui non si importa `auth.ts` (che tira dentro supabase-js da esm.sh): la
 * verifica di appartenenza arriva da fuori, così i test la sostituiscono.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'accesso (auth.sessions.id) scritto nel token: il claim `session_id`.
 * Non verifica la firma: va chiamata DOPO requireAuth, che l'ha già fatto.
 */
export function idAccessoDalToken(authorization: string | null | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const payload = authorization.slice("Bearer ".length).split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const id = claims?.session_id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export interface RichiestaRevoca {
  session_id?: unknown;
  revoke_all_for_user?: unknown;
  reason?: unknown;
}

export interface EsitoRevoca {
  status: number;
  corpo: Record<string, unknown>;
}

/** La persona lavora (ancora) in quell'azienda? In produzione è `aziendaAccessibile`. */
export type Appartiene = (utenteId: string, aziendaId: string) => Promise<boolean>;

export async function revocaSessioni(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  attoreId: string,
  richiesta: RichiestaRevoca,
  appartiene: Appartiene,
): Promise<EsitoRevoca> {
  const motivo = typeof richiesta.reason === "string" && richiesta.reason.trim()
    ? richiesta.reason.trim()
    : "Revoked by admin";

  const { data: attore } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", attoreId)
    .single();
  const aziendaId: string | null = attore?.company_id ?? null;
  if (!aziendaId) return { status: 400, corpo: { error: "No company found" } };

  let utenteId: string;
  let rigaId: string | null = null;
  let accesso: string | null = null;

  if (richiesta.revoke_all_for_user) {
    utenteId = String(richiesta.revoke_all_for_user);
  } else if (richiesta.session_id) {
    rigaId = String(richiesta.session_id);
    const { data: riga } = await supabaseAdmin
      .from("user_sessions")
      .select("id, user_id, company_id, auth_session_id")
      .eq("id", rigaId)
      .eq("is_active", true)
      .maybeSingle();
    if (!riga || riga.company_id !== aziendaId) {
      return { status: 404, corpo: { error: "Session not found" } };
    }
    utenteId = riga.user_id;
    accesso = riga.auth_session_id ?? null;
  } else {
    return { status: 400, corpo: { error: "session_id or revoke_all_for_user required" } };
  }

  // L'accesso è della persona, non dell'azienda: chiuderlo la butta fuori da
  // tutte le aziende in cui lavora. Può farlo solo chi amministra un'azienda
  // di cui fa parte adesso — prima bastava conoscere il suo id: le righe
  // erano filtrate per azienda, ma la revoca non toccava niente di vero.
  if (!(await appartiene(utenteId, aziendaId))) {
    return {
      status: 403,
      corpo: { error: "Questa persona non fa parte della tua azienda: il suo accesso non si chiude da qui." },
    };
  }

  const { data: esito, error } = await supabaseAdmin.rpc("chiudi_accessi_utente", {
    p_user_id: utenteId,
    p_auth_session_id: accesso,
    p_company_id: aziendaId,
    p_revocata_da: attoreId,
    p_motivo: motivo,
  });
  if (error) throw error;

  const righe = Number(esito?.righe_chiuse ?? 0);
  const accessi = Number(esito?.accessi_chiusi ?? 0);
  const tuttiIDispositivi = accesso === null;

  await supabaseAdmin.from("user_audit_log").insert({
    company_id: aziendaId,
    actor_id: attoreId,
    target_user_id: utenteId,
    action: rigaId ? "session_revoked" : "all_sessions_revoked",
    details: rigaId
      ? { session_id: rigaId, reason: motivo, auth_session_id: accesso, tutti_i_dispositivi: tuttiIDispositivi, accessi_chiusi: accessi }
      : { reason: motivo, revoked_count: righe, accessi_chiusi: accessi },
  });

  return {
    status: 200,
    corpo: { ok: true, revoked_count: righe, accessi_chiusi: accessi, tutti_i_dispositivi: tuttiIDispositivi },
  };
}
