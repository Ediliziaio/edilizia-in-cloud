import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FleetMapCanvas } from "@/components/fleet/FleetMapCanvas";
const state=vi.hoisted(()=>({create:vi.fn(),remove:vi.fn(),tooltip:vi.fn(),clear:vi.fn()}));
vi.mock("leaflet",()=>({default:{
 map:()=>{state.create();const map={setView:()=>map,on:vi.fn(),off:vi.fn(),remove:state.remove,fitBounds:vi.fn(),invalidateSize:vi.fn()};return map;},
 tileLayer:()=>{const tile={addTo:()=>tile,on:vi.fn(),off:vi.fn()};return tile;},
 layerGroup:()=>{const layer={addTo:()=>layer,clearLayers:state.clear};return layer;},
 circleMarker:()=>({bindTooltip:state.tooltip,on:vi.fn(),addTo:vi.fn()}),
 circle:()=>({bindTooltip:state.tooltip,on:vi.fn(),addTo:vi.fn()}),
 polyline:()=>({addTo:vi.fn()}),latLngBounds:()=>({}),
}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("cartografia Fleet senza provider React 19",()=>{
 it("makes no tile/map request until explicit loading and removes the map on unmount",()=>{
  const view=render(<FleetMapCanvas points={[{lat:45,lng:9,label:"Test"}]} />);
  expect(state.create).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Carica cartografia"}));
  expect(state.create).toHaveBeenCalledTimes(1);expect(screen.getByRole("region",{name:"Mappa GPS"})).toBeTruthy();
  view.unmount();expect(state.remove).toHaveBeenCalledTimes(1);
 });
 it("uses text nodes for labels and discards invalid coordinates",()=>{
  render(<FleetMapCanvas points={[{lat:45,lng:9,label:'<img src=x onerror=alert(1)>'},{lat:999,lng:0,label:"Invalid"}]} />);
  fireEvent.click(screen.getByRole("button",{name:"Carica cartografia"}));
  expect(state.tooltip).toHaveBeenCalledTimes(1);
  const node=state.tooltip.mock.calls[0][0] as HTMLElement;
  expect(node.querySelector("img")).toBeNull();expect(node.textContent).toContain("<img");
 });
});
