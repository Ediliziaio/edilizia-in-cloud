/**
 * Numeri WhatsApp: token e PIN fuori dal browser (25/09/2026).
 *
 * ai_whatsapp_numbers tiene il token di Meta (cifrato) e teneva in chiaro il PIN
 * della verifica in due passaggi. Il database non dà più queste due colonne al
 * ruolo authenticated: una lettura dal browser che le chiede, o che chiede «*»,
 * fallisce con «permission denied». Il PIN sta nel Vault. I numeri li crea solo
 * whatsapp-connect, col service role; modificarli e toglierli spetta a chi
 * amministra l'azienda (migrazione 20280925011000, provata sul database vero con
 * utenti di Green Energy in una transazione annullata).
 *
 * Si prova che nessuna lettura della tabella nel codice del browser:
 *   · chiede «*» o una select vuota (che vale «*»);
 *   · nomina access_token_encrypted o cloud_api_pin;
 *   · crea righe (insert, upsert);
 *   · chiede una colonna che il database non le concede (la pagina si romperebbe).
 * E che la migrazione:
 *   · ridà al browser solo le colonne non segrete, e in scrittura solo quelle che
 *     l'app cambia (mai identificativi Meta, token, PIN, azienda, webhook);
 *   · lascia modifica e cancellazione a chi amministra, la lettura a chi lavora
 *     nell'azienda e mai al cliente esterno;
 *   · porta il PIN nel Vault, lo fa leggere solo al service role e lo toglie col
 *     numero;
 *   · si ferma se il browser legge ancora token o PIN.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { WA_NUMBER_COLUMNS } from "@/hooks/whatsapp/useWhatsAppNumbers";

const RADICE = resolve(__dirname, "../../..");
const SEGRETE = ["access_token_encrypted", "cloud_api_pin"];

function fileTs(cartella: string): string[] {
  const risultato: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === "node_modules" || voce === "test") continue;
      risultato.push(...fileTs(percorso));
    } else if (/\.(ts|tsx)$/.test(voce) && !voce.endsWith(".d.ts")) {
      risultato.push(percorso);
    }
  }
  return risultato;
}

// Ogni query che parte da .from("ai_whatsapp_numbers"): fino al punto e virgola,
// o fino alla query successiva (due query nello stesso Promise.all).
function queryDellaTabella(sorgente: string): string[] {
  const query: string[] = [];
  const INIZIO = 'from("ai_whatsapp_numbers")';
  let i = sorgente.indexOf(INIZIO);
  while (i >= 0) {
    const prossima = sorgente.indexOf(".from(", i + 1);
    const puntoEVirgola = sorgente.indexOf(";", i);
    const fine = Math.min(...[prossima, puntoEVirgola, sorgente.length].filter((n) => n >= 0));
    query.push(sorgente.slice(i, fine));
    i = sorgente.indexOf(INIZIO, i + 1);
  }
  return query;
}

const queryDelBrowser = fileTs(join(RADICE, "src"))
  .filter((file) => !file.endsWith("integrations/supabase/types.ts"))
  .flatMap((file) =>
    queryDellaTabella(readFileSync(file, "utf8")).map((testo) => ({ file: file.replace(RADICE + "/", ""), testo })),
  );

const elenco = (testo: string) =>
  testo
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

describe("il browser e ai_whatsapp_numbers", () => {
  it("le query ci sono (il controllo guarda davvero qualcosa)", () => {
    expect(queryDelBrowser.length).toBeGreaterThanOrEqual(6);
  });

  it("nessuna chiede «*» o una select vuota", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => /\.select\(\s*(["'`]\s*\*\s*["'`])?\s*\)/.test(testo));
    expect(trovate.map((q) => q.file)).toEqual([]);
  });

  it("nessuna nomina il token o il PIN", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => SEGRETE.some((colonna) => testo.includes(colonna)));
    expect(trovate.map((q) => q.file)).toEqual([]);
    for (const colonna of SEGRETE) expect(WA_NUMBER_COLUMNS).not.toContain(colonna);
  });

  it("nessuna crea numeri: li crea whatsapp-connect, dopo le verifiche su Meta", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => /\.(insert|upsert)\(/.test(testo));
    expect(trovate.map((q) => q.file)).toEqual([]);
  });
});

describe("la migrazione", () => {
  const sql = (() => {
    const cartella = join(RADICE, "supabase/migrations");
    const nome = readdirSync(cartella).find((f) => f.endsWith("_whatsapp_numeri_segreti_e_permessi.sql"));
    return nome ? readFileSync(join(cartella, nome), "utf8") : "";
  })();
  // Le istruzioni, senza i commenti (che raccontano anche com'era prima).
  const codice = sql.replace(/--.*$/gm, "");
  const spazi = (testo: string) => testo.replace(/\s+/g, " ").trim();

  const concesse = (privilegio: "select" | "update") => {
    const m = codice.match(new RegExp(`grant ${privilegio} \\(([^)]*)\\) on public\\.ai_whatsapp_numbers to authenticated;`));
    return m ? elenco(m[1]) : [];
  };
  const policy = (nome: string) => {
    const inizio = codice.indexOf(`create policy ${nome} on public.ai_whatsapp_numbers`);
    return inizio >= 0 ? spazi(codice.slice(inizio, codice.indexOf(";", inizio))) : "";
  };

  it("c'è e non aspetta i lock all'infinito", () => {
    expect(sql).not.toBe("");
    expect(codice).toContain("set local lock_timeout = '3s';");
  });

  it("toglie tutto al browser e ridà in lettura solo le colonne non segrete", () => {
    expect(codice).toContain("revoke all on table public.ai_whatsapp_numbers from public, anon, authenticated;");
    const lettura = concesse("select");
    expect(lettura.length).toBe(24);
    for (const colonna of SEGRETE) expect(lettura).not.toContain(colonna);
  });

  it("ogni colonna che il browser chiede gli è concessa, o la pagina si romperebbe", () => {
    const lettura = new Set(concesse("select"));
    const chieste = [
      ...elenco(WA_NUMBER_COLUMNS),
      ...queryDelBrowser.flatMap(({ testo }) => {
        const letterale = testo.match(/\.select\(\s*"([^"]*)"\s*\)/);
        return letterale ? elenco(letterale[1]) : [];
      }),
      ...queryDelBrowser.flatMap(({ testo }) => [...testo.matchAll(/\.(?:eq|is|neq|in|order)\(\s*"([a-z_]+)"/g)].map((m) => m[1])),
    ];
    expect(chieste.length).toBeGreaterThan(20);
    expect([...new Set(chieste)].filter((colonna) => !lettura.has(colonna))).toEqual([]);
  });

  it("in scrittura solo le impostazioni che l'app cambia, mai identificativi, token, PIN o azienda", () => {
    const scrittura = concesse("update");
    expect([...scrittura].sort()).toEqual(
      [
        "agent_id", "daily_budget_eur", "deleted_at", "display_name", "messaggio_benvenuto",
        "messaggio_fuori_orario", "operational_settings", "orario_attivo", "stato",
      ].sort(),
    );

    // I campi che l'app manda (WANumberUpdate e la rimozione) sono tutti concessi.
    const hook = readFileSync(join(RADICE, "src/hooks/whatsapp/useWhatsAppNumbers.ts"), "utf8");
    const interfaccia = hook.match(/export interface WANumberUpdate \{([^}]*)\}/)?.[1] ?? "";
    const campi = [...interfaccia.matchAll(/^\s*([a-z_]+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "id");
    expect(campi.length).toBeGreaterThanOrEqual(7);
    for (const campo of [...campi, "deleted_at", "stato"]) expect(scrittura).toContain(campo);

    expect(codice).toContain("grant delete on public.ai_whatsapp_numbers to authenticated;");
    expect(codice).not.toMatch(/grant (all|insert)[^;]*on public\.ai_whatsapp_numbers[^;]*to authenticated/);
  });

  it("modifica e cancellazione a chi amministra; lettura a chi lavora nell'azienda, mai al cliente esterno", () => {
    expect(codice).toContain("drop policy if exists wa_company_isolation on public.ai_whatsapp_numbers;");
    expect(policy("wa_numeri_lettura_azienda")).toBe(
      "create policy wa_numeri_lettura_azienda on public.ai_whatsapp_numbers as permissive for select to authenticated" +
        " using ( company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()) )",
    );
    expect(policy("wa_numeri_modifica_amministratori")).toBe(
      "create policy wa_numeri_modifica_amministratori on public.ai_whatsapp_numbers as permissive for update to authenticated" +
        " using (public.puo_gestire_whatsapp(company_id)) with check (public.puo_gestire_whatsapp(company_id))",
    );
    expect(policy("wa_numeri_cancellazione_amministratori")).toBe(
      "create policy wa_numeri_cancellazione_amministratori on public.ai_whatsapp_numbers as permissive for delete to authenticated" +
        " using (public.puo_gestire_whatsapp(company_id))",
    );
    // Nessuna policy di inserimento, e la RESTRICTIVE sull'utente bloccato resta com'è.
    expect(codice.match(/create policy/g) ?? []).toHaveLength(3);
    expect(codice).not.toMatch(/blocco_utente_bloccato|as restrictive/);
  });

  it("chi amministra: la regola di assertMetaCompanyAdminAccess, accesso multi-azienda solo attivo e non scaduto", () => {
    const funzione = spazi(codice.slice(codice.indexOf("create or replace function public.puo_gestire_whatsapp(")).split("$$;")[0]);
    expect(funzione).toContain("security definer set search_path to ''");
    expect(funzione).toContain("select coalesce(");
    expect(funzione).toContain("not public.utente_bloccato()");
    expect(funzione).toContain("public.has_role((select auth.uid()), 'super_admin'::public.app_role)");
    expect(funzione).toContain(
      "public.has_role((select auth.uid()), 'company_admin'::public.app_role) and exists ( select 1 from public.profiles p" +
        " where p.id = (select auth.uid()) and p.company_id = p_company_id )",
    );
    expect(funzione).toContain(
      "and m.status = 'active' and (m.expires_at is null or m.expires_at > now()) and m.access_role = 'company_admin'",
    );
    expect(codice).toContain("revoke all on function public.puo_gestire_whatsapp(uuid) from public, anon;");
  });

  it("il PIN va nel Vault, la colonna resta vuota, lo legge solo il service role e se ne va col numero", () => {
    expect(spazi(codice)).toContain(
      "create trigger whatsapp_pin_nel_vault before insert or update of cloud_api_pin on public.ai_whatsapp_numbers",
    );
    expect(codice).toMatch(/perform vault\.create_secret\(btrim\(new\.cloud_api_pin\), v_nome,/);
    expect(codice).toMatch(/end if;\s+new\.cloud_api_pin := null;\s+return new;/);
    expect(codice).toContain("'ai_whatsapp_numbers.cloud_api_pin.' || new.id");

    expect(spazi(codice)).toContain(
      "create trigger whatsapp_pin_via_dal_vault after delete on public.ai_whatsapp_numbers",
    );
    expect(codice).toContain("delete from vault.secrets where name = 'ai_whatsapp_numbers.cloud_api_pin.' || old.id;");

    expect(codice).toContain("revoke all on function public.pin_numero_whatsapp(uuid) from public, anon, authenticated;");
    expect(codice).toContain("grant execute on function public.pin_numero_whatsapp(uuid) to service_role;");
    expect(codice).toContain("revoke all on function public.whatsapp_pin_nel_vault() from public, anon, authenticated;");
  });

  it("i PIN di oggi passano nel Vault con lo stesso valore, e i messaggi d'errore non li stampano", () => {
    expect(codice).toMatch(/where s\.decrypted_secret = e\.value;/);
    expect(codice).toContain("raise exception 'Resta un PIN WhatsApp in chiaro in ai_whatsapp_numbers';");
    for (const messaggio of codice.match(/raise exception '[^']*'[^;]*;/g) ?? []) {
      expect(messaggio).not.toMatch(/cloud_api_pin|decrypted_secret|e\.value/);
    }
  });

  it("si ferma se il browser legge ancora token o PIN, o se il service role perde privilegi", () => {
    for (const colonna of SEGRETE) {
      expect(codice).toContain(`has_column_privilege('authenticated', 'public.ai_whatsapp_numbers', '${colonna}', 'select')`);
    }
    expect(codice).toContain("raise exception 'ai_whatsapp_numbers: il service role ha perso dei privilegi';");
  });
});
