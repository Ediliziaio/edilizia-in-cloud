import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Confronto from "@/pages/Confronto";
import SoftwareComparisonGuide from "@/components/marketing/SoftwareComparisonGuide";
import { softwareComparisons, teamsystemGuide, primusGuide } from "@/lib/marketing/softwareComparisons";

vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav aria-label="Navigazione" /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));
let root: Root | undefined;
let host: HTMLDivElement | undefined;
function mount(page: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => root!.render(<MemoryRouter>{page}</MemoryRouter>));
}
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = undefined; });
const schema = (id: string) => JSON.parse(document.getElementById(id)!.textContent!);

describe("confronti per scegliere un gestionale", () => {
  it("rende accessibili tutti i confronti e li descrive nello stesso ordine nel JSON-LD", () => {
    mount(<Confronto />);
    const list = schema("jsonld-itemlist-confronto");
    expect(host!.querySelector('nav[aria-label="Percorsi di confronto"] a')?.getAttribute("href")).toBe("/blog/edilizia-in-cloud-vs-pillar/");
    expect(host!.querySelector("#confronto-pillar")?.textContent).toContain("Segui anche la vendita");
    expect(list.itemListElement[0].name).toBe("Edilizia in Cloud vs Pillar");
    expect(list.numberOfItems).toBe(softwareComparisons.length);
    expect(list.itemListElement.map((item: { url: string }) => new URL(item.url).pathname)).toEqual(softwareComparisons.map((guide) => guide.path));
    for (const guide of softwareComparisons) expect(host!.querySelector(`a[href="${guide.path}"]`)).not.toBeNull();
    for (const anchor of ["excel", "erp", "commercialista", "concorrenti"]) expect(document.getElementById(anchor)).not.toBeNull();
    const faq = schema("jsonld-faq-confronto");
    for (const entry of faq.mainEntity) expect(host!.textContent).toContain(entry.acceptedAnswer.text);
  });
  it.each([teamsystemGuide, primusGuide])("$competitor: spiega gli effetti operativi e mantiene le fonti finali", (guide) => {
    mount(<SoftwareComparisonGuide guide={guide} />);
    expect(host!.querySelectorAll("h1")).toHaveLength(1);
    for (const row of guide.rows) expect(host!.textContent).toContain(row.impact);
    for (const source of guide.sources) expect(host!.querySelector(`a[href="${source.url}"]`)).not.toBeNull();
    expect(host!.querySelector('a[href="/demo/"]')).not.toBeNull();
    expect(host!.textContent).toContain("parte interessata");
    expect(schema("jsonld-comparison-faq").mainEntity.map((entry: { name: string }) => entry.name)).toEqual(guide.faqs.map((faq) => faq.q));
    expect(host!.textContent).not.toContain("€380");
  });
});
