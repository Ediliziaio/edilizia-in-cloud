/**
 * Chi ha chiesto una persona e nessuno l'ha richiamato (27/10/2026).
 *
 * Quando il cliente scrive «voglio parlare con qualcuno», l'assistente WhatsApp passa la scheda in «Intervento
 * operatore» e manda una campanella. Se nessuno guarda l'app, lì finisce: Il Bagno Group aveva Raffaela
 * Campitiello ferma da 28 giorni e un'altra persona da 43, dopo aver chiesto di essere richiamate.
 *
 * Questo giro, una volta al giorno, elenca chi aspetta da più di qualche ora senza aver ricevuto risposta e lo
 * dice a chi amministra l'azienda: campanella ed email, con nomi, telefoni e da quanti giorni aspettano.
 * Si può invocare per una sola azienda (`{"company_id": "..."}`) e con una soglia diversa (`{"ore": 4}`).
 *
 * Pubblicata con verify_jwt = false (vedi supabase/config.toml): chi la chiama porta x-cron-secret, non un JWT.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Persona { chi: string; telefono: string | null; giorni: number }
interface Attesa { company_id: string; azienda: string; quante: number; persone: Persona[]; email: string[] }

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** «da 28 giorni», «da ieri», «da oggi»: come lo direbbe una persona. */
function daQuando(giorni: number): string {
  if (giorni <= 0) return "da oggi";
  if (giorni === 1) return "da ieri";
  return `da ${giorni} giorni`;
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  if (!cronSecretValido(req)) return errorResponse("Non autorizzato", 401, corsH);

  const corpo = await req.json().catch(() => ({})) as { company_id?: string; ore?: number };
  const ore = Number.isFinite(Number(corpo.ore)) ? Math.min(720, Math.max(1, Number(corpo.ore))) : 4;

  const { data, error } = await admin.rpc("attese_operatore_da_sollecitare", {
    p_company_id: corpo.company_id ?? null,
    p_ore: ore,
  });
  if (error) return errorResponse(`Lettura attese: ${error.message}`, 500, corsH);

  const avvisate: Array<{ azienda: string; quante: number; email: number }> = [];
  for (const riga of (data ?? []) as Attesa[]) {
    const persone = Array.isArray(riga.persone) ? riga.persone : [];
    if (!persone.length) continue;
    const piuVecchia = Math.max(...persone.map((p) => Number(p.giorni) || 0));

    // La campanella decide anche se è il momento: una volta al giorno per azienda.
    const { data: esito } = await admin.rpc("avvisa_attese_operatore", {
      p_company_id: riga.company_id,
      p_quante: riga.quante,
      p_piu_vecchia: piuVecchia,
    });
    if (!esito?.avvisato) continue;

    let inviate = 0;
    if (riga.email?.length) {
      const righe = persone
        .map((p) => `<li><strong>${esc(p.chi)}</strong>${p.telefono ? ` — ${esc(p.telefono)}` : ""} · aspetta ${daQuando(Number(p.giorni) || 0)}</li>`)
        .join("");
      const testo = persone
        .map((p) => `- ${p.chi}${p.telefono ? ` (${p.telefono})` : ""}: aspetta ${daQuando(Number(p.giorni) || 0)}`)
        .join("\n");
      const quante = riga.quante === 1 ? "Una persona aspetta" : `${riga.quante} persone aspettano`;
      const esitoEmail = await sendEmailUnified({
        companyId: riga.company_id,
        stream: "transactional",
        to: riga.email,
        subject: `${quante} di essere richiamate`,
        html: `<p>Ciao,</p><p>${quante} di essere richiamate: hanno scritto su WhatsApp chiedendo di parlare con una persona, `
          + `e l'assistente ha passato la conversazione a voi.</p><ul>${righe}</ul>`
          + `<p>Finché nessuno le richiama restano ferme. Le trovate nel CRM, nella fase «Intervento operatore».</p>`,
        text: `${quante} di essere richiamate dopo aver chiesto di parlare con una persona:\n\n${testo}\n\nLe trovate nel CRM, fase «Intervento operatore».`,
        templateName: "attese_operatore",
        // È un avviso di servizio: deve partire anche con il credito email a zero.
        skipCredits: true,
        adminClient: admin,
        metadata: { tipo: "attese_operatore", quante: riga.quante },
      });
      inviate = esitoEmail.ok ? riga.email.length : 0;
      if (!esitoEmail.ok) console.error("[attese-operatore] email non inviata:", JSON.stringify(esitoEmail.body));
    }
    avvisate.push({ azienda: riga.azienda, quante: riga.quante, email: inviate });
  }
  return jsonResponse({ ok: true, ore, aziende_avvisate: avvisate.length, avvisate });
});
