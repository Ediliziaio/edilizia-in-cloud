import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "./aiRouter.ts";
import {
  pianificaLotti,
  contestoLotto,
  unisciLotti,
} from "./lottiRiconciliazione.ts";
import {
  preparaRichiestaRiconciliazione,
  validaPropostaRiconciliazione,
  type ContestoRiconciliazione,
  type PropostaRiconciliazione,
} from "./riconciliazioneFattureAI.ts";
export async function eseguiLottoRiconciliazione({
  db,
  c,
  impronta,
  userId,
  verifica,
}: {
  db: SupabaseClient;
  c: ContestoRiconciliazione;
  impronta: string;
  userId: string;
  verifica: () => Promise<boolean>;
}) {
  const piano = pianificaLotti(c),
    companyId = c.fattura.company_id;
  if (!piano.length)
    return { proposta: unisciLotti(c, []), modello: "equivalenze-confermate" };
  const { error: creazione } = await db
    .from("fattura_riconciliazione_lotti")
    .upsert(
      {
        company_id: companyId,
        fattura_id: c.fattura.id,
        impronta,
        totale: piano.length,
        created_by: userId,
      },
      { onConflict: "company_id,fattura_id,impronta", ignoreDuplicates: true },
    );
  if (creazione) throw creazione;
  const { data: job, error: lettura } = await db
    .from("fattura_riconciliazione_lotti")
    .select("*")
    .eq("company_id", companyId)
    .eq("fattura_id", c.fattura.id)
    .eq("impronta", impronta)
    .single();
  if (lettura) throw lettura;
  if (job.totale !== piano.length)
    throw new Error("Il piano di analisi è cambiato: aggiorna i documenti.");
  const avanzamento = (attendi = false) => ({
    avanzamento: {
      completati: Number(job.indice),
      totale: piano.length,
      attendi,
    },
  });
  if (job.indice >= piano.length)
    return {
      proposta: unisciLotti(c, job.parti as PropostaRiconciliazione[]),
      modello: (job.modelli as string[]).join(", "),
    };
  const token = crypto.randomUUID(),
    now = new Date().toISOString();
  const { data: claim, error: claimError } = await db
    .from("fattura_riconciliazione_lotti")
    .update({
      blocco: token,
      blocco_fino: new Date(Date.now() + 180000).toISOString(),
      errore: null,
      updated_at: now,
    })
    .eq("id", job.id)
    .eq("indice", job.indice)
    .or(`blocco_fino.is.null,blocco_fino.lt.${now}`)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claim) return avanzamento(true);
  let nonValida = false;
  try {
    const lotto = contestoLotto(c, piano[job.indice]);
    const risposta = await aiRouterComplete({
      supabase: db,
      taskKey: "fattura_riconcilia",
      companyId,
      userId,
      messages: preparaRichiestaRiconciliazione(lotto),
      params: { temperature: 0, max_tokens: 7500, timeoutMs: 90000 },
      responseFormat: { type: "json_object" },
      estimatedCostEur: 0.05,
      guardProviderRequest: true,
      idempotencyKey: `fattura-lotti-v1:${companyId}:${job.id}:${job.indice}:${job.tentativi}`,
    });
    let proposta: PropostaRiconciliazione;
    try {
      proposta = validaPropostaRiconciliazione(
        JSON.parse(
          risposta.content
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, ""),
        ),
        lotto,
      );
    } catch (e) {
      nonValida = true;
      throw e;
    }
    if (!(await verifica()))
      throw Object.assign(
        new Error(
          "I documenti sono cambiati durante l’analisi. Aggiorna il confronto.",
        ),
        { status: 409 },
      );
    const parti = [...(job.parti as PropostaRiconciliazione[]), proposta],
      modelli = [
        ...new Set([...(job.modelli as string[]), risposta.modelUsed]),
      ];
    const { data: salvata, error } = await db
      .from("fattura_riconciliazione_lotti")
      .update({
        indice: job.indice + 1,
        parti,
        modelli,
        tentativi: 0,
        blocco: null,
        blocco_fino: null,
        errore: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("indice", job.indice)
      .eq("blocco", token)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!salvata)
      throw new Error("Lotto non salvato. Riprova per riprendere l’analisi.");
    if (job.indice + 1 < piano.length)
      return {
        avanzamento: {
          completati: job.indice + 1,
          totale: piano.length,
          attendi: false,
        },
      };
    return { proposta: unisciLotti(c, parti), modello: modelli.join(", ") };
  } catch (e) {
    await db
      .from("fattura_riconciliazione_lotti")
      .update({
        blocco: null,
        blocco_fino: null,
        errore: e instanceof Error ? e.message : "Lotto non completato",
        tentativi: job.tentativi + (nonValida ? 1 : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("blocco", token);
    throw e;
  }
}
