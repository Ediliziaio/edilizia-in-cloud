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
import { execSync } from "node:child_process";
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
    // E i due menu si vedono con qualunque categoria: anche un'attività nata
    // dall'aggiunta rapida si deve poter attaccare a un cliente.
    expect(sorgente).not.toMatch(/\{\(category === "contatti" \|\| category === "marketing"[^)]*\) && \(\s*<div className="space-y-2">\s*<Label>Contatto collegato/);
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

describe("perché non ricapiti a nessuno", () => {
  it("il database attacca da solo il contatto dell'opportunità", () => {
    const migrazione = leggi("supabase/migrations/20280923120000_attivita_collegate_al_contatto.sql");
    expect(migrazione).toContain("create trigger trg_attivita_contatto_dell_opportunita");
    expect(migrazione).toContain("before insert or update of opportunity_id, contact_id on public.tasks");
    // Solo in questa direzione: un contatto può avere più opportunità.
    expect(migrazione).toContain("new.opportunity_id is not null and new.contact_id is null");
  });

  it("le automazioni attaccano l'attività a ciò che ha fatto partire il flusso", () => {
    const motore = leggi("supabase/functions/process-automation/index.ts");
    expect(motore).toContain("...collegamentiDelFlusso(queueItem?.entity_type, entityId)");
    expect(motore).toMatch(/opportunity_id: id && tipo === "opportunity"/);
    expect(motore).toMatch(/order_id: id && tipo === "order"/);
  });

  it("nessun punto dell'app crea attività senza poterle collegare", () => {
    // Chi crea un'attività che non appartiene a un cliente (un promemoria
    // personale, una segnalazione di magazzino) è elencato qui, col motivo.
    const senzaCliente: Record<string, string> = {
      "src/pages/campo/CampoAttivita.tsx": "promemoria personale di chi è in cantiere",
      "src/pages/tecnico/TecnicoFurgone.tsx": "segnalazione di riordino materiali, non di un cliente",
      "src/pages/azienda/UnifiedTasks.tsx": "copia di un'attività esistente: i collegamenti li porta la riga copiata",
      "src/components/attivita/TaskQuickAdd.tsx": "aggiunta rapida: il collegamento si mette aprendo l'attività",
    };
    const collegamenti = /contact_id|opportunity_id|order_id|ticket_id|collegamentiAttivita|collegamentiDelModulo/;

    // Solo chi scrive DAVVERO nella tabella tasks: si guarda l'istruzione, non
    // il file (un file può leggere le attività e scrivere altrove).
    const creaAttivita = (sorgente: string) =>
      sorgente.split('from("tasks")').slice(1)
        .some((dopo) => dopo.slice(0, dopo.indexOf(";") + 1 || 400).includes(".insert("));

    const file = execSync(String.raw`grep -rl 'from("tasks")' src --include=*.ts --include=*.tsx`, { encoding: "utf8" })
      .split("\n").map((f) => f.trim()).filter(Boolean)
      .filter((f) => !f.startsWith("src/test/"))
      .filter((f) => creaAttivita(leggi(f)));

    expect(file.length).toBeGreaterThan(0);
    for (const f of file) {
      if (senzaCliente[f]) continue;
      expect(leggi(f), `${f} crea attività senza collegarle a nessuno`).toMatch(collegamenti);
    }
  });
});
