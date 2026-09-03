import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.2 — la distanza della timbratura la ricalcola il server.
 *
 * Provato su produzione con una sede di prova al Duomo di Milano (raggio 150 m),
 * poi cancellata:
 *   50 m           → dentro,  50,0 m
 *   1,1 km         → fuori,   1.111,9 m   (0,01° di latitudine: atteso 1.112 m)
 *   sede a Milano dichiarata mentre il GPS dice Roma → fuori, 477 km
 *   sede di un'altra azienda → respinta (42501)
 *   senza coordinate → senza_gps, distanza NULL
 *   client che scrive «dentro, 0 m» mentre è a 1,1 km → riscritto a fuori, 1.111,9 m
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("timbratura_distanza_dal_server"));
if (!nome) throw new Error("migrazione timbratura_distanza_dal_server non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

const useGPS = readFileSync(resolve(__dirname, "../../hooks/useGPS.ts"), "utf8");

describe("il calcolo della distanza vive sul server", () => {
  it("c'è una Haversine in SQL", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.distanza_metri/);
    expect(sql).toMatch(/6371000/);
    expect(sql).toMatch(/radians/);
  });

  it("una distanza sconosciuta è NULL, non zero", () => {
    expect(sql).toMatch(/WHERE p_lat1 IS NOT NULL AND p_lng1 IS NOT NULL/);
    expect(sql).toMatch(/una distanza sconosciuta non è zero/);
  });

  it("il trigger scatta anche quando cambiano le coordinate, non solo all'inserimento", () => {
    expect(sql).toMatch(
      /BEFORE INSERT OR UPDATE OF lat, lng, sede_id, order_id ON public\.hr_timbrature/);
  });

  it("azzera le colonne di esito prima di ricalcolarle: quello che manda il client non conta", () => {
    const corpo = sql.slice(sql.indexOf("FUNCTION public.verifica_posizione_timbratura"));
    const posAzzera = corpo.indexOf("NEW.distanza_mt      := NULL;");
    const posCalcola = corpo.indexOf("NEW.distanza_mt := round(");
    expect(posAzzera).toBeGreaterThan(0);
    expect(posCalcola).toBeGreaterThan(posAzzera);
  });
});

describe("le tre forme di «non verificabile» sono distinte", () => {
  it("il vincolo le elenca tutte e cinque", () => {
    for (const esito of [
      "dentro", "fuori", "senza_gps", "riferimento_senza_coordinate", "nessun_riferimento",
    ]) {
      expect(sql).toContain(`'${esito}'`);
    }
  });

  it("senza GPS non diventa «dentro»", () => {
    expect(sql).toMatch(/IF NEW\.lat IS NULL OR NEW\.lng IS NULL THEN\s*\n\s*NEW\.posizione_esito := 'senza_gps';/);
  });

  it("un riferimento senza coordinate lo dice invece di tacerlo", () => {
    expect(sql).toMatch(/NEW\.posizione_esito := 'riferimento_senza_coordinate'/);
  });
});

describe("integrità", () => {
  it("una sede di un'altra azienda viene respinta", () => {
    expect(sql).toMatch(/la sede dichiarata non appartiene a questa azienda/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });

  it("la sede la sceglie il server", () => {
    expect(sql).toMatch(/NEW\.sede_id\s+:= v_sede\.id;\s+-- la sede la assegna il server/);
    expect(sql).toMatch(/ORDER BY public\.distanza_metri\(NEW\.lat, NEW\.lng, s\.lat, s\.lng\)/);
  });

  it("non rifiuta chi è fuori raggio, e il motivo è scritto", () => {
    expect(sql).toMatch(/Non rifiuta la timbratura quando è fuori raggio/);
    const corpo = sql.slice(sql.indexOf("FUNCTION public.verifica_posizione_timbratura"));
    const rifiuti = corpo.match(/RAISE EXCEPTION/g) ?? [];
    expect(rifiuti.length, "l'unico rifiuto deve essere la sede di un'altra azienda").toBe(1);
  });

  it("le righe già presenti non si dichiarano verificate", () => {
    const backfill = sql.slice(sql.indexOf("UPDATE public.hr_timbrature SET"));
    expect(backfill).not.toMatch(/'dentro'/);
    expect(backfill).toMatch(/'senza_gps'/);
    expect(backfill).toMatch(/'nessun_riferimento'/);
  });
});

describe("il client resta come sta, ma non decide più", () => {
  it("useGPS calcola ancora la distanza: serve a mostrare qualcosa subito", () => {
    // Non è un difetto: è utile che l'interfaccia dica «sei in sede» prima di
    // salvare. Il punto è che quel giudizio non arriva più in tabella.
    expect(useGPS).toMatch(/haversineDistance/);
  });
});
