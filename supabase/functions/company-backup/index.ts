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
//   <id>/<data>/<tabella>/NNN.json    blocchi di righe, in ordine di id
// Il lavoro gira in sottofondo (la risposta è subito 202) con un tetto di
// tempo: se non basta, l'indice lo dice («completo: false»).
//
// LE AZIENDE GRANDI (20/09/2026)
// Il dump unico (admin_esporta_azienda) è una sola istruzione, e PostgREST la
// ferma a 8 secondi. Il 20/09 le quattro aziende più grandi — BeMade, Il Bagno
// Group, Best Infissi e la Demo — sono andate tutte in «statement timeout»;
// due erano senza copia già dalla domenica prima, e non se n'è accorto
// nessuno perché il cron non legge la risposta. Ora:
//   · chi ha più di SOGLIA_RIGHE_A_BLOCCHI righe va dritto a blocchi;
//   · chi fallisce col dump unico ci ripiega;
//   · ogni azienda a blocchi gira in una chiamata sua, una dopo l'altra
//     ({ companyId, aBlocchi: true, poi: [...] }), così ha tutto il tempo e
//     tutta la memoria per sé e il database ne serve una per volta;
//   · i blocchi si regolano sul peso: 5.000 note sono 2 MB, 5.000 email con
//     il corpo HTML sono 137 MB (regole in _shared/backupBlocchi.ts).
// Chi resta senza backup compare nel rapporto del mattino («backup_mancanti»).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import {
  BLOCCO_INIZIALE,
  BLOCCO_MASSIMO,
  limiteDopoErrore,
  MASSIMO_CHIAMATE,
  prossimoLimite,
  TETTO_TESTO_PER_CHIAMATA,
  vaABlocchi,
} from "../_shared/backupBlocchi.ts";
import { BYTE_PER_GIRO, comprimiFile, type EsitoCompressione, type FileDaComprimere } from "../_shared/backupCompressi.ts";

const BUCKET = "company-exports";

// Il contenuto lo decide il catalogo (admin_catalogo_backup): tutto ciò che la
// purga cancella, anche le tabelle figlie senza company_id prese attraverso la
// madre, meno le esclusioni scritte in admin_backup_esclusioni(). Il dump lo
// costruisce admin_esporta_azienda dentro il database. Le otto tabelle scelte a
// mano il 4 settembre lasciavano fuori listini, famiglie di articoli, tariffe,
// fornitori e ticket; il filtro su company_id, fino al 25/09, righe di fattura,
// voci e rate delle commesse, campi e liste dei contatti.

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

/**
 * I backup più vecchi di 90 giorni si cancellano (DPA e Termini, 30/10/2026).
 * L'elenco lo dà admin_backup_scaduti, che non toglie mai l'ultima copia di
 * un'azienda ancora attiva; qui si cancellano i file dallo storage a lotti.
 */
// deno-lint-ignore no-explicit-any
async function puliziaBackupScaduti(admin: any): Promise<{ cancellati: number; errore?: string }> {
  let cancellati = 0;
  for (let giro = 0; giro < 20; giro++) {
    const { data, error } = await admin.rpc("admin_backup_scaduti", { p_limite: 500 });
    if (error) return { cancellati, errore: error.message };
    const nomi = ((data ?? []) as string[]).filter(Boolean);
    if (!nomi.length) break;
    for (let i = 0; i < nomi.length; i += 100) {
      const { error: errRm } = await admin.storage.from(BUCKET).remove(nomi.slice(i, i + 100));
      if (errRm) return { cancellati, errore: errRm.message };
      cancellati += Math.min(100, nomi.length - i);
    }
    if (nomi.length < 500) break;
  }
  return { cancellati };
}

/** Un giro di compressione dei backup già scritti: il backup non dipende mai da questo passaggio. */
// deno-lint-ignore no-explicit-any
async function giroDiCompressione(admin: any, azienda: string | null): Promise<EsitoCompressione> {
  const { data, error } = await admin.rpc("admin_backup_da_comprimere", { p_byte_massimi: BYTE_PER_GIRO, p_azienda: azienda });
  if (error) throw new Error(`elenco da comprimere: ${error.message}`);
  const esito = await comprimiFile({
    async scarica(percorso) {
      const { data: blob, error: errore } = await admin.storage.from(BUCKET).download(percorso);
      if (errore || !blob) throw new Error(`download: ${errore?.message ?? "file assente"}`);
      return new Uint8Array(await blob.arrayBuffer());
    },
    async carica(percorso, byte, tipo) {
      const { error: errore } = await admin.storage.from(BUCKET).upload(percorso, new Blob([byte as BlobPart], { type: tipo }), { upsert: true, contentType: tipo });
      if (errore) throw new Error(`upload: ${errore.message}`);
    },
  }, (data ?? []) as FileDaComprimere[]);
  if (esito.errori.length) console.error("[company-backup] compressione:", esito.errori.slice(0, 5).join(" | "));
  return esito;
}

