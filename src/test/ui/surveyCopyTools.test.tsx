import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  SurveyDuplicateDialog,
  SurveyCommonCopy,
} from "@/components/sopralluoghi/SurveyCopyTools";
import { makeCompleteWindowSurvey } from "../fixtures/completeWindowSurvey";
afterEach(cleanup);
const d = makeCompleteWindowSurvey(),
  source = d.elements[6],
  type = d.template.schema.element_types.find(
    (t) => t.key === source.element_type,
  )!;
it("inizia dalla copia senza misure e chiede ambiente/nome", async () => {
  const confirm = vi.fn().mockResolvedValue(undefined);
  render(
    <SurveyDuplicateDialog
      detail={d}
      source={source}
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  expect(screen.getByLabelText("Nome del nuovo pezzo")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Crea copia da verificare" }),
  );
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(confirm.mock.calls[0][0].mode).toBe("common");
});
it("un errore conserva lo stesso identificativo al tentativo successivo", async () => {
  const confirm = vi.fn().mockRejectedValue(new Error("offline"));
  render(
    <SurveyDuplicateDialog
      detail={d}
      source={source}
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Crea copia da verificare" }),
  );
  await screen.findByRole("alert");
  const id = confirm.mock.calls[0][0].id;
  fireEvent.click(
    screen.getByRole("button", { name: "Crea copia da verificare" }),
  );
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  expect(confirm.mock.calls[1][0].id).toBe(id);
});
it("la copia comune propone solo elementi della stessa famiglia e aspetta una scelta esplicita", () => {
  render(
    <SurveyCommonCopy
      detail={d}
      element={d.elements[7]}
      type={type}
      onApply={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Copia dati comuni da un altro elemento"));
  expect(screen.getByRole("button", { name: /Applica/ })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("combobox", { name: "Elemento da cui copiare" }),
  );
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option").textContent).toContain("T01");
});
