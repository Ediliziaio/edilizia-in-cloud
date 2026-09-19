import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter, arubaSignin, arubaRefresh, arubaFindByUsername, arubaFindInByUsername, ARUBA_STATUS_MAP, acubeLogin, acubeListInvoices, ACUBE_MARKING_MAP } from "../_shared/billingAdapter.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { resolveEffectiveCompanyId, canAccessCompany } from "../_shared/effectiveCompany.ts";
import {
  avanzamento, chiudiSeFinito, dopoErrore, dopoPagina, leggiStato, nuovoGiro, parametriPagina, prossimoFlusso,
  type StatoImport,
} from "../_shared/importFicStato.ts";

// Import da Fatture in Cloud a blocchi (vedi _shared/importFicStato.ts): pagine
// per invocazione e tempo massimo prima di fermarsi e salvare il cursore.
const FIC_PAGINE_PER_GIRO = 6;
const FIC_BUDGET_MS = 70_000;
/** Un import rimasto «in corso» da più di così si considera morto e si può riprendere. */
const FIC_LEASE_MS = 4 * 60_000;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FIC_CLIENT_ID = Deno.env.get("FIC_CLIENT_ID") || "";
const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET") || "";

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Fix #4: Declare variables outside try for error logging access
  let companyId: string | null = null;
  let provider: string | null = null;
  let integId: string | null = null;

  try {
    let createdBy: string | null = null;
    const body = await req.json().catch(() => ({}));
    provider = body.provider;

    // Auth: utente (Bearer JWT) OPPURE chiamata automatica/cron (header x-cron-secret
    // come gli altri cron del progetto, o service-role key). In modalità cron NON c'è
    // un utente: company_id + provider arrivano dal body (la billing_auto_sync_all li
    // passa per ogni integrazione attiva).
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isCron =
      (!!cronHeader && (cronHeader === Deno.env.get("PROACTIVE_CRON_SECRET") || cronHeader === Deno.env.get("INTERNAL_CRON_SECRET"))) ||
      (!!token && token === SERVICE_ROLE);

    if (isCron) {
      companyId = (typeof body.company_id === "string" && body.company_id) ? body.company_id : null;
      if (!companyId || !provider) return json({ error: "cron: company_id e provider richiesti" }, 400);
    } else {
      if (!token) return json({ error: "Unauthorized" }, 401);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      createdBy = user.id;

      // Risoluzione azienda — NON esiste alcuna tabella company_users. company_id dal
      // client (verificato con canAccessCompany) oppure quella effettiva in fallback.
      let resolvedCompanyId: string | null =
        (typeof body.company_id === "string" && body.company_id) ? body.company_id : null;
      if (resolvedCompanyId) {
        const ok = await canAccessCompany(supabase, user.id, resolvedCompanyId);
        if (!ok) return json({ error: "Accesso negato a questa azienda" }, 403);
      } else {
        resolvedCompanyId = await resolveEffectiveCompanyId(supabase, user.id);
      }
      if (!resolvedCompanyId) return json({ error: "Nessuna azienda associata all'utente" }, 404);
      companyId = resolvedCompanyId;
    }

    // Get integration
    const { data: integ } = await supabase
      .from("billing_integrations").select("*")
      .eq("company_id", companyId).eq("provider", provider!).eq("is_active", true).single();
    if (!integ) return json({ error: "Provider non connesso" }, 404);
    integId = integ.id;

    const adapter = createAdapter(integ);

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const importErrors: string[] = [];

    // Anagrafica: aggancia (o crea) il contatto cliente → invoices.client_id (FK marketing_contacts).
    // Cache per-run su P.IVA/CF: più fatture dello stesso cliente puntano allo stesso contatto
    // e non lo si ricrea. Best-effort: se fallisce, la fattura resta senza link (non blocca il sync).
    const contactCache = new Map<string, string>();
    // Chiavi già cercate in blocco e non trovate: si crea il contatto senza
    // rifare la select (una query in meno per ogni cliente nuovo).
    const cercatiAssenti = new Set<string>();
    /** Una query per pagina invece di una per fattura. */
    const precaricaClienti = async (lista: any[]) => {
      const vats = [...new Set(lista.map((x) => (x.clientVat || "").trim()).filter(Boolean))];
      const cfs = [...new Set(lista.filter((x) => !(x.clientVat || "").trim())
        .map((x) => (x.clientFiscalCode || "").trim()).filter(Boolean))];
      const cerca = async (colonna: "vat_number" | "fiscal_code", valori: string[]) => {
        const daCercare = valori.filter((v) => !contactCache.has(v.toUpperCase()) && !cercatiAssenti.has(v.toUpperCase()));
        for (let i = 0; i < daCercare.length; i += 200) {
          const blocco = daCercare.slice(i, i + 200);
          const { data, error } = await supabase.from("marketing_contacts").select(`id, ${colonna}`)
            .eq("company_id", companyId).is("deleted_at", null).in(colonna, blocco);
          if (error) return; // si ripiega sulla ricerca una alla volta
          const trovati = new Set<string>();
          (data || []).forEach((r: any) => {
            const k = String(r[colonna] ?? "").toUpperCase();
            if (k && !contactCache.has(k)) contactCache.set(k, r.id);
            trovati.add(k);
          });
          blocco.forEach((v) => { if (!trovati.has(v.toUpperCase())) cercatiAssenti.add(v.toUpperCase()); });
        }
      };
      await cerca("vat_number", vats);
      await cerca("fiscal_code", cfs);
    };
    const resolveClientId = async (x: any): Promise<string | null> => {
      const vat = (x.clientVat || "").trim();
      const cf = (x.clientFiscalCode || "").trim();
      if (!vat && !cf) return null;
      const key = (vat || cf).toUpperCase();
      if (contactCache.has(key)) return contactCache.get(key)!;
      try {
        if (!cercatiAssenti.has(key)) {
          let q = supabase.from("marketing_contacts").select("id")
            .eq("company_id", companyId).is("deleted_at", null).limit(1);
          q = vat ? q.eq("vat_number", vat) : q.eq("fiscal_code", cf);
          const { data: found } = await q.maybeSingle();
          if (found?.id) { contactCache.set(key, found.id); return found.id; }
        }
        const { data: created } = await supabase.from("marketing_contacts").insert({
          company_id: companyId,
          first_name: (x.clientName || "").trim() || "Cliente",
          company_name: x.clientName || null,
          vat_number: vat || null,
          fiscal_code: cf || null,
          email: x.clientEmail || null,
          address: x.clientAddress || null,
          city: x.clientCity || null,
          postal_code: x.clientZip || null,
          country: x.clientCountry || "IT",
          contact_type: "company",
          source: "fatturazione",
          tags: ["fatturazione"],
          unsubscribed: false,
          score: 0,
        }).select("id").single();
        if (created?.id) { contactCache.set(key, created.id); return created.id; }
      } catch { /* best-effort */ }
      return null;
    };

    // ── Commessa della fattura ────────────────────────────────────────────
    // Due strade, in ordine di affidabilità:
    //   1. il codice commessa scritto nella fattura → è una dichiarazione
    //      esplicita di chi l'ha emessa, vale da sola;
    //   2. cliente identificato (P.IVA / codice fiscale) + importo che
    //      corrisponde esattamente a UNA rata ancora scoperta di UNA sola
    //      commessa → i due indizi insieme non lasciano ambiguità.
    //
    // Tutto il resto NON viene agganciato qui: resta da confermare a mano in
    // "Abbina alle commesse". Una fattura sul cantiere sbagliato falsa il
    // margine di due commesse in un colpo solo, e nessuno se ne accorge —
    // meglio dieci da confermare che una sbagliata.
    type OrdCache = {
      id: string; code: string | null;
      cf: string | null;
      rate: { id: string; amount: number; invoice_id: string | null }[];
    };
    let ordersCache: OrdCache[] | null = null;

    const soloCifre = (v: unknown) =>
      String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^IT/, "");

    const caricaOrdini = async (): Promise<OrdCache[]> => {
      if (ordersCache !== null) return ordersCache;
      const { data: ords } = await supabase.from("orders")
        .select("id, order_code, customer_id").eq("company_id", companyId)
        .is("deleted_at", null);
      const lista = (ords || []) as any[];

      // Anagrafica cliente della commessa: sta su `profiles`, mentre
      // l'intestatario della fattura arriva dal provider.
      // Si confrontano partita IVA e codice fiscale: sono gli unici campi che
      // identificano davvero lo stesso soggetto fra i due mondi (nome ed email
      // sono somiglianze, non prove).
      const idClienti = [...new Set(lista.map((o) => o.customer_id).filter(Boolean))];
      const anag = new Map<string, { cf: string | null; piva: string | null }>();
      if (idClienti.length > 0) {
        const { data: prof, error: errProf } = await supabase.from("profiles")
          .select("id, fiscal_code, vat_number").in("id", idClienti);
        // L'errore va guardato: se la select fallisce, `prof` resta null e il
        // riconoscimento smetterebbe di funzionare senza dirlo a nessuno.
        if (errProf) console.error("billing-import: anagrafica clienti non letta:", errProf.message);
        (prof || []).forEach((p: any) => anag.set(p.id, { cf: p.fiscal_code ?? null, piva: p.vat_number ?? null }));
      }

      const { data: rate } = await supabase.from("order_installments")
        .select("id, order_id, amount, invoice_id, is_paid")
        .in("order_id", lista.map((o) => o.id));
      const ratePerOrdine = new Map<string, OrdCache["rate"]>();
      (rate || []).forEach((r: any) => {
        const arr = ratePerOrdine.get(r.order_id) || [];
        arr.push({ id: r.id, amount: Number(r.amount), invoice_id: r.invoice_id ?? null });
        ratePerOrdine.set(r.order_id, arr);
      });

      ordersCache = lista.map((o) => {
        const a = o.customer_id ? anag.get(o.customer_id) : undefined;
        return {
          id: o.id as string,
          code: o.order_code ? String(o.order_code).trim().toUpperCase() : null,
          cf: a?.cf ? soloCifre(a.cf) : null,
          piva: a?.piva ? soloCifre(a.piva) : null,
          rate: ratePerOrdine.get(o.id) || [],
        };
      });
      return ordersCache;
    };

    /** Restituisce la commessa e PERCHÉ, o null se non c'è certezza. */
    const resolveOrderId = async (x: any): Promise<{ id: string; origine: string } | null> => {
      const ordini = await caricaOrdini();

      // 1. Codice commessa nel testo: si prende il più lungo fra quelli
      //    presenti, altrimenti un codice corto beccherebbe tutto.
      const hay = `${x.number || ""} ${x.ficObject || ""} ${x.notes || ""}`.toUpperCase();
      if (hay.trim()) {
        const hit = ordini
          .filter((o) => o.code && o.code.length >= 4 && hay.includes(o.code))
          .sort((a, b) => (b.code!.length - a.code!.length))[0];
        if (hit) return { id: hit.id, origine: "codice" };
      }

      // 2. Cliente identificato + importo di una rata scoperta.
      const pivaF = soloCifre(x.clientVat || x.clientVatNumber);
      const cfF = soloCifre(x.clientFiscalCode);
      if (!pivaF && !cfF) return null;

      const totale = Math.round(Number(x.total || 0) * 100);
      if (totale <= 0) return null;

      const delCliente = ordini.filter((o) =>
        (pivaF && o.piva && o.piva === pivaF) || (cfF && o.cf && o.cf === cfF));
      if (delCliente.length === 0) return null;

      // Una sola commessa del cliente con una sola rata scoperta di
      // quell'importo: se i candidati sono due, decide una persona.
      const conRata = delCliente.filter((o) =>
        o.rate.filter((r) => !r.invoice_id && Math.abs(Math.round(r.amount * 100) - totale) <= 1).length === 1);
      if (conRata.length === 1) return { id: conRata[0].id, origine: "importo" };

      return null;
    };

    /**
     * Salva un blocco di fatture emesse. Esistenza letta in blocco e nuove
     * inserite in blocco (righe comprese): con migliaia di fatture le query una
     * per fattura erano metà del lavoro. Se l'insert in blocco fallisce si
     * ripiega su una alla volta, così una fattura sbagliata non ferma le altre.
     */
    const salvaFatture = async (lista: any[]) => {
    if (lista.length === 0) return;
    await precaricaClienti(lista);
    const esistenti = new Map<string, { id: string; order_id: string | null }>();
    const idEsterni = [...new Set(lista.map((i) => String(i.externalId ?? "")).filter(Boolean))];
    for (let i = 0; i < idEsterni.length; i += 200) {
      const { data, error } = await supabase.from("invoices").select("id, external_id, order_id")
        .eq("company_id", companyId).eq("external_provider", provider!)
        .in("external_id", idEsterni.slice(i, i + 200));
      if (error) throw new Error(`Lettura delle fatture già importate: ${error.message}`);
      (data || []).forEach((r: any) => esistenti.set(String(r.external_id), { id: r.id, order_id: r.order_id ?? null }));
    }
    const nuove: Array<{ inv: any; riga: Record<string, unknown> }> = [];

    for (const inv of lista) {
      const externalId = inv.externalId;
      const existing = esistenti.get(String(externalId)) ?? null;

      const clientId = await resolveClientId(inv);
      const match = await resolveOrderId(inv);

      const invoiceData = {
        company_id: companyId,
        document_type: inv.documentType || "invoice",
        status: inv.status || "issued",
        invoice_number: inv.number,
        client_id: clientId,
        client_company_name: inv.clientName,
        client_vat_number: inv.clientVat || null,
        client_fiscal_code: inv.clientFiscalCode || null,
        client_address: inv.clientAddress || null,
        client_city: inv.clientCity || null,
        client_zip: inv.clientZip || null,
        client_country: inv.clientCountry || "IT",
        client_pec: inv.clientPec || null,
        client_sdi_code: inv.clientSdi || null,
        issue_date: inv.issueDate,
        due_date: inv.dueDate || null,
        subtotal: inv.subtotal || 0,
        tax_amount: inv.taxAmount || 0,
        total: inv.total || 0,
        paid_amount: inv.paidAmount || 0,
        payment_method: inv.paymentMethod || null,
        bank_iban: inv.iban || null,
        notes: inv.notes || null,
        external_provider: provider,
        external_id: externalId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // NB: controllare SEMPRE l'errore — prima veniva ingoiato e il conteggio
        // mentiva ("100 importate" con 0 righe scritte se un trigger falliva).
        const { error: updErr } = await supabase.from("invoices")
          .update(match && !existing.order_id ? { ...invoiceData, order_id: match.id, order_match_origine: match.origine } : invoiceData)
          .eq("id", existing.id);
        if (updErr) { failed++; if (importErrors.length < 5) importErrors.push(`#${inv.number}: ${updErr.message}`); continue; }

        // Aggiorna le righe in modo atomico. Avvolto in try/catch PER FATTURA: un errore
        // sulle righe di una singola fattura non deve abortire l'intero import (prima il
        // throw di updateInvoiceLinesAtomically propagava al catch globale → 500 su tutto
        // il batch). La testata è comunque aggiornata: contiamo l'update e segnaliamo.
        if (inv.lines?.length) {
          try {
            await updateInvoiceLinesAtomically(existing.id, inv.lines);
          } catch (lineErr) {
            if (importErrors.length < 5) importErrors.push(`#${inv.number} (righe): ${String(lineErr)}`);
          }
        }
        updated++;
      } else {
        nuove.push({
          inv,
          riga: { ...invoiceData, created_by: createdBy, order_id: match?.id ?? null, order_match_origine: match?.origine ?? null },
        });
      }
    }

    if (nuove.length > 0) {
      const { data: inserite, error: bloccoErr } = await supabase.from("invoices")
        .insert(nuove.map((n) => n.riga)).select("id, external_id");
      if (!bloccoErr && inserite) {
        imported += inserite.length;
        const idPerEsterno = new Map((inserite as any[]).map((r) => [String(r.external_id), r.id as string]));
        const righe = nuove.flatMap((n) => {
          const id = idPerEsterno.get(String(n.inv.externalId));
          return id && n.inv.lines?.length ? mapLinesToDb(id, n.inv.lines) : [];
        });
        for (let i = 0; i < righe.length; i += 500) {
          // Controllare SEMPRE l'errore: prima veniva ingoiato → testata importata
          // ma righe mancanti silenziosamente (fattura senza dettaglio).
          const { error: lineErr } = await supabase.from("invoice_lines").insert(righe.slice(i, i + 500));
          if (lineErr && importErrors.length < 5) importErrors.push(`righe: ${lineErr.message}`);
        }
      } else {
        for (const { inv, riga } of nuove) {
          const { data: newInv, error: insErr } = await supabase.from("invoices").insert(riga).select("id").single();
          if (insErr || !newInv) {
            failed++;
            if (importErrors.length < 5) importErrors.push(`#${inv.number}: ${insErr?.message ?? "insert nullo"}`);
            continue;
          }
          if (inv.lines?.length) {
            const { error: lineErr } = await supabase.from("invoice_lines").insert(mapLinesToDb(newInv.id, inv.lines));
            if (lineErr && importErrors.length < 5) importErrors.push(`#${inv.number} (righe): ${lineErr.message}`);
          }
          imported++;
        }
      }
    }
    };

    // ── Fatture in Cloud: un pezzo del giro per invocazione ──────────────
    // Il cron di mezzogiorno/mattina e il pulsante «Sincronizza» avviano o
    // proseguono il giro; billing_import_riprendi() lo prosegue ogni 2 minuti
    // finché non è finito (source = pg_cron_recupero, che non ne avvia mai uno).
    const passoImportFic = async () => {
      const adesso = new Date();
      const tick = body.source === "pg_cron_recupero";

      // Un import alla volta per integrazione: il cron, il recupero e il
      // pulsante possono partire insieme.
      const { data: preso, error: leaseErr } = await supabase.from("billing_integrations")
        .update({ import_in_corso_da: adesso.toISOString() })
        .eq("id", integ.id)
        .or(`import_in_corso_da.is.null,import_in_corso_da.lt.${new Date(adesso.getTime() - FIC_LEASE_MS).toISOString()}`)
        .select("id").maybeSingle();
      if (leaseErr) throw new Error(`Import non avviato: ${leaseErr.message}`);
      const precedente = leggiStato(integ.import_stato);
      if (!preso) {
        return {
          success: true, in_corso: true, gia_in_corso: true,
          avanzamento: precedente ? avanzamento(precedente) : null,
          messaggio: "L'import da Fatture in Cloud è già in corso: prosegue da solo.",
        };
      }
      const liberaLease = () => supabase.from("billing_integrations").update({ import_in_corso_da: null }).eq("id", integ.id);

      let stato: StatoImport;
      if (precedente?.in_corso) {
        if (tick && precedente.sospeso_fino_a && new Date(precedente.sospeso_fino_a) > adesso) {
          await liberaLease();
          return { success: true, in_corso: true, sospeso_fino_a: precedente.sospeso_fino_a };
        }
        // Chi lo avvia a mano (o il cron programmato) toglie la pausa.
        stato = tick ? precedente : { ...precedente, sospeso_fino_a: null };
      } else {
        if (tick) { await liberaLease(); return { success: true, in_corso: false, nulla_da_fare: true }; }
        stato = nuovoGiro(precedente, adesso);
      }

      const salvaStato = () => supabase.from("billing_integrations").update({ import_stato: stato }).eq("id", integ.id);
      const ricevute = { imported: 0, updated: 0, failed: 0 };
      const inizio = Date.now();
      let pagine = 0;
      let erroreRun: string | null = null;

      try {
        await ensureFreshFicToken(integ);
        const base = `https://api-v2.fattureincloud.it/c/${integ.company_external_id}`;
        const h = { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" };

        while (pagine < FIC_PAGINE_PER_GIRO && Date.now() - inizio < FIC_BUDGET_MS) {
          const flusso = prossimoFlusso(stato);
          if (!flusso) break;
          const path = flusso === "received" ? "received_documents" : "issued_documents";
          const r = await fetch(`${base}/${path}?${new URLSearchParams(parametriPagina(stato, flusso))}`, { headers: h });
          if (r.status === 401) throw new Error("Token Fatture in Cloud scaduto: ricollega l'account da Impostazioni › Fatturazione.");
          // 403 sulle ricevute = permesso non concesso (collegamento vecchio):
          // non ferma le emesse, ma va detto all'utente, non è «zero ricevute».
          if (r.status === 403 && flusso === "received") {
            stato = {
              ...stato,
              permesso_ricevute_mancante: true,
              flussi: { ...stato.flussi, received: { ...stato.flussi.received, fatto: true } },
            };
            await salvaStato();
            continue;
          }
          if (!r.ok) throw new Error(`Fatture in Cloud (${path}) ha risposto ${r.status}`);
          const d = await r.json();
          const docs: any[] = Array.isArray(d?.data) ? d.data : [];

          const prima = { imported, updated, failed };
          if (flusso === "received") {
            const e = await salvaRicevuteFic(docs, companyId!);
            e.errori.forEach((m) => { if (importErrors.length < 5) importErrors.push(m); });
            ricevute.imported += e.imported; ricevute.updated += e.updated; ricevute.failed += e.failed;
            imported += e.imported; updated += e.updated; failed += e.failed;
          } else {
            await salvaFatture(docs.map(mappaEmessaFic));
          }

          stato = {
            ...stato,
            importati: stato.importati + (imported - prima.imported),
            aggiornati: stato.aggiornati + (updated - prima.updated),
            falliti: stato.falliti + (failed - prima.failed),
            errori_consecutivi: 0,
            flussi: {
              ...stato.flussi,
              [flusso]: dopoPagina(stato.flussi[flusso], {
                ricevuti: docs.length,
                ultimaPagina: Number(d?.last_page) || null,
                totale: Number.isFinite(Number(d?.total)) ? Number(d.total) : null,
              }),
            },
          };
          pagine++;
          // Cursore salvato dopo OGNI pagina: se la funzione muore, si riparte da qui.
          await salvaStato();
        }
      } catch (e) {
        erroreRun = e instanceof Error ? e.message : String(e);
        stato = dopoErrore(stato, erroreRun, new Date());
      }

      for (const err of importErrors) {
        if (stato.errori.length >= 5) break;
        if (!stato.errori.includes(err)) stato = { ...stato, errori: [...stato.errori, err] };
      }
      stato = chiudiSeFinito(stato, new Date());
      const finito = !stato.in_corso;
      const syncStatus = erroreRun
        ? "error"
        : !finito ? "in_corso"
        : (stato.falliti > 0 || stato.permesso_ricevute_mancante) ? "partial" : "success";
      const messaggioPermesso = "Fatture ricevute non importate: al collegamento manca il permesso sui documenti ricevuti. Ricollega l'account dalle impostazioni.";
      const erroriVisibili = [
        ...(erroreRun ? [erroreRun] : []),
        ...(stato.permesso_ricevute_mancante ? [messaggioPermesso] : []),
        ...(finito ? stato.errori : []),
      ];

      await supabase.from("billing_integrations").update({
        import_stato: stato,
        import_in_corso_da: null,
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncStatus,
        last_sync_error: erroriVisibili.length > 0 ? [...new Set(erroriVisibili)].join(" | ") : null,
        ...(stato.permesso_ricevute_mancante || finito ? { received_scope_missing: stato.permesso_ricevute_mancante } : {}),
      }).eq("id", integ.id);

      const av = avanzamento(stato);
      await supabase.from("billing_sync_log").insert({
        company_id: companyId,
        provider: provider!,
        direction: "pull",
        action: "import",
        status: syncStatus,
        error_message: erroreRun,
        response_payload: {
          giro: stato.tipo, pagine, imported, updated, failed, received: ricevute,
          avanzamento: av, finito, fonte: body.source ?? "utente", errors: importErrors,
        },
      });

      return {
        success: !erroreRun,
        ...(erroreRun ? { error: erroreRun } : {}),
        in_corso: stato.in_corso,
        giro: stato.tipo,
        imported, updated, failed,
        received: ricevute,
        avanzamento: av,
        errors: importErrors,
      };
    };

    if (provider === "fattureincloud") {
      return json(await passoImportFic());
    }

    // Altri provider: scaricano tutto e salvano in un colpo (volumi piccoli).
    const invoices = await fetchProviderInvoices(adapter, integ);
    await salvaFatture(invoices);

    // FATTURE PASSIVE (cassetto SDI): Aruba qui, FIC nel giro a blocchi
    // (passoImportFic), in tabella dedicata fatture_ricevute. Non blocca l'import delle emesse se fallisce
    // (best-effort). Gli altri provider restano solo-emesse finché il loro
    // endpoint ricevute non è validato su account reale.
    let received: { imported: number; updated: number; failed: number; noPermission?: boolean } =
      { imported: 0, updated: 0, failed: 0 };
    if (provider === "aruba") {
      try {
        received = await importArubaReceived(integ, companyId!);
      } catch (e) {
        if (importErrors.length < 5) importErrors.push(`passive: ${String(e)}`);
      }
    }
    // Il permesso mancante è un FATTO che l'utente deve poter leggere in
    // pagina, non una riga di log: serve un suo gesto (ricollegare l'account).
    const permessoRicevuteMancante = received.noPermission === true;
    if (permessoRicevuteMancante) {
      importErrors.push(
        "Fatture ricevute non importate: al collegamento manca il permesso sui documenti ricevuti. Ricollega l'account dalle impostazioni.",
      );
    }

    // Update last sync — lo stato riflette le fallite: "partial" se qualcosa è andato
    // storto, così l'header non mostra "success" mascherando import incompleti.
    const syncStatus = (failed > 0 || received.failed > 0 || permessoRicevuteMancante) ? "partial" : "success";
    await supabase.from("billing_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: syncStatus,
      // Prima l'errore veniva scritto SOLO se erano fallite delle emesse: un
      // import passive a zero per mancanza di permesso restava muto ovunque.
      last_sync_error: importErrors.length > 0 ? importErrors.join(" | ") : null,
      received_scope_missing: permessoRicevuteMancante,
    }).eq("id", integ.id);

    // Fix #8: Use correct column names for billing_sync_log
    await supabase.from("billing_sync_log").insert({
      company_id: companyId,
      provider: provider!,
      direction: "pull",
      action: "import",
      status: syncStatus,
      response_payload: { imported, updated, failed, total: invoices.length, received, errors: importErrors },
    });

    return json({ success: true, imported, updated, failed, total: invoices.length, received, errors: importErrors });
  } catch (e) {
    console.error("billing-import error:", e);

    // Fix #4: Log error to billing_integrations and billing_sync_log
    if (integId) {
      try {
        await supabase.from("billing_integrations").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: String(e),
        }).eq("id", integId);
      } catch { /* best effort */ }
    }
    if (companyId && provider) {
      try {
        await supabase.from("billing_sync_log").insert({
          company_id: companyId,
          provider,
          direction: "pull",
          action: "import",
          status: "error",
          error_message: String(e),
        });
      } catch { /* best effort */ }
    }

    return json({ error: String(e) }, 500);
  }
});

