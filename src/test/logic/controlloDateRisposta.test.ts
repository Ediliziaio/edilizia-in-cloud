import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  controllaDateRisposta,
  dateNelTesto,
  giornoSettimanaDi,
} from "../../../supabase/functions/_shared/controlloDateRisposta";

/**
 * Il controllo delle date nelle risposte dell'assistente WhatsApp dei lead.
 * Il caso vero: Il Bagno Group, 25/11/2026, Mary Cofano. L'appuntamento era
 * venerdì 27 novembre alle 14:30; l'assistente ha scritto prima «giovedì è il
 * 27 novembre», poi «confermata per giovedì 26 novembre», e il calendario è
 * rimasto al 27. La cliente ha aspettato giovedì.
 */

const OGGI = "2026-11-25"; // mercoledì
const APP = { data: "2026-11-27", ora: "14:30" }; // venerdì

describe("il giorno della settimana deve essere quello vero", () => {
  it("blocca il messaggio che ha fatto il danno: «giovedì 27 novembre»", () => {
    const esito = controllaDateRisposta(
      "Ti chiedo scusa per la confusione. Oggi è mercoledì 25 novembre. Giovedì è il 27 novembre. La tua chiamata è fissata per giovedì 27 novembre alle 14:30. È corretto?",
      OGGI,
      APP,
    );
    expect(esito.ok).toBe(false);
    expect(esito.motivo).toContain("venerdì");
  });

  it("lascia passare «venerdì 27 novembre», che è giusto", () => {
    expect(
      controllaDateRisposta("La tua chiamata è fissata per venerdì 27 novembre alle 14:30.", OGGI, APP).ok,
    ).toBe(true);
  });

  it("vale anche senza accento e senza mese", () => {
    expect(controllaDateRisposta("Ci sentiamo giovedi 27 alle 14:30.", OGGI, APP).ok).toBe(false);
    expect(controllaDateRisposta("Ci sentiamo venerdi 27 alle 14:30.", OGGI, APP).ok).toBe(true);
  });

  it("vale anche con le barre", () => {
    expect(controllaDateRisposta("Ti aspetto giovedì 27/11 alle 14:30.", OGGI, APP).ok).toBe(false);
    expect(controllaDateRisposta("Ti aspetto venerdì 27/11 alle 14:30.", OGGI, APP).ok).toBe(true);
  });

  it("non serve l'appuntamento: una data incoerente è sbagliata comunque", () => {
    expect(controllaDateRisposta("Ti va bene lunedì 27 novembre alle 10?", OGGI, null).ok).toBe(false);
  });
});

describe("non si conferma una data diversa da quella in calendario", () => {
  it("blocca il secondo messaggio: «confermata per giovedì 26 novembre»", () => {
    const esito = controllaDateRisposta(
      "Hai perfettamente ragione, scusa! Giovedì è il 26 novembre. La tua chiamata è confermata per giovedì 26 novembre alle 14:30. A presto!",
      OGGI,
      APP,
    );
    expect(esito.ok).toBe(false);
  });

  it("blocca anche quando il giorno della settimana torna ma la data no", () => {
    // Giovedì 26 novembre 2026 è davvero giovedì: solo il confronto col
    // calendario lo smaschera.
    expect(giornoSettimanaDi(2026, 11, 26)).toBe(4);
    const esito = controllaDateRisposta("Confermata per giovedì 26 novembre alle 14:30.", OGGI, APP);
    expect(esito.ok).toBe(false);
    expect(esito.motivo).toContain("27 novembre");
  });

  it("lascia proporre altri orari: una proposta non è una conferma", () => {
    expect(
      controllaDateRisposta("Posso proporti giovedì 26 alle 10 oppure lunedì 30 alle 15, quale preferisci?", OGGI, APP).ok,
    ).toBe(true);
  });

  it("lascia passare la conferma sulla data giusta", () => {
    expect(controllaDateRisposta("Confermata per venerdì 27 novembre alle 14:30.", OGGI, APP).ok).toBe(true);
  });

  it("senza appuntamento in calendario non blocca una conferma", () => {
    // Appena fissato un appuntamento, chi chiama rilegge il calendario: se lì
    // non c'è niente, non c'è niente da contraddire.
    expect(controllaDateRisposta("Confermata per giovedì 26 novembre alle 14:30.", OGGI, null).ok).toBe(true);
  });
});

describe("non blocca i messaggi normali", () => {
  it.each([
    "Perfetto, grazie! Ti ricontatto appena ho novità.",
    "Il bagno è di 27 mq? Serve per capire i tempi.",
    "Ti chiamo io, va bene alle 14:30?",
    "Ci sentiamo presto, buona giornata!",
  ])("%s", (testo) => {
    expect(controllaDateRisposta(testo, OGGI, APP).ok).toBe(true);
  });
});

describe("come legge le date", () => {
  it("l'anno sottinteso è quello che cade più vicino a oggi", () => {
    const [gen] = dateNelTesto("ci vediamo il 7 gennaio", "2026-12-28");
    expect(gen.data).toBe("2027-01-07");
  });

  it("un giorno da solo senza giorno della settimana non viene letto come data", () => {
    expect(dateNelTesto("servono 27 piastrelle", OGGI)).toHaveLength(0);
  });

  it("una data che non esiste non diventa un blocco", () => {
    expect(controllaDateRisposta("giovedì 31 novembre alle 14:30", OGGI, APP).ok).toBe(true);
  });
});

describe("il controllo è agganciato davvero", () => {
  const sorgente = readFileSync(
    resolve(process.cwd(), "supabase/functions/lead-agente-whatsapp/index.ts"),
    "utf8",
  );

  it("si chiama prima di inviare la risposta", () => {
    const controllo = sorgente.indexOf("controllaDateRisposta(risposta");
    const invio = sorgente.indexOf("await inviaRisposta(");
    expect(controllo).toBeGreaterThan(0);
    expect(controllo).toBeLessThan(invio);
  });

  it("quando non passa non manda niente e avvisa il team", () => {
    expect(sorgente).toContain("data sbagliata, messaggio non inviato");
  });
});

describe("le regole nel prompt", () => {
  const prompt = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/promptAgenteLead.ts"),
    "utf8",
  );

  it("vietano di calcolare il giorno della settimana", () => {
    expect(prompt).toContain("Le date non le calcoli tu");
  });

  it("vietano di dare ragione al cliente sulla data", () => {
    expect(prompt).toContain("NON dargli ragione");
  });

  it("dicono che spostare è un'azione, non una frase", () => {
    expect(prompt).toContain("sposta=true");
  });
});
