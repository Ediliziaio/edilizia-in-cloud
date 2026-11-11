import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  destinatarioDaOrdine,
  leggiDestinatarioRapporto,
  type OrdineDestinatarioRapporto,
} from "@/lib/documentiOperativi/destinatarioRapporto";
interface LetturaFinta {
  eq: (campo: string, valore: string) => LetturaFinta;
  maybeSingle: () => Promise<{ data: OrdineDestinatarioRapporto | null; error: null }>;
}

describe("Il destinatario del riepilogo lavori", () => {
  it("recupera il cliente collegato anche se il nome nella vecchia copia ordine manca", () => {
    expect(
      destinatarioDaOrdine({
        client_name: null,
        cliente: {
          first_name: "Cliente",
          last_name: "SIM",
          email: "cliente@example.org",
          address: "Sede cliente",
        },
      }),
    ).toEqual({
      nome: "Cliente SIM",
      email: "cliente@example.org",
      indirizzo: "Sede cliente",
    });
  });
  it("un cliente senza recapiti non eredita email o residenza della precedente copia", () => {
    expect(
      destinatarioDaOrdine({
        client_name: "Vecchio cliente",
        client_email: "vecchio@example.org",
        client_address: "Vecchia sede",
        cliente: {
          first_name: "Nuovo SIM",
          email: "cliente@no-email.ediliziaincloud.local",
        },
      }),
    ).toEqual({ nome: "Nuovo SIM", email: null, indirizzo: null });
  });
  it("la lettura rimane nell’azienda e nella commessa scelte e rifiuta una commessa non accessibile", async () => {
    const eq = vi.fn((_campo: string, _valore: string): LetturaFinta => query);
    const query: LetturaFinta = {
      eq,
      maybeSingle: async (): Promise<{
        data: OrdineDestinatarioRapporto | null;
        error: null;
      }> => ({ data: null, error: null }),
    };
    const db = { from: () => ({ select: () => query }) };
    await expect(
      leggiDestinatarioRapporto("azienda-2", "commessa-2", db),
    ).rejects.toThrow("non è più disponibile");
    expect(eq.mock.calls).toEqual([
      ["id", "commessa-2"],
      ["company_id", "azienda-2"],
    ]);
  });
});
