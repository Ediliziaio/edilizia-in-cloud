/**
 * Motore planimetrie online (render Cycles e DWG), 23/11/2026.
 *
 * In locale, con Blender e LibreDWG sul Mac, il render e il DWG passano dai
 * plugin di Vite (`/__planimetrie/…`). Online passano da un container su
 * Cloudflare, dietro un biglietto che rilascia `planimetria-motore`: la funzione
 * controlla permesso e credito render, il container accetta il biglietto una
 * volta sola. Se il container è occupato risponde 429: qui si chiede un
 * biglietto nuovo e si riprova (il credito del primo è già stato restituito).
 *
 * Si accende con VITE_PLANIMETRIE_MOTORE_ONLINE=1, dopo la pubblicazione del
 * container: prima, nell'app il render fotorealistico e il DWG non compaiono.
 */
import { supabase } from "@/integrations/supabase/client";
import type { OperazioneMotore } from "../../../shared/planimetrie/bigliettoMotore";

export function motoreOnlineAttivo(): boolean {
  return import.meta.env.VITE_PLANIMETRIE_MOTORE_ONLINE === "1";
}

type Biglietto = { biglietto: string; url: string };

export class ErroreMotore extends Error {
  constructor(messaggio: string, readonly stato: number) { super(messaggio); }
}

async function chiediBiglietto(companyId: string, operazione: OperazioneMotore): Promise<Biglietto> {
  const { data, error } = await supabase.functions.invoke("planimetria-motore", {
    body: { azione: "biglietto", company_id: companyId, operazione },
  });
  if (error) {
    // FunctionsHttpError: il messaggio leggibile è nel corpo della risposta.
    const contesto = (error as { context?: Response }).context;
    const corpo = contesto ? await contesto.clone().json().catch((): null => null) as { error?: string } | null : null;
    throw new ErroreMotore(corpo?.error ?? "Il motore di render non è raggiungibile. Riprova tra poco.", contesto?.status ?? 500);
  }
  const b = data as Partial<Biglietto> | null;
  if (!b?.biglietto || !b.url || !/^https:\/\//.test(b.url)) throw new ErroreMotore("Risposta del motore non valida.", 500);
  return { biglietto: b.biglietto, url: b.url };
}

const attendi = (ms: number, signal: AbortSignal) => new Promise<void>((ok, ko) => {
  const t = setTimeout(ok, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); ko(signal.reason); }, { once: true });
});

/**
 * Manda un lavoro al motore online. `percorso` è «/render», «/dwg» o
 * «/dwg/modello»; le intestazioni sono quelle dei plugin locali.
 */
export async function chiamaMotoreOnline(
  companyId: string | null | undefined,
  operazione: OperazioneMotore,
  percorso: "/render" | "/dwg" | "/dwg/modello",
  init: { body: BodyInit; headers: Record<string, string>; signal: AbortSignal },
): Promise<Response> {
  if (!companyId) throw new ErroreMotore("Scegli l'azienda prima di avviare il render.", 400);
  for (let tentativo = 0; ; tentativo++) {
    init.signal.throwIfAborted();
    const { biglietto, url } = await chiediBiglietto(companyId, operazione);
    const risposta = await fetch(url + percorso, {
      method: "POST",
      body: init.body,
      headers: { ...init.headers, Authorization: `Bearer ${biglietto}` },
      signal: init.signal,
      credentials: "omit",
      redirect: "error",
    });
    if (risposta.status !== 429 || tentativo >= 4) return risposta;
    // Container occupato o appena acceso: si riprova con calma.
    await attendi(4000 * (tentativo + 1), init.signal);
  }
}
