/**
 * cliente-notifica — email al cliente finale (portale /cliente).
 *
 * Chiamata SOLO dal database (trigger/cron → pg_net) con header `x-cron-secret`
 * (funzione SQL `cliente_notifica_invia`). Tipi:
 *   - stato_commessa  { customer_id, order_id, ref_id = current_status_id }
 *   - documento       { customer_id, order_id, ref_id = order_attachments.id, extra.file_name }
 *   - rate            (nessun parametro) → scansione: rate non pagate con scadenza fra 6-7 giorni
 *                     e rate scadute negli ultimi 3 giorni (il pregresso non viene spammato)
 *
 * Ogni avviso è registrato in `cliente_avvisi` (UNIQUE customer_id+tipo+ref_id):
 * lo stesso evento non produce mai due email.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

type Tipo = "stato_commessa" | "documento" | "rate";

interface Body {
  tipo?: Tipo;
  customer_id?: string | null;
  order_id?: string | null;
  ref_id?: string | null;
  extra?: Record<string, unknown> | null;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function euro(n: number | null | undefined): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
}
function dataIt(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function layout(args: { saluto: string; corpo: string; linkUrl: string; linkTesto: string; azienda: string }): string {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:26px 24px">
      <p style="margin:0 0 12px;font-size:16px">${escapeHtml(args.saluto)}</p>
      ${args.corpo}
      <p style="margin:22px 0 8px"><a href="${args.linkUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${escapeHtml(args.linkTesto)}</a></p>
      <p style="margin:0;font-size:12px;color:#71717a">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${args.linkUrl}</p>
    </div>
    <p style="margin:14px 4px 0;font-size:12px;color:#71717a">Questo messaggio arriva dall'area clienti di ${escapeHtml(args.azienda)}.</p>
  </div></body></html>`;
}

interface Destinatario {
  email: string;
  nome: string;
  companyId: string;
  azienda: string;
  siteUrl: string;
}

async function destinatario(customerId: string): Promise<Destinatario | null> {
  const { data: p } = await admin
    .from("profiles")
    .select("id, email, first_name, business_name, is_business, company_id, portal_disabled, is_blocked, company:companies!profiles_company_id_fkey(name)")
    .eq("id", customerId)
    .maybeSingle();
  if (!p || !p.company_id || p.portal_disabled || p.is_blocked) return null;
  let email = p.email as string | null;
  if (!email) {
    const { data: u } = await admin.auth.admin.getUserById(customerId);
    email = u?.user?.email ?? null;
  }
  if (!email) return null;
  const branding = await getBrandingForCompany(admin, p.company_id as string);
  // deno-lint-ignore no-explicit-any
  const azienda = ((p as any).company?.name as string | undefined) || branding.platformName;
  const nome = (p.is_business ? p.business_name : p.first_name) || "";
  return { email, nome, companyId: p.company_id as string, azienda, siteUrl: branding.siteUrl };
}

/** Registra l'avviso; false se era già stato inviato (stesso cliente+tipo+riferimento). */
async function prenota(companyId: string, customerId: string, tipo: string, refId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("cliente_avvisi")
    .upsert({ company_id: companyId, customer_id: customerId, tipo, ref_id: refId }, { onConflict: "customer_id,tipo,ref_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("cliente_avvisi upsert:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function invia(dest: Destinatario, avvisoId: string, subject: string, html: string, meta: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await sendEmailUnified({
      companyId: dest.companyId,
      stream: "transactional",
      to: [dest.email],
      subject,
      html,
      templateName: "cliente_notifica",
      skipCredits: false,
      adminClient: admin,
      metadata: meta,
    });
    // UnifiedEmailResult: `ok` + `status` + `body` (niente campo `success`).
    const dettaglio = res.ok ? "" : ` ${res.status} ${JSON.stringify(res.body ?? "").slice(0, 160)}`;
    await admin.from("cliente_avvisi").update({ esito: res.ok ? `inviata via ${res.providerUsed ?? "provider"}` : `errore:${dettaglio}` }).eq("id", avvisoId);
    return !!res.ok;
  } catch (e) {
    await admin.from("cliente_avvisi").update({ esito: `errore: ${(e as Error).message}` }).eq("id", avvisoId);
    return false;
  }
}

async function statoCommessa(body: Body): Promise<Record<string, unknown>> {
  if (!body.customer_id || !body.order_id || !body.ref_id) return { skipped: "parametri" };
  const { data: o } = await admin
    .from("orders")
    .select("id, order_code, description, customer_id, company_id, current_status_id")
    .eq("id", body.order_id)
    .maybeSingle();
  if (!o || o.customer_id !== body.customer_id) return { skipped: "commessa" };
  const { data: st } = await admin.from("order_statuses").select("name").eq("id", body.ref_id).maybeSingle();
  const stato = st?.name ?? "aggiornato";
  const dest = await destinatario(body.customer_id);
  if (!dest) return { skipped: "destinatario" };
  const avvisoId = await prenota(dest.companyId, body.customer_id, "stato_commessa", body.ref_id + ":" + o.id);
  if (!avvisoId) return { skipped: "gia_inviato" };
  const codice = o.order_code ?? `#${o.id.slice(0, 8).toUpperCase()}`;
  const desc = (o.description ?? "").slice(0, 90);
  const html = layout({
    saluto: dest.nome ? `Ciao ${dest.nome},` : "Buongiorno,",
    corpo: `<p style="margin:0 0 6px;font-size:15px">la tua commessa <strong>${escapeHtml(codice)}</strong>${desc ? ` (${escapeHtml(desc)})` : ""} è passata allo stato:</p>
            <p style="margin:0;font-size:20px;font-weight:700">${escapeHtml(stato)}</p>`,
    linkUrl: `${dest.siteUrl}/cliente/ordini/${o.id}`,
    linkTesto: "Vedi la commessa",
    azienda: dest.azienda,
  });
  const ok = await invia(dest, avvisoId, `${codice}: ${stato}`, html, { tipo: "stato_commessa", order_id: o.id });
  return { inviata: ok };
}

async function documento(body: Body): Promise<Record<string, unknown>> {
  if (!body.customer_id || !body.order_id || !body.ref_id) return { skipped: "parametri" };
  const { data: o } = await admin.from("orders").select("id, order_code, customer_id").eq("id", body.order_id).maybeSingle();
  if (!o || o.customer_id !== body.customer_id) return { skipped: "commessa" };
  const dest = await destinatario(body.customer_id);
  if (!dest) return { skipped: "destinatario" };
  const avvisoId = await prenota(dest.companyId, body.customer_id, "documento", body.ref_id);
  if (!avvisoId) return { skipped: "gia_inviato" };
  const file = String(body.extra?.file_name ?? "un documento");
  const codice = o.order_code ?? `#${o.id.slice(0, 8).toUpperCase()}`;
  const html = layout({
    saluto: dest.nome ? `Ciao ${dest.nome},` : "Buongiorno,",
    corpo: `<p style="margin:0;font-size:15px">${escapeHtml(dest.azienda)} ha condiviso con te <strong>${escapeHtml(file)}</strong> per la commessa ${escapeHtml(codice)}. Lo trovi nella tua area clienti, sezione Documenti.</p>`,
    linkUrl: `${dest.siteUrl}/cliente/documenti`,
    linkTesto: "Apri i documenti",
    azienda: dest.azienda,
  });
  const ok = await invia(dest, avvisoId, `Nuovo documento: ${file}`, html, { tipo: "documento", order_id: o.id });
  return { inviata: ok };
}

async function rate(): Promise<Record<string, unknown>> {
  const oggi = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fra7 = new Date(oggi); fra7.setDate(fra7.getDate() + 7);
  const fra6 = new Date(oggi); fra6.setDate(fra6.getDate() + 6);
  const ieri = new Date(oggi); ieri.setDate(ieri.getDate() - 1);
  const treGiorniFa = new Date(oggi); treGiorniFa.setDate(treGiorniFa.getDate() - 3);

  const { data: righe, error } = await admin
    .from("order_installments")
    .select("id, label, amount, expected_date, is_paid, order:orders!inner(id, order_code, customer_id, company_id)")
    .eq("is_paid", false)
    .not("order.customer_id", "is", null)
    .or(`and(expected_date.gte.${iso(fra6)},expected_date.lte.${iso(fra7)}),and(expected_date.gte.${iso(treGiorniFa)},expected_date.lte.${iso(ieri)})`)
    .limit(300);
  if (error) return { error: error.message };

  let inviate = 0, saltate = 0;
  for (const r of righe ?? []) {
    // deno-lint-ignore no-explicit-any
    const o = (r as any).order as { id: string; order_code: string | null; customer_id: string | null };
    if (!o?.customer_id) continue;
    const scaduta = r.expected_date < iso(oggi);
    const tipo = scaduta ? "rata_scaduta" : "rata_in_scadenza";
    const dest = await destinatario(o.customer_id);
    if (!dest) { saltate++; continue; }
    const avvisoId = await prenota(dest.companyId, o.customer_id, tipo, r.id);
    if (!avvisoId) { saltate++; continue; }
    const codice = o.order_code ?? `#${o.id.slice(0, 8).toUpperCase()}`;
    const testo = scaduta
      ? `la rata <strong>${escapeHtml(r.label ?? "")}</strong> di ${euro(r.amount)} per la commessa ${escapeHtml(codice)} era prevista per il ${dataIt(r.expected_date)} e risulta ancora da saldare.`
      : `la rata <strong>${escapeHtml(r.label ?? "")}</strong> di ${euro(r.amount)} per la commessa ${escapeHtml(codice)} è prevista per il ${dataIt(r.expected_date)}.`;
    const html = layout({
      saluto: dest.nome ? `Ciao ${dest.nome},` : "Buongiorno,",
      corpo: `<p style="margin:0;font-size:15px">${testo}</p><p style="margin:10px 0 0;font-size:14px;color:#52525b">Se hai già provveduto, ignora questo promemoria: l'azienda registrerà il pagamento a breve.</p>`,
      linkUrl: `${dest.siteUrl}/cliente/rate`,
      linkTesto: "Vedi i pagamenti",
      azienda: dest.azienda,
    });
    const subject = scaduta
      ? `Rata ${r.label ?? ""} di ${euro(r.amount)} scaduta il ${dataIt(r.expected_date)}`
      : `Promemoria: rata ${r.label ?? ""} di ${euro(r.amount)} entro il ${dataIt(r.expected_date)}`;
    const ok = await invia(dest, avvisoId, subject, html, { tipo, installment_id: r.id, order_id: o.id });
    if (ok) inviate++; else saltate++;
  }
  return { candidate: righe?.length ?? 0, inviate, saltate };
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsH });
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsH, "Content-Type": "application/json" } });

  const secret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json(401, { error: "Non autorizzato" });
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* corpo vuoto */ }

  try {
    switch (body.tipo) {
      case "stato_commessa": return json(200, await statoCommessa(body));
      case "documento": return json(200, await documento(body));
      case "rate": return json(200, await rate());
      default: return json(400, { error: "tipo non riconosciuto" });
    }
  } catch (e) {
    console.error("cliente-notifica:", e);
    return json(500, { error: (e as Error).message });
  }
});
