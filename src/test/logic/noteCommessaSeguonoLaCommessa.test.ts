/**
 * Note della commessa: le legge e le scrive chi vede la commessa (26/09/2026).
 *
 * Le «Note della commessa» sono un canale della Chat Team con order_id. Ogni
 * interno, venditori compresi, leggeva canali, membri e messaggi di tutte le
 * commesse, ci scriveva, si aggiungeva ai canali e poteva creare il canale di
 * una commessa che non vede.
 *
 * Provato in una transazione annullata: un venditore senza Commesse vedeva 6
 * canali, 9 membri e il messaggio delle note, e si aggiungeva, scriveva e
 * creava canali; dopo 0, 0, 0 e 42501. L'admin come prima; spostare un
 * canale su una commessa dopo dà 42501.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const codice = readFileSync(join(ROOT, "supabase/migrations/20280926093000_note_commessa_seguono_la_commessa.sql"), "utf8")
  .replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  expect(codice).toContain(`drop policy if exists ${nome} on public.${tabella};`);
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+) to (\\w+)([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], ruolo: m![2], testo: m![3] };
};

const COMMESSA_DEL_CANALE =
  "exists (select 1 from public.internal_chat_channels ch join public.orders o on o.id = ch.order_id\n";

describe("migrazione note_commessa_seguono_la_commessa", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("i canali delle commesse li vede chi vede la commessa", () => {
    const p = policy("internal_chat_channels", "icc_sel_order");
    expect([p.comando, p.ruolo]).toEqual(["select", "authenticated"]);
    expect(p.testo).toContain("exists (select 1 from public.orders o where o.id = internal_chat_channels.order_id)");
    expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
  });

  it("il canale di una commessa lo crea solo chi la vede", () => {
    const p = policy("internal_chat_channels", "icc_ins");
    expect([p.comando, p.ruolo]).toEqual(["insert", "authenticated"]);
    expect(p.testo).toContain("created_by = (select auth.uid())");
    expect(p.testo).toMatch(/order_id is null\s+or \(not \(select public\.utente_e_cliente_esterno\(\)\)\s+and exists \(select 1 from public\.orders o where o\.id = internal_chat_channels\.order_id\)\)/);
  });

  it("membri e messaggi dei canali delle commesse: si leggono e si scrivono se si vede la commessa", () => {
    for (const [tabella, nome, comando] of [
      ["internal_chat_members", "icm_sel_order", "select"],
      ["internal_chat_members", "icm_ins_order", "insert"],
      ["internal_chat_messages", "icmsg_sel_order", "select"],
      ["internal_chat_messages", "icmsg_ins_order", "insert"],
    ] as const) {
      const p = policy(tabella, nome);
      expect([p.comando, p.ruolo], nome).toEqual([comando, "authenticated"]);
      expect(p.testo, nome).toContain(COMMESSA_DEL_CANALE);
      expect(p.testo, nome).toContain(`where ch.id = ${tabella}.channel_id`);
      expect(p.testo, nome).toContain("not (select public.utente_e_cliente_esterno())");
      expect(p.testo, nome).not.toContain("internal_chat_is_order_channel");
    }
    expect(policy("internal_chat_messages", "icmsg_ins_order").testo).toContain("sender_id = (select auth.uid())");
  });

  it("la commessa di un canale non si cambia, se non dallo staff di piattaforma", () => {
    expect(codice).toContain("if new.order_id is distinct from old.order_id and not public.is_platform_staff() then");
    expect(codice).toContain("using errcode = '42501'");
    expect(codice).toContain("revoke all on function public.internal_chat_commessa_non_si_cambia() from public, anon, authenticated;");
    expect(codice).toMatch(/create trigger trg_internal_chat_commessa_non_si_cambia\s+before update of order_id on public\.internal_chat_channels\s+for each row execute function public\.internal_chat_commessa_non_si_cambia\(\);/);
  });
});

describe("il resto dell'app dice la stessa cosa", () => {
  const sorgenti = (dir: string): string[] =>
    readdirSync(dir).flatMap((nome) => {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) return nome === "test" || p.includes(join("integrations", "supabase")) ? [] : sorgenti(p);
      return /\.(ts|tsx)$/.test(nome) ? [p] : [];
    });

  it("le note nascono col canale della commessa, dalla commessa aperta", () => {
    const hook = readFileSync(join(ROOT, "src/hooks/useOrderNotesChannel.ts"), "utf8");
    expect(hook).toMatch(/\.from\("internal_chat_channels"\)\s*\.insert\(\{[\s\S]*?type: "order",[\s\S]*?order_id: orderId,/);
  });

  it("nessuna pagina sposta un canale su un'altra commessa", () => {
    const spostamenti = sorgenti(join(ROOT, "src")).filter((p) =>
      /from\(["']internal_chat_channels["']\)\s*\.update\(\{[^}]*order_id/.test(readFileSync(p, "utf8")));
    expect(spostamenti).toEqual([]);
  });
});
