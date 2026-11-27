import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { FvMappaTetto } from "@/components/fotovoltaico/FvMappaTetto";
import { pianoDaMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";
import { spostaPinTettoFv } from "@/lib/fotovoltaico/spostaPinTetto";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import {
  areaPoligono,
  type DisegnoCommercialeFv,
  disponiModuliOttimizzati,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {
  type MappaFv,
  rettangoloRuotatoFv,
} from "../../../supabase/functions/_shared/fvMappa";

vi.mock(
  "@/components/fotovoltaico/tetto/MappaGoogleFv",
  () => ({ MappaGoogleFv: (): null => null }),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const posizione = { lat: 45, lng: 9 };
const riferimento = {
  posizione,
  ricerca: { indirizzo: "Via Esempio 1", posizione },
};
const mappa = (): MappaFv => ({
  versione: 1,
  origine: posizione,
  ricerca: riferimento.ricerca,
  distanzaOstacoli: .3,
  falde: [{
    id: "f1",
    nome: "Falda 1",
    punti: rettangoloRuotatoFv({ x: -10, y: 0 }, 12, 8, 0),
    inclinazione: 30,
    azimut: 180,
    inclinazioneStimata: true,
  }, {
    id: "f2",
    nome: "Falda 2",
    punti: rettangoloRuotatoFv({ x: 10, y: 0 }, 12, 8, 0),
    inclinazione: 30,
    azimut: 180,
    inclinazioneStimata: true,
  }],
});
const piano = () =>
  pianoDaMappaFv(mappa(), { corto: 1.134, lungo: 1.762, stimato: true });
function prepara(
  {
    readOnly = false,
    p = piano(),
    salva = vi.fn<(p: DisegnoCommercialeFv) => void>(),
  }: {
    readOnly?: boolean;
    p?: DisegnoCommercialeFv;
    salva?: Mock<(p: DisegnoCommercialeFv) => void>;
  } = {},
) {
  function Host() {
    const [data, setData] = useState({
      ...INITIAL,
      riferimento_tetto: riferimento,
      layout_overlay: p,
    });
    return (
      <FvMappaTetto
        ricerca={posizione}
        indirizzo={riferimento.ricerca.indirizzo}
        riferimento={data.riferimento_tetto}
        piano={data.layout_overlay}
        modificabile={!readOnly}
        onPosizione={(r) => setData((d) => spostaPinTettoFv(d, r) as typeof d)}
        onChange={salva}
      />
    );
  }
  render(<Host />);
  const el = screen.getByRole("group", {
    name: "Mappa satellitare: scegli il tetto o disegna una falda",
  });
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
    { left: 0, top: 0, width: 640, height: 440 } as DOMRect,
  );
  Object.defineProperty(el, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
  });
  return { el, salva };
}
function pointer(el: Element, tipo: string, x: number, y: number) {
  const e = new MouseEvent(tipo, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  fireEvent(el, e);
}
const poligoni = (el: Element) =>
  [...el.querySelectorAll("polygon")].map((p) => p.getAttribute("points")!);
const usa = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name:
        /^(Usa falde e prepara nuova disposizione|Conferma falde e mantieni i pannelli)$/,
    }),
  );
