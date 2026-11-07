import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CampioniFinitureStanza } from "@/components/render-stanza/CampioniFinitureStanza";
import { applicaCampionePavimento } from "@/modules/render-stanza/lib/campioniFiniture";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import { righeFiniture } from "../../../shared/render-planimetria/prompt.ts";
import { normalizeRoomFloorConfig } from "../../../shared/render-room/roomRenderConfig.ts";

const iniziale = { tipo_stanza: "soggiorno", stile_target: "moderno", intensita: "medio", pavimento: { attivo: false }, verniciatura: { attivo: false }, soffitto: { attivo: false } } as ConfigurazioneStanza;

describe("campioni nel passaggio del render", () => {
  it("un clic su effetto legno attiva il pavimento, seleziona il campione e conserva il resto", () => {
    let ultima = iniziale;
    function Prova() {
      const [c, setC] = useState(iniziale);
      return <CampioniFinitureStanza value={c} onChange={(v) => { ultima = v; setC(v); }} />;
    }
    render(<Prova />);
    fireEvent.click(screen.getByRole("button", { name: "Gres effetto legno" }));
    expect(screen.getByRole("button", { name: "Gres effetto legno" }).getAttribute("aria-pressed")).toBe("true");
    expect(ultima.pavimento.attivo).toBe(true);
    expect(ultima.verniciatura).toEqual(iniziale.verniciatura);
    const normalizzato = normalizeRoomFloorConfig(ultima.pavimento as unknown as Record<string, unknown>);
    expect(normalizzato.tipo).toBe("gres_porcellanato");
    expect(normalizzato.effetto_visivo).toBe("legno");
    expect(normalizzato.essenza_legno).toBe("rovere_naturale");
  });

  it("passando dal legno al marmo non manda più l'essenza del legno al motore", () => {
    const c = applicaCampionePavimento(applicaCampionePavimento(iniziale, "noce"), "marmo");
    expect(c.pavimento.tipo).toBe("marmo");
    expect(c.pavimento.essenza_legno).toBeUndefined();
    expect(c.pavimento.larghezza_listello_mm).toBeUndefined();
  });

  it("il pavimento scelto nel render prevale su quello salvato nella pianta, le pareti restano", () => {
    const c = applicaCampionePavimento(iniziale, "gres_legno");
    const testo = righeFiniture({ pavimento: "marmo bianco", pareti: "pittura verde salvia" }, c);
    expect(testo).not.toContain("marmo");
    expect(testo).toContain("pittura verde salvia");
    expect(righeFiniture({ pavimento: "marmo bianco" }, c)).toBe("");
  });
});
