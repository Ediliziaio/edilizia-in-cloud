import type { DatabaseSync } from "node:sqlite";
interface PipelineLocale {
  id: string;
  nome: string;
  versione?: number;
  fasi: { id: string; name: string; color: string }[];
}

export class PipelineError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);

export function pipelineStore(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS pipeline(azienda TEXT NOT NULL,id TEXT NOT NULL,nome TEXT NOT NULL,nome_key TEXT NOT NULL,versione INTEGER NOT NULL,
      PRIMARY KEY(azienda,id),UNIQUE(azienda,nome_key));
    CREATE TABLE IF NOT EXISTS fasi(azienda TEXT NOT NULL,id TEXT NOT NULL,pipeline TEXT NOT NULL,nome TEXT NOT NULL,colore TEXT NOT NULL,pos INTEGER NOT NULL,
      PRIMARY KEY(azienda,id),FOREIGN KEY(azienda,pipeline) REFERENCES pipeline(azienda,id));
    CREATE TABLE IF NOT EXISTS assegnazioni(azienda TEXT NOT NULL,commessa TEXT NOT NULL,fase TEXT NOT NULL,PRIMARY KEY(azienda,commessa),
      FOREIGN KEY(azienda,fase) REFERENCES fasi(azienda,id));`);
  function transazione(fn: () => void) {
    db.exec("BEGIN IMMEDIATE");
    try { fn(); db.exec("COMMIT"); } catch (err) { db.exec("ROLLBACK"); throw err; }
  }
  function elenco(azienda: string) {
    const fasi = db.prepare("SELECT * FROM fasi WHERE azienda=? ORDER BY pos").all(azienda);
    return db.prepare("SELECT id,nome,versione FROM pipeline WHERE azienda=? ORDER BY nome_key").all(azienda).map(p => ({
      ...p, fasi:fasi.filter(f => f.pipeline === p.id).map(f => ({id:f.id, name:f.nome, color:f.colore}))
    }));
  }
  function salva(azienda: string, p: PipelineLocale) {
    if (!p || !uuid(p.id) || typeof p.nome !== "string" || !p.nome.trim() || p.nome.length>120 || !Array.isArray(p.fasi) || !p.fasi.length || p.fasi.length>100 ||
      p.fasi.some(f => !f || !uuid(f.id) || typeof f.name !== "string" || !f.name.trim() || f.name.length>120 || !/^#[0-9a-f]{6}$/i.test(f.color)))
      throw new PipelineError(400,"Controlla il nome e le fasi della pipeline.");
    const key = p.nome.trim().toLocaleLowerCase("it");
    if (new Set(p.fasi.map(f => f.name.trim().toLocaleLowerCase("it"))).size !== p.fasi.length || new Set(p.fasi.map(f=>f.id)).size !== p.fasi.length)
      throw new PipelineError(400,"Ogni fase deve essere distinta.");
    transazione(() => {
      const attuale = db.prepare("SELECT versione FROM pipeline WHERE azienda=? AND id=?").get(azienda,p.id);
      if ((attuale?.versione ?? 0) !== (p.versione ?? 0)) throw new PipelineError(409,"La pipeline è stata modificata. Riapri la modifica per aggiornare le fasi.");
      if (key === "principale" || db.prepare("SELECT 1 FROM pipeline WHERE azienda=? AND nome_key=? AND id<>?").get(azienda,key,p.id))
        throw new PipelineError(409,"Esiste già una pipeline con questo nome.");
      db.prepare("INSERT INTO pipeline VALUES(?,?,?,?,1) ON CONFLICT(azienda,id) DO UPDATE SET nome=excluded.nome,nome_key=excluded.nome_key,versione=versione+1").run(azienda,p.id,p.nome.trim(),key);
      for (const r of db.prepare("SELECT id FROM fasi WHERE azienda=? AND pipeline=?").all(azienda,p.id)) {
        if (p.fasi.some(f=>f.id===r.id)) continue;
        if (db.prepare("SELECT 1 FROM assegnazioni WHERE azienda=? AND fase=?").get(azienda,r.id)) throw new PipelineError(409,"Sposta le commesse dalla fase prima di rimuoverla.");
        db.prepare("DELETE FROM fasi WHERE azienda=? AND id=?").run(azienda,r.id);
      }
      p.fasi.forEach((f,i) => {
        const result = db.prepare("INSERT INTO fasi VALUES(?,?,?,?,?,?) ON CONFLICT(azienda,id) DO UPDATE SET nome=excluded.nome,colore=excluded.colore,pos=excluded.pos WHERE fasi.pipeline=excluded.pipeline").run(azienda,f.id,p.id,f.name.trim(),f.color,i);
        if (!result.changes) throw new PipelineError(409,"La fase appartiene a un’altra pipeline.");
      });
    });
  }
  function assegna(azienda: string, ordine: string, fase: string|null, precedente: string|null) {
    transazione(() => {
      const attuale = db.prepare("SELECT fase FROM assegnazioni WHERE azienda=? AND commessa=?").get(azienda,ordine)?.fase ?? null;
      if (attuale !== precedente && attuale !== fase) throw new PipelineError(409,"Un collega ha già spostato la commessa. Controlla la fase aggiornata.");
      if (fase === null) db.prepare("DELETE FROM assegnazioni WHERE azienda=? AND commessa=?").run(azienda,ordine);
      else {
        if (!db.prepare("SELECT 1 FROM fasi WHERE azienda=? AND id=?").get(azienda,fase)) throw new PipelineError(400,"Fase non disponibile per questa azienda.");
        db.prepare("INSERT INTO assegnazioni VALUES(?,?,?) ON CONFLICT(azienda,commessa) DO UPDATE SET fase=excluded.fase").run(azienda,ordine,fase);
      }
    });
  }
  function assegnazioni(azienda: string) {
    return Object.fromEntries(db.prepare("SELECT commessa,fase FROM assegnazioni WHERE azienda=?").all(azienda).map(r=>[String(r.commessa),String(r.fase)])) as Record<string,string>;
  }
  return {elenco, salva, assegna, assegnazioni};
}
