// company-backup — Export periodico dei dati di un'azienda (F4-07).
//
// PROBLEMA
// Non esiste alcuna funzione di backup, snapshot o restore nel prodotto:
// l'unica rete è il point-in-time recovery gestito da Supabase, che vive fuori
// dal SuperAdmin e richiede competenze da DBA. Un backup mai testato non è un
// backup; uno che non si sa come ripristinare nemmeno.
//
// COSA FA
// Scrive su storage un export JSON per azienda, con le entità che contano
// davvero in un ripristino. Gira settimanalmente su tutte le aziende vive,
// oppure su una sola quando gli si passa un companyId.
//
// COSA NON FA
// Non sostituisce il PITR per un ripristino completo del database: serve a
// rimettere in piedi UNA azienda, che è lo scenario realistico (cancellazione
// per errore, cliente che chiede i propri dati, contestazione su cosa c'era).
//
// L'AREA SUPER ADMIN (19/09/2026)
// L'azienda della piattaforma era esclusa: ~300.000 righe, ~170 MB in
// tabella, un JSON unico non sta nella memoria di una edge function. Il
// 19/09 sono state cancellate per sbaglio 20 sue automazioni e non c'era
// nessuna copia. Ora, con { piattaforma: true }, si salva a pezzi:
//   <id>/<data>/indice.json           cosa c'è, quante righe, quali file
//   <id>/<data>/azienda.json          la riga dell'azienda
//   <id>/<data>/<tabella>/NNN.json    blocchi da BLOCCO righe, in ordine di id
// Il lavoro gira in sottofondo (la risposta è subito 202) con un tetto di
// tempo: se non basta, l'indice lo dice («completo: false»).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

const BUCKET = "company-exports";

// Il contenuto lo decide il catalogo: admin_tabelle_da_esportare elenca ogni
// tabella con una company_id, meno telemetria e log, e admin_esporta_azienda
// costruisce il dump dentro il database. Le otto tabelle scelte a mano il 4
// settembre lasciavano fuori listini, famiglie di articoli, tariffe, fornitori
// e ticket — cioè il lavoro dell'azienda.

/** Righe per blocco: ~15 MB di JSON sulla tabella più larga (coda invii). */
const BLOCCO = 5000;

/**
 * Un blocco come TESTO, senza mai trasformarlo in oggetti. Il primo giro
 * (19/09) faceva rpc() → JSON.parse → JSON.stringify su 131 MB e la funzione
 * è stata fermata per «CPU Time exceeded» a metà dei contatti. Qui il testo
 * che esce dal database finisce nel file così com'è; per andare avanti
 * servono solo n, finito e ultimo, che si leggono con due espressioni
 * regolari agli estremi del testo (jsonb ordina le chiavi per lunghezza e poi
 * alfabeticamente: «n» apre l'oggetto, «finito» e «ultimo» lo chiudono).
 */
async function bloccoComeTesto(
  url: string, chiave: string, parametri: Record<string, unknown>,
): Promise<{ testo: string; n: number; finito: boolean; ultimo: string | null }> {
  const risposta = await fetch(`${url}/rest/v1/rpc/admin_esporta_blocco`, {
    method: "POST",
    headers: { apikey: chiave, Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
    body: JSON.stringify(parametri),
  });
  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`admin_esporta_blocco ${risposta.status}: ${testo.slice(0, 300)}`);
  const inizio = /^\{"n":\s*(\d+)/.exec(testo);
  const fine = /"finito":\s*(true|false),\s*"ultimo":\s*(null|"([^"]*)")\s*\}\s*$/.exec(testo.slice(-400));
  if (!inizio || !fine) throw new Error(`blocco illeggibile: ${testo.slice(0, 80)} … ${testo.slice(-120)}`);
  return { testo, n: Number(inizio[1]), finito: fine[1] === "true", ultimo: fine[3] ?? null };
}
/** Oltre questo tempo non si parte con un blocco nuovo: il limite della funzione è 400 s. */
const TETTO_MS = 330_000;

type Admin = ReturnType<typeof createClient>;