// Fix #5: Atomic line update helper
function mapLinesToDb(invoiceId: string, lines: any[]) {
  return lines.map((l: any, i: number) => ({
    invoice_id: invoiceId,
    description: l.description,
    product_code: l.productCode || null,
    unit: l.unit || "pz",
    // Coercizione difensiva come il ramo passive: se il provider omette quantity/
    // unit_price → Number(... ?? 1/0), mai NaN (che corromperebbe la riga e, via
    // trigger SUM(righe), la testata).
    quantity: Number(l.quantity ?? 1),
    unit_price: Number(l.unitPrice ?? 0),
    discount_percent: l.discountPercent || 0,
    tax_rate: l.taxRate,
    tax_nature: l.taxNature || null,
    line_net: l.lineNet || 0,
    line_tax: l.lineTax || 0,
    line_gross: l.lineGross || 0,
    sort_order: i,
  }));
}

async function updateInvoiceLinesAtomically(invoiceId: string, lines: any[]) {
  // TODO: spostare delete+insert in una RPC Postgres transazionale (oggi sono due
  // chiamate REST separate → se l'edge muore tra delete e insert la fattura resta con
  // 0 righe/total=0). Lato DB lo farà il parent; qui riduciamo la finestra col guard sotto.

  // Read existing lines: serve sia per il guard "solo se cambiate" sia per il rollback.
  const { data: oldLines } = await supabase
    .from("invoice_lines").select("*").eq("invoice_id", invoiceId);

  const newRows = mapLinesToDb(invoiceId, lines);

  // Guard: se le righe a DB sono identiche a quelle nuove, NON toccare nulla. Elimina il
  // delete+insert inutile (oggi riscrive TUTTE le fatture 2×/giorno) e la relativa finestra
  // di rischio. I numeric tornano da PostgREST come stringhe → Number() su entrambi i lati.
  const lineSig = (rows: any[]) => JSON.stringify(
    (rows || [])
      .map((r: any) => ({
        description: r.description ?? null,
        product_code: r.product_code ?? null,
        unit: r.unit ?? null,
        quantity: Number(r.quantity ?? 0),
        unit_price: Number(r.unit_price ?? 0),
        discount_percent: Number(r.discount_percent ?? 0),
        tax_rate: Number(r.tax_rate ?? 0),
        tax_nature: r.tax_nature ?? null,
        line_net: Number(r.line_net ?? 0),
        line_tax: Number(r.line_tax ?? 0),
        line_gross: Number(r.line_gross ?? 0),
        sort_order: Number(r.sort_order ?? 0),
      }))
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
  );
  if (oldLines?.length && lineSig(oldLines) === lineSig(newRows)) return;

  // Delete old lines
  await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);

  // Insert new lines
  const { error: insertErr } = await supabase.from("invoice_lines").insert(newRows);

  // If insert fails, restore old lines
  if (insertErr && oldLines?.length) {
    console.error("Line insert failed, restoring old lines:", insertErr);
    const restore = oldLines.map(({ id: _id, ...rest }) => rest);
    await supabase.from("invoice_lines").insert(restore);
    throw new Error(`Failed to update invoice lines: ${insertErr.message}`);
  }
}

