/**
 * La lettura di PSC e contratto come lavoro registrato (pos_letture_documenti): una riga per POS e impronta dei
 * documenti, così un secondo clic ritrova la stessa lettura invece di pagarne un'altra. Il lavoro gira dopo la
 * risposta (EdgeRuntime.waitUntil) e salva ogni blocco appena letto: se il worker si ferma, il riavvio riparte
 * dal primo blocco mancante. La tabella è chiusa al browser: si legge e si scrive solo da genera-pos, dopo i
 * controlli di azienda e permesso.
 */
import { aiRouterComplete } from "./aiRouter.ts";
import { erroreAiPerUtente } from "./erroriAi.ts";
import { extractJsonFromLLM } from "./extractJson.ts";
import { estraiPagineTestoPdf } from "./pdfExtraction.ts";
import { pscPerAiPos } from "./posAiFonti.ts";
import { estrattiOcrPsc } from "./posOcrPsc.ts";
import { percorsoStorageSicuro } from "./posPercorsi.ts";
import { improntaPsc, LIMITE_PSC_BYTES, type RiferimentoPsc } from "./posPsc.ts";
import {
  blocchiLettore, improntaLettura, normalizzaDecisioniLettore, normalizzaRisultatoLettore, PAROLE_LETTORE, richiestaLettore,
  SISTEMA_LETTORE, unisciRisultatiLettore, verificaRispostaLettore,
  type BloccoLettore, type DecisioniLettore, type FonteContrattoLettore, type PaginaLettore, type RisultatoLettore,
} from "./posLettoreDocumenti.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
type Parziale = ReturnType<typeof verificaRispostaLettore>;

/** Dopo questo tempo una lettura «in corso» senza progressi si considera ferma e si può riprendere. */
export const LETTURA_FERMA_MS = 5 * 60_000;
const COLONNE = "id,company_id,order_id,pos_id,impronta,stato,fonti,parziali,risultato,decisioni,avvisi,errore,richiesto_da,created_at,updated_at,completata_il";

export interface LetturaDocumentiPos {
  id: string; company_id: string; order_id: string; pos_id: string; impronta: string;
  stato: "in_corso" | "pronta" | "errore";
  fonti: { psc?: RiferimentoPsc | null; contratto?: FonteContrattoLettore | null; blocchi?: number };
  parziali: (Parziale | null)[];
  risultato: unknown; decisioni: unknown; avvisi: string[]; errore: string | null;
  created_at: string; updated_at: string; completata_il: string | null;
}

export class ErroreLettore extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Il contratto si legge solo se l'utente vede quell'allegato (RLS col suo token) e se è della stessa commessa. */
export async function contrattoPerLettore(db: Db, supabaseUser: Db, orderId: string, allegatoId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(allegatoId)) throw new ErroreLettore("Scegli un contratto valido.", 400);
  const { data, error } = await supabaseUser.from("order_attachments")
    .select("id,order_id,file_name,file_url,file_type,file_size").eq("id", allegatoId).maybeSingle();
  if (error) throw new ErroreLettore("Accesso al contratto non verificabile. Riprova tra poco.", 503);
  if (!data || data.order_id !== orderId) throw new ErroreLettore("Contratto non disponibile per questa commessa.", 404);
  const pdf = data.file_type === "application/pdf" || /\.pdf$/i.test(String(data.file_name ?? ""));
  if (!pdf) throw new ErroreLettore("Il contratto deve essere un PDF.", 422);
  if ((data.file_size ?? 0) > LIMITE_PSC_BYTES) throw new ErroreLettore("Il contratto supera i 20 MB.", 422);
  if (!percorsoStorageSicuro(data.file_url)) throw new ErroreLettore("Contratto non disponibile.", 404);
  const { data: file, error: erroreFile } = await db.storage.from("order-attachments").download(data.file_url);
  if (erroreFile || !file?.size) throw new ErroreLettore("L’originale del contratto non è disponibile.", 404);
  if (file.size > LIMITE_PSC_BYTES) throw new ErroreLettore("Il contratto supera i 20 MB.", 422);
  const buffer = await file.arrayBuffer();
  const fonte: FonteContrattoLettore = {
    id: data.id, file_name: String(data.file_name ?? "contratto.pdf").slice(0, 200), file_path: data.file_url,
    sha256: await improntaPsc(new Blob([buffer])),
  };
  return { fonte, bytes: new Uint8Array(buffer) };
}

/**
 * Crea la riga della lettura o ritrova quella con la stessa impronta. Restituisce `avvia` vero solo a chi ha preso
 * in carico il lavoro: una lettura pronta o in corso da poco non riparte.
 */
