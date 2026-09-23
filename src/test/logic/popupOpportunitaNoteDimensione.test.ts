/**
 * Pop-up dell'opportunità: una nota sola, e dimensione fissa.
 *
 * 21/09/2026 — il campo «Note» dei Dettagli (marketing_opportunities.notes) era
 * stato specchiato dentro la sezione Note, perché 11.330 opportunità importate
 * da GHL sembravano senza note. Restavano però due riquadri per la stessa cosa.
 *
 * 23/09/2026, il titolare: «avere due note non va bene per niente». Adesso il
 * posto è uno: gli «Appunti», ognuno con data e autore
 * (marketing_contact_notes). Quello che i flussi automatici scrivono nel campo
 * della scheda — moduli, lead Meta, import, risposte del freddo — ci finisce da
 * solo, spostato dal trigger nota_scheda_nel_registro, e il campo resta vuoto.
 * Si chiamano «Appunti» e non «Registro note»: il «Registro attività» è la
 * linguetta accanto, e due registri nella stessa scheda confondevano.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(resolve(process.cwd(), "src/components/opportunities/OpportunityDetailDialog.tsx"), "utf8");
const sezioneNote = sorgente.slice(sorgente.indexOf('{tab === "notes" && ('), sorgente.indexOf('{tab === "appointments" && ('));
const migrazione = readFileSync(resolve(process.cwd(), "supabase/migrations/20280923140000_una_nota_sola_opportunita.sql"), "utf8");

describe("altezza del pop-up", () => {
  it("è fissa su desktop, non segue il contenuto della sezione", () => {
    expect(sorgente).toContain("sm:h-[min(88vh,880px)]");
    expect(sorgente).not.toMatch(/<DialogContent[^>]*sm:h-auto/);
  });
  it("su telefono resta a tutto schermo", () => {
    expect(sorgente).toMatch(/<DialogContent className="w-screen h-\[100dvh\]/);
  });
});

describe("un posto solo: gli Appunti", () => {
  it("la sezione si chiama Appunti, e non ha più il riquadro della scheda", () => {
    expect(sezioneNote).toContain('<span className="text-xs font-medium">Appunti</span>');
    expect(sezioneNote).toContain("handleAddNote");
    expect(sezioneNote).not.toContain("Nota dell'opportunità");
    expect(sezioneNote).not.toContain("oppNotes");
  });

  it("«Registro» resta al registro attività, non agli appunti", () => {
    expect(sorgente).toContain('label: "Registro attività"');
    expect(sorgente).not.toContain("Registro note");
  });

  it("nei Dettagli non si scrive più nel campo della scheda", () => {
    expect(sorgente).not.toContain("oppNotes");
    expect(sorgente).not.toContain("notes: oppNotes");
    // il salvataggio dell'opportunità non tocca il campo notes
    const salvataggio = sorgente.slice(sorgente.indexOf("updateOpp.mutate({"), sorgente.indexOf("onSuccess: async () => {"));
    expect(salvataggio).not.toMatch(/\bnotes:/);
  });

  it("dai Dettagli si vede l'ultimo appunto, e un clic porta a tutti", () => {
    expect(sorgente).toContain('onClick={() => setTab("notes")}');
    expect(sorgente).toContain("Appunti: {notes.length}");
    expect(sorgente).toContain("Nessun appunto · <span className=\"text-primary\">scrivine uno</span>");
  });

  it("la voce laterale conta gli appunti", () => {
    expect(sorgente).toContain("const totaleNote = notes.length;");
    expect(sorgente).toContain("label: totaleNote ? `Appunti (${totaleNote})` : \"Appunti\"");
  });
});

describe("il testo scritto nel campo della scheda diventa un appunto", () => {
  it("il trigger scatta su inserimento e modifica, solo quando c'è del testo", () => {
    expect(migrazione).toContain("after insert or update of notes on public.marketing_opportunities");
    expect(migrazione).toContain("when (coalesce(btrim(new.notes), '') <> '')");
  });

  it("scrive l'appunto e svuota il campo", () => {
    expect(migrazione).toContain("insert into public.marketing_contact_notes");
    expect(migrazione).toContain("update public.marketing_opportunities set notes = null where id = new.id;");
  });

  it("non fa doppioni se la stessa nota viene riscritta, e senza contatto non tocca niente", () => {
    expect(migrazione).toContain("if new.contact_id is null then");
    expect(migrazione).toContain("and btrim(n.content) = v_testo");
  });
});
