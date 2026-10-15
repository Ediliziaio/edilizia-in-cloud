import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CompanyExpandedRow } from "@/components/admin/company/CompanyExpandedRow";
vi.mock("@/components/admin/company/CompanyTagsCell", () => ({ CompanyTagsCell: (): null => null }));
afterEach(cleanup);
const open = (limit: number | null) => render(<MemoryRouter><CompanyExpandedRow company={{id:"demo",status:"active"}} planLimits={{max_orders:limit,max_users:limit}} orderStats={{count:0,totalValue:0,lastOrderDate:null}} tags={[]} /></MemoryRouter>);
describe("Limiti nel riepilogo azienda", () => {
  it("distingue un limite assente da un piano illimitato", () => {
    open(null);
    expect(screen.getAllByText(/Limite non specificato/)).toHaveLength(2);
    expect(screen.queryByText(/Illimitati/)).not.toBeInTheDocument();
  });
  it("mostra illimitati senza rapporti negativi", () => {
    open(-1);
    expect(screen.getAllByText(/Illimitati/)).toHaveLength(2);
    expect(screen.queryByText(/\/-1/)).not.toBeInTheDocument();
  });
  it("non presenta il limite zero come illimitato", () => {
    open(0);
    expect(screen.getAllByText(/0 · bloccati/)).toHaveLength(2);
    expect(screen.queryByText(/Illimitati/)).not.toBeInTheDocument();
  });
});
