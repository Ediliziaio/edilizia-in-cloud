import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_STANZA_CONFIG, StanzaConfigForm } from "@/components/render-stanza/StanzaConfigForm";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";
import { selectedRoomVisuals } from "../../../shared/render-references/roomVisualCatalog.ts";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";

afterEach(cleanup);

function monta(config: ConfigurazioneStanza) {
  let ultima = config;
  function Prova() {
    const [value, setValue] = useState(config);
    return <StanzaConfigForm value={value} onChange={(v) => { ultima = v; setValue(v); }} />;
  }
  render(<Prova />);
  return () => ultima;
}

describe("scelte fotografiche nel modulo del render", () => {
  it("la carta scelta sostituisce il vecchio motivo e il riepilogo usa la stessa foto del motore", () => {
    const iniziale = structuredClone(DEFAULT_STANZA_CONFIG);
    iniziale.carta_da_parati = { ...iniziale.carta_da_parati, attivo: true, colore_base: "#ff0000", descrizione: "vecchio motivo a righe" };
    const configurazione = monta(iniziale);
    fireEvent.click(within(screen.getByRole("group", { name: "Qualità del render" })).getByRole("button", { name: /Alta/ }));
    expect(configurazione().qualita_render).toBe("alta");
    fireEvent.click(screen.getByRole("button", { name: "Carta da parati" }));
    const gruppo = screen.getByRole("group", { name: "Carta da parati" });
    fireEvent.click(within(gruppo).getByRole("button", { name: "Tropicale" }));
    expect(configurazione().carta_da_parati.stile_pattern).toBe("tropicale");
    expect(configurazione().carta_da_parati.colore_base).toBeUndefined();
    expect(configurazione().carta_da_parati.descrizione).toBeUndefined();
    const scelta = selectedRoomVisuals(configurazione()).find((s) => s.group === "wallpaper_pattern")!;
    const src = referenceThumbUrl(scelta.photo!.folder, scelta.photo!.filename);
    expect(within(gruppo).getByRole("button", { name: "Tropicale" }).querySelector("img")?.getAttribute("src")).toBe(src);
    expect(screen.getByRole("region", { name: "Campioni selezionati per il render" }).querySelector(`img[src="${src}"]`)).not.toBeNull();
    expect(screen.getByRole("switch", { name: "Attiva Carta da parati" }).closest("button button")).toBeNull();
  });

  it("cucina: legno e granito aggiornano il materiale e il colore inviati al motore", () => {
    const iniziale = structuredClone(DEFAULT_STANZA_CONFIG);
    iniziale.tipo_stanza = "cucina";
    iniziale.restyling_cucina = { ...iniziale.restyling_cucina!, attivo: true };
    const configurazione = monta(iniziale);
    fireEvent.click(screen.getByRole("button", { name: "Restyling cucina" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Frontali cucina" })).getByRole("button", { name: "Legno" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Piano di lavoro" })).getByRole("button", { name: "Granito" }));
    expect(configurazione().restyling_cucina).toMatchObject({ materiale_frontali: "legno", piano_lavoro_materiale: "granito" });
    expect(configurazione().restyling_cucina!.colore_frontali_hex).not.toBe("#FFFFFF");
    expect(configurazione().restyling_cucina!.colore_piano_lavoro_hex).not.toBe("#D4D0CA");
    const ids = selectedRoomVisuals(configurazione()).map((s) => s.id);
    expect(ids).toContain("kitchen_front:legno");
    expect(ids).toContain("kitchen_worktop:granito");
  });
});
