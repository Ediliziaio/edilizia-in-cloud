// src/lib/orders/generali/avvisi.ts
// Gli avvisi delle commesse generali che escono dalla pagina: campanella, push ed email.
//
// Qui solo parole e conti: dati il riepilogo, il contratto e la checklist dei documenti di una
// generale, quali eventi meritano un avviso OGGI. Ogni evento ha una chiave stabile
// («garanzia:<id>:<scadenza>:7»): il database (generali_avvisi_registra, migrazione
// 20281105110000) ne tiene una sola aperta per chiave, ed è così che un avviso parte una volta.
// Una soglia nuova (30 giorni → 7 → scaduta) è una chiave nuova, quindi un avviso nuovo.
//
// Lo usa la edge function generali-avvisi (Deno): per questo gli import sono relativi e con
// l'estensione, e i moduli importati (documenti, contratto, commesseGenerali) non usano «@/».
// Lo controlla src/test/logic/generaleAvvisi.test.ts. ATTENZIONE: il CI ripubblica una edge
// function solo se cambia un file sotto supabase/functions/: chi cambia questo file (o quelli
// che importa) deve toccare anche supabase/functions/generali-avvisi/index.ts.
import { DEFINIZIONI_MODELLI, leggiRiepilogo, totaliGenerale, formattaEuro, type RiepilogoGenerale } from "../commesseGenerali.ts";
import {
  TIPI_GARANZIA,
  anticipazione,
  fineAggiornata,
  formattaEuroContratto,
  giorniTra,
  leggiDatiContratto,
  penaleMaturata,
  type DatiContratto,
} from "./contratto.ts";
import {
  calcolaChecklist,
  vociDelModello,
  type AllegatoCommessa,
  type ChecklistDocumenti,
  type RigaVoceAzienda,
  type SegnoDocumento,
} from "./documenti.ts";

/** Dopo quanti giorni dalla nascita della generale un documento obbligatorio che manca diventa un avviso. */
export const GIORNI_PRIMA_DEI_MANCANTI = 30;

export type TipoAvviso =
  | "garanzia_scadenza"
  | "garanzia_svincolo"
  | "fine_lavori"
  | "penale"
  | "documento_scadenza"
  | "documento_mancante"
  | "fideiussione_122"
  | "oltre_valore"
  | "figlia_perdita";

export interface AvvisoDaMandare {
  chiave: string;
  tipo: TipoAvviso;
  /** Urgente: l'email non aspetta il lunedì. */
  urgente: boolean;
  /** Il testo cita importi o margini: chi non li vede non riceve l'avviso. */
  richiede: "importi" | "margini" | null;
  titolo: string;
  testo: string;
  link: string;
}

export interface ContestoAvvisi {
  riepilogo: RiepilogoGenerale;
  /** null = la generale non usa il contratto, o non ne ha uno. */
  contratto: DatiContratto | null;
  /** null = la generale non usa il modulo Documenti. */
  checklist: ChecklistDocumenti | null;
  oggi: string;
}

