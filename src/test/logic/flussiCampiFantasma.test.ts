import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_CATALOG } from "@/lib/flow-node-catalog";

/**
 * Nessun campo obbligatorio che il motore non legge.
 *
 * 11/09/2026, flusso «Facebook Green Energy»: trigger «Lead da campagna
 * Facebook» → «Crea opportunità» → «Aggiungi tag a contatto». Il nodo dei tag
 * diceva «Agisce sul contatto che attiva il flusso» e subito sotto «Da
 * completare: ID Contatto» — un campo che il pannello non mostrava più, ma lo
 * schema dichiarava obbligatorio. La checklist di pubblicazione usa lo stesso
 * schema: il flusso non si poteva pubblicare.
 *
 * Il motore (process-automation) esegue questi nodi SEMPRE sull'entità con cui
 * il flusso è partito (`entityId` dell'iscrizione): per un lead Facebook è il
 * contatto appena creato. Un campo «ID» nello schema era, nel migliore dei
 * casi, un requisito impossibile; nel peggiore, l'illusione di agire su
 * un'altra entità.
 */
const CAMPI_ENTITA = new Set(["contact_id", "entity_id", "lead_id", "opportunity_id", "deal_id"]);

describe("Il catalogo dei nodi non chiede id che il motore ignora", () => {
  it("i quattro nodi non hanno più il campo «ID»", () => {
    for (const id of ["aggiungi_tag", "rimuovi_tag", "assegna_agente", "aggiorna_campo"]) {
      const nodo = ACTION_CATALOG.find((a) => a.id === id);
      expect(nodo, id).toBeDefined();
      const campi = (nodo?.configSchema ?? []).map((f) => f.id);
      expect(campi.filter((c) => CAMPI_ENTITA.has(c)), id).toEqual([]);
    }
  });

  it("e restano obbligatori i campi che servono davvero", () => {
    const tag = ACTION_CATALOG.find((a) => a.id === "aggiungi_tag");
    expect(tag?.configSchema.find((f) => f.id === "tags")?.required).toBe(true);
    const campo = ACTION_CATALOG.find((a) => a.id === "aggiorna_campo");
    expect(campo?.configSchema.find((f) => f.id === "campo")?.required).toBe(true);
  });

  it("nessuna azione del catalogo chiede come obbligatorio l'id dell'entità del flusso", () => {
    // Regola generale, perché il difetto non torni su un nodo nuovo.
    const colpevoli = ACTION_CATALOG.flatMap((a) =>
      (a.configSchema ?? []).filter((f) => f.required && CAMPI_ENTITA.has(f.id)).map((f) => `${a.id}.${f.id}`));
    expect(colpevoli).toEqual([]);
  });
});

describe("Il motore agisce sull'entità del flusso", () => {
  const motore = readFileSync(resolve(process.cwd(), "supabase/functions/process-automation/index.ts"), "utf8");
  const blocco = (caso: string) => {
    const i = motore.indexOf(`case "${caso}": {`);
    return motore.slice(i, i + 2600);
  };

  it("add_tag / remove_tag / update_field usano entityId, non un id dalla configurazione", () => {
    for (const caso of ["add_tag", "remove_tag", "update_field"]) {
      const b = blocco(caso);
      expect(b, caso).toContain('.eq("id", entityId)');
      expect(b, caso).not.toMatch(/ncfg\.(contact_id|entity_id)/);
    }
  });

  it("il lead Facebook avvia il flusso con l'id del contatto appena creato", () => {
    const meta = readFileSync(resolve(process.cwd(), "supabase/functions/meta-process-leads/index.ts"), "utf8");
    expect(meta).toContain("entity_id: result.contactId");
    expect(motore).toContain('campagna_facebook_lead: "facebook_lead_received"');
  });
});
