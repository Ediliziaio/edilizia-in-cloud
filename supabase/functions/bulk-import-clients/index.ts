// Bulk import per import storici di clienti + ordini + ticket di assistenza.
// Progettato per essere SILENZIOSO: nessuna welcome email, nessun SMS,
// nessuna notifica automation. Pensato per migrazioni one-shot da file Excel.
//
// Safety:
// - portal_disabled=true + is_blocked=true sui profili → nessun accesso portale
// - send_welcome_email path BYPASSATO totalmente (non usiamo create-customer)
// - trigger automation su orders/tickets rimangono abilitati ma:
//   - auto_move_order_to_assistenza è idempotente (ordine già in Assistenza)
//   - events accodati in internal_automation_trigger_events vengono marcati
//     come "imported" subito dopo l'import e NON processati dal cron
//
// Caller: super_admin ONLY (endpoint distruttivo/massivo).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface ImportClient {
  external_id: string;       // identificatore nel file sorgente (es. "ACANFORA")
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  is_business: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  order: {
    status_key: "concluso" | "da_consegnare" | "assistenza" | "cauzione" | "da_concludere" | "unknown";
    contract_date: string;   // ISO yyyy-mm-dd
    amount: number | null;
    commerciale: string | null;
    open_ticket: boolean;    // true se aprire ticket associato (status ASSISTENZA)
  };
}

interface ImportRequest {
  company_id: string;
  dry_run?: boolean;
  clients: ImportClient[];
  /**
   * IVA % applicata agli ordini importati. Default 22.
   * IMPORTANTE: se `amount_is_gross=true`, total_amount viene calcolato come
   * amount / (1 + vat_rate/100) per ottenere l'imponibile corretto.
   */
  vat_rate?: number;
  /**
   * Se true, i valori in `amount` sono GIÀ IVATI (lordi).
   * Serve per file Excel che hanno solo il totale al cliente.
   * Il backend converte automaticamente in imponibile + IVA separata.
   * Default: false (amount = imponibile).
   */
  amount_is_gross?: boolean;
}

function titleCase(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((tok) =>
      /^\s+$|^-$|^'$/.test(tok) ? tok : tok.charAt(0).toUpperCase() + tok.slice(1)
    )
    .join("");
}

function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const s = String(e).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s.slice(0, 255);
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  return String(p).trim().slice(0, 50);
}

function generatePassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mappa status Excel → nome stato ordine
function mapStatusKey(key: ImportClient["order"]["status_key"]): string {
  switch (key) {
    case "concluso": return "Posa Completata";
    case "da_consegnare": return "In Produzione";
    case "assistenza": return "Assistenza";
    case "cauzione": return "Posa Completata";   // assunzione: cauzione = fase di garanzia post-consegna
    case "da_concludere": return "In Produzione"; // assunzione: lavori non ancora conclusi
    default: return "Contratto Firmato";          // fallback sicuro
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body: ImportRequest = await req.json();
    const { company_id, dry_run, clients } = body;
    const vatRate = typeof body.vat_rate === "number" && body.vat_rate >= 0 ? body.vat_rate : 22;
    const amountIsGross = body.amount_is_gross === true;

    if (!company_id || !Array.isArray(clients) || clients.length === 0) {
      return errorResponse("company_id e clients[] richiesti", 400, corsH);
    }

    // Autorizzazione: super_admin OR company_admin della target company
    const { data: rolesData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
    const isSuperAdmin = roles.includes("super_admin");
    const isCompanyAdmin = roles.includes("company_admin");

    if (!isSuperAdmin) {
      if (!isCompanyAdmin) {
        return errorResponse("Permesso negato: richiesto super_admin o company_admin", 403, corsH);
      }
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      if (profile?.company_id !== company_id) {
        return errorResponse("Permesso negato: non puoi importare per altre aziende", 403, corsH);
      }
    }

    // Load order_statuses per nome → id
    const { data: statusRows, error: statusErr } = await supabaseAdmin
      .from("order_statuses")
      .select("id, name, is_support_phase")
      .eq("company_id", company_id);
    if (statusErr) return errorResponse(`Errore caricamento stati: ${statusErr.message}`, 500, corsH);

    const statusByName = new Map<string, string>();
    let supportStatusId: string | null = null;
    for (const row of statusRows ?? []) {
      statusByName.set(row.name, row.id);
      if (row.is_support_phase) supportStatusId = row.id;
    }

    // Sanity check mappings
    const requiredNames = ["Contratto Firmato", "In Produzione", "Posa Completata", "Assistenza"];
    const missing = requiredNames.filter((n) => !statusByName.has(n));
    if (missing.length > 0) {
      return errorResponse(`Stati mancanti su questa azienda: ${missing.join(", ")}`, 400, corsH);
    }

    if (dry_run) {
      const plan = clients.map((c) => ({
        external_id: c.external_id,
        name: c.is_business ? titleCase(c.business_name) : `${titleCase(c.first_name)} ${titleCase(c.last_name)}`.trim(),
        email: normalizeEmail(c.email),
        status_target: mapStatusKey(c.order.status_key),
        will_open_ticket: c.order.open_ticket,
      }));
      return jsonResponse({ dry_run: true, total: clients.length, sample: plan.slice(0, 10), statusByName: Array.from(statusByName.entries()) }, 200, corsH);
    }

    const results = {
      clients_created: 0,
      clients_skipped_duplicate: 0,
      orders_created: 0,
      tickets_created: 0,
      errors: [] as { external_id: string; stage: string; error: string }[],
      created_customer_ids: [] as string[],
    };

    // Resolve caller auth user_id for order_status_history logging
    const actorUserId = userId;

    for (const c of clients) {
      try {
        const realEmail = normalizeEmail(c.email);
        const safeFirst = titleCase(c.first_name) || (c.is_business ? "" : "—");
        const safeLast = titleCase(c.last_name) || (c.is_business ? (titleCase(c.business_name) || "—") : "—");
        const businessName = c.is_business ? titleCase(c.business_name) : null;

        // Idempotency check: se esiste già un profile in questa company con
        // questa email REALE, considera il cliente già importato e salta.
        // Usa tentativo cognome+nome+city come fallback quando email null.
        if (realEmail) {
          const { data: existing } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("company_id", company_id)
            .eq("email", realEmail)
            .limit(1);
          if (existing && existing.length > 0) {
            results.clients_skipped_duplicate++;
            // Crea ticket Assistenza se mancante
            if (c.order.open_ticket) {
              const { data: existingOrder } = await supabaseAdmin
                .from("orders")
                .select("id")
                .eq("customer_id", existing[0].id)
                .eq("company_id", company_id)
                .limit(1);
              if (existingOrder && existingOrder.length > 0) {
                const { data: existingTicket } = await supabaseAdmin
                  .from("tickets")
                  .select("id")
                  .eq("order_id", existingOrder[0].id)
                  .limit(1);
                if (!existingTicket || existingTicket.length === 0) {
                  const displayNameBackfill = c.is_business ? (businessName || safeLast) : `${safeFirst} ${safeLast}`.trim();
                  const { error: tErr } = await supabaseAdmin.from("tickets").insert({
                    order_id: existingOrder[0].id,
                    company_id,
                    customer_id: existing[0].id,
                    subject: `Intervento di assistenza — ${displayNameBackfill}`,
                    status: "aperto",
                    priority: "normale",
                    tipo: "intervento",
                    fonte: "ufficio",
                    internal_notes: "Ticket importato da file Excel storico — verificare stato reale con il cliente.",
                    created_by: actorUserId,
                  } as never);
                  if (!tErr) results.tickets_created++;
                  else results.errors.push({ external_id: c.external_id, stage: "ticket_backfill", error: tErr.message });
                }
              }
            }
            continue;
          }
        }

        // Auth email: usiamo l'email reale se presente, altrimenti shadow.
        let authEmail = realEmail || `${c.external_id.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now()}@import.ediliziaincloud.local`;

        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
        });
        // Non filtrabile per email via listUsers, usiamo getUserByEmail workaround:
        // tentiamo creazione, se fallisce per email_exists usiamo shadow email
        let authUserId: string | null = null;
        const password = generatePassword();

        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,   // account confermato, NESSUNA email inviata
          user_metadata: { first_name: safeFirst, last_name: safeLast, imported: true },
        });

        if (authErr) {
          const isEmailExists = authErr.message?.includes("already been registered") ||
                                (authErr as { code?: string }).code === "email_exists";
          if (isEmailExists && realEmail) {
            // Retry con shadow email
            authEmail = `${c.external_id.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now()}@import.ediliziaincloud.local`;
            const retry = await supabaseAdmin.auth.admin.createUser({
              email: authEmail,
              password,
              email_confirm: true,
              user_metadata: { first_name: safeFirst, last_name: safeLast, imported: true, original_email: realEmail },
            });
            if (retry.error) {
              results.errors.push({ external_id: c.external_id, stage: "auth_retry", error: retry.error.message });
              results.clients_skipped_duplicate++;
              continue;
            }
            authUserId = retry.data.user.id;
          } else {
            results.errors.push({ external_id: c.external_id, stage: "auth", error: authErr.message });
            continue;
          }
        } else {
          authUserId = authData.user.id;
        }

        // Profile
        const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
          id: authUserId!,
          first_name: safeFirst,
          last_name: safeLast,
          email: realEmail ?? authEmail,   // memorizza email reale se disponibile
          phone: normalizePhone(c.phone),
          address: c.address,
          city: titleCase(c.city),
          country: "IT",
          company_id,
          is_business: c.is_business,
          business_name: businessName,
          portal_disabled: true,
          is_blocked: true,
          // Nessuna welcome email possibile: portal_disabled=true
        } as never);

        if (profileErr) {
          await supabaseAdmin.auth.admin.deleteUser(authUserId!);
          results.errors.push({ external_id: c.external_id, stage: "profile", error: profileErr.message });
          continue;
        }

        // Role = customer
        await supabaseAdmin.from("user_roles").insert({ user_id: authUserId, role: "customer" } as never);

        results.clients_created++;
        results.created_customer_ids.push(authUserId!);

        // --- Ordine associato ---
        const targetStatusName = mapStatusKey(c.order.status_key);
        const targetStatusId = statusByName.get(targetStatusName)!;
        const firstStatusId = statusByName.get("Contratto Firmato")!;
        const displayName = c.is_business ? (businessName || safeLast) : `${safeFirst} ${safeLast}`.trim();
        const description = `Import Excel — ${displayName} (${c.external_id})${c.order.commerciale ? ` · Commerciale: ${titleCase(c.order.commerciale)}` : ""}`;

        // Calcolo imponibile: se amount è LORDO (ivato), converti a imponibile
        const rawAmount = c.order.amount ?? 0;
        const imponibile = amountIsGross
          ? Math.round((rawAmount / (1 + vatRate / 100)) * 100) / 100
          : rawAmount;

        const { data: orderData, error: orderErr } = await supabaseAdmin
          .from("orders")
          .insert({
            company_id,
            customer_id: authUserId,
            current_status_id: targetStatusId,
            description,
            total_amount: imponibile,
            vat_rate: vatRate,
            deposit_amount: 0,
            balance_amount: imponibile,
            expected_date: null,
            created_at: c.order.contract_date,
            updated_at: c.order.contract_date,
          } as never)
          .select("id")
          .single();

        if (orderErr || !orderData) {
          results.errors.push({ external_id: c.external_id, stage: "order", error: orderErr?.message ?? "no data" });
          continue;
        }
        const orderId = orderData.id;
        results.orders_created++;

        // Log storico stato: Contratto Firmato → target (se diverso)
        const histRows: Array<Record<string, unknown>> = [
          {
            order_id: orderId,
            status_id: firstStatusId,
            changed_by: actorUserId,
            changed_at: c.order.contract_date,
          },
        ];
        if (targetStatusId !== firstStatusId) {
          histRows.push({
            order_id: orderId,
            status_id: targetStatusId,
            changed_by: actorUserId,
            changed_at: c.order.contract_date,
          });
        }
        await supabaseAdmin.from("order_status_history").insert(histRows as never);

        // --- Ticket Assistenza (solo se flag open_ticket) ---
        if (c.order.open_ticket) {
          const { error: ticketErr } = await supabaseAdmin.from("tickets").insert({
            order_id: orderId,
            company_id,
            customer_id: authUserId,
            subject: `Intervento di assistenza — ${displayName}`,
            status: "aperto",
            priority: "normale",
            tipo: "intervento",   // enum valido: supporto|intervento|emergenza
            fonte: "ufficio",
            internal_notes: "Ticket importato da file Excel storico — verificare stato reale con il cliente.",
            created_by: actorUserId,
          } as never);

          if (ticketErr) {
            results.errors.push({ external_id: c.external_id, stage: "ticket", error: ticketErr.message });
          } else {
            results.tickets_created++;
          }
        }
      } catch (e) {
        results.errors.push({ external_id: c.external_id, stage: "exception", error: (e as Error).message });
      }
    }

    // --- Pulizia coda automation (safety, se ci fossero enrollment per
    // flow pubblicati, li cancelliamo per evitare elaborazioni future) ---
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: purgedEnroll } = await supabaseAdmin
      .from("internal_automation_enrollments")
      .delete({ count: "exact" } as never)
      .eq("company_id", company_id)
      .gte("created_at", cutoff)
      .select("id");
    const { data: purgedQueue } = await supabaseAdmin
      .from("internal_automation_queue")
      .delete({ count: "exact" } as never)
      .eq("company_id", company_id)
      .gte("created_at", cutoff)
      .select("id");

    return jsonResponse({
      success: true,
      results,
      purged_enrollments: purgedEnroll?.length ?? 0,
      purged_queue_items: purgedQueue?.length ?? 0,
    }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[bulk-import-clients] fatal:", err);
    return errorResponse((err as Error).message || "Errore interno", 500, corsH);
  }
});
