import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Link, useLocation } from "react-router-dom";
import ChatHub from "@/pages/azienda/ChatHub";
vi.mock("@/pages/azienda/InternalChat", () => ({default: () => <p>Chat team visibile</p>}));
vi.mock("@/pages/azienda/conversazioni/ConversazioniInbox", () => ({default: () => <p>Conversazioni visibili</p>}));
afterEach(cleanup);
function Location() { return <output>{useLocation().search}</output>; }
describe("Schede della chat e URL", () => {
  it("segue i collegamenti nella stessa pagina e conserva il canale selezionato", () => {
    render(<MemoryRouter initialEntries={["/admin/chat?channel_id=demo"]}><Link to="?tab=conversazioni&channel_id=demo">Apri conversazioni</Link><ChatHub companyIdOverride="platform" /><Location /></MemoryRouter>);
    expect(screen.getByText("Chat team visibile")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link",{name:"Apri conversazioni"}));
    expect(screen.getByText("Conversazioni visibili")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab",{name:"Team"}),{button:0,ctrlKey:false});
    expect(screen.getByText("Chat team visibile")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("?channel_id=demo");
  });
});
