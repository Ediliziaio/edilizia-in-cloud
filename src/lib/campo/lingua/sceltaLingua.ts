/**
 * Quale lingua mostrare, e dove salvarla (piano 2026-11-23-lingua-piattaforma, punto 2).
 *
 * Ordine: lingua del PROFILO (vale su ogni dispositivo) → scelta salvata su QUESTO dispositivo → italiano.
 * La lingua del telefono non conta: per default tutto resta in italiano (regola del founder).
 *
 * Sul dispositivo teniamo anche chi ha scelto, quando, e se il profilo l'ha già ricevuta:
 * - scelta fatta senza rete → resta valida qui e si riprova a salvarla sul profilo;
 * - profilo letto dalla copia sul dispositivo (più vecchia della scelta) → non rimette la lingua di prima;
 * - scelta fatta su un altro telefono (profilo più recente) → vince il profilo.
 */
import { linguaDa, type CodiceLingua } from "./lingue";

/** Formato storico (sessione di collaudo, 23/11/2026): solo il codice, senza utente. Si legge ancora. */
export const CHIAVE_STORICA = "campo-lingua";
export const CHIAVE_SCELTA = "campo-lingua-scelta";

export interface SceltaDispositivo {
  codice: CodiceLingua;
  /** Chi l'ha fatta; null = scelta storica di cui non sappiamo l'utente. */
  utente: string | null;
  /** Quando (ISO). */
  quando: string;
  /** Il profilo l'ha già ricevuta. */
  salvata: boolean;
}

export interface ProfiloLingua {
  id: string;
  lingua?: string | null;
  updated_at?: string | null;
}

export interface Decisione {
  codice: CodiceLingua;
  /** Lingua da scrivere sul profilo (null = niente da fare). */
  daSalvare: CodiceLingua | null;
  /** Nuovo stato da tenere sul dispositivo (undefined = lascia com'è). */
  dispositivo?: SceltaDispositivo;
}

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export function decidiLingua(profilo: ProfiloLingua | null, locale: SceltaDispositivo | null): Decisione {
  // Profilo non ancora arrivato: si mostra quello che sa il dispositivo.
  if (!profilo) return { codice: locale?.codice ?? "it", daSalvare: null };

  const mia = locale && (locale.utente === profilo.id || locale.utente === null) ? locale : null;
  const delProfilo = linguaDa(profilo.lingua)?.codice ?? null;

  // Scelta fatta qui e non ancora arrivata al profilo: vale, e si riprova a salvarla.
  if (mia && !mia.salvata) {
    return mia.codice === delProfilo
      ? { codice: mia.codice, daSalvare: null, dispositivo: { ...mia, utente: profilo.id, salvata: true } }
      : { codice: mia.codice, daSalvare: mia.codice };
  }

  if (!delProfilo) {
    // Il profilo non ha ancora una lingua: se questo dispositivo ne ha una, gliela portiamo.
    // Già salvata = la copia del profilo che abbiamo è vecchia (scritta prima del salvataggio): non si risalva,
    // altrimenti ogni salvataggio ne chiamerebbe un altro, all'infinito.
    if (mia) return { codice: mia.codice, daSalvare: mia.salvata && mia.utente === profilo.id ? null : mia.codice };
    return { codice: "it", daSalvare: null };
  }

  // Copia del profilo più vecchia della scelta fatta qui (il profilo letto dalla cache del telefono).
  if (mia && mia.codice !== delProfilo && ms(mia.quando) > ms(profilo.updated_at)) {
    return { codice: mia.codice, daSalvare: null };
  }

  const dispositivo: SceltaDispositivo | undefined =
    mia && mia.codice === delProfilo && mia.utente === profilo.id
      ? undefined
      : { codice: delProfilo, utente: profilo.id, quando: profilo.updated_at ?? new Date(0).toISOString(), salvata: true };
  return { codice: delProfilo, daSalvare: null, dispositivo };
}

export function leggiSceltaDispositivo(archivio: Pick<Storage, "getItem"> | null = sicuro()): SceltaDispositivo | null {
  if (!archivio) return null;
  try {
    const grezza = archivio.getItem(CHIAVE_SCELTA);
    let s: Partial<SceltaDispositivo> | null = null;
    // Valore rovinato: si ripiega sul formato storico qui sotto invece di perdere la scelta.
    try { s = grezza ? (JSON.parse(grezza) as Partial<SceltaDispositivo>) : null; } catch { s = null; }
    if (s) {
      const codice = linguaDa(s.codice)?.codice;
      if (codice) {
        return {
          codice,
          utente: typeof s.utente === "string" ? s.utente : null,
          quando: typeof s.quando === "string" ? s.quando : new Date(0).toISOString(),
          salvata: s.salvata === true,
        };
      }
    }
    const storica = linguaDa(archivio.getItem(CHIAVE_STORICA))?.codice;
    return storica ? { codice: storica, utente: null, quando: new Date(0).toISOString(), salvata: false } : null;
  } catch {
    return null;
  }
}

export function scriviSceltaDispositivo(s: SceltaDispositivo, archivio: Pick<Storage, "setItem"> | null = sicuro()) {
  if (!archivio) return;
  try {
    archivio.setItem(CHIAVE_SCELTA, JSON.stringify(s));
    archivio.setItem(CHIAVE_STORICA, s.codice);
  } catch { /* memoria piena o navigazione privata: resta per questa sessione */ }
}

function sicuro(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
