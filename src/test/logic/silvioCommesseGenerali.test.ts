/**
 * Silvio e il connettore AI sanno rispondere sulle commesse generali (tappa 7):
 * tre strumenti in sola lettura. Le risposte vere le danno le RPC
 * silvio_tool_commesse_generali / _commessa_generale / _scadenze_generali,
 * provate sul database; qui si controlla che gli strumenti ci siano, che
 * passino chi chiede (i permessi sono i suoi) e che lo staff senza commesse
 * non li veda.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SILVIO_TOOLS,
  getToolsForChannel,
  type SilvioTool,
  type ToolContext,
} from "../../../supabase/functions/_shared/silvioTools";

const STRUMENTI = ["commesse_generali", "commessa_generale", "scadenze_generali"];
const nomi = (tools: SilvioTool[]) => tools.map((t) => String(t.schema?.function?.name));

function contesto(rpc: ReturnType<typeof vi.fn>): ToolContext {
  return {
    supabase: { rpc } as unknown as ToolContext["supabase"],
    companyId: "azienda-1",
    userId: "utente-1",
    primaryRole: "company_admin",
  };
}

describe("strumenti delle commesse generali", () => {
  it("esistono, leggono soltanto e stanno nell'area delle commesse", () => {
    for (const nome of STRUMENTI) {
      const t = SILVIO_TOOLS[nome];
      expect(t, nome).toBeDefined();
      expect(t.domain).toBe("cantiere");
      expect(t.riskLevel ?? "safe").toBe("safe");
      expect(t.allowedRoles).toContain("company_staff");
    }
  });

  it("passano l'azienda e chi chiede, e ripuliscono quello che manda il modello", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    await SILVIO_TOOLS.commesse_generali.executor({ cerca: "  scuole " }, contesto(rpc));
    expect(rpc).toHaveBeenCalledWith("silvio_tool_commesse_generali", {
      p_company_id: "azienda-1", p_user_id: "utente-1", p_cerca: "scuole", p_anche_chiuse: false,
    });

    rpc.mockClear();
    await SILVIO_TOOLS.commessa_generale.executor({ cerca: "Via Roma" }, contesto(rpc));
    expect(rpc).toHaveBeenCalledWith("silvio_tool_commessa_generale", {
      p_company_id: "azienda-1", p_user_id: "utente-1", p_cerca: "Via Roma",
    });

    rpc.mockClear();
    await SILVIO_TOOLS.scadenze_generali.executor({ giorni: 5000 }, contesto(rpc));
    expect(rpc).toHaveBeenCalledWith("silvio_tool_scadenze_generali", {
      p_company_id: "azienda-1", p_user_id: "utente-1", p_giorni: 730,
    });
    rpc.mockClear();
    await SILVIO_TOOLS.scadenze_generali.executor({}, contesto(rpc));
    expect(rpc.mock.calls[0][1].p_giorni).toBe(60);
  });

  it("lo staff a cui le commesse sono spente non li vede; con il permesso sì", () => {
    const base = { channel: "internal_chat" as const, role: "company_staff", personaKey: "silvio" };
    const senza = nomi(getToolsForChannel({ ...base, staffPermissions: { can_view_orders: false } }));
    for (const nome of STRUMENTI) expect(senza).not.toContain(nome);
    expect(nomi(getToolsForChannel({ ...base, staffPermissions: { can_view_orders: true } }))).toEqual(
      expect.arrayContaining(STRUMENTI),
    );
  });

  it("il connettore AI li espone in lettura, con l'utente della chiave", () => {
    const sorgente = readFileSync(resolve("supabase/functions/platform-mcp/silvioTools.ts"), "utf8");
    for (const nome of STRUMENTI) {
      const riga = sorgente.split("\n").find((l) => l.includes(`name: "${nome}"`));
      expect(riga, nome).toBeDefined();
      expect(riga).toContain(`rpc: "silvio_tool_${nome}"`);
      expect(riga).toContain('scope: "orders:read"');
      expect(riga).toContain("injectUser: true");
    }
  });
});
