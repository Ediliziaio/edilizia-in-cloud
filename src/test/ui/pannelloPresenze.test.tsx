import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PannelloPresenze } from "@/pages/azienda/personale/tabs/PannelloPresenze";

const p = (id: string, nome: string, last_tipo: string | null, reparto = "Cantiere") =>
  ({ id, nome, cognome: "X", colore_avatar: "#0EA5E9", mansione: "Operaio", reparto, last_tipo, last_ora: last_tipo ? "08:05" : null, is_present: last_tipo === "entrata" }) as never;

describe("chi è in azienda oggi", () => {
  const persone = [p("1", "Anna", "entrata"), p("2", "Bruno", "pausa_inizio"), p("3", "Carla", "uscita", "Ufficio"), p("4", "Dario", null), p("5", "Elena", null, "Ufficio")];

  it("mostra i numeri per stato e di serie chi è in azienda; Elena in ferie non è «non ha timbrato»", () => {
    render(<PannelloPresenze persone={persone} assentiGiustificati={{ "5": "In ferie" }} />);
    expect(screen.getByRole("tab", { name: /1\s*In azienda/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /1\s*In pausa/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /1\s*Non ha timbrato/ })).toBeTruthy(); // solo Dario
    expect(screen.getByRole("tab", { name: /1\s*Ferie \/ permessi/ })).toBeTruthy();
    expect(screen.getByText("Anna X")).toBeTruthy();
    expect(screen.queryByText("Dario X")).toBeNull();
    expect(screen.getByText(/2 su 5/)).toBeTruthy(); // in azienda + in pausa
  });
  it("cliccando uno stato si vedono quelle persone", () => {
    render(<PannelloPresenze persone={persone} assentiGiustificati={{ "5": "In ferie" }} />);
    fireEvent.click(screen.getByRole("tab", { name: /Ferie \/ permessi/ }));
    expect(screen.getByText("Elena X")).toBeTruthy();
    expect(screen.getByText(/In ferie/)).toBeTruthy();
  });
});
