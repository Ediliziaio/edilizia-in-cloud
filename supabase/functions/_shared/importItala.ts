import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { italaClientFromStored } from "./italaSecrets.ts";
import { italaDocument, italaIssued } from "./italaFatture.ts";
import { vatNumber } from "./billingMassive.ts";
import { salvaFatturaRicevuta } from "./salvaFatturaRicevuta.ts";
import type { ItalaInvoice } from "./italaClient.ts";

interface State { provider: "itala"; in_corso: boolean; pagina: number; avviato_il: string; da: string | null; aggiornato_fino_a: string | null; elaborati: number; importati: number; aggiornati: number; falliti: number; errori: string[]; sospeso_fino_a?: string | null; errori_consecutivi: number }
const PAGE_SIZE = 10;
export async function importItala(admin: SupabaseClient, integration: { id: string; company_id: string; api_key: string; provider_vat_number?: string | null }, tick = false) {
  const now = new Date();
  const { data: taken, error: takeError } = await admin.from("billing_integrations").update({ import_in_corso_da: now.toISOString() })
    .eq("id", integration.id).or(`import_in_corso_da.is.null,import_in_corso_da.lt.${new Date(now.getTime() - 240_000).toISOString()}`).select("id").maybeSingle();
  if (takeError) throw new Error("Impossibile avviare la sincronizzazione ITALA.");
  if (!taken) return { success: true, gia_in_corso: true, in_corso: true, messaggio: "Importazione già in corso: prosegue automaticamente." };
  const release = () => admin.from("billing_integrations").update({ import_in_corso_da: null }).eq("id", integration.id);
  let state: State | null = null;
  try {
    const { data: current, error } = await admin.from("billing_integrations").select("import_stato").eq("id", integration.id).single();
    if (error) throw new Error("Impossibile leggere l'avanzamento dell'importazione.");
    const old = current?.import_stato as State | null;
    if (tick && (!old?.in_corso || (old.sospeso_fino_a && Date.parse(old.sospeso_fino_a) > now.getTime()))) return { success: true, in_corso: old?.in_corso ?? false, nulla_da_fare: true };
    state = old?.provider === "itala" && old.in_corso ? { ...old, sospeso_fino_a: null } : {
      provider: "itala", in_corso: true, pagina: 1, avviato_il: now.toISOString(),
      da: old?.aggiornato_fino_a ? new Date(Date.parse(old.aggiornato_fino_a) - 86_400_000).toISOString().slice(0, 10) : null,
      aggiornato_fino_a: old?.aggiornato_fino_a ?? null, elaborati: 0, importati: 0, aggiornati: 0, falliti: 0, errori: [], errori_consecutivi: 0,
    };
    const [{ data: an }, { data: co }] = await Promise.all([
      admin.from("anagrafica_azienda").select("partita_iva").eq("company_id", integration.company_id).maybeSingle(),
      admin.from("companies").select("vat_number").eq("id", integration.company_id).maybeSingle(),
    ]);
    const vat = vatNumber(an?.partita_iva || co?.vat_number);
    if (integration.provider_vat_number && vatNumber(integration.provider_vat_number) !== vat) throw new Error("La partita IVA è cambiata: ricollega il recupero fatture dall'anagrafica corretta.");
    const client = await italaClientFromStored(integration.api_key);
    const rows = await client.invoicePage(vat, state.pagina, PAGE_SIZE, { date_from: state.da ?? undefined });
    const errors: string[] = [];
    let imported = 0, duplicates = 0, received = 0;
    for (const row of rows) {
      try {
        const first = italaDocument(row, vat);
        for (let body = 0; body < first.received.fatture_nel_file; body++) {
          const doc = body === 0 ? first : italaDocument(row, vat, body);
          if (doc.incoming) {
            const result = await salvaFatturaRicevuta(admin, { companyId: integration.company_id, xml: doc.xml, originale: doc.original,
              letta: doc.received, indiceCorpo: body, originaleObbligatorio: true, nomeFileSdi: row.sdi_nome_file, identificativoSdi: row.sdi_identificativo?.toString() });
            if (result.errore) throw new Error(`Fattura ${row.id}: ricevuta non salvata.`);
            if (result.doppione) duplicates++; else { imported++; received++; }
          } else {
            const result = await saveIssued(admin, row, vat, integration.company_id, body, doc.original);
            if (result.duplicate || result.updated) duplicates++; else imported++;
          }
        }
      } catch (e) { errors.push(e instanceof Error ? e.message : `Fattura ${row.id} non importata.`); }
    }
    state.importati += imported; state.aggiornati += duplicates; state.falliti = errors.length; state.errori = errors.slice(0, 5);
    if (!errors.length) {
      state.elaborati += rows.length; state.pagina++; state.errori_consecutivi = 0;
      if (rows.length < PAGE_SIZE) { state.in_corso = false; state.aggiornato_fino_a = state.avviato_il; }
    } else {
      state.errori_consecutivi++;
      if (state.errori_consecutivi >= 3) state.sospeso_fino_a = new Date(Date.now() + 3_600_000).toISOString();
    }
    const status = errors.length ? "partial" : state.in_corso ? "in_progress" : "success";
    const { error: saveError } = await admin.from("billing_integrations").update({ import_stato: state, last_sync_at: now.toISOString(), last_sync_status: status, last_sync_error: errors.join(" | ") || null }).eq("id", integration.id);
    if (saveError) throw new Error("Documenti salvati, ma avanzamento non registrato: il giro verrà ripetuto senza creare copie.");
    await admin.from("billing_sync_log").insert({ company_id: integration.company_id, provider: "itala", direction: "pull", action: "import", status,
      response_payload: { imported, updated: duplicates, failed: errors.length, received, page: state.pagina - (errors.length ? 0 : 1), errors: state.errori } });
    return { success: true, imported, updated: duplicates, duplicates, failed: errors.length, errors: state.errori,
      in_corso: state.in_corso, next_page: state.in_corso ? state.pagina : null, avanzamento: { elaborati: state.elaborati, totale: null } };
  } catch (e) {
    if (state) {
      state.errori_consecutivi++; state.errori = [e instanceof Error ? e.message : "Importazione interrotta."];
      if (state.errori_consecutivi >= 3) state.sospeso_fino_a = new Date(Date.now() + 3_600_000).toISOString();
      await admin.from("billing_integrations").update({ import_stato: state }).eq("id", integration.id);
    }
    throw e;
  } finally { await release(); }
}
async function saveIssued(admin: SupabaseClient, row: ItalaInvoice, vat: string, companyId: string, body: number, original: Uint8Array) {
  const r = italaIssued(row, vat, body);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(original)))).map(b => b.toString(16).padStart(2, "0")).join("");
  const path = `${companyId}/itala/${row.id}_${hash}.${original[0] === 0x30 ? "xml.p7m" : "xml"}`;
  const { error: fileError } = await admin.storage.from("fatture-xml").upload(path, new Blob([new Uint8Array(original)]), { upsert: false });
  if (fileError && String(fileError.statusCode) !== "409" && !/already exists|duplicate/i.test(fileError.message)) throw new Error(`Originale della fattura ${row.id} non archiviato.`);
  const { data, error } = await admin.rpc("billing_import_itala_issued", { p_company_id: companyId, p_external_id: r.externalId,
    p_document: { invoice_number: r.number, document_type: r.documentType, status: r.status, external_status: r.externalStatus, external_sdi_id: r.sdiId,
      issue_date: r.issueDate, due_date: r.dueDate, client_company_name: r.clientName, client_vat_number: r.clientVat, client_fiscal_code: r.clientFiscalCode,
      client_address: r.clientAddress, client_city: r.clientCity, client_zip: r.clientZip, client_country: r.clientCountry,
      client_pec: r.clientPec, client_sdi_code: r.clientSdi, subtotal: r.subtotal, tax_amount: r.taxAmount, total: r.total,
      payment_method: r.paymentMethod, bank_iban: r.iban, external_tax_summary: r.externalTaxSummary, external_document_type: r.externalDocumentType,
      external_xml_url: `fatture-xml/${path}` },
    p_lines: r.lines.map((l, i) => ({ description: l.description, product_code: l.productCode, unit: l.unit, quantity: l.quantity,
      unit_price: l.unitPrice, discount_percent: l.discountPercent, tax_rate: l.taxRate, tax_nature: l.taxNature,
      line_net: l.lineNet, line_tax: l.lineTax, line_gross: l.lineGross, sort_order: i })) });
  if (error) throw new Error(`Fattura ${row.id}: registrazione non riuscita (${error.message}).`);
  return data as { id: string; duplicate?: boolean; updated?: boolean };
}
