/**
 * Builder delle automazioni: la scelta del modello WhatsApp nel passo
 * «Invia WhatsApp» (24/09/2026).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ModelloWhatsAppPasso } from "@/components/flow-builder/config-panels/ModelloWhatsAppPasso";

const finti = vi.hoisted(() => {
  const tabelle: Record<string, unknown[]> = {
    wa_meta_templates: [
      {
        template_name: "richiesta_info_fotovoltaico",
        template_language: "it",
        status: "APPROVED",
        wa_number_id: "num-green",
        variables_count: 1,
        variable_mapping: { "1": "nome" },
        components_json: [{ type: "BODY", text: "Ciao {{1}}, grazie per aver richiesto informazioni sul fotovoltaico!" }],
      },
      {
        template_name: "promemoria_sopralluogo",
        template_language: "it",
        status: "PENDING",
        wa_number_id: "num-green",
        variables_count: 2,
        variable_mapping: { "1": "nome" },
        components_json: [{ type: "BODY", text: "Ciao {{1}}, domani passa {{2}}." }],
      },
    ],
    ai_whatsapp_numbers: [{ id: "num-green", display_name: "Fotovoltaico per la Tua Casa", numero: "+39 352 296 3510" }],
  };
  function catena(tabella: string): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve({ data: tabelle[tabella] ?? [], error: null }).then(ok, ko);
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  }
  return { tabelle, catena };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (tabella: string) => finti.catena(tabella) },
}));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
});

afterEach(() => cleanup());

function mostra(config: Record<string, unknown>) {
  const onPatch = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ModelloWhatsAppPasso config={config} onPatch={onPatch} companyId="az-green" />
    </QueryClientProvider>,
  );
  return onPatch;
}

function apriMenu() {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Modello WhatsApp" }), {
    button: 0, ctrlKey: false, pointerType: "mouse",
  });
}

describe("passo «Invia WhatsApp»: il modello", () => {
  it("senza modello avvisa che il testo libero arriva solo entro 24 ore", async () => {
    mostra({});
    expect(await screen.findByText(/solo se il cliente ha scritto nelle ultime 24 ore/)).toBeTruthy();
  });

  it("si sceglie un modello approvato; quello in attesa si vede ma non si sceglie", async () => {
    const onPatch = mostra({});
    apriMenu();
    const menu = await screen.findByRole("listbox");
    // I modelli arrivano dopo l'apertura del menu: si aspetta la loro voce.
    const inAttesa = await within(menu).findByRole("option", { name: /promemoria_sopralluogo.*in attesa di approvazione/ });
    expect(inAttesa.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(within(menu).getByRole("option", { name: /richiesta_info_fotovoltaico · it/ }));
    expect(onPatch).toHaveBeenCalledWith({
      modello_whatsapp: "richiesta_info_fotovoltaico",
      modello_whatsapp_lingua: "it",
      modello_whatsapp_numero: "num-green",
      modello_whatsapp_valori: {},
    });
  });

  it("scelto il modello: il testo, e da quale campo arriva ogni variabile", async () => {
    mostra({ modello_whatsapp: "richiesta_info_fotovoltaico", modello_whatsapp_lingua: "it", modello_whatsapp_numero: "num-green" });
    expect(await screen.findByText(/Ciao \{\{1\}\}, grazie per aver richiesto informazioni/)).toBeTruthy();
    expect(screen.getByText(/\{\{1\}\} = Nome del contatto/)).toBeTruthy();
  });

  it("una variabile senza campo si scrive nel passo", async () => {
    const onPatch = mostra({
      modello_whatsapp: "promemoria_sopralluogo", modello_whatsapp_lingua: "it", modello_whatsapp_numero: "num-green",
      modello_whatsapp_valori: {},
    });
    const campo = await screen.findByRole("textbox", { name: "Testo per {{2}}" });
    fireEvent.change(campo, { target: { value: "il geometra Rossi" } });
    expect(onPatch).toHaveBeenCalledWith({ modello_whatsapp_valori: { "2": "il geometra Rossi" } });
    // Ed è in attesa: il passo non invierà finché Meta non lo approva.
    expect(screen.getByText(/il passo non invia finché Meta non lo approva/)).toBeTruthy();
  });

  it("un modello che non c'è più si dice subito", async () => {
    mostra({ modello_whatsapp: "vecchio_modello", modello_whatsapp_numero: "num-green" });
    expect(await screen.findByText(/Il modello «vecchio_modello» non c'è più/)).toBeTruthy();
  });
});
