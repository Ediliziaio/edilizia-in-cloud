import React from "react";
import { describe, expect, it, vi } from "vitest";
import { generaPdfDocumento } from "@/lib/pdf/generaPdfDocumento";

const state = vi.hoisted(() => ({ render: vi.fn(), compatibility: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({ pdf: (document: unknown) => ({ toBlob: () => state.render(document) }) }));
vi.mock("@/lib/pdf/ensurePdfBufferCompatibility", () => ({ ensurePdfBufferCompatibility: () => state.compatibility() }));

describe("Coda comune, layout separati", () => {
  it("consegna al motore il documento originale, senza sostituire componenti o proprieta", async () => {
    const original = React.createElement("DOCUMENTO_SERRAMENTI", { title: "Titolo originale", children: "Contenuti originali" });
    const blob = new Blob(["pdf"]);
    state.render.mockResolvedValueOnce(blob);
    expect(await generaPdfDocumento(original)).toBe(blob);
    expect(state.render).toHaveBeenLastCalledWith(original);
    expect(state.compatibility).toHaveBeenCalled();
  });
  it("non esegue due impaginazioni contemporaneamente", async () => {
    let release: (blob: Blob) => void = () => {};
    state.render.mockImplementationOnce(() => new Promise<Blob>(resolve => { release = resolve; }));
    const first = React.createElement("LAYOUT_A"), second = React.createElement("LAYOUT_B");
    const a = generaPdfDocumento(first);
    const b = generaPdfDocumento(second);
    await vi.waitFor(() => expect(state.render).toHaveBeenLastCalledWith(first));
    state.render.mockResolvedValueOnce(new Blob(["secondo"]));
    release(new Blob(["primo"]));
    await Promise.all([a, b]);
    expect(state.render).toHaveBeenLastCalledWith(second);
  });
  it("un errore non blocca le generazioni successive", async () => {
    state.render.mockRejectedValueOnce(new Error("Immagine non leggibile"));
    await expect(generaPdfDocumento(React.createElement("LAYOUT_A"))).rejects.toThrow("Immagine non leggibile");
    state.render.mockResolvedValueOnce(new Blob(["ok"]));
    expect(await generaPdfDocumento(React.createElement("LAYOUT_B"))).toBeInstanceOf(Blob);
  });
});
