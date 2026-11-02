/**
 * La quarta revisione di «Crea con Silvio», 1: la scrittura che arriva alla RPC è quella del popup,
 * anche su una bozza ripresa e anche se l'autonomia cambia mentre il popup è aperto.
 * Database finto, dati inventati.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PianoCommessa } from "../../../shared/silvio-commessa/piano.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { autonomiaDaRighe, type LivelloAutonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { IMPOSTAZIONI_PREDEFINITE } from "@/lib/silvio-commessa/autonomia";
import type { Bozza, ClientBozze } from "@/lib/silvio-commessa/bozze";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";

vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));

import { useBozzaSilvio } from "@/components/silvio-commessa/useBozzaSilvio";

const AZ = "d2000000-0000-4000-a000-000000000002";
const PERSONA = "e0000000-0000-4000-a000-000000000001";

const conSquadra = (): PianoCommessa => fondi(pianoVuoto(AZ), {
  fonte: { tipo: "documento", id: "f-S", etichetta: "S.pdf" },
  aree: {
    identita: { "identita.description": { valore: "Lavoro di prova", fiducia: 1, stato: "fatto" } },
    persone: { "persone.squadra": { valore: [{ employee_id: PERSONA, nome: "Mario Prova", fase: null as string | null, stato: "proposta", motivo: "m" }], fiducia: 0.9, stato: "proposta" } },
  },
});
const conLivello = (livello: LivelloAutonomia) => ({ ...IMPOSTAZIONI_PREDEFINITE, autonomia: autonomiaDaRighe([{ azione: "squadra", livello }]) });

function monta(impostazioni: ServiziSilvioCommessa["impostazioni"]) {
  const scritture: { squadra: unknown[] }[] = [];
  const rpc = vi.fn(async () => ({ data: { order_id: "o1" }, error: null as unknown }));
  const q: Record<string, unknown> = {};
  const prendi = (r: { scrittura?: { squadra: unknown[] } }) => { if (r.scrittura) scritture.push(r.scrittura); return q; };
  const riga = async () => ({ data: { id: "b1", stato: "bozza" }, error: null as unknown });
  Object.assign(q, { insert: prendi, update: prendi, eq: () => q, select: () => q, single: riga, maybeSingle: riga });
  const db = { from: () => q, rpc, storage: { from: () => ({}) } } as unknown as ClientBozze;
  const servizi = {
    db, impostazioni, registraCorrezioni: vi.fn(async () => {}), saldoAI: vi.fn(async () => ({ saldoEur: 5, bloccato: false })),
    contestoRisorse: vi.fn(async () => null),
  } as unknown as ServiziSilvioCommessa;
  const r = renderHook(() => useBozzaSilvio({ companyId: AZ, userId: "u1", servizi, attesaMs: 1 }));
  return { ...r, scritture, rpc };
}
const bozza = (): Bozza => ({ id: "b1", piano: conSquadra(), storia: [], fonti: [], stato: "bozza" } as unknown as Bozza);

describe("1. Crea salva la scrittura con l'autonomia di adesso", () => {
  it("una bozza ripresa senza modifiche, salvata con 0 persone, ne scrive quante dice il popup", async () => {
    const { result, scritture, rpc } = monta(vi.fn(async () => conLivello("da_sola")));
    await waitFor(() => expect(result.current.autonomia.squadra?.livello).toBe("da_sola"));
    act(() => result.current.riprendi(bozza()));
    await waitFor(() => expect(result.current.scrittura.squadra).toHaveLength(1));
    await act(async () => { await result.current.crea(); });
    expect(scritture.at(-1)!.squadra).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("commessa_crea_con_silvio", expect.anything());
  });

  it("l'autonomia torna a «chiede» col popup aperto: non scrive, e al secondo tocco la persona non entra", async () => {
    const impostazioni = vi.fn(async () => conLivello("da_sola"));
    const { result, scritture, rpc } = monta(impostazioni);
    await waitFor(() => expect(result.current.autonomia.squadra?.livello).toBe("da_sola"));
    act(() => result.current.riprendi(bozza()));
    await waitFor(() => expect(result.current.scrittura.squadra).toHaveLength(1));
    impostazioni.mockImplementation(async () => conLivello("chiede"));
    await act(async () => { await expect(result.current.crea()).rejects.toThrow(/impostazioni di Silvio/); });
    expect(rpc).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.scrittura.squadra).toHaveLength(0));
    await act(async () => { await result.current.crea(); });
    expect(scritture.at(-1)!.squadra).toHaveLength(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("se le impostazioni non si leggono si va avanti con quelle di prima: i divieti li controlla il database", async () => {
    const impostazioni = vi.fn(async () => conLivello("da_sola"));
    const { result, scritture, rpc } = monta(impostazioni);
    await waitFor(() => expect(result.current.autonomia.squadra?.livello).toBe("da_sola"));
    act(() => result.current.riprendi(bozza()));
    await waitFor(() => expect(result.current.scrittura.squadra).toHaveLength(1));
    impostazioni.mockImplementation(async () => { throw new Error("rete"); });
    await act(async () => { await result.current.crea(); });
    expect(scritture.at(-1)!.squadra).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
