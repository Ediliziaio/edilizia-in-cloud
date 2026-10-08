/**
 * La scheda dell'opportunità in formato A4, pronta per la stampa del browser.
 *
 * Sta in un portale direttamente sotto <body> ed è invisibile a schermo. Quando si stampa (il bottone
 * «Stampa» della scheda, o Ctrl/Cmd+P a scheda aperta) il CSS di stampa nasconde tutto il resto e
 * lascia solo questo foglio: nessun dato tagliato dal riquadro con la barra di scorrimento.
 */
import { createPortal } from "react-dom";
import type { SchedaStampa } from "@/lib/opportunita/schedaStampa";

const CSS = `
.eic-stampa-scheda { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; position: static !important; }
  body > *:not(.eic-stampa-scheda) { display: none !important; }
  .eic-stampa-scheda { display: block !important; color: #111; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
  .eic-stampa-scheda h1 { font-size: 17pt; margin: 0 0 1mm; }
  .eic-stampa-scheda .eic-sotto { color: #555; font-size: 9.5pt; margin-bottom: 4mm; }
  .eic-stampa-scheda section { margin: 0 0 5mm; }
  .eic-stampa-scheda h2 { font-size: 11pt; margin: 0 0 1.5mm; padding-bottom: 1mm; border-bottom: 0.4mm solid #222; break-after: avoid; }
  .eic-stampa-scheda table { width: 100%; border-collapse: collapse; }
  .eic-stampa-scheda td { padding: 1mm 2mm 1mm 0; vertical-align: top; border-bottom: 0.2mm solid #ddd; }
  .eic-stampa-scheda tr { break-inside: avoid; }
  .eic-stampa-scheda td.eic-et { width: 38%; color: #555; }
  .eic-stampa-scheda .eic-blocco { break-inside: avoid; margin: 0 0 2.5mm; padding: 1.5mm 2.5mm; border: 0.25mm solid #ccc; border-radius: 1mm; }
  .eic-stampa-scheda .eic-blocco b { display: block; font-size: 9.5pt; color: #333; margin-bottom: 0.8mm; }
  .eic-stampa-scheda .eic-blocco p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .eic-stampa-scheda .eic-vuota { color: #777; font-style: italic; }
  .eic-stampa-scheda footer { margin-top: 4mm; color: #777; font-size: 8.5pt; }
}
`;

export function OpportunityPrintSheet({ scheda }: { scheda: SchedaStampa }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="eic-stampa-scheda" aria-hidden="true">
      <style>{CSS}</style>
      <h1>{scheda.titolo}</h1>
      {scheda.sottotitolo && <div className="eic-sotto">{scheda.sottotitolo}</div>}
      {scheda.sezioni.map((s) => (
        <section key={s.titolo}>
          <h2>{s.titolo}</h2>
          {s.righe && (
            <table>
              <tbody>
                {s.righe.map((r, i) => (
                  <tr key={`${r.etichetta}-${i}`}>
                    <td className="eic-et">{r.etichetta}</td>
                    <td>{r.valore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.blocchi && s.blocchi.length > 0
            ? s.blocchi.map((b, i) => (
                <div className="eic-blocco" key={i}>
                  <b>{b.intestazione}</b>
                  <p>{b.testo}</p>
                </div>
              ))
            : s.vuota && <p className="eic-vuota">{s.vuota}</p>}
        </section>
      ))}
      <footer>Stampata il {scheda.stampataIl}</footer>
    </div>,
    document.body,
  );
}
