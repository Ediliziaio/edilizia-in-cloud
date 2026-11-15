import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { protectedPhaseSelect, protectedPhaseUrl } from "@/lib/orders/protectedPhaseRequests";
import { protectedOrderUrl } from "@/lib/orders/protectedOrderRequests";

const base = "https://example.supabase.co/rest/v1/";

describe("Fasi e voci: importi solo dalle viste", () => {
  it("le letture vanno alle viste, le scritture restano sulle tabelle", () => {
    for (const t of ["order_work_phases", "order_work_phase_voci"]) {
      for (const m of ["GET", "HEAD", "get"]) expect(new URL(protectedPhaseUrl(`${base}${t}?select=*&order_id=eq.1`, m)).pathname).toBe(`/rest/v1/${t}_visibili`);
      for (const m of ["POST", "PATCH", "DELETE"]) expect(new URL(protectedPhaseUrl(`${base}${t}?id=eq.1`, m)).pathname).toBe(`/rest/v1/${t}`);
    }
    const u = new URL(protectedPhaseUrl(`${base}order_work_phases?select=id,importo_venduto&order_id=eq.abc`));
    expect(u.searchParams.get("order_id")).toBe("eq.abc");
    expect(u.searchParams.get("select")).toBe("id,importo_venduto");
  });

  it("riscrive gli embed con alias e hint, anche nel RETURNING di una scrittura", () => {
    expect(protectedPhaseSelect("id,phase:order_work_phases!order_items_phase_id_fkey(name),order_work_phase_voci(importo)"))
      .toBe("id,phase:order_work_phases_visibili!order_items_phase_id_fkey(name),order_work_phase_voci:order_work_phase_voci_visibili(importo)");
    const scrittura = new URL(protectedPhaseUrl(`${base}order_items?select=id,fase:order_work_phases(*)`, "PATCH"));
    expect(scrittura.pathname).toBe("/rest/v1/order_items");
    expect(scrittura.searchParams.get("select")).toBe("id,fase:order_work_phases_visibili(*)");
  });

  it("è idempotente, lascia stare RPC e sottofasi e si combina con le commesse", () => {
    const una = protectedPhaseUrl(`${base}order_work_phases?select=*`);
    expect(protectedPhaseUrl(una)).toBe(una);
    expect(protectedPhaseUrl(`${base}rpc/order_work_phases`)).toBe(`${base}rpc/order_work_phases`);
    expect(protectedPhaseSelect("id,sottofasi:order_work_subphases(id)")).toBe("id,sottofasi:order_work_subphases(id)");
    const calendario = new URL(protectedPhaseUrl(protectedOrderUrl(`${base}orders?select=id,order_work_phases!order_work_phases_order_id_fkey(id,name)`)));
    expect(calendario.pathname).toBe("/rest/v1/orders_visibili");
    expect(calendario.searchParams.get("select")).toBe("id,order_work_phases:order_work_phases_visibili!order_work_phases_order_id_fkey(id,name)");
  });
});

// Le scritture vanno alle tabelle grezze, dove le colonne degli importi non si
// leggono: un RETURNING che le chiede (select() vuoto, "*" o la colonna) fallisce
// per tutti, amministratori compresi.
describe("scritture su fasi e voci: il RETURNING non chiede gli importi", () => {
  const file: string[] = [];
  const giro = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== "test" && n !== "node_modules") giro(p); }
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) file.push(p);
    }
  };
  giro(join(process.cwd(), "src"));

  it("nessuna insert/update/upsert su fasi o voci restituisce colonne protette", () => {
    const errati: string[] = [];
    for (const f of file) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/from\(\s*["'](order_work_phases|order_work_phase_voci)["']\s*\)\s*\.(insert|update|upsert)\(/g)) {
        const resto = s.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
        const fine = resto.search(/;\s*\n/);
        const catena = fine >= 0 ? resto.slice(0, fine) : resto;
        for (const sel of catena.matchAll(/\.select\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
          const cols = sel[1];
          if (cols === undefined || cols.includes("*") || /importo|costo_manodopera|costo_materiali/.test(cols)) errati.push(`${f}: ${sel[0]}`);
        }
      }
    }
    expect(errati).toEqual([]);
  });
});
