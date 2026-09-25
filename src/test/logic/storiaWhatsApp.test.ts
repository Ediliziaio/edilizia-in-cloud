/**
 * La storia della chat WhatsApp per l'LLM (25/09/2026).
 *
 * I bot di prima leggevano solo i messaggi del cliente (`from_phone` = il
 * cliente): non vedevano le proprie risposte, e rifacevano le domande.
 */
import { describe, expect, it } from "vitest";
import { testoDelMessaggio, turniPerLlm, type RigaMessaggio } from "../../../supabase/functions/_shared/storiaWhatsApp";

function riga(direction: "inbound" | "outbound", testo: string | null, minuto: number, tipo = "text"): RigaMessaggio {
  return { direction, message_type: tipo, content_text: testo, created_at: `2026-09-25T10:${String(minuto).padStart(2, "0")}:00Z` };
}

describe("turniPerLlm", () => {
  it("mette in ordine i due versi della chat", () => {
    const righe = [
      riga("inbound", "Sì, mi interessa", 3),
      riga("outbound", "Ciao Marco, sono Giusy", 1),
      riga("outbound", "Posso farti qualche domanda?", 4),
    ];
    expect(turniPerLlm(righe)).toEqual([
      { role: "assistant", content: "Ciao Marco, sono Giusy" },
      { role: "user", content: "Sì, mi interessa" },
      { role: "assistant", content: "Posso farti qualche domanda?" },
    ]);
  });

  it("ordina per tempo anche con i millesimi nel formato di PostgREST", () => {
    const righe: RigaMessaggio[] = [
      { direction: "outbound", message_type: "text", content_text: "dopo", created_at: "2026-09-25T10:00:00.5+00:00" },
      { direction: "inbound", message_type: "text", content_text: "prima", created_at: "2026-09-25T10:00:00+00:00" },
    ];
    expect(turniPerLlm(righe).map((t) => t.content)).toEqual(["prima", "dopo"]);
  });

  it("unisce i messaggi di fila dello stesso lato", () => {
    const righe = [riga("inbound", "Buongiorno", 1), riga("inbound", "Sono di Monza", 2)];
    expect(turniPerLlm(righe)).toEqual([{ role: "user", content: "Buongiorno\nSono di Monza" }]);
  });

  it("tiene solo gli ultimi turni", () => {
    const righe = Array.from({ length: 10 }, (_, i) => riga(i % 2 ? "outbound" : "inbound", `m${i}`, i));
    const turni = turniPerLlm(righe, 4);
    expect(turni.map((t) => t.content)).toEqual(["m6", "m7", "m8", "m9"]);
  });
});

describe("testoDelMessaggio", () => {
  it("vocali, foto e messaggi vuoti diventano una nota che l'agente capisce", () => {
    expect(testoDelMessaggio("audio", null)).toMatch(/vocale/);
    expect(testoDelMessaggio("voice", "")).toMatch(/vocale/);
    expect(testoDelMessaggio("image", "il mio bagno")).toBe("[Il cliente ha mandato una foto] il mio bagno");
    expect(testoDelMessaggio("text", "   ")).toBe("[Messaggio vuoto]");
    expect(testoDelMessaggio("text", " ciao ")).toBe("ciao");
  });
});
