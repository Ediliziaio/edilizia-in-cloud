import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { cercaVicini, coordinate, minuti, normalizzaIndirizzo, type Candidato, type Coordinate, type Tratta } from "../../../shared/mappa-operativa/calcoli.ts";
import { cercaIndirizzo, matriceOsrm, percorsoOsrm } from "./provider.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const giornoIso = /^\d{4}-\d{2}-\d{2}$/;
const ora = /^([01]\d|2[0-3]):[0-5]\d$/;
const envInt = (chiave: string, normale: number, massimo: number) => {
  const n = Number(Deno.env.get(chiave) ?? normale);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, massimo) : normale;
};

class Servizio extends Error {
  constructor(readonly codice: "quota" | "non_configurato" | "non_disponibile") { super(codice); }
}

async function hash(dati: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(dati)));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  const cors = getCorsHeaders(req);
  const rispondi = (dati: unknown, status = 200) => jsonResponse(dati, status, { ...cors, "Cache-Control": "no-store" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return rispondi({ error: "Metodo non supportato" }, 405);

  try {
    const { supabaseAdmin: admin } = await requireAuth(req, cors);
    const raw = await req.text();
    if (raw.length > 16000) return rispondi({ error: "Richiesta troppo grande" }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || !uuid.test(body.company) || !["vendite", "lavori", "campo"].includes(body.ambito)) {
      return rispondi({ error: "Ambito non valido" }, 400);
    }
    const utente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")!, "x-azienda-scheda": body.company } },
    });
    const company = body.company as string;
    const { data: accesso, error: permessi } = await utente.rpc("mappa_calendario_accesso", {
      p_company: company, p_tipo: body.ambito,
    });
    if (permessi || !accesso) return rispondi({ error: "Calendario non accessibile" }, 403);

    const osrm = Deno.env.get("MAPPA_OPERATIVA_OSRM_URL");
    const geocoding = Deno.env.get("MAPPA_OPERATIVA_GEOCODING_URL");
    const profilo = body.profilo === "furgone" ? "furgone" : "auto";
    const router = profilo === "furgone" ? Deno.env.get("MAPPA_OPERATIVA_OSRM_FURGONE_URL") : osrm;
    const tokenRouting = Deno.env.get("MAPPA_OPERATIVA_OSRM_TOKEN");
    const tokenIndirizzi = Deno.env.get("MAPPA_OPERATIVA_GEOCODING_TOKEN");
    const versione = Deno.env.get("MAPPA_OPERATIVA_DATI_VERSIONE") ?? "1";

    async function conta(provider: string, voce: string, unita: number, perMinuto: number, perMese: number) {
      const chiave = voce.toUpperCase();
      const { data, error } = await admin.rpc("mappa_conta", {
        p_company: company, p_provider: provider, p_voce: voce, p_unita: unita,
        p_minuto: envInt(`MAPPA_OPERATIVA_${chiave}_MINUTO`, perMinuto, 10000),
        p_mese: envInt(`MAPPA_OPERATIVA_${chiave}_MESE`, perMese, 10000000),
      });
      if (error) throw new Servizio("non_disponibile");
      if (!data) throw new Servizio("quota");
    }

    // La cache contiene solo output dei servizi privati, nel solo ambito aziendale.
    async function unica<T>(chiave: unknown, secondi: number, esegui: () => Promise<T>): Promise<T> {
      const id = await hash([versione, chiave]);
      const token = crypto.randomUUID();
      const arg = { p_company: company, p_chiave: id, p_token: token };
      for (let i = 0; i < 20; i++) {
        const { data, error } = await admin.rpc("mappa_richiesta_inizia", arg);
        if (error) throw new Servizio("non_disponibile");
        if (data.stato === "pronta") {
          if (data.risposta.errore) throw new Servizio(data.risposta.errore);
          return data.risposta.valore as T;
        }
        if (data.stato === "nuova") {
          try {
            const valore = await esegui();
            await admin.rpc("mappa_richiesta_chiudi", { ...arg, p_risposta: { valore }, p_secondi: secondi });
            return valore;
          } catch (errore) {
            const codice = errore instanceof Servizio ? errore.codice : "non_disponibile";
            await admin.rpc("mappa_richiesta_chiudi", { ...arg, p_risposta: { errore: codice }, p_secondi: 2 });
            throw new Servizio(codice);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      throw new Servizio("non_disponibile");
    }

    if (body.azione === "vista") {
      await conta(body.tile === true ? "maptiler" : "leaflet", "visualizzazioni", 1, 60, 15000);
      return rispondi({ ok: true });
    }

    if (body.azione === "indirizzo") {
      const indirizzo = typeof body.indirizzo === "string" && body.indirizzo.length <= 280 ? normalizzaIndirizzo(body.indirizzo) : "";
      if (body.ambito === "campo" || indirizzo.length < 7) return rispondi({ error: "Inserisci via, civico e comune" }, 400);
      if (!geocoding) throw new Servizio("non_configurato");
      const risultati = await unica(["indirizzo", geocoding, indirizzo], 86400, async () => {
        await conta("nominatim_privato", "geocodifiche", 1, 10, 2000);
        return cercaIndirizzo(geocoding, indirizzo, tokenIndirizzi);
      });
      return rispondi({ risultati });
    }

    if (body.azione === "percorso") {
      const punti = Array.isArray(body.punti)
        ? body.punti.map((p: Coordinate | null) => coordinate(p?.lat, p?.lng)) : [];
      if (!punti.every(Boolean) || punti.length < 2 || punti.length > 25) return rispondi({ error: "Percorso non valido" }, 400);
      if (!router) throw new Servizio("non_configurato");
      return rispondi(await unica(["percorso", router, profilo, punti, body.revisione], 300, async () => {
        await conta("osrm_privato", "percorsi", 1, 15, 3000);
        return percorsoOsrm(router, "driving", punti as Coordinate[], tokenRouting);
      }));
    }

    if (body.azione === "vicini") {
      const meta = coordinate(body.meta?.lat, body.meta?.lng);
      if (body.ambito === "campo" || !meta || !giornoIso.test(body.giorno) ||
          !ora.test(body.inizio) || !ora.test(body.fine) || body.inizio >= body.fine ||
          !["vendite", "operai", "squadre"].includes(body.tipo) ||
          (body.escludi != null && !uuid.test(body.escludi))) return rispondi({ error: "Controlla data, fascia oraria e destinazione" }, 400);
      const { data, error } = await utente.rpc("mappa_candidati", {
        p_company: company, p_tipo: body.tipo, p_giorno: body.giorno,
        p_inizio: body.inizio, p_fine: body.fine, p_qualifica: body.qualifica || null, p_escludi: body.escludi || null,
      });
      if (error) {
        return error.code === "42501" ? rispondi({ error: "Ricerca non consentita con questo profilo" }, 403)
          : rispondi({ error: error.code === "22023" ? "Scegli una fascia futura valida" : "Disponibilità non consultabile" }, 422);
      }
      let motivo: string | undefined;
      const risultato = await cercaVicini((data as Candidato[]).map(c => ({
        ...c, origine: coordinate(c.origine?.lat, c.origine?.lng), prossimo: coordinate(c.prossimo?.lat, c.prossimo?.lng),
      })), meta, minuti(body.inizio)!, minuti(body.fine)!, async rosa => {
        if (!router) { motivo = "non_configurato"; throw new Servizio("non_configurato"); }
        const da = rosa.map(c => c.origine);
        const ritorni = rosa.flatMap((c, i) => c.prossimo ? [{ i, punto: c.prossimo }] : []);
        try {
          return await unica(["matrice", router, profilo, da, meta, ritorni], 180, async () => {
            await conta("osrm_privato", "elementi_matrice", da.length + ritorni.length, 100, 10000);
            const [andata, successivi] = await Promise.all([
              matriceOsrm(router, "driving", da, meta, false, tokenRouting),
              ritorni.length ? matriceOsrm(router, "driving", ritorni.map(r => r.punto), meta, true, tokenRouting) : [],
            ]);
            const dopo = da.map<Tratta | null>(() => null);
            ritorni.forEach(({ i }, j) => { dopo[i] = successivi[j]; });
            return { andata, dopo };
          });
        } catch (e) { motivo = e instanceof Servizio ? e.codice : "non_disponibile"; throw e; }
      }, envInt("MAPPA_OPERATIVA_CANDIDATI_MAX", 10, 20) || 5);
      return rispondi({
        ...risultato, motivo,
        risultati: risultato.risultati.map(({ candidato, tratta }) => ({
          id: candidato.id, nome: candidato.nome, fonte: candidato.fonte, aggiornato: candidato.aggiornato,
          metri: tratta?.metri ?? candidato.linea, secondi: tratta?.secondi ?? null,
        })),
      });
    }
    return rispondi({ error: "Azione non supportata" }, 400);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Servizio) return rispondi({ stato: e.codice });
    if (e instanceof SyntaxError) return rispondi({ error: "Dati della richiesta non validi" }, 400);
    return rispondi({ stato: "non_disponibile" });
  }
});