// Provider-specific fetch logic
async function fetchProviderInvoices(adapter: any, integ: any): Promise<any[]> {
  const provider = integ.provider;

  // fattureincloud: import a blocchi nel gestore (passoImportFic), non qui.
  if (provider === "fattura24") return await fetchFattura24Invoices(integ);
  if (provider === "aruba") return await fetchArubaInvoices(integ);
  if (provider === "invoicetronic") return await fetchInvoicetronicInvoices(integ);
  if (provider === "itala") return await fetchItalaInvoices(integ);
  if (provider === "acube") return await fetchAcubeInvoices(integ);

  return [];
}

// FIX AUDIT: l'import non rinfrescava il token FIC (lo faceva solo billing-sync)
// → dopo la scadenza l'import andava in 401. Ora, se il token è scaduto/quasi,
// lo rinnoviamo col refresh_token e aggiorniamo il DB prima di chiamare l'API.
async function ensureFreshFicToken(integ: any): Promise<void> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 60_000) return; // ancora valido (>60s)
  if (!integ.refresh_token || !FIC_CLIENT_ID || !FIC_CLIENT_SECRET) return; // niente refresh possibile

  // Advisory lock anti-race (stessa logica di billing-sync): FIC RUOTA il refresh_token,
  // due refresh concorrenti (cron + manuale) lo invaliderebbero a vicenda → 401 e
  // integrazione scollegata. Un solo worker rinnova, gli altri ri-leggono il token.
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
    if (!r.ok) return; // lascia il token vecchio: l'API darà 401 con messaggio chiaro
    const td = await r.json();
    if (!td.access_token) return;
    integ.access_token = td.access_token; // aggiorna in-memory per questa run
    await supabase.from("billing_integrations").update({
      access_token: td.access_token,
      refresh_token: td.refresh_token || integ.refresh_token,
      token_expires_at: new Date(Date.now() + (td.expires_in || 86400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", integ.id);
  } catch { /* best effort: se il refresh fallisce procediamo col token attuale */ }
  finally {
    await supabase.rpc("release_token_refresh_lock", { p_integration_id: integ.id });
  }
}

/** Documento emesso di FIC (fieldset=detailed) → forma comune dell'import. */
function mappaEmessaFic(doc: any): any {
  const statusMap: Record<string, string> = {
    ok: "delivered", sending: "sent", not_sent: "issued", error: "issued",
  };
  const isCreditNote = doc.type === "credit_note";
  // Una nota di credito è uno storno, non un incasso: non applichiamo la logica "pagata".
  // Pagato: FIC tiene le rate in payments_list[] ({amount, due_date, paid_date, status}).
  // `payments_sum` NON è un campo del fieldset list → il vecchio check era sempre falso
  // (0/193 incassate). Sommiamo le rate effettivamente saldate (paid_date o status 'paid').
  const _payList: any[] = Array.isArray(doc.payments_list) ? doc.payments_list : [];
  const _paidFromList = _payList
    .filter((p: any) => p && (p.paid_date || p.status === "paid"))
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const _gross = Number(doc.amount_gross || 0);
  const _paidAmt = isCreditNote ? 0
    : (doc.is_marked === true && _paidFromList === 0 ? _gross : Math.round(_paidFromList * 100) / 100);
  const isPaid = !isCreditNote && _gross > 0 && _paidAmt >= _gross - 0.01;
  // Nota di credito con tutte le rate saldate su FIC = rimborso fatto: la
  // scadenza di uscita nasce chiusa invece di restare «da pagare» per anni.
  // paid_amount resta 0 (lo storno non è un incasso).
  const ncSaldata = isCreditNote && _payList.length > 0 && _payList.every((p: any) => p && (p.paid_date || p.status === "paid"));
  const resolvedStatus = (isPaid || ncSaldata) ? "paid" : (statusMap[doc.status] || "issued");

  return {
    externalId: doc.id?.toString(),
    documentType: isCreditNote ? "credit_note" : "invoice",
    number: doc.number?.value || doc.number,
    notes: doc.notes || null,
    ficObject: doc.subject || doc.visible_subject || null,
    status: resolvedStatus,
    paidAmount: _paidAmt,
    clientName: doc.entity?.name || "",
    clientEmail: doc.entity?.email || null,
    clientVat: doc.entity?.vat_number,
    clientFiscalCode: doc.entity?.tax_code,
    clientAddress: doc.entity?.address_street,
    clientCity: doc.entity?.address_city,
    clientZip: doc.entity?.address_postal_code,
    clientCountry: doc.entity?.address_country || "IT",
    clientSdi: doc.entity?.ei_code,
    clientPec: doc.entity?.certified_email,
    issueDate: doc.date,
    // FIC tiene la scadenza in payments_list (per rata), non sempre in due_date.
    // Recuperiamo la prima scadenza così la fattura genera la riga nello scadenzario.
    dueDate: doc.due_date || doc.payments_list?.[0]?.due_date || null,
    subtotal: doc.amount_net,
    taxAmount: doc.amount_vat,
    total: doc.amount_gross,
    paymentMethod: doc.payment_method?.name,
    iban: doc.payment_account?.iban || null,
    lines: (doc.items_list || []).map((item: any) => {
      // BUG FISCALE: `item.vat?.value || 22` trasformava l'IVA 0 in 22%.
      // In JS `0 || 22 === 22`, quindi i forfettari (IVA 0, Natura N2.2) e
      // le righe esenti/non imponibili (N1..N7) di una SRL prendevano un
      // 22% fantasma. L'aliquota va LETTA da FIC preservando lo 0; se manca
      // del tutto NON si inventa IVA (0), mai un default a 22.
      const vatRaw = item.vat?.value;
      const taxRate = Number.isFinite(Number(vatRaw)) ? Number(vatRaw) : 0;
      // Coercizione difensiva come il ramo passive (~importFICReceived): se FIC omette
      // qty/net_price/discount → Number(... ?? 1/0), mai NaN nelle righe/totali.
      const qty = Number(item.qty ?? 1);
      const unitPrice = Number(item.net_price ?? 0);
      const discount = Number(item.discount ?? 0);
      const lineNet = Math.round(unitPrice * qty * (1 - discount / 100) * 100) / 100;
      const lineTax = Math.round(lineNet * (taxRate / 100) * 100) / 100;
      return {
        description: item.name,
        productCode: item.product_code,
        quantity: qty,
        unit: item.measure,
        unitPrice: unitPrice,
        discountPercent: discount,
        taxRate,
        // Natura IVA da FIC (N2.2 forfettario, N1..N7): serve per esenti/
        // non imponibili e per la coerenza in XML/anteprima.
        taxNature: item.vat?.ei_type || null,
        lineNet,
        lineTax,
        lineGross: Math.round((lineNet + lineTax) * 100) / 100,
      };
    }),
  };
}

// ── FATTURE PASSIVE (ricevute dai fornitori) da Fatture in Cloud ──────────────
// Endpoint gemello /received_documents (stesso host/paginazione/fieldset di issued,
// MA niente filtro ?type — il tipo è nel campo doc.type). Le passive vanno nella
// tabella DEDICATA `fatture_ricevute` (colonne cedente_*), non in `invoices`.
// doc.entity qui è il FORNITORE (cedente). Dedup su (company_id, cedente_piva,
// numero_fattura, data_fattura) come l'unique naturale della tabella.
/**
 * Numero del documento ricevuto. FIC lo tiene in `invoice_number` (non in
 * `number` come per le emesse): leggendo `number` ogni ricevuta risultava senza
 * numero e veniva scartata. Le spese senza numero (scontrini, ricevute) prendono
 * l'id FIC, così entrano comunque e non si duplicano.
 */
function numeroRicevuta(doc: any): string {
  const n = doc?.invoice_number ?? doc?.number?.value ?? doc?.number ?? null;
  const s = n == null ? "" : String(n).trim();
  return s || (doc?.id != null ? `FIC-${doc.id}` : "");
}

async function salvaRicevuteFic(all: any[], companyId: string): Promise<{ imported: number; updated: number; failed: number; errori: string[] }> {
  const errori: string[] = [];
  // Righe già presenti lette in blocco (una query per pagina invece di una per
  // documento), poi insert in blocco dei nuovi con ripiego uno alla volta.
  const chiave = (numero: string, data: string, piva: string | null) => `${numero}|${data}|${piva ?? ""}`;
  const numeri = [...new Set(all.map(numeroRicevuta).filter(Boolean))];
  const esistenti = new Map<string, string>();
  for (let i = 0; i < numeri.length; i += 200) {
    const { data, error } = await supabase.from("fatture_ricevute")
      .select("id, numero_fattura, data_fattura, cedente_piva")
      .eq("company_id", companyId).in("numero_fattura", numeri.slice(i, i + 200));
    if (error) throw new Error(`Lettura delle fatture ricevute già importate: ${error.message}`);
    (data || []).forEach((r: any) => esistenti.set(chiave(String(r.numero_fattura), String(r.data_fattura), r.cedente_piva ?? null), r.id));
  }
  const nuove: any[] = [];
  const nuoveChiavi = new Map<string, number>();

  let imported = 0, updated = 0, failed = 0;
  for (const doc of all) {
    const e = doc.entity || {};
    const cedentePiva = e.vat_number || null;
    const numero = numeroRicevuta(doc);
    const dataFattura = doc.date || null;
    if (!numero || !dataFattura) {
      failed++;
      if (errori.length < 3) errori.push(`ricevuta FIC ${doc.id ?? "?"}: ${!dataFattura ? "senza data" : "senza numero"}`);
      continue;
    }

    const righe = (doc.items_list || []).map((item: any) => {
      // Stesso principio del blocco attive: preserva l'IVA 0 (forfettario/
      // esente/non imponibile), mai un default a 22%.
      const vatRaw = item.vat?.value;
      const taxRate = Number.isFinite(Number(vatRaw)) ? Number(vatRaw) : 0;
      const qty = Number(item.qty ?? 1);
      const net = Math.round(Number(item.net_price ?? 0) * qty * (1 - (Number(item.discount ?? 0)) / 100) * 100) / 100;
      const tax = Math.round(net * (taxRate / 100) * 100) / 100;
      return {
        descrizione: item.name, quantita: qty, prezzo_unitario: Number(item.net_price ?? 0),
        aliquota_iva: taxRate, imponibile: net, imposta: tax, totale: Math.round((net + tax) * 100) / 100,
      };
    });

    const row = {
      company_id: companyId,
      cedente_ragione_sociale: e.name || "Fornitore",
      cedente_piva: cedentePiva,
      cedente_cf: e.tax_code || null,
      cedente_paese: e.country_iso || e.address_country || "IT",
      cedente_indirizzo: e.address_street || null,
      cedente_cap: e.address_postal_code || null,
      cedente_comune: e.address_city || null,
      cedente_provincia: e.address_province || null,
      tipo_documento: doc.type || "TD01",
      numero_fattura: numero,
      data_fattura: dataFattura,
      imponibile_totale: Number(doc.amount_net ?? 0),
      iva_totale: Number(doc.amount_vat ?? 0),
      totale_documento: Number(doc.amount_gross ?? 0),
      righe,
      updated_at: new Date().toISOString(),
    };

    // Dedup su chiave naturale (company, numero, data, cedente_piva anche null).
    const k = chiave(numero, String(dataFattura), cedentePiva);
    const idEsistente = esistenti.get(k);
    if (idEsistente) {
      const { error } = await supabase.from("fatture_ricevute").update(row).eq("id", idEsistente);
      if (error) { failed++; if (errori.length < 3) errori.push(`ricevuta ${numero}: ${error.message}`); } else updated++;
    } else if (nuoveChiavi.has(k)) {
      // Stesso documento due volte nella pagina: vale l'ultimo, un insert solo.
      nuove[nuoveChiavi.get(k)!] = row;
    } else {
      nuoveChiavi.set(k, nuove.length);
      nuove.push(row);
    }
  }
  if (nuove.length > 0) {
    const { error } = await supabase.from("fatture_ricevute").insert(nuove);
    if (!error) {
      imported += nuove.length;
    } else {
      for (const row of nuove) {
        const { error: e } = await supabase.from("fatture_ricevute").insert(row);
        if (e) { failed++; if (errori.length < 3) errori.push(`ricevuta ${row.numero_fattura}: ${e.message}`); } else imported++;
      }
    }
  }
  return { imported, updated, failed, errori };
}

/**
 * Fatture RICEVUTE da Aruba (cassetto SDI): GET /services/invoice/in/findByUsername.
 * Il controparte è `sender` (il fornitore). Come per le emesse, la lista Aruba NON
 * espone gli importi (servirebbe l'XML p7m firmato): importiamo header + anagrafica
 * cedente + stato, con importi a null e nota esplicita — mai zeri finti.
 * Dedup sulla stessa chiave naturale di FIC (company, numero, data, cedente_piva).
 */
async function importArubaReceived(integ: any, companyId: string): Promise<{ imported: number; updated: number; failed: number }> {
  const token = await ensureFreshArubaToken(integ);
  const username = integ.company_external_id;

  const items: any[] = [];
  let page = 1;
  while (true) {
    const d = await arubaFindInByUsername(token, username, { page, size: 50 });
    const content = (d.content || []) as any[];
    items.push(...content);
    const totalPages = d.totalPages || 1;
    if (page >= totalPages) break;
    page++;
    if (page > 20) break; // safety cap: max ~1000 file
  }

  let imported = 0, updated = 0, failed = 0;
  for (const item of items) {
    const sender = (item.sender || {}) as Record<string, any>;
    const cedentePiva = sender.vatCode || null;
    // Un file XML può contenere più fatture (lotto): iteriamo invoices[].
    for (const inv of (item.invoices || [])) {
      const numero = (inv.number ?? "").toString();
      const dataFattura = inv.invoiceDate || null;
      if (!numero || !dataFattura) { failed++; continue; }

      const row = {
        company_id: companyId,
        cedente_ragione_sociale: sender.description || "Fornitore",
        cedente_piva: cedentePiva,
        cedente_cf: sender.fiscalCode || null,
        cedente_paese: sender.countryCode || "IT",
        tipo_documento: "TD01", // il TD reale è nell'XML, non nella lista Aruba
        numero_fattura: numero,
        data_fattura: dataFattura,
        imponibile_totale: null, // limite API Aruba: importi solo nell'XML p7m
        iva_totale: null,
        totale_documento: null,
        note: "Importata dal cassetto SDI Aruba. Importi non inclusi nella lista Aruba: apri l'XML sul portale Aruba per il dettaglio.",
        updated_at: new Date().toISOString(),
      };

      let q = supabase.from("fatture_ricevute").select("id")
        .eq("company_id", companyId).eq("numero_fattura", numero).eq("data_fattura", dataFattura);
      q = cedentePiva ? q.eq("cedente_piva", cedentePiva) : q.is("cedente_piva", null);
      const { data: existing } = await q.maybeSingle();

      if (existing) {
        // Non sovrascrivere con null gli importi eventualmente già arricchiti a mano/AI.
        const { imponibile_totale: _i, iva_totale: _v, totale_documento: _t, note: _n, ...header } = row;
        const { error } = await supabase.from("fatture_ricevute").update(header).eq("id", existing.id);
        if (error) failed++; else updated++;
      } else {
        const { error } = await supabase.from("fatture_ricevute").insert(row);
        if (error) failed++; else imported++;
      }
    }
  }
  return { imported, updated, failed };
}

async function fetchFattura24Invoices(integ: any): Promise<any[]> {
  const r = await fetch("https://www.fattura24.com/api/v0/getDocuments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: integ.api_key, documentType: "FT", limit: 50 }),
  });
  if (!r.ok) throw new Error(`Fattura24 API error: ${r.status}`);
  const d = await r.json();
  
  return (d.documents || []).map((doc: any) => ({
    externalId: doc.docId?.toString(),
    documentType: "invoice",
    number: doc.number,
    status: "issued",
    clientName: doc.customerName || "",
    clientVat: doc.customerVat,
    issueDate: doc.date,
    dueDate: doc.dueDate,
    total: doc.totalAmount || 0,
    subtotal: doc.netAmount || 0,
    taxAmount: doc.vatAmount || 0,
    lines: [],
  }));
}

// Aruba: cache del token (reuse → refresh → signin). /auth/signin è limitato a
// 1/min, quindi rinnoviamo via refresh_token quando possibile e rifacciamo il signin
// (con username+password salvati) solo se il refresh non è disponibile/scaduto.
async function ensureFreshArubaToken(integ: any): Promise<string> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && exp - Date.now() > 120_000) return integ.access_token; // valido >2min

  let tok: { access_token: string; refresh_token?: string; expires_in: number } | null = null;
  if (integ.refresh_token) {
    try { tok = await arubaRefresh(integ.refresh_token); } catch { /* refresh scaduto → signin */ }
  }
  if (!tok) {
    if (!integ.company_external_id || !integ.api_key)
      throw new Error("Aruba: credenziali mancanti. Riconnetti l'account in Impostazioni → Provider esterni.");
    tok = await arubaSignin(integ.company_external_id, integ.api_key);
  }

  integ.access_token = tok.access_token; // aggiorna in-memory per questa run
  await supabase.from("billing_integrations").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || integ.refresh_token,
    token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integ.id);
  return tok.access_token;
}

