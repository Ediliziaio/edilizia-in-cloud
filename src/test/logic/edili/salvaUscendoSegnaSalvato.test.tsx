/**
 * `useSalvaUscendo`, l'uscita unica dai preventivi edili (06/10/2026).
 *
 * La freccia «Esci» salva ORA ed esce solo se il salvataggio riesce, poi dice all'hook che quel modulo è già scritto
 * (`segnaSalvato`): la chiusura della pagina non lo risalva, anche se «dirty» non ha fatto in tempo a tornare falso
 * (il salvataggio e il cambio di pagina arrivano nello stesso giro e la pagina si smonta prima di rifarsi). Se dopo
 * si è scritto ancora, il modulo è un altro e la chiusura salva quello. Se il salvataggio di chiusura fallisce lo
 * dice un solo avviso: la pagina non c'è più e le modifiche non tornano da sole.
 */
import { renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSalvaUscendo } from "@/hooks/useSalvaUscendo";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

type Modulo = { cliente_nome?: string };
type Props = { id: string | undefined; dirty: boolean; form: Modulo };
type Salva = (patch: Modulo & { id: string }) => Promise<unknown>;

const monta = (iniziale: Props, salva: Salva = vi.fn<Salva>(() => Promise.resolve({ ok: true }))) => {
  const vista = renderHook((p: Props) => useSalvaUscendo<Modulo>({ ...p, salva }), { initialProps: iniziale });
  return { ...vista, salva: salva as ReturnType<typeof vi.fn<Salva>> };
};

beforeEach(() => vi.mocked(toast.error).mockClear());

describe("segnaSalvato: cosa la chiusura non risalva", () => {
  it("il modulo che la freccia ha già salvato non si risalva alla chiusura", () => {
    const salvato: Modulo = { cliente_nome: "Anna" };
    const { result, unmount, salva } = monta({ id: "p1", dirty: true, form: salvato });
    result.current.segnaSalvato(salvato); // la freccia ha scritto «Anna»: «dirty» resta vero fino alla pagina dopo
    unmount();
    expect(salva).not.toHaveBeenCalled();
  });

  it("se dopo si è scritto ancora, la chiusura salva il modulo più recente, una volta sola", () => {
    const salvato: Modulo = { cliente_nome: "Anna" };
    const { result, rerender, unmount, salva } = monta({ id: "p1", dirty: true, form: salvato });
    result.current.segnaSalvato(salvato);
    rerender({ id: "p1", dirty: true, form: { cliente_nome: "Annabella" } });
    unmount();
    expect(salva).toHaveBeenCalledTimes(1);
    expect(salva).toHaveBeenCalledWith({ cliente_nome: "Annabella", id: "p1" });
  });

  it("senza la freccia (menu, «indietro») la chiusura salva, come prima", () => {
    const { unmount, salva } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Anna" } });
    unmount();
    expect(salva).toHaveBeenCalledTimes(1);
    expect(salva).toHaveBeenCalledWith({ cliente_nome: "Anna", id: "p1" });
  });
});

describe("se il salvataggio di chiusura non riesce", () => {
  const descrizioneDelAvviso = () => (vi.mocked(toast.error).mock.calls[0][1] as { description: string }).description;

  it("lo dice con un solo avviso, col motivo in italiano (mai «TypeError: Failed to fetch»)", async () => {
    const { unmount } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Anna" } }, vi.fn<Salva>(() => Promise.reject(new TypeError("Failed to fetch"))));
    expect(() => unmount()).not.toThrow();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith("Modifiche non salvate", expect.objectContaining({ id: "salva-uscendo" }));
    expect(descrizioneDelAvviso()).toContain("Connessione persa");
    expect(descrizioneDelAvviso()).toContain("Le modifiche non sono state salvate");
    expect(descrizioneDelAvviso()).not.toMatch(/Failed to fetch|TypeError/);
  });

  it("un rifiuto per i permessi (anche se l'errore non è un Error) lo dice con la frase dei permessi", async () => {
    const { unmount } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Anna" } }, vi.fn<Salva>(() => Promise.reject({ code: "42501" })));
    expect(() => unmount()).not.toThrow();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(descrizioneDelAvviso()).toContain("Non hai i permessi");
  });

  it("un testo tecnico che l'app non conosce non arriva a chi lavora: frase generica", async () => {
    const { unmount } = monta({ id: "p1", dirty: true, form: { cliente_nome: "Anna" } }, vi.fn<Salva>(() => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'id')"))));
    unmount();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(descrizioneDelAvviso()).toContain("Il salvataggio non è andato a buon fine.");
    expect(descrizioneDelAvviso()).not.toMatch(/Cannot read|undefined/);
  });

  it("se riesce, nessun avviso; senza modifiche o senza preventivo creato, né salvataggio né avviso", async () => {
    const riuscito = monta({ id: "p1", dirty: true, form: { cliente_nome: "Anna" } });
    riuscito.unmount();
    const pulito = monta({ id: "p1", dirty: false, form: { cliente_nome: "Anna" } });
    pulito.unmount();
    const nuovo = monta({ id: undefined, dirty: true, form: { cliente_nome: "Anna" } });
    nuovo.unmount();
    await Promise.resolve();
    expect(riuscito.salva).toHaveBeenCalledTimes(1);
    expect(pulito.salva).not.toHaveBeenCalled();
    expect(nuovo.salva).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
