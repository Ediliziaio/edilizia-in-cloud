import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda } from "@/types/fatturazione";
import { nativePdfSnapshot } from "../../../supabase/functions/_shared/nativePdfSnapshot";
import { logoDiRiserva } from "../../../supabase/functions/_shared/logoAzienda";
import { iscrizioneRea } from "../../../supabase/functions/_shared/datiSocietari";
import { naturaToXml } from "../../../supabase/functions/_shared/generateXML";
import { TIPI_FISCALI, noteFiscali } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import {
  cssFoglio,
  dataBreve,
  etichettaTipoDocumento,
  euro,
  euroConSegno,
  formaGiuridicaDaMostrare,
  ibanLeggibile,
  importoInEvidenza,
  importoRiga,
  indirizzoInRiga,
  nomeDestinatario,
  nomeModalitaPagamento,
  quantitaLeggibile,
  temaFattura,
  vociTotali,
} from "../../../supabase/functions/_shared/documentoFiscaleVista";

/*
 * L'anteprima della fattura nell'app. Stesso foglio di stile, stesse voci e
 * stessa struttura del PDF (supabase/functions/generate-native-pdf/documentoHtml.ts):
 * chi tocca l'uno guarda anche l'altro.
 */

type Dati = Record<string, any>;

interface Props {
  documento: EditorState;
  azienda: AnagraficaAzienda | null;
  /** Il logo aziendale, usato quando l'anagrafica di fatturazione non ne ha uno (come nel PDF). */
  logoAziendale?: string | null;
  scale?: number;
}

const unite = (parti: Array<string | false | null | undefined>) => parti.filter(Boolean).join(" · ");

function Righe({ righe }: { righe: string[] }) {
  const piene = righe.filter(Boolean);
  return <>{piene.map((r, i) => <div key={i}>{r}</div>)}</>;
}

const aliquota = (valore: unknown, natura: unknown) =>
  `${valore ?? ""}%${natura ? ` (${naturaToXml(String(natura))})` : ""}`;

