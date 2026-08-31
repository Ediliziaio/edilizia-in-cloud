/**
 * ServizioAedixFields — selettori "Servizio" + "Pacchetto" per le opportunita'
 * del CRM di piattaforma (AEDIX).
 *
 * Taggare l'opportunita' sul servizio venduto e' il primo anello della catena:
 * opportunita' -> (vinta) -> cliente-servizio -> incassi mensili -> Fatturato
 * Servizi. Senza il tag, la conversione a fine trattativa deve indovinare cosa
 * si stesse vendendo.
 *
 * Da renderizzare SOLO dentro il CRM di piattaforma (vedi useIsPlatformCrm): le
 * tabelle aedix_* hanno RLS super-admin e a un'azienda cliente non direbbero
 * nulla.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Package } from "lucide-react";

const sb = () => supabase as any;

export const NESSUN_SERVIZIO = "__nessuno__";

export interface ProductLineLite {
  id: string;
  nome: string;
  colore: string | null;
  tipo: string | null;
  ricorrenza: string | null;
}
export interface PackageLite {
  id: string;
  nome: string;
  prezzo: number | null;
  ricorrenza: string | null;
  product_line_id: string;
}

/** Servizi attivi a catalogo. Condivisa fra i dialog: una sola fetch in cache. */
export function useAedixProductLines(enabled: boolean) {
  return useQuery<ProductLineLite[]>({
    queryKey: ["aedix-product-lines", "attivi"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("aedix_product_lines")
        .select("id,nome,colore,tipo,ricorrenza")
        .eq("attivo", true)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as ProductLineLite[];
    },
  });
}

/** Pacchetti del servizio selezionato. */
export function useAedixPackages(productLineId: string | null | undefined, enabled: boolean) {
  return useQuery<PackageLite[]>({
    queryKey: ["aedix-product-packages", productLineId],
    enabled: enabled && !!productLineId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("aedix_product_packages")
        .select("id,nome,prezzo,ricorrenza,product_line_id")
        .eq("product_line_id", productLineId)
        .eq("attivo", true)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as PackageLite[];
    },
  });
}

interface Props {
  productLineId: string | null;
  packageId: string | null;
  onChange: (next: { productLineId: string | null; packageId: string | null }) => void;
  disabled?: boolean;
}

export function ServizioAedixFields({ productLineId, packageId, onChange, disabled }: Props) {
  const { data: lines = [] } = useAedixProductLines(true);
  const { data: packages = [] } = useAedixPackages(productLineId, true);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" /> Servizio venduto
        </Label>
        <Select
          value={productLineId ?? NESSUN_SERVIZIO}
          disabled={disabled}
          onValueChange={(v) =>
            // Cambiando servizio il pacchetto precedente non ha piu' senso.
            onChange({ productLineId: v === NESSUN_SERVIZIO ? null : v, packageId: null })
          }
        >
          <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NESSUN_SERVIZIO}>Nessuno</SelectItem>
            {lines.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-2">
                  {l.colore && <span className="h-2 w-2 rounded-full" style={{ background: l.colore }} />}
                  {l.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Pacchetto</Label>
        <Select
          value={packageId ?? NESSUN_SERVIZIO}
          disabled={disabled || !productLineId}
          onValueChange={(v) => onChange({ productLineId, packageId: v === NESSUN_SERVIZIO ? null : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={!productLineId ? "Scegli prima il servizio" : "Nessuno"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NESSUN_SERVIZIO}>Nessuno</SelectItem>
            {packages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
                {p.prezzo ? ` — ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(p.prezzo))}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {productLineId && packages.length === 0 && (
          <p className="text-[10px] text-muted-foreground">
            Nessun pacchetto per questo servizio. Si creano in Impostazioni → Prodotti &amp; Servizi.
          </p>
        )}
      </div>
    </div>
  );
}
