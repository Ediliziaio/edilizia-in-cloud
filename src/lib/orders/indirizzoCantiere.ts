import type { AddressData } from "@/components/shared/AddressAutocomplete";

export function indirizzoCantiereDaTesto(testo: string): AddressData {
  return { address_line: testo, formatted_address: testo, address_city: "", address_postal_code: "", address_province: "", address_country: "IT", address_notes: "", lat: null, lng: null, place_id: "" };
}

export function testoIndirizzoCantiere(a: AddressData): string {
  return (a.formatted_address || [a.address_line, [a.address_postal_code, a.address_city].filter(Boolean).join(" "), a.address_province].filter(Boolean).join(", ")).trim();
}

/** Le bozze precedenti conservano solo il testo: non inventare coordinate. */
export function indirizzoCantiereDaBozza(raw: unknown, testo: string): AddressData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const address = indirizzoCantiereDaTesto(testo);
  for (const key of ["address_line", "formatted_address", "address_city", "address_postal_code", "address_province", "address_country", "address_notes", "place_id"] as const) {
    if (typeof obj[key] === "string") address[key] = obj[key];
  }
  if (testoIndirizzoCantiere(address) !== testo.trim()) return null;
  if (typeof obj.lat === "number" && Number.isFinite(obj.lat) && Math.abs(obj.lat) <= 90 && typeof obj.lng === "number" && Number.isFinite(obj.lng) && Math.abs(obj.lng) <= 180) {
    address.lat = obj.lat; address.lng = obj.lng;
  }
  return address;
}

export function coordinateIndirizzoCantiere(a: AddressData | null, testo: string): { work_lat: number; work_lng: number } | Record<string, never> {
  const valid = indirizzoCantiereDaBozza(a, testo);
  return valid?.lat != null && valid.lng != null ? { work_lat: valid.lat, work_lng: valid.lng } : {};
}