export async function prenotaLetturaDocumenti(db: Db, dati: {
  companyId: string; orderId: string; posId: string; userId: string;
  psc: RiferimentoPsc | null; contratto: FonteContrattoLettore | null;
}): Promise<{ lettura: LetturaDocumentiPos; avvia: boolean }> {
  const impronta = improntaLettura(dati.psc, dati.contratto);
  // Chi inserisce la riga prende in carico la lettura; chi trova la riga già presente (vincolo unico) la ritrova.
  const { data: nuova, error } = await db.from("pos_letture_documenti").insert({
    company_id: dati.companyId, order_id: dati.orderId, pos_id: dati.posId, impronta, richiesto_da: dati.userId,
    fonti: { psc: dati.psc, contratto: dati.contratto },
  }).select(COLONNE).maybeSingle();
  if (nuova) return { lettura: nuova, avvia: true };
  if (error && error.code !== "23505") throw new ErroreLettore("Non riesco a registrare la lettura. Riprova tra poco.", 503);
  const lettura = await letturaPerImpronta(db, dati.posId, impronta);
  if (!lettura) throw new ErroreLettore("Lettura non registrata. Riprova tra poco.", 503);
  if (lettura.stato === "pronta") return { lettura, avvia: false };
  const ferma = new Date(Date.now() - LETTURA_FERMA_MS).toISOString();
  if (lettura.stato === "in_corso" && lettura.updated_at > ferma) return { lettura, avvia: false };
  // Presa in carico atomica: una sola richiesta cambia updated_at, le altre non trovano più la riga com'era.
  const { data, error: errorePresa } = await db.from("pos_letture_documenti")
    .update({ stato: "in_corso", errore: null, richiesto_da: dati.userId, updated_at: new Date().toISOString() })
    .eq("id", lettura.id).eq("updated_at", lettura.updated_at)
    .select(COLONNE).maybeSingle();
  if (errorePresa) throw new ErroreLettore("Non riesco a riprendere la lettura. Riprova tra poco.", 503);
  return data ? { lettura: data, avvia: true } : { lettura: (await letturaPerImpronta(db, dati.posId, impronta)) ?? lettura, avvia: false };
}

async function letturaPerImpronta(db: Db, posId: string, impronta: string): Promise<LetturaDocumentiPos | null> {
  const { data, error } = await db.from("pos_letture_documenti").select(COLONNE).eq("pos_id", posId).eq("impronta", impronta).maybeSingle();
  if (error) throw new ErroreLettore("Lettura dei documenti non disponibile.", 503);
  return data;
}

