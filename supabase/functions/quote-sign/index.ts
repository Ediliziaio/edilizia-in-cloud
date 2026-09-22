import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import {
  CONSENSO,
  clausoleVessatorieAttive,
  contenutoCanonico,
  consensiObbligatori,
  costruisciProvaFirma,
  improntaDocumento,
  risolviTestiLegali,
  riepilogoPerEmail,
  validaConsensi,
  type ClausolaAziendale,
  type ClausolaVessatoria,
  type ConsensoRaccolto,
  type ContestoFirma,
  type TipoFirmatario,
} from "../_shared/quoteLegal.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
/**
 * Public endpoint (no auth) for viewing, signing, or refusing a quote.
 * Actions: "view", "requisiti", "sign", "refuse"
 *
 * TUTELE LEGALI (audit 01/08): la firma avveniva col solo nome digitato —
 * nessuna accettazione delle condizioni, nessuna informativa sul diritto di
 * ripensamento, nessuna approvazione delle clausole vessatorie, nessuna prova
 * di cosa fosse stato firmato. Ora:
 *  - "requisiti" espone i consensi da raccogliere e i testi da mostrare;
 *  - "sign" li valida quando il client li invia e registra SEMPRE una prova
 *    (impronta del documento, IP, browser, consensi) accanto al preventivo.
 * Retrocompatibile: un client che non manda i consensi firma come prima, ma la
 * prova registra che non sono stati raccolti — così è visibile, non implicito.
 */
/** I nomi dei clienti finiscono dentro l'HTML: qui non ci passa markup. */
function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

