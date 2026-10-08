/**
 * Freno agli invii delle automazioni: nessun flusso può mandare una raffica che blocca il database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canaleDelFreno, LIMITE_AL_MINUTO, riprovaDopoFreno } from "../../../supabase/functions/_shared/frenoInvii";

describe("canaleDelFreno", () => {
  it("riconosce gli invii con l'id del motore e con quello italiano", () => {
    expect(canaleDelFreno("send_whatsapp")).toBe("whatsapp");
    expect(canaleDelFreno("invia_whatsapp")).toBe("whatsapp");
    expect(canaleDelFreno("invia_whatsapp_locale")).toBe("whatsapp");
    expect(canaleDelFreno("invia_email")).toBe("email");
    expect(canaleDelFreno("send_sms")).toBe("sms");
  });
  it("le altre azioni non sono frenate", () => {
    expect(canaleDelFreno("aggiungi_tag")).toBeNull();
    expect(canaleDelFreno("crea_opportunita")).toBeNull();
    expect(canaleDelFreno(undefined)).toBeNull();
  });
});

describe("tetto e ripresa", () => {
  it("il tetto WhatsApp è basso: 700 messaggi non partono in mezz'ora", () => {
    expect(LIMITE_AL_MINUTO.whatsapp * 30).toBeLessThan(700);
  });
  it("si riprova dopo il minuto in corso, con un margine fino a un minuto", () => {
    const adesso = Date.UTC(2026, 9, 8, 9, 0, 0);
    expect(riprovaDopoFreno(adesso, 0).getTime() - adesso).toBe(60_000);
    expect(riprovaDopoFreno(adesso, 1).getTime() - adesso).toBe(120_000);
    expect(riprovaDopoFreno(adesso, 0.5).getTime() - adesso).toBe(90_000);
  });
});

describe("il motore usa il freno", () => {
  const motore = readFileSync(join(process.cwd(), "supabase/functions/process-automation/index.ts"), "utf8");
  it("prenota il posto prima di eseguire un invio e, se non c'è, rimanda senza contare il rinvio", () => {
    const freno = motore.indexOf('supabase.rpc("freno_invii_prenota"');
    const esecuzione = motore.indexOf("const result: any = await executeNode(supabase, node, item);");
    expect(freno).toBeGreaterThan(0);
    expect(freno).toBeLessThan(esecuzione);
    const blocco = motore.slice(freno, esecuzione);
    expect(blocco).toContain("riprovaDopoFreno(Date.now())");
    expect(blocco).not.toContain("_defer_count");
  });
  it("la funzione del database è chiusa: solo il motore la chiama", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20281008180000_freno_invii_automazioni.sql"), "utf8");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.freno_invii_prenota(uuid, text, integer) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("WHERE f.inviati < p_limite");
  });
});
