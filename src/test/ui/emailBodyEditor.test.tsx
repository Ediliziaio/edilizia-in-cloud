import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EmailBodyEditor } from "@/components/flow-builder/config-panels/EmailBodyEditor";

// Smoke test: il rischio reale è un crash al montaggio dell'editor (TipTap) dentro
// il pannello di config del nodo email. Se monta senza lanciare e inizializza il
// contenteditable, l'editor visuale non rompe il builder.
describe("EmailBodyEditor (smoke)", () => {
  it("monta senza errori e inizializza l'editor con l'HTML iniziale", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <EmailBodyEditor
          value={'<p>Ciao {{nome}},</p><p>Test <strong>grassetto</strong></p>'}
          onChange={onChange}
        />,
      );
    });

    // TipTap monta un contenteditable con classe ProseMirror.
    expect(container.querySelector(".ProseMirror")).toBeTruthy();
    // Il testo iniziale (incluse le variabili come testo) è presente.
    expect(container.textContent).toContain("{{nome}}");

    await act(async () => root.unmount());
    container.remove();
  });
});
