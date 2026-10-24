import { describe, expect, it } from "vitest";
import {
  LIMITI_IMAP_MESSAGGIO,
  decidiScaricoMessaggio,
  estraiDimensioneMessaggio,
  messaggioNonScaricato,
  parseImapMessage,
} from "../../../supabase/functions/_shared/imapSmtpClient";
import {
  LIMITI_POLL,
  devoSaltareMessaggio,
  prossimoStalloImap,
} from "../../../supabase/functions/email-poll-inbox/limiti";

/**
 * La posta che non arrivava più (21–24/10/2026).
 *
 * Un messaggio troppo pesante da analizzare esauriva la CPU del worker prima
 * che il poller salvasse l'avanzamento: al giro dopo si ricominciava dallo
 * stesso messaggio, per sempre, e le caselle dietro di lui non venivano mai
 * raggiunte. Due presìdi, qui fissati:
 *   1. un messaggio sopra il tetto non si scarica intero (solo intestazioni) e
 *      il totale per giro è limitato;
 *   2. se un giro muore sullo stesso punto più volte, il messaggio che blocca
 *      si supera leggendone le sole intestazioni.
 */

describe("IMAP — dimensione del messaggio", () => {
  it("legge RFC822.SIZE dalla risposta del server", () => {
    expect(estraiDimensioneMessaggio("* 3 FETCH (UID 3 RFC822.SIZE 4521)\r\nA4 OK Fetch completed.\r\n")).toBe(4521);
    expect(estraiDimensioneMessaggio("* 3 FETCH (RFC822.SIZE 12 UID 3)\r\nA4 OK")).toBe(12);
  });

  it("senza dimensione risponde null (il server non l'ha detta: si scarica come prima)", () => {
    expect(estraiDimensioneMessaggio("A4 NO nope\r\n")).toBeNull();
    expect(estraiDimensioneMessaggio("")).toBeNull();
  });
});

describe("IMAP — come trattare il prossimo messaggio", () => {
  const base = { byteGiaScaricati: 0, messaggiGiaInPagina: 0, soloIntestazioni: false };

  it("un messaggio normale si scarica intero", () => {
    expect(decidiScaricoMessaggio({ ...base, dimensione: 40_000 })).toBe("completo");
  });

  it("senza dimensione si scarica come prima", () => {
    expect(decidiScaricoMessaggio({ ...base, dimensione: null })).toBe("completo");
  });

  it("sopra il tetto leggono solo le intestazioni, anche se è il primo del giro", () => {
    const sopra = LIMITI_IMAP_MESSAGGIO.byteMax + 1;
    expect(decidiScaricoMessaggio({ ...base, dimensione: sopra })).toBe("intestazioni");
    // Esattamente al tetto passa: il limite è «oltre».
    expect(decidiScaricoMessaggio({ ...base, dimensione: LIMITI_IMAP_MESSAGGIO.byteMax })).toBe("completo");
  });

  it("il primo del giro si legge sempre, anche se da solo supera il totale", () => {
    // Un messaggio sotto il tetto per messaggio ma sopra il totale per giro: se è
    // il primo non si rimanda (altrimenti non verrebbe mai letto).
    const grande = LIMITI_IMAP_MESSAGGIO.byteMax;
    expect(LIMITI_IMAP_MESSAGGIO.byteTotaliPerGiro).toBeGreaterThanOrEqual(grande);
    expect(decidiScaricoMessaggio({ ...base, dimensione: grande, byteGiaScaricati: 0, messaggiGiaInPagina: 0 })).toBe("completo");
  });

  it("dal secondo in poi rimanda al giro dopo quando il totale supererebbe il tetto", () => {
    expect(
      decidiScaricoMessaggio({
        ...base,
        dimensione: 2 * 1024 * 1024,
        byteGiaScaricati: LIMITI_IMAP_MESSAGGIO.byteTotaliPerGiro - 1024 * 1024,
        messaggiGiaInPagina: 1,
      }),
    ).toBe("rimanda");
  });

  it("dal secondo in poi un messaggio che ci sta nel totale si scarica", () => {
    expect(
      decidiScaricoMessaggio({ ...base, dimensione: 100_000, byteGiaScaricati: 500_000, messaggiGiaInPagina: 2 }),
    ).toBe("completo");
  });

  it("in modalità «solo intestazioni» non si scarica mai il corpo", () => {
    expect(decidiScaricoMessaggio({ ...base, dimensione: 100, soloIntestazioni: true })).toBe("intestazioni");
    expect(decidiScaricoMessaggio({ ...base, dimensione: null, soloIntestazioni: true })).toBe("intestazioni");
  });
});

