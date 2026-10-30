/**
 * Un bilocale di esempio per la pagina di prova: soggiorno con angolo cottura,
 * camera, bagno e disimpegno; le misure del bagno sono stimate (come se venissero
 * dall'AI), così si vede come appaiono e come si confermano.
 */
import { piantaVuota, SPESSORE_PORTANTE, type Pianta } from "./adattatore";
import { aggiungiApertura, aggiungiStanza, rettangolo } from "./comandi";

export function piantaEsempio(): Pianta {
  let p = piantaVuota();
  const stanza = (a: [number, number], b: [number, number], nome: string, destinazione: Parameters<typeof aggiungiStanza>[2]["destinazione"], stimata = false) => {
    const r = aggiungiStanza(p, rettangolo({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }), {
      nome,
      destinazione,
      spessore: SPESSORE_PORTANTE,
      origine: stimata ? "stimata" : "rilevata",
    });
    p = r.pianta;
  };
  // prima le stanze sul perimetro, con il muro portante; dentro i tramezzi
  stanza([0, 0], [530, 450], "Soggiorno", "soggiorno");
  stanza([530, 0], [880, 450], "Camera", "camera");
  stanza([0, 450], [300, 700], "Bagno", "bagno", true);
  stanza([300, 450], [880, 700], "Disimpegno", "disimpegno");
  // i tramezzi interni da 10
  p = {
    ...p,
    muri: p.muri.map((m) => {
      const interno = (m.p1.x > 0 && m.p1.x < 880 && m.p2.x > 0 && m.p2.x < 880 && m.p1.x === m.p2.x) || (m.p1.y === 450 && m.p2.y === 450);
      return interno ? { ...m, spessore: 10, tipo: "tramezzo" as const } : m;
    }),
  };
  const muro = (x1: number, y1: number, x2: number, y2: number) =>
    p.muri.find((m) => (m.p1.x === x1 && m.p1.y === y1 && m.p2.x === x2 && m.p2.y === y2) || (m.p1.x === x2 && m.p1.y === y2 && m.p2.x === x1 && m.p2.y === y1))?.id;
  const metti = (id: string | undefined, tipo: "porta" | "finestra" | "portafinestra", t: number) => {
    if (id) p = aggiungiApertura(p, id, tipo, t).pianta;
  };
  metti(muro(0, 0, 530, 0), "portafinestra", 265);
  metti(muro(530, 0, 880, 0), "finestra", 175);
  metti(muro(300, 450, 300, 700), "porta", 70);
  metti(muro(530, 450, 880, 450), "porta", 80);
  metti(muro(0, 450, 530, 450), "porta", 100);
  metti(muro(880, 700, 300, 700), "porta", 120);
  return p;
}
