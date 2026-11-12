import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OfficeProfileSelector } from "@/components/users/OfficeProfileSelector";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import { applyOfficeProfile } from "@/lib/users/officeProfiles";
afterEach(cleanup);

describe("applicazione esplicita di un modello", () => {
 it("la selezione mostra l'impatto senza modificare i diritti; annulla non chiama il salvataggio", () => {
  const change = vi.fn();
  render(<OfficeProfileSelector permissions={applyOfficeProfile(DEFAULT_PERMISSIONS,"tecnico")} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Prepara i permessi da un modello"), {target:{value:"hr"}});
  expect(screen.getByText("Anteprima: Personale e HR")).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Annulla scelta"}));
  expect(screen.queryByText("Anteprima: Personale e HR")).toBeNull();
  expect(change).not.toHaveBeenCalled();
 });
 it("applica solo alla bozza e conserva i vincoli di accesso personalizzati", () => {
  const change = vi.fn();
  render(<OfficeProfileSelector permissions={{...applyOfficeProfile(DEFAULT_PERMISSIONS,"tecnico"), sola_lettura:true, only_my_warehouse:true, pipeline_visibili:["pipeline-1"]}} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Prepara i permessi da un modello"), {target:{value:"ordini"}});
  fireEvent.click(screen.getByRole("button",{name:"Applica alla bozza"}));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0]).toMatchObject({office_profile:"ordini",can_view_costs:true,can_view_employees:false,can_view_margins:false,sola_lettura:true,only_my_warehouse:true,pipeline_visibili:["pipeline-1"]});
 });
 it("segnala un modello personalizzato invece di dichiararlo ancora identico al preset", () => {
  render(<OfficeProfileSelector permissions={{...applyOfficeProfile(DEFAULT_PERMISSIONS,"tecnico"),can_view_costs:true}} onChange={vi.fn()} />);
  expect(screen.getByText(/Ufficio tecnico · personalizzato/)).toBeInTheDocument();
 });
 it("un accesso in sola consultazione non può applicare un modello", () => {
  const change=vi.fn();
  function Harness(){const [p,setP]=useState(DEFAULT_PERMISSIONS);return <OfficeProfileSelector permissions={p} disabled onChange={v=>{change(v);setP(v)}}/>}
  render(<Harness/>);
  expect(screen.getByLabelText("Prepara i permessi da un modello")).toBeDisabled();
  expect(screen.getByRole("button",{name:"Applica alla bozza"})).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
 });
 it("l'anteprima non promette modifiche vietate dalla sola lettura",()=>{
  render(<OfficeProfileSelector permissions={{...DEFAULT_PERMISSIONS,can_view_orders:true,can_edit_orders:false,sola_lettura:true}} onChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Prepara i permessi da un modello"),{target:{value:"ordini"}});
  expect(screen.queryByText(/Abilita: Ordini e Commesse: modifica/)).toBeNull();
  expect(screen.queryByText(/Abilita: Gestione acquisti/)).toBeNull();
 });
});
