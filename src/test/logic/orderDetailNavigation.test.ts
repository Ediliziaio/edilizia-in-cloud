import { describe, expect, it } from "vitest";
import {
  ORDER_DETAIL_TABS,
  orderDetailLocation,
  resolveOrderDetailDestination,
} from "@/lib/orders/detailNavigation";

describe("Navigazione unica della commessa", () => {
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
    ["sal", "cantiere", "section-sal"],
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
    ).toEqual({ search: "?tab=cantiere", hash: "#section-sal" });
  });
});
