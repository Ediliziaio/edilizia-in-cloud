// billing-payment-push — Write-back del PAGAMENTO verso il gestionale esterno.
// Quando l'utente segna una fattura "pagata" in app, registra il pagamento su
// Fatture in Cloud così i due sistemi restano allineati (niente doppio inserimento).
// One-way controllato: lo scatena l'azione utente, NON il sync di lettura → nessun loop.
// Richiede lo scope di scrittura `issued_documents.invoices:a` (chiesto da billing-connect
// dal 19/09/2026: prima il collegamento era in sola lettura). Chi ha collegato FIC prima
// deve ricollegarlo.
//
// FIC rifiuta un pagamento «saldato» senza CONTO DI SALDO (422 «È necessario impostare
// il conto di saldo nel pagamento»): era l'errore vero in produzione. Il conto si sceglie
// come fa FIC stesso: quello già sul pagamento, poi il conto predefinito del metodo di
// pagamento della fattura, poi il conto con lo stesso IBAN, poi l'unico conto esistente.
//
// Risposte: 200 con { ok: true } oppure { ok: false, motivo, messaggio } per i problemi
// lato Fatture in Cloud (così le schermate leggono il messaggio: supabase.functions.invoke
// non espone il corpo delle risposte 4xx/5xx). 4xx solo per richieste non valide.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { scegliContoDiSaldo, type ContoFic, type MetodoFic } from "../_shared/contoDiSaldoFic.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FIC_CLIENT_ID = Deno.env.get("FIC_CLIENT_ID") || "";
const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET") || "";