async function fetchArubaInvoices(integ: any): Promise<any[]> {
  const token = await ensureFreshArubaToken(integ);
  const username = integ.company_external_id;
  const out: any[] = [];
  let page = 1;
  while (true) {
    const d = await arubaFindByUsername(token, username, { page, size: 50 });
    const content = (d.content || []) as any[];
    for (const item of content) {
      const sdiId = item.idSdi?.toString();
      const receiver = item.receiver || {};
      // Un singolo file XML può contenere più fatture (ordinaria): iteriamo invoices[].
      for (const inv of (item.invoices || [])) {
        out.push({
          externalId: item.id?.toString() ?? `${item.filename}:${inv.number}`,
          documentType: "invoice", // il tipo TD reale è nell'XML, non nella lista Aruba
          number: inv.number,
          status: ARUBA_STATUS_MAP[inv.status] || "issued",
          externalStatus: inv.status,
          clientName: receiver.description || "",
          clientVat: receiver.vatCode,
          clientFiscalCode: receiver.fiscalCode,
          clientCountry: receiver.countryCode || "IT",
          issueDate: inv.invoiceDate,
          // ⚠️ Aruba NON espone gli importi nella lista (servirebbe l'XML p7m firmato):
          // header + stato SDI sono importati; i totali restano 0 (limite API Aruba).
          total: 0, subtotal: 0, taxAmount: 0,
          sdiId,
          lines: [],
        });
      }
    }
    const totalPages = d.totalPages || 1;
    if (page >= totalPages) break;
    page++;
    if (page > 20) break; // safety cap: max ~1000 fatture
  }
  return out;
}

