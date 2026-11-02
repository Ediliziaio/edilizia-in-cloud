import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import {
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/headers.ts";
import { firmaInByte, validaFirma, validateAcceptance } from "./model.ts";
import { renderAcceptance } from "./render.ts";
const bucket = "order-acceptance-reports";
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sha = async (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return errorResponse("Metodo non consentito", 405, cors);
  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, cors);
    const body = await req.json();
    if (
      !uuid(body.order_id) ||
      !["save", "preview", "finalize", "open", "sign", "list"].includes(body.action) ||
      (body.id && !uuid(body.id))
    )
      return errorResponse("Richiesta non valida", 400, cors);
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
        auth: { persistSession: false },
      },
    );
    // Real order visibility and scoped permission are BOTH required; never trust a company supplied by the client.
    const { data: order, error: orderError } = await caller
      .from("orders")
      .select("id,company_id,order_code,work_address")
      .eq("id", body.order_id)
      .maybeSingle();
    if (orderError || !order)
      return errorResponse(
        "Commessa non disponibile o non autorizzata",
        403,
        cors,
      );
    await requireCompanyAccess(admin, userId, order.company_id, cors);
    const { data: permitted, error: permError } = await caller.rpc(
      "has_permission_for_company",
      {
        _user_id: userId,
        _permission:
          body.action === "open" || body.action === "list" ? "can_view_orders" : "can_edit_orders",
        _company_id: order.company_id,
      },
    );
    // Senza permessi d'ufficio: solo il capocantiere interno della commessa, se il modello lo permette.
    let capo = false;
    if (permError || permitted !== true) {
      const { data: autorizzato, error: capoError } = await admin.rpc("verbale_capo_autorizzato", { p_order_id: order.id, p_user_id: userId });
      if (capoError || autorizzato !== true)
        return errorResponse(
          "Non hai il permesso di gestire questo verbale",
          403,
          cors,
        );
      capo = true;
    }
    // In cantiere si chiude solo con la firma del cliente; senza firma lo chiude l'ufficio.
    if (capo && body.action === "finalize")
      return errorResponse("Dal cantiere il verbale si chiude con la firma del cliente", 403, cors);
    if (body.action === "list") {
      const { data: verbali, error: listError } = await admin
        .from("order_acceptance_reports")
        .select("id,status,version,pdf_path,document_hash,content,created_at,firma_cliente_nome")
        .eq("order_id", order.id)
        .eq("company_id", order.company_id)
        .order("created_at", { ascending: false });
      if (listError) throw listError;
      return jsonResponse({ reports: verbali ?? [] }, 200, cors);
    }
    let report = null;
    if (body.id) {
      const result = await admin
        .from("order_acceptance_reports")
        .select("*")
        .eq("id", body.id)
        .eq("order_id", order.id)
        .eq("company_id", order.company_id)
        .maybeSingle();
      if (result.error || !result.data)
        return errorResponse("Verbale non trovato", 404, cors);
      report = result.data;
    }
    const responseWithPdf = async (row: Record<string, unknown>) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(row.pdf_path, 300);
      if (error || !data?.signedUrl)
        return errorResponse(
          "Documento salvato. Non riesco ad aprirlo: riprova.",
          500,
          cors,
        );
      return jsonResponse({ report: row, url: data.signedUrl }, 200, cors);
    };
    if (body.action === "open") {
      if (!report?.pdf_path)
        return errorResponse("Genera prima il PDF", 422, cors);
      return await responseWithPdf(report);
    }
    if (
      report &&
      (report.status !== "draft" || report.version !== body.version)
    )
      return errorResponse(
        "Verbale modificato o già congelato. Riaprilo prima di continuare.",
        409,
        cors,
      );
    if (body.action === "save") {
      const errors = validateAcceptance(body.content);
      if (errors.length) return errorResponse(errors.join(". "), 422, cors);
      const query = report
        ? admin
            .from("order_acceptance_reports")
            .update({ content: body.content })
            .eq("id", report.id)
            .eq("version", body.version)
            .eq("status", "draft")
        : admin
            .from("order_acceptance_reports")
            .insert({
              order_id: order.id,
              company_id: order.company_id,
              created_by: userId,
              content: body.content,
            });
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data)
        return errorResponse(
          "Verbale aggiornato da un altro utente: riaprilo.",
          409,
          cors,
        );
      return jsonResponse({ report: data }, 200, cors);
    }
    if (!report) return errorResponse("Salva prima il verbale", 422, cors);
    const disegna = async (firma?: Parameters<typeof renderAcceptance>[2]) => {
      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("name")
        .eq("id", order.company_id)
        .single();
      if (companyError) throw companyError;
      return await renderAcceptance(report.content, {
        company: company.name,
        order: order.order_code ?? order.id,
        address: order.work_address ?? "",
        id: report.id,
        version: report.version,
      }, firma);
    };
    if (body.action === "preview") {
      const { bytes } = await disegna();
      const path = `${order.company_id}/${order.id}/${report.id}/${crypto.randomUUID()}.pdf`;
      const hash = await sha(bytes);
      const { error: uploadError } = await admin.storage
        .from(bucket)
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await admin
        .from("order_acceptance_reports")
        .update({ pdf_path: path, document_hash: hash })
        .eq("id", report.id)
        .eq("version", body.version)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error || !data) {
        await admin.storage.from(bucket).remove([path]);
        return errorResponse(
          "Contenuto cambiato durante la generazione. Riapri e riprova.",
          409,
          cors,
        );
      }
      return await responseWithPdf(data);
    }
    const errors = validateAcceptance(report.content, true);
    if (errors.length) return errorResponse(errors.join(". "), 422, cors);
    if (
      body.reviewed !== true ||
      !report.pdf_path ||
      body.document_hash !== report.document_hash
    )
      return errorResponse(
        "Apri e controlla il PDF aggiornato prima di congelarlo",
        422,
        cors,
      );
    if (body.action === "sign") {
      const erroriFirma = validaFirma(body.firma);
      if (erroriFirma.length)
        return errorResponse(erroriFirma.join(". "), 422, cors);
      const firmata = new Date();
      const immagine = firmaInByte(body.firma.immagine)!;
      const nome = body.firma.nome.trim();
      const { bytes } = await disegna({
        immagine,
        nome,
        quando: firmata.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
      });
      const cartella = `${order.company_id}/${order.id}/${report.id}`;
      const pathFirma = `${cartella}/firma-${crypto.randomUUID()}.png`;
      const pathPdf = `${cartella}/${crypto.randomUUID()}.pdf`;
      const { error: erroreFirma } = await admin.storage.from(bucket).upload(pathFirma, immagine, { contentType: "image/png", upsert: false });
      if (erroreFirma) throw erroreFirma;
      const { error: errorePdf } = await admin.storage.from(bucket).upload(pathPdf, bytes, { contentType: "application/pdf", upsert: false });
      if (errorePdf) {
        await admin.storage.from(bucket).remove([pathFirma]);
        throw errorePdf;
      }
      // Una sola scrittura: firma, documento e congelamento insieme. Se un altro è arrivato prima, non passa.
      const { data, error } = await admin
        .from("order_acceptance_reports")
        .update({
          status: "finalized",
          finalized_at: firmata.toISOString(),
          pdf_path: pathPdf,
          document_hash: await sha(bytes),
          firma_cliente_path: pathFirma,
          firma_cliente_nome: nome,
          firma_cliente_at: firmata.toISOString(),
          firma_raccolta_da: userId,
        })
        .eq("id", report.id)
        .eq("version", body.version)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();
      if (error || !data) {
        await admin.storage.from(bucket).remove([pathFirma, pathPdf]);
        return errorResponse("Il verbale è cambiato: riaprilo prima di far firmare.", 409, cors);
      }
      if (capo) {
        // L'avviso all'ufficio non deve far fallire una firma già raccolta.
        const { error: erroreAvviso } = await admin.rpc("verbale_avvisa_ufficio", { p_report_id: data.id });
        if (erroreAvviso) console.error("collaudo-commessa avviso", erroreAvviso);
      }
      return jsonResponse({ report: data }, 200, cors);
    }
    const { data: file, error: downloadError } = await admin.storage
      .from(bucket)
      .download(report.pdf_path);
    if (
      downloadError ||
      !file ||
      (await sha(await file.arrayBuffer())) !== report.document_hash
    )
      return errorResponse(
        "Integrità del documento non verificata: rigenera il PDF",
        409,
        cors,
      );
    const { data, error } = await admin
      .from("order_acceptance_reports")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", report.id)
      .eq("version", body.version)
      .eq("status", "draft")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return errorResponse("Il verbale è cambiato: riaprilo.", 409, cors);
    return jsonResponse({ report: data }, 200, cors);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("collaudo-commessa", error);
    return errorResponse(
      "Operazione non riuscita. Il verbale già salvato non è stato perso.",
      500,
      cors,
    );
  }
});
