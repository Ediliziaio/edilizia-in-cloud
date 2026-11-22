import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttrezzaturaGiornoMappa, MezzoGiornoMappa } from "@/integrations/supabase/appDatabase";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { coordinate } from "../../../../shared/mappa-operativa/calcoli";
import type { Pin } from "./CartografiaOperativa";

export type FiltroMezzi = "tutti" | "stradali" | "cantiere" | "attrezzature";
export type FiltriMezzi = { tipoMezzi: FiltroMezzi; cercaMezzi: string };
const nessunMezzo: MezzoGiornoMappa[] = [];

export function useMezziMappa(company: string | undefined, utente: string | undefined, giorno: string, personale: boolean, enabled: boolean) {
  return useQuery({
    queryKey: [...viaggiKey(company ?? ""), "mappa-mezzi", utente, personale, giorno],
    enabled: Boolean(company && utente && enabled),
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const args = { p_company: company!, p_giorno: giorno, p_personale: personale };
      const pagine = async <T extends { id: string }>(carica: (dopo?: string) => PromiseLike<T[]>) => {
        const righe: T[] = [];
        let dopo: string | undefined;
        do {
          const pagina = await carica(dopo);
          righe.push(...pagina);
          dopo = pagina.length === 250 ? pagina.at(-1)?.id : undefined;
        } while (dopo);
        return righe;
      };
      const [esitoMezzi, esitoAttrezzature] = await Promise.allSettled([
        pagine<MezzoGiornoMappa>(async dopo => {
          const { data, error } = await supabase.rpc("mappa_mezzi_giorno", { ...args, p_dopo: dopo }).abortSignal(signal);
          if (error) throw error;
          return data;
        }),
        pagine<AttrezzaturaGiornoMappa>(async dopo => {
          const { data, error } = await supabase.rpc("mappa_attrezzature_giorno", { ...args, p_dopo: dopo }).abortSignal(signal);
          if (error?.code === "PGRST202") return [];
          if (error) throw error;
          return data;
        }),
      ]);
      if (esitoMezzi.status === "rejected" && esitoAttrezzature.status === "rejected") throw esitoMezzi.reason;
      const mezzi = esitoMezzi.status === "fulfilled" ? esitoMezzi.value : [];
      const attrezzature = esitoAttrezzature.status === "fulfilled" ? esitoAttrezzature.value : [];
      const perId = new Map(mezzi.map(m => [m.id, m]));
      for (const a of attrezzature) {
        const veicolo = a.a_bordo_id ? perId.get(a.a_bordo_id)?.posizione : null;
        const caricatoIl = a.posizione?.quando;
        const posizioneVeicolo = veicolo?.quando && caricatoIl && Date.parse(veicolo.quando) >= Date.parse(caricatoIl)
          && coordinate(veicolo.lat, veicolo.lng) ? veicolo : undefined;
        const posizione = posizioneVeicolo && a.posizione
          ? { ...a.posizione, lat: posizioneVeicolo.lat, lng: posizioneVeicolo.lng } : a.posizione;
        mezzi.push({ id: a.id, nome: a.nome, tipo: "attrezzatura", targa: null, stradale: false,
          unita: a.unita_misura ?? "", posizione, posizioneVeicolo, attrezzatura: a, destinazione: null, destinazioni: 0,
          metri_registrati: null, metri_stimati: null, fonti_registrate: [], contaore: null, contaore_aggiornato: null });
      }
      return {
        elenco: mezzi.sort((a, b) => a.nome.localeCompare(b.nome, "it") || a.id.localeCompare(b.id)),
        nonDisponibile: esitoMezzi.status === "rejected" ? "Mezzi" : esitoAttrezzature.status === "rejected" ? "Attrezzature" : null,
      };
    },
  });
}

export function usePinMezziMappa(data: MezzoGiornoMappa[] | undefined, { tipoMezzi, cercaMezzi }: FiltriMezzi, selezionato: string | null) {
  const mezzi = data ?? nessunMezzo;
  const visibili = useMemo(() => {
    const cerca = cercaMezzi.trim().toLocaleLowerCase("it");
    return mezzi.filter(m => (tipoMezzi === "tutti" || tipoMezzi === (m.attrezzatura ? "attrezzature" : m.stradale ? "stradali" : "cantiere")) &&
      (!cerca || [m.nome, m.targa, m.posizione?.nome, m.destinazione?.nome, m.attrezzatura?.custode, m.posizioneVeicolo?.nome]
        .some(s => s?.toLocaleLowerCase("it").includes(cerca))));
  }, [mezzi, tipoMezzi, cercaMezzi]);
  const pin = useMemo<Pin[]>(() => visibili.flatMap(m => {
    const posizione = coordinate(m.posizione?.lat, m.posizione?.lng);
    const meta = coordinate(m.destinazione?.lat, m.destinazione?.lng);
    const punti: Pin[] = [];
    if (posizione) punti.push({ id: m.id, titolo: `${m.nome} · ${m.posizione?.nome}`, punto: posizione, tipo: m.attrezzatura ? "attrezzatura" : "mezzo", etichetta: m.attrezzatura ? "A" : m.stradale ? "M" : "C" });
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