// A-Cube (BETA): JWT 24h. Riusa il token finché valido, altrimenti rifà il login
// (la doc raccomanda di non rifarlo più spesso di ogni 24h).
async function ensureFreshAcubeToken(integ: any): Promise<string> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && exp - Date.now() > 300_000) return integ.access_token; // valido >5min
  if (!integ.company_external_id || !integ.api_key)
    throw new Error("A-Cube: credenziali mancanti. Riconnetti l'account.");
  const token = await acubeLogin(integ.company_external_id, integ.api_key);
  integ.access_token = token;
  await supabase.from("billing_integrations").update({
    access_token: token,
    token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integ.id);
  return token;
}

async function fetchAcubeInvoices(integ: any): Promise<any[]> {
  const token = await ensureFreshAcubeToken(integ);
  const out: any[] = [];
  let page = 1;
  while (true) {
    const d = await acubeListInvoices(token, { page, itemsPerPage: 100 });
    const members = (d["hydra:member"] || []) as any[];
    for (const m of members) {
      // ⚠️ A-Cube BETA: id (uuid) e stato (marking) sono verificati; gli altri campi
      // (numero/data/importi/cliente) hanno nomi NON confermati → best-effort multi-chiave,
      // da validare su account sandbox prima di farci affidamento sugli importi.
      out.push({
        externalId: (m.uuid || m["@id"] || "").toString(),
        documentType: "invoice",
        number: m.number ?? m.invoice_number ?? m.document_number ?? null,
        status: ACUBE_MARKING_MAP[m.marking] || "issued",
        externalStatus: m.marking,
        clientName: m.recipient_name ?? m.customer_name ?? m.cessionario?.denominazione ?? "",
        clientVat: m.recipient_vat ?? m.customer_vat ?? null,
        issueDate: m.date ?? m.invoice_date ?? m.created_at ?? null,
        total: Number(m.amount ?? m.total ?? m.amount_total ?? 0) || 0,
        subtotal: 0, taxAmount: 0,
        lines: [],
      });
    }
    const next = (d["hydra:view"] as any)?.["hydra:next"];
    if (!next || members.length === 0) break;
    page++;
    if (page > 20) break; // safety cap
  }
  return out;
}

