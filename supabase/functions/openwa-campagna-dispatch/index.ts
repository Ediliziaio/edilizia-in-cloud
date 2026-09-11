/**
 * openwa-campagna-dispatch — il dispatcher delle campagne WhatsApp Locale.
 *
 * Il canale aveva l'invio singolo e un anti-ban serio per numero, ma niente
 * che dicesse "questi 500 prospect, 10 al giorno per numero, e chi non
 * risponde risollecitalo". Questo worker e' quel pezzo.
 *
 * NON decide il ritmo. Chiede un invio a sendOpenWaMessage e quello applica
 * warm-up, cap giorno/settimana, throttle fra invii, finestra oraria e
 * rotazione sul numero meno carico. Quando il pool e' esaurito la risposta e'
 * 409: qui ci si ferma e si riprende al giro dopo. Il tetto vero resta nei
 * cap dei numeri, non in questo file — cosi' c'e' UN solo posto dove si
 * decide quanto forte si spinge.
 *
 * Chi ha risposto non riceve il follow-up: lo stato del destinatario passa a
 * 'risposto' dal webhook, e la query dei maturi lo esclude. Insistere con chi
 * ti ha gia' risposto e' il modo piu' rapido di farsi segnalare come spam.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendOpenWaMessage } from "../_shared/openwaSend.ts";
import { aiRouterPrompt } from "../_shared/aiRouter.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

interface CampagnaAi {
  ai_personalizza: boolean;
  ai_istruzioni: string | null;
  messaggio_b: string | null;
  variabili?: Record<string, string> | null;
  max_al_giorno?: number | null;
}

/**
 * Riscrive il messaggio nel contesto del contatto. L'AI ADATTA, non inventa:
 * il testo base resta la sostanza, il modello puo' solo calarlo nel contesto
 * (settore, citta', dimensione azienda). Qualunque errore → si torna al testo
 * base: la coda non deve mai fermarsi per un modello giu'.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function personalizzaMessaggio(admin: any, contactId: string, testoBase: string, istruzioni: string | null): Promise<string> {
  try {
    const { data: c } = await admin
      .from("marketing_contacts")
      .select("first_name, last_name, company_name, city, tags, ateco_code")
      .eq("id", contactId)
      .maybeSingle();
    if (!c) return testoBase;

    // Solo i dati UTILI al testo: i tag operativi (freddo, import-…) sono
    // rumore che confonderebbe il modello.
    const settori = (c.tags ?? []).filter((t: string) =>
      !/^(freddo|import|lista|dip:|fatt:)/.test(t));
    const dimensione = (c.tags ?? []).find((t: string) => t.startsWith("dip:")) ?? null;

    const contesto = [
      c.company_name && `Azienda: ${c.company_name}`,
      settori.length && `Settore: ${settori.join(", ")}`,
      c.city && `Citta': ${c.city}`,
      dimensione && `Dipendenti: ${dimensione.replace("dip:", "")}`,
      c.first_name && `Nome referente: ${[c.first_name, c.last_name].filter(Boolean).join(" ")}`,
    ].filter(Boolean).join("\n");
    if (!contesto) return testoBase;

    const r = await aiRouterPrompt({
      supabase: admin,
      taskKey: "openwa_personalizza",
      companyId: PLATFORM_COMPANY_ID,
      systemPrompt: [
        "Adatti messaggi WhatsApp di primo contatto B2B al contesto del destinatario.",
        "REGOLE NON NEGOZIABILI:",
        "- Stesso significato e stessa proposta del testo base: NON aggiungere offerte, sconti, promesse o dati che non ci sono.",
        "- Tono diretto, da imprenditore a imprenditore. Niente formule da call center.",
        "- Se hai la citta' o il settore, usali in modo naturale; se un dato manca, non inventarlo.",
        "- Lunghezza simile al testo base, mai oltre il 30% in piu'.",
        "- Niente saluti finali pomposi, niente firma.",
        "- Rispondi SOLO col messaggio pronto da inviare, nessuna premessa.",
        istruzioni ? `INDICAZIONI DI CHI HA CREATO LA CAMPAGNA:\n${istruzioni}` : "",
      ].filter(Boolean).join("\n"),
      userPrompt: `TESTO BASE:\n${testoBase}\n\nCONTESTO DEL DESTINATARIO:\n${contesto}`,
    });

    const testo = (r.content ?? "").trim();
    // Difese sul risultato: vuoto, esploso in lunghezza o con premesse da
    // chatbot → testo base. Meglio un messaggio generico che uno rotto.
    if (!testo || testo.length > testoBase.length * 1.6 + 120) return testoBase;
    if (/^(ecco|certo|ho adattato|di seguito)/i.test(testo)) return testoBase;
    return testo;
  } catch (e) {
    console.warn("[openwa-campagna-dispatch] personalizzazione fallita:", (e as Error)?.message);
    return testoBase;
  }
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Quanti tentare per giro. Non e' un limite di invio: i cap dei numeri si
// esauriscono prima, e al primo 409 si smette comunque.
const PER_GIRO = 40;

interface Maturo {
  destinatario_id: string;
  campagna_id: string;
  contact_id: string;
  tipo: "primo" | "followup" | "followup2" | "followup3";
  messaggio: string | null;
  tags_numeri: string[] | null;
}

serveConMetriche("openwa-campagna-dispatch", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret");
  if (!cronSecret || reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
  }

  const esito = { inviati: 0, followup: 0, saltati: 0, falliti: 0, pool_esaurito: false, completate: 0, limitati: 0 };

  try {
    const { data: maturi, error } = await admin.rpc("openwa_campagna_prossimi", { p_limit: PER_GIRO });
    if (error) throw new Error(`prossimi: ${error.message}`);

    // Impostazioni AI e variante B: una lettura per giro, non una per invio.
    const campagneIds = [...new Set(((maturi ?? []) as Maturo[]).map((m) => m.campagna_id))];
    const campagneAi = new Map<string, CampagnaAi>();
    if (campagneIds.length) {
      const { data: cfg } = await admin
        .from("openwa_campagne")
        .select("id, ai_personalizza, ai_istruzioni, messaggio_b, variabili, max_al_giorno")
        .in("id", campagneIds);
      for (const c of cfg ?? []) campagneAi.set(c.id, c as CampagnaAi);
    }

    // Le righe restituite da openwa_campagna_prossimi sono CLAIMATE (claimed_at)
    // per 15 minuti: ogni esito qui sotto le rilascia; quelle che restano non
    // lavorate (pool esaurito) vengono rilasciate subito in fondo.
    const lavorati = new Set<string>();
    // Campagne il cui numero ha gia' detto basta in questo giro (tetto o
    // throttle): le loro righe si saltano senza riprovare una per una.
    const campagneEsaurite = new Set<string>();
    for (const m of (maturi ?? []) as Maturo[]) {
      if (campagneEsaurite.has(m.campagna_id)) continue;
      lavorati.add(m.destinatario_id);
      const cfgAi = campagneAi.get(m.campagna_id);
      let testo = (m.messaggio ?? "").trim();

      // A/B: la variante si assegna al PRIMO invio (50/50) e resta scritta sul
      // destinatario — i follow-up e il report leggono quella, mai il caso.
      if (m.tipo === "primo" && cfgAi?.messaggio_b?.trim()) {
        const { data: dRow } = await admin
          .from("openwa_campagna_destinatari")
          .select("variante").eq("id", m.destinatario_id).maybeSingle();
        let variante: "A" | "B" | null = (dRow?.variante as "A" | "B" | null) ?? null;
        if (!variante) {
          variante = Math.random() < 0.5 ? "A" : "B";
          await admin.from("openwa_campagna_destinatari")
            .update({ variante }).eq("id", m.destinatario_id);
        }
        if (variante === "B") testo = cfgAi.messaggio_b.trim();
      }

      // Personalizzazione: ogni messaggio diverso dagli altri e' anche la
      // miglior difesa del numero (nessuna impronta da campagna).
      if (testo && cfgAi?.ai_personalizza) {
        testo = await personalizzaMessaggio(admin, m.contact_id, testo, cfgAi.ai_istruzioni);
      }

      if (!testo) {
        // Campagna senza testo per questo passo: non e' un errore da ritentare.
        await admin.from("openwa_campagna_destinatari")
          .update({ stato: "saltato", ultimo_errore: "messaggio non configurato", claimed_at: null })
          .eq("id", m.destinatario_id);
        esito.saltati++;
        continue;
      }

      // Tetto giornaliero DELLA CAMPAGNA (oltre a quello dei numeri): contato in
      // modo atomico prima dell'invio; se pieno la riga torna libera per domani.
      if (cfgAi?.max_al_giorno) {
        const { data: sottoTetto } = await admin.rpc("openwa_campagna_conta_invio", { p_campagna_id: m.campagna_id });
        if (sottoTetto === false) {
          await admin.from("openwa_campagna_destinatari").update({ claimed_at: null }).eq("id", m.destinatario_id);
          lavorati.delete(m.destinatario_id);
          esito.limitati++;
          continue;
        }
      }
      const scalaTetto = async () => { if (cfgAi?.max_al_giorno) await admin.rpc("openwa_campagna_scala_invio", { p_campagna_id: m.campagna_id }); };

      const res = await sendOpenWaMessage(admin, {
        contactId: m.contact_id,
        text: testo,
        variabili: cfgAi?.variabili ?? null,
        contactTags: m.tags_numeri ?? [],
        // Primo contatto E follow-up sono entrambi non richiesti: in tutti e
        // due i casi la persona deve poter dire basta con una parola.
        coldOutreach: true,
      });

      if (res.ok) {
        const ora = new Date().toISOString();
        // Ogni passo della sequenza porta il destinatario allo stato successivo
        // e timbra il proprio orario: e' da quel timbro che il passo dopo conta
        // i giorni di attesa.
        const patchPerTipo: Record<Maturo["tipo"], Record<string, unknown>> = {
          primo: { stato: "inviato", primo_inviato_at: ora },
          followup: { stato: "followup_inviato", followup_inviato_at: ora },
          followup2: { stato: "followup2_inviato", followup2_inviato_at: ora },
          followup3: { stato: "followup3_inviato", followup3_inviato_at: ora },
        };
        await admin.from("openwa_campagna_destinatari")
          // tentativi torna a 0: i tentativi bruciati sul passo precedente non
          // devono far diventare "fallito" al primo inciampo del passo dopo.
          .update({ ...patchPerTipo[m.tipo], ultimo_errore: null, tentativi: 0, claimed_at: null })
          .eq("id", m.destinatario_id);
        if (m.tipo === "primo") esito.inviati++; else esito.followup++;
        continue;
      }

      // 409 = pool esaurito o fuori orario: NON e' colpa del destinatario,
      // niente tentativi consumati. Fuori orario vale per tutti e chiude il
      // giro; il pool esaurito riguarda il numero di QUESTA campagna: con un
      // numero per campagna, fermarsi qui lasciava a secco anche le altre
      // (11/09/2026: tre numeri al tetto, il quarto fermo con 690 in coda).
      if (res.status === 409) {
        esito.pool_esaurito = true;
        lavorati.delete(m.destinatario_id); // questo NON e' stato lavorato
        await scalaTetto();
        if (res.motivo === "fuori_orario") break;
        campagneEsaurite.add(m.campagna_id);
        continue;
      }

      // 400 = destinatario non contattabile (opt-out, numero mancante):
      // inutile ritentare all'infinito.
      if (res.status === 400) {
        await scalaTetto();
        await admin.from("openwa_campagna_destinatari")
          .update({ stato: "saltato", ultimo_errore: res.error ?? "non contattabile", claimed_at: null })
          .eq("id", m.destinatario_id);
        esito.saltati++;
        continue;
      }

      // Errore vero (gateway giu', ecc.): conta un tentativo e riprova.
      // Il builder di supabase-js e' un Thenable, non una Promise: niente
      // .catch() qui, si legge il conteggio e si riscrive.
      await scalaTetto();
      const { data: row } = await admin
        .from("openwa_campagna_destinatari")
        .select("tentativi").eq("id", m.destinatario_id).maybeSingle();
      const tentativi = ((row?.tentativi as number | undefined) ?? 0) + 1;
      await admin.from("openwa_campagna_destinatari").update({
        tentativi,
        ultimo_errore: res.error ?? "invio fallito",
        ...(tentativi >= 5 ? { stato: "fallito" } : {}),
        claimed_at: null,
      }).eq("id", m.destinatario_id);
      esito.falliti++;
    }

    // Rilascio immediato dei claim non lavorati (pool esaurito / fuori orario):
    // senza, resterebbero bloccati 15 minuti anche se un numero si libera.
    const nonLavorati = ((maturi ?? []) as Maturo[])
      .map((x) => x.destinatario_id).filter((id) => !lavorati.has(id));
    if (nonLavorati.length) {
      await admin.from("openwa_campagna_destinatari")
        .update({ claimed_at: null }).in("id", nonLavorati);
    }

    // Scadenza della campagna: oltre la data si chiude, chi resta in coda non
    // riceve piu' nulla (i tempi li decide chi la lancia, non il motore).
    await admin.from("openwa_campagne")
      .update({ stato: "completata", completata_at: new Date().toISOString() })
      .eq("stato", "in_corso").lte("scadenza_il", new Date().toISOString());
    const { data: completate } = await admin.rpc("openwa_campagne_completa_finite");
    esito.completate = (completate as number | null) ?? 0;

    return new Response(JSON.stringify({ ok: true, ...esito }), { headers: corsH });
  } catch (e) {
    console.error("[openwa-campagna-dispatch]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, ...esito }), {
      status: 500, headers: corsH,
    });
  }
});
