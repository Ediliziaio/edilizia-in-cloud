/**
 * clienti-da-fatture-importate — porta nei Clienti gli intestatari delle
 * fatture emesse importate (Fatture in Cloud, Aruba). Cron ogni 10 minuti.
 *
 * Un contatto del CRM diventa cliente, e al cliente si fanno le fatture: chi
 * arriva già fatturato è un cliente, non un contatto. Per ogni fattura non
 * ancora guardata (invoices.cliente_collegato_at vuoto) si riconosce o si crea
 * il cliente con portale spento (_shared/clienteOperativoDaFattura.ts) e si
 * timbra l'esito, così nessuna fattura si riguarda due volte.
 *
 * A lotti: ogni cliente nuovo è un account auth da creare, una chiamata HTTP.
 * FATTURE_PER_GIRO tiene il giro dentro pochi secondi di CPU; lo storico si
 * smaltisce in qualche ora, le fatture nuove al giro dopo l'import.
 * Risponde subito a pg_net e finisce in background (CLAUDE.md, «la coda è una sola»).
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { clienteDaFatturaImportata } from "../_shared/clienteOperativoDaFattura.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const FATTURE_PER_GIRO = 25;

serveConMetricheRapida("clienti-da-fatture-importate", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!((!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const soloAzienda = typeof body.company_id === "string" ? body.company_id : null;
  const limite = Math.min(Math.max(Number(body.limite) || FATTURE_PER_GIRO, 1), 100);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Prima le più recenti: chi è appena stato fatturato deve comparire subito.
  let q = supabase.from("invoices")
    .select("id, company_id, client_company_name, client_email, client_fiscal_code, client_vat_number, client_address, client_city, client_zip, client_country")
    .is("cliente_collegato_at", null).is("deleted_at", null).not("external_provider", "is", null)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(limite);
  if (soloAzienda) q = q.eq("company_id", soloAzienda);
  const { data: fatture, error } = await q;
  if (error) return json({ error: `Lettura fatture: ${error.message}` }, 500);

  const conti = { collegate: 0, clienti_creati: 0, da_verificare: 0, errori: 0, senza_dati: 0 };
  const errori: string[] = [];
  for (const f of (fatture ?? []) as any[]) {
    const haIdentita = !!((f.client_vat_number || "").trim() || (f.client_fiscal_code || "").trim());
    const r = haIdentita
      ? await clienteDaFatturaImportata(supabase, f.company_id, f)
      : { esito: "da_verificare" as const, motivo: "Fattura senza P.IVA né codice fiscale" };

    // Un errore (rete, account) si riprova al giro dopo: niente timbro.
    if (r.esito === "errore") {
      conti.errori++;
      if (errori.length < 5) errori.push(`${f.id}: ${r.motivo}`);
      continue;
    }
    if (r.esito === "collegato") { conti.collegate++; if (r.creato) conti.clienti_creati++; }
    else if (haIdentita) conti.da_verificare++;
    else conti.senza_dati++;

    const { error: errTimbro } = await supabase.from("invoices").update({
      cliente_collegato_at: new Date().toISOString(),
      cliente_collegato_esito: r.esito === "collegato" ? "collegato" : `da_verificare: ${r.motivo}`.slice(0, 300),
    }).eq("id", f.id);
    if (errTimbro && errori.length < 5) errori.push(`${f.id} (timbro): ${errTimbro.message}`);
  }

  console.log("[clienti-da-fatture-importate]", JSON.stringify({ guardate: fatture?.length ?? 0, ...conti }));
  return json({ ok: true, guardate: fatture?.length ?? 0, ...conti, errori });
});