describe("IMAP — il segnaposto di un messaggio non scaricato", () => {
  // Una risposta a FETCH delle sole intestazioni: nessun corpo, ma il tipo
  // multipart dichiara un boundary (non deve rompere il parser).
  const intestazioni = [
    "From: Mario Rossi <mario@example.com>",
    "To: ufficio@example.com",
    "Subject: Planimetrie del cantiere",
    "Date: Tue, 21 Oct 2026 13:00:00 +0200",
    "Message-ID: <abc123@example.com>",
    'Content-Type: multipart/mixed; boundary="bnd"',
  ].join("\r\n");
  const corpo = intestazioni + "\r\n\r\n";
  const byte = new TextEncoder().encode(corpo).length;
  const risposta = `* 7 FETCH (UID 7 BODY[HEADER] {${byte}}\r\n${corpo})\r\nA9 OK Fetch completed.\r\n`;

  it("le sole intestazioni si leggono: mittente, oggetto e Message-ID ci sono, il testo no", () => {
    const m = parseImapMessage("7", risposta);
    expect(m).not.toBeNull();
    expect(m!.from).toBe("mario@example.com");
    expect(m!.subject).toBe("Planimetrie del cantiere");
    expect(m!.messageId).toBe("<abc123@example.com>");
    expect(m!.text).toBe("");
    expect(m!.attachments).toEqual([]);
  });

  it("troppo grande: il testo spiega, con la dimensione in megabyte alla virgola", () => {
    const m = parseImapMessage("7", risposta)!;
    const s = messaggioNonScaricato(m, "troppo_grande", 5 * 1048576);
    expect(s.text).toContain("5,0 MB");
    expect(s.text).toContain("troppo grande");
    expect(s.text).toContain("programma di posta");
    expect(s.html).toBeNull();
    expect(s.attachments).toEqual([]);
    expect(s.nonScaricato).toEqual({ motivo: "troppo_grande", byte: 5 * 1048576 });
    // Il resto del messaggio resta com'è: la conversazione si aggancia ai thread.
    expect(s.messageId).toBe("<abc123@example.com>");
    expect(s.subject).toBe("Planimetrie del cantiere");
  });

  it("in blocco: dice che le sincronizzazioni si fermavano, senza inventare una dimensione", () => {
    const m = parseImapMessage("7", risposta)!;
    const s = messaggioNonScaricato(m, "in_blocco", null);
    expect(s.text).toContain("sincronizzazioni precedenti");
    expect(s.text).not.toContain("MB");
    expect(s.nonScaricato).toEqual({ motivo: "in_blocco", byte: null });
  });
});

describe("email-poll-inbox — il giro che muore sullo stesso punto", () => {
  const SYNC = "2026-10-21T11:11:01.000Z";

  it("al primo giro (nessun segno) il contatore parte da 1 e non si salta niente", () => {
    const s = prossimoStalloImap(undefined, 120, SYNC);
    expect(s).toEqual({ da_uid: 120, volte: 1, sync_visto: SYNC });
    expect(devoSaltareMessaggio(s)).toBe(false);
  });

  it("se il giro precedente non è mai finito (stesso cursore, stesso last_synced_at) il contatore sale", () => {
    let s = prossimoStalloImap(undefined, 120, SYNC);
    s = prossimoStalloImap(s, 120, SYNC);
    expect(s.volte).toBe(2);
    expect(devoSaltareMessaggio(s)).toBe(false);
    s = prossimoStalloImap(s, 120, SYNC);
    expect(s.volte).toBe(3);
    // Dopo imapTentativiPrimaDiSaltare giri morti si supera il messaggio.
    expect(s.volte).toBeGreaterThan(LIMITI_POLL.imapTentativiPrimaDiSaltare);
    expect(devoSaltareMessaggio(s)).toBe(true);
  });

  it("un giro finito (anche con un errore) ha aggiornato last_synced_at: il contatore riparte", () => {
    // Login rifiutato, rete lenta, server che non risponde: sono esiti normali,
    // mark_sync aggiorna last_synced_at, la casella non va saltata per quello.
    let s = prossimoStalloImap(undefined, 120, SYNC);
    s = prossimoStalloImap(s, 120, SYNC);
    s = prossimoStalloImap(s, 120, SYNC);
    expect(devoSaltareMessaggio(s)).toBe(true);
    const dopo = prossimoStalloImap(s, 120, "2026-10-21T11:21:03.000Z");
    expect(dopo.volte).toBe(1);
    expect(devoSaltareMessaggio(dopo)).toBe(false);
  });

  it("se il cursore è avanzato il contatore riparte", () => {
    let s = prossimoStalloImap(undefined, 120, SYNC);
    s = prossimoStalloImap(s, 120, SYNC);
    const dopo = prossimoStalloImap(s, 125, SYNC);
    expect(dopo.volte).toBe(1);
  });

  it("una casella mai sincronizzata (last_synced_at null) conta come le altre", () => {
    let s = prossimoStalloImap(undefined, 0, null);
    s = prossimoStalloImap(s, 0, null);
    expect(s).toEqual({ da_uid: 0, volte: 2, sync_visto: null });
  });

  it("un segno rovinato nel database non rompe il giro", () => {
    expect(prossimoStalloImap("boh", 5, SYNC).volte).toBe(1);
    expect(prossimoStalloImap(null, 5, SYNC).volte).toBe(1);
    expect(prossimoStalloImap({ da_uid: 5, volte: "x", sync_visto: SYNC }, 5, SYNC).volte).toBe(1);
  });
});
