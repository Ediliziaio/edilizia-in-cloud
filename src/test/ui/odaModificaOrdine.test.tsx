import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({status:"confermato", canEdit:true, update:vi.fn().mockResolvedValue(undefined)}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany:{id:"vulcano",name:"Impresa Vulcano"}})}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canEditOrders:m.canEdit})}));
vi.mock("@/hooks/useListinoFornitore", () => ({useVociListinoFornitore: () => ({voci:[] as unknown[]})}));
vi.mock("@tanstack/react-query", () => ({useQuery: () => ({data:[] as unknown[]}),useQueryClient: () => ({invalidateQueries:vi.fn()})}));
vi.mock("@/hooks/usePurchaseOrders", () => ({
 usePurchaseOrders: () => ({updateStatus:{mutate:vi.fn()},update:{mutate:vi.fn(),mutateAsync:vi.fn()}}),
 usePurchaseOrderDetail: () => ({order:{id:"oda-vulcano",status:m.status,oda_number:"ODA-2026-0005",issue_date:"2026-11-06",suppliers:{name:"KLASSE SRL"},subtotal:5198.4,total:6342.05},isLoading:false,isItemsLoading:false,
 items:[{id:"riga",description:"TEGOLE SELECTUM NERO 12 BANCALI",quantity:2880,quantity_received:0,unit_price:1.81,unit_of_measure:"pz",discount_percent:0,vat_rate:22,line_total:5198.4}],
 addItem:{mutate:vi.fn()},updateItem:{mutateAsync:m.update},deleteItem:{mutate:vi.fn()}})
}));
vi.mock("@/components/orders/ArticleCombobox", () => ({ArticleCombobox: () => <span>Selettore articolo</span>}));
vi.mock("@/components/orders/OdaNoteCard", () => ({OdaNoteCard: (): null => null}));
vi.mock("@/components/orders/VerifyPurchaseOrderDialog", () => ({VerifyPurchaseOrderDialog: (): null => null}));
vi.mock("@/components/orders/VerificationHistoryCard", () => ({VerificationHistoryCard: (): null => null}));
vi.mock("@/components/ddt/NewDDTDialog", () => ({NewDDTDialog: (): null => null}));
vi.mock("@/components/ddt/DDTStatusBadge", () => ({DDTStatusBadge: (): null => null}));
vi.mock("@/components/orders/OdaAccountingCard", () => ({OdaAccountingCard: (): null => null}));
vi.mock("@/components/orders/OdaImpattoCommessaCard", () => ({OdaImpattoCommessaCard: (): null => null}));
vi.mock("@/components/orders/CommessaCombobox", () => ({CommessaCombobox: (): null => null}));
vi.mock("@/components/orders/OdaDocumentoCard", () => ({OdaDocumentoCard: (): null => null}));
vi.mock("@/components/documentiOperativi/DocumentoInvioDialog", () => ({DocumentoInvioDialog: (): null => null}));
import PurchaseOrderDetail from "@/pages/azienda/PurchaseOrderDetail";
afterEach(cleanup);
beforeEach(() => {m.status="confermato";m.canEdit=true;m.update.mockClear();});
const apri = () => render(<MemoryRouter><PurchaseOrderDetail /></MemoryRouter>);
it.each(["inviato","confermato","parziale"])("l’ordine %s si può modificare dal dettaglio senza tornare in bozza", (status) => {
 m.status = status;
 apri();
 expect(screen.queryByLabelText("Quantità", {exact:true})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", {name:"Modifica ordine"}));
 expect(screen.getByLabelText("Quantità", {exact:true})).toHaveValue(2880);
 expect(screen.getByLabelText("Prezzo di acquisto")).toHaveValue(1.81);
 expect(screen.getByRole("button", {name:/Aggiungi/})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", {name:"Termina modifica"}));
 expect(screen.queryByLabelText("Quantità", {exact:true})).not.toBeInTheDocument();
});
it.each(["ricevuto","annullato"])("l’ordine %s resta chiuso", (status) => {
 m.status=status;apri();expect(screen.queryByRole("button",{name:"Modifica ordine"})).not.toBeInTheDocument();
});
it("chi non ha il permesso di modifica non può attivare l’editor", () => {
 m.canEdit=false;apri();expect(screen.queryByRole("button",{name:"Modifica ordine"})).not.toBeInTheDocument();
});

it("l’ordine della segnalazione salva la nuova quantità dalla schermata di dettaglio", async () => {
 apri();fireEvent.click(screen.getByRole("button",{name:"Modifica ordine"}));
 const field=screen.getByLabelText("Quantità",{exact:true});
 fireEvent.change(field,{target:{value:"3000"}});fireEvent.blur(field);
 await waitFor(() => expect(m.update).toHaveBeenCalledWith({id:"riga",updates:{quantity:3000}}));
});
