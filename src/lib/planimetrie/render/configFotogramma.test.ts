import { expect, it } from "vitest";
import { configPerApertureInquadrate } from "./configFotogramma";
import { configPerStanza } from "./renderInSerie";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import type { MetadatiFotogramma } from "../tred/telecamera";

it("una stanza con la finestra fuori campo non riceve tende che inducano nuove aperture", () => {
  const c = configPerStanza("bagno", IDEE_PRONTE[0]), prima = structuredClone(c);
  expect(c.tende.attivo).toBe(true);
  const risultato = configPerApertureInquadrate(c, { aperture_visibili: [] });
  expect(risultato.tende.attivo).toBe(false);
  expect(risultato.pavimento).toEqual(c.pavimento);
  expect(risultato.arredo).toEqual(c.arredo);
  expect(c).toEqual(prima);
});

it.each(["finestra", "portafinestra"] as const)("con una %s visibile mantiene la scelta delle tende", (tipo) => {
  const c = configPerStanza("studio", IDEE_PRONTE[0]);
  const apertura = { tipo } as MetadatiFotogramma["aperture_visibili"][number];
  expect(configPerApertureInquadrate(c, { aperture_visibili: [apertura] })).toBe(c);
});
