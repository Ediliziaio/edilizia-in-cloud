import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MezzoGiornoMappa } from "@/integrations/supabase/appDatabase";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { coordinate } from "../../../../shared/mappa-operativa/calcoli";
import type { Pin } from "./CartografiaOperativa";

export type FiltroMezzi = "tutti" | "stradali" | "cantiere";
export type FiltriMezzi = { tipoMezzi: FiltroMezzi; cercaMezzi: string };
const nessunMezzo: MezzoGiornoMappa[] = [];

export function useMezziMappa(company: string | undefined, utente: string | undefined, giorno: string, personale: boolean, enabled: boolean) {
  return useQuery({
    queryKey: [...viaggiKey(company ?? ""), "mappa-mezzi", utente, personale, giorno],
    enabled: Boolean(company && utente && enabled),
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      let dopo: string | undefined;
      const mezzi: MezzoGiornoMappa[] = [];
      do {
        const { data, error } = await supabase.rpc("mappa_mezzi_giorno", {
          p_company: company!, p_giorno: giorno, p_personale: personale, p_dopo: dopo,
        }).abortSignal(signal);
        if (error) throw error;
        mezzi.push(...data);
        dopo = data.length === 250 ? data.at(-1)?.id : undefined;
      } while (dopo);
      return mezzi.sort((a, b) => a.nome.localeCompare(b.nome, "it") || a.id.localeCompare(b.id));
    },
  });
}

export function usePinMezziMappa(data: MezzoGiornoMappa[] | undefined, { tipoMezzi, cercaMezzi }: FiltriMezzi, selezionato: string | null) {
  const mezzi = data ?? nessunMezzo;
  const visibili = useMemo(() => {
    const cerca = cercaMezzi.trim().toLocaleLowerCase("it");
    return mezzi.filter(m => (tipoMezzi === "tutti" || m.stradale === (tipoMezzi === "stradali")) &&
      (!cerca || [m.nome, m.targa, m.posizione?.nome, m.destinazione?.nome]
        .some(s => s?.toLocaleLowerCase("it").includes(cerca))));
  }, [mezzi, tipoMezzi, cercaMezzi]);
  const pin = useMemo<Pin[]>(() => visibili.flatMap(m => {
    const posizione = coordinate(m.posizione?.lat, m.posizione?.lng);
    const meta = coordinate(m.destinazione?.lat, m.destinazione?.lng);
    const punti: Pin[] = [];
    if (posizione) punti.push({ id: m.id, titolo: `${m.nome} · ${m.posizione?.nome}`, punto: posizione, tipo: "mezzo", etichetta: m.stradale ? "M" : "C" });
    const stessa = posizione && meta && posizione.lat === meta.lat && posizione.lng === meta.lng;
    if (meta && (!posizione || (m.id === selezionato && !stessa))) {
      punti.push({ id: posizione ? `meta:${m.id}` : m.id, titolo: `${m.nome} · Destinazione prevista · ${m.destinazione?.nome}`,
        punto: meta, tipo: "destinazione_mezzo", etichetta: "D" });
    }
    return punti;
  }), [visibili, selezionato]);
  const inMappa = visibili.filter(m => coordinate(m.posizione?.lat, m.posizione?.lng) || coordinate(m.destinazione?.lat, m.destinazione?.lng)).length;
  return { visibili, pin, inMappa };
}