/**
 * Il backup di un'azienda a blocchi: l'area super admin, e dal 20/09 ogni
 * azienda troppo grande per il dump unico. Scrive sempre l'indice, anche se si
 * ferma a metà.
 *
 * Una chiamata scrive al massimo TETTO_TESTO_PER_CHIAMATA: dal 27/09 al 08/11 l'area super admin (480 MB) finiva
 * la CPU dopo due minuti, senza arrivare all'indice. Ora a metà strada l'indice dice dov'è arrivato (`ripresa`,
 * `in_corso`) e la chiamata dopo riparte da lì; se una chiamata muore, resta un indice con `completo: false`.
 */
async function backupABlocchi(admin: Admin, azienda: Record<string, unknown>, riprendi: string | null = null): Promise<Record<string, unknown>> {
  const inizio = Date.now();
  const id = String(azienda.id);
  const data = riprendi ?? new Date().toISOString().slice(0, 10);
  const base = `${id}/${data}`;
  type RigaTabella = { tabella: string; righe_attese: number; righe_salvate: number; file: string[]; errore?: string };
  type Voce = { tabella: string; righe: number };
  type Ripresa = { data: string; elenco: Voce[]; tabella: number; n: number; dopo: string | null; limite: number; chiamata: number };
  let precedente: { tabelle: RigaTabella[]; durata_s: number; ripresa: Ripresa } | null = null;
  if (riprendi) {
    const { data: file, error: errIndice } = await admin.storage.from(BUCKET).download(`${base}/indice.json`);
    if (errIndice || !file) throw new Error(`ripresa ${base}: indice non trovato`);
    precedente = JSON.parse(await file.text());
    if (!precedente?.ripresa) throw new Error(`ripresa ${base}: backup già chiuso`);
  }
  const tabelle: RigaTabella[] = precedente?.tabelle ?? [];
  const chiamata = precedente?.ripresa.chiamata ?? 1;
  let completo = true;
  let testoScritto = 0;
  let sospeso: Omit<Ripresa, "data" | "elenco" | "chiamata"> | null = null;

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

  let voci: Voce[];
  if (precedente) {
    voci = precedente.ripresa.elenco;
  } else {
    await carica(`${base}/azienda.json`, azienda);
    const { data: elenco, error: errElenco } = await admin.rpc("admin_tabelle_con_dati", { p_company_id: id });
    if (errElenco) throw new Error(`elenco tabelle: ${errElenco.message}`);
    voci = (elenco ?? []) as Voce[];
  }

  const primaTabella = precedente?.ripresa.tabella ?? 0;
  for (let t = primaTabella; t < voci.length; t++) {
    const voce = voci[t];
    // La tabella su cui ci si era fermati riparte dal blocco giusto, con la sua riga dell'indice.
    const daRiprendere = precedente !== null && t === primaTabella;
    let riga = daRiprendere ? tabelle.find((x) => x.tabella === voce.tabella) : undefined;
    if (!riga) {
      riga = { tabella: voce.tabella, righe_attese: Number(voce.righe), righe_salvate: 0, file: [] };
      tabelle.push(riga);
    }
    let dopo: string | null = daRiprendere ? precedente!.ripresa.dopo : null;
    // Si parte bassi e ci si regola sul peso dell'ultimo blocco.
    let limite = daRiprendere ? precedente!.ripresa.limite : BLOCCO_INIZIALE;
    try {
      for (let n = daRiprendere ? precedente!.ripresa.n : 1; ; n++) {
        if (Date.now() - inizio > TETTO_MS || testoScritto >= TETTO_TESTO_PER_CHIAMATA) {
          if (chiamata < MASSIMO_CHIAMATE) { sospeso = { tabella: t, n, dopo, limite }; break; }
          completo = false; riga.errore = "tempo finito"; break;
        }
        let b: Awaited<ReturnType<typeof bloccoComeTesto>>;
        try {
          b = await bloccoComeTesto(url, chiave, {
            p_company_id: id, p_tabella: voce.tabella, p_dopo: dopo, p_limite: limite,
          });
        } catch (errBlocco) {
          // Troppo lento o troppo grande: stesso punto, un quarto delle righe.
          const ridotto = limiteDopoErrore(limite);
          if (ridotto === null) throw errBlocco;
          console.warn(`[company-backup] ${voce.tabella}: blocco da ${limite} righe non passato, riprovo con ${ridotto}`);
          limite = ridotto;
          n--;
          continue;
        }
        if (b.n > 0) {
          // Il file è il blocco intero: { n, righe: [...], finito, ultimo }.
          const nome = `${base}/${voce.tabella}/${String(n).padStart(3, "0")}.json`;
          await caricaTesto(nome, b.testo);
          riga.file.push(nome);
          riga.righe_salvate += b.n;
          testoScritto += b.testo.length;
        }
        if (b.finito || !b.ultimo) break;
        dopo = b.ultimo;
        limite = prossimoLimite(limite, b.testo.length);
      }
    } catch (e) {
      completo = false;
      riga.errore = (e as Error)?.message ?? "errore sconosciuto";
    }
    if (sospeso || riga.errore === "tempo finito") break;
  }

  const indice: Record<string, unknown> = {
    esportato_il: new Date().toISOString(),
    azienda: { id, name: azienda.name },
    a_blocchi: true,
    // I blocchi hanno misure diverse (si regolano sul peso): questo è il tetto.
    righe_per_blocco: BLOCCO_MASSIMO,
    completo: !sospeso && completo && tabelle.every((t) => !t.errore && t.righe_salvate === t.righe_attese),
    durata_s: (precedente?.durata_s ?? 0) + Math.round((Date.now() - inizio) / 1000),
    tabelle,
  };
  if (sospeso) {
    indice.in_corso = true;
    indice.ripresa = { ...sospeso, data, elenco: voci, chiamata: chiamata + 1 } satisfies Ripresa;
  }
  await carica(`${base}/indice.json`, indice);
  return indice;
}

