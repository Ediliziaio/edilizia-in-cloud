// Propagazione dell'identità dell'operatore verso l'audit del database.
//
// PROBLEMA CHE RISOLVE
// Il trigger `tg_audit_log_row` popola `central_audit_log` leggendo auth.uid().
// Quando la scrittura arriva da una edge function con chiave di servizio —
// cioè in quasi tutte le operazioni amministrative — auth.uid() è NULL: su
// 1.016 righe di audit l'attore risultava presente nel 2,9% degli aggiornamenti
// ai profili e in nessun inserimento, e l'indirizzo IP in zero righe su 1.016.
// L'audit registrava che qualcosa era cambiato, ma non chi l'aveva cambiato.
//
// COME
// PostgREST espone gli header della richiesta HTTP al database come
// `current_setting('request.headers')`. Creando il client admin con questi
// header, il trigger può recuperare l'identità reale quando auth.uid() è nullo.
//
// USO
//   const admin = createAuditedAdminClient(req, callerId, callerEmail);
//   await admin.from("companies").update({...}).eq("id", id);
//
// Per le sessioni di assistenza, `impersonatorId` marca le azioni compiute per
// conto di un altro utente: nell'audit resta traccia di entrambi.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function auditHeaders(
  req: Request,
  actorId: string | null,
  actorEmail?: string | null,
  impersonatorId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (actorId) headers["x-actor-id"] = actorId;
  if (actorEmail) headers["x-actor-email"] = actorEmail;
  if (impersonatorId) headers["x-impersonator-id"] = impersonatorId;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "";
  if (ip) headers["x-actor-ip"] = ip;

  // NON si chiama "user-agent": inoltrare tale e quale l'agente del browser su
  // un client con chiave di SERVIZIO fa scattare la guardia di Supabase
  // («Forbidden use of secret API key in browser»), che quella combinazione la
  // legge come una chiave segreta finita nel client. Il 10 settembre 2026 ha
  // svuotato in silenzio get-settings e stats di manage-super-admins: la
  // pagina WhatsApp Locale non vedeva più né il gateway né i numeri, senza un
  // solo errore a schermo. Il trigger di audit legge questo nome, con ripiego
  // su "user-agent" per le richieste che dal browser arrivano davvero.
  const ua = req.headers.get("user-agent");
  if (ua) headers["x-actor-user-agent"] = ua.substring(0, 300);

  return headers;
}

/**
 * Client con privilegi di servizio che porta con sé l'identità dell'operatore.
 * Da preferire al createClient nudo in ogni edge function che scrive dati
 * amministrativi: è ciò che rende l'audit ricostruibile.
 */
export function createAuditedAdminClient(
  req: Request,
  actorId: string | null,
  actorEmail?: string | null,
  impersonatorId?: string | null,
): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: auditHeaders(req, actorId, actorEmail, impersonatorId) },
    },
  );
}
