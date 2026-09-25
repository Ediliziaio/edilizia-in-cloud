/**
 * «Errore nel caricamento della pagina» (Ener Italia, 25/09/2026).
 *
 * Dalle 11:59 la pagina Impostazioni → Modelli di preventivo andava in crash:
 * l'anteprima dei modelli «offerta» passava la copertina a getLogoPublicUrl,
 * che faceva `null.replace` sui modelli senza copertina. E dopo il crash anche
 * le Opportunità e ogni altra pagina mostravano lo stesso errore, finché non si
 * usciva e rientrava: l'ErrorBoundary di pagina non si azzerava cambiando
 * pagina.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: async () => ({ error: null as unknown }) }),
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (percorso: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${percorso}` } }),
      }),
    },
    auth: { getSession: async () => ({ data: { session: null as unknown } }) },
  },
}));

import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { getLogoPublicUrl } from "@/pages/azienda/settings/SettingsQuoteTemplates/helpers";

const TITOLO = "Errore nel caricamento della pagina";

function Pagina({ rompe, nome }: { rompe: boolean; nome: string }) {
  if (rompe) throw new TypeError("Cannot read properties of null (reading 'replace')");
  return <p>{nome}</p>;
}

describe("l'immagine del modello", () => {
  it("un modello senza copertina non rompe più niente", () => {
    expect(getLogoPublicUrl(null)).toBeUndefined();
    expect(getLogoPublicUrl(undefined)).toBeUndefined();
    expect(getLogoPublicUrl("")).toBeUndefined();
  });

  it("gli indirizzi e i percorsi di prima restano quelli", () => {
    expect(getLogoPublicUrl("https://esempio.it/copertina.jpg")).toBe("https://esempio.it/copertina.jpg");
    expect(getLogoPublicUrl("quote-template-assets/az/copertina.png"))
      .toBe("https://cdn.test/quote-template-assets/az/copertina.png");
    expect(getLogoPublicUrl("/company-assets/az/logo.png")).toBe("https://cdn.test/company-assets/az/logo.png");
    expect(getLogoPublicUrl("az/copertina.png")).toBe("https://cdn.test/quote-template-assets/az/copertina.png");
  });
});

describe("l'errore di una pagina non blocca le altre", () => {
  // React e jsdom stampano l'errore catturato: qui è voluto.
  const zitto = (e: ErrorEvent) => e.preventDefault();
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.addEventListener("error", zitto);
  });
  afterEach(() => {
    window.removeEventListener("error", zitto);
    cleanup();
    vi.restoreAllMocks();
  });

  it("cambiando pagina l'errore si toglie e si vede la pagina nuova", () => {
    const { rerender } = render(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/impostazioni/template-preventivi">
        <Pagina rompe nome="Modelli di preventivo" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(TITOLO)).toBeTruthy();

    rerender(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/marketing/opportunita">
        <Pagina rompe={false} nome="Opportunità" />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(TITOLO)).toBeNull();
    expect(screen.getByText("Opportunità")).toBeTruthy();
  });

  it("restando sulla stessa pagina l'errore resta", () => {
    const { rerender } = render(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/impostazioni/template-preventivi">
        <Pagina rompe nome="Modelli di preventivo" />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/impostazioni/template-preventivi">
        <Pagina rompe={false} nome="Modelli di preventivo" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(TITOLO)).toBeTruthy();
  });

  it("se si rompe la pagina nuova, resta l'errore e si prova una volta sola", () => {
    let tentativi = 0;
    function PaginaRotta() {
      tentativi++;
      return <Pagina rompe nome="Opportunità" />;
    }
    const { rerender } = render(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/attivita">
        <Pagina rompe={false} nome="Attività" />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/marketing/opportunita">
        <PaginaRotta />
      </ErrorBoundary>,
    );
    expect(screen.getByText(TITOLO)).toBeTruthy();
    const dopoIlCambio = tentativi;
    rerender(
      <ErrorBoundary title={TITOLO} resetKey="/azienda/marketing/opportunita">
        <PaginaRotta />
      </ErrorBoundary>,
    );
    expect(screen.getByText(TITOLO)).toBeTruthy();
    expect(tentativi).toBe(dopoIlCambio);
  });

  it("i layout passano la pagina aperta", () => {
    for (const layout of ["CompanyLayout", "AdminLayout", "CustomerLayout", "CampoLayout", "TecnicoLayout"]) {
      const src = readFileSync(join(process.cwd(), `src/components/layouts/${layout}.tsx`), "utf8");
      expect(src, layout).toContain(`<ErrorBoundary title="${TITOLO}" resetKey={location.pathname}>`);
      expect(src, layout).not.toContain(`<ErrorBoundary title="${TITOLO}">`);
    }
  });
});