/** Il backup dell'area super admin, a blocchi. Scrive sempre l'indice, anche se si ferma a metà. */
async function backupPiattaformaABlocchi(admin: Admin, azienda: Record<string, unknown>): Promise<Record<string, unknown>> {
  const inizio = Date.now();
  const id = String(azienda.id);
  const data = new Date().toISOString().slice(0, 10);
  const base = `${id}/${data}`;
  const tabelle: Array<{ tabella: string; righe_attese: number; righe_salvate: number; file: string[]; errore?: string }> = [];
  let completo = true;

  const url = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caricaTesto = async (percorso: string, testo: string) => {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(percorso, new Blob([testo], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    if (error) throw new Error(`${percorso}: ${error.message}`);
  };
  const carica = (percorso: string, contenuto: unknown) => caricaTesto(percorso, JSON.stringify(contenuto));

  await carica(`${base}/azienda.json`, azienda);

  const { data: elenco, error: errElenco } = await admin.rpc("admin_tabelle_con_dati", { p_company_id: id });
  if (errElenco) throw new Error(`elenco tabelle: ${errElenco.message}`);

  for (const voce of (elenco ?? []) as Array<{ tabella: string; righe: number }>) {
    const riga = { tabella: voce.tabella, righe_attese: Number(voce.righe), righe_salvate: 0, file: [] as string[] } as
      { tabella: string; righe_attese: number; righe_salvate: number; file: string[]; errore?: string };
    tabelle.push(riga);
    let dopo: string | null = null;
    try {
      for (let n = 1; ; n++) {
        if (Date.now() - inizio > TETTO_MS) { completo = false; riga.errore = "tempo finito"; break; }
        const b = await bloccoComeTesto(url, chiave, {
          p_company_id: id, p_tabella: voce.tabella, p_dopo: dopo, p_limite: BLOCCO,
        });
        if (b.n > 0) {
          // Il file è il blocco intero: { n, righe: [...], finito, ultimo }.
          const nome = `${base}/${voce.tabella}/${String(n).padStart(3, "0")}.json`;
          await caricaTesto(nome, b.testo);
          riga.file.push(nome);
          riga.righe_salvate += b.n;
        }
        if (b.finito || !b.ultimo) break;
        dopo = b.ultimo;
      }
    } catch (e) {
      completo = false;
      riga.errore = (e as Error)?.message ?? "errore sconosciuto";
    }
    if (riga.errore === "tempo finito") break;
  }

  const indice = {
    esportato_il: new Date().toISOString(),
    azienda: { id, name: azienda.name },
    a_blocchi: true,
    righe_per_blocco: BLOCCO,
    completo: completo && tabelle.every((t) => !t.errore && t.righe_salvate === t.righe_attese),
    durata_s: Math.round((Date.now() - inizio) / 1000),
    tabelle,
  };
  await carica(`${base}/indice.json`, indice);
  return indice;
}

Deno.serve(conMetriche("company-backup", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    requireInternalSecret(req, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const soloUna: string | null = body?.companyId ?? null;

    // Area super admin: a blocchi, in sottofondo (vedi l'intestazione).
    if (body?.piattaforma === true) {
      const { data: piattaforma, error: errPiattaforma } = await admin
        .from("companies")
        .select("*")
        .eq("is_platform_admin_company", true)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (errPiattaforma) throw new Error(errPiattaforma.message);
      if (!piattaforma) {
        return new Response(JSON.stringify({ error: "Azienda della piattaforma non trovata" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const lavoro = backupPiattaformaABlocchi(admin, piattaforma as Record<string, unknown>)
        .then((indice) => console.log(JSON.stringify({ fn: "company-backup", piattaforma: true, completo: indice.completo, durata_s: indice.durata_s })))
        .catch((e) => console.error("[company-backup] piattaforma", (e as Error)?.message ?? e));
      const runtime = (globalThis as unknown as {
        EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
      }).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(lavoro);
        return new Response(JSON.stringify({ avviato: true, azienda: piattaforma.name }), {
          status: 202, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      await lavoro;
      return new Response(JSON.stringify({ fatto: true, azienda: piattaforma.name }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let query = admin
      .from("companies")
      .select("*")
      .is("deleted_at", null)
      .eq("is_platform_admin_company", false);
    if (soloUna) query = query.eq("id", soloUna);

    const { data: aziende, error: errAziende } = await query;
    if (errAziende) throw new Error(errAziende.message);

    const esiti: Array<{ azienda: string; percorso?: string; record?: number; errore?: string }> = [];

    for (const azienda of aziende ?? []) {
      try {
        // Il dump lo costruisce il database in una chiamata sola: 628 tabelle
        // via PostgREST sarebbero migliaia di richieste per azienda.
        const { data: esportato, error: errDump } = await admin.rpc("admin_esporta_azienda", { p_company_id: azienda.id });
        if (errDump) throw new Error(errDump.message);
        const dump = esportato as Record<string, unknown>;
        const record = Number(dump.righe_totali ?? 0);

        const percorso = `${azienda.id}/${new Date().toISOString().slice(0, 10)}-backup.json`;
        const { error: errUp } = await admin.storage
          .from(BUCKET)
          .upload(percorso, new Blob([JSON.stringify(dump)], { type: "application/json" }), {
            upsert: true,
            contentType: "application/json",
          });
        if (errUp) throw new Error(errUp.message);

        esiti.push({ azienda: azienda.name, percorso, record });
      } catch (e) {
        esiti.push({ azienda: azienda.name, errore: (e as Error)?.message ?? "errore sconosciuto" });
      }
    }

    const falliti = esiti.filter((e) => e.errore).length;

    return new Response(
      JSON.stringify({
        aziende: esiti.length,
        riusciti: esiti.length - falliti,
        falliti,
        esiti,
      }),
      {
        // Se falliscono tutte è un guasto vero e deve risultare tale nelle
        // metriche; se ne fallisce qualcuna il backup è parziale ma avvenuto.
        status: falliti > 0 && falliti === esiti.length ? 500 : 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[company-backup]", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? "Errore interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
}));
