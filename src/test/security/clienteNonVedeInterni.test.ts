import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Segnalazione dell'altra traccia, verificata e allargata.
 *
 * Misurato su produzione con un account cliente reale (ruolo customer,
 * azienda 778a2c76…):
 *   giornale_lavori .......... vedeva la riga marcata NON visibile al cliente
 *   tabelle leggibili ........ 175 → 108 (primo giro) → 33 (secondo)
 *   sue commesse ............. 3 prima, 3 dopo
 *   suo profilo .............. 200 profili prima, 1 dopo
 *   staff (company_admin) .... 246 tabelle, conteggi invariati su tutte le
 *                              chiave (documenti_fiscali 41, profiles 200,
 *                              listino_griglia 200, orders 65, …)
 *
 * E il caso positivo, costruito e poi cancellato:
 *   rapportino visibile sulla SUA commessa .......... lo vede
 *   rapportino nascosto sulla sua commessa .......... non lo vede
 *   rapportino visibile di un ALTRO cliente ......... non lo vede
 *   foto del rapportino visibile .................... la vede
 *   foto del rapportino nascosto .................... non la vede
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const quattro = leggi("il_cliente_non_vede_i_cantieri_degli_altri");
const rassegna = leggi("cliente_fuori_dalle_tabelle_interne");

describe("la policy esistente viene ristretta, non affiancata", () => {
  it("le quattro policy dello staff cambiano condizione", () => {
    for (const p of [
      "company_access_giornale ON public.giornale_lavori",
      "company_access_giornale_foto ON public.giornale_foto",
      "company_access_odv ON public.ordini_variazione",
      "foto_cantiere_company ON public.foto_cantiere",
    ]) {
      expect(quattro).toContain(`ALTER POLICY ${p}`);
    }
    const alter = quattro.match(/AND NOT public\.utente_e_cliente_esterno\(\)/g) ?? [];
    expect(alter.length).toBeGreaterThanOrEqual(4);
  });

  it("il motivo per cui affiancarne una non basterebbe è scritto", () => {
    expect(quattro.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /Le policy permissive si sommano in OR/);
  });
});

describe("chi è un cliente esterno", () => {
  it("chi ha anche un ruolo interno resta interno", () => {
    expect(quattro).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.user_roles ur\s*\n\s*WHERE ur\.user_id = \(SELECT auth\.uid\(\)\) AND ur\.role <> 'customer'/);
  });
});

describe("quello che il cliente può leggere", () => {
  it("il giornale solo delle sue commesse E solo se visibile", () => {
    const pol = quattro.slice(quattro.indexOf("CREATE POLICY giornale_lavori_cliente_select"));
    expect(pol).toMatch(/coalesce\(visibile_cliente, false\) IS TRUE/);
    expect(pol).toMatch(/o\.customer_id = \(SELECT auth\.uid\(\)\)/);
    expect(pol.slice(0, 500)).toMatch(/AND EXISTS/);
  });

  it("le foto seguono la visibilità del rapportino", () => {
    const pol = quattro.slice(quattro.indexOf("CREATE POLICY giornale_foto_cliente_select"));
    expect(pol.slice(0, 500)).toMatch(/coalesce\(g\.visibile_cliente, false\) IS TRUE/);
  });

  it("foto_cantiere resta chiusa, e il perché è scritto", () => {
    expect(quattro).not.toMatch(/CREATE POLICY foto_cantiere_cliente/);
    expect(quattro.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /Inventare qui una regola di visibilità sarebbe peggio che lasciare la porta chiusa/);
  });
});

describe("la rassegna sulle tabelle interne", () => {
  it("intercetta tutti gli aiutanti «stessa azienda», non solo il primo", () => {
    for (const h of [
      "get_my_company_id", "get_user_company_id", "get_effective_company_id",
      "hr_talent_company_allowed", "can_view_company_people",
      "internal_chat_company_allowed",
    ]) {
      expect(rassegna).toContain(h);
    }
  });

  it("lascia stare le policy del commercialista e del super admin", () => {
    expect(rassegna.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /quelle del commercialista, del super admin o a token restano come sono/);
  });

  it("è ripetibile: salta quelle già ristrette", () => {
    expect(rassegna).toMatch(/NOT LIKE '%utente_e_cliente_esterno%'/);
  });

  it("copre le tabelle più sensibili trovate dalla sonda", () => {
    for (const t of [
      "documenti_fiscali", "profiles", "user_sessions", "internal_chat_messages",
      "listino_griglia", "purchase_orders", "central_audit_log", "subappaltatori",
      "hr_talent_candidates", "sms_wallet",
    ]) {
      expect(rassegna).toContain(`'${t}'`);
    }
  });

  it("la scelta di non toccare get_my_company_id è motivata", () => {
    const testo = rassegna.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/Chiuderebbe 512 policy in un colpo/);
    expect(testo).toMatch(/quella è una decisione di prodotto/);
  });
});
