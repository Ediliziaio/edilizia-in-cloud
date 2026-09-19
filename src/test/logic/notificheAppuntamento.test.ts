import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AppuntamentoDaNotificare, type ContestoConsulente,
  baseDellaChiave, chiaveAppuntamento, emailAnnullamento, emailConferma, emailConsulente, emailPromemoria,
  emailSpostamento, icsCliente, luogoAppuntamento, quandoDallaChiave,
} from "../../../supabase/functions/_shared/notificheAppuntamento";

/**
 * Email automatiche degli appuntamenti (Il Bagno Group, 18/09/2026): in
 * italiano, al cliente mai le note, lo showroom del consulente o l'indirizzo
 * per chi lavora fuori e per i rilievi.
 */

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function appuntamento(extra: Partial<AppuntamentoDaNotificare> = {}): AppuntamentoDaNotificare {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    company_id: "acfc59e3-ad4e-40a7-b0f5-e006f7341508",
    data: "2026-09-24",
    ora: "10:00",
    ora_fine: "11:00",
    inizio: "2026-09-24T08:00:00+00:00",
    tipo: "sopralluogo_preventivo",
    stato: "confermato",
    bloccato: false,
    pubblico: false,
    creato_il: "2026-09-20T09:00:00+00:00",
    titolo: "Rossi Mario | Il Bagno Group Show-room Lissone - Via Nuova Valassina 27",
    descrizione: "NOTA DEL CONSULENTE: vuole la vasca",
    note_interne: "INTERNA: cliente difficile",
    link_video: null,
    indirizzo: null,
    indirizzo_via: null,
    indirizzo_citta: null,
    fuori_sede: false,
    azienda: { nome: "Il Bagno Group", piva: "01544570136", email: "christian@ilbagnogroup.com", telefono: null, notifiche_dal: "2026-09-19T00:00:00+00:00" },
    consulente: { id: "7a3491f4-dc6e-426c-ad8f-1648e502f130", nome: "Camilla", cognome: "Nespola", email: "camilla@ilbagnogroup.com", telefono: null },
    sede: { nome: "Lissone", via: "Via Nuova Valassina 27", cap: "20851", citta: "Lissone", prov: "MB" },
    cliente: { id: "c1", nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.com", telefono: "+39 333 1234567", indirizzo: "Via Garibaldi 5, 20900 Monza (MB)" },
    creato_da: "Christian Morgillo",
    ...extra,
  };
}

const rilievo = () => appuntamento({
  tipo: "rilievo_tecnico",
  data: "2026-09-22",
  ora: "08:15",
  ora_fine: "09:15",
  inizio: "2026-09-22T06:15:00+00:00",
  fuori_sede: true,
  sede: null,
  indirizzo: "Via Roma 1, 20900 Monza (MB)",
  indirizzo_via: "Via Roma 1",
  indirizzo_citta: "Monza",
  consulente: { id: "218a4171-4c06-4b3e-a1d2-c682476ea023", nome: "William", cognome: "Meroni", email: "william@ilbagnogroup.com", telefono: null },
});

describe("Dove si svolge", () => {
  it("in showroom: nome, indirizzo e link a Google Maps", () => {
    const l = luogoAppuntamento(appuntamento())!;
    expect(l.etichetta).toBe("Show-room di Lissone");
    expect(l.indirizzo).toBe("Via Nuova Valassina 27, 20851 Lissone (MB)");
    expect(l.link).toContain("google.com/maps");
    expect(l.frase).toBe("nel nostro show-room di Lissone");
  });

  it("il rilievo si fa all'indirizzo dell'appuntamento", () => {
    const l = luogoAppuntamento(rilievo())!;
    expect(l.etichetta).toBe("Via Roma 1, 20900 Monza (MB)");
    expect(l.frase).toBe("in Via Roma 1, 20900 Monza (MB)");
  });

  it("rilievo senza indirizzo: quello del cliente", () => {
    const l = luogoAppuntamento(appuntamento({ tipo: "rilievo_tecnico", fuori_sede: true, sede: null }))!;
    expect(l.etichetta).toBe("Via Garibaldi 5, 20900 Monza (MB)");
    expect(l.frase).toContain("a casa tua");
  });

  it("senza showroom né indirizzo niente riga «Dove»: meglio niente che un luogo inventato", () => {
    expect(luogoAppuntamento(appuntamento({ sede: null }))).toBeNull();
  });

  it("videochiamata con il suo link", () => {
    const l = luogoAppuntamento(appuntamento({ tipo: "videocall", sede: null, link_video: "https://meet.google.com/abc" }))!;
    expect(l.etichetta).toBe("Videochiamata");
    expect(l.link).toBe("https://meet.google.com/abc");
  });
});