async function fetchInvoicetronicInvoices(integ: any): Promise<any[]> {
  const r = await fetch("https://api.invoicetronic.com/invoice/v1/send?limit=50", {
    headers: { "x-api-key": integ.api_key, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Invoicetronic API error: ${r.status}`);
  const d = await r.json();
  
  const statusMap: Record<string, string> = {
    Delivered: "delivered", Sent: "sent", Pending: "sent",
    Error: "issued", Paid: "paid", Accepted: "delivered",
  };

  return (d.data || d || []).map((doc: any) => ({
    externalId: doc.id?.toString(),
    documentType: doc.tipo_documento === "TD04" ? "credit_note" : "invoice",
    number: doc.numero,
    status: statusMap[doc.status] || "issued",
    clientName: doc.cessionario_committente?.denominazione || "",
    clientVat: doc.cessionario_committente?.partita_iva,
    issueDate: doc.data,
    dueDate: doc.data_scadenza,
    total: doc.importo_totale || 0,
    subtotal: 0,
    taxAmount: 0,
    lines: [],
  }));
}

// ITALA (fattura-elettronica-api.it) — intermediario SDI. Bearer token per-account.
// GET /fatture paginato (per_page max 1000). Stato SDI in sdi_stato.
// NOTA: i nomi esatti dei campi della risposta non sono stati verificati su un
// account reale → mapping difensivo. Da validare al primo collegamento vero.
async function fetchItalaInvoices(integ: any): Promise<any[]> {
  const base = "https://fattura-elettronica-api.it/ws2.0/prod";
  const h = { Authorization: `Bearer ${integ.api_key}`, "Content-Type": "application/json" };
  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${base}/fatture?per_page=100&page=${page}`, { headers: h });
    if (r.status === 401) throw new Error("Token ITALA non valido. Verifica la chiave in Impostazioni → Provider esterni.");
    if (!r.ok) throw new Error(`ITALA API error: ${r.status}`);
    const d = await r.json();
    const docs = d.fatture || d.data || (Array.isArray(d) ? d : []);
    all.push(...docs);
    if (docs.length < 100) break;
    page++;
    if (page > 20) break; // safety cap
  }
  const statusMap: Record<string, string> = {
    INVI: "sent", PREN: "sent", CONS: "delivered", ERRO: "issued", NONC: "issued",
    ACCE: "delivered", RIFI: "issued", DECO: "delivered",
  };
  return all.map((doc: any) => ({
    externalId: (doc.id ?? doc.sdi_id ?? doc.sdi_identificativo)?.toString(),
    documentType: "invoice",
    number: doc.numero ?? doc.number,
    status: statusMap[doc.sdi_stato] || "issued",
    clientName: doc.cliente?.denominazione ?? doc.denominazione ?? "",
    clientVat: doc.cliente?.partita_iva ?? doc.partita_iva,
    issueDate: doc.data ?? doc.data_documento,
    dueDate: doc.data_scadenza,
    total: doc.totale ?? doc.importo_totale ?? 0,
    subtotal: doc.imponibile ?? 0,
    taxAmount: doc.imposta ?? 0,
    lines: [],
  }));
}
