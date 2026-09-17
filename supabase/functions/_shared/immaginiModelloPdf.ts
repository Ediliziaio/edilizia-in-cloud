/**
 * Immagini dei modelli PDF di Serramenti e Fotovoltaico: logo, copertina, foto
 * «Chi siamo», foto delle recensioni, galleria lavori.
 *
 * Gli editor caricano questi file nei bucket privati `sr-progetti` e
 * `fv-progetti`. Fino al 17/09/2026 nel modello finiva un link firmato valido un
 * anno: passato l'anno, logo e foto sparivano da preventivi e anteprime senza
 * che nessuno avesse toccato niente.
 *
 * Un indirizzo che non scade si poteva ottenere in due modi:
 *   1. copiare le immagini in un bucket pubblico e salvare l'URL pubblico;
 *   2. salvare il percorso del file e firmarlo al momento dell'uso (PDF,
 *      anteprima, miniatura nell'editor).
 * Si usa il secondo, l'unico che non espone file privati. Aprire `sr-progetti` e
 * `fv-progetti` renderebbe pubblici anche rilievi, foto di cantiere e preventivi
 * dei clienti; una copia pubblica delle sole immagini dei modelli resterebbe
 * leggibile per sempre da chiunque abbia l'indirizzo, anche dopo che l'azienda
 * l'ha tolta dal modello. Con il percorso il file resta dov'è: lo firma chi può
 * già leggerlo (le policy dello storage guardano la cartella dell'azienda)
 * oppure la edge function che genera il documento, e questa solo per i file
 * nella cartella dell'azienda del modello.
 *
 * Nel modello si salva "<bucket>/<percorso>", per esempio
 * "sr-progetti/<azienda>/template-logos/<uuid>.png": lo stesso formato che
 * src/lib/storage/fileRiservati.ts già riconosce.
 *
 * Modulo puro, senza import: lo usano sia il browser sia le edge function.
 */

/** Bucket privati in cui gli editor caricano le immagini dei modelli. */
export const BUCKET_IMMAGINI_MODELLO = ["sr-progetti", "fv-progetti"] as const;

/** Dove stanno le immagini in una riga di modello. */
export interface CampiImmagine {
  /** Colonne che contengono un'immagine. */
  singoli: readonly string[];
  /** Colonne con una lista di oggetti: [colonna, campo dell'immagine in ogni oggetto]. */
  liste: readonly (readonly [string, string])[];
}

/** sr_template_pdf */
export const CAMPI_IMMAGINE_SERRAMENTI: CampiImmagine = {
  singoli: ["logo_url", "chi_siamo_foto_url", "pdf_cover_image_url", "pdf_cover_logo_url"],
  liste: [["testimonianze_default", "foto_url"], ["gallery_lavori", "url"]],
};

/** fv_template_pdf */
export const CAMPI_IMMAGINE_FOTOVOLTAICO: CampiImmagine = {
  singoli: ["logo_url", "pdf_cover_image_url", "pdf_cover_logo_url", "foto_team_url"],
  liste: [["recensioni", "foto_url"], ["gallery_lavori", "url"], ["cantieri_galleria", "foto_url"]],
};

export interface FileModello {
  bucket: string;
  path: string;
}

/** Il valore da salvare nel modello per un file appena caricato. */
export function riferimentoImmagine(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}

/**
 * Bucket e percorso di un'immagine dei modelli. Accetta il riferimento
 * "<bucket>/<percorso>" e i link dello storage, firmati o pubblici. Per tutto il
 * resto (immagini di serie, indirizzi esterni, data URI, altri bucket) torna null.
 */
export function riconosciImmagineModello(valore: unknown): FileModello | null {
  if (typeof valore !== "string") return null;
  const v = valore.trim();
  if (!v) return null;
  let bucket: string;
  let path: string;
  const link = v.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (link) {
    try {
      bucket = decodeURIComponent(link[1]);
      path = decodeURIComponent(link[2]);
    } catch {
      return null;
    }
  } else {
    // Un riferimento non ha schema (https:, data:, blob:) e non comincia con "/"
    // come le immagini di serie (/templates/...).
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("/")) return null;
    const i = v.indexOf("/");
    if (i <= 0) return null;
    bucket = v.slice(0, i);
    path = v.slice(i + 1);
  }
  if (!path || !(BUCKET_IMMAGINI_MODELLO as readonly string[]).includes(bucket)) return null;
  return { bucket, path };
}

/** true per un riferimento "<bucket>/<percorso>": così com'è non si apre, va firmato. */
export function eRiferimentoImmagine(valore: unknown): boolean {
  return riconosciImmagineModello(valore) !== null && !/^https?:\/\//i.test(String(valore).trim());
}

/** Le immagini presenti nel modello, senza vuoti né doppioni. */
export function immaginiDelModello(modello: unknown, campi: CampiImmagine): string[] {
  if (!modello || typeof modello !== "object") return [];
  const riga = modello as Record<string, unknown>;
  const valori = new Set<string>();
  const aggiungi = (v: unknown) => {
    if (typeof v === "string" && v.trim()) valori.add(v.trim());
  };
  for (const campo of campi.singoli) aggiungi(riga[campo]);
  for (const [lista, campo] of campi.liste) {
    const voci = riga[lista];
    if (!Array.isArray(voci)) continue;
    for (const voce of voci) {
      if (voce && typeof voce === "object") aggiungi((voce as Record<string, unknown>)[campo]);
    }
  }
  return [...valori];
}

