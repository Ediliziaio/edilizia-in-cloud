import { useCallback, useState } from "react";

/**
 * Grafici aperti o chiusi, ricordati per pagina in questo browser.
 *
 * Le pagine di analisi partono con i grafici chiusi: in cima ci vanno le
 * cose da fare e le tabelle, i grafici si aprono con il bottone «Grafici».
 * Se il browser non lascia scrivere (finestra privata, dati bloccati) la
 * scelta vale solo finché la pagina resta aperta.
 */
export function useGraficiRicordati(chiave: string, iniziale = false): [boolean, (aperti: boolean) => void] {
  const nome = `grafici-aperti:${chiave}`;
  const [aperti, setAperti] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(nome);
      return v == null ? iniziale : v === "1";
    } catch {
      return iniziale;
    }
  });
  const cambia = useCallback(
    (v: boolean) => {
      setAperti(v);
      try {
        localStorage.setItem(nome, v ? "1" : "0");
      } catch {
        /* la scelta resta per questa visita */
      }
    },
    [nome],
  );
  return [aperti, cambia];
}
