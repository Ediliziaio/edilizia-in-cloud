/**
 * Pop-up dell'opportunità (21/09/2026), due richieste del titolare:
 *
 * 1. La nota scritta nei Dettagli deve vedersi anche nella sezione «Note».
 *    Erano due archivi: il campo dei Dettagli è marketing_opportunities.notes,
 *    la sezione Note mostrava solo marketing_contact_notes. 11.330 opportunità
 *    — quasi tutte con la storia importata da GHL — sembravano senza note.
 * 2. Il pop-up non deve cambiare dimensione passando da una sezione all'altra.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync(resolve(process.cwd(), "src/components/opportunities/OpportunityDetailDialog.tsx"), "utf8");
const sezioneNote = sorgente.slice(sorgente.indexOf('{tab === "notes" && ('), sorgente.indexOf('{tab === "appointments" && ('));

describe("altezza del pop-up", () => {
  it("è fissa su desktop, non segue il contenuto della sezione", () => {
    expect(sorgente).toContain("sm:h-[min(88vh,880px)]");
    expect(sorgente).not.toMatch(/<DialogContent[^>]*sm:h-auto/);
  });
  it("su telefono resta a tutto schermo", () => {
    expect(sorgente).toMatch(/<DialogContent className="w-screen h-\[100dvh\]/);
  });
});

describe("una nota sola, visibile in due posti", () => {
  it("la sezione Note mostra in cima la nota della scheda, lo stesso campo dei Dettagli", () => {
    expect(sezioneNote).toContain("Nota dell'opportunità");
    expect(sezioneNote).toContain("value={oppNotes}");
    expect(sezioneNote).toContain("onChange={(e) => setOppNotes(e.target.value)}");
    // e sotto il registro, come prima
    expect(sezioneNote).toContain("Registro note");
    expect(sezioneNote).toContain("handleAddNote");
  });
  it("una modifica non salvata si vede, e si salva con «Aggiorna» come i Dettagli", () => {
    expect(sorgente).toContain('(oppNotes || "") !== (opportunity.notes || "")');
    expect(sezioneNote).toContain("premi «Aggiorna» per salvarla");
  });
  it("dai Dettagli si vede l'ultima nota del registro, e un clic porta a tutte", () => {
    expect(sorgente).toContain('onClick={() => setTab("notes")}');
    expect(sorgente).toContain("Registro note: {notes.length}");
  });
  it("la voce laterale conta entrambe", () => {
    expect(sorgente).toContain("const totaleNote = notes.length + (notaSchedaPresente ? 1 : 0);");
    expect(sorgente).toContain("label: totaleNote ? `Note (${totaleNote})` : \"Note\"");
  });
});