serveConMetriche("quote-sign", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const body = await req.json();
    const { token, action, signed_by_name, refuse_reason } = body;
    const consensi: ConsensoRaccolto[] = Array.isArray(body.consensi) ? body.consensi : [];
    const tipoFirmatario: TipoFirmatario = body.tipo_firmatario === "professionista" ? "professionista" : "consumatore";

    if (!token || !action) {
      return errorResponse("token e action richiesti");
    }

    // Validate token is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return errorResponse("Token non valido", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load quote by token
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .eq("signature_token", token)
      .single();

    if (qErr || !quote) {
      return jsonResponse({ valid: false, reason: "token_invalid" }, 404);
    }

    // Check expiration
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      // Auto-expire if still in "inviata"
      if (quote.status === "inviata") {
        await supabaseAdmin
          .from("quotes")
          .update({ status: "scaduta", updated_at: new Date().toISOString() })
          .eq("id", quote.id);
      }
      return jsonResponse({ valid: false, reason: "expired", quote_number: quote.quote_number });
    }

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const userAgent = req.headers.get("user-agent") ?? "";

    // Contesto legale del preventivo: guida sia "requisiti" sia la validazione.
    // TUTTO PERSONALIZZABILE PER AZIENDA: clausole e testi arrivano da
    // `quote_clause_templates` (già per-company). Se l'impresa non ha marcato
    // clausole come vessatorie non se ne impone nessuna — far approvare al
    // cliente clausole che l'azienda non ha scelto sarebbe sbagliato.
    const { data: clausoleAzienda } = await supabaseAdmin
      .from("quote_clause_templates")
      .select("id, category, title, content, active, sort_order, applicable_to")
      .eq("company_id", quote.company_id)
      .eq("active", true);

    const clausoleConfigurate: ClausolaAziendale[] = (clausoleAzienda ?? []) as ClausolaAziendale[];
    const clausoleTemplate: ClausolaVessatoria[] = clausoleVessatorieAttive(clausoleConfigurate);
    const haCondizioni = !!(quote.terms_and_conditions && String(quote.terms_and_conditions).trim());
    const contesto: ContestoFirma = {
      tipoFirmatario,
      haCondizioni,
      clausoleVessatorie: clausoleTemplate,
      // Nei serramenti e negli arredi su misura il ripensamento ha una regola
      // diversa: l'informativa cambia di conseguenza.
      lavoriSuMisura: ["serramenti", "arredi", "su_misura"].includes(String(quote.tipo_lavoro ?? "")),
    };

    switch (action) {
      // ── Cosa deve accettare il firmatario, con i testi da mostrare ────────
      case "requisiti": {
        const { data: company } = await supabaseAdmin
          .from("companies").select("name").eq("id", quote.company_id).maybeSingle();
        // Testi dell'azienda quando li ha scritti, altrimenti i nostri.
        const testi = risolviTestiLegali(clausoleConfigurate, {
          lavoriSuMisura: contesto.lavoriSuMisura,
          nomeAzienda: (company?.name as string | undefined) ?? undefined,
        });
        return jsonResponse({
          obbligatori: consensiObbligatori(contesto),
          facoltativi: contesto.tipoFirmatario === "consumatore" ? [CONSENSO.INIZIO_ANTICIPATO] : [],
          testi,
          clausole_vessatorie: contesto.clausoleVessatorie,
          condizioni_testo: haCondizioni ? String(quote.terms_and_conditions) : null,
        });
      }
      case "view": {
        // Track first view
        if (!quote.viewed_at) {
          await supabaseAdmin
            .from("quotes")
            .update({ viewed_at: new Date().toISOString() })
            .eq("id", quote.id);
        }

        // Load items for display
        const { data: items = [] } = await supabaseAdmin
          .from("quote_items")
          .select("name, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate, line_total, item_type, sort_order, mostra_nel_pdf")
          .eq("quote_id", quote.id)
          .order("sort_order");

        // Load company info
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("name, email, phone, address, logo_url, vat_number")
          .eq("id", quote.company_id)
          .single();

        // Check if signed PDF exists
        let pdfUrl: string | null = null;
        if (quote.pdf_storage_path) {
          const { data: signedData } = await supabaseAdmin.storage
            .from("quote-pdfs")
            .createSignedUrl(quote.pdf_storage_path, 3600);
          pdfUrl = signedData?.signedUrl || null;
        }

        return jsonResponse({
          valid: true,
          status: quote.status,
          quote: {
            quote_number: quote.quote_number,
            title: quote.title,
            description: quote.description,
            notes: quote.notes,
            client_name: quote.client_name,
            client_company: quote.client_company,
            expires_at: quote.expires_at,
            subtotal: quote.subtotal,
            discount_percent: quote.discount_percent,
            discount_amount: quote.discount_amount,
            vat_amount: quote.vat_amount,
            total: quote.total,
            // Prezzo scritto a mano (21/09/2026): le righe restano a 0€, la
            // pagina pubblica non deve mostrarne il prezzo unitario/totale.
            prezzo_manuale_attivo: Number(quote.prezzo_manuale ?? 0) > 0,
            created_at: quote.created_at,
            signed_at: quote.signed_at,
            signed_by_name: quote.signed_by_name,
            refused_at: quote.refused_at,
            refused_reason: quote.refused_reason,
          },
          items,
          company: company || {},
          pdf_url: pdfUrl,
        });
      }

      case "sign": {
        if (quote.status !== "inviata") {
          return jsonResponse({
            valid: false,
            reason: quote.status === "accettata" ? "already_signed" : "invalid_status",
            status: quote.status,
          });
        }

        // Guard anti-bypass OTP: se per questo preventivo esiste una richiesta FEA
        // attiva (firma con codice OTP), la firma legacy col solo nome NON è
        // ammessa — altrimenti si aggirerebbe la verifica OTP. Il cliente deve
        // usare il link di firma elettronica ricevuto via email.
        const { data: feaAttiva } = await supabaseAdmin
          .from("signature_requests")
          .select("id")
          .eq("quote_id", quote.id)
          .eq("tipo_documento", "quote")
          .in("status", ["pending", "otp_verified"])
          .limit(1)
          .maybeSingle();

        if (feaAttiva) {
          return errorResponse(
            "Questo preventivo richiede la firma con codice OTP: usa il link di firma elettronica ricevuto via email.",
            409,
          );
        }

        if (!signed_by_name || signed_by_name.trim().length < 2) {
          return errorResponse("Nome obbligatorio per la firma");
        }

        // Consensi: validati quando il client li invia, e SEMPRE richiesti se
        // il preventivo porta clausole vessatorie (senza approvazione specifica
        // ex art. 1341 c.c. sarebbero nulle: firmare senza è peggio che non
        // firmare). Per il resto niente rottura dei client esistenti.
        const consensiDaValidare = consensi.length > 0 || contesto.clausoleVessatorie.length > 0;
        if (consensiDaValidare) {
          const esito = validaConsensi(contesto, consensi);
          if (!esito.valido) {
            return jsonResponse({
              success: false,
              error: "consensi_mancanti",
              mancanti: esito.mancanti,
              message: esito.messaggio,
            }, 422);
          }
        }

        // Impronta di ciò che è stato firmato: se il preventivo viene modificato
        // dopo, l'impronta non torna più e la modifica è dimostrabile.
        const { data: righeFirmate = [] } = await supabaseAdmin
          .from("quote_items")
          .select("name, quantity, unit_price, line_total")
          .eq("quote_id", quote.id)
          .order("sort_order");
        const impronta = await improntaDocumento(
          contenutoCanonico({ ...quote, items: righeFirmate ?? [] }),
        );

        const firmatoIl = new Date();
        const prova = costruisciProvaFirma({
          firmatoDa: signed_by_name.trim(),
          tipoFirmatario,
          ip: clientIp,
          userAgent,
          improntaDocumento: impronta,
          consensi,
          clausoleVessatorie: contesto.clausoleVessatorie,
          quando: firmatoIl,
        });

        // La prova sta accanto al preventivo, nel jsonb già esistente: nessuna
        // migration necessaria e nessun dato perso se la colonna è vuota.
        const campiEsistenti = (quote.custom_field_values ?? {}) as Record<string, unknown>;

        await supabaseAdmin
          .from("quotes")
          .update({
            status: "accettata",
            signed_at: firmatoIl.toISOString(),
            signed_by_name: signed_by_name.trim(),
            signed_by_ip: clientIp,
            custom_field_values: { ...campiEsistenti, prova_firma: prova },
            updated_at: firmatoIl.toISOString(),
          })
          .eq("id", quote.id);

        // Conferma scritta al cliente: senza, del ripensamento resta traccia
        // solo dentro la nostra app — e il termine decorre da oggi. Best-effort:
        // un problema di posta non deve far fallire una firma già registrata.
        if (quote.client_email) {
          try {
            const { data: azienda } = await supabaseAdmin
              .from("companies").select("name").eq("id", quote.company_id).maybeSingle();
            const nomeAzienda = (azienda?.name as string | undefined) ?? "L'impresa";
            const testiFirma = risolviTestiLegali(clausoleConfigurate, {
              lavoriSuMisura: contesto.lavoriSuMisura,
              nomeAzienda,
            });
            const accettati = consensi
              .filter((c) => c.accettato)
              .map((c) => `<li>${escapeHtml(c.testo ?? testiFirma[c.chiave] ?? c.chiave)}</li>`)
              .join("");
            const vessatorieApprovate = contesto.clausoleVessatorie
              .filter((c) => prova.clausole_approvate.includes(c.codice))
              .map((c) => `<li><strong>${escapeHtml(c.titolo)}</strong> — ${escapeHtml(c.testo)}</li>`)
              .join("");

            await sendEmailUnified({
              companyId: quote.company_id,
              stream: "transactional",
              to: [String(quote.client_email)],
              subject: `Conferma firma offerta ${quote.quote_number} — ${nomeAzienda}`,
              html: `
                <p>Gentile ${escapeHtml(signed_by_name.trim())},</p>
                <p>abbiamo registrato la tua firma sull'offerta <strong>${escapeHtml(String(quote.quote_number))}</strong>.
                Conserva questa email: è la prova di cosa hai accettato e quando.</p>
                <pre style="font-family:inherit;white-space:pre-wrap;background:#f6f7f9;padding:12px;border-radius:8px">${escapeHtml(riepilogoPerEmail(prova))}</pre>
                ${accettati ? `<p><strong>Hai accettato:</strong></p><ul>${accettati}</ul>` : ""}
                ${vessatorieApprovate ? `<p><strong>Clausole approvate specificamente:</strong></p><ul>${vessatorieApprovate}</ul>` : ""}
                <p style="color:#64748b;font-size:13px">Per qualsiasi comunicazione rispondi a questa email o contatta ${escapeHtml(nomeAzienda)}.</p>
              `,
              templateName: "quote_signed_confirmation",
              skipCredits: false,
              adminClient: supabaseAdmin,
              metadata: { quote_id: quote.id, quote_number: quote.quote_number },
            });
          } catch (mailErr) {
            console.error("Conferma firma non inviata:", mailErr);
          }
        }

        // Notify the quote creator
        if (quote.created_by) {
          await supabaseAdmin.rpc("create_notification", {
            p_company_id: quote.company_id,
            p_user_id: quote.created_by,
            p_type: "quote_signed",
            p_title: `Offerta ${quote.quote_number} accettata`,
            p_body: `${signed_by_name.trim()} ha accettato l'offerta ${quote.quote_number}.`,
            p_entity_type: "quote",
            p_entity_id: quote.id,
            p_action_url: `/azienda/marketing/preventivi/${quote.id}`,
          });
        }

        return jsonResponse({ success: true, message: "Offerta accettata con successo" });
      }

      case "refuse": {
        if (quote.status !== "inviata") {
          return jsonResponse({
            valid: false,
            reason: "invalid_status",
            status: quote.status,
          });
        }

        await supabaseAdmin
          .from("quotes")
          .update({
            status: "rifiutata",
            refused_at: new Date().toISOString(),
            refused_reason: refuse_reason || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", quote.id);

        // Notify the quote creator
        if (quote.created_by) {
          await supabaseAdmin.rpc("create_notification", {
            p_company_id: quote.company_id,
            p_user_id: quote.created_by,
            p_type: "quote_refused",
            p_title: `Offerta ${quote.quote_number} rifiutata`,
            p_body: `Il cliente ha rifiutato l'offerta ${quote.quote_number}.${refuse_reason ? ` Motivo: ${refuse_reason}` : ""}`,
            p_entity_type: "quote",
            p_entity_id: quote.id,
            p_action_url: `/azienda/marketing/preventivi/${quote.id}`,
          });
        }

        return jsonResponse({ success: true, message: "Offerta rifiutata" });
      }

      default:
        return errorResponse("Azione non valida. Usa: view, sign, refuse");
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("quote-sign error:", e);
    return errorResponse("Errore interno", 500);
  }
});
