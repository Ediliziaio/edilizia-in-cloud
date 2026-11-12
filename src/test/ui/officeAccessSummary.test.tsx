import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfficeAccessSummary } from "@/components/users/OfficeAccessSummary";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
afterEach(cleanup);
describe("riepilogo permessi ufficio",()=>{
 it("mostra i diritti salvati e avvisa sulle dipendenze degli acquisti",()=>{
  render(<OfficeAccessSummary permissions={{...DEFAULT_PERMISSIONS,can_manage_purchasing:true}} />);
  expect(screen.getByRole("region",{name:"Riepilogo accessi alla commessa"})).toBeTruthy();
  expect(screen.getByText("Dati individuali del personale")).toBeTruthy();
  expect(screen.getByText("Gestire gli acquisti concede anche la lettura dei costi.")).toBeTruthy();
 });
 it("un ruolo amministratore non viene rappresentato come staff limitato",()=>{
  render(<OfficeAccessSummary permissions={DEFAULT_PERMISSIONS} administrator />);
  expect(screen.getByText("Amministratore aziendale")).toBeTruthy();
  expect(screen.queryByText("Non consentito")).toBeNull();
 });
 it("non presenta come aziendale l'accesso di cantiere assegnato",()=>{
  render(<OfficeAccessSummary permissions={{...DEFAULT_PERMISSIONS,can_view_orders:true}} fieldAccess />);
  expect(screen.getAllByText("Cantieri assegnati").length).toBeGreaterThan(0);
  expect(screen.queryByText("Tutte in azienda")).toBeNull();
 });
});
