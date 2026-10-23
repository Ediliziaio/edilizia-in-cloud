import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Cointestatario } from "@/components/preventivatore/Cointestatario";
import { nomeCointestatario } from "@/lib/preventivatore/cointestatario";
import { applicaMergeTagModulo } from "@/lib/mergeTagsModuli";

describe("preventivo cointestato", () => {
  it("nelle condizioni il committente sono tutti e due", () => {
    const testo = applicaMergeTagModulo("Committente: {{cliente.nome_completo}}.", {
      clienteNome: "Mario", clienteCognome: "Rossi", cointestatario: "Anna Bianchi",
    });
    expect(testo).toBe("Committente: Mario Rossi e Anna Bianchi.");
    expect(applicaMergeTagModulo("{{cliente.nome_completo}}", { clienteNome: "Mario", clienteCognome: "Rossi" })).toBe("Mario Rossi");
  });

  it("il nome del cointestatario c'è solo se è scritto", () => {
    expect(nomeCointestatario({ cointestatario_nome: " Anna ", cointestatario_cognome: "Bianchi" })).toBe("Anna Bianchi");
    expect(nomeCointestatario({ cointestatario_nome: "", cointestatario_cognome: null })).toBeNull();
    expect(nomeCointestatario(null)).toBeNull();
  });

  it("l'interruttore apre i campi; spento li svuota", () => {
    const onChange = vi.fn();
    render(<Cointestatario form={{}} onChange={onChange} />);
    expect(screen.queryByLabelText("Nome")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Preventivo cointestato" }));
    fireEvent.change(screen.getByLabelText("Codice fiscale"), { target: { value: "bncnna80a41l219x" } });
    expect(onChange).toHaveBeenCalledWith("cointestatario_codice_fiscale", "BNCNNA80A41L219X");
    fireEvent.click(screen.getByRole("switch", { name: "Preventivo cointestato" }));
    expect(onChange).toHaveBeenCalledWith("cointestatario_nome", null);
    expect(onChange).toHaveBeenCalledWith("cointestatario_cognome", null);
    expect(onChange).toHaveBeenCalledWith("cointestatario_codice_fiscale", null);
  });

  it("un preventivo già cointestato si apre coi campi visibili", () => {
    render(<Cointestatario form={{ cointestatario_nome: "Anna", cointestatario_cognome: "Bianchi" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Cognome")).toHaveValue("Bianchi");
  });
});