// Refresh token FIC (stessa logica di billing-import/billing-sync): rinnova se scade
// entro 60s, protetto da advisory lock anti-race.
async function ensureFreshFicToken(integ: any): Promise<void> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 60_000) return;
  if (!integ.refresh_token || !FIC_CLIENT_ID || !FIC_CLIENT_SECRET) return;

  // Advisory lock anti-race: FIC RUOTA il refresh_token, due refresh concorrenti
  // (cron + azione utente) lo invaliderebbero a vicenda → 401 e integrazione scollegata.
  const { data: lockAcquired } = await supabase.rpc("try_acquire_token_refresh_lock", {
    p_integration_id: integ.id,
  });

  if (!lockAcquired) {
    // Un altro worker sta già rinnovando: breve attesa con jitter, poi ri-leggo il token.
    const jitter = 500 + Math.floor(Math.random() * 1500); // 500–2000 ms
    await new Promise((resolve) => setTimeout(resolve, jitter));
    const { data: refreshed } = await supabase
      .from("billing_integrations").select("access_token")
      .eq("id", integ.id).maybeSingle();
    if (refreshed?.access_token) integ.access_token = refreshed.access_token as string;
    return;
  }

  try {
    // Double-check dopo il lock: un altro worker potrebbe aver già rinnovato prima di noi.
    const { data: fresh } = await supabase
      .from("billing_integrations").select("access_token, token_expires_at")
      .eq("id", integ.id).maybeSingle();
    const freshExp = fresh?.token_expires_at ? new Date(fresh.token_expires_at as string).getTime() : 0;
    if (freshExp && freshExp - Date.now() > 60_000) {
      if (fresh?.access_token) integ.access_token = fresh.access_token as string;
      return; // già fresco: niente refresh (il finally rilascia il lock)
    }

    const r = await fetch("https://api-v2.fattureincloud.it/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: FIC_CLIENT_ID,
        client_secret: FIC_CLIENT_SECRET,
        refresh_token: integ.refresh_token,
      }),
    });
    if (!r.ok) return;
    const td = await r.json();
    if (!td.access_token) return;
    integ.access_token = td.access_token;
    await supabase.from("billing_integrations").update({
      access_token: td.access_token,
      refresh_token: td.refresh_token || integ.refresh_token,
      token_expires_at: new Date(Date.now() + (td.expires_in || 86400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", integ.id);
  } catch { /* best effort */ }
  finally {
    await supabase.rpc("release_token_refresh_lock", { p_integration_id: integ.id });
  }
}

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const PERMESSO = "Fatture in Cloud non permette la scrittura a questo collegamento: ricollegalo da Impostazioni › Fatturazione e autorizza anche la modifica delle fatture.";

  try {
    // Auth: utente (Bearer JWT → canAccessCompany) OPPURE chiamata interna server-side
    // (service-role key o x-internal-secret) per la riconciliazione automatica, che non
    // ha un utente. In modalità interna saltiamo il check d'accesso (chiamante fidato).
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSecret = req.headers.get("x-internal-secret") || "";
    const isInternal =
      (!!token && token === SERVICE_ROLE) ||
      (!!internalSecret && (internalSecret === Deno.env.get("INTERNAL_CRON_SECRET") || internalSecret === Deno.env.get("PROACTIVE_CRON_SECRET")));

    let userId: string | null = null;
    if (!isInternal) {
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId: string | null = (typeof body.invoice_id === "string" && body.invoice_id) ? body.invoice_id : null;
    if (!invoiceId) return json({ error: "invoice_id richiesto" }, 400);
    const paidDate: string = (typeof body.paid_date === "string" && body.paid_date) ? body.paid_date : new Date().toISOString().slice(0, 10);

    const { data: inv } = await supabase
      .from("invoices")
      .select("id, company_id, external_id, external_provider, total, due_date, status, bank_iban")
      .eq("id", invoiceId).maybeSingle();
    if (!inv) return json({ error: "Fattura non trovata" }, 404);

    if (!isInternal) {
      const ok = await canAccessCompany(supabase, userId!, inv.company_id);
      if (!ok) return json({ error: "Accesso negato a questa azienda" }, 403);
    }

    // Solo fatture esterne con provider gestito. Per ora: Fatture in Cloud.
    if (inv.external_provider !== "fattureincloud" || !inv.external_id) {
      return json({ skipped: true, reason: "Fattura non sincronizzata da Fatture in Cloud" });
    }

    const { data: integ } = await supabase
      .from("billing_integrations").select("*")
      .eq("company_id", inv.company_id).eq("provider", "fattureincloud").eq("is_active", true).maybeSingle();
    if (!integ) return json({ ok: false, motivo: "non_collegato", messaggio: "Fatture in Cloud non è collegato." });
    await ensureFreshFicToken(integ);

    const base = `https://api-v2.fattureincloud.it/c/${integ.company_external_id}`;
    const h = { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" };

    // 1) GET del documento per preservare le rate esistenti (payments_list): FIC
    //    SOSTITUISCE l'intero elenco con quello inviato.
    const gr = await fetch(`${base}/issued_documents/${inv.external_id}?fields=payments_list,amount_gross,payment_method`, { headers: h });
    if (gr.status === 401 || gr.status === 403) return json({ ok: false, motivo: "permesso", messaggio: PERMESSO });
    let existing: any[] = [];
    let grossFromFic = Number(inv.total || 0);
    let metodoId: number | null = null;
    if (gr.ok) {
      const gd = await gr.json().catch(() => ({}));
      existing = Array.isArray(gd?.data?.payments_list) ? gd.data.payments_list : [];
      if (gd?.data?.amount_gross) grossFromFic = Number(gd.data.amount_gross);
      metodoId = Number(gd?.data?.payment_method?.id) || null;
    }

    // 1b) Conto di saldo per le rate che non ce l'hanno.
    let conto: ContoFic | null = null;
    const serveConto = existing.length === 0 || existing.some((p: any) => !p?.payment_account?.id);
    if (serveConto) {
      const [rc, rm] = await Promise.all([
        fetch(`${base}/info/payment_accounts`, { headers: h }),
        metodoId ? fetch(`${base}/info/payment_methods`, { headers: h }) : Promise.resolve(null),
      ]);
      if (rc.status === 401 || rc.status === 403) return json({ ok: false, motivo: "permesso", messaggio: PERMESSO });
      const conti: ContoFic[] = rc.ok ? ((await rc.json().catch(() => ({})))?.data ?? []) : [];
      const metodi: MetodoFic[] = rm && rm.ok ? ((await rm.json().catch(() => ({})))?.data ?? []) : [];
      const metodo = metodoId ? metodi.find((m) => m.id === metodoId) ?? null : null;
      conto = scegliContoDiSaldo({ conti, metodo, ibanFattura: inv.bank_iban ?? null });
      if (!conto) {
        const messaggio = conti.length === 0
          ? "Su Fatture in Cloud non c'è nessun conto di saldo (il conto su cui arriva l'incasso): creane uno nelle impostazioni di Fatture in Cloud e riprova."
          : `Su Fatture in Cloud ci sono ${conti.length} conti di saldo e non si capisce quale usare: imposta il conto predefinito del metodo di pagamento${metodo?.name ? ` «${metodo.name}»` : ""} e riprova.`;
        await supabase.from("billing_sync_log").insert({
          company_id: inv.company_id, invoice_id: inv.id, provider: "fattureincloud",
          direction: "push", action: "mark_paid", status: "error", error_message: messaggio,
        });
        return json({ ok: false, motivo: "conto_di_saldo", messaggio });
      }
    }

    // 2) Marca pagate tutte le rate (preserva importi/scadenze). Se non ci sono rate,
    //    crea un singolo pagamento per l'intero importo.
    const payments_list = existing.length > 0
      ? existing.map((p: any) => ({
          amount: Number(p.amount || 0),
          due_date: p.due_date || inv.due_date || paidDate,
          paid_date: p.paid_date || paidDate,
          status: "paid",
          payment_account: p?.payment_account?.id ? { id: p.payment_account.id } : { id: conto!.id },
        }))
      : [{ amount: grossFromFic, due_date: inv.due_date || paidDate, paid_date: paidDate, status: "paid", payment_account: { id: conto!.id } }];

    // 3) PUT: aggiorna il documento su FIC.
    const pr = await fetch(`${base}/issued_documents/${inv.external_id}`, {
      method: "PUT", headers: h,
      body: JSON.stringify({ data: { payments_list } }),
    });
    if (pr.status === 401 || pr.status === 403) {
      await supabase.from("billing_integrations").update({ scrittura_incassi_autorizzata: false }).eq("id", integ.id);
      return json({ ok: false, motivo: "permesso", messaggio: PERMESSO });
    }
    if (!pr.ok) {
      const t = await pr.text().catch(() => "");
      let dettaglio = t.slice(0, 300);
      try { dettaglio = JSON.parse(t)?.error?.message || dettaglio; } catch { /* testo grezzo */ }
      await supabase.from("billing_sync_log").insert({
        company_id: inv.company_id, invoice_id: inv.id, provider: "fattureincloud",
        direction: "push", action: "mark_paid", status: "error", error_message: `FIC ${pr.status}: ${t.slice(0, 300)}`,
      });
      return json({ ok: false, motivo: "errore", messaggio: `Fatture in Cloud ha rifiutato l'aggiornamento: ${dettaglio}` });
    }

    await supabase.from("billing_sync_log").insert({
      company_id: inv.company_id, invoice_id: inv.id, provider: "fattureincloud",
      direction: "push", action: "mark_paid", status: "success",
      response_payload: conto ? { conto_di_saldo: { id: conto.id, nome: conto.name ?? null } } : null,
    });

    // FIC ha accettato: allinea subito anche qui. Sulle fatture importate i
    // trigger di invoice_payments non toccano più paid_amount (il gestionale è
    // la verità), quindi senza questa riga l'utente vedrebbe «da incassare»
    // fino al prossimo allineamento.
    const { error: locErr } = await supabase.from("invoices")
      .update({ status: "paid", paid_amount: inv.total, payment_date: paidDate })
      .eq("id", inv.id);
    if (locErr) console.error("allineamento locale dopo il push:", locErr.message);

    return json({ ok: true, conto: conto?.name ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
