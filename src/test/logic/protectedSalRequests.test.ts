/**
 * SAL: gli importi solo dalle viste (15/11/2026). Il browser legge verbali, voci e sottofasi da
 * `*_visibili`; le scritture restano sulle tabelle grezze, dove le colonne degli importi sono chiuse
 * (20290402130100): un RETURNING che le chiede fallirebbe per tutti, amministratori compresi.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { protectedSalSelect, protectedSalUrl } from "@/lib/orders/protectedSalRequests";
import { protectedPhaseUrl } from "@/lib/orders/protectedPhaseRequests";

const base = "https://example.supabase.co/rest/v1/";

describe("SAL: importi solo dalle viste", () => {
  it("le letture vanno alle viste, le scritture restano sulle tabelle", () => {
    for (const t of ["sal_records", "sal_voci", "sal_voci_sottofasi"]) {
      for (const m of ["GET", "HEAD", "get"]) expect(new URL(protectedSalUrl(`${base}${t}?select=*&order_id=eq.1`, m)).pathname).toBe(`/rest/v1/${t}_visibili`);
      for (const m of ["POST", "PATCH", "DELETE"]) expect(new URL(protectedSalUrl(`${base}${t}?id=eq.1`, m)).pathname).toBe(`/rest/v1/${t}`);
    }
    // Il certificato non ha una vista: lo legge solo chi ha il diritto.
    expect(new URL(protectedSalUrl(`${base}sal_certificati?select=*`)).pathname).toBe("/rest/v1/sal_certificati");
  });

  it("riscrive gli embed annidati, senza confondere voci e sottofasi", () => {
    // postgrest-js toglie gli spazi dal select prima di spedirlo: le richieste vere sono così.
    expect(protectedSalSelect("*,sal_voci(id,importo_sal,sal_voci_sottofasi(id,importo_sal)),sal_certificati(*)"))
      .toBe("*,sal_voci:sal_voci_visibili(id,importo_sal,sal_voci_sottofasi:sal_voci_sottofasi_visibili(id,importo_sal)),sal_certificati(*)");
    expect(protectedSalSelect("id,lp_sal_voci(id)")).toBe("id,lp_sal_voci(id)");
    expect(protectedSalSelect("id,sal:sal_records!fk(numero_sal)")).toBe("id,sal:sal_records_visibili!fk(numero_sal)");
  });

  it("è idempotente, lascia stare le RPC e si combina con fasi e voci", () => {
    const una = protectedSalUrl(`${base}sal_records?select=*,sal_voci(*)`);
    expect(protectedSalUrl(una)).toBe(una);
    expect(protectedSalUrl(`${base}rpc/sal_ritenuta_nel_registro`)).toBe(`${base}rpc/sal_ritenuta_nel_registro`);
    const insieme = new URL(protectedSalUrl(protectedPhaseUrl(`${base}sal_records?select=id,sal_voci(fase:order_work_phases(name))`)));
    expect(insieme.pathname).toBe("/rest/v1/sal_records_visibili");
    expect(insieme.searchParams.get("select")).toBe("id,sal_voci:sal_voci_visibili(fase:order_work_phases_visibili(name))");
  });
});

describe("scritture sui SAL: il RETURNING non chiede gli importi", () => {
  const file: string[] = [];
  const giro = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== "test" && n !== "node_modules") giro(p); }
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) file.push(p);
    }
  };
  giro(join(process.cwd(), "src"));

  it("nessuna insert/update/upsert/delete su verbali, voci o sottofasi restituisce colonne protette", () => {
    const errati: string[] = [];
    for (const f of file) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/from\(\s*["'](sal_records|sal_voci|sal_voci_sottofasi)["']\s*\)\s*\.(insert|update|upsert|delete)\(/g)) {
        const resto = s.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
        const fine = resto.search(/;\s*\n/);
        const catena = fine >= 0 ? resto.slice(0, fine) : resto;
        for (const sel of catena.matchAll(/\.select\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
          const cols = sel[1];
          if (cols === undefined || cols.includes("*") || /importo/.test(cols)) errati.push(`${f}: ${sel[0]}`);
        }
      }
    }
    expect(errati).toEqual([]);
  });
});
