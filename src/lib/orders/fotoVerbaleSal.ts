/** Le foto di cantiere per il verbale SAL: prima quelle fatte nel periodo del verbale. */
export interface FotoScelta { id: string; taken_at: string }

/** Il periodo va dal giorno dopo l'emissione del SAL precedente al giorno di questo (Roma, giorni interi). */
export function fotoNelPeriodo<T extends FotoScelta>(foto: readonly T[], dal: string | null | undefined, al: string | null | undefined): { periodo: T[]; altre: T[] } {
  const giorno = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const dentro = (f: T) => {
    const g = giorno(f.taken_at);
    return (!dal || g > dal) && (!al || g <= al);
  };
  return { periodo: foto.filter(dentro), altre: foto.filter((f) => !dentro(f)) };
}

/** Una riga, un allegato. */
export const allegatiDaTesto = (testo: string) => testo.split(/\r?\n/).map((r) => r.trim()).filter(Boolean).slice(0, 20);

export const MASSIMO_FOTO_VERBALE = 12;
