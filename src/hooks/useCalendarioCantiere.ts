// src/hooks/useCalendarioCantiere.ts
import { useMemo, useState } from "react";
import { useHrFestivita } from "@/hooks/useHrFestivita";
import { italianHolidays, projectHoliday } from "@/lib/personale/calendarioLavorativo";
import { calendarioCantiere, type GiornoLavorativo } from "@/lib/orders/sottofasi";

export interface CalendarioCantiere {
  lavorativo: GiornoLavorativo;
  sabato: boolean;
  setSabato: (sabato: boolean) => void;
}

const CHIAVE_SABATO = "eic.cantiere.sabato";

/**
 * I giorni di lavoro per pianificare le sottofasi (31/10/2026): dal lunedì al
 * venerdì, il sabato se chi pianifica lo sceglie (resta ricordato su questo
 * dispositivo), mai la domenica né le chiusure dell'azienda (Personale →
 * festività) o, se l'azienda non ne ha, le feste nazionali.
 */
export function useCalendarioCantiere(): CalendarioCantiere {
  const { data: festivita } = useHrFestivita();
  const [sabato, impostaSabato] = useState(() => {
    try { return localStorage.getItem(CHIAVE_SABATO) === "1"; } catch { return false; }
  });
  const lavorativo = useMemo(() => {
    const anno = new Date().getFullYear();
    const chiusure = new Set<string>();
    for (let y = anno - 1; y <= anno + 2; y++) {
      const elenco = festivita?.length ? festivita : italianHolidays(y);
      for (const h of elenco) {
        const p = projectHoliday(h, y);
        if (p) chiusure.add(p.projectedDate);
      }
    }
    return calendarioCantiere({ sabato, chiusure });
  }, [festivita, sabato]);
  const setSabato = (v: boolean) => {
    impostaSabato(v);
    try { localStorage.setItem(CHIAVE_SABATO, v ? "1" : "0"); } catch { /* il sabato vale solo per questa visita */ }
  };
  return { lavorativo, sabato, setSabato };
}