const dataIt = (iso: string) => {
  const [a, m, g] = iso.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
};
const traGiorni = (n: number) => (n === 0 ? "oggi" : n === 1 ? "domani" : `tra ${n} giorni`);
const giorniDi = (n: number) => `${n} ${n === 1 ? "giorno" : "giorni"}`;
/** «Polizza CAR» → «polizza CAR»: dentro una frase. */
const minuscola = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Gli eventi di oggi, i più urgenti prima. */
export function avvisiDaMandare(c: ContestoAvvisi): AvvisoDaMandare[] {
  const r = c.riepilogo;
  const g = r.generale;
  const nome = g.codice ?? g.nome;
  const base = `/azienda/ordini/${g.id}`;
  const scheda = (id: string) => `${base}?scheda=${id}`;
  const nomeFiglia = new Map(r.figlie.map((f) => [f.id, f.codice ?? f.nome]));
  const def = DEFINIZIONI_MODELLI[g.modello];
  const out: AvvisoDaMandare[] = [];

  // ── Contratto: garanzie, fine lavori, penali ──────────────────────────────
  const d = c.contratto;
  if (d && d.permessi.importi) {
    const ant = anticipazione(d.contratto, d.sal);
    for (const ga of d.garanzie) {
      if (ga.svincolataIl) continue;
      const tipo = TIPI_GARANZIA[ga.tipo];
      const chi = [ga.numero ? `n. ${ga.numero}` : null, ga.garante ? `di ${ga.garante}` : null].filter(Boolean).join(" ");
      const detta = chi ? `${tipo} ${chi}` : tipo;
      if (ga.scadenza) {
        const mancano = giorniTra(c.oggi, ga.scadenza);
        if (mancano < 0) {
          out.push({
            chiave: `garanzia:${ga.id}:${ga.scadenza}:scaduta`, tipo: "garanzia_scadenza", urgente: true, richiede: "importi",
            titolo: `${tipo} scaduta · ${nome}`,
            testo: `${detta} è scaduta il ${dataIt(ga.scadenza)}: chiedi il rinnovo o lo svincolo.`,
            link: scheda("contratto"),
          });
        } else if (mancano <= 30) {
          const sette = mancano <= 7;
          out.push({
            chiave: `garanzia:${ga.id}:${ga.scadenza}:${sette ? 7 : 30}`, tipo: "garanzia_scadenza", urgente: sette, richiede: "importi",
            titolo: `${tipo} in scadenza · ${nome}`,
            testo: `${detta} scade il ${dataIt(ga.scadenza)} (${traGiorni(mancano)}): chiedi per tempo il rinnovo, o lo svincolo se non serve più.`,
            link: scheda("contratto"),
          });
        }
      }
      // Da svincolare: la garanzia dell'anticipazione quando l'anticipazione è tutta recuperata,
      // la cauzione e la CAR quando i lavori sono ultimati.
      const anticipazioneRecuperata = ga.tipo === "garanzia_anticipazione" && ant.importo > 0 && ant.recuperato > 0 && ant.daRecuperare === 0;
      const lavoriUltimati = (ga.tipo === "cauzione_definitiva" || ga.tipo === "car") && !!d.contratto?.dataUltimazione;
      if (anticipazioneRecuperata || lavoriUltimati) {
        out.push({
          chiave: `svincolo:${ga.id}`, tipo: "garanzia_svincolo", urgente: false, richiede: "importi",
          titolo: `${tipo} da svincolare · ${nome}`,
          testo: anticipazioneRecuperata
            ? `L'anticipazione è tutta recuperata con i SAL: puoi chiedere lo svincolo della ${minuscola(tipo)}.`
            : `I lavori risultano ultimati il ${dataIt(d.contratto!.dataUltimazione!)}: verifica quando puoi chiedere lo svincolo della ${minuscola(tipo)}.`,
          link: scheda("contratto"),
        });
      }
    }

    const ct = d.contratto;
    const fine = fineAggiornata(ct, d.atti).data;
    if (ct && fine && !ct.dataUltimazione) {
      const mancano = giorniTra(c.oggi, fine);
      if (mancano < 0) {
        const penale = penaleMaturata(ct, d.atti, c.oggi);
        const tetto = penale?.tetto ?? null;
        out.push({
          chiave: `fine:${fine}:superata`, tipo: "fine_lavori", urgente: true, richiede: "importi",
          titolo: `Lavori oltre la fine del contratto · ${nome}`,
          testo: `I lavori dovevano finire il ${dataIt(fine)} e non risultano ultimati (${giorniDi(-mancano)} di ritardo).`
            + (ct.penaleGiornaliera
              ? ` Matura la penale: ${formattaEuroContratto(ct.penaleGiornaliera)} al giorno${tetto !== null ? `, fino a ${formattaEuroContratto(tetto)}` : ""}${penale ? `; finora ${formattaEuroContratto(penale.importo)}` : ""}.`
              : " Se è previsto, segna la data di ultimazione nel contratto."),
          link: scheda("contratto"),
        });
        if (penale?.alTetto) {
          out.push({
            chiave: `penale:${fine}:tetto`, tipo: "penale", urgente: true, richiede: "importi",
            titolo: `Penale al tetto · ${nome}`,
            testo: `La penale per il ritardo ha raggiunto il tetto del contratto: ${formattaEuroContratto(penale.importo)}.`,
            link: scheda("contratto"),
          });
        }
      } else if (mancano <= 30) {
        const sette = mancano <= 7;
        out.push({
          chiave: `fine:${fine}:${sette ? 7 : 30}`, tipo: "fine_lavori", urgente: sette, richiede: "importi",
          titolo: `Fine lavori vicina · ${nome}`,
          testo: `Il contratto prevede la fine dei lavori il ${dataIt(fine)} (${traGiorni(mancano)})`
            + (ct.penaleGiornaliera ? `: dal giorno dopo matura una penale di ${formattaEuroContratto(ct.penaleGiornaliera)} al giorno.` : "."),
          link: scheda("contratto"),
        });
      }
    }
  }

  // ── Documenti richiesti ───────────────────────────────────────────────────
  const ck = c.checklist;
  if (ck) {
    const dallaNascita = g.creataIl ? giorniTra(g.creataIl.slice(0, 10), c.oggi) : 0;
    const caselle = [...ck.generale, ...ck.figlie.flatMap((x) => x.caselle)];
    for (const k of caselle) {
      const dove = k.orderId === g.id ? nome : `${nomeFiglia.get(k.orderId) ?? "una commessa"} (${nome})`;
      const voce = k.voce.nome;
      if (k.voce.id === "fideiussione_122") {
        // Unità che hanno incassato senza fideiussione: avviso a parte, con la legge.
        const figlia = r.figlie.find((f) => f.id === k.orderId);
        const acconti = figlia ? Math.max(figlia.acconti ?? 0, figlia.incassato ?? 0) : 0;
        if (r.permessi.importi && acconti > 0 && (k.stato === "mancante" || k.stato === "scaduto")) {
          out.push({
            chiave: `fideiussione:${k.orderId}:${k.stato === "scaduto" ? `scaduta:${k.scadenza}` : "manca"}`,
            tipo: "fideiussione_122", urgente: true, richiede: "importi",
            titolo: `Acconti senza fideiussione · ${nomeFiglia.get(k.orderId) ?? nome}`,
            testo: `${nomeFiglia.get(k.orderId) ?? "Un'unità"} di ${nome} ha incassato ${formattaEuro(acconti)} tra caparre e acconti, `
              + (k.stato === "scaduto"
                ? `ma la fideiussione D.Lgs. 122/2005 è scaduta il ${dataIt(k.scadenza!)}.`
                : "ma tra i documenti non c'è la fideiussione D.Lgs. 122/2005.")
              + " Senza, l'acquirente può far annullare il preliminare.",
            link: scheda("documenti"),
          });
        }
        continue;
      }
      if (k.stato === "scaduto" && k.scadenza) {
        out.push({
          chiave: `documento:${k.orderId}:${k.voce.id}:${k.scadenza}:scaduto`, tipo: "documento_scadenza", urgente: true, richiede: null,
          titolo: `Documento scaduto · ${nome}`,
          testo: `«${voce}» di ${dove} non vale più dal ${dataIt(k.scadenza)}: carica quello nuovo.`,
          link: scheda("documenti"),
        });
      } else if (k.stato === "in_scadenza" && k.scadenza && k.giorni !== null) {
        out.push({
          chiave: `documento:${k.orderId}:${k.voce.id}:${k.scadenza}:in_scadenza`, tipo: "documento_scadenza", urgente: false, richiede: null,
          titolo: `Documento in scadenza · ${nome}`,
          testo: `«${voce}» di ${dove} scade il ${dataIt(k.scadenza)} (${traGiorni(k.giorni)}): procurati il rinnovo.`,
          link: scheda("documenti"),
        });
      }
    }
    // I mancanti: un avviso solo, con l'elenco, e solo per le voci della generale. Quelle di ogni
    // unità o ordine (APE, accatastamento…) arrivano a fine lavori: dopo 30 giorni sarebbero rumore.
    const mancanti = ck.generale.filter((k) => k.stato === "mancante" && k.obbligatoria).map((k) => `«${k.voce.nome}»`);
    if (mancanti.length > 0 && dallaNascita >= GIORNI_PRIMA_DEI_MANCANTI) {
      out.push({
        chiave: "documenti_mancanti", tipo: "documento_mancante", urgente: false, richiede: null,
        titolo: `${mancanti.length === 1 ? "Documento obbligatorio mancante" : "Documenti obbligatori mancanti"} · ${nome}`,
        testo: `${nome} è aperta da ${giorniDi(dallaNascita)} e ${mancanti.length === 1 ? "manca ancora" : `mancano ancora ${mancanti.length} documenti obbligatori:`} ${mancanti.join(", ")}.`,
        link: scheda("documenti"),
      });
    }
  }

  // ── Conti delle commesse dentro ───────────────────────────────────────────
  const t = totaliGenerale(r);
  if (t.daAssegnare !== null && t.daAssegnare < 0) {
    out.push({
      chiave: "oltre_valore", tipo: "oltre_valore", urgente: false, richiede: "importi",
      titolo: `Commesse oltre il valore · ${nome}`,
      testo: `Le commesse dentro ${nome} superano ${def.valore.etichetta.toLowerCase()} di ${formattaEuro(-t.daAssegnare)}.`,
      link: base,
    });
  }
  if (r.permessi.margini) {
    for (const f of r.figlie) {
      if (f.divisa || f.margine === null || f.margine >= 0) continue;
      out.push({
        chiave: `perdita:${f.id}`, tipo: "figlia_perdita", urgente: false, richiede: "margini",
        titolo: `In perdita · ${f.codice ?? f.nome}`,
        testo: `${f.codice ?? f.nome}, dentro ${nome}, è in perdita di ${formattaEuro(-f.margine)}: i costi superano i ricavi.`,
        link: base,
      });
    }
  }

  return out.sort((a, b) => Number(b.urgente) - Number(a.urgente));
}

