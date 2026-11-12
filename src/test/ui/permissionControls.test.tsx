import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OrderDataPermissions } from "@/components/users/OrderDataPermissions";
import { PipelineVisibilitySelector } from "@/components/users/PipelineVisibilitySelector";
import { PermissionsChangeReview } from "@/components/users/PermissionsChangeReview";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import { applyOfficeProfile } from "@/lib/users/officeProfiles";
afterEach(cleanup);

describe("dati economici espliciti",()=>{
 it("permette lo stato degli incassi senza venduto, costi o margini",()=>{
  const change=vi.fn();
  render(<OrderDataPermissions permissions={{...DEFAULT_PERMISSIONS,can_view_order_amounts:false,can_view_order_payment_status:true}} onChange={change} onFindPurchasing={vi.fn()}/>);
  expect(screen.getByRole("switch",{name:"Stato degli incassi"})).toHaveAttribute("aria-checked","true");
  expect(screen.getByRole("switch",{name:"Venduto e importi"})).toHaveAttribute("aria-checked","false");
  fireEvent.click(screen.getByRole("switch",{name:"Stato degli incassi"}));
  expect(change).toHaveBeenCalledWith("can_view_order_payment_status",false);
 });
 it("mostra i costi inclusi negli acquisti e non offre un falso interruttore per nasconderli",()=>{
  const find=vi.fn(),change=vi.fn();
  render(<OrderDataPermissions permissions={{...DEFAULT_PERMISSIONS,can_manage_purchasing:true,can_view_costs:false}} onChange={change} onFindPurchasing={find}/>);
  expect(screen.getByRole("switch",{name:"Costi"})).toBeDisabled();
  expect(screen.getByRole("switch",{name:"Costi"})).toHaveAttribute("aria-checked","true");
  fireEvent.click(screen.getByRole("button",{name:"Trova Gestione acquisti"}));
  expect(find).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
 });
 it("il venduto include lo stato degli incassi, anche senza il flag aggiuntivo",()=>{
  render(<OrderDataPermissions permissions={DEFAULT_PERMISSIONS} onChange={vi.fn()} onFindPurchasing={vi.fn()}/>);
  expect(screen.getByRole("switch",{name:"Stato degli incassi"})).toBeDisabled();
  expect(screen.getByRole("switch",{name:"Stato degli incassi"})).toHaveAttribute("aria-checked","true");
 });
});
const pipelines=[{id:"a",name:"Installazioni"},{id:"b",name:"Manutenzioni"}];
describe("pipeline senza ambiguità",()=>{
 it("distingue tutte, comprese le future, da un elenco esplicito; non allarga l'accesso togliendo l'ultima spunta",()=>{
  const changed=vi.fn();
  function Harness(){const [ids,setIds]=useState<string[]>([]);return <PipelineVisibilitySelector pipelines={pipelines} selected={ids} onChange={v=>{changed(v);setIds(v)}}/>}
  render(<Harness/>);
  expect(screen.getByRole("radio",{name:"Tutte le pipeline, anche quelle future"})).toHaveAttribute("aria-checked","true");
  fireEvent.click(screen.getByRole("radio",{name:"Solo le pipeline selezionate"}));
  expect(changed).toHaveBeenLastCalledWith(["a","b"]);
  fireEvent.click(screen.getByRole("checkbox",{name:"Manutenzioni"}));
  expect(changed).toHaveBeenLastCalledWith(["a"]);
  expect(screen.getByRole("checkbox",{name:"Installazioni"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox",{name:"Installazioni"}));
  expect(changed).toHaveBeenLastCalledWith(["a"]);
  fireEvent.click(screen.getByRole("radio",{name:"Tutte le pipeline, anche quelle future"}));
  expect(changed).toHaveBeenLastCalledWith([]);
 });
 it("non descrive come tutte le pipeline una restrizione rimasta su pipeline eliminate",()=>{
  const changed=vi.fn();
  render(<PipelineVisibilitySelector pipelines={pipelines} selected={["removed"]} onChange={changed}/>);
  expect(screen.getByRole("radio",{name:"Solo le pipeline selezionate"})).toHaveAttribute("aria-checked","true");
  expect(screen.getByRole("status")).toHaveTextContent("non sono più disponibili");
  expect(changed).not.toHaveBeenCalled();
 });
});
describe("revisione prima del salvataggio",()=>{
 it("confronta i valori salvati con quelli in bozza e risolve i nomi delle pipeline",()=>{
  const before=applyOfficeProfile(DEFAULT_PERMISSIONS,"tecnico");
  render(<PermissionsChangeReview before={before} after={{...before,can_view_costs:true,pipeline_visibili:["b"]}} pipelines={pipelines}/>);
  fireEvent.click(screen.getByRole("button",{name:/Rivedi modifiche/}));
  expect(screen.getByRole("dialog")).toHaveTextContent("Costi");
  expect(screen.getByRole("dialog")).toHaveTextContent("Manutenzioni");
  expect(screen.getByRole("dialog")).toHaveTextContent("Tutte le pipeline, anche future");
  expect(screen.getByRole("dialog")).toHaveTextContent("Chiudere questa anteprima non salva");
 });
});
