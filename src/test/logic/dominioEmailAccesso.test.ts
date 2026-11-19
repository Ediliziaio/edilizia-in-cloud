import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type Opzioni = { amministrate?: string[]; permesso?: boolean; solaLettura?: boolean; accesso?: boolean; errorePermessi?: boolean; utente?: boolean };
function prepara(o: Opzioni = {}) {
  const file = ts.createSourceFile("index.ts", readFileSync("supabase/functions/manage-email-domain/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const funzione = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "authorize");
  if (!funzione) throw new Error("Autorizzazione dominio non trovata");
  const verificaAccesso = vi.fn(async () => { if (o.accesso === false) throw new Error("Non autorizzato: accesso negato a questa azienda"); });
  const contesto = vm.createContext({ verifyCompanyAccess: verificaAccesso });
  vm.runInContext(ts.transpileModule(funzione.getText(file) + "\nglobalThis.autorizza = authorize;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, contesto);
  const userClient = {
    auth: { getUser: async () => ({ data: { user: o.utente === false ? null : { id: "utente" } } }) },
    rpc: async () => ({ data: o.amministrate ?? [], error: o.errorePermessi ? new Error("lettura fallita") : null }),
  };
  const admin = {
    rpc: async (nome: string): Promise<{data:boolean;error:Error|null}> => ({ data: nome === "has_role" ? false : o.permesso ?? false, error: null }),
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async (): Promise<{data:{sola_lettura:boolean};error:Error|null}> => ({data:{sola_lettura:o.solaLettura ?? false},error:null}) };
      return q;
    },
  };
  return { verificaAccesso, run: (scrittura = true) => contesto.autorizza(userClient,admin,"seconda-azienda",scrittura) as Promise<unknown> };
}

describe("Autorizzazione dominio email multi-azienda", () => {
  it("riconosce l'amministratore della seconda azienda senza usare il ruolo globale", async () => {
    const f = prepara({ amministrate:["prima-azienda","seconda-azienda"] });
    await expect(f.run()).resolves.toMatchObject({userId:"utente",isSuperAdmin:false});
    expect(f.verificaAccesso).toHaveBeenCalledWith(expect.anything(),"utente","seconda-azienda");
  });
  it("un amministratore di un'altra azienda non ottiene la modifica", async () => {
    await expect(prepara({amministrate:["prima-azienda"]}).run()).rejects.toThrow("Non autorizzato");
  });
  it("un accesso revocato o scaduto resta rifiutato anche se la cache ruoli indica admin", async () => {
    await expect(prepara({amministrate:["seconda-azienda"],accesso:false}).run()).rejects.toThrow("Non autorizzato");
  });
  it("lo staff con permesso email modifica soltanto senza sola lettura", async () => {
    await expect(prepara({permesso:true}).run()).resolves.toBeDefined();
    await expect(prepara({permesso:true,solaLettura:true}).run()).rejects.toThrow("Non autorizzato");
  });
  it("la sola lettura consente di consultare il dominio", async () => {
    await expect(prepara({permesso:true,solaLettura:true}).run(false)).resolves.toBeDefined();
  });
  it("un errore di lettura dei permessi non concede accesso e non diventa una sessione scaduta", async () => {
    await expect(prepara({errorePermessi:true}).run()).rejects.toThrow("Impossibile verificare");
    await expect(prepara({utente:false}).run()).rejects.toThrow("Unauthorized");
  });
});
