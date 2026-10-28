import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const identifier = (v: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(v)) throw new Error("Invalid SQL identifier in test");
  return `"${v}"`;
};
export class SaltTestDatabase {
  pg = new PGlite();
  failTable = "";
  async setup() {
    await this.pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.companies(id uuid primary key);
      create table public.bank_connections(id uuid primary key default gen_random_uuid(), company_id uuid references companies(id),
        provider_slug text, institution_id text not null, institution_name text, institution_country text,
        status text, accounts_count int, last_sync_at timestamptz, expires_at timestamptz, error_message text, created_by uuid);
      insert into companies values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
      insert into auth.users values('cccccccc-cccc-4ccc-cccc-cccccccccccc');`);
    for (const file of ["20260309081321_5ae18bc0-f750-4779-956d-ab5b92af3063_part6.sql", "20260309081324_5ae18bc0-f750-4779-956d-ab5b92af3063_part9.sql", "20261027124745_saltedge_beta_connector.sql"])
      await this.pg.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  from(table: string) { return new SaltQuery(this, table); }
  async rpc(name: string, args: Record<string, string>) {
    if (name === "saltedge_account_conflict") {
      const r = await this.pg.query<{ value: boolean }>("select saltedge_account_conflict($1,$2,$3) as value", [args.p_company, args.p_connection, args.p_iban]);
      return { data: r.rows[0].value, error: null as null };
    }
    if (name !== "claim_saltedge_lock") throw new Error("Unexpected RPC");
    const r = await this.pg.query<{ token: string | null }>("select claim_saltedge_lock($1) as token", [args.p_key]);
    return { data: r.rows[0].token, error: null as null };
  }
}
class SaltQuery {
  op = "select"; columns = "*"; values: Record<string, unknown>[] = []; filters: Array<[string, string, unknown]> = []; conflict = ""; one = false; max = 0;
  constructor(private db: SaltTestDatabase, private table: string) {}
  select(columns = "*") { this.columns = columns; return this; }
  insert(value: Record<string, unknown>) { this.op = "insert"; this.values = [value]; return this; }
  update(value: Record<string, unknown>) { this.op = "update"; this.values = [value]; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(value: Record<string, unknown> | Record<string, unknown>[], options: { onConflict: string }) {
    this.op = "upsert"; this.values = Array.isArray(value) ? value : [value]; this.conflict = options.onConflict; return this;
  }
  eq(c: string, v: unknown) { this.filters.push([c, "=", v]); return this; }
  neq(c: string, v: unknown) { this.filters.push([c, "<>", v]); return this; }
  gt(c: string, v: unknown) { this.filters.push([c, ">", v]); return this; }
  in(c: string, v: unknown[]) { this.filters.push([c, "IN", v]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  async run() {
    if (this.db.failTable === this.table && this.op !== "select") return { data: null as null, error: { message: "Simulated database failure" } };
    const params: unknown[] = [];
    const param = (v: unknown) => { params.push(v && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v); return `$${params.length}`; };
    const columns = this.columns === "*" ? "*" : this.columns.split(",").map(identifier).join(",");
    const where = () => this.filters.length ? " where " + this.filters.map(([c, op, v]) => op === "IN" ? `${identifier(c)} = any(${param(v)}::text[])` : `${identifier(c)} ${op} ${param(v)}`).join(" and ") : "";
    let sql: string;
    if (this.op === "select") sql = `select ${columns} from ${identifier(this.table)}${where()}${this.max ? ` limit ${this.max}` : ""}`;
    else if (this.op === "delete") sql = `delete from ${identifier(this.table)}${where()} returning ${columns}`;
    else if (this.op === "update") sql = `update ${identifier(this.table)} set ${Object.entries(this.values[0]).map(([k, v]) => `${identifier(k)}=${param(v)}`).join(",")}${where()} returning ${columns}`;
    else {
      if (!this.values.length) return { data: [] as unknown[], error: null as null };
      const keys = Object.keys(this.values[0]);
      sql = `insert into ${identifier(this.table)}(${keys.map(identifier).join(",")}) values ${this.values.map(v => `(${keys.map(k => param(v[k])).join(",")})`).join(",")}`;
      if (this.op === "upsert") sql += ` on conflict (${this.conflict.split(",").map(identifier).join(",")}) do update set ${keys.map(k => `${identifier(k)}=excluded.${identifier(k)}`).join(",")}`;
      sql += ` returning ${columns}`;
    }
    try { const r = await this.db.pg.query(sql, params); return { data: this.one ? r.rows[0] ?? null : r.rows, error: null as null }; }
    catch (error) { return { data: null as null, error }; }
  }
  then<T>(resolve: (v: Awaited<ReturnType<SaltQuery["run"]>>) => T) { return this.run().then(resolve); }
}
