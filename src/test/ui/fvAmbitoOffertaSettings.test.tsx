import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FvAmbitoOffertaSettings } from "../../components/fotovoltaico/FvAmbitoOffertaSettings";
import { leggiAmbitoOffertaFv } from "../../../supabase/functions/_shared/fvAmbitoOfferta";
function Editor() {
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return <FvAmbitoOffertaSettings value={leggiAmbitoOffertaFv(blocchi)} onChange={v => setBlocchi({ ambito_offerta: v })} />;
}
describe("Perimetro dell’offerta modificabile", () => {
  it("permette di inserire più voci conservando il ritorno a capo mentre si scrive", () => {
    render(<Editor />); const campo = screen.getByLabelText("Cosa è incluso");
    fireEvent.change(campo, { target: { value: "Prima attività\n" } }); expect(campo).toHaveValue("Prima attività\n");
    fireEvent.change(campo, { target: { value: "Prima attività\nSeconda attività" } }); expect(campo).toHaveValue("Prima attività\nSeconda attività");
  });
});
