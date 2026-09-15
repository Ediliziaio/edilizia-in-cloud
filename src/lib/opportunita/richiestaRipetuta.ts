/**
 * Il contatto ha già fatto richiesta?
 *
 * Un lead Meta che compila di nuovo il modulo rientra nello stesso flusso e
 * torna in «Da Chiamare» come se fosse nuovo: chi chiama non sapeva che quella
 * persona era già passata (BeMade, 15/09). La scheda lo segnala con un'icona.
 *
 * I dati arrivano da opportunita_schede: quante volte ha compilato di nuovo il
 * modulo (registro «lead_form_submission»), l'ultima volta, e quante altre
 * opportunità ha lo stesso contatto.
 */

export interface RichiestaRipetuta {
  richieste?: number | null;
  ultima?: string | null;
  altre_opportunita?: number | null;
}

function dataOra(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export function richiestaRipetutaPresente(r: RichiestaRipetuta | null | undefined): boolean {
  return Number(r?.richieste ?? 0) > 0 || Number(r?.altre_opportunita ?? 0) > 0;
}

/** Etichetta corta sulla scheda. */
export function etichettaRichiestaRipetuta(r: RichiestaRipetuta | null | undefined): string | null {
  if (!richiestaRipetutaPresente(r)) return null;
  const volte = Number(r?.richieste ?? 0);
  if (volte > 1) return `${volte}× di nuovo`;
  if (volte === 1) return "Di nuovo";
  return "Già passato";
}

/** Spiegazione completa, per il tooltip. */
export function testoRichiestaRipetuta(r: RichiestaRipetuta | null | undefined): string | null {
  if (!richiestaRipetutaPresente(r)) return null;
  const volte = Number(r?.richieste ?? 0);
  const altre = Number(r?.altre_opportunita ?? 0);
  const parti: string[] = [];
  if (volte > 0) {
    const quando = dataOra(r?.ultima);
    parti.push(
      `Ha già fatto richiesta: ha compilato di nuovo il modulo ${volte === 1 ? "1 volta" : `${volte} volte`}` +
        (quando ? `, l'ultima il ${quando}.` : "."),
    );
  }
  if (altre > 0) {
    const opp = altre === 1 ? "un'altra opportunità" : `altre ${altre} opportunità`;
    parti.push(volte > 0 ? `Ha ${opp}.` : `Contatto già passato: ha ${opp}.`);
  }
  return parti.join(" ");
}
