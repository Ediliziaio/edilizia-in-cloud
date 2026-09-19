/**
 * Metriche di salute senza le chiamate da pg_net respinte (19/09/2026): le
 * nostre le registra già cron_health_check dal lato di chi chiama, quelle di
 * una copia esterna del progetto erano circa 1.770 «errori» al giorno.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { daMisurare } from "../../../supabase/functions/_shared/chiamateDaMisurare";

const ROOT = join(__dirname, "../../..");

describe("daMisurare", () => {
  it("le chiamate da pg_net respinte non si contano", () => {
    expect(daMisurare("pg_net/0.14.0", 401)).toBe(false);
    expect(daMisurare("pg_net/0.20.0", 403)).toBe(false);
    expect(daMisurare(" PG_NET/0.20.0", 401)).toBe(false);
  });

  it("le altre risposte alle chiamate da pg_net si contano", () => {
    expect(daMisurare("pg_net/0.20.0", 200)).toBe(true);
    expect(daMisurare("pg_net/0.20.0", 404)).toBe(true);
    expect(daMisurare("pg_net/0.20.0", 500)).toBe(true);
  });

  it("i 401 dal browser, da un'altra funzione o senza agente si contano", () => {
    expect(daMisurare("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 401)).toBe(true);
    expect(daMisurare("Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.76.0)", 401)).toBe(true);
    expect(daMisurare(null, 403)).toBe(true);
    expect(daMisurare(undefined, 401)).toBe(true);
  });
});

describe("il wrapper delle metriche usa la regola", () => {
  const wrapper = readFileSync(join(ROOT, "supabase/functions/_shared/withMetrics.ts"), "utf8");

  it("legge l'agente della richiesta e registra solo le chiamate da misurare", () => {
    expect(wrapper).toContain('import { daMisurare } from "./chiamateDaMisurare.ts";');
    expect(wrapper).toContain('const agente = req.headers.get("user-agent");');
    expect(wrapper).toContain("if (daMisurare(agente, statusCode)) {");
  });
});
