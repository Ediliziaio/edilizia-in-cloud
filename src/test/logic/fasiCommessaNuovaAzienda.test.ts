import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  creaFasiCommessa,
  getOrderStatusTemplate,
  type CompanySector,
} from "../../../supabase/functions/_shared/fasiCommessa";
import { getOrderStatusTemplate as modelloAnteprima } from "@/lib/orderStatusTemplates";

// 24/09/2026 — le aziende create dal form admin nascevano con la sola fase
// «Assistenza»: il trigger su companies la crea da solo, l'indice ne ammette
// una, e create-company inseriva il modello intero (Assistenza compresa) in un
// colpo solo. L'INSERT cadeva tutto intero e l'errore finiva nel log.

const AZIENDA = "azienda-nuova";
const SETTORI: CompanySector[] = [
  "serramenti", "infissi", "bagni", "tetti", "fotovoltaico", "pittura", "ristrutturazioni", "altro",
];

interface Fase {
  id: string;
  company_id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
  is_default: boolean;
  is_support_phase: boolean;
}

type Errore = { message: string; code?: string } | null;

// order_statuses con quello che conta qui: l'«Assistenza» che il trigger
// `trg_ensure_assistenza_status` crea appena l'azienda nasce, e l'indice
// `order_statuses_one_support_phase_per_company`. Come in Postgres, un INSERT
// di più righe passa tutto o niente.
function tabellaFasi(opzioni: { senzaTrigger?: boolean; guasto?: "insert" | "update" } = {}) {
  const righe: Fase[] = [];
  let contatore = 0;
  if (!opzioni.senzaTrigger) {
    righe.push({
      id: "assistenza-del-trigger", company_id: AZIENDA, name: "Assistenza", icon: "LifeBuoy",
      color: "#F59E0B", position: 0, is_default: false, is_support_phase: true,
    });
  }
  const client = {
    from(tabella: string) {
      expect(tabella).toBe("order_statuses");
      return {
        select() {
          const filtri: Array<[keyof Fase, unknown]> = [];
          const catena = {
            eq(colonna: keyof Fase, valore: unknown) {
              filtri.push([colonna, valore]);
              return catena;
            },
            async maybeSingle() {
              const trovate = righe.filter((r) => filtri.every(([c, v]) => r[c] === v));
              return { data: trovate[0] ? { id: trovate[0].id } : null as { id: string } | null, error: null as Errore };
            },
          };
          return catena;
        },
        async insert(nuove: Array<Omit<Fase, "id">>) {
          if (opzioni.guasto === "insert") return { error: { message: "connessione persa" } as Errore };
          const dopo = [...righe, ...nuove.map((r) => ({ ...r, id: `fase-${++contatore}` }))];
          const supporto = dopo.filter((r) => r.company_id === AZIENDA && r.is_support_phase);
          if (supporto.length > 1) {
            return {
              error: {
                code: "23505",
                message: 'duplicate key value violates unique constraint "order_statuses_one_support_phase_per_company"',
              } as Errore,
            };
          }
          righe.splice(0, righe.length, ...dopo);
          return { error: null as Errore };
        },
        update(modifica: Partial<Fase>) {
          return {
            async eq(colonna: keyof Fase, valore: unknown) {
              if (opzioni.guasto === "update") return { error: { message: "timeout" } as Errore };
              for (const r of righe) if (r[colonna] === valore) Object.assign(r, modifica);
              return { error: null as Errore };
            },
          };
        },
      };
    },
  };
  const inOrdine = () => [...righe].sort((a, b) => a.position - b.position);
  return { client, righe, inOrdine };
}

