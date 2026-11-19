import { describe, expect, it, vi } from "vitest";
import { eseguiPerRiga } from "@/lib/operazioniPerRiga";

describe("operazioni multiple con esito per riga", () => {
  it("conserva i successi e identifica la riga rifiutata dal server", async () => {
    const esito = await eseguiPerRiga(["prima", "bloccata", "ultima"], async (r) => {
      if (r === "bloccata") throw new Error("La registrazione è già cambiata.");
    });
    expect(esito.completate).toEqual(["prima", "ultima"]);
    expect(esito.errori.map((e) => e.riga)).toEqual(["bloccata"]);
  });
  it("quando cade la connessione ferma le altre richieste e le dichiara non elaborate", async () => {
    const azione = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const esito = await eseguiPerRiga(["prima", "seconda", "terza"], azione);
    expect(azione).toHaveBeenCalledTimes(2);
    expect(esito.completate).toEqual(["prima"]);
    expect(esito.errori.map((e) => e.riga)).toEqual(["seconda", "terza"]);
    expect(esito.errori[1].motivo).toContain("Non elaborata");
  });
});
