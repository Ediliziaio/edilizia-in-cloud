import { leggiRispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI.ts";
import { costruisciPiani } from "../../../supabase/functions/planimetria-genera/costruisci.ts";
import { collegaControlliDocumento } from "../../../supabase/functions/planimetria-genera/controlliDocumento.ts";
import { applicaQuotaDocumento } from "@/lib/planimetrie/confermaQuoteDocumento";
import { confermaVerifica, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";

/** Fixture sintetica per verificare il software; non conferma le quote del documento reale dell'utente. */
export function bagnoDaVerificare() {
  const r = leggiRispostaAI({ sistema: "metri", leggibile: true, altezza_m: 2.66,
    locali: [{ nome: "Bagno", destinazione: "bagno", contorno: [[0.2,0],[1.945,0],[1.945,4.23],[0,4.23],[0,0.6],[0.2,0.6]], misure_lette: false }],
    aperture: [{ tipo: "portafinestra", da: [0.845,0], a: [1.945,0] }, { tipo: "porta", da: [0.855,4.23], a: [1.725,4.23] }],
    elementi: [{ tipo: "vasca", riquadro: [0,2.54,0.69,4.23], lato_muro: "sinistra" }],
    verifiche_documento: [
      { descrizione: "Profondità: 423 oppure 421,5 cm, da verificare", locale_nome: "Bagno", campo: "profondita", ambito_misura: "totale_locale", valori_cm: [423,421.5,422.5] },
      { descrizione: "Vano porta: 87 oppure 100,5 cm, da verificare", apertura_indice: 2, campo: "larghezza", ambito_misura: "vano_apertura", valori_cm: [87,100.5] },
      { descrizione: "Verso portafinestra non riconosciuto", apertura_indice: 1, campo: "verso", valori_cm: [] },
    ],
  }, "metri");
  const g = collegaControlliDocumento(costruisciPiani(r, { ingresso: "schizzo" }), r);
  g.planimetria.letturaDocumento!.avvisiIniziali = ["Conservare le quote 423 e 421,5 cm come quote da verificare."];
  g.planimetria.letturaDocumento!.protocolloVerifica = 1;
  return g.planimetria;
}

export function bagnoVerificatoSintetico() {
  let d = applicaQuotaDocumento(bagnoDaVerificare(), "lettura-1", 421.5);
  d = applicaQuotaDocumento(d, "lettura-2", 87);
  const a = d.livelli[0].fatto.aperture[0];
  a.verso = { cardine: "p1", lato: "destra" };
  for (const v of verificheDelDocumento(d)) d = confermaVerifica(d, v.id, { ...(v.conferma?.valoreCm !== undefined ? { valoreCm: v.conferma.valoreCm } : {}), nota: "Verifica con rilievo sintetico del test" });
  return d;
}
