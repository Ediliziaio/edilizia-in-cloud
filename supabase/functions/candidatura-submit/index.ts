// Modulo di candidatura pubblico: la pagina /candidatura/:token legge la
// config (GET) e invia la candidatura (POST). Gira col service role perché
// il visitatore è anonimo: il token del modulo — non indovinabile e
// revocabile — è l'unica porta, e ogni scrittura resta nel perimetro della
// company proprietaria del modulo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const MAX_CV_BYTES = 6 * 1024 * 1024; // 6 MB di file → ~8 MB in base64
const CV_ESTENSIONI = new Set(["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"]);

const pulisci = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

// Stato di ogni campo configurabile; il nome è sempre obbligatorio.
type StatoCampo = "obbligatorio" | "facoltativo" | "nascosto";
const CAMPI_CONFIGURABILI = ["cognome", "telefono", "email", "citta", "ruolo", "messaggio", "cv"] as const;
const CAMPI_DEFAULT: Record<string, StatoCampo> = {
  cognome: "facoltativo", telefono: "obbligatorio", email: "facoltativo",
  citta: "facoltativo", ruolo: "facoltativo", messaggio: "facoltativo", cv: "facoltativo",
};
const COLORE_RE = /^#[0-9a-fA-F]{6}$/;
function normalizzaStile(raw: unknown): { testata: string; bottone: string; mostra_azienda: boolean } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    testata: typeof r.testata === "string" && COLORE_RE.test(r.testata) ? r.testata : "#F97316",
    bottone: typeof r.bottone === "string" && COLORE_RE.test(r.bottone) ? r.bottone : "#F97316",
    mostra_azienda: r.mostra_azienda === true,
  };
}