/** La data del backup da far ripartire, se la chiamata si è fermata a metà strada. */
function dataDaRiprendere(indice: Record<string, unknown>): string | null {
  return indice.in_corso === true ? String((indice.ripresa as { data: string }).data) : null;
}

/** Fa partire il lavoro in sottofondo, se il runtime lo permette; altrimenti lo aspetta. */
async function inSottofondo(lavoro: Promise<unknown>): Promise<boolean> {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(lavoro);
    return true;
  }
  await lavoro;
  return false;
}

/**
 * Chiede a questa stessa funzione il backup a blocchi di un'azienda, in una
 * chiamata sua. `poi` sono le aziende che vengono dopo: ognuna fa partire la
 * successiva quando ha finito, così il database ne serve una per volta.
 */
async function avviaBackupABlocchi(idAzienda: string, poi: string[], riprendi: string | null = null): Promise<void> {
  const segreto = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!segreto) throw new Error("INTERNAL_CRON_SECRET non configurato: impossibile avviare il backup a blocchi");
  const risposta = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/company-backup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-cron-secret": segreto },
    body: JSON.stringify({ companyId: idAzienda, aBlocchi: true, poi, riprendi }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!risposta.ok) {
    throw new Error(`avvio backup a blocchi ${idAzienda}: HTTP ${risposta.status} ${(await risposta.text()).slice(0, 200)}`);
  }
  await risposta.body?.cancel().catch(() => {});
}

