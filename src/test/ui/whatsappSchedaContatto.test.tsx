/**
 * Scheda contatto: i WhatsApp nei due sensi, con l'esito di Meta (24/09/2026).
 *
 * Prima la cronologia mostrava da whatsapp_messages solo le risposte del
 * cliente: un messaggio o un modello inviato da Conversazioni non c'era, e un
 * invio rifiutato da Meta non si distingueva da uno arrivato.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnifiedContactTimeline } from "@/components/marketing/UnifiedContactTimeline";

const finti = vi.hoisted(() => {
  const righe: Record<string, unknown[]> = {};
  const filtriOr: { tabella: string; filtro: string }[] = [];
  // Catena finta del client: ogni metodo torna la catena, e la catena è una
  // promessa con le righe della tabella.
  function catena(tabella: string): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve({ data: righe[tabella] ?? [], error: null }).then(ok, ko);
          }
          if (prop === "or") {
            return (filtro: string) => {
              filtriOr.push({ tabella, filtro });
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  }
  return { righe, filtriOr, catena };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (tabella: string) => finti.catena(tabella) },
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

afterEach(() => cleanup());

const ORA = "2026-09-24T10:00:00.000Z";

function mostra() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UnifiedContactTimeline
        contactId="ct-florin"
        companyId="az-green"
        contactPhone="+39 348 346 7567"
        contactEmail={null}
      />
    </QueryClientProvider>,
  );
}

describe("scheda contatto: WhatsApp nei due sensi", () => {
  it("modello inviato, risposta del cliente e invio rifiutato, ognuno col suo esito", async () => {
    finti.righe.whatsapp_messages = [
      {
        id: "m3", direction: "outbound", message_type: "text", created_at: "2026-09-24T10:05:00.000Z",
        content_text: "Perfetto, la chiamiamo domattina", media_url: null,
        delivery_status: "failed", delivery_error: "il numero non è su WhatsApp o non può ricevere il messaggio",
      },
      {
        id: "m2", direction: "inbound", message_type: "text", created_at: "2026-09-24T10:02:00.000Z",
        content_text: "1️⃣ Mattina", media_url: null, delivery_status: null, delivery_error: null,
      },
      {
        id: "m1", direction: "outbound", message_type: "template", created_at: ORA,
        content_text: "Ciao Florin, grazie per aver richiesto informazioni sul fotovoltaico", media_url: null,
        delivery_status: "read", delivery_error: null,
      },
    ];
    mostra();

    expect(await screen.findByText("Ciao Florin, grazie per aver richiesto informazioni sul fotovoltaico")).toBeTruthy();
    expect(screen.getByText("1️⃣ Mattina")).toBeTruthy();
    expect(screen.getByText("WhatsApp · modello")).toBeTruthy();
    expect(
      screen.getByText(/Perfetto, la chiamiamo domattina\s+✗ Non consegnato: il numero non è su WhatsApp/),
    ).toBeTruthy();
  });

  it("si leggono i messaggi del contatto e, senza contatto, quelli del suo numero nei due sensi", async () => {
    finti.filtriOr.length = 0;
    finti.righe.whatsapp_messages = [];
    mostra();
    await screen.findAllByText(/./);
    const filtro = finti.filtriOr.find((f) => f.tabella === "whatsapp_messages")?.filtro ?? "";
    expect(filtro).toContain("contact_id.eq.ct-florin");
    expect(filtro).toContain("and(contact_id.is.null,direction.eq.inbound,from_phone.ilike.%483467567%)");
    expect(filtro).toContain("and(contact_id.is.null,direction.eq.outbound,to_phone.ilike.%483467567%)");
  });
});
