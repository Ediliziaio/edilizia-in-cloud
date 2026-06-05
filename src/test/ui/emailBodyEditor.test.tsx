import { act, type ContextType } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmailBodyEditor } from "@/components/flow-builder/config-panels/EmailBodyEditor";
import { AuthContext } from "@/contexts/AuthContext";

// Smoke test: il rischio reale è un crash al montaggio dell'editor (TipTap) dentro
// il pannello di config del nodo email. Si rendono i provider minimi (Query + Auth
// con effectiveCompany null → la query dei campi personalizzati resta disabilitata,
// nessuna chiamata di rete). Se monta senza lanciare, l'editor non rompe il builder.
describe("EmailBodyEditor (smoke)", () => {
  it("monta senza errori e inizializza l'editor con l'HTML iniziale", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const auth = { effectiveCompany: null } as unknown as ContextType<typeof AuthContext>;

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <AuthContext.Provider value={auth}>
            <EmailBodyEditor
              value={'<p>Ciao {{nome}},</p><p>Test <strong>grassetto</strong></p>'}
              onChange={onChange}
            />
          </AuthContext.Provider>
        </QueryClientProvider>,
      );
    });

    expect(container.querySelector(".ProseMirror")).toBeTruthy();
    expect(container.textContent).toContain("{{nome}}");

    await act(async () => root.unmount());
    container.remove();
  });
});
