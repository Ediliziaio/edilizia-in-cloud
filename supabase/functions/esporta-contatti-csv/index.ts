// esporta-contatti-csv — i contatti di un'azienda in CSV, divisi per settore.
//
// Nasce da una richiesta concreta (18/09/2026): tutti i contatti del superadmin
// con email o telefono, divisi in serramenti, fotovoltaico, ristrutturazioni e
// il resto. Con 45.000 righe l'esportazione del browser non regge: qui il file
// si costruisce sul server, finisce nel bucket privato «company-exports» e
// torna come link firmato che scade.
//
// Chi può chiamarla: un super admin (token dell'utente) oppure un lavoro
// interno con x-cron-secret. Il settore si legge dai tag del contatto, gli
// stessi che usano le liste dell'area marketing.
//
// CSV pensato per Excel italiano: separatore «;», BOM iniziale, fine riga CRLF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const AZIENDA_PIATTAFORMA = "00000000-0000-0000-0000-000000000001";
const PAGINA = 2000;

/** Settori riconosciuti dai tag, in ordine di precedenza. */
const SETTORI: Array<{ gruppo: string; tag: string[] }> = [
  { gruppo: "fotovoltaico", tag: ["fotovoltaico"] },
  { gruppo: "serramenti", tag: ["serramenti", "infissi", "freddi infissi", "schermature solari"] },
  { gruppo: "ristrutturazioni", tag: ["ristrutturazioni", "impianti_ristrutturazione", "bagni"] },
];

interface Contatto {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  telefono_normalized: string | null;
  city: string | null;
  tags: string[] | null;
}

function gruppoDi(tags: string[] | null): string {
  const suoi = (tags ?? []).map((t) => String(t).toLowerCase().trim());
  for (const settore of SETTORI) {
    if (settore.tag.some((t) => suoi.includes(t))) return settore.gruppo;
  }
  return "resto";
}

/** Una cella CSV: virgolette solo quando servono, virgolette interne raddoppiate. */
function cella(valore: string | null): string {
  const testo = (valore ?? "").replace(/\r?\n/g, " ").trim();
  return /[";]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
}

function rigaCsv(c: Contatto): string {
  return [
    cella(c.first_name),
    cella(c.last_name),
    cella(c.company_name),
    cella(c.email),
    cella(c.phone?.trim() || c.telefono_normalized),
    cella(c.city),
  ].join(";");
}

const INTESTAZIONE = "Nome;Cognome;Azienda;Email;Telefono;Città";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const headers = { ...cors, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // ── Chi chiama ──────────────────────────────────────────────────────────
  // Lavoro interno con il segreto dei cron, oppure un super admin col suo token.
  const segreto = req.headers.get("x-cron-secret");
  const segretoInterno = Deno.env.get("INTERNAL_CRON_SECRET") || serviceKey;
  let autorizzato = Boolean(segreto?.length) && segreto === segretoInterno;

  if (!autorizzato) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const utente = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: dati } = await utente.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = dati?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const { data: ruolo } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!ruolo) {
      return new Response(
        JSON.stringify({ error: "Solo un super admin può esportare i contatti" }),
        { status: 403, headers },
      );
    }
    autorizzato = true;
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    const companyId: string = corpo.company_id || AZIENDA_PIATTAFORMA;

    // ── I contatti, a pagine: 96.000 righe non entrano in una risposta sola ──
    const perGruppo = new Map<string, string[]>();
    let letti = 0;
    let scartatiSenzaRecapito = 0;
    for (let da = 0; ; da += PAGINA) {
      const { data, error } = await admin
        .from("marketing_contacts")
        .select("first_name, last_name, company_name, email, phone, telefono_normalized, city, tags")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .or("unsubscribed.is.null,unsubscribed.eq.false")
        .or("opt_out.is.null,opt_out.eq.false")
        .order("id", { ascending: true })
        .range(da, da + PAGINA - 1);
      if (error) throw new Error(`lettura contatti: ${error.message}`);
      const righe = (data ?? []) as Contatto[];
      if (righe.length === 0) break;

      for (const c of righe) {
        letti++;
        // La condizione chiesta: o l'email o il telefono, altrimenti non serve.
        const haEmail = Boolean(c.email?.trim());
        const haTelefono = Boolean(c.phone?.trim() || c.telefono_normalized?.trim());
        if (!haEmail && !haTelefono) {
          scartatiSenzaRecapito++;
          continue;
        }
        const gruppo = gruppoDi(c.tags);
        const elenco = perGruppo.get(gruppo) ?? [];
        elenco.push(rigaCsv(c));
        perGruppo.set(gruppo, elenco);
      }
      if (righe.length < PAGINA) break;
    }

    // ── Un file per gruppo, nel bucket privato, con link che scade ──────────
    const quando = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const file: Array<{ gruppo: string; righe: number; percorso: string; url: string | null }> = [];

    for (const gruppo of ["serramenti", "fotovoltaico", "ristrutturazioni", "resto"]) {
      const righe = perGruppo.get(gruppo) ?? [];
      if (righe.length === 0) continue;
      const csv = "﻿" + [INTESTAZIONE, ...righe].join("\r\n") + "\r\n";
      const percorso = `contatti/${companyId}/${quando}-${gruppo}.csv`;
      const { error: erroreUpload } = await admin.storage
        .from("company-exports")
        .upload(percorso, new Blob([csv], { type: "text/csv; charset=utf-8" }), {
          upsert: true,
          contentType: "text/csv; charset=utf-8",
        });
      if (erroreUpload) throw new Error(`salvataggio ${gruppo}: ${erroreUpload.message}`);

      const { data: firmato } = await admin.storage
        .from("company-exports")
        .createSignedUrl(percorso, 60 * 60 * 6);
      file.push({ gruppo, righe: righe.length, percorso, url: firmato?.signedUrl ?? null });
    }

    console.log(JSON.stringify({
      level: "info",
      fn: "esporta-contatti-csv",
      company_id: companyId,
      letti,
      scartati_senza_recapito: scartatiSenzaRecapito,
      file: file.map((f) => `${f.gruppo}:${f.righe}`),
    }));

    return new Response(
      JSON.stringify({
        azienda: companyId,
        contatti_letti: letti,
        scartati_senza_recapito: scartatiSenzaRecapito,
        esportati: file.reduce((n, f) => n + f.righe, 0),
        file,
      }),
      { headers },
    );
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", fn: "esporta-contatti-csv", errore: messaggio }));
    return new Response(JSON.stringify({ error: messaggio }), { status: 500, headers });
  }
});
