import { supabase } from "@/integrations/supabase/client";
import { articoliDalPiano, type PianoOperativoContratto } from "./pianoOperativoContratto";
import { salvaFasiDiPartenza, type FasePerServer } from "./pianificazioneAvvio";
import type { OrigineRiga } from "@/lib/distinta/generaDistinta";

type Riga = Record<string, unknown>;
export interface ArticoloManifest { position: number; name: string; quantity: number; chiave_materiale?: string | null }
const colonneArticoli = "id,name,position,quantity,purchase_price,chiave_materiale,riferimento,phase_id,origini,updated_at";

function fonteMateriale(origine: OrigineRiga): string {
  const dati = Object.entries(origine).filter(([chiave]) =>
    chiave !== "verifica_acquisto" &&
    !(origine.tipo === "contratto" && ["voce_id", "subphase_id"].includes(chiave))
  );
  return JSON.stringify(Object.fromEntries(dati), (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export async function idPianoContratto(orderId: string, riferimento: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${orderId}|${riferimento}`)));
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
  const s = Array.from(hash.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Riavviabile dopo un errore: riferimenti stabili e lettura degli esistenti prima di ogni aggiunta. */
export async function salvaPianoOperativoContratto(input: {
  companyId: string; orderId: string; piano: PianoOperativoContratto; fasi: FasePerServer[];
  articoli?: ArticoloManifest[]; aggiungiArticoli?: boolean; vatRate?: number | null;
}, client: Pick<typeof supabase, "from" | "rpc"> = supabase): Promise<void> {
  // Le voci delle fasi non sono ancora nei tipi generati, come in useVociPrevisteFasi.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { companyId, orderId, piano } = input;
  const checked = async <T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
    const r = await query; if (r.error) throw r.error; return r.data;
  };
  const ordine = await checked<Riga | null>(db.from("orders").select("id").eq("company_id", companyId).eq("id", orderId).maybeSingle());
  if (!ordine) throw new Error("Commessa non disponibile per collegare il piano.");
  const leggi = async (table: string, colonne: string, company = true): Promise<Riga[]> => {
    const rows: Riga[] = [];
    for (let pagina = 0; pagina < 100; pagina++) {
      let q = db.from(table).select(colonne).eq("order_id", orderId);
      if (company) q = q.eq("company_id", companyId);
      const part = await checked<Riga[]>(q.order("id").range(pagina * 500, pagina * 500 + 499));
      if (!Array.isArray(part)) throw new Error("Lettura incompleta dei collegamenti della commessa.");
      rows.push(...part); if (part.length < 500) return rows;
    }
    throw new Error("Troppi collegamenti per completare il piano.");
  };
  let fasi = await leggi("order_work_phases", "id,name,position");
  const manca = input.fasi.filter(f => !fasi.some(r => r.name === f.nome));
  if (manca.length) {
    const err = await salvaFasiDiPartenza(orderId, manca, (name, args) => db.rpc(name, args));
    if (err) throw new Error(err);
    fasi = await leggi("order_work_phases", "id,name,position");
  }
  const voci = await leggi("order_work_phase_voci", "id,phase_id,subphase_id,origine_id,quantita,unita");
  const perLavorazione = new Map<string, { voce: string; sottofase: string | null }>();
  for (const l of piano.fasi.flatMap(f => f.lavorazioni)) {
    const id = await idPianoContratto(orderId, l.riferimento);
    const v = voci.find(v => v.id === id);
    if (v) perLavorazione.set(l.riferimento, { voce: id, sottofase: v.subphase_id ? String(v.subphase_id) : null });
  }
  const faseId = new Map<string, string>();
  const daInserire: Riga[] = [];
  for (const p of piano.fasi) {
    const esistenti = fasi.filter(f => f.name === p.nome);
    if (esistenti.length === 1) faseId.set(p.riferimento, String(esistenti[0].id));
  }
  for (const f of input.fasi) {
    const candidate = fasi.filter(r => r.name === f.nome);
    if (candidate.length !== 1) throw new Error(`Fase non univoca: ${f.nome}. Verifica il cantiere prima di riprovare.`);
    const id = String(candidate[0].id);
    const planFase = piano.fasi.find(p => p.riferimento === f.riferimento || p.nome === f.nome);
    if (planFase) faseId.set(planFase.riferimento, id);
    const sotto = await checked<Riga[]>(db.from("order_work_subphases").select("id,name,position").eq("phase_id", id).order("position"));
    for (const [position, s] of f.sottofasi.entries()) {
      if (!s.riferimento || s.quantita == null || s.quantita <= 0) continue;
      const voceId = await idPianoContratto(orderId, s.riferimento);
      const esistente = voci.find(v => v.id === voceId);
      if (esistente) { perLavorazione.set(s.riferimento, { voce: voceId, sottofase: esistente.subphase_id ? String(esistente.subphase_id) : null }); continue; }
      const ss = sotto.filter(v => v.name === s.nome);
      if (ss.length !== 1) throw new Error(`Sottofase non univoca: ${s.nome}.`);
      daInserire.push({ id: voceId, company_id: companyId, order_id: orderId, phase_id: id,
        subphase_id: ss[0].id, position, descrizione: s.nome, unita: s.unita ?? null, quantita: s.quantita,
        costo_manodopera: 0, costo_materiali: 0, importo: null, origine: "piano", origine_id: voceId,
        origine_codice: piano.fasi.flatMap(p => p.lavorazioni).find(l => l.riferimento === s.riferimento)?.descrizione.match(/^([A-Z]{2,8}_\d+\.\d+)/)?.[1] ?? null });
      perLavorazione.set(s.riferimento, { voce: voceId, sottofase: String(ss[0].id) });
    }
  }
  for (let i = 0; i < daInserire.length; i += 200) await checked(db.from("order_work_phase_voci").upsert(daInserire.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: true }));
  let articoli = await leggi("order_items", colonneArticoli, false);
  const daCreare = input.aggiungiArticoli ? articoliDalPiano(piano).filter(m => !articoli.some(a => a.chiave_materiale === m.chiave_materiale || a.riferimento === m.riferimento && a.name === m.name)) : [];
  if (daCreare.length) {
    if (input.vatRate == null || !Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) throw new Error("Conferma l'IVA della commessa prima di aggiungere gli articoli.");
    await checked(db.rpc("commessa_aggiungi_voci", { p_commessa: orderId, p_voci: daCreare.map(a => ({ ...a, vat_rate: input.vatRate, phase_id: faseId.get(piano.materiali.find(m => m.chiave === a.chiave_materiale)?.phase_id ?? "") ?? null })) }));
    articoli = await leggi("order_items", colonneArticoli, false);
  }
  for (const m of piano.materiali) {
    let candidate = articoli.filter(a => a.chiave_materiale === m.chiave);
    if (!candidate.length && input.articoli) {
      const manifest = input.articoli.find(a => a.chiave_materiale === m.chiave);
      if (manifest) candidate = articoli.filter(a => Number(a.position) === manifest.position && a.name === manifest.name);
    }
    if (!candidate.length && input.aggiungiArticoli) {
      const a = articoliDalPiano(piano).find(a => a.chiave_materiale === m.chiave)!;
      candidate = articoli.filter(r => r.riferimento === a.riferimento && r.name === a.name);
    }
    if (!candidate.length) continue; // L'utente può avere escluso un articolo nell'anteprima.
    if (candidate.length !== 1) throw new Error(`Articolo non univoco: ${m.riferimento}. Non sono stati creati duplicati.`);
    const a = candidate[0];
    const precedenti = (Array.isArray(a.origini) ? a.origini : []) as OrigineRiga[];
    const haConferme = precedenti.some(o => o?.verifica_acquisto?.stato === "confermata");
    if (haConferme && JSON.stringify(precedenti.map(fonteMateriale).sort()) !== JSON.stringify(m.origini.map(fonteMateriale).sort())) {
      throw new Error(`La fonte di «${String(a.name)}» è cambiata. Rivedi il materiale confermato prima di riapplicare il piano.`);
    }
    const origini = (haConferme ? precedenti : m.origini).map(o => {
      if (o.tipo !== "contratto") return o;
      const link = perLavorazione.get(o.posizione_ref);
      if (!link) return o;
      return { ...o, voce_id: o.voce_id ?? link.voce, subphase_id: o.subphase_id ?? link.sottofase };
    });
    let modifica = db.from("order_items").update({ chiave_materiale: m.chiave, ...(!a.riferimento ? { riferimento: m.riferimento } : {}),
      origini, ...(!haConferme ? { quantita_calcolata: m.quantita_calcolata } : {}),
      ...(!a.chiave_materiale ? { prezzo_da_definire: Number(a.purchase_price ?? 0) <= 0 } : {}),
      ...(a.phase_id ? {} : { phase_id: m.phase_id ? faseId.get(m.phase_id) ?? null : null }) }).eq("id", a.id).eq("order_id", orderId);
    modifica = a.updated_at ? modifica.eq("updated_at", a.updated_at) : modifica.is("updated_at", null);
    const aggiornate = await checked<Riga[]>(modifica.select("id"));
    if (!aggiornate?.length) throw new Error("Collegamento dell'articolo non salvato: verifica i permessi o aggiorna la commessa se l'articolo è cambiato.");
  }
}
