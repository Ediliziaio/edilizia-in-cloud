/**
 * Revoca delle sessioni: si chiude l'accesso vero (24/09/2026).
 *
 * «Revoca» segnava come terminata la riga di user_sessions e basta: l'accesso in
 * auth.sessions restava, l'app rinnovava il token e la persona restava dentro —
 * Venusia (BeMade) è stata buttata fuori a mano con una DELETE. Qui si tengono
 * insieme i tre pezzi della correzione: la funzione server chiude l'accesso
 * giusto e solo a chi ne ha diritto; l'app riconosce l'accesso chiuso e torna al
 * login; il database non lascia chiudere accessi né scrivere righe a chi non
 * deve (migrazione 20280924233000, provata anche sul database vero con
 * transazioni annullate).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import {
  idAccessoDalToken as idAccessoLatoServer,
  revocaSessioni,
} from "../../../supabase/functions/_shared/revocaSessioni";
import {
  DISTANZA_MINIMA_CONTROLLI_MS,
  accessoChiusoDalServer,
  creaControlloAccesso,
  idAccessoDalToken,
  sessioneDaRegistrare,
} from "@/lib/auth/accessoRevocato";

const auth = vi.hoisted(() => ({
  ascolta: null as null | ((evento: string, sessione: { access_token: string } | null) => void),
  getUser: null as unknown as Mock,
}));
const intervallo = vi.hoisted(() => ({ esegui: null as null | (() => void) }));
const avvisi = vi.hoisted(() => ({ info: null as unknown as Mock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (fn: (evento: string, sessione: { access_token: string } | null) => void) => {
        auth.ascolta = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getUser: (token: string) => auth.getUser(token),
    },
  },
}));
vi.mock("@/lib/intervalloVisibile", () => ({
  avviaIntervalloVisibile: (esegui: () => void) => {
    intervallo.esegui = esegui;
    return () => {};
  },
}));
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => avvisi.info(...args) } }));

import { useAccessoRevocato } from "@/hooks/useAccessoRevocato";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const ACCESSO = "0b7e6c1e-8a3f-4f7e-9d2a-5c1b3e4f6a7b";
const ALTRO_ACCESSO = "9f1d2c3b-4a5e-4f60-8b7c-d1e2f3a4b5c6";

const base64url = (valore: unknown) =>
  btoa(JSON.stringify(valore)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims: Record<string, unknown>) =>
  `${base64url({ alg: "ES256", kid: "chiave" })}.${base64url(claims)}.firma`;

describe("l'accesso scritto nel token", () => {
  // "ÿÿÿ" in base64 dà "/": il claim si legge anche coi caratteri di base64url.
  const conAccesso = token({ sub: "persona-1", session_id: ACCESSO, nome: "ÿÿÿ" });

  it("lato app e lato server leggono lo stesso claim session_id", () => {
    expect(conAccesso.split(".")[1]).toMatch(/[-_]/);
    expect(idAccessoDalToken(conAccesso)).toBe(ACCESSO);
    expect(idAccessoLatoServer(`Bearer ${conAccesso}`)).toBe(ACCESSO);
  });

  it("niente id da un token senza claim, con un claim che non è un uuid o illeggibile", () => {
    for (const t of [token({ sub: "x" }), token({ session_id: "1; drop table" }), "a.b-non-json.c", "", null, undefined]) {
      expect(idAccessoDalToken(t)).toBeNull();
      expect(idAccessoLatoServer(t ? `Bearer ${t}` : t)).toBeNull();
    }
  });

  it("lato server vuole l'intestazione Authorization intera", () => {
    expect(idAccessoLatoServer(conAccesso)).toBeNull();
  });
});

describe("la scheda registra la sessione dell'accesso che ha davvero", () => {
  const t = token({ session_id: ACCESSO });

  it("senza riga salvata la registra", () => {
    expect(sessioneDaRegistrare(t, null, null)).toBe(true);
  });

  it("con la riga dello stesso accesso no: un ricaricamento non apre righe", () => {
    expect(sessioneDaRegistrare(t, "riga-1", ACCESSO)).toBe(false);
  });

  it("con la riga di un altro accesso sì: nuovo login nella stessa scheda, «Accedi come»", () => {
    expect(sessioneDaRegistrare(t, "riga-1", ALTRO_ACCESSO)).toBe(true);
  });

  it("una riga di prima del 24/09, senza accesso salvato, si ricollega", () => {
    expect(sessioneDaRegistrare(t, "riga-vecchia", null)).toBe(true);
  });

  it("un token senza claim non fa registrare a ogni caricamento", () => {
    expect(sessioneDaRegistrare(token({ sub: "x" }), "riga-1", null)).toBe(false);
  });
});

describe("l'app riconosce l'accesso chiuso", () => {
  it("solo quando GoTrue dice session_not_found", () => {
    expect(accessoChiusoDalServer(new AuthSessionMissingError())).toBe(true);
    expect(accessoChiusoDalServer(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(false);
    expect(accessoChiusoDalServer(new AuthApiError("invalid JWT: token is expired", 403, "bad_jwt"))).toBe(false);
    expect(accessoChiusoDalServer(new Error("qualunque"))).toBe(false);
    expect(accessoChiusoDalServer(null)).toBe(false);
  });

  const controlloCon = (risposta: () => Promise<{ error: unknown }>) => {
    let ora = 1_000_000;
    const chiediUtente = vi.fn(risposta);
    const quandoChiuso = vi.fn();
    const controllo = creaControlloAccesso({ chiediUtente, quandoChiuso, adesso: () => ora });
    return { controllo, chiediUtente, quandoChiuso, avanza: (ms: number) => { ora += ms; } };
  };

  it("senza token non chiede niente", async () => {
    const { controllo, chiediUtente } = controlloCon(async () => ({ error: null }));
    expect(await controllo.controlla()).toBe(false);
    expect(chiediUtente).not.toHaveBeenCalled();
  });

  it("accesso chiuso: avvisa una volta, anche se il SIGNED_OUT di supabase-js arriva prima della risposta", async () => {
    const { controllo, chiediUtente, quandoChiuso } = controlloCon(async () => {
      controllo.aggiornaToken(null); // _removeSession() di auth-js
      return { error: new AuthSessionMissingError() };
    });
    controllo.aggiornaToken("token-1");
    expect(await controllo.controlla()).toBe(true);
    expect(chiediUtente).toHaveBeenCalledWith("token-1");
    expect(quandoChiuso).toHaveBeenCalledTimes(1);
  });

  it("rete giù o server in errore: nessuno viene buttato fuori", async () => {
    const giu = controlloCon(async () => ({ error: new AuthRetryableFetchError("Failed to fetch", 0) }));
    giu.controllo.aggiornaToken("token-1");
    expect(await giu.controllo.controlla()).toBe(false);
    expect(giu.quandoChiuso).not.toHaveBeenCalled();

    const eccezione = controlloCon(async () => { throw new TypeError("Failed to fetch"); });
    eccezione.controllo.aggiornaToken("token-1");
    expect(await eccezione.controllo.controlla()).toBe(false);
  });

  it("un nuovo accesso fatto nel frattempo non riceve l'avviso del vecchio", async () => {
    const { controllo, quandoChiuso } = controlloCon(async () => {
      controllo.aggiornaToken("token-nuovo");
      return { error: new AuthSessionMissingError() };
    });
    controllo.aggiornaToken("token-vecchio");
    await controllo.controlla();
    expect(quandoChiuso).not.toHaveBeenCalled();
  });

  it("tornando spesso sulla scheda non si martella GoTrue", async () => {
    const { controllo, chiediUtente, avanza } = controlloCon(async () => ({ error: null }));
    controllo.aggiornaToken("token-1");
    await controllo.controlla();
    avanza(DISTANZA_MINIMA_CONTROLLI_MS - 1);
    await controllo.controlla();
    expect(chiediUtente).toHaveBeenCalledTimes(1);
    avanza(1);
    await controllo.controlla();
    expect(chiediUtente).toHaveBeenCalledTimes(2);
  });

  it("una domanda alla volta", async () => {
    let rispondi: (v: { error: unknown }) => void = () => {};
    const { controllo, chiediUtente, avanza } = controlloCon(() => new Promise((r) => { rispondi = r; }));
    controllo.aggiornaToken("token-1");
    const prima = controllo.controlla();
    avanza(DISTANZA_MINIMA_CONTROLLI_MS * 2);
    expect(await controllo.controlla()).toBe(false);
    rispondi({ error: null });
    await prima;
    expect(chiediUtente).toHaveBeenCalledTimes(1);
  });
});

describe("useAccessoRevocato nell'app", () => {
  beforeEach(() => {
    auth.getUser = vi.fn();
    avvisi.info = vi.fn();
    auth.ascolta = null;
    intervallo.esegui = null;
  });

  it("chiede a GoTrue col token degli eventi auth e avvisa quando l'accesso è chiuso", async () => {
    renderHook(() => useAccessoRevocato());
    auth.ascolta?.("INITIAL_SESSION", { access_token: "token-della-scheda" });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    intervallo.esegui?.();
    await vi.waitFor(() => expect(avvisi.info).toHaveBeenCalledTimes(1));
    expect(auth.getUser).toHaveBeenCalledWith("token-della-scheda");
    expect(avvisi.info.mock.calls[0][0]).toBe("Sessione chiusa");
  });

  it("dopo l'uscita non chiede più niente", async () => {
    renderHook(() => useAccessoRevocato());
    auth.ascolta?.("INITIAL_SESSION", { access_token: "token-della-scheda" });
    auth.ascolta?.("SIGNED_OUT", null);
    intervallo.esegui?.();
    await Promise.resolve();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("è montato nell'app, accanto al logout dei 45 giorni", () => {
    const app = leggi("src/App.tsx");
    expect(app).toMatch(/function SessionTimeoutGuard\(\) \{\n\s+useSessionTimeout\(\);\n\s+useAccessoRevocato\(\);/);
  });
});

// ── La funzione server ────────────────────────────────────────────────────────

type Riga = { id: string; user_id: string; company_id: string; auth_session_id: string | null };

function clienteFinto(opzioni: {
  aziendaAttore?: string | null;
  riga?: Riga | null;
  rpc?: { data: unknown; error: unknown };
} = {}) {
  const registro = {
    rpc: [] as Array<{ nome: string; args: Record<string, unknown> }>,
    audit: [] as Array<Record<string, unknown>>,
    filtriRiga: [] as Array<[string, unknown]>,
  };
  const client = {
    from(tabella: string) {
      if (tabella === "profiles") {
        const azienda = opzioni.aziendaAttore === undefined ? "azienda-1" : opzioni.aziendaAttore;
        return { select: () => ({ eq: () => ({ single: async () => ({ data: azienda ? { company_id: azienda } : null }) }) }) };
      }
      if (tabella === "user_sessions") {
        const query = {
          select: () => query,
          eq: (colonna: string, valore: unknown) => {
            registro.filtriRiga.push([colonna, valore]);
            return query;
          },
          maybeSingle: async () => ({ data: opzioni.riga ?? null }),
        };
        return query;
      }
      if (tabella === "user_audit_log") {
        return {
          insert: async (riga: Record<string, unknown>): Promise<{ error: unknown }> => {
            registro.audit.push(riga);
            return { error: null };
          },
        };
      }
      throw new Error(`tabella inattesa: ${tabella}`);
    },
    async rpc(nome: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
      registro.rpc.push({ nome, args });
      return opzioni.rpc ?? { data: { accessi_chiusi: 1, righe_chiuse: 2 }, error: null };
    },
  };
  return { client, registro };
}

describe("revoke-user-session chiude l'accesso vero", () => {
  it("«Revoca tutte» chiude tutti gli accessi della persona e segna le righe dell'azienda", async () => {
    const { client, registro } = clienteFinto();
    const appartiene = vi.fn(async () => true);
    const esito = await revocaSessioni(client, "admin-1", { revoke_all_for_user: "persona-1", reason: "Licenziato" }, appartiene);

    expect(appartiene).toHaveBeenCalledWith("persona-1", "azienda-1");
    expect(registro.rpc).toEqual([{
      nome: "chiudi_accessi_utente",
      args: { p_user_id: "persona-1", p_auth_session_id: null, p_company_id: "azienda-1", p_revocata_da: "admin-1", p_motivo: "Licenziato" },
    }]);
    expect(esito).toEqual({ status: 200, corpo: { ok: true, revoked_count: 2, accessi_chiusi: 1, tutti_i_dispositivi: true } });
    expect(registro.audit).toEqual([expect.objectContaining({
      action: "all_sessions_revoked", company_id: "azienda-1", actor_id: "admin-1", target_user_id: "persona-1",
    })]);
  });

  it("una sessione collegata chiude solo il suo accesso: quel dispositivo", async () => {
    const { client, registro } = clienteFinto({
      riga: { id: "riga-1", user_id: "persona-1", company_id: "azienda-1", auth_session_id: ACCESSO },
    });
    const esito = await revocaSessioni(client, "admin-1", { session_id: "riga-1" }, async () => true);

    expect(registro.filtriRiga).toEqual([["id", "riga-1"], ["is_active", true]]);
    expect(registro.rpc[0].args).toMatchObject({ p_user_id: "persona-1", p_auth_session_id: ACCESSO, p_company_id: "azienda-1" });
    expect(esito.corpo).toMatchObject({ ok: true, tutti_i_dispositivi: false });
    expect(registro.audit[0]).toMatchObject({ action: "session_revoked", details: { session_id: "riga-1", auth_session_id: ACCESSO } });
  });

  it("una sessione di prima del 24/09, senza accesso collegato, li chiude tutti e lo dice", async () => {
    const { client, registro } = clienteFinto({
      riga: { id: "riga-vecchia", user_id: "persona-1", company_id: "azienda-1", auth_session_id: null },
    });
    const esito = await revocaSessioni(client, "admin-1", { session_id: "riga-vecchia" }, async () => true);

    expect(registro.rpc[0].args.p_auth_session_id).toBeNull();
    expect(esito.corpo).toMatchObject({ ok: true, tutti_i_dispositivi: true });
  });

  it("la sessione di un'altra azienda non si tocca", async () => {
    const { client, registro } = clienteFinto({
      riga: { id: "riga-2", user_id: "persona-2", company_id: "azienda-2", auth_session_id: ACCESSO },
    });
    const appartiene = vi.fn(async () => true);
    const esito = await revocaSessioni(client, "admin-1", { session_id: "riga-2" }, appartiene);

    expect(esito.status).toBe(404);
    expect(appartiene).not.toHaveBeenCalled();
    expect(registro.rpc).toEqual([]);
    expect(registro.audit).toEqual([]);
  });

  it("chi non fa parte dell'azienda non si butta fuori: l'accesso vale per tutte le sue aziende", async () => {
    const { client, registro } = clienteFinto();
    const esito = await revocaSessioni(client, "admin-1", { revoke_all_for_user: "persona-di-un-altra-azienda" }, async () => false);

    expect(esito.status).toBe(403);
    expect(registro.rpc).toEqual([]);
    expect(registro.audit).toEqual([]);
  });

  it("se la chiusura fallisce l'errore sale, e il registro non dice «revocata»", async () => {
    const { client, registro } = clienteFinto({ rpc: { data: null, error: new Error("lock timeout") } });
    await expect(revocaSessioni(client, "admin-1", { revoke_all_for_user: "persona-1" }, async () => true))
      .rejects.toThrow("lock timeout");
    expect(registro.audit).toEqual([]);
  });

  it("richieste incomplete", async () => {
    expect((await revocaSessioni(clienteFinto().client, "admin-1", {}, async () => true)).status).toBe(400);
    expect((await revocaSessioni(clienteFinto({ aziendaAttore: null }).client, "admin-1", { revoke_all_for_user: "p" }, async () => true)).status).toBe(400);
  });

  it("la funzione pubblicata usa la verifica di appartenenza vera, e registra l'accesso della riga", () => {
    expect(leggi("supabase/functions/revoke-user-session/index.ts"))
      .toContain("(utenteId, aziendaId) => aziendaAccessibile(supabaseAdmin, utenteId, aziendaId)");
    const traccia = leggi("supabase/functions/track-user-session/index.ts");
    expect(traccia).toContain('supabaseAdmin.rpc("registra_sessione_app"');
    expect(traccia).toContain('p_auth_session_id: idAccessoDalToken(req.headers.get("Authorization"))');
    expect(traccia).not.toMatch(/\.from\("user_sessions"\)\s*\.insert/);
  });
});

// ── Il database ───────────────────────────────────────────────────────────────

describe("la migrazione 20280924233000", () => {
  const sql = leggi("supabase/migrations/20280924233000_revoca_sessioni_chiude_accesso_vero.sql");

  it("chiude l'accesso come il logout di GoTrue: uno o tutti, solo della persona", () => {
    expect(sql).toMatch(/DELETE FROM auth\.sessions\s+WHERE user_id = p_user_id\s+AND \(p_auth_session_id IS NULL OR id = p_auth_session_id\);/);
  });

  it("le funzioni che toccano gli accessi non si chiamano dall'app", () => {
    for (const firma of [
      "registra_sessione_app(uuid, uuid, uuid, inet, text, text, text, text)",
      "chiudi_accessi_utente(uuid, uuid, uuid, uuid, text)",
      "chiudi_sessioni_app_senza_accesso()",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${firma}\n  FROM PUBLIC, anon, authenticated;`);
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO (anon|authenticated)/);
  });

  it("un accesso già chiuso non riapre la sua riga, anche col token ancora valido", () => {
    expect(sql).toContain("WHERE s.id = p_auth_session_id AND s.user_id = p_user_id");
  });

  it("revoca e blocco del super admin passano dalla stessa chiusura", () => {
    expect(sql).toContain("v_esito := public.chiudi_accessi_utente(p_user_id, v_accesso, NULL, v_actor, p_reason);");
    expect(sql).toContain("v_esito := public.chiudi_accessi_utente(p_user_id, NULL, NULL, v_actor, COALESCE(p_reason, 'Account bloccato'));");
  });

  it("le righe le scrive solo il server", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS user_sessions_insert_self ON public.user_sessions;");
    const modifica = sql.split("CREATE POLICY user_sessions_update_admin")[1].split(";")[0];
    expect(modifica).not.toMatch(/user_id =/);
  });

  it("chi è ancora dentro non risulta fuori: una riga resta finché c'è un accesso che nessuna riga rappresenta", () => {
    expect(sql).toMatch(/NOT EXISTS \(\s+SELECT 1 FROM auth\.sessions s\s+WHERE s\.user_id = us\.user_id\s+AND NOT EXISTS/);
  });

  it("ha i freni di una migrazione che scrive righe", () => {
    expect(sql).toContain("SET LOCAL lock_timeout = '3s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '60s';");
  });
});
