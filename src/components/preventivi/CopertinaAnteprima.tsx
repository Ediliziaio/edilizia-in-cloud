/**
 * CopertinaAnteprima — la copertina del «Piano dei lavori» come la vedrà il
 * cliente, dentro l'editor del modello.
 *
 * Non ricopia le regole del PDF: le prende dallo stesso posto. I campi del form
 * passano da `leggiModello` (che conosce tutti i nomi: `pdf_cover_*`, `cover_*`)
 * e i colori da `creaTema` / `coloriCopertina`, gli stessi del documento. Prima
 * ogni editor aveva la sua copia dell'anteprima, scritta a mano: bastava
 * ritoccare il PDF perché l'anteprima mostrasse un'altra cosa.
 */
import * as React from "react";
import { leggiModello, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI, type ChiaveModuloEdile } from "@/components/preventivi/pdf/moduliEdili";
import { COPERTINA_DI_SERIE } from "@/components/preventivi/pdf/immaginiDocumento";
import { creaTema, coloriCopertina, copertinaInTinta } from "@/components/preventivi/pdf/temaDocumento";
import { spezzaAccento } from "@/components/preventivi/pdf/testoDocumento";
import { useKitMarchio, type KitMarchio } from "@/hooks/useKitMarchio";

const PROGETTO_ESEMPIO: ProgettoComune = {
  code: "2026-014",
  tipo_intervento: null,
  cliente_nome: "Mario",
  cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1",
  cantiere_citta: "Milano",
  cantiere_provincia: "MI",
  cantiere_cap: "20100",
  immobile_tipo: null,
  immobile_superficie_mq: null,
  immobile_anno: null,
  immobile_piani: null,
};

