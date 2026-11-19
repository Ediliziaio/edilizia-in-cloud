import type { DatabaseSync } from "node:sqlite";
import { chiavePrevisto, type ArchivioPrevisto, type PianoPrevisto } from "../../src/lib/orders/previsionaleSalvato";

export class ErrorePrevisto extends Error {
  constructor(public stato: number, messaggio: string) { super(messaggio); }
}

export function archivioPrevisionale(db: DatabaseSync) {
  db.exec(`
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS previsionale (
      azienda TEXT NOT NULL,
      commessa TEXT NOT NULL,
      versione INTEGER NOT NULL,
      piani TEXT NOT NULL,
      ultima_operazione TEXT NOT NULL,
      PRIMARY KEY (azienda, commessa)
    ) STRICT;
  `);
  const cerca = db.prepare("SELECT versione, piani, ultima_operazione FROM previsionale WHERE azienda=? AND commessa=?");
  const interseca = db.prepare(`SELECT commessa, piani FROM previsionale a
    WHERE azienda=? AND commessa<>?
    AND EXISTS (SELECT 1 FROM json_each(a.piani) p WHERE json_extract(p.value,'$.dal')<=? AND json_extract(p.value,'$.al')>=?)`);
  const scrivi = db.prepare(`INSERT INTO previsionale VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (azienda, commessa) DO UPDATE SET versione=excluded.versione, piani=excluded.piani, ultima_operazione=excluded.ultima_operazione`);
  const leggi = (azienda: string, commessa: string): ArchivioPrevisto & { ultima?: string } => {
    const riga = cerca.get(azienda, commessa);
    return riga
      ? { versione: Number(riga.versione), piani: JSON.parse(String(riga.piani)) as PianoPrevisto[], ultima: String(riga.ultima_operazione) }
      : { versione: 0, piani: [] };
  };
  return {
    leggi,
    altrePrevisioni(azienda: string, commessa: string, dal: string, al: string) {
      return interseca.all(azienda, commessa, al, dal)
        .map((r) => ({ commessa: String(r.commessa), piani: JSON.parse(String(r.piani)) as PianoPrevisto[] }));
    },
    aggiorna(azienda: string, commessa: string, versione: number, operazione: string, nuovi: PianoPrevisto[], daTogliere?: string): ArchivioPrevisto {
      db.exec("BEGIN IMMEDIATE");
      try {
        const attuale = leggi(azienda, commessa);
        if (attuale.ultima === operazione) {
          db.exec("COMMIT");
          return { versione: attuale.versione, piani: attuale.piani };
        }
        if (attuale.versione !== versione) throw new ErrorePrevisto(409, "Il previsionale è cambiato. Rileggi i dati e riprova.");
        const piani = new Map(attuale.piani.map((p) => [chiavePrevisto(p.ambito), p]));
        if (daTogliere) piani.delete(daTogliere);
        for (const nuovo of nuovi) piani.set(chiavePrevisto(nuovo.ambito), nuovo);
        if (piani.size > 250) throw new ErrorePrevisto(422, "Limite di 250 lavorazioni pianificate per commessa.");
        const totalePresenze = [...piani.values()].reduce((totale, piano) => totale + piano.operai.length * piano.giorni.length, 0);
        if (totalePresenze > 200_000) throw new ErrorePrevisto(422, "Riduci la durata o il numero di persone nel previsionale.");
        const salvato = { versione: versione + 1, piani: [...piani.values()] };
        scrivi.run(azienda, commessa, salvato.versione, JSON.stringify(salvato.piani), operazione);
        db.exec("COMMIT");
        return salvato;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