// ── Dalla risposta di generali_avvisi_contesto agli avvisi ───────────────────

export interface DestinatarioAvvisi {
  user_id: string;
  email: string | null;
  nome: string | null;
  amministratore: boolean;
  importi: boolean;
  margini: boolean;
  in_app: boolean;
  email_attiva: boolean;
}

const elenco = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Legge la risposta di generali_avvisi_contesto. null = niente da calcolare (generale sparita, o
 * nessun amministratore con cui leggerla). La checklist rifà lo stesso conto della scheda Documenti.
 */
export function contestoDaRisposta(data: unknown, oggi: string): ContestoAvvisi | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const riepilogo = leggiRiepilogo(d.riepilogo);
  if (!riepilogo) return null;
  const contratto = d.contratto ? leggiDatiContratto(d.contratto) : null;
  const voci = vociDelModello(riepilogo.generale.modello, elenco<RigaVoceAzienda>(d.voci));
  const checklist = voci.some((v) => !v.tolta)
    ? calcolaChecklist({
      voci,
      generaleId: riepilogo.generale.id,
      // Come useChecklistGenerale: per la fideiussione contano anche caparre e acconti dell'unità.
      figlie: riepilogo.figlie.map((f) => ({
        id: f.id,
        incassato: riepilogo.permessi.importi ? Math.max(f.acconti ?? 0, f.incassato ?? 0) : null,
      })),
      allegati: elenco<AllegatoCommessa>(d.allegati),
      segni: elenco<SegnoDocumento>(d.segni),
      oggi,
    })
    : null;
  return { riepilogo, contratto: contratto && (contratto.contratto || contratto.garanzie.length > 0) ? contratto : null, checklist, oggi };
}