describe("pin e falde sulla mappa", () => {
  it("salva una falda appena chiusa e la ritrova dopo Avanti e Indietro senza una seconda conferma", () => {
    function Host() {
      const [p,setP]=useState<DisegnoCommercialeFv|null>(null),[mappaVisibile,setMappaVisibile]=useState(true);
      return <><button onClick={()=>setMappaVisibile(v=>!v)}>Cambia fase</button><output aria-label="Tetto salvato">{JSON.stringify(p)}</output>{mappaVisibile&&<FvMappaTetto ricerca={posizione} indirizzo="Via Esempio 1" riferimento={riferimento} piano={p} modificabile onPosizione={()=>{}} onChange={setP}/>}</>;
    }
    render(<Host/>);
    const el=screen.getByRole("group",{name:"Mappa satellitare: scegli il tetto o disegna una falda"});
    vi.spyOn(el,"getBoundingClientRect").mockReturnValue({left:0,top:0,width:640,height:440} as DOMRect);
    fireEvent.click(screen.getByRole("button",{name:"Disegna falda"}));
    for(const [x,y] of [[250,160],[380,160],[380,280],[250,280]])pointer(el,"pointerdown",x,y);
    fireEvent.click(screen.getByRole("button",{name:"Chiudi falda"}));
    const salvato=JSON.parse(screen.getByLabelText("Tetto salvato").textContent!);
    expect(salvato.mappa.falde).toHaveLength(1);expect(salvato.falde[0].id).toBe(salvato.mappa.falde[0].id);
    fireEvent.click(screen.getByRole("button",{name:"Cambia fase"}));fireEvent.click(screen.getByRole("button",{name:"Cambia fase"}));
    expect(screen.getByRole("button",{name:"Falda 1: trascina per spostare"})).toBeTruthy();
    expect(JSON.parse(screen.getByLabelText("Tetto salvato").textContent!)).toEqual(salvato);
  });
  it("conserva il punto di presa del pin senza saltare sotto al cursore", () => {
    const { el } = prepara(), prima = poligoni(el);
    pointer(
      screen.getByRole("button", { name: "Pin del tetto" }),
      "pointerdown",
      320,
      204,
    );
    pointer(el, "pointermove", 350, 224);
    pointer(el, "pointerup", 350, 224);
    const a = prima[0].split(" ")[0].split(",").map(Number),
      b = poligoni(el)[0].split(" ")[0].split(",").map(Number);
    expect(b[0] - a[0]).toBeCloseTo(30, 3);
    expect(b[1] - a[1]).toBeCloseTo(20, 3);
  });
  it("muove tutte le falde con il pin, permette di annullare e conferma senza cancellarle", () => {
    const posa = disponiModuliOttimizzati(piano(), 18);
    const { el, salva } = prepara({ p: posa }), prima = poligoni(el);
    pointer(
      screen.getByRole("button", { name: "Pin del tetto" }),
      "pointerdown",
      320,
      220,
    );
    pointer(el, "pointermove", 370, 250);
    pointer(el, "pointerup", 370, 250);
    const dopo = poligoni(el);
    expect(dopo).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const a = prima[i].split(" ").map((p) => p.split(",").map(Number));
      const b = dopo[i].split(" ").map((p) => p.split(",").map(Number));
      for (let j = 0; j < a.length; j++) {
        expect(b[j][0] - a[j][0]).toBeCloseTo(50, 3);
        expect(b[j][1] - a[j][1]).toBeCloseTo(30, 3);
      }
    }
    expect(
      screen.queryByRole("button", {
        name: "Usa falde e prepara nuova disposizione",
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla spostamento del tetto" }),
    );
    expect(poligoni(el)).toEqual(prima);
    pointer(
      screen.getByRole("button", { name: "Pin del tetto" }),
      "pointerdown",
      320,
      220,
    );
    pointer(el, "pointermove", 350, 240);
    pointer(el, "pointerup", 350, 240);
    fireEvent.click(screen.getByRole("button", { name: "Conferma tetto" }));
    expect(poligoni(el)).toHaveLength(2);
    usa();
    const p = salva.mock.calls[0][0] as DisegnoCommercialeFv;
    expect(p.mappa!.origine).not.toEqual(posizione);
    expect(p.mappa!.ricerca).toEqual(riferimento.ricerca);
    expect(p.mappa!.falde).toEqual(mappa().falde);
    expect(p.pannelli).toEqual(posa.pannelli);
  });
  it("trascina una sola falda conservando forma, misure e le altre falde", () => {
    const { el, salva } = prepara();
    pointer(
      screen.getByRole("button", { name: "Falda 1: trascina per spostare" }),
      "pointerdown",
      220,
      220,
    );
    pointer(el, "pointermove", 220, 190);
    pointer(el, "pointerup", 220, 190);
    usa();
    const m = (salva.mock.calls[0][0] as DisegnoCommercialeFv).mappa!;
    expect(m.falde[1]).toEqual(mappa().falde[1]);
    expect(areaPoligono(m.falde[0].punti)).toBeCloseTo(96, 6);
    const delta = m.falde[0].punti[0].y - mappa().falde[0].punti[0].y;
    expect(delta).toBeGreaterThan(1);
    m.falde[0].punti.forEach((p, i) => {
      expect(p.x).toBeCloseTo(mappa().falde[0].punti[i].x, 6);
      expect(p.y - mappa().falde[0].punti[i].y).toBeCloseTo(delta, 6);
    });
  });
  it.each(["pointercancel", "Escape"])(
    "annulla il trascinamento con %s",
    (modo) => {
      const { el } = prepara(), prima = poligoni(el);
      pointer(
        screen.getByRole("button", { name: "Falda 1: trascina per spostare" }),
        "pointerdown",
        220,
        220,
      );
      pointer(el, "pointermove", 220, 170);
      expect(poligoni(el)).not.toEqual(prima);
      if (modo === "Escape") fireEvent.keyDown(el, { key: "Escape" });
      else pointer(el, modo, 220, 170);
      expect(poligoni(el)).toEqual(prima);
    },
  );
  it("ripristina il pin se il trascinamento viene interrotto", () => {
    const { el } = prepara(), prima = poligoni(el);
    pointer(
      screen.getByRole("button", { name: "Pin del tetto" }),
      "pointerdown",
      320,
      220,
    );
    pointer(el, "pointermove", 370, 250);
    expect(poligoni(el)).not.toEqual(prima);
    pointer(el, "pointercancel", 370, 250);
    expect(poligoni(el)).toEqual(prima);
  });
  it("rifiuta spostamenti oltre i limiti senza perdere il contorno precedente", () => {
    const { el } = prepara(), prima = poligoni(el);
    pointer(
      screen.getByRole("button", { name: "Falda 1: trascina per spostare" }),
      "pointerdown",
      220,
      220,
    );
    pointer(el, "pointermove", 6000, 220);
    pointer(el, "pointerup", 6000, 220);
    expect(poligoni(el)).toEqual(prima);
    expect(screen.getByText("Mantieni la falda entro 400 m dal pin."))
      .toBeVisible();
  });
  it("crea la falda collegando i punti toccati e la rende subito trascinabile", () => {
    const { el, salva } = prepara({
      p: pianoDaMappaFv({ ...mappa(), falde: [mappa().falde[0]] }, {
        corto: 1.134,
        lungo: 1.762,
        stimato: true,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Disegna falda" }));
    // Quattro angoli, poi di nuovo il primo per chiudere il contorno.
    for (
      const [x, y] of [[420, 200], [480, 200], [480, 260], [420, 260], [
        420,
        200,
      ]]
    ) {
      pointer(el, "pointerdown", x, y);
    }
    expect(
      screen.getByRole("button", { name: "Falda 2: trascina per spostare" }),
    ).toHaveAttribute("aria-pressed", "true");
    usa();
    const m = (salva.mock.calls[0][0] as DisegnoCommercialeFv).mappa!;
    expect(m.falde).toHaveLength(2);
    expect(m.falde[1].punti).toHaveLength(4);
    expect(areaPoligono(m.falde[1].punti)).toBeGreaterThan(0);
    expect(m.falde[1].punti.reduce((n, p) => n + p.x / 4, 0)).toBeGreaterThan(
      10,
    );
  });
  it("il pin non intercetta il tocco quando si sta creando una falda", () => {
    const m = mappa();
    m.falde = [{
      ...m.falde[0],
      punti: rettangoloRuotatoFv({ x: -20, y: 0 }, 12, 8, 0),
    }];
    const { el, salva } = prepara({
      p: pianoDaMappaFv(m, { corto: 1.134, lungo: 1.762, stimato: true }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Disegna falda" }));
    // Il primo angolo cade proprio sul pin: deve diventare un punto della falda,
    // non spostare il pin.
    pointer(
      screen.getByRole("button", { name: "Pin del tetto" }),
      "pointerdown",
      320,
      220,
    );
    for (const [x, y] of [[380, 220], [380, 280], [320, 280], [320, 220]]) {
      pointer(el, "pointerdown", x, y);
    }
    usa();
    const p = (salva.mock.calls[0][0] as DisegnoCommercialeFv).mappa!;
    expect(p.falde).toHaveLength(2);
    expect(p.origine).toEqual(posizione);
    expect(p.falde[1].punti).toHaveLength(4);
  });
  it("supporta la tastiera per pin e falda e impedisce modifiche in sola lettura", () => {
    const { el } = prepara();
    const prima = poligoni(el);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Falda 1: trascina per spostare" }),
      { key: "ArrowRight", shiftKey: true },
    );
    expect(poligoni(el)[0]).not.toEqual(prima[0]);
    expect(poligoni(el)[1]).toEqual(prima[1]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Pin del tetto" }), {
      key: "ArrowUp",
      shiftKey: true,
    });
    expect(screen.getByRole("button", { name: "Conferma tetto" }))
      .toBeEnabled();
    cleanup();
    const ro = prepara({ readOnly: true }), stato = poligoni(ro.el);
    expect(screen.getByRole("button", { name: "Disegna falda" }))
      .toBeDisabled();
    pointer(
      screen.getByRole("button", { name: "Falda 1: trascina per spostare" }),
      "pointerdown",
      220,
      220,
    );
    pointer(ro.el, "pointermove", 250, 250);
    pointer(ro.el, "pointerup", 250, 250);
    fireEvent.keyDown(screen.getByRole("button", { name: "Pin del tetto" }), {
      key: "ArrowUp",
    });
    expect(poligoni(ro.el)).toEqual(stato);
  });
  it("sposta solo il vertice toccato attraverso un bersaglio adatto al touch", () => {
    const { el, salva } = prepara(),
      v = screen.getByRole("button", { name: "Falda 1, vertice 1" });
    expect(v.querySelector("circle")?.getAttribute("r")).toBe("22");
    pointer(v, "pointerdown", 180, 250);
    pointer(el, "pointermove", 170, 250);
    pointer(el, "pointerup", 170, 250);
    usa();
    const m = (salva.mock.calls[0][0] as DisegnoCommercialeFv).mappa!;
    expect(m.falde[0].punti[0]).not.toEqual(mappa().falde[0].punti[0]);
    expect(m.falde[0].punti.slice(1)).toEqual(mappa().falde[0].punti.slice(1));
    expect(m.falde[1]).toEqual(mappa().falde[1]);
  });
});