function normalizzaCampi(raw: unknown): Record<string, StatoCampo> {
  const out = { ...CAMPI_DEFAULT };
  if (raw && typeof raw === "object") {
    for (const k of CAMPI_CONFIGURABILI) {
      const v = (raw as Record<string, unknown>)[k];
      if (v === "obbligatorio" || v === "facoltativo" || v === "nascosto") out[k] = v;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── GET ?token= → config pubblica del modulo ──────────────────────────
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token") ?? "";
      if (!/^[a-f0-9]{32}$/.test(token)) {
        return json({ error: "Modulo non trovato" }, 404, cors);
      }
      const { data: form } = await db
        .from("hr_candidatura_forms")
        .select("id, company_id, titolo, descrizione, ruoli, attivo, campi, stile")
        .eq("token", token)
        .maybeSingle();
      if (!form || !form.attivo) return json({ error: "Modulo non trovato" }, 404, cors);

      const { data: company } = await db
        .from("companies")
        .select("name")
        .eq("id", form.company_id)
        .maybeSingle();

      // Contatore visite: best effort, mai bloccante.
      const { data: cur } = await db.from("hr_candidatura_forms").select("total_views").eq("id", form.id).maybeSingle();
      await db.from("hr_candidatura_forms").update({ total_views: (cur?.total_views ?? 0) + 1 }).eq("id", form.id);

      return json({
        titolo: form.titolo,
        descrizione: form.descrizione,
        ruoli: form.ruoli ?? [],
        campi: normalizzaCampi(form.campi),
        stile: normalizzaStile(form.stile),
        azienda: company?.name ?? "",
      }, 200, cors);
    }

    if (req.method !== "POST") return json({ error: "Metodo non supportato" }, 405, cors);

    // ── POST → nuova candidatura ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[a-f0-9]{32}$/.test(token)) return json({ error: "Modulo non trovato" }, 404, cors);

    // Honeypot: i bot compilano tutto, gli umani non vedono questo campo.
    if (pulisci(body.sito_web)) return json({ ok: true }, 200, cors);

    const { data: form } = await db
      .from("hr_candidatura_forms")
      .select("id, company_id, attivo, total_submissions, titolo, campi")
      .eq("token", token)
      .maybeSingle();
    if (!form || !form.attivo) return json({ error: "Modulo non trovato" }, 404, cors);

    const campi = normalizzaCampi(form.campi);
    const nome = pulisci(body.nome, 80);
    const telefono = campi.telefono === "nascosto" ? null : pulisci(body.telefono, 40);
    const email = campi.email === "nascosto" ? null : pulisci(body.email, 160);
    if (!nome) return json({ error: "Il nome è obbligatorio" }, 400, cors);
    // Gli obbligatori li decide l'impresa; il buon senso resta: senza almeno
    // un contatto la candidatura non serve a nessuno.
    const mancanti: string[] = [];
    if (campi.telefono === "obbligatorio" && !telefono) mancanti.push("telefono");
    if (campi.email === "obbligatorio" && !email) mancanti.push("email");
    if (campi.cognome === "obbligatorio" && !pulisci(body.cognome, 80)) mancanti.push("cognome");
    if (campi.citta === "obbligatorio" && !pulisci(body.citta, 120)) mancanti.push("città");
    if (campi.ruolo === "obbligatorio" && !pulisci(body.ruolo, 80)) mancanti.push("ruolo");
    if (campi.messaggio === "obbligatorio" && !pulisci(body.messaggio, 1200)) mancanti.push("presentazione");
    if (campi.cv === "obbligatorio" && !(typeof body.cv_base64 === "string" && body.cv_base64)) mancanti.push("curriculum");
    if (mancanti.length > 0) return json({ error: `Manca: ${mancanti.join(", ")}` }, 400, cors);
    if (!telefono && !email) return json({ error: "Serve almeno un contatto (telefono o email)" }, 400, cors);
    if (body.consenso !== true) return json({ error: "Serve il consenso al trattamento dei dati" }, 400, cors);

    // Anti-doppione: stessa email sullo stesso modulo entro 24h → ok silenzioso.
    if (email) {
      const { data: recente } = await db
        .from("hr_candidati")
        .select("id")
        .eq("company_id", form.company_id)
        .ilike("email", email)
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (recente) return json({ ok: true, duplicato: true }, 200, cors);
    }

    // Prima fase della pipeline: il candidato entra dall'inizio.
    const { data: primaFase } = await db
      .from("hr_selezione_fasi")
      .select("id")
      .eq("company_id", form.company_id)
      .order("posizione")
      .limit(1)
      .maybeSingle();

    const noteParti = [
      pulisci(body.messaggio, 1200) ? `Messaggio dal modulo: ${pulisci(body.messaggio, 1200)}` : null,
      `Candidatura dal modulo "${form.titolo}" — consenso privacy ${new Date().toISOString().slice(0, 10)}.`,
    ].filter(Boolean);

    const { data: candidato, error: insErr } = await db
      .from("hr_candidati")
      .insert({
        company_id: form.company_id,
        nome,
        cognome: pulisci(body.cognome, 80) ?? "",
        ruolo: pulisci(body.ruolo, 80) ?? "Altro",
        email,
        telefono,
        citta: campi.citta === "nascosto" ? null : pulisci(body.citta, 120),
        fonte: "sito",
        stato: "in_valutazione",
        fase_id: primaFase?.id ?? null,
        note: noteParti.join("\n"),
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // CV opzionale, in base64: dall'anonimo non si scrive sul bucket, quindi
    // passa di qui. Un errore sul CV non butta via la candidatura.
    let cvOk = false;
    const cvBase64 = typeof body.cv_base64 === "string" ? body.cv_base64 : "";
    const cvNome = pulisci(body.cv_nome, 140);
    if (cvBase64 && cvNome) {
      try {
        const est = cvNome.split(".").pop()?.toLowerCase() ?? "";
        if (!CV_ESTENSIONI.has(est)) throw new Error("Formato CV non ammesso");
        const bin = Uint8Array.from(atob(cvBase64), (c) => c.charCodeAt(0));
        if (bin.byteLength > MAX_CV_BYTES) throw new Error("CV oltre 6 MB");
        const safe = cvNome.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `${form.company_id}/candidato-${candidato.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await db.storage.from("hr-documenti").upload(path, bin, {
          contentType: est === "pdf" ? "application/pdf" : undefined,
        });
        if (upErr) throw upErr;
        await db.from("hr_candidati").update({ cv_path: path, cv_nome: cvNome }).eq("id", candidato.id);
        cvOk = true;
      } catch (e) {
        console.error("CV non caricato:", e instanceof Error ? e.message : e);
      }
    }

    await db.from("hr_candidatura_forms").update({ total_submissions: (form.total_submissions ?? 0) + 1 }).eq("id", form.id);

    return json({ ok: true, cv: cvOk }, 200, cors);
  } catch (e) {
    console.error("candidatura-submit:", e instanceof Error ? e.message : e);
    return json({ error: "Non riusciamo a inviare la candidatura, riprova tra poco." }, 500, cors);
  }
});

function json(payload: Record<string, unknown>, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
