import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ArchivioFirmeTable, useColonneFirme } from "@/pages/azienda/firma-elettronica/ArchivioFirmeTable";
import type { SignatureRequestRow } from "@/pages/azienda/firma-elettronica";
import { scaricaCsv } from "@/lib/csv";

vi.mock("@/lib/csv", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/csv")>(), scaricaCsv: vi.fn() }));

it("mantiene le colonne salvate ed esporta solo le richieste selezionate", () => {
  const rows = ["Contratto A", "Contratto B"].map((documento_label, i) => ({
    id: String(i), documento_label, signer_email: "cliente@example.invalid",
  }) as SignatureRequestRow);
  const storageKey = "test-firma-colonne";
  localStorage.setItem(storageKey, JSON.stringify(["Email"]));
  function Archive() {
    const { visible } = useColonneFirme(storageKey);
    return <ArchivioFirmeTable rows={rows} visible={visible} openDetail={vi.fn()}
    status={() => ({label:"Firmato", className:""})} documentType={() => "Ordine"} actions={() => null} />;
  }
  const view = render(<Archive />);
  expect(screen.getByRole("columnheader", {name:"Email"})).toBeVisible();
  expect(screen.queryByRole("columnheader", {name:"Scadenza"})).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", {name:/Seleziona Contratto A/}));
  expect(screen.getByRole("checkbox", {name:/Seleziona tutte/})).toHaveAttribute("aria-checked","mixed");
  fireEvent.click(screen.getByRole("button", {name:"Esporta CSV"}));
  expect(scaricaCsv).toHaveBeenCalledWith("richieste-firma.csv", "Documento;Email\r\nContratto A;cliente@example.invalid");
  fireEvent.click(screen.getByRole("checkbox", {name:/Seleziona tutte/}));
  expect(within(view.container).getByRole("status")).toHaveTextContent("2 selezionate");
  fireEvent.click(screen.getByRole("button", {name:"Deseleziona"}));
  expect(screen.queryByRole("button", {name:"Esporta CSV"})).toBeNull();
  localStorage.removeItem(storageKey);
});
