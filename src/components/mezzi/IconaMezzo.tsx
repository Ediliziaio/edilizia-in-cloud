import { Car, Caravan, Forklift, Package, Tractor, Truck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONE: Record<string, LucideIcon> = {
  furgone: Truck,
  autocarro: Truck,
  autovettura: Car,
  macchina_movimento_terra: Tractor,
  sollevamento: Forklift,
  rimorchio: Caravan,
  attrezzatura: Wrench,
};

export function IconaMezzo({ tipo, className }: { tipo: string; className?: string }) {
  const Icona = ICONE[tipo] ?? Package;
  return <Icona className={className} aria-hidden="true" />;
}
