import { afterEach, describe, expect, it, vi } from "vitest";
import { ricostruisciModelloDwg } from "@/lib/planimetrie/dwgLocale";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";

const [terra] = bilocale.livelli;
// Lo stesso piano più su, con identificativi suoi (devono essere unici in tutto il documento).
const sopra = JSON.parse(JSON.stringify(terra).replace(/"(id|muroId)":"/g, '"$1":"p1-'));
const due = { ...bilocale, livelli: [terra, { ...sopra, id: "p1", nome: "Piano primo", quota: 300 }] };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("modello CAD di più piani", () => {
  it("accetta il piano messo sul terra per correlazione dei muri esterni (Callimaco, 25/11/2026)", async () => {
    vi.stubEnv("VITE_PLANIMETRIE_DWG_LOCALE", "1");
    const posizione = (allineamento: string) => ({ origine: [0, 600], larghezza: 800, altezza: 600, allineamento });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      documento: due,
      piani: [posizione("primo"), posizione("correlazione")],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const richiesta = { unita: 6, altezza: 300, piani: [{ nome: "pt", quota: 0, rettangolo: [0, 0, 8, 6] }, { nome: "p1", quota: 300, rettangolo: [10, 0, 18, 6] }] };
    const esito = await ricostruisciModelloDwg(new File(["x"], "a.dwg"), richiesta as never, new AbortController().signal);
    expect(esito.piani.map((p) => p.allineamento)).toEqual(["primo", "correlazione"]);
    expect(esito.documento.livelli).toHaveLength(2);
  });
});
