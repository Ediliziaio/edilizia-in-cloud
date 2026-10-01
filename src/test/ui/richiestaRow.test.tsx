import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useRichieste", () => ({ useRichieste: () => ({ data: [] }), useCreateRichiesta: () => ({}), useUpdateRichiestaStato: () => ({}) }));
vi.mock("@/hooks/useOrganigramma", () => ({ useAllHrProfili: () => ({ data: [] }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { RichiestaRow } from "@/pages/azienda/personale/tabs/TabRichieste";

const base = {
  id: "r1", tipo: "ferie", stato: "in_attesa", data_inizio: "2026-10-05", data_fine: "2026-10-07",
  created_at: "2026-10-01T10:00:00Z", profilo_id: "p1", ore_richieste: null,
  profilo: { id: "p1", nome: "Anna", cognome: "Verdi", colore_avatar: "#0EA5E9", reparto: null, mansione: null },
} as never;

describe("riga di una richiesta", () => {
  it("mostra il nome e, in attesa, i pulsanti Approva e Rifiuta che non aprono la scheda", () => {
    const onClick = vi.fn(); const onApprova = vi.fn(); const onRifiuta = vi.fn();
    render(<RichiestaRow richiesta={base} onClick={onClick} onApprova={onApprova} onRifiuta={onRifiuta} giaAssenti={["Luca Rossi", "Sara Neri"]} />);
    expect(screen.getByText("Anna Verdi")).toBeTruthy();
    expect(screen.getByText(/2 colleghi già assenti/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Approva/ }));
    expect(onApprova).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Rifiuta/ }));
    expect(onRifiuta).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("senza profilo la riga dice «Dipendente non collegato» e non si può approvare da lì", () => {
    render(<RichiestaRow richiesta={{ ...(base as object), profilo: undefined, profilo_id: null } as never} onClick={() => {}} onApprova={() => {}} onRifiuta={() => {}} />);
    expect(screen.getByText("Dipendente non collegato")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Approva/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("una richiesta già approvata non ha i pulsanti", () => {
    render(<RichiestaRow richiesta={{ ...(base as object), stato: "approvata" } as never} onClick={() => {}} onApprova={() => {}} onRifiuta={() => {}} />);
    expect(screen.queryByRole("button", { name: /Approva/ })).toBeNull();
  });
});
