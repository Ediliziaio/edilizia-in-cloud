/**
 * Profilo WhatsApp dalla scheda del numero (24/09/2026).
 *
 * Tiene fermo:
 *   · «Profilo» c'è solo per chi amministra l'azienda (il server fa lo stesso);
 *   · la finestra legge il profilo da WhatsApp e lo mostra;
 *   · «Salva su WhatsApp» si accende solo con una modifica valida e manda il
 *     profilo del numero giusto;
 *   · gli errori del server finiscono sul campo;
 *   · la foto scelta, già ritagliata, parte da sola.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Risposta = { data: unknown; error: unknown };

const stato = vi.hoisted(() => ({
  admin: true,
  chiamate: [] as Array<Record<string, unknown>>,
  risposte: {} as Record<string, () => { data: unknown; error: unknown }>,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (_nome: string, { body }: { body: Record<string, unknown> }): Promise<Risposta> => {
        stato.chiamate.push(body);
        const risposta = stato.risposte[String(body.azione)];
        return risposta ? risposta() : { data: null, error: null };
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: stato.admin }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/lib/whatsapp/fotoProfiloWhatsApp", () => ({
  preparaFotoProfilo: vi.fn(async () => ({ base64: "QUJD", tipo: "image/jpeg", anteprima: "data:image/jpeg;base64,QUJD" })),
}));

import { WhatsAppNumberCard } from "@/components/whatsapp-multi/WhatsAppNumberCard";
import type { WANumber } from "@/hooks/whatsapp/useWhatsAppNumbers";

const numero = {
  id: "numero-1",
  company_id: "azienda-1",
  purpose: "lead",
  display_name: "Fotovoltaico per la Tua Casa",
  nome_account: "Fotovoltaico per la Tua Casa",
  numero: "+39 352 296 3510",
  phone_number_id: "1262779783593509",
  waba_id: "1744282093517251",
  stato: "active",
  webhook_verified: true,
} as unknown as WANumber;

const profiloMeta = {
  info: "Fotovoltaico chiavi in mano",
  descrizione: "Impianti in tutta la Lombardia",
  indirizzo: "Via Roma 1, Milano",
  email: "info@greenenergy.it",
  siti: ["https://www.greenenergy.it"],
  categoria: "PROF_SERVICES",
  fotoUrl: null as string | null,
};

function monta() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WhatsAppNumberCard number={numero} />
    </QueryClientProvider>,
  );
}

const apri = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Profilo WhatsApp/ }));
  return (await screen.findByLabelText("Info")) as HTMLInputElement;
};
const salva = () => screen.getByRole("button", { name: "Salva su WhatsApp" }) as HTMLButtonElement;
const scrivi = (campo: HTMLElement, valore: string) => fireEvent.change(campo, { target: { value: valore } });

beforeEach(() => {
  stato.admin = true;
  stato.chiamate.length = 0;
  stato.risposte = {
    leggi: () => ({ data: { profilo: profiloMeta, nome: { verificato: "Fotovoltaico per la Tua Casa", stato: "APPROVED" } }, error: null }),
    salva: () => ({ data: { profilo: { ...profiloMeta, info: "Impianti fotovoltaici su misura" } }, error: null }),
    foto: () => ({ data: { profilo: { ...profiloMeta, fotoUrl: "https://pps.whatsapp.net/nuova.jpg" } }, error: null }),
  };
  Object.values(toast).forEach((f) => f.mockReset());
});

afterEach(() => cleanup());

describe("Profilo WhatsApp del numero", () => {
  it("chi non amministra l'azienda non vede «Profilo»", () => {
    stato.admin = false;
    monta();
    expect(screen.queryByRole("button", { name: /Profilo WhatsApp/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Aggiorna token/ })).toBeTruthy();
  });

  it("apre il profilo letto da WhatsApp, per il numero giusto", async () => {
    monta();
    const info = await apri();
    expect(info.value).toBe("Fotovoltaico chiavi in mano");
    expect((screen.getByLabelText("Descrizione") as HTMLTextAreaElement).value).toBe("Impianti in tutta la Lombardia");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("info@greenenergy.it");
    expect((screen.getByLabelText("Siti web (al massimo 2)") as HTMLInputElement).value).toBe("https://www.greenenergy.it");
    expect(screen.getByText("Fotovoltaico per la Tua Casa", { selector: "span" })).toBeTruthy();
    expect(screen.getByText(/approvato da Meta/)).toBeTruthy();
    expect(stato.chiamate).toEqual([{ azione: "leggi", company_id: "azienda-1", wa_number_id: "numero-1" }]);
    // Senza modifiche non si salva niente.
    expect(salva().disabled).toBe(true);
  });

  it("salva la modifica su WhatsApp con il resto del profilo com'era", async () => {
    monta();
    const info = await apri();
    scrivi(info, "  Impianti fotovoltaici su misura ");
    scrivi(screen.getByLabelText("Secondo sito web"), "www.energiapiu.it");
    expect(salva().disabled).toBe(false);
    fireEvent.click(salva());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profilo aggiornato su WhatsApp", expect.anything()));
    expect(stato.chiamate[1]).toEqual({
      azione: "salva",
      company_id: "azienda-1",
      wa_number_id: "numero-1",
      profilo: {
        ...profiloMeta,
        info: "Impianti fotovoltaici su misura",
        siti: ["https://www.greenenergy.it", "https://www.energiapiu.it"],
      },
    });
  });

  it("un campo fuori dalle regole di Meta si segnala e non si salva", async () => {
    monta();
    const info = await apri();
    scrivi(info, "x".repeat(140));
    expect(screen.getByText("Al massimo 139 caratteri.")).toBeTruthy();
    expect(salva().disabled).toBe(true);

    scrivi(info, "");
    expect(screen.getByText(/non permette di lasciarla vuota/)).toBeTruthy();
    expect(salva().disabled).toBe(true);
  });

  it("l'errore del server finisce sul campo", async () => {
    stato.risposte.salva = () => ({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(
          JSON.stringify({ error: "Controlla i campi evidenziati", errori: { email: "WhatsApp non accetta questo indirizzo." } }),
          { status: 400 },
        ),
      },
    });
    monta();
    await apri();
    scrivi(screen.getByLabelText("Email"), "commerciale@greenenergy.it");
    fireEvent.click(salva());

    expect(await screen.findByText("WhatsApp non accetta questo indirizzo.")).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("Profilo non salvato", { description: "Controlla i campi evidenziati" });
  });

  it("la foto scelta parte subito, già preparata", async () => {
    monta();
    await apri();
    const file = new File(["foto"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Scegli la foto del profilo"), { target: { files: [file] } });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Foto aggiornata su WhatsApp"));
    expect(stato.chiamate[1]).toEqual({
      azione: "foto",
      company_id: "azienda-1",
      wa_number_id: "numero-1",
      foto: { base64: "QUJD", tipo: "image/jpeg" },
    });
    expect((await screen.findByAltText("Foto del profilo WhatsApp")).getAttribute("src")).toBe("https://pps.whatsapp.net/nuova.jpg");
  });

  it("se WhatsApp non risponde lo dice e si può riprovare", async () => {
    stato.risposte.leggi = () => ({ data: { error: "WhatsApp ha rifiutato la modifica: token scaduto" }, error: null });
    monta();
    fireEvent.click(screen.getByRole("button", { name: /Profilo WhatsApp/ }));
    expect(await screen.findByText(/Non riesco a leggere il profilo da WhatsApp: WhatsApp ha rifiutato la modifica: token scaduto/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riprova/ })).toBeTruthy();
  });
});
