import { describe, expect, it } from "vitest";
import {
  ORDER_DETAIL_TABS,
  orderDetailLocation,
  resolveOrderDetailDestination,
  resolveCantiereView,
  resolveEconomiaView,
  resolveMaterialiView,
} from "@/lib/orders/detailNavigation";

describe("Navigazione unica della commessa", () => {
  it("recupera le sezioni nei vecchi link di controllo e le elimina cambiando vista", () => {
    expect(resolveOrderDetailDestination("?tab=finanza&section=section-attivita")).toEqual({ tab: "cantiere", section: "section-attivita" });
    expect(resolveOrderDetailDestination("?section=section-attivita", "#section-pagamenti")).toEqual({ tab: "finanza", section: "section-pagamenti" });
    const next = orderDetailLocation("?tab=cantiere&section=section-attivita&source=agenda", { tab: "finanza", economiaView: "pagamenti" });
    expect(new URLSearchParams(next.search).has("section")).toBe(false);
    expect(resolveOrderDetailDestination(next.search, next.hash)).toEqual({ tab: "finanza" });
  });
  it.each([
    ["section-pagamenti", "pagamenti"], ["section-ritenute", "pagamenti"], ["esposizione-commessa", "pagamenti"],
    ["section-sal", "documenti"], ["section-varianti", "documenti"], ["section-fatturazione", "documenti"], ["section-conto-economico", "margini"],
  ])("l'ancora economica %s monta la vista corretta", (section, view) => {
    expect(resolveEconomiaView("?vista_economia=altra", section)).toBe(view);
    expect(resolveOrderDetailDestination("?tab=panoramica", `#${section}`).tab).toBe("finanza");
  });
  it.each([["section-materiali", "articoli"], ["section-acquisti", "acquisti"], ["section-magazzino", "magazzino"]])("l'ancora materiali %s monta la vista corretta", (section, view) => {
    expect(resolveMaterialiView("?vista_materiali=altra", section)).toBe(view);
    expect(resolveOrderDetailDestination("?tab=panoramica", `#${section}`).tab).toBe("articoli");
  });
  it("conserva le viste in URL senza perdere i parametri estranei", () => {
    expect(orderDetailLocation("?source=agenda", { tab: "finanza", economiaView: "pagamenti" })).toEqual({ search: "?source=agenda&tab=finanza&vista_economia=pagamenti", hash: "" });
    expect(orderDetailLocation("?source=agenda", { tab: "articoli", materialiView: "acquisti" })).toEqual({ search: "?source=agenda&tab=articoli&vista_materiali=acquisti", hash: "" });
    expect(resolveEconomiaView("?vista_economia=__proto__")).toBe("margini");
    expect(resolveMaterialiView("?vista_materiali=constructor")).toBe("articoli");
  });
  it.each(ORDER_DETAIL_TABS)(
    "mantiene il valore storico $value",
    ({ value }) => {
      expect(resolveOrderDetailDestination(`?tab=${value}`)).toEqual({
        tab: value,
      });
    },
  );
  it.each([
    ["stato", "panoramica", "section-stato"],
    ["campo", "cantiere", "section-rapportini"],
    ["sal", "finanza", "section-sal"],
    ["assistenza", "panoramica", "section-assistenza"],
    ["altro", "panoramica", "section-note"],
    ["ritenute", "finanza", "section-ritenute"],
    ["manodopera", "cantiere", "section-lavorazioni"],
    ["documenti", "panoramica", "section-documenti"],
  ])("recupera il link legacy %s", (legacy, tab, section) => {
    expect(resolveOrderDetailDestination(`?tab=${legacy}`)).toEqual({
      tab,
      section,
    });
  });
  it("dà priorità all'ancora nota per montare il pannello corretto", () => {
    expect(
      resolveOrderDetailDestination("?tab=panoramica", "#section-pagamenti"),
    ).toEqual({ tab: "finanza", section: "section-pagamenti" });
  });
  it.each(["", "?tab=sconosciuto", "?tab=__proto__", "?tab=constructor"])(
    "gestisce input inattesi: %s",
    (search) => {
      expect(resolveOrderDetailDestination(search, "#non-esiste")).toEqual({
        tab: "panoramica",
      });
    },
  );
  it("conserva i parametri estranei e rimuove l'ancora della tab precedente", () => {
    expect(
      orderDetailLocation("?source=notifica&tab=campo", { tab: "articoli" }),
    ).toEqual({ search: "?source=notifica&tab=articoli", hash: "" });
  });
  it("non permette una destinazione incoerente con l'ancora", () => {
    expect(
      orderDetailLocation("", { tab: "panoramica", section: "section-sal" }),
    ).toEqual({ search: "?tab=finanza", hash: "#section-sal" });
  });
  it("il link diretto prevale sulla vista ricordata", () => {
    expect(resolveCantiereView("?vista_cantiere=squadra", "section-rapportini")).toBe("diario");
    expect(resolveCantiereView("?vista_cantiere=diario", "section-attivita")).toBe("lavorazioni");
    expect(resolveCantiereView("?vista_cantiere=__proto__")).toBe("lavorazioni");
    expect(resolveCantiereView("?vista_cantiere=collaudo")).toBe("collaudo");
  });
  it("cambia vista eliminando l'ancora precedente senza perdere i parametri estranei", () => {
    expect(orderDetailLocation("?tab=cantiere&source=agenda", {tab:"cantiere",cantiereView:"diario"})).toEqual({search:"?tab=cantiere&source=agenda&vista_cantiere=diario",hash:""});
  });
});