export function PreviewFattura({ documento, azienda, logoAziendale, scale = 0.65 }: Props) {
  // Le chiavi dei documenti più vecchi (totale, iva, aliquota_iva) si leggono come nel PDF.
  const doc: Dati = nativePdfSnapshot(documento as unknown as Dati);
  const righe: Dati[] = doc.righe ?? [];
  const riepilogo: Dati[] = doc.riepilogo_iva ?? [];
  const scadenze: Dati[] = Array.isArray(doc.scadenze_pagamento) ? doc.scadenze_pagamento : [];
  const snap: Dati = doc.cliente_snapshot ?? {};
  const az: Dati = azienda ?? {};
  const tema = temaFattura(az.colore_primario);
  const etichetta = etichettaTipoDocumento(doc.tipo ?? "fattura");
  const conSconto = righe.some((r) => (Number(r.sconto_percentuale) || 0) > 0);
  const logo = logoDiRiserva(az.logo_url, logoAziendale);
  const evidenza = importoInEvidenza(doc);
  const destinatario = nomeDestinatario(snap);

  const rea = azienda ? iscrizioneRea(azienda) : null;
  const piva = String(az.partita_iva ?? "").trim();
  const cf = String(az.codice_fiscale ?? "").trim();
  const pivaCliente = String(snap.partita_iva ?? "").trim();
  const cfCliente = String(snap.codice_fiscale ?? "").trim();

  return (
    <div
      className="preview-fattura-scale"
      style={{ transform: `scale(${scale})`, transformOrigin: "top center", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {/* Come HTML: il foglio di stile ha virgolette e «>» che React, come testo, renderebbe innocui. Solo colori già normalizzati. */}
      <style dangerouslySetInnerHTML={{ __html: cssFoglio(tema) }} />
      <div className="preview-fattura-sheet fd-foglio shadow-lg border rounded-sm mx-auto" style={{ minHeight: "297mm" }}>
        <div className="fd-testata">
          <div className="fd-emittente">
            {logo && <img className="fd-logo" src={logo} alt="" />}
            {azienda ? (
              <>
                <div className="fd-ragione">{az.ragione_sociale}</div>
                {formaGiuridicaDaMostrare(az.ragione_sociale, az.forma_giuridica) && (
                  <div className="fd-forma">{formaGiuridicaDaMostrare(az.ragione_sociale, az.forma_giuridica)}</div>
                )}
                <div className="fd-dati">
                  <Righe
                    righe={[
                      indirizzoInRiga(az),
                      unite([piva && `P.IVA ${piva}`, cf && cf !== piva && `C.F. ${cf}`]),
                      rea
                        ? unite([
                          `REA ${rea.ufficio}-${rea.numero}`,
                          rea.capitale !== null && `Capitale sociale versato ${euro(rea.capitale)}`,
                          rea.socioUnico === "SU" && "Socio unico",
                          rea.stato === "LS" && "In liquidazione",
                        ])
                        : "",
                      unite([az.pec && `PEC ${az.pec}`, az.telefono && `Tel. ${az.telefono}`]),
                      unite([az.email, az.sito_web]),
                    ]}
                  />
                </div>
              </>
            ) : (
              <div className="fd-forma" style={{ fontStyle: "italic" }}>Configura anagrafica azienda</div>
            )}
          </div>
          <div className="fd-documento">
            <div className="fd-tipo">{etichetta}</div>
            <div className="fd-estremi">
              <div className="fd-voce fd-numero">Numero</div>
              <div className="fd-valore fd-numero">{doc.numero || "BOZZA"}</div>
              <div className="fd-voce">Data</div>
              <div className="fd-valore">{dataBreve(doc.data_emissione)}</div>
              {doc.data_scadenza && (
                <>
                  <div className="fd-voce">Scadenza</div>
                  <div className="fd-valore">{dataBreve(doc.data_scadenza)}</div>
                </>
              )}
              <div className="fd-voce fd-evidenza">{evidenza.etichetta}</div>
              <div className="fd-valore fd-evidenza">{euro(evidenza.importo)}</div>
            </div>
            {destinatario && (
              <div className="fd-riquadro fd-destinatario">
                <div className="fd-etichetta">Destinatario</div>
                <div className="fd-cliente">{destinatario}</div>
                <div className="fd-cliente-dati">
                  <Righe
                    righe={[
                      indirizzoInRiga(snap),
                      unite([pivaCliente && `P.IVA ${pivaCliente}`, cfCliente && cfCliente !== pivaCliente && `C.F. ${cfCliente}`]),
                      unite([snap.codice_sdi && `Codice destinatario ${snap.codice_sdi}`, snap.pec && `PEC ${snap.pec}`]),
                    ]}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="fd-filetto" />

        {doc.tipo === "nota_credito" && doc.documento_correlato_id && (
          <div className="fd-avviso">Nota di credito a storno di un documento precedente</div>
        )}
        {(doc.cig || doc.cup) && (
          <div className="fd-riferimenti">{unite([doc.cig && `CIG ${doc.cig}`, doc.cup && `CUP ${doc.cup}`])}</div>
        )}

        {righe.length > 0 && (
          <table className="fd-voci">
            <thead>
              <tr>
                <th className="fd-n">#</th>
                <th>Descrizione</th>
                <th className="fd-d">Q.tà</th>
                <th className="fd-c">U.M.</th>
                <th className="fd-d">Prezzo</th>
                {conSconto && <th className="fd-d">Sc.%</th>}
                <th className="fd-c">IVA</th>
                <th className="fd-d">Importo</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td className="fd-n">{i + 1}</td>
                  <td className="fd-descrizione">
                    {r.descrizione || "—"}
                    {r.codice_articolo && <div className="fd-sotto">Cod. {r.codice_articolo}</div>}
                    {r.note_riga && <div className="fd-sotto fd-sotto-nota">{r.note_riga}</div>}
                  </td>
                  <td className="fd-d">{quantitaLeggibile(r.quantita)}</td>
                  <td className="fd-c">{r.unita_misura}</td>
                  <td className="fd-d">{euro(r.prezzo_unitario)}</td>
                  {conSconto && (
                    <td className="fd-d">{Number(r.sconto_percentuale) > 0 ? `${quantitaLeggibile(r.sconto_percentuale)}%` : ""}</td>
                  )}
                  <td className="fd-c">{aliquota(r.aliquota_iva, r.natura_iva)}</td>
                  <td className="fd-d fd-importo">{euro(importoRiga(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="fd-conti">
          {riepilogo.length > 0 && (
            <div className="fd-riepilogo">
              <table>
                <thead>
                  <tr><th>Aliquota IVA</th><th className="fd-d">Imponibile</th><th className="fd-d">Imposta</th></tr>
                </thead>
                <tbody>
                  {riepilogo.map((r, i) => (
                    <tr key={i}>
                      <td>{aliquota(r.aliquota, r.natura)}</td>
                      <td className="fd-d">{euro(r.imponibile)}</td>
                      <td className="fd-d">{euro(r.imposta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="fd-totali">
            <table>
              <tbody>
                {vociTotali(doc).map((v, i) => (
                  <FragmentoTotale key={i} voce={v.voce} importo={v.importo} tipo={v.tipo} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(doc.metodo_pagamento_codice || doc.note_documento) && (
          <div className="fd-info">
            {doc.metodo_pagamento_codice && (
              <div className="fd-riquadro">
                <div className="fd-etichetta">Pagamento</div>
                <div className="fd-metodo">{nomeModalitaPagamento(doc.metodo_pagamento_codice, doc.metodo_pagamento_nome)}</div>
                {doc.iban_pagamento && <div>IBAN <span className="fd-iban">{ibanLeggibile(doc.iban_pagamento)}</span></div>}
                {doc.intestatario_conto && <div>Intestatario: {doc.intestatario_conto}</div>}
                {doc.nome_banca && <div>Banca: {doc.nome_banca}</div>}
                {doc.bic_pagamento && <div>BIC: {doc.bic_pagamento}</div>}
                {scadenze.length > 0 && (
                  <table className="fd-rate">
                    <thead><tr><th>Rata</th><th>Scadenza</th><th className="fd-d">Importo</th></tr></thead>
                    <tbody>
                      {scadenze.map((sc, i) => (
                        <tr key={i}>
                          <td>{sc.numero_rata}{sc.pagato ? " · pagata" : ""}</td>
                          <td>{dataBreve(sc.data_scadenza)}</td>
                          <td className="fd-d">{euro(sc.importo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {doc.note_documento && (
              <div className="fd-riquadro">
                <div className="fd-etichetta">Note</div>
                <div className="fd-testo">{doc.note_documento}</div>
              </div>
            )}
          </div>
        )}

        {az.regime_fiscale === "RF19" && (
          <div className="fd-forfettario">
            Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, L. n. 190/2014. Non soggetta a ritenuta d'acconto ai sensi del comma 67, L. n. 190/2014.
          </div>
        )}

        {TIPI_FISCALI.includes(doc.tipo) && noteFiscali(doc).length > 0 && (
          <div className="fd-avvertenze">
            <div className="fd-etichetta">Note fiscali</div>
            {noteFiscali(doc).map((t) => <div key={t}>{t}</div>)}
          </div>
        )}
        {TIPI_FISCALI.includes(doc.tipo) && (
          <div className="fd-cortesia">
            Copia di cortesia. La fattura con valore fiscale è il file XML trasmesso al Sistema di Interscambio (SdI).
            {!pivaCliente && " L'originale è disponibile nella tua area riservata del sito dell'Agenzia delle Entrate (Fatture e Corrispettivi)."}
          </div>
        )}

        <div className="fd-piede">
          <div>{az.ragione_sociale}{piva ? ` — P.IVA ${piva}` : ""}</div>
          <div>Documento generato da Edilizia in Cloud</div>
        </div>
      </div>
    </div>
  );
}

function FragmentoTotale({ voce, importo, tipo }: { voce: string; importo: number; tipo?: "totale" | "finale" }) {
  const riga = (
    <tr className={tipo ? `fd-${tipo}` : undefined}>
      <td>{voce}</td>
      <td className="fd-d">{euroConSegno(importo)}</td>
    </tr>
  );
  if (tipo !== "finale") return riga;
  return (
    <>
      <tr className="fd-stacco"><td colSpan={2} /></tr>
      {riga}
    </>
  );
}