describe("Chiave di ciò che il cliente sa", () => {
  it("cambia con l'ora, non con il testo dell'indirizzo riscritto da Google", () => {
    const a = rilievo();
    const k = chiaveAppuntamento(a, luogoAppuntamento(a));
    const altroTesto = rilievo();
    altroTesto.indirizzo = "Via Roma, 1, Monza MB, Italia";
    expect(chiaveAppuntamento(altroTesto, luogoAppuntamento(altroTesto))).toBe(k);
    const piuTardi = rilievo();
    piuTardi.ora = "09:00";
    expect(chiaveAppuntamento(piuTardi, luogoAppuntamento(piuTardi))).not.toBe(k);
  });

  it("dalla chiave registrata si rilegge quando era", () => {
    const a = appuntamento();
    const k = `${chiaveAppuntamento(a, luogoAppuntamento(a))}#0`;
    expect(baseDellaChiave(k)).toBe(chiaveAppuntamento(a, luogoAppuntamento(a)));
    expect(quandoDallaChiave(k)).toEqual({ data: "2026-09-24", ora: "10:00" });
  });
});

describe("Email al cliente", () => {
  it("conferma in showroom, in italiano, firmata dal consulente", () => {
    const a = appuntamento();
    const e = emailConferma(a, luogoAppuntamento(a));
    expect(e.oggetto).toBe("Appuntamento confermato: giovedì 24 settembre alle 10:00");
    expect(e.testo).toContain("Ciao Mario,");
    expect(e.testo).toContain("ti confermiamo l'appuntamento nel nostro show-room di Lissone.");
    expect(e.testo).toContain("Via Nuova Valassina 27, 20851 Lissone (MB)");
    expect(e.testo).toContain("Camilla Nespola");
    expect(e.testo).toContain("Il Bagno Group — P.IVA 01544570136");
  });

  it("col telefono in anagrafica il cliente può anche chiamare", () => {
    const a = appuntamento({ azienda: { nome: "Il Bagno Group", piva: null, email: null, telefono: "031.696031", notifiche_dal: null } });
    const l = luogoAppuntamento(a);
    const e = emailConferma(a, l);
    expect(e.testo).toContain("Se hai un imprevisto, rispondi a questa email o chiamaci allo 031.696031: troviamo insieme un altro orario.");
    expect(e.html).toContain('href="tel:031696031"');
    expect(emailPromemoria(a, l, new Date("2026-09-23T08:00:00Z")).testo).toContain("o chiamaci allo 031.696031 e troviamo un altro orario.");
    expect(emailAnnullamento(a, l).testo).toContain("rispondi a questa email o chiamaci allo 031.696031.");
    // Senza P.IVA niente piè di pagina: il nome è già nella firma.
    expect(e.testo.match(/Il Bagno Group/g)?.length).toBe(1);
  });

  it("il rilievo di William: indirizzo del cliente e parole giuste", () => {
    const a = rilievo();
    const e = emailConferma(a, luogoAppuntamento(a));
    expect(e.oggetto).toBe("Rilievo tecnico confermato: martedì 22 settembre alle 08:15");
    expect(e.testo).toContain("ti confermiamo il rilievo tecnico in Via Roma 1, 20900 Monza (MB).");
    expect(e.testo).toContain("William Meroni");
    expect(e.testo).toContain("farti trovare");
  });

  it("accorda il femminile", () => {
    const a = appuntamento({ tipo: "misurazione", fuori_sede: true, sede: null, indirizzo: "Via Roma 1, Monza" });
    expect(emailConferma(a, luogoAppuntamento(a)).oggetto).toMatch(/^Misurazione confermata:/);
    expect(emailAnnullamento(a, luogoAppuntamento(a)).testo).toContain("è stata annullata");
  });

  it("mai le note al cliente, in nessuna email", () => {
    const a = appuntamento();
    const l = luogoAppuntamento(a);
    const tutte = [
      emailConferma(a, l),
      emailSpostamento(a, l, { data: "2026-09-23", ora: "09:00" }),
      emailAnnullamento(a, l),
      emailPromemoria(a, l, new Date("2026-09-23T08:00:00Z")),
    ];
    for (const e of tutte) {
      for (const pezzo of [e.oggetto, e.html, e.testo]) {
        expect(pezzo).not.toContain("NOTA DEL CONSULENTE");
        expect(pezzo).not.toContain("INTERNA");
      }
    }
  });

  it("spostato: dice quando era prima", () => {
    const a = appuntamento();
    const e = emailSpostamento(a, luogoAppuntamento(a), { data: "2026-09-23", ora: "09:00" });
    expect(e.oggetto).toBe("Appuntamento spostato: giovedì 24 settembre alle 10:00");
    expect(e.testo).toContain("prima era mercoledì 23 settembre 2026 alle 09:00");
  });

  it("cambiato solo il consulente: «aggiornato», non «spostato»", () => {
    const a = appuntamento();
    const e = emailSpostamento(a, luogoAppuntamento(a), { data: "2026-09-24", ora: "10:00" });
    expect(e.oggetto).toMatch(/^Appuntamento aggiornato:/);
  });

  it("promemoria del giorno prima", () => {
    const a = appuntamento();
    const e = emailPromemoria(a, luogoAppuntamento(a), new Date("2026-09-23T08:00:00Z"));
    expect(e.oggetto).toBe("Ci vediamo domani alle 10:00");
    expect(e.testo).toContain("ti ricordiamo l'appuntamento di domani, giovedì 24 settembre, alle 10:00.");
    const r = rilievo();
    expect(emailPromemoria(r, luogoAppuntamento(r), new Date("2026-09-21T06:15:00Z")).oggetto).toBe("Rilievo tecnico domani alle 08:15");
  });

  it("il file per il calendario: luogo, titolo, e la disdetta che lo toglie", () => {
    const a = appuntamento();
    const ics = icsCliente(a, luogoAppuntamento(a), { sequenza: 0 })!;
    expect(ics).toContain("SUMMARY:Appuntamento — Il Bagno Group");
    expect(ics).toContain("LOCATION:Via Nuova Valassina 27\\, 20851 Lissone (MB)");
    expect(ics).toContain("METHOD:REQUEST");
    const disdetta = icsCliente(a, luogoAppuntamento(a), { annullato: true, sequenza: 1 })!;
    expect(disdetta).toContain("METHOD:CANCEL");
    expect(disdetta).toContain("SEQUENCE:1");
    expect(icsCliente(appuntamento({ ora: null }), null, { sequenza: 0 })).toBeNull();
  });
});

