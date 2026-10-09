/**
 * Il salvataggio di un preventivo che non riesce: il perché in italiano e l'avviso (07/10/2026).
 *
 * Prima i wizard scrivevano nel toast il testo grezzo dell'errore («TypeError: Failed to fetch»): chi lavora in cantiere,
 * senza rete, leggeva inglese tecnico. E dalla freccia «Esci», che esce solo a salvataggio riuscito, se il salvataggio era
 * rifiutato sempre (account bloccato, permesso tolto) non si usciva più: ora l'avviso offre «Esci comunque».
 */
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { avvisaSalvataggioFallito, ID_AVVISO_SALVATAGGIO_FALLITO, motivoSalvataggioNonRiuscito } from "@/lib/preventivatore/salvataggioFallito";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

beforeEach(() => vi.mocked(toast.error).mockClear());

describe("motivoSalvataggioNonRiuscito", () => {
  it.each([
    ["senza rete (TypeError del browser)", new TypeError("Failed to fetch"), "Connessione persa. Controlla la rete e riprova."],
    ["senza rete (come lo scrive supabase-js)", new Error("TypeError: Failed to fetch"), "Connessione persa. Controlla la rete e riprova."],
    ["Safari senza rete", new TypeError("Load failed"), "Connessione persa. Controlla la rete e riprova."],
    ["troppo lento", new Error("canceling statement due to statement timeout"), "L'operazione ha impiegato troppo tempo. Riprova."],
    ["sessione scaduta", new Error("JWT expired"), "Sessione scaduta. Accedi di nuovo per continuare."],
    ["permesso tolto (RLS)", new Error('new row violates row-level security policy for table "bgn_progetti"'), "Non hai i permessi per questa operazione. Contatta l'amministratore."],
    ["permesso negato (codice 42501, non un Error)", { code: "42501" }, "Non hai i permessi per questa operazione. Contatta l'amministratore."],
  ])("%s → frase italiana", (_nome, errore, atteso) => {
    expect(motivoSalvataggioNonRiuscito(errore)).toBe(atteso);
  });

  it.each([
    "Il salvataggio di questo intervento deve essere attivato nel database. Nessuna offerta generica è stata creata.",
    "Company non disponibile",
    "Un preventivo emesso non si modifica: duplicalo per farne una nuova versione.",
  ])("un messaggio scritto apposta per chi lavora (già in italiano) si legge com'è: %s", (testo) => {
    expect(motivoSalvataggioNonRiuscito(new Error(testo))).toBe(testo);
  });

  it.each([
    ["errore di una libreria", new TypeError("Cannot read properties of undefined (reading 'id')")],
    ["errore di PostgREST", new Error("JSON object requested, multiple (or no) rows returned")],
    ["errore senza testo", new Error("")],
    ["non un Error", undefined],
    ["una stringa tecnica", "unexpected token < in JSON at position 0"],
  ])("un testo tecnico che l'app non conosce non arriva a chi lavora (%s): frase generica", (_nome, errore) => {
    expect(motivoSalvataggioNonRiuscito(errore)).toBe("Il salvataggio non è andato a buon fine.");
  });
});

describe("avvisaSalvataggioFallito", () => {
  const ultimo = () => vi.mocked(toast.error).mock.calls.at(-1) as [string, { description: string; action?: { label: string; onClick: () => void }; duration?: number }];

  it("senza «Esci comunque» (Avanti, cambio di passo): il motivo e «sei ancora nel preventivo», nessuna azione", () => {
    avvisaSalvataggioFallito(new TypeError("Failed to fetch"));
    const [titolo, opzioni] = ultimo();
    expect(titolo).toBe("Salvataggio fallito");
    expect(opzioni.description).toBe("Connessione persa. Controlla la rete e riprova. Sei ancora nel preventivo: le modifiche non sono perse.");
    expect(opzioni.action).toBeUndefined();
  });

  it("dalla freccia: l'azione «Esci comunque» che esce, e dice che le ultime modifiche potrebbero andare perse", () => {
    const esci = vi.fn();
    avvisaSalvataggioFallito(new Error("JWT expired"), { esciComunque: esci });
    const [, opzioni] = ultimo();
    expect(opzioni.description).toContain("Sessione scaduta");
    expect(opzioni.description).toContain("Se esci comunque le ultime modifiche potrebbero andare perse.");
    expect(opzioni.action?.label).toBe("Esci comunque");
    expect(esci).not.toHaveBeenCalled();
    opzioni.action?.onClick();
    expect(esci).toHaveBeenCalledTimes(1);
    expect(opzioni.duration).toBeGreaterThanOrEqual(10_000); // il tempo di leggerlo e decidere
  });

  it("se il preventivo ha una copia di recupero (Serramenti) lo dice, invece di far temere di perdere tutto", () => {
    avvisaSalvataggioFallito(new TypeError("Failed to fetch"), { esciComunque: vi.fn(), conCopiaDiRecupero: true });
    const [, opzioni] = ultimo();
    expect(opzioni.description).toContain("Se esci comunque restano in una copia di recupero su questo dispositivo.");
    expect(opzioni.description).not.toContain("potrebbero andare perse");
  });

  it("ha sempre lo stesso id: chi mostra «Salvataggio fallito» per primo (la mutation) e la freccia che lo arricchisce non si impilano", () => {
    avvisaSalvataggioFallito(new TypeError("Failed to fetch"));
    avvisaSalvataggioFallito(new TypeError("Failed to fetch"), { esciComunque: vi.fn() });
    const chiamate = vi.mocked(toast.error).mock.calls as Array<[string, { id?: string }]>;
    expect(chiamate.map((c) => c[1].id)).toEqual([ID_AVVISO_SALVATAGGIO_FALLITO, ID_AVVISO_SALVATAGGIO_FALLITO]);
  });

  it("l'inglese tecnico non compare mai nell'avviso", () => {
    avvisaSalvataggioFallito(new TypeError("Failed to fetch"), { esciComunque: vi.fn() });
    avvisaSalvataggioFallito(new Error('new row violates row-level security policy for table "x"'), { esciComunque: vi.fn() });
    for (const [, opzioni] of vi.mocked(toast.error).mock.calls as Array<[string, { description: string }]>) {
      expect(opzioni.description).not.toMatch(/Failed to fetch|TypeError|row-level|policy|violates/);
    }
  });
});
