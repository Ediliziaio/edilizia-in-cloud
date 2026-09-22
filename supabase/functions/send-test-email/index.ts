import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

import { getCorsHeaders } from "../_shared/headers.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import {
  destinatarioProvaAmmesso,
  indirizzoSingoloValido,
  mittenteProva,
  normalizzaIndirizzo,
  oggettoProva,
} from "../_shared/emailDiProva.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";

// Chi può mandare una prova, a chi e da quale mittente: _shared/emailDiProva.ts.
// Fino al 21/09/2026 in testMode bastava essere autenticati per spedire a
// qualunque indirizzo dal mittente della piattaforma.
serveConMetriche("send-test-email", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const json = (dati: unknown, status = 200) =>
    new Response(JSON.stringify(dati), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { to, testMode, stream, subject, html, campaignId, previewContactId, company_id } = body;

    if (!to) {
      return json({ error: "Parametro mancante: to" }, 400);
    }
    if (!indirizzoSingoloValido(to)) {
      return json({ error: "Indirizzo del destinatario non valido" }, 400);
    }
    const destinatario = normalizzaIndirizzo(to);
    const userId = user.id;
    const emailChiamante = user.email ?? null;

    // Determine stream
    const providerStream: "marketing" | "transactional" = stream === "transactional" ? "transactional" : "marketing";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ruoloSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    const superAdmin = ruoloSuperAdmin === true;

    // Chi non è super admin manda la prova a sé o a un collega dell'azienda
    // da cui parte. I colleghi si leggono col client dell'utente: la funzione
    // controlla da sé che possa vedere le persone di quell'azienda. Se non
    // risponde restano solo il suo indirizzo e il no.
    async function destinatarioAmmesso(companyId: string) {
      let emailColleghi: string[] = [];
      if (!superAdmin && destinatario !== normalizzaIndirizzo(emailChiamante)) {
        const { data: persone, error } = await supabase.rpc("get_internal_chat_profiles", {
          p_company_id: companyId,
        });
        if (error) console.warn("[send-test-email] colleghi non letti:", error.message);
        emailColleghi = ((persone ?? []) as Array<{ email?: string | null }>).map((p) => p.email ?? "");
      }
      const esito = destinatarioProvaAmmesso({ destinatario, superAdmin, emailChiamante, emailColleghi });
      if (!esito.ammesso) {
        console.warn("[send-test-email] destinatario non ammesso", { user_id: userId, company_id: companyId });
      }
      return esito;
    }

    // Prova del mittente (pagina «Dominio email», pannello dei provider del super admin)
    if (testMode) {
      const mittente = mittenteProva({ aziendaRichiesta: company_id, superAdmin });
      if (mittente.da === "errore") {
        return json({ error: mittente.motivo }, 400);
      }

      let companyId: string | null = null;
      if (mittente.da === "azienda_richiesta") {
        if (!superAdmin) {
          try {
            await verifyCompanyAccess(adminClient, userId, mittente.companyId);
          } catch {
            return json({ error: "Accesso negato a questa azienda" }, 403);
          }
        }
        companyId = mittente.companyId;
      } else if (mittente.da === "azienda_del_profilo") {
        const { data: profilo } = await adminClient
          .from("profiles")
          .select("company_id")
          .eq("id", userId)
          .maybeSingle();
        companyId = (profilo as { company_id?: string | null } | null)?.company_id ?? null;
        if (!companyId) {
          return json({ error: "Nessuna azienda da cui inviare la prova" }, 403);
        }
      }

      if (companyId) {
        const esito = await destinatarioAmmesso(companyId);
        if (!esito.ammesso) return json({ error: esito.motivo }, 403);
      }

      // Con companyId valorizzato sendEmailUnified sceglie il mittente
      // dell'azienda (resolveSender): il suo dominio se verificato per quel
      // canale, altrimenti il sottodominio della piattaforma «via EdiliziaInCloud».
      const result = await sendEmailUnified({
        companyId,
        stream:       providerStream,
        to:           [destinatario],
        subject:      superAdmin ? (subject || `[TEST] Email di verifica`) : oggettoProva(subject),
        html:         html || `<html><body><p>Test email</p></body></html>`,
        templateName: "test_email",
        skipCredits:  true,
        adminClient:  adminClient,
        metadata:     { test_mode: true, requested_by: userId },
      });

      return json(result.body, result.ok ? 200 : result.status);
    }

    // Campaign test mode: send test of a specific campaign (no credit deduction)
    if (!campaignId) {
      return json({ error: "Parametri mancanti: campaignId o testMode" }, 400);
    }

    const { data: campaign, error: campError } = await adminClient
      .from("email_campaigns")
      .select("company_id, subject, html_content, sender_email, sender_name")
      .eq("id", campaignId)
      .single();

    if (campError || !campaign) {
      return json({ error: "Campagna non trovata" }, 404);
    }

    // SECURITY: verifica che il chiamante appartenga all'azienda della campagna
    // (altrimenti chiunque potrebbe esfiltrare HTML campagna + PII contatti altrui).
    try {
      await verifyCompanyAccess(adminClient, userId, campaign.company_id);
    } catch {
      return json({ error: "Accesso negato a questa campagna" }, 403);
    }

    // L'HTML della campagna lo scrive l'azienda: verso un indirizzo qualsiasi
    // sarebbe lo stesso relay del testMode.
    const esito = await destinatarioAmmesso(campaign.company_id);
    if (!esito.ammesso) return json({ error: esito.motivo }, 403);

    let htmlBody = campaign.html_content ||
      `<html><body><p>Nessun contenuto HTML disponibile.</p></body></html>`;

    // GAP-20: substitute variables using previewContactId data or placeholder values
    let previewContact: Record<string, string> = {
      first_name: "Mario",
      last_name: "Rossi",
      email: destinatario,
      phone: "+39 333 1234567",
      city: "Milano",
      province: "MI",
      company_name: "Azienda Esempio",
    };

    if (previewContactId) {
      const { data: ct } = await adminClient
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, city, province, company_name")
        .eq("id", previewContactId)
        .eq("company_id", campaign.company_id)
        .maybeSingle();
      if (ct) previewContact = { ...previewContact, ...ct };
    }

    htmlBody = htmlBody
      .replace(/\{\{first_name\}\}/g, previewContact.first_name || "")
      .replace(/\{\{last_name\}\}/g, previewContact.last_name || "")
      .replace(/\{\{email\}\}/g, previewContact.email || "")
      .replace(/\{\{contact\.first_name\}\}/g, previewContact.first_name || "")
      .replace(/\{\{contact\.last_name\}\}/g, previewContact.last_name || "")
      .replace(/\{\{contact\.email\}\}/g, previewContact.email || "")
      .replace(/\{\{phone\}\}/g, previewContact.phone || "")
      .replace(/\{\{city\}\}/g, previewContact.city || "")
      .replace(/\{\{province\}\}/g, previewContact.province || "")
      .replace(/\{\{contact_company\}\}/g, previewContact.company_name || "")
      .replace(/\{\{unsubscribe_url\}\}/g, "#"); // placeholder for test

    // Dal mittente dell'azienda, come la campagna vera: da quello della
    // piattaforma il marketing lo rifiuta Elastic, e la prova non provava niente.
    const result = await sendEmailUnified({
      companyId:    campaign.company_id,
      stream:       providerStream,
      to:           [destinatario],
      subject:      `[TEST] ${campaign.subject || "Senza oggetto"}`,
      html:         htmlBody,
      templateName: "test_email",
      skipCredits:  true,
      adminClient:  adminClient,
      metadata:     { campaign_id: campaignId, preview_contact_id: previewContactId ?? null, requested_by: userId },
    });

    return json(result.body, result.ok ? 200 : result.status);
  } catch (err) {
    return json({ error: (err instanceof Error && err.message) || "Errore interno" }, 500);
  }
});
