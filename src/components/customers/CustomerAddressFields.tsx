import { Building2, HardHat, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddressAutocomplete, { type AddressData, emptyAddress } from "@/components/shared/AddressAutocomplete";

/**
 * Coppia di indirizzi del cliente: fatturazione + cantiere.
 *
 * Riusa il componente condiviso `AddressAutocomplete` (ricerca indirizzo via
 * edge fn `maps-proxy` → auto-compila via/città/CAP/provincia/lat/lng) per
 * entrambi. Espone anche gli helper di mapping verso le colonne `profiles`,
 * così il dialog inline (Nuova Commessa) e il form della pagina Clienti
 * scrivono gli stessi campi in modo coerente.
 */

export interface CustomerAddresses {
  billing: AddressData;
  site: AddressData;
}

export const makeEmptyCustomerAddresses = (): CustomerAddresses => ({
  billing: { ...emptyAddress },
  site: { ...emptyAddress },
});

/** Vero se l'AddressData ha almeno un campo valorizzato. */
export function hasAnyAddress(a: AddressData): boolean {
  return !!(a.address_line || a.address_city || a.address_postal_code || a.formatted_address);
}

/** Colonne `profiles` dell'indirizzo di FATTURAZIONE. */
export function billingToProfileFields(a: AddressData) {
  return {
    address: a.address_line || null,
    city: a.address_city || null,
    postal_code: a.address_postal_code || null,
    province: a.address_province ? a.address_province.toUpperCase() : null,
    country: a.address_country || "IT",
    address_lat: a.lat,
    address_lng: a.lng,
  };
}

/** Colonne `profiles` dell'indirizzo CANTIERE. */
export function siteToProfileFields(a: AddressData) {
  return {
    site_address: a.address_line || null,
    site_city: a.address_city || null,
    site_postal_code: a.address_postal_code || null,
    site_province: a.address_province ? a.address_province.toUpperCase() : null,
    site_lat: a.lat,
    site_lng: a.lng,
  };
}

type ProfileLike = {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  country?: string | null;
  address_lat?: number | null;
  address_lng?: number | null;
  site_address?: string | null;
  site_city?: string | null;
  site_postal_code?: string | null;
  site_province?: string | null;
  site_lat?: number | null;
  site_lng?: number | null;
};

/** Ricostruisce AddressData dai campi profilo (per i form di modifica). */
export function profileToBillingAddress(p: ProfileLike): AddressData {
  return {
    ...emptyAddress,
    address_line: p.address ?? "",
    address_city: p.city ?? "",
    address_postal_code: p.postal_code ?? "",
    address_province: p.province ?? "",
    address_country: p.country ?? "IT",
    lat: p.address_lat ?? null,
    lng: p.address_lng ?? null,
    formatted_address: [p.address, p.city, p.postal_code].filter(Boolean).join(", "),
  };
}

export function profileToSiteAddress(p: ProfileLike): AddressData {
  return {
    ...emptyAddress,
    address_line: p.site_address ?? "",
    address_city: p.site_city ?? "",
    address_postal_code: p.site_postal_code ?? "",
    address_province: p.site_province ?? "",
    lat: p.site_lat ?? null,
    lng: p.site_lng ?? null,
    formatted_address: [p.site_address, p.site_city, p.site_postal_code].filter(Boolean).join(", "),
  };
}

interface Props {
  value: CustomerAddresses;
  onChange: (v: CustomerAddresses) => void;
}

export function CustomerAddressFields({ value, onChange }: Props) {
  const copyBillingToSite = () => {
    onChange({
      ...value,
      site: {
        ...value.billing,
        address_notes: value.site.address_notes || value.billing.address_notes,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Fatturazione */}
      <div className="rounded-lg border p-3 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          Dati anagrafici / fatturazione
        </div>
        <AddressAutocomplete
          label="Indirizzo di fatturazione"
          searchPlaceholder="Cerca indirizzo fatturazione..."
          value={value.billing}
          onChange={(billing) => onChange({ ...value, billing })}
        />
      </div>

      {/* Cantiere */}
      <div className="rounded-lg border p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <HardHat className="h-3.5 w-3.5" />
            Cantiere / luogo dei lavori
          </div>
          {hasAnyAddress(value.billing) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={copyBillingToSite}
            >
              <Copy className="h-3 w-3" />
              Uguale a fatturazione
            </Button>
          )}
        </div>
        <AddressAutocomplete
          label="Indirizzo cantiere"
          searchPlaceholder="Cerca indirizzo cantiere..."
          value={value.site}
          onChange={(site) => onChange({ ...value, site })}
        />
      </div>
    </div>
  );
}

export default CustomerAddressFields;