/**
 * Copia del modello con ogni immagine passata da `trasforma`. Se niente cambia
 * torna lo stesso oggetto; le colonne e le voci non toccate restano le stesse.
 */
export function sostituisciImmagini<T>(
  modello: T,
  campi: CampiImmagine,
  trasforma: (valore: string) => string | null,
): T {
  if (!modello || typeof modello !== "object") return modello;
  const riga = modello as Record<string, unknown>;
  const cambi: Record<string, unknown> = {};
  let cambiato = false;

  for (const campo of campi.singoli) {
    const v = riga[campo];
    if (typeof v !== "string" || !v.trim()) continue;
    const nuovo = trasforma(v.trim());
    if (nuovo === v) continue;
    cambi[campo] = nuovo;
    cambiato = true;
  }

  for (const [lista, campo] of campi.liste) {
    const voci = riga[lista];
    if (!Array.isArray(voci)) continue;
    let listaCambiata = false;
    const nuove = voci.map((voce) => {
      if (!voce || typeof voce !== "object") return voce;
      const v = (voce as Record<string, unknown>)[campo];
      if (typeof v !== "string" || !v.trim()) return voce;
      const nuovo = trasforma(v.trim());
      if (nuovo === v) return voce;
      listaCambiata = true;
      return { ...(voce as Record<string, unknown>), [campo]: nuovo };
    });
    if (listaCambiata) {
      cambi[lista] = nuove;
      cambiato = true;
    }
  }

  return cambiato ? ({ ...riga, ...cambi } as T) : modello;
}

/**
 * Prima di salvare: un link (firmato o pubblico) a un'immagine dei modelli torna
 * riferimento. Solo per i file nella cartella dell'azienda del modello: un file
 * di un'altra azienda l'utente non lo potrebbe firmare, perché le policy
 * guardano la cartella, e sparirebbe subito. Quel link resta com'è finché
 * l'immagine non viene ricaricata.
 */
export function normalizzaImmaginiModello<T>(modello: T, campi: CampiImmagine, companyId: string): T {
  return sostituisciImmagini(modello, campi, (valore) => {
    const file = riconosciImmagineModello(valore);
    if (!file || !companyId || !file.path.startsWith(`${companyId}/`)) return valore;
    return riferimentoImmagine(file.bucket, file.path);
  });
}

/** Firma i percorsi di un bucket: per ogni percorso il link, o null se non si può. */
export type Firmatario = (bucket: string, percorsi: string[]) => Promise<(string | null)[]>;

/**
 * Copia del modello con le immagini dei bucket privati firmate da capo, con una
 * chiamata per bucket.
 *
 * Con `companyId` si firmano solo i file nella cartella di quell'azienda. Le
 * edge function firmano col service role, che legge tutto: senza questo
 * controllo un riferimento a una cartella altrui, scritto nel proprio modello,
 * basterebbe per leggere i file di un'altra azienda.
 *
 * Un riferimento che non si riesce a firmare diventa null, così scatta il
 * ripiego (per esempio il logo dell'azienda). Un vecchio link firmato che non si
 * riesce a rifirmare resta com'è: fino alla scadenza funziona ancora.
 */
export async function firmaImmaginiModello<T>(
  modello: T,
  campi: CampiImmagine,
  firma: Firmatario,
  companyId?: string | null,
): Promise<T> {
  const perBucket = new Map<string, { valore: string; path: string }[]>();
  for (const valore of immaginiDelModello(modello, campi)) {
    const file = riconosciImmagineModello(valore);
    if (!file) continue;
    if (companyId && !file.path.startsWith(`${companyId}/`)) continue;
    const voci = perBucket.get(file.bucket) ?? [];
    voci.push({ valore, path: file.path });
    perBucket.set(file.bucket, voci);
  }

  const firmati = new Map<string, string>();
  await Promise.all(
    Array.from(perBucket.entries()).map(async ([bucket, voci]) => {
      try {
        const link = await firma(bucket, voci.map((v) => v.path));
        voci.forEach((v, i) => {
          const l = link[i];
          if (l) firmati.set(v.valore, l);
        });
      } catch {
        // restano i valori di partenza
      }
    }),
  );

  return sostituisciImmagini(modello, campi, (valore) =>
    firmati.get(valore) ?? (eRiferimentoImmagine(valore) ? null : valore),
  );
}

/** Il minimo del client Supabase che serve per firmare: vale nel browser e nelle edge function. */
export interface ClientStorage {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        percorsi: string[],
        scadenzaSecondi: number,
      ): Promise<{ data: { path: string | null; signedUrl: string | null }[] | null; error: unknown }>;
    };
  };
}

/** Firmatario sullo storage di Supabase, con la scadenza indicata. */
export function firmatarioStorage(client: ClientStorage, scadenzaSecondi: number): Firmatario {
  return async (bucket, percorsi) => {
    const { data, error } = await client.storage.from(bucket).createSignedUrls(percorsi, scadenzaSecondi);
    if (error || !data) return percorsi.map((): string | null => null);
    // Un esito per percorso: un file mancante o non leggibile ha signedUrl null.
    return percorsi.map((p, i) => (data.find((r) => r.path === p) ?? data[i])?.signedUrl ?? null);
  };
}
