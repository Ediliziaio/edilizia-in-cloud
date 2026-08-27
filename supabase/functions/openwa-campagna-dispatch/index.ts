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
  tipo: "primo" | "followup";
  messaggio: string | null;
  tags_numeri: string[] | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret");
  if (!cronSecret || reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
  }

  const esito = { inviati: 0, followup: 0, saltati: 0, falliti: 0, pool_esaurito: false, completate: 0 };

  try {
    const { data: maturi, error } = await admin.rpc("openwa_campagna_prossimi", { p_limit: PER_GIRO });
    if (error) throw new Error(`prossimi: ${error.message}`);

    for (const m of (maturi ?? []) as Maturo[]) {
      const testo = (m.messaggio ?? "").trim();
      if (!testo) {
        // Campagna senza testo per questo passo: non e' un errore da ritentare.
        await admin.from("openwa_campagna_destinatari")
          .update({ stato: "saltato", ultimo_errore: "messaggio non configurato" })
          .eq("id", m.destinatario_id);
        esito.saltati++;
        continue;
      }

      const res = await sendOpenWaMessage(admin, {
        contactId: m.contact_id,
        text: testo,
        contactTags: m.tags_numeri ?? [],
        // Primo contatto E follow-up sono entrambi non richiesti: in tutti e
        // due i casi la persona deve poter dire basta con una parola.
        coldOutreach: true,
      });

      if (res.ok) {
        const ora = new Date().toISOString();
        await admin.from("openwa_campagna_destinatari").update(
          m.tipo === "primo"
            ? { stato: "inviato", primo_inviato_at: ora, ultimo_errore: null }
            : { stato: "followup_inviato", followup_inviato_at: ora, ultimo_errore: null },
        ).eq("id", m.destinatario_id);
        if (m.tipo === "primo") esito.inviati++; else esito.followup++;
        continue;
      }

      // 409 = pool esaurito o fuori orario: NON e' colpa del destinatario.
      // Ci si ferma qui senza consumare tentativi — riprende il giro dopo.
      if (res.status === 409) {
        esito.pool_esaurito = true;
        break;
      }

      // 400 = destinatario non contattabile (opt-out, numero mancante):
      // inutile ritentare all'infinito.
      if (res.status === 400) {
        await admin.from("openwa_campagna_destinatari")
          .update({ stato: "saltato", ultimo_errore: res.error ?? "non contattabile" })
          .eq("id", m.destinatario_id);
        esito.saltati++;
        continue;
      }

      // Errore vero (gateway giu', ecc.): conta un tentativo e riprova.
      // Il builder di supabase-js e' un Thenable, non una Promise: niente
      // .catch() qui, si legge il conteggio e si riscrive.
      const { data: row } = await admin
        .from("openwa_campagna_destinatari")
        .select("tentativi").eq("id", m.destinatario_id).maybeSingle();
      const tentativi = ((row?.tentativi as number | undefined) ?? 0) + 1;
      await admin.from("openwa_campagna_destinatari").update({
        tentativi,
        ultimo_errore: res.error ?? "invio fallito",
        ...(tentativi >= 5 ? { stato: "fallito" } : {}),
      }).eq("id", m.destinatario_id);
      esito.falliti++;
    }

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
