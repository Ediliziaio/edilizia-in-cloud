/**
 * Attività attaccate a qualcuno, e motivo della perdita cambiabile (23/09/2026).
 *
 * Elena (Ener Italia) ha creato «RICHIAMARE» per un'opportunità e se l'è
 * ritrovata slegata: nel database contact_id e opportunity_id erano vuoti,
 * perché il collegamento veniva buttato via quando non combaciava con la
 * CATEGORIA, e nella pagina Attività non c'era proprio un campo per sceglierlo.
 * Stesso giro: un'opportunità già persa si riprendeva sempre il vecchio motivo
 * e non c'era più modo di cambiarlo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collegamentiAttivita, idScelto } from "@/lib/attivita/collegamenti";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("a chi resta attaccata un'attività", () => {
  it("l'opportunità porta con sé il suo contatto: si vede anche nella scheda del cliente", () => {
    expect(collegamentiAttivita({ opportunityId: "opp-1" }, "cont-9")).toMatchObject({
      opportunity_id: "opp-1",
      contact_id: "cont-9",
    });
  });

  it("il contatto scelto a mano vince su quello dell'opportunità", () => {
    expect(collegamentiAttivita({ opportunityId: "opp-1", contactId: "cont-1" }, "cont-9").contact_id).toBe("cont-1");
  });

  it("«none» e il vuoto non sono un collegamento", () => {
    expect(idScelto("none")).toBeNull();
    expect(idScelto("  ")).toBeNull();
    expect(collegamentiAttivita({ contactId: "none", opportunityId: "" })).toEqual({
      contact_id: null, opportunity_id: null, order_id: null, stock_item_id: null, cost_id: null, ticket_id: null,
    });
  });

  it("senza opportunità non si inventa nessun contatto", () => {
    expect(collegamentiAttivita({}, "cont-9").contact_id).toBeNull();
  });

  it("commessa, magazzino, costo e ticket restano dove sono", () => {
    expect(collegamentiAttivita({ orderId: "o", stockItemId: "s", costId: "c", ticketId: "t" })).toMatchObject({
      order_id: "o", stock_item_id: "s", cost_id: "c", ticket_id: "t",
    });
  });
});

describe("le due finestre che creano attività", () => {
  it("la finestra condivisa salva i collegamenti senza guardare la categoria", () => {
    const sorgente = leggi("src/components/tasks/TaskDialog.tsx");
    expect(sorgente).toContain("...collegamentiAttivita(");
    // Prima: contact_id usciva solo con categoria «contatti»/«marketing».
    expect(sorgente).not.toMatch(/contact_id: \(category === "contatti"/);
    expect(sorgente).not.toMatch(/opportunity_id: \(category === "opportunita"/);
  });

  it("la pagina Attività ha il campo «Collegata a» e lo salva", () => {
    const sorgente = leggi("src/pages/azienda/AttivitaStaff.tsx");
    expect(sorgente).toContain("Collegata a");
    expect(sorgente).toContain("<CollegaAttivitaPicker");
    // Sia alla creazione sia alla modifica.
    expect(sorgente).toContain("...collegamentiDelModulo(task.collegamento)");
    expect(sorgente).toContain("...collegamentiDelModulo(formCollegamento)");
    // E la riga dell'elenco dice a chi è attaccata.
    expect(sorgente).toContain("etichettaCollegamento(t)");
  });
});

describe("motivo della perdita", () => {
  const scheda = leggi("src/components/opportunities/OpportunityDetailDialog.tsx");

  it("si legge e si cambia dalla scheda, anche quando l'opportunità è già persa", () => {
    expect(scheda).toContain("Motivo della perdita");
    expect(scheda).toContain('apriMotivoPerdita(status === "abandoned" ? "abandoned" : "lost")');
  });

  it("la finestra si apre con il motivo già scritto, non vuota", () => {
    expect(scheda).toContain('setLostCategory(lostCategory || opportunity.lost_reason_category || "")');
    expect(scheda).toContain('setLostReason(lostReason || opportunity.lost_reason || opportunity.loss_reason || "")');
    // Prima la svuotava a ogni apertura.
    expect(scheda).not.toContain('      setLostReason("");\n      setLostCategory("");');
  });

  it("gli import ci sono: senza, la scheda muore aprendosi", () => {
    expect(scheda).toContain('import { useLossReasons } from "@/hooks/useLossReasons";');
    expect(scheda).toContain('import { etichettaMotivo } from "@/lib/opportunita/motiviPerdita";');
  });
});