describe("Email al consulente", () => {
  const ctx: ContestoConsulente = { autore: "Christian Morgillo", prima: null, clienteAvvisato: true, linkCalendario: "https://app.ediliziaincloud.com/azienda/marketing/calendario" };

  it("nuovo appuntamento: chi, quando, note, contatti e se il cliente è avvisato", () => {
    const a = appuntamento();
    const e = emailConsulente("consulente_nuovo", a, luogoAppuntamento(a), ctx);
    expect(e.oggetto).toBe("Nuovo appuntamento: Mario Rossi — gio 24 set alle 10:00");
    expect(e.testo).toContain("Fissato da Christian Morgillo.");
    expect(e.testo).toContain("NOTA DEL CONSULENTE");
    expect(e.testo).toContain("INTERNA");
    expect(e.html).toContain("tel:+393331234567");
    expect(e.testo).toContain("Il cliente ha ricevuto la conferma via email.");
  });

  it("cliente senza email: il consulente lo sa", () => {
    const a = appuntamento();
    const e = emailConsulente("consulente_nuovo", a, luogoAppuntamento(a), { ...ctx, clienteAvvisato: false });
    expect(e.testo).toContain("Il cliente non ha un indirizzo email: avvisalo tu.");
  });

  it("senza cliente collegato vale il titolo scritto dal call center", () => {
    const a = appuntamento({ cliente: null, titolo: "ROSSI - 333 1234567 - 2 mobili" });
    const e = emailConsulente("consulente_nuovo", a, luogoAppuntamento(a), { ...ctx, clienteAvvisato: false });
    expect(e.oggetto).toContain("ROSSI - 333 1234567 - 2 mobili");
    expect(e.testo).toContain("All'appuntamento non è collegato nessun cliente.");
  });

  it("spostato da un altro: quando era prima", () => {
    const a = appuntamento();
    const e = emailConsulente("consulente_spostamento", a, luogoAppuntamento(a), { ...ctx, prima: { data: "2026-09-23", ora: "09:00" } });
    expect(e.testo).toContain("Christian Morgillo l'ha spostato: prima era mercoledì 23 settembre alle 09:00.");
  });
});

describe("Collegamenti fra database e funzione", () => {
  const migrazione = leggi("supabase/migrations/20280919121000_notifiche_appuntamenti.sql");
  const funzione = leggi("supabase/functions/appuntamenti-notifiche/index.ts");

  it("spente di default, e niente email agli appuntamenti nati prima di accenderle", () => {
    expect(migrazione).toContain("add column if not exists appuntamenti_notifiche_dal timestamptz");
    expect(migrazione).toContain("if v_dal is null or new.created_at < v_dal then");
  });

  it("le prenotazioni dalla pagina pubblica hanno le loro email: qui restano fuori", () => {
    expect(migrazione).toContain("if new.is_blocked_slot or new.booking_email is not null then");
    expect(funzione).toContain("if (a.bloccato || a.pubblico)");
  });

  it("un errore del trigger non impedisce mai di salvare un appuntamento", () => {
    expect(migrazione).toMatch(/exception when others then\s+-- Il giro dei 15 minuti recupera la conferma al cliente\.\s+return null;/);
  });

  it("il consulente è avvisato solo dal cambio di un'altra persona", () => {
    expect(funzione).toContain("if (ctx.autore && consulente?.id && ctx.autore !== consulente.id");
  });

  it("la stessa email non parte due volte", () => {
    expect(migrazione).toContain("unique (appointment_id, tipo, chiave)");
    expect(funzione).toContain('if (!prenotata) return { tipo, esito: "già fatta" };');
  });

  it("la funzione accetta il segreto interno del trigger e del cron", () => {
    expect(leggi("supabase/config.toml")).toMatch(/\[functions\.appuntamenti-notifiche\]\s+verify_jwt = false/);
    expect(funzione).toContain("cronSecretValido(req)");
  });
});
