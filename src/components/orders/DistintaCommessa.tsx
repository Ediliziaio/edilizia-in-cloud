// src/components/orders/DistintaCommessa.tsx
// La tabella delle lavorazioni con i dati che legge da sola: IVA, squadre dell'azienda, assegnazione.
import type { ComponentProps } from "react";
import { DistintaLavorazioni } from "@/components/orders/DistintaLavorazioni";
import { useIvaCommessa } from "@/components/orders/IvaCommessa";
import { useAssegnaAlleFasi } from "@/hooks/useAssegnaAlleFasi";
import { useSquadre } from "@/hooks/useOperai";

type Props = Omit<ComponentProps<typeof DistintaLavorazioni>, "iva" | "squadre" | "onAssegna" | "assegnaInCorso"> & { orderId: string };

export function DistintaCommessa({ orderId, ...resto }: Props) {
  const { data: iva } = useIvaCommessa(orderId, resto.vedeVenduto);
  const assegna = useAssegnaAlleFasi(orderId);
  const { data: squadre = [] } = useSquadre(resto.puoSquadre);
  return (
    <DistintaLavorazioni
      {...resto}
      iva={iva}
      squadre={squadre.map((s) => ({ id: s.id, nome: s.nome }))}
      assegnaInCorso={assegna.isPending}
      onAssegna={(scelte, fatto) => assegna.mutate(scelte, { onSuccess: fatto })}
    />
  );
}