serveConMetricheRapida("company-backup", async (req) => {
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

    // Il cron riceve subito la risposta e il lavoro continua in sottofondo; `attendi` è per le prove.
    if (body?.comprimi === true) {
      const lavoro = giroDiCompressione(admin, soloUna);
      if (body?.attendi === true) {
        return new Response(JSON.stringify(await lavoro), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      const avviato = await inSottofondo(lavoro.catch((e) => console.error("[company-backup] compressione", (e as Error)?.message ?? e)));
      return new Response(JSON.stringify({ avviato }), { status: avviato ? 202 : 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

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
      const lavoro = backupABlocchi(admin, piattaforma as Record<string, unknown>)
        .then(async (indice) => {
          const riprendi = dataDaRiprendere(indice);
          if (riprendi) return await avviaBackupABlocchi(String(piattaforma.id), [], riprendi);
          console.log(JSON.stringify({ fn: "company-backup", piattaforma: true, completo: indice.completo, durata_s: indice.durata_s }));
        })
        .catch((e) => console.error("[company-backup] piattaforma", (e as Error)?.message ?? e));
      const avviato = await inSottofondo(lavoro);
      return new Response(JSON.stringify(avviato ? { avviato: true, azienda: piattaforma.name } : { fatto: true, azienda: piattaforma.name }), {
        status: avviato ? 202 : 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Un'azienda a blocchi, in una chiamata sua (vedi l'intestazione). Finito
    // il suo lavoro — riuscito o no — fa partire la prossima dell'elenco.
    if (body?.aBlocchi === true) {
      if (!soloUna) {
        return new Response(JSON.stringify({ error: "aBlocchi vuole companyId" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const { data: azienda, error: errAzienda } = await admin
        .from("companies").select("*").eq("id", soloUna).is("deleted_at", null).maybeSingle();
      if (errAzienda) throw new Error(errAzienda.message);
      if (!azienda) {
        return new Response(JSON.stringify({ error: "Azienda non trovata" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const poi: string[] = Array.isArray(body?.poi) ? body.poi.filter((v: unknown) => typeof v === "string") : [];
      const riprendi = typeof body?.riprendi === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.riprendi) ? body.riprendi : null;
      // Se questa azienda continua in un'altra chiamata, la prossima dell'elenco la farà partire quella.
      let prosegue = false;
      const lavoro = backupABlocchi(admin, azienda as Record<string, unknown>, riprendi)
        .then(async (indice) => {
          const daRiprendere = dataDaRiprendere(indice);
          if (daRiprendere) {
            await avviaBackupABlocchi(soloUna, poi, daRiprendere);
            prosegue = true;
            return;
          }
          console.log(JSON.stringify({ fn: "company-backup", a_blocchi: true, azienda: azienda.name, completo: indice.completo, durata_s: indice.durata_s }));
        })
        .catch((e) => console.error(`[company-backup] a blocchi ${azienda.name}:`, (e as Error)?.message ?? e))
        .then(async () => {
          if (prosegue || poi.length === 0) return;
          await avviaBackupABlocchi(poi[0], poi.slice(1))
            .catch((e) => console.error("[company-backup] la prossima azienda a blocchi non è partita:", (e as Error)?.message ?? e));
        });
      const avviato = await inSottofondo(lavoro);
      return new Response(JSON.stringify({ avviato, a_blocchi: true, azienda: azienda.name, poi: poi.length }), {
        status: avviato ? 202 : 200, headers: { ...cors, "Content-Type": "application/json" },
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

    const esiti: Array<{ azienda: string; percorso?: string; record?: number; errore?: string; a_blocchi?: boolean; motivo?: string }> = [];
    // Le aziende da fare a blocchi, ognuna in una chiamata sua, in fila.
    const aBlocchi: Array<{ id: string; nome: string }> = [];

    for (const azienda of aziende ?? []) {
      // Quante righe ha? Il conto è svelto (decimi di secondo) e decide la strada.
      const { data: conDati, error: errConto } = await admin.rpc("admin_tabelle_con_dati", { p_company_id: azienda.id });
      const righe = errConto ? null : ((conDati ?? []) as Array<{ righe: number }>).reduce((n, t) => n + Number(t.righe ?? 0), 0);
      if (vaABlocchi(righe)) {
        aBlocchi.push({ id: azienda.id, nome: azienda.name });
        esiti.push({ azienda: azienda.name, a_blocchi: true, record: righe ?? undefined, motivo: "azienda grande" });
        continue;
      }
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
        // Il dump unico non è passato (di solito gli 8 secondi di PostgREST):
        // non si resta senza copia, si ripiega sui blocchi.
        const motivo = (e as Error)?.message ?? "errore sconosciuto";
        aBlocchi.push({ id: azienda.id, nome: azienda.name });
        esiti.push({ azienda: azienda.name, a_blocchi: true, motivo: `dump unico fallito: ${motivo}` });
      }
    }

    if (aBlocchi.length > 0) {
      try {
        await avviaBackupABlocchi(aBlocchi[0].id, aBlocchi.slice(1).map((a) => a.id));
      } catch (e) {
        const motivo = (e as Error)?.message ?? "errore sconosciuto";
        for (const esito of esiti) {
          if (esito.a_blocchi) esito.errore = `backup a blocchi non partito: ${motivo}`;
        }
      }
    }

    const falliti = esiti.filter((e) => e.errore).length;

    // Il giro completo toglie anche i backup scaduti (vedi admin_backup_scaduti). L'esito va nel log perché
    // a pg_net la risposta arriva prima della fine del lavoro, e nessuno la leggerebbe comunque.
    const pulizia = soloUna ? null : await puliziaBackupScaduti(admin);
    if (pulizia?.errore) console.error("[company-backup] pulizia backup scaduti:", pulizia.errore);
    if (!soloUna) {
      console.log(JSON.stringify({ fn: "company-backup", giro: "completo", aziende: esiti.length, falliti, backup_scaduti_cancellati: pulizia?.cancellati ?? null }));
    }

    return new Response(
      JSON.stringify({
        aziende: esiti.length,
        riusciti: esiti.length - falliti,
        falliti,
        esiti,
        backup_scaduti_cancellati: pulizia?.cancellati ?? null,
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
});
