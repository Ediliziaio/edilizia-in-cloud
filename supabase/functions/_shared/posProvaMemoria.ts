import assert from "node:assert/strict";
import { strToU8 } from "fflate";
import type { FontiProdottiPos } from "./posPacchetto.ts";

/**
 * Per i test dell'emissione col PDF disegnato dal browser (anche quello a freddo, in un processo a parte): gli
 * identificativi e un database finto che applica davvero i filtri di .eq(), perché una difesa sul token si vede
 * solo se la riga può non combaciare.
 */
export const companyId = "11111111-1111-4111-8111-111111111111", posId = "22222222-2222-4222-8222-222222222222";
export const id = "33333333-3333-4333-8333-333333333333", token = "44444444-4444-4444-8444-444444444444";
export const emessoIl = "2026-10-26T12:00:00+00:00";
export const byteAllegato = strToU8("BYTE ORIGINALI SINTETICI — NESSUNA FIRMA REALE\u0000\u0001ÿ");
const blob = (b: Uint8Array) => new Blob([new Uint8Array(b).buffer]);
const futuro = () => new Date(Date.now() + 5 * 60_000).toISOString();

/** Un database finto che applica davvero i filtri: una difesa sul token si vede solo se la riga può non combaciare. */
export function memoria(opzioni: { corrompi?: boolean; stato?: string; riservataFino?: string; prodotti?: FontiProdottiPos } = {}) {
  const riga: Record<string, unknown> = { id, token, company_id: companyId, pos_id: posId, revisione: 0, emesso_il: emessoIl, stato: opzioni.stato ?? "preparazione",
    origine: "approvazione_corrente", snapshot_id: null, riservata_fino: opzioni.riservataFino ?? futuro(), sorgente_updated_at: "2026-10-26T11:00:00+00:00", manifest: null };
  const store = new Map<string, Uint8Array>();
  const chiamate: string[] = [];
  const scritture: Array<{ valori: Record<string, unknown>; filtri: Array<[string, unknown]> }> = [];
  let manifestCompletato: Record<string, unknown> | null = null;
  const interroga = (op: "select" | "update", valori: Record<string, unknown> = {}) => {
    const filtri: Array<[string, unknown]> = [];
    const q = {
      eq: (k: string, v: unknown) => { filtri.push([k, v]); return q; },
      select: () => q,
      maybeSingle: async () => {
        const combacia = filtri.every(([k, v]) => riga[k] === v);
        if (op === "update") { scritture.push({ valori, filtri }); if (combacia) Object.assign(riga, valori); }
        return { data: combacia ? { ...riga } : null, error: null };
      },
    };
    return q;
  };
  const db = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chiamate.push(nome);
      if (nome === "pos_prenota_emissione") return { data: { ...riga }, error: null };
      if (nome === "pos_prodotti_fonti_emissione") return opzioni.prodotti ? { data: opzioni.prodotti, error: null } : { data: null, error: { code: "40001", message: "Fonte prodotto cambiata" } };
      assert.equal(nome, "pos_completa_emissione");
      assert.ok(store.size >= 7);
      manifestCompletato = args._manifest as Record<string, unknown>;
      Object.assign(riga, { stato: "completa" });
      return { data: { ...riga }, error: null };
    },
    from: (tabella: string) => { assert.equal(tabella, "pos_emissioni"); return { select: () => interroga("select"), update: (v: Record<string, unknown>) => interroga("update", v) }; },
    storage: { from: (bucket: string) => ({
      remove: async (paths: string[]) => { for (const p of paths) store.delete(p); return { error: null }; },
      upload: async (path: string, b: Uint8Array, opt: { upsert: boolean }) => { assert.equal(opt.upsert, false); assert.equal(bucket, "pos-emissioni"); store.set(path, new Uint8Array(b)); return { error: null }; },
      download: async (path: string) => ({ data: blob(bucket === "pos-emissioni" ? (opzioni.corrompi && path.endsWith("POS.pdf") ? strToU8("ALTERATO") : store.get(path)!) : byteAllegato), error: null }),
    }) },
  };
  return { db, riga, store, chiamate, scritture, manifest: () => manifestCompletato };
}

