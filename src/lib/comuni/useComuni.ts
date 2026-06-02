// Ricerca comuni italiani (ISTAT) per autocompletamento indirizzi.
// Dataset: public/data/comuni-istat.json — [nome, cap, sigla, provincia, regione]
// Caricato lazy (al primo uso), poi in cache per tutta la sessione.

import { useCallback, useState } from "react";

export interface Comune {
  comune: string;
  cap: string;
  provinciaSigla: string;
  provincia: string;
  regione: string;
}

type RawRow = [string, string, string, string, string];

let cache: RawRow[] | null = null;
let loadPromise: Promise<RawRow[]> | null = null;

async function loadComuni(): Promise<RawRow[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = fetch("/data/comuni-istat.json")
      .then((r) => {
        if (!r.ok) throw new Error("Impossibile caricare l'elenco dei comuni");
        return r.json();
      })
      .then((data: RawRow[]) => {
        cache = data;
        return data;
      })
      .catch((e) => {
        loadPromise = null;
        throw e;
      });
  }
  return loadPromise;
}

const toComune = (r: RawRow): Comune => ({
  comune: r[0],
  cap: r[1],
  provinciaSigla: r[2],
  provincia: r[3],
  regione: r[4],
});

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function useComuni() {
  const [rows, setRows] = useState<RawRow[] | null>(cache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Avvia il caricamento del dataset (idempotente). */
  const ensure = useCallback(() => {
    if (cache) {
      if (!rows) setRows(cache);
      return;
    }
    setLoading(true);
    setError(null);
    loadComuni()
      .then((d) => setRows(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Errore di caricamento"))
      .finally(() => setLoading(false));
  }, [rows]);

  /** Ricerca per nome comune o per CAP. Ritorna fino a `limit` risultati. */
  const search = useCallback(
    (query: string, limit = 8): Comune[] => {
      const data = rows ?? cache;
      if (!data) return [];
      const raw = query.trim();
      if (!raw) return [];

      // Query numerica → ricerca per CAP (prefix match)
      if (/^\d{2,5}$/.test(raw)) {
        const out: Comune[] = [];
        for (const r of data) {
          if (r[1].startsWith(raw)) {
            out.push(toComune(r));
            if (out.length >= limit) break;
          }
        }
        return out;
      }

      const q = norm(raw);
      if (q.length < 2) return [];
      const starts: Comune[] = [];
      const contains: Comune[] = [];
      for (const r of data) {
        const n = norm(r[0]);
        if (n.startsWith(q)) {
          if (starts.length < limit) starts.push(toComune(r));
        } else if (n.includes(q) && contains.length < limit) {
          contains.push(toComune(r));
        }
        if (starts.length >= limit) break;
      }
      return [...starts, ...contains].slice(0, limit);
    },
    [rows],
  );

  return { ensure, search, loading, error, ready: !!(rows ?? cache) };
}