export const destinatariDaRisposta = (data: unknown): DestinatarioAvvisi[] =>
  elenco<DestinatarioAvvisi>((data as Record<string, unknown> | null)?.destinatari).filter((x) => typeof x?.user_id === "string");

// ── Il giorno e l'email ──────────────────────────────────────────────────────

/** Data (AAAA-MM-GG), giorno della settimana (0 = domenica) e ora a Roma: il server gira in UTC. */
export function adessoARoma(d: Date = new Date()): { oggi: string; giornoSettimana: number; ora: number } {
  const parti = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const giorni = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { oggi: `${parti.year}-${parti.month}-${parti.day}`, giornoSettimana: giorni.indexOf(parti.weekday), ora: Number(parti.hour) };
}

export interface AvvisoInEmail {
  id: string;
  generale_id: string;
  generale: string;
  urgente: boolean;
  titolo: string;
  testo: string;
  link: string;
}

/** Il riepilogo parte il lunedì; un avviso urgente non aspetta e parte il giorno stesso, con gli altri. */
export const emailDaMandareOggi = (avvisi: readonly Pick<AvvisoInEmail, "urgente">[], giornoSettimana: number) =>
  avvisi.length > 0 && (giornoSettimana === 1 || avvisi.some((a) => a.urgente));

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
}

