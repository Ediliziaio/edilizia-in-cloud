/**
 * Silvio sa dove sono mezzi e attrezzi (05/10/2026): due strumenti in sola
 * lettura, l'area «mezzi» da caricare e il permesso della pagina Mezzi e
 * attrezzature (can_view_mezzi). Le risposte vere le danno le RPC
 * silvio_tool_dove_sono_mezzi e silvio_tool_mezzi_del_cantiere, provate sul
 * database; qui si controlla che Silvio le abbia, a chi e quando.
 */
import { describe, expect, it, vi } from "vitest";

import {
  AREE_CARICABILI,
  DOMAIN_STAFF_PERMISSION,
  SILVIO_TOOLS,
  domainsForClassification,
  dominiPerAree,
  getToolsForChannel,
  type SilvioTool,
  type ToolContext,
} from "../../../supabase/functions/_shared/silvioTools";
import { AREE_AGENTE } from "../../../supabase/functions/_shared/agenteOperativoConfig";
import { isMezziQuestion } from "../../../supabase/functions/_shared/domandeSuiMezzi";

const STRUMENTI = ["dove_sono_mezzi_attrezzi", "mezzi_del_cantiere"];
const nomi = (tools: SilvioTool[]) => tools.map((t) => String(t.schema?.function?.name));

function contesto(rpc: ReturnType<typeof vi.fn>): ToolContext {
  return {
    supabase: { rpc } as unknown as ToolContext["supabase"],
    companyId: "azienda-1",
    userId: "utente-1",
    primaryRole: "company_admin",
  };
}

describe("strumenti dei mezzi", () => {
  it("esistono, leggono soltanto e stanno nell'area con il permesso dei mezzi", () => {
    for (const nome of STRUMENTI) {
      const t = SILVIO_TOOLS[nome];
      expect(t, nome).toBeDefined();
      expect(t.domain).toBe("mezzi");
      expect(t.riskLevel ?? "safe").toBe("safe");
      expect(t.allowedRoles).toContain("company_staff");
    }
    expect(DOMAIN_STAFF_PERMISSION.mezzi).toBe("can_view_mezzi");
  });

  it("passano l'azienda e chi chiede, e ripuliscono quello che manda il modello", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    await SILVIO_TOOLS.dove_sono_mezzi_attrezzi.executor({ cerca: "  demolitore ", limite: 500 }, contesto(rpc));
    expect(rpc).toHaveBeenCalledWith("silvio_tool_dove_sono_mezzi", {
      p_company_id: "azienda-1",
      p_user_id: "utente-1",
      p_cerca: "demolitore",
      p_persona: null,
      p_classe: null,
      p_filtro: null,
      p_limite: 40,
    });

    rpc.mockClear();
    await SILVIO_TOOLS.mezzi_del_cantiere.executor({ cantiere: "ORD-2026-001 " }, contesto(rpc));
    expect(rpc).toHaveBeenCalledWith("silvio_tool_mezzi_del_cantiere", {
      p_company_id: "azienda-1",
      p_cantiere: "ORD-2026-001",
    });
  });

  it("lo staff a cui la pagina Mezzi è spenta non li vede; con il permesso sì", () => {
    const base = { channel: "internal_chat" as const, role: "company_staff", personaKey: "silvio" };
    expect(nomi(getToolsForChannel({ ...base, staffPermissions: { can_view_mezzi: false } }))).not.toContain(STRUMENTI[0]);
    expect(nomi(getToolsForChannel({ ...base, staffPermissions: { can_view_mezzi: true } }))).toEqual(
      expect.arrayContaining(STRUMENTI),
    );
    // il permesso delle commesse non c'entra
    expect(nomi(getToolsForChannel({ ...base, staffPermissions: { can_view_mezzi: true, can_view_orders: false } }))).toEqual(
      expect.arrayContaining(STRUMENTI),
    );
  });

  it("si caricano con l'area «mezzi» e arrivano già a bordo con le domande di cantiere", () => {
    expect(dominiPerAree(["mezzi"])).toEqual(["mezzi"]);
    expect(domainsForClassification({ primaryArea: "operations" })).toContain("mezzi");
    const caricaStrumenti = SILVIO_TOOLS.carica_strumenti.schema.function.parameters.properties.aree.items.enum;
    expect([...caricaStrumenti].sort()).toEqual(Object.keys(AREE_CARICABILI).sort());
  });

  it("le aree della scheda dell'agente operativo sono quelle che Silvio sa caricare", () => {
    expect([...AREE_AGENTE].sort()).toEqual(Object.keys(AREE_CARICABILI).sort());
  });
});

describe("le domande sul parco vanno ai cantieri", () => {
  it.each([
    "dov'è il demolitore?",
    "Dov’è finito il generatore?",
    "chi ha il furgone bianco",
    "cosa ha in carico Mario come attrezzi",
    "quanti mq di ponteggio sono liberi?",
    "il miniescavatore è ancora in officina?",
    "non trovo più la livella laser",
    "di chi è la targa GF482KD, dove sta?",
  ])("«%s»", (domanda) => {
    expect(isMezziQuestion(domanda)).toBe(true);
  });

  it.each([
    "abbiamo incassato mezzo milione questo mese?",
    "in mezzo alla settimana ho una riunione",
    "quanto costa il furgone in leasing al mese",
    "dove siamo con le fatture di settembre?",
  ])("«%s» no", (domanda) => {
    expect(isMezziQuestion(domanda)).toBe(false);
  });
});
