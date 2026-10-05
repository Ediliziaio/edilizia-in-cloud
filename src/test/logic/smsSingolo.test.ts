/**
 * telnyx-send-sms: l'SMS singolo parte davvero. Prima leggeva colonne del
 * portafoglio che non esistono e rispondeva sempre «crediti insufficienti».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Per percorso in una variabile: i moduli delle edge function non entrano nel controllo dei tipi dell'app.
const PERCORSO = "../../../supabase/functions/_shared/smsSingolo";
const { inviaSmsSingolo, valoriTracciamento } = await import(/* @vite-ignore */ PERCORSO);

type Tabelle = Record<string, Record<string, unknown> | null>;
function finto(tabelle: Tabelle) {
  const scritture: { tabella: string; tipo: string; dati: Record<string, unknown> }[] = [];
  const rpcChiamate: { nome: string; args: Record<string, unknown> }[] = [];
  const admin = {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.limit = () => q;
      q.maybeSingle = async () => ({ data: tabelle[t] ?? null });
      q.single = async () => ({ data: { id: "msg-1" }, error: null as string | null });
      q.insert = (dati: Record<string, unknown>) => { scritture.push({ tabella: t, tipo: "insert", dati }); return q; };
      q.update = (dati: Record<string, unknown>) => { scritture.push({ tabella: t, tipo: "update", dati }); return q; };
      return q;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => { rpcChiamate.push({ nome, args }); return { data: [{ ok: true }] }; },
  };
  return { admin, scritture, rpcChiamate };
}
const conChiave = () => vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "TELNYX_MASTER_API_KEY" ? "k" : undefined) } });
const ricco = { sms_pricing_config: { prezzo_per_sms: 0.06 }, sms_wallet: { crediti: 5, crediti_riservati: 0 }, companies: { name: "Rossi Costruzioni S.r.l." } };
const base = { companyId: "c1", userId: "u1", to: "+393331234567", body: "Buongiorno, confermiamo l'appuntamento di domani." };

describe("SMS singolo", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("senza credito risponde 402 e non chiama Telnyx", async () => {
    conChiave();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const wallet of [null, { crediti: 0.02, crediti_riservati: 0 }, { crediti: 1, crediti_riservati: 0.99 }]) {
      const { admin } = finto({ ...ricco, sms_wallet: wallet });
      const esito = await inviaSmsSingolo(admin, base);
      expect(esito).toMatchObject({ ok: false, status: 402 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con credito: registra, invia, addebita una volta (la colonna è `crediti`, non `crediti_disponibili`)", async () => {
    conChiave();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: "tx-9" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { admin, scritture, rpcChiamate } = finto(ricco);
    const esito = await inviaSmsSingolo(admin, { ...base, trigger_type: "manual", trigger_entity: "preventivo", trigger_ref: "0afd020b-0f5e-3fff-84f0-4f51a853acd4" });
    expect(esito).toEqual({ ok: true, status: 200, message_id: "msg-1", telnyx_id: "tx-9" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(corpo).toMatchObject({ to: "+393331234567", text: base.body, from: "RossiCostru" });
    expect(rpcChiamate).toHaveLength(1);
    expect(rpcChiamate[0]).toMatchObject({ nome: "addebita_sms_wallet", args: { p_company_id: "c1", p_importo: 0.06, p_tipo: "addebito_sms", p_riferimento_id: "msg-1" } });
    const riga = scritture.find((s) => s.tabella === "sms_messages" && s.tipo === "insert")!.dati;
    expect(riga).toMatchObject({ company_id: "c1", direction: "outbound", status: "queued", created_by: "u1", trigger_entity: "preventivo", trigger_ref: "0afd020b-0f5e-3fff-84f0-4f51a853acd4" });
    expect(scritture.some((s) => s.tabella === "sms_messages" && s.tipo === "update" && s.dati.status === "sending" && s.dati.telnyx_id === "tx-9")).toBe(true);
  });

  it("se Telnyx rifiuta: messaggio «failed», nessun addebito, 502", async () => {
    conChiave();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("numero non valido", { status: 400 })));
    const { admin, rpcChiamate, scritture } = finto(ricco);
    const esito = await inviaSmsSingolo(admin, base);
    expect(esito).toMatchObject({ ok: false, status: 502 });
    expect(rpcChiamate).toHaveLength(0);
    expect(scritture.some((s) => s.tipo === "update" && s.dati.status === "failed")).toBe(true);
  });

  it("un errore di rete dà 502 e non addebita", async () => {
    conChiave();
    vi.stubGlobal("fetch", vi.fn(async (): Promise<Response> => { throw new Error("rete giù"); }));
    const { admin, rpcChiamate } = finto(ricco);
    expect(await inviaSmsSingolo(admin, base)).toMatchObject({ ok: false, status: 502 });
    expect(rpcChiamate).toHaveLength(0);
  });

  it("senza chiave Telnyx dice 500 e non scrive nulla nel registro", async () => {
    vi.stubGlobal("Deno", { env: { get: (): string | undefined => undefined } });
    const { admin, scritture } = finto({ ...ricco, telnyx_settings: null });
    expect(await inviaSmsSingolo(admin, base)).toMatchObject({ ok: false, status: 500 });
    expect(scritture).toHaveLength(0);
  });
});

describe("valori di tracciamento ammessi dal registro", () => {
  it("«contact» (quello che mandano schede cliente e invio rapido) non è ammesso: diventa null, il riferimento resta", () => {
    const ref = "0afd020b-0f5e-3fff-84f0-4f51a853acd4";
    expect(valoriTracciamento("manual", "contact", ref)).toEqual({ trigger_type: "manual", trigger_entity: null, trigger_ref: ref });
  });
  it("tipo sconosciuto → manual; riferimento non uuid → null", () => {
    expect(valoriTracciamento("boh", "fattura", "123")).toEqual({ trigger_type: "manual", trigger_entity: "fattura", trigger_ref: null });
    expect(valoriTracciamento(undefined, null, null)).toEqual({ trigger_type: "manual", trigger_entity: null, trigger_ref: null });
  });
});

describe("la funzione non torna a leggere colonne inesistenti", () => {
  const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it.each(["supabase/functions/telnyx-send-sms/index.ts", "supabase/functions/_shared/smsSingolo.ts"])("%s", (p) => {
    const s = leggi(p).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(s).not.toContain("crediti_disponibili");
    expect(s).not.toContain("saldo_bloccato");
    expect(s).not.toContain("telnyx_api_key");
    expect(s).not.toMatch(/\bnote:/);
  });
});
