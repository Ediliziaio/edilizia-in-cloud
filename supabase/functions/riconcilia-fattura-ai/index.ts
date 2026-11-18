import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import {
  preparaRichiestaRiconciliazione,
  validaPropostaRiconciliazione,
  esitiRiconciliazione,
  VERSIONE_RICONCILIAZIONE,
  type ContestoRiconciliazione,
} from "../_shared/riconciliazioneFattureAI.ts";

import { eseguiLottoRiconciliazione } from "../_shared/eseguiLottoRiconciliazione.ts";
import { pianificaLotti } from "../_shared/lottiRiconciliazione.ts";
import type { PropostaRiconciliazione } from "../_shared/riconciliazioneFattureAI.ts";
import { scenarioRiconciliazione } from "../_shared/riconciliazioneFattureScenari.ts";
import { MODELLO_REGOLE, propostaDaRegole, tolleranzeDaSoglie } from "../_shared/riconciliazioneRegole.ts";
import { registraEsitoLavoroAi } from "../_shared/esitoLavoroAi.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return json({ error: "Metodo non consentito." }, 405);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    if (Number(req.headers.get("content-length") ?? 0) > 16_000)
      return json({ error: "Richiesta troppo grande." }, 413);
    const raw = await req.text();
    if (raw.length > 16_000)
      return json({ error: "Richiesta troppo grande." }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "Richiesta non valida." }, 400);
    if (
      !uuid.test(input.fattura_id ?? "") ||
      !uuid.test(input.richiesta_id ?? "") ||
      !input.documenti ||
      ![input.documenti.ddt, input.documenti.oda].every(
        (v) =>
          Array.isArray(v) &&
          v.every((id) => typeof id === "string" && uuid.test(id)),
      )
    )
      return json({ error: "Fattura o selezione documenti non valida." }, 400);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const leggi = async () => {
      const { data, error } = await client.rpc(
        "fattura_riconciliazione_contesto",
        { p_fattura: input.fattura_id, p_documenti: input.documenti },
      );
      if (error)
        throw Object.assign(new Error(error.message), {
          status: error.code === "42501" ? 403 : 400,
        });
      return data as {
        contesto: ContestoRiconciliazione;
        impronta: string;
        puo_modificare: boolean;
      };
    };
    const context = await leggi();
    if (!context.puo_modificare)
      return json(
        {
          error: "Il tuo ruolo consente solo la lettura delle analisi salvate.",
        },
        403,
      );
    const esempio = input.simulazione
      ? scenarioRiconciliazione(String(input.simulazione))
      : null;
    if (input.simulazione && !esempio)
      return json({ error: "Scenario di prova non disponibile." }, 400);
    const c = esempio
      ? {
          ...esempio,
          fattura: {
            ...esempio.fattura,
            id: context.contesto.fattura.id,
            company_id: context.contesto.fattura.company_id,
          },
        }
      : context.contesto;
    const companyId = context.contesto.fattura.company_id;
    // Soglie dell'azienda (Impostazioni → Automazioni, 16/11/2026). Con i valori di partenza
    // l'impronta resta quella di prima, così le analisi già salvate valgono ancora.
    const { data: soglie } = await supabaseAdmin.rpc("azienda_soglie_automazioni", { p_company: companyId });
    const tolleranze = tolleranzeDaSoglie(soglie);
    const soglieProprie = tolleranze && (tolleranze.quantitaPerc !== 0 || tolleranze.prezzoPerc !== 0.5 || tolleranze.importoCent !== 2);
    const impronta =
      context.impronta + (esempio ? `:sim:${input.simulazione}` : "") +
      (soglieProprie ? `:toll:${tolleranze!.quantitaPerc}/${tolleranze!.prezzoPerc}/${tolleranze!.importoCent}` : "");
    const { data: cached, error: cacheError } = await supabaseAdmin
      .from("fattura_riconciliazioni_ai")
      .select("*")
      .eq("company_id", companyId)
      .eq("fattura_id", input.fattura_id)
      .eq("impronta", impronta)
      .maybeSingle();
    if (cacheError) throw cacheError;
    if (cached && !esempio)
      return json({ analisi: cached, riutilizzata: true });
    let proposta: PropostaRiconciliazione, modello: string;
    // Prima le regole (codice, descrizione, quantità, equivalenze e conversioni confermate):
    // se chiudono TUTTE le righe, l'AI non si chiama e non si paga; altrimenti riceve solo le altre.
    const regole = esempio ? null : propostaDaRegole(c, { tolleranze });
    if (regole?.proposta) {
      proposta = validaPropostaRiconciliazione(regole.proposta, c);
      modello = MODELLO_REGOLE;
      await registraEsitoLavoroAi(supabaseAdmin, {
        companyId, flusso: "fattura_riconcilia_righe", chiave: `${input.fattura_id}:${impronta}`, esito: "senza_ai",
        motivo: `${regole.chiuse}/${regole.righe} righe chiuse dalle regole`,
      });
    } else if (!esempio || input.simulazione === "fattura-lunga") {
      // Le righe che le regole hanno chiuso non vanno all'AI: solo quelle in dubbio.
      const chiuse = regole?.chiuseRighe ?? [];
      const lotto = await eseguiLottoRiconciliazione({
        db: supabaseAdmin,
        c,
        impronta,
        userId,
        verifica: async () => (await leggi()).impronta === context.impronta,
        chiuse,
      });
      if (lotto.avanzamento) return json(lotto);
      proposta = lotto.proposta!;
      modello = lotto.modello!;
      if (!esempio)
        await registraEsitoLavoroAi(supabaseAdmin, {
          companyId, flusso: "fattura_riconcilia_righe", chiave: `${input.fattura_id}:${impronta}`, esito: "con_ai",
          // Una chiamata per lotto (30 righe per volta), non una per fattura.
          chiamateAi: Math.max(1, pianificaLotti(c, chiuse).length),
          motivo: regole ? `regole: ${regole.chiuse}/${regole.righe} righe, all'AI le altre; ${regole.motivo ?? ""}`.slice(0, 300) : null,
        });
    } else {
      const messages = preparaRichiestaRiconciliazione(c);
      const result = await aiRouterComplete({
        supabase: supabaseAdmin,
        taskKey: "fattura_riconcilia",
        messages,
        companyId,
        userId,
        params: { temperature: 0, max_tokens: 10000, timeoutMs: 100_000 },
        responseFormat: { type: "json_object" },
        estimatedCostEur: 0.05,
        idempotencyKey: `fattura-riconcilia:${VERSIONE_RICONCILIAZIONE}:${companyId}:${userId}:${input.fattura_id}:${impronta}:${input.richiesta_id}`,
        guardProviderRequest: true,
        // Solo le proposte già validate sono riutilizzate dalla tabella sopra.
        // Una risposta malformata non deve bloccare i successivi tentativi per sette giorni.
        // La chiave della richiesta evita doppi addebiti sui retry di rete dello stesso tentativo.
      });
      // JSON delimitato da markdown è tollerato; testo arbitrario o JSON parziale restano errori.
      const text = result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      let risposta: unknown;
      try {
        risposta = JSON.parse(text);
      } catch {
        return json(
          {
            error:
              "Risposta AI non leggibile. Nessuna verifica è stata salvata.",
          },
          422,
        );
      }
      proposta = validaPropostaRiconciliazione(risposta, c);
      modello = result.modelUsed;
    }
    const esiti = esitiRiconciliazione(c, proposta);
    if (esempio)
      return json({
        simulazione: input.simulazione,
        proposta,
        esiti,
        modello,
      });
    if ((await leggi()).impronta !== impronta)
      return json(
        {
          error:
            "I documenti sono cambiati durante l’analisi. Aggiorna il confronto.",
        },
        409,
      );
    const { error: insertError } = await supabaseAdmin
      .from("fattura_riconciliazioni_ai")
      .upsert(
        {
          company_id: companyId,
          fattura_id: input.fattura_id,
          impronta,
          documenti: input.documenti,
          proposta,
          esiti,
          modello,
          created_by: userId,
        },
        {
          onConflict: "company_id,fattura_id,impronta",
          ignoreDuplicates: true,
        },
      );
    if (insertError) throw insertError;
    const { data: analisi, error } = await supabaseAdmin
      .from("fattura_riconciliazioni_ai")
      .select("*")
      .eq("company_id", companyId)
      .eq("fattura_id", input.fattura_id)
      .eq("impronta", impronta)
      .single();
    if (error) throw error;
    return json({ analisi, riutilizzata: false });
  } catch (e) {
    if (e instanceof Response) return e;
    // Non loggare contenuti fatture, prompt o token.
    console.error(
      "[riconcilia-fattura-ai]",
      e instanceof Error ? e.name : "errore",
    );
    const error = e as { message?: string; status?: number; code?: string };
    return json(
      {
        error:
          error.message ??
          "Analisi non disponibile. Nessuna verifica è stata modificata.",
      },
      error.status ?? (error.code === "42501" ? 403 : 500),
    );
  }
});

// 18/11/2026: ripubblicata per _shared/documentoNonFidato.ts (niente falso avviso «istruzioni rivolte all'AI») e _shared/estrazioneDdt.ts (niente numero d'esempio copiabile).
