/**
 * Le chiavi dell'AI dei render, lette dalla risposta di `debug-ai-providers` e spiegate a parole.
 * Il render parte da OpenAI; se OpenAI si ferma subentra il ripiego su OpenRouter. Gemini diretto oggi non è usato.
 */
export interface ProvaProvider {
  provider?: string;
  api_key_present?: boolean;
  model?: string;
  ok?: boolean;
  status?: number;
  error?: string;
  response_excerpt?: string;
}

export interface RigaDiagnosi {
  chiave: string;
  nome: string;
  ruolo: "principale" | "ripiego" | "non usato";
  stato: "ok" | "attenzione" | "guasto";
  frase: string;
}

const NOMI: Record<string, { nome: string; ruolo: RigaDiagnosi["ruolo"] }> = {
  openai_direct: { nome: "OpenAI (generazione dell'immagine)", ruolo: "principale" },
  openrouter_openai: { nome: "OpenRouter · gpt-5-image", ruolo: "ripiego" },
  openrouter_gemini: { nome: "OpenRouter · Gemini", ruolo: "non usato" },
  gemini_direct: { nome: "Google Gemini diretto", ruolo: "non usato" },
};

function fraseDi(p: ProvaProvider): { stato: RigaDiagnosi["stato"]; frase: string } {
  if (p.api_key_present === false) return { stato: "guasto", frase: "La chiave non è configurata nei segreti del server." };
  const testo = `${p.error ?? ""} ${p.response_excerpt ?? ""}`;
  if (p.ok) return { stato: "ok", frase: "Chiave valida: risponde." };
  if (p.status === 429 || /quota|exceeded|billing/i.test(testo)) return { stato: "guasto", frase: "Quota o credito esauriti sul fornitore: va ricaricato." };
  if (p.status === 401 || p.status === 403 || /invalid api key|incorrect api key|unauthorized/i.test(testo)) return { stato: "guasto", frase: "Chiave rifiutata dal fornitore: va sostituita." };
  if (/nessuna immagine/i.test(testo)) return { stato: "attenzione", frase: "Risponde ma non restituisce l'immagine nella prova minima: da verificare con un render vero." };
  return { stato: "attenzione", frase: p.error ? `Non risponde come previsto: ${p.error.slice(0, 120)}` : "Non risponde come previsto." };
}

export function leggiDiagnosiRenderAi(risposta: unknown): RigaDiagnosi[] {
  const catena = (risposta as { chain?: ProvaProvider[] } | null)?.chain;
  if (!Array.isArray(catena)) return [];
  return catena
    .filter((p): p is ProvaProvider & { provider: string } => typeof p?.provider === "string" && p.provider in NOMI)
    .map((p) => ({ chiave: p.provider, ...NOMI[p.provider], ...fraseDi(p) }))
    .sort((a, b) => ["principale", "ripiego", "non usato"].indexOf(a.ruolo) - ["principale", "ripiego", "non usato"].indexOf(b.ruolo));
}

/** La frase che dice se i render possono partire, e cosa succede se il principale si ferma. */
export function riassuntoRenderAi(righe: RigaDiagnosi[]): { stato: RigaDiagnosi["stato"]; frase: string } {
  const principale = righe.find((r) => r.ruolo === "principale");
  const ripiego = righe.find((r) => r.ruolo === "ripiego");
  if (!principale) return { stato: "attenzione", frase: "Nessuna prova ricevuta." };
  if (principale.stato !== "ok") {
    return ripiego?.stato === "ok"
      ? { stato: "attenzione", frase: "OpenAI non va: i render passano dal ripiego OpenRouter." }
      : { stato: "guasto", frase: "I render non possono partire: OpenAI non va e il ripiego non è sicuro." };
  }
  return ripiego?.stato === "ok"
    ? { stato: "ok", frase: "I render partono da OpenAI; se si ferma, subentra OpenRouter." }
    : { stato: "attenzione", frase: "I render partono da OpenAI, ma il ripiego OpenRouter non è verificato: se OpenAI si ferma il render potrebbe fallire." };
}

/** La prova approfondita del ripiego (`?mode=ripiego`): un'immagine vera passata solo da OpenRouter. */
export function leggiProvaRipiego(risposta: unknown): { stato: RigaDiagnosi["stato"]; frase: string } {
  const r = risposta as { ok?: boolean; latencyMs?: number; error?: string } | null;
  if (!r || typeof r !== "object") return { stato: "attenzione", frase: "La prova non ha restituito risultati." };
  if (r.ok) {
    const sec = typeof r.latencyMs === "number" ? ` in ${Math.round(r.latencyMs / 1000)} s` : "";
    return { stato: "ok", frase: `Il ripiego OpenRouter ha restituito un'immagine vera${sec}: se OpenAI si ferma il render passa da qui.` };
  }
  const testo = r.error ?? "";
  if (/quota|credit|billing|402|429/i.test(testo)) return { stato: "guasto", frase: "Il ripiego è senza credito o quota: va ricaricato OpenRouter." };
  if (/401|403|invalid api key|unauthorized/i.test(testo)) return { stato: "guasto", frase: "Il ripiego ha la chiave rifiutata: va sostituita." };
  return { stato: "guasto", frase: testo ? `Il ripiego non restituisce l'immagine: ${testo.slice(0, 120)}` : "Il ripiego non restituisce l'immagine." };
}