/** rgba() da un esadecimale, per i veli in CSS. */
function rgba(hex: string, alfa: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alfa))})`;
}

function BarraSegmenti({ colore }: { colore: string }) {
  return (
    <div className="flex w-full gap-[2px]">
      {[1, 0.72, 0.48, 0.28, 0.14].map((o, i) => (
        <div key={i} className="h-[2px] flex-1" style={{ backgroundColor: colore, opacity: o }} />
      ))}
    </div>
  );
}

export interface CopertinaAnteprimaProps {
  modulo: ChiaveModuloEdile;
  /** Il form dell'editor, così com'è: i nomi dei campi li risolve `leggiModello`. */
  form: Record<string, unknown>;
  /** È un modello mai salvato? Allora vale la foto di serie del mestiere, come nel PDF. */
  maiSalvato?: boolean;
  logoUrl?: string | null;
  nomeAzienda?: string | null;
  className?: string;
}

/** Con il kit del marchio dell'azienda letto dal database: è quella che usano gli editor. */
export function CopertinaAnteprima(props: CopertinaAnteprimaProps) {
  const kit = useKitMarchio();
  return <CopertinaAnteprimaVista {...props} kit={kit} />;
}

/** Solo disegno, senza letture: il kit del marchio arriva da fuori. */
export function CopertinaAnteprimaVista({ modulo, form, maiSalvato = false, logoUrl, nomeAzienda, className, kit }: CopertinaAnteprimaProps & { kit: KitMarchio | null }) {
  const config = MODULI_EDILI[modulo];
  const modello = leggiModello(form, { progetto: PROGETTO_ESEMPIO, azienda: { colore_marca: kit?.coloreMarca ?? null } });
  const c = modello.copertina;
  const tema = creaTema({ primario: modello.colorePrimario });
  const { fondo, testo, evidenza } = coloriCopertina(tema, { fondo: c.coloreFondo, testo: c.coloreTesto });
  const immagine = c.immagineUrl ?? (maiSalvato ? COPERTINA_DI_SERIE[modulo] ?? null : null);
  const opacita = c.opacitaVelo ?? 0.6;
  const inTinta = copertinaInTinta(c.opacitaVelo);
  const coloreVelo = inTinta ? (c.coloreFondo ? fondo : tema.fondo) : "#000000";
  const coloreAppoggio = inTinta ? fondo : "#000000";

  const velo =
    c.stileVelo === "flat" ? rgba(coloreVelo, opacita)
    : c.stileVelo === "gradient_diag" ? `linear-gradient(135deg, ${rgba(coloreVelo, opacita * 0.4)}, ${rgba(coloreVelo, opacita * 1.1)})`
    : c.stileVelo === "vignette" ? `radial-gradient(ellipse at 50% 45%, ${rgba(coloreVelo, opacita * 0.35)} 0%, ${rgba(coloreVelo, opacita * 0.8)} 70%, ${rgba(coloreVelo, opacita * 1.15)} 100%)`
    : c.verticale === "top"
      ? `linear-gradient(to bottom, ${rgba(coloreVelo, opacita)}, ${rgba(coloreVelo, opacita * 0.75)} 50%, ${rgba(coloreVelo, opacita * 0.55)})`
      : `linear-gradient(to bottom, ${rgba(coloreVelo, opacita * 0.55)}, ${rgba(coloreVelo, opacita * 0.75)} 50%, ${rgba(coloreVelo, opacita)})`;
  const appoggio =
    c.verticale === "center" ? rgba(coloreAppoggio, 0.45)
    : c.verticale === "top"
      ? `linear-gradient(to bottom, ${rgba(coloreAppoggio, 0.96)} 0%, ${rgba(coloreAppoggio, 0.78)} 34%, ${rgba(coloreAppoggio, 0)} 62%)`
      : `linear-gradient(to bottom, ${rgba(coloreAppoggio, 0)} 40%, ${rgba(coloreAppoggio, 0.8)} 70%, ${rgba(coloreAppoggio, 0.96)} 100%)`;

  const titolo = c.titolo || config.titoloCopertina;
  const sottotitolo = c.sottotitolo || config.sottotitoloCopertina;
  const occhiello = c.occhiello || "Piano dei lavori";
  // L'anteprima è larga un terzo circa della pagina vera: i corpi si scalano con lei.
  const k = 0.36;
  const corpoTitolo = Math.max(26, Math.min(54, c.corpoTitolo ?? 42)) * k;
  const corpoOcchiello = Math.max(7, Math.min(12, c.corpoOcchiello ?? 8.5)) * k;
  const corpoSottotitolo = Math.max(10, Math.min(16, c.corpoSottotitolo ?? 12.5)) * k;
  const logo = c.logoUrl || (testo === "#FFFFFF" ? kit?.logoChiaroUrl : null) || logoUrl || kit?.logoUrl || null;
  const centro = c.allineamento === "center";

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border shadow-sm ${className ?? ""}`}
      style={{ aspectRatio: "595 / 841", backgroundColor: fondo, color: testo }}
    >
      {immagine ? (
        <>
          <img
            src={immagine} alt="" loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: inTinta ? "grayscale(1) contrast(1.08)" : undefined }}
          />
          <div className="absolute inset-0" style={{ background: velo }} />
          <div className="absolute inset-0" style={{ background: appoggio }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${rgba(tema.fondo, 0.55)}, rgba(0,0,0,0.28))` }} />
          {/* la tavola di progetto: griglia sottile su tutto il fondo */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 0.07,
              backgroundImage: `linear-gradient(${testo} 1px, transparent 1px), linear-gradient(90deg, ${testo} 1px, transparent 1px)`,
              backgroundSize: "6% 4.2%",
            }}
          />
          {c.mostraDecorazione && c.decorazione !== "none" ? (
            <div className="absolute rounded-full border" style={{ borderColor: testo, opacity: 0.16, width: "64%", aspectRatio: "1 / 1", right: "-11%", top: "7%" }} />
          ) : null}
        </>
      )}

      {immagine && c.mostraDecorazione && c.decorazione !== "none" ? (
        <svg viewBox="0 0 150 150" aria-hidden className="pointer-events-none absolute right-[6%] top-[5%] w-[24%]">
          {c.decorazione === "circle" ? (
            <g fill="none" stroke={testo}>
              <circle cx={75} cy={75} r={70} strokeWidth={1.4} opacity={0.55} />
              <circle cx={75} cy={75} r={48} strokeWidth={1} opacity={0.35} />
              <circle cx={75} cy={75} r={26} strokeWidth={0.8} opacity={0.22} />
            </g>
          ) : c.decorazione === "line" ? (
            <g stroke={testo}>
              <line x1={75} y1={6} x2={75} y2={144} strokeWidth={1.6} opacity={0.6} />
              <line x1={58} y1={30} x2={92} y2={30} strokeWidth={1} opacity={0.4} />
              <line x1={58} y1={120} x2={92} y2={120} strokeWidth={1} opacity={0.4} />
            </g>
          ) : c.decorazione === "pattern" ? (
            <g fill={testo} opacity={0.4}>
              {Array.from({ length: 36 }).map((_, i) => <circle key={i} cx={15 + (i % 6) * 24} cy={15 + Math.floor(i / 6) * 24} r={1.8} />)}
            </g>
          ) : (
            <g fill="none" stroke={testo}>
              <g strokeWidth={1.4} opacity={0.55}>
                <path d="M 12 40 L 12 12 L 40 12" /><path d="M 110 12 L 138 12 L 138 40" />
                <path d="M 138 110 L 138 138 L 110 138" /><path d="M 40 138 L 12 138 L 12 110" />
              </g>
              <g strokeWidth={0.8} opacity={0.3} strokeDasharray="5 4">
                <line x1={75} y1={24} x2={75} y2={126} /><line x1={24} y1={75} x2={126} y2={75} />
              </g>
              <circle cx={75} cy={75} r={22} strokeWidth={0.8} opacity={0.3} />
            </g>
          )}
        </svg>
      ) : null}

      <div className="absolute inset-0 flex flex-col" style={{ padding: "5.5% 8% 5.2%" }}>
        <div
          className="flex shrink-0 items-start"
          style={{ height: "8%", justifyContent: c.posizioneLogo === "top_right" ? "flex-end" : c.posizioneLogo === "top_center" ? "center" : "flex-start" }}
        >
          {c.posizioneLogo === "hidden" ? null : logo ? (
            <img src={logo} alt="" className="object-contain" style={{ height: `${70 * c.scalaLogo}%`, maxWidth: "40%" }} />
          ) : (
            <div>
              <div className="font-bold uppercase" style={{ fontSize: 13 * k, letterSpacing: "0.17em" }}>{nomeAzienda || "La tua azienda"}</div>
              <div className="mt-[3px] w-[14px]"><BarraSegmenti colore={evidenza} /></div>
            </div>
          )}
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            justifyContent: c.verticale === "top" ? "flex-start" : c.verticale === "center" ? "center" : "flex-end",
            alignItems: centro ? "center" : "flex-start",
            textAlign: c.allineamento,
            padding: "5% 0 5.5%",
          }}
        >
          <div className="font-bold uppercase" style={{ color: evidenza, fontSize: corpoOcchiello, letterSpacing: "0.28em", marginBottom: "2.2%" }}>{occhiello}</div>
          <div className="font-bold" style={{ fontSize: corpoTitolo, lineHeight: 1.2, letterSpacing: "-0.022em", maxWidth: "96%" }}>
            {spezzaAccento(titolo).map((p, i) =>
              p.accento ? (
                <em key={i} style={{ fontFamily: "Times New Roman, Times, serif", fontWeight: 400, fontSize: "1.1em", color: evidenza, letterSpacing: "-0.012em" }}>{p.testo}</em>
              ) : (
                <span key={i}>{p.testo}</span>
              ),
            )}
          </div>
          <div style={{ fontSize: corpoSottotitolo, opacity: 0.86, marginTop: "2.2%", lineHeight: 1.4, maxWidth: "80%" }}>{sottotitolo}</div>
        </div>

        {c.mostraScheda ? (
          <div className="shrink-0">
            <BarraSegmenti colore={testo} />
            <div className="mt-[6px] flex gap-2">
              {[["Preparato per", "Mario Rossi"], ["Cantiere", "Via Roma 1, Milano"], ["Riferimento", "2026-014"], ["Data", "oggi"]].map(([e, v], i) => (
                <div key={i} className="min-w-0" style={{ flex: i === 1 ? 1.5 : 1 }}>
                  <div className="truncate font-bold uppercase" style={{ color: evidenza, fontSize: 6.5 * k, letterSpacing: "0.16em" }}>{e}</div>
                  <div className="truncate font-bold" style={{ fontSize: 9.5 * k }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CopertinaAnteprima;
