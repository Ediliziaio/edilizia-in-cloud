/**
 * Le funzioni del piano restano nella memoria del browser tra una ricarica e l'altra (24/11/2026).
 * Un «sì» ricordato apre subito la pagina; un «no» ricordato aspetta la lettura fresca prima di mandare via.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AccessoFinto {
  isEnabled: boolean; isPreview: boolean; isLoading: boolean; isError: boolean;
  isFetching: boolean; errorMessage: string | null; refetch: () => void;
}
const finto = vi.hoisted(() => ({ accesso: null as unknown }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => finto.accesso }));
vi.mock("@/components/feature-preview/PreviewModeWrapper", () => ({ PreviewModeWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { FeatureRoute } from "@/components/auth/FeatureRoute";

const accesso = (dati: Partial<AccessoFinto>): AccessoFinto => ({
  isEnabled: false, isPreview: false, isLoading: false, isError: false, isFetching: false, errorMessage: null, refetch: () => undefined, ...dati,
});
const mostra = () => render(
  <MemoryRouter initialEntries={["/azienda/serramenti"]}>
    <Routes>
      <Route path="/azienda/serramenti" element={<FeatureRoute featureKey="modulo_serramenti_attivo"><p>Preventivi serramenti</p></FeatureRoute>} />
      <Route path="/azienda/upgrade" element={<p>Pagina dei piani</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { finto.accesso = accesso({}); });

describe("FeatureRoute con le funzioni ricordate dal browser", () => {
  it("un «sì» ricordato apre subito la pagina, anche mentre si rilegge", () => {
    finto.accesso = accesso({ isEnabled: true, isFetching: true });
    mostra();
    expect(screen.getByText("Preventivi serramenti")).toBeTruthy();
  });

  it("un «no» ricordato non manda via finché la lettura fresca è in viaggio", () => {
    finto.accesso = accesso({ isEnabled: false, isFetching: true });
    mostra();
    expect(screen.getByText("Verifica accesso…")).toBeTruthy();
    expect(screen.queryByText("Pagina dei piani")).toBeNull();
  });

  it("un «no» confermato dalla lettura manda alla pagina dei piani", () => {
    finto.accesso = accesso({ isEnabled: false, isFetching: false });
    mostra();
    expect(screen.getByText("Pagina dei piani")).toBeTruthy();
  });
});
