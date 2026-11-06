import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
vi.mock("@/hooks/useSediAnalytics",()=>({useSediList:()=>({data:[{id:"s1",nome:"Sede demo",tipo:"ufficio",attiva:true},{id:"s2",nome:"Magazzino demo",tipo:"magazzino",attiva:true}]})}));
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { useSedeFilter } from "@/store/sedeFilterStore";
beforeEach(()=>useSedeFilter.getState().resetFiltri());afterEach(()=>{cleanup();vi.useRealTimers();});
describe("Pulsanti dei filtri sedi",()=>{
 it("i tre tipi sono pulsanti selezionabili e deselezionabili",()=>{
  render(<MemoryRouter><SedeFilterBar/></MemoryRouter>);
  for(const tipo of ["showroom","magazzino","ufficio"]){
   const b=screen.getByRole("button",{name:tipo,exact:true});fireEvent.click(b);
   expect(b).toHaveAttribute("aria-pressed","true");expect(useSedeFilter.getState().tipoSede).toBe(tipo);
   fireEvent.click(b);expect(b).toHaveAttribute("aria-pressed","false");
  }
 });
 it("Reset rimuove insieme tipo e selezione sedi",()=>{
  useSedeFilter.setState({sediSelezionate:["s1"],tipoSede:"ufficio"});
  render(<MemoryRouter><SedeFilterBar/></MemoryRouter>);
  fireEvent.click(screen.getByRole("button",{name:"Reset",exact:true}));
  expect(useSedeFilter.getState().sediSelezionate).toEqual([]);expect(useSedeFilter.getState().tipoSede).toBeNull();
  expect(screen.getByRole("button",{name:"Tutte le sedi"})).toBeTruthy();
 });
 it("il periodo ripristinato inizia dal primo gennaio locale",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,0,1,0,30));useSedeFilter.getState().resetFiltri();
  expect(useSedeFilter.getState().periodo).toEqual({da:"2026-01-01",a:"2026-01-01"});
 });
});

it("il menu permette selezione multipla e ritorno a tutte le sedi",async()=>{
 render(<MemoryRouter><SedeFilterBar/></MemoryRouter>);
 fireEvent.keyDown(screen.getByRole("button",{name:"Tutte le sedi"}),{key:"ArrowDown"});
 fireEvent.click(await screen.findByRole("menuitemcheckbox",{name:/Sede demo/}));
 expect(useSedeFilter.getState().sediSelezionate).toEqual(["s1"]);
 fireEvent.keyDown(screen.getByRole("button",{name:"Sede demo"}),{key:"ArrowDown"});
 fireEvent.click(await screen.findByRole("menuitemcheckbox",{name:/Magazzino demo/}));
 expect(useSedeFilter.getState().sediSelezionate).toEqual(["s1","s2"]);
 fireEvent.keyDown(screen.getByRole("button",{name:"2 sedi"}),{key:"ArrowDown"});
 fireEvent.click(await screen.findByRole("menuitemcheckbox",{name:"Tutte le sedi",exact:true}));
 expect(useSedeFilter.getState().sediSelezionate).toEqual([]);
});
