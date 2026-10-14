import {
  orderDetailLocation,
  type OrderDetailSection,
} from "@/lib/orders/detailNavigation";
export function calendarOrderSectionLocation(
  orderId: string,
  section: OrderDetailSection,
) {
  return {
    pathname: `/azienda/ordini/${encodeURIComponent(orderId)}`,
    ...orderDetailLocation("", {
      tab: section === "section-sal" ? "finanza" : "cantiere",
      section,
    }),
  };
}
/** Collegamento unico dal calendario alle lavorazioni della commessa. */
export function calendarWorkLocation(orderId: string) {
  return {
    pathname: `/azienda/ordini/${encodeURIComponent(orderId)}`,
    ...orderDetailLocation("", {
      tab: "cantiere",
      cantiereView: "lavorazioni",
    }),
  };
}