/** L'ultima lettura avviata per questo POS, qualunque sia il suo stato. */
export async function ultimaLetturaDocumenti(db: Db, companyId: string, posId: string): Promise<LetturaDocumentiPos | null> {
  const { data, error } = await db.from("pos_letture_documenti").select(COLONNE)
    .eq("company_id", companyId).eq("pos_id", posId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new ErroreLettore("Lettura dei documenti non disponibile.", 503);
  return data;
}

/** Risultato e decisioni di una lettura pronta, solo se riguarda ancora il PSC indicato (o nessun PSC). */
export function risultatoUtilizzabile(lettura: LetturaDocumentiPos | null, psc?: Pick<RiferimentoPsc, "id" | "sha256" | "revisione"> | null):
  { risultato: RisultatoLettore; decisioni: DecisioniLettore } | null {
  if (!lettura || lettura.stato !== "pronta") return null;
  const risultato = normalizzaRisultatoLettore(lettura.risultato);
  if (!risultato) return null;
  const letto = lettura.fonti?.psc;
  if (letto && (!psc || letto.id !== psc.id || letto.sha256 !== psc.sha256 || letto.revisione !== psc.revisione)) return null;
  return { risultato, decisioni: normalizzaDecisioniLettore(lettura.decisioni, risultato) };
}

export async function salvaDecisioniLettura(db: Db, companyId: string, posId: string, letturaId: string, decisioni: unknown) {
  const lettura = await ultimaLetturaDocumenti(db, companyId, posId);
  if (!lettura || lettura.id !== letturaId) throw new ErroreLettore("La lettura è cambiata. Riapri i risultati.", 409);
  const risultato = normalizzaRisultatoLettore(lettura.risultato);
  if (lettura.stato !== "pronta" || !risultato) throw new ErroreLettore("La lettura non è ancora pronta.", 409);
  const scelte = normalizzaDecisioniLettore(decisioni, risultato);
  const { error } = await db.from("pos_letture_documenti").update({ decisioni: scelte, updated_at: new Date().toISOString() })
    .eq("id", lettura.id).eq("company_id", companyId);
  if (error) throw new ErroreLettore("Scelte non salvate. Riprova.", 503);
  return scelte;
}

async function paginePsc(db: Db, psc: RiferimentoPsc): Promise<{ pagine: PaginaLettore[]; avvisi: string[] }> {
  const avvisi: string[] = [];
  // Prima l'archivio della lettura OCR (anche le pagine scansionate), poi il testo del PDF.
  const archivio = await estrattiOcrPsc(db, psc, PAROLE_LETTORE.join(" ")).catch((): null => null);
  if (archivio?.fonte?.pagine.length) {
    if (archivio.avviso) avvisi.push(archivio.avviso);
    return { pagine: archivio.fonte.pagine, avvisi };
  }
  const nativo = await pscPerAiPos(db, psc.company_id, psc.order_id, psc);
  if (archivio?.avviso) avvisi.push(archivio.avviso);
  if (nativo.avviso) avvisi.push(nativo.avviso);
  return { pagine: nativo.fonte?.pagine ?? [], avvisi };
}

function pagineContratto(bytes: Uint8Array): Promise<{ pagine: PaginaLettore[]; avvisi: string[] }> {
  return Promise.resolve(estraiPagineTestoPdf(bytes, 40, 80_000)).then(l => ({
    pagine: l.pagine,
    avvisi: [
      !l.pagine.length ? "Il contratto non ha testo leggibile (forse è una scansione): letto solo il PSC." : "",
      l.illeggibili.length && l.pagine.length ? `Contratto: pagine senza testo leggibile ${l.illeggibili.slice(0, 8).join(", ")}.` : "",
    ].filter(Boolean),
  }));
}

/** Esegue (o riprende) la lettura: legge i documenti, chiede al modello blocco per blocco, salva ogni passo. */
export async function eseguiLetturaDocumenti(db: Db, lettura: LetturaDocumentiPos, userId: string,
  contrattoBytes?: Uint8Array): Promise<void> {
  const salva = async (campi: Record<string, unknown>) => {
    const { error } = await db.from("pos_letture_documenti").update({ ...campi, updated_at: new Date().toISOString() }).eq("id", lettura.id);
    if (error) throw new Error("Avanzamento della lettura non salvato");
  };
  try {
    const avvisi: string[] = [];
    let psc: PaginaLettore[] = [], contratto: PaginaLettore[] = [];
    if (lettura.fonti.psc) {
      const r = await paginePsc(db, lettura.fonti.psc);
      psc = r.pagine; avvisi.push(...r.avvisi);
    }
    if (lettura.fonti.contratto) {
      const bytes = contrattoBytes ?? await scaricaContratto(db, lettura.fonti.contratto);
      const r = await pagineContratto(bytes);
      contratto = r.pagine; avvisi.push(...r.avvisi);
    }
    const { blocchi, avvisi: avvisiBlocchi } = blocchiLettore(psc, contratto);
    avvisi.push(...avvisiBlocchi);
    if (!blocchi.length) {
      await salva({ stato: "errore", errore: "Nei documenti scelti non ci sono pagine leggibili su accessi, consegne o emergenze.", avvisi });
      return;
    }
    const parziali: (Parziale | null)[] = Array.from({ length: blocchi.length }, (_, i) => lettura.parziali?.[i] ?? null);
    await salva({ fonti: { ...lettura.fonti, blocchi: blocchi.length }, avvisi });
    for (const [i, blocco] of blocchi.entries()) {
      if (parziali[i]) continue;
      parziali[i] = await leggiBlocco(db, lettura, userId, blocco, i);
      await salva({ parziali });
    }
    const risultato = unisciRisultatiLettore(parziali.filter((p): p is Parziale => !!p));
    await salva({ stato: "pronta", risultato, completata_il: new Date().toISOString() });
  } catch (e) {
    const ai = erroreAiPerUtente(e);
    const messaggio = ai && typeof ai.body.error === "string" ? ai.body.error
      : e instanceof ErroreLettore ? e.message : "Lettura interrotta. Riprova: riparte dal punto in cui si è fermata.";
    await salva({ stato: "errore", errore: messaggio }).catch(() => {});
  }
}

async function scaricaContratto(db: Db, fonte: FonteContrattoLettore): Promise<Uint8Array> {
  const { data, error } = await db.storage.from("order-attachments").download(fonte.file_path);
  if (error || !data?.size) throw new ErroreLettore("L’originale del contratto non è più disponibile.", 404);
  const buffer = await data.arrayBuffer();
  if (await improntaPsc(new Blob([buffer])) !== fonte.sha256) throw new ErroreLettore("Il contratto è cambiato: avvia una nuova lettura.", 409);
  return new Uint8Array(buffer);
}

async function leggiBlocco(db: Db, lettura: LetturaDocumentiPos, userId: string, blocco: BloccoLettore, indice: number): Promise<Parziale> {
  const r = await aiRouterComplete({
    supabase: db, taskKey: "documento_pos", companyId: lettura.company_id, userId,
    // La chiave identifica questa chiamata: un riavvio che rilegge lo stesso blocco non si paga due volte.
    idempotencyKey: `pos_lettore:${lettura.id}:${indice}`,
    messages: [
      { role: "system", content: SISTEMA_LETTORE },
      { role: "user", content: richiestaLettore(blocco) },
    ],
    params: { temperature: 0, max_tokens: 5000 },
    responseFormat: { type: "json_object" },
    estimatedCostEur: 0.04,
  });
  let parsed: unknown;
  try {
    parsed = extractJsonFromLLM(r.content || "");
  } catch {
    throw new ErroreLettore("La risposta del lettore non era leggibile. Riprova.", 502);
  }
  return verificaRispostaLettore(parsed, blocco);
}