/** L'email di una persona: gli avvisi raggruppati per generale, gli urgenti prima. */
export function emailAvvisi(p: { nome: string | null; avvisi: readonly AvvisoInEmail[]; appUrl: string }): { oggetto: string; html: string; testo: string } {
  const urgenti = p.avvisi.filter((a) => a.urgente).length;
  const oggetto = urgenti > 0
    ? `Commesse generali: ${urgenti === 1 ? "una cosa urgente" : `${urgenti} cose urgenti`} da guardare`
    : `Commesse generali: ${p.avvisi.length === 1 ? "una cosa" : `${p.avvisi.length} cose`} da guardare questa settimana`;
  const perGenerale = new Map<string, AvvisoInEmail[]>();
  for (const a of p.avvisi) perGenerale.set(a.generale_id, [...(perGenerale.get(a.generale_id) ?? []), a]);
  const gruppi = [...perGenerale.values()].map((lista) => [...lista].sort((a, b) => Number(b.urgente) - Number(a.urgente)));
  const url = p.appUrl.replace(/\/$/, "");

  const blocchi = gruppi.map((lista) => {
    const righe = lista.slice(0, 12).map((a) => `
        <li style="margin:0 0 8px 0;">
          ${a.urgente ? '<span style="color:#B91C1C;font-weight:600;">Urgente</span> · ' : ""}<strong>${esc(a.titolo.split(" · ")[0])}</strong><br>
          <span style="color:#374151;">${esc(a.testo)}</span>
          ${url ? `<br><a href="${esc(url + a.link)}" style="color:#1D4ED8;font-size:13px;">Apri</a>` : ""}
        </li>`).join("");
    const altri = lista.length > 12 ? `<p style="margin:4px 0 0 0;color:#6B7280;font-size:13px;">…e altri ${lista.length - 12}.</p>` : "";
    return `
      <div style="margin:0 0 22px 0;">
        <h3 style="margin:0 0 8px 0;font-size:15px;color:#1E3A5F;">${esc(lista[0].generale)}</h3>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:#111827;">${righe}</ul>
        ${altri}
      </div>`;
  }).join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h2 style="margin:0 0 4px 0;font-size:19px;color:#1E3A5F;">Le tue commesse generali</h2>
      <p style="margin:0 0 18px 0;color:#6B7280;font-size:14px;">
        Ciao ${esc(p.nome ?? "")}, ${urgenti > 0 ? "c'è qualcosa che non può aspettare." : "ecco cosa guardare questa settimana."}
      </p>
      ${blocchi}
      <p style="margin:22px 0 0 0;color:#9CA3AF;font-size:12px;">
        Ricevi questo messaggio perché gestisci queste commesse o amministri l'azienda. Ogni avviso arriva una volta sola.
        Puoi spegnere queste email da Impostazioni → Notifiche.
      </p>
    </div>`;

  const testo = [
    `Le tue commesse generali — ${oggetto}`,
    ...gruppi.map((lista) => [
      "",
      lista[0].generale,
      ...lista.map((a) => `- ${a.urgente ? "[Urgente] " : ""}${a.testo}${url ? ` ${url}${a.link}` : ""}`),
    ].join("\n")),
    "",
    "Puoi spegnere queste email da Impostazioni → Notifiche.",
  ].join("\n");

  return { oggetto, html, testo };
}
