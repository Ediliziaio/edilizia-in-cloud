import { describe, expect, it } from "vitest";
import {
  sembraErrorePostgresGrezzo,
  testoTecnico,
  traduciErrorePostgrest,
  userErrorMessage,
} from "@/lib/userErrorMessage";

// Il corpo che PostgREST ha davvero restituito il 7 settembre 2026, quando
// un titolare ha provato a cancellare un'opportunità con un preventivo
// fotovoltaico collegato.
const VINCOLO_FK = {
  code: "23503",
  details: 'Key (id)=(54dcbe36-c6ee-4849-b743-4615a739302a) is still referenced from table "fv_progetti".',
  hint: null as string | null,
  message:
    'update or delete on table "marketing_opportunities" violates foreign key constraint "fv_progetti_opportunita_crm_id_fkey" on table "fv_progetti"',
};

describe("traduciErrorePostgrest", () => {
  it("traduce il vincolo di chiave esterna e conserva l'originale in details", () => {
    const out = traduciErrorePostgrest(VINCOLO_FK);
    expect(out).not.toBeNull();
    expect(out!.message).toBe("Impossibile completare: l'elemento è collegato ad altri dati.");
    expect(out!.code).toBe("23503");
    expect(String(out!.details)).toContain("violates foreign key constraint");
    expect(String(out!.details)).toContain("is still referenced");
  });

  it("traduce duplicati, campi obbligatori, permessi e testi troppo lunghi", () => {
    expect(traduciErrorePostgrest({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })!.message)
      .toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
    expect(traduciErrorePostgrest({ code: "23502", message: 'null value in column "name" violates not-null constraint' })!.message)
      .toBe("Mancano alcuni dati obbligatori. Completa i campi richiesti.");
    expect(traduciErrorePostgrest({ code: "42501", message: 'new row violates row-level security policy for table "orders"' })!.message)
      .toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
    expect(traduciErrorePostgrest({ code: "22001", message: "value too long for type character varying(50)" })!.message)
      .toBe("Un testo è troppo lungo per il campo. Accorcialo e riprova.");
  });

  it("lascia intatto un RAISE EXCEPTION scritto in italiano, anche con codice 42501", () => {
    const trigger = {
      code: "42501",
      message: "Non si può togliere il ruolo di amministratore al titolare dell'azienda. Indica prima un altro titolare.",
    };
    expect(sembraErrorePostgresGrezzo(trigger.message)).toBe(false);
    expect(traduciErrorePostgrest(trigger)).toBeNull();
  });

  it("lascia intatti gli errori che nessun pattern riconosce (schema, colonne)", () => {
    expect(traduciErrorePostgrest({ code: "42703", message: "column o.client_id does not exist" })).toBeNull();
    expect(traduciErrorePostgrest({ code: "PGRST204", message: "Could not find the 'x' column of 'y' in the schema cache" })).toBeNull();
  });

  it("ignora corpi che non sono errori", () => {
    expect(traduciErrorePostgrest(null)).toBeNull();
    expect(traduciErrorePostgrest("testo")).toBeNull();
    expect(traduciErrorePostgrest([])).toBeNull();
    expect(traduciErrorePostgrest({ code: "23503" })).toBeNull();
    expect(traduciErrorePostgrest({ message: "" })).toBeNull();
  });

  it("dopo la traduzione userErrorMessage riconosce ancora l'errore dal codice", () => {
    const tradotto = traduciErrorePostgrest(VINCOLO_FK)!;
    expect(userErrorMessage(tradotto)).toBe("Impossibile completare: l'elemento è collegato ad altri dati.");
  });

  it("testoTecnico mette insieme messaggio e dettagli, così chi riconosce dal testo funziona ancora", () => {
    const tradotto = traduciErrorePostgrest({ code: "42501", message: 'permission denied for table "x"' })!;
    expect(tradotto.message).not.toContain("permission denied");
    expect(testoTecnico(tradotto).toLowerCase()).toContain("permission denied");
    expect(testoTecnico("stringa")).toBe("stringa");
    expect(testoTecnico(null)).toBe("");
  });
});