describe("fasi commessa di un'azienda nuova", () => {
  it("il vecchio inserimento in blocco cade tutto contro l'indice: resta la sola «Assistenza»", async () => {
    const { client, righe } = tabellaFasi();
    const { error } = await client.from("order_statuses").insert(
      getOrderStatusTemplate("fotovoltaico").map((f, i) => ({
        company_id: AZIENDA, name: f.name, icon: f.icon, color: f.color, position: f.position,
        is_default: i === 0, is_support_phase: f.is_support_phase === true,
      })),
    );
    expect(error?.code).toBe("23505");
    expect(righe.map((r) => r.name)).toEqual(["Assistenza"]);
  });

  it.each(SETTORI)("%s: tutte le fasi del modello, «Contratto Firmato» predefinita, «Assistenza» una e in fondo", async (settore) => {
    const modello = getOrderStatusTemplate(settore);
    const { client, inOrdine } = tabellaFasi();

    const esito = await creaFasiCommessa(client, AZIENDA, settore);

    expect(esito).toEqual({ fasi: modello.length });
    const fasi = inOrdine();
    expect(fasi.map((f) => f.name)).toEqual(modello.map((f) => f.name));
    expect(fasi.map((f) => f.position)).toEqual(modello.map((_, i) => i));
    expect(fasi.filter((f) => f.is_default).map((f) => f.name)).toEqual(["Contratto Firmato"]);
    const supporto = fasi.filter((f) => f.is_support_phase);
    expect(supporto).toHaveLength(1);
    // è la riga del trigger, spostata: niente doppioni, niente id nuovi
    expect(supporto[0]).toMatchObject({ id: "assistenza-del-trigger", name: "Assistenza", position: modello.length - 1 });
  });

  it("bagni: lo stesso risultato di Bagni Milano, creata a mano il 15/09", async () => {
    const { client, inOrdine } = tabellaFasi();
    await creaFasiCommessa(client, AZIENDA, "bagni");
    expect(inOrdine().map((f) => `${f.position} ${f.name}${f.is_default ? " *" : ""}`)).toEqual([
      "0 Contratto Firmato *", "1 Acconto Pagato", "2 Rilievo Tecnico", "3 Progettazione",
      "4 Ordine Materiali", "5 Demolizioni", "6 Impianti", "7 Posa", "8 Finiture", "9 Consegna",
      "10 Assistenza",
    ]);
  });

  it("senza il trigger l'«Assistenza» la crea la funzione", async () => {
    const { client, inOrdine } = tabellaFasi({ senzaTrigger: true });
    const esito = await creaFasiCommessa(client, AZIENDA, "altro");
    expect(esito).toEqual({ fasi: 4 });
    expect(inOrdine().map((f) => [f.name, f.is_support_phase])).toEqual([
      ["Contratto Firmato", false], ["In Lavorazione", false], ["Completato", false], ["Assistenza", true],
    ]);
  });

  it("se l'inserimento fallisce, l'errore torna a chi chiama", async () => {
    const { client } = tabellaFasi({ guasto: "insert" });
    expect(await creaFasiCommessa(client, AZIENDA, "serramenti")).toEqual({ fasi: 0, errore: "connessione persa" });
  });

  it("se l'«Assistenza» non scende in fondo, l'errore torna a chi chiama", async () => {
    const { client } = tabellaFasi({ guasto: "update" });
    const esito = await creaFasiCommessa(client, AZIENDA, "serramenti");
    expect(esito.errore).toContain("timeout");
  });

  it("l'anteprima del form admin mostra lo stesso modello che la funzione crea", () => {
    expect(modelloAnteprima).toBe(getOrderStatusTemplate);
  });
});

describe("chi crea un'azienda non ingoia più l'errore sulle fasi", () => {
  const sorgente = (funzione: string) =>
    readFileSync(join(__dirname, "../../../supabase/functions", funzione, "index.ts"), "utf8");

  it.each([
    ["create-company", "creaFasiCommessa(supabaseAdmin, companyId, sector)", "supabaseAdmin.auth.admin.createUser("],
    ["public-checkout", "creaFasiCommessa(admin, companyId, sector)", "admin.auth.admin.createUser("],
  ])("%s: fasi subito dopo l'azienda; se falliscono, l'azienda si toglie e torna un errore", (funzione, chiamata, creaUtente) => {
    const codice = sorgente(funzione);
    const inizio = codice.indexOf(chiamata);
    const fine = codice.indexOf(creaUtente);
    expect(inizio).toBeGreaterThan(-1);
    expect(inizio).toBeLessThan(fine);
    const seFallisce = codice.slice(inizio, fine);
    expect(seFallisce).toContain('.from("companies").delete().eq("id", companyId)');
    expect(seFallisce).toMatch(/return (errorResponse|json)\(/);
    // nessun modello proprio e nessun INSERT diretto sulle fasi
    expect(codice).not.toMatch(/from\("order_statuses"\)\s*\.(insert|upsert)\(/);
    expect(codice).not.toContain("is_support_phase");
  });
});
