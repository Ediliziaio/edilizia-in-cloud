import * as React from "react";
import { photoPlacementCaption } from "./photoPlacement";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type { SurveyDetail } from "@/lib/api/surveys";
import type { SurveyPdfBrand } from "./pdfBrand";
import {
  buildSurveyReport,
  dateSurvey,
  surveyLastUpdated,
  surveyOfficeReviewText,
  SURVEY_STATUS,
  surveyAddress,
  surveyMediaIsImage,
  type ReportField,
  type SurveyReferences,
} from "./report";
import { WindowSurveyPdf } from "./windowSurveyPdf";
import { isEnergySurvey, energyKind } from "./energySurvey";
import { EnergySurveyPdf } from "./energySurveyPdf";
import { windowAbacoHasDetails } from "./windowAbaco";
import {
  windowDisplayValues,
  windowSurveyDrawing,
  windowComponentData,
  WINDOW_COMPONENTS,
  isWindowSurvey,
} from "./windowSurvey";

const ink = "#18334c",
  muted = "#607287",
  accent = "#d86b27";
const clean = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF]/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/[\u2011-\u2015]/g, "-")
    .replace(/→/g, "> ");
const st = StyleSheet.create({
  page: {
    padding: 36,
    paddingBottom: 50,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: ink,
  },
  mast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: ink,
    paddingBottom: 15,
    marginBottom: 25,
  },
  logo: {
    width: 112,
    height: 45,
    objectFit: "contain",
    objectPosition: "left center",
  },
  firm: { fontFamily: "Helvetica-Bold", fontSize: 13, color: ink },
  contact: { width: "51%", textAlign: "right", color: muted, fontSize: 8 },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: accent, marginBottom: 9 },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 34,
    lineHeight: 1.12,
    marginBottom: 9,
  },
  subtitle: { fontSize: 11, color: muted, marginBottom: 19 },
  code: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 14 },
  info: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#f4f7fa",
    borderRadius: 9,
    padding: 15,
    gap: 12,
    marginBottom: 16,
  },
  infoCell: { width: "47%" },
  label: { fontSize: 7, letterSpacing: 0.6, color: muted, marginBottom: 3 },
  value: { fontSize: 10 },
  stats: { flexDirection: "row", gap: 10, marginBottom: 18 },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 12,
    borderWidth: 0.6,
    borderColor: "#dae3ec",
    borderRadius: 8,
  },
  number: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    lineHeight: 1.25,
    marginBottom: 5,
  },
  section: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginBottom: 9,
    marginTop: 12,
  },
  subheading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: muted,
    marginTop: 9,
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5ebf1",
  },
  field: { color: muted, fontSize: 7, lineHeight: 1.3, marginBottom: 3 },
  fieldValue: { fontSize: 9, lineHeight: 1.3 },
  indexHead: {
    flexDirection: "row",
    padding: 7,
    backgroundColor: ink,
    color: "#ffffff",
    fontSize: 8,
    borderRadius: 4,
  },
  indexRow: {
    flexDirection: "row",
    padding: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5ebf1",
    fontSize: 9,
  },
  itemNumber: { width: "8%", color: accent, fontFamily: "Helvetica-Bold" },
  itemName: {
    width: "54%",
    paddingRight: 10,
    textDecoration: "none",
    color: ink,
  },
  itemArea: { width: "30%", color: muted, paddingRight: 6 },
  itemQty: { width: "8%", textAlign: "right" },
  sheetHead: {
    borderBottomWidth: 1,
    borderBottomColor: "#dce5ee",
    paddingBottom: 12,
    marginBottom: 13,
  },
  sheetTitle: {
    fontSize: 21,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
    marginBottom: 6,
  },
  note: { color: muted, marginTop: 7 },
  notice: {
    padding: 11,
    borderRadius: 7,
    borderLeftWidth: 2,
    borderLeftColor: accent,
    backgroundColor: "#fff7ed",
    color: "#8d471b",
    fontSize: 8,
    marginTop: 12,
  },
  neutral: {
    padding: 11,
    borderRadius: 7,
    backgroundColor: "#f4f7fa",
    color: muted,
    fontSize: 8,
    marginTop: 12,
  },
  photo: { width: "100%", height: 230, objectFit: "contain", marginTop: 8 },
  caption: { fontSize: 8, color: muted, marginTop: 4 },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 22,
    height: 14,
    fontSize: 8,
    color: muted,
  },
});

function Fields({
  fields,
  title,
  compact = false,
}: {
  fields: ReportField[];
  title: string;
  compact?: boolean;
}) {
  if (!fields.length) return null;
  const rows: ReportField[][] = [];
  const absent = compact ? fields.filter((f) => f.missing && !f.required) : [];
  for (const f of fields.filter((f) => !absent.includes(f))) {
    const last = rows[rows.length - 1];
    if (
      f.value.length <= 120 &&
      last?.length === 1 &&
      last[0].value.length <= 120
    )
      last.push(f);
    else rows.push([f]);
  }
  return (
    <View>
      {rows.map((row, i) => (
        <View key={row[0].key} wrap={row.some((f) => f.value.length > 500)}>
          {i === 0 && (
            <Text
              style={[
                st.subheading,
                ...(compact ? [{ marginTop: 1, marginBottom: 1 }] : []),
              ]}
            >
              {clean(title)}
            </Text>
          )}
          <View
            style={[
              st.row,
              { gap: 18 },
              // Keep dense abaci readable without pushing a final single row onto its own page.
              ...(compact ? [{ paddingVertical: 0.5 }] : []),
            ]}
          >
            {row.map((f) => (
              <View
                key={f.key}
                style={{ width: row.length === 1 ? "100%" : "48%" }}
              >
                {!compact && (
                  <Text
                    style={[
                      st.field,
                      ...(compact ? [{ marginBottom: 1 }] : []),
                    ]}
                  >
                    {clean(f.label)}
                    {f.required ? " *" : ""}
                  </Text>
                )}
                <Text
                  style={[
                    st.fieldValue,
                    ...(compact ? [{ fontSize: 8, lineHeight: 1.15 }] : []),
                    ...(f.missing ? [{ color: "#9a541d" }] : []),
                  ]}
                >
                  {compact && (
                    <Text style={{ color: muted, fontSize: 7 }}>
                      {clean(f.label)}
                      {f.required ? " *" : ""}:{" "}
                    </Text>
                  )}
                  {clean(f.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {absent.some((f) => f.label.trim()) && (
        <Text
          style={{ fontSize: 7, color: muted, marginTop: 3, marginBottom: 2 }}
        >
          Non rilevati:{" "}
          {absent
            .map((f) => clean(f.label))
            .filter((label) => label.trim())
            .slice(0, 6)
            .join("; ")}
          {absent.length > 6
            ? `; altri ${absent.length - 6} campi facoltativi non compilati (dettaglio nell’app).`
            : ""}
          .
        </Text>
      )}
    </View>
  );
}

export function SurveyTechnicalPdf({
  detail,
  companyName,
  references,
  brand,
  images,
}: {
  detail: SurveyDetail;
  companyName: string;
  references?: SurveyReferences;
  brand?: SurveyPdfBrand;
  images: Record<string, string | null>;
}) {
  const report = buildSurveyReport(detail),
    { survey } = report;
  const identity = brand?.companyId === survey.company_id ? brand : undefined;
  const energy = ["fotovoltaico", "climatizzazione"].includes(detail.template.category);
  const coverIndexLimit = energy ? 8 : 10;
  const quantityLabel = (e: SurveyDetail["elements"][number]) => {
    const type = detail.template.schema.element_types.find(t=>t.key===e.element_type), kind=energyKind(type);
    if (!kind) return String(e.quantity);
    return kind === "route" ? `${e.values.en_length ?? "?"} m` : `${e.values.en_count ?? "?"} pz`;
  };
  const elements = [
    ...report.areas.flatMap((a) => a.elements),
    ...report.unassigned,
  ];
  const areaFor = (id: string | null) =>
    report.areas.find((a) => a.id === id)?.name || "Senza area riconosciuta";
  const footer = () => (
    <Text
      fixed
      style={st.footer}
      render={({ pageNumber, totalPages }) =>
        `${clean(companyName).slice(0, 64)}  |  ${clean(survey.code).slice(0, 48)}  |  ${pageNumber} / ${totalPages}`
      }
    />
  );
  const picture = (m: SurveyDetail["media"][number]) => (
    <View key={m.id} wrap={m.type === "annotated_photo" ? false : undefined} style={{ marginBottom: 16 }}>
      <View wrap={false}>
        <Text style={st.subheading}>
          {clean(m.checklist_label || m.filename || "Allegato")}
        </Text>
        <Text style={st.caption}>
          {m.element_id
            ? `${String(elements.findIndex((e) => e.id === m.element_id) + 1).padStart(2, "0")} - ${clean(elements.find((e) => e.id === m.element_id)?.title || "Elemento")}`
            : m.area_id
              ? clean(areaFor(m.area_id))
              : "Sopralluogo"}
        </Text>
        {images[m.id] ? (
          <Image src={images[m.id]!} style={st.photo} />
        ) : (
          <Text style={st.caption}>
            {surveyMediaIsImage(m)
              ? "Immagine non riprodotta: consultare l’allegato nell’app."
              : "Allegato consultabile nell’app."}
          </Text>
        )}
        {photoPlacementCaption(m.annotations).map((line, i) => <Text key={`placement-${i}`} style={st.note}>{clean(line)}</Text>)}
      </View>
      {m.transcription && <Text style={st.note}>{clean(m.transcription)}</Text>}
    </View>
  );
  const indexContent = (heading = true) => (
    <>
      {heading && (
        <Text style={st.section} minPresenceAhead={50}>
          Indice delle schede
        </Text>
      )}
      <View style={st.indexHead}>
        <Text style={{ width: "8%" }}>N.</Text>
        <Text style={{ width: "54%" }}>ELEMENTO</Text>
        <Text style={{ width: "30%" }}>AMBIENTE</Text>
        <Text style={{ width: "8%", textAlign: "right" }}>Q.TA</Text>
      </View>
      {elements.map((e, i) => (
        <View key={e.id} style={st.indexRow} wrap={false}>
          <Text style={st.itemNumber}>{String(i + 1).padStart(2, "0")}</Text>
          <Link src={`#survey-element-${e.id}`} style={st.itemName}>
            {clean(e.title)}
          </Link>
          <Text style={st.itemArea}>{clean(areaFor(e.area_id))}</Text>
          <Text style={st.itemQty}>{quantityLabel(e)}</Text>
        </View>
      ))}
    </>
  );
  const closingNotes = () => (
    <>
      {surveyOfficeReviewText(survey) && <View style={st.neutral}><Text style={st.section} minPresenceAhead={40}>Ultimo riscontro dell’ufficio</Text><Text>{clean(surveyOfficeReviewText(survey)!)}</Text></View>}
      <Text style={st.section} minPresenceAhead={40}>
        Note generali
      </Text>
      <Text>{clean(survey.notes || "Nessuna nota registrata.")}</Text>
      {survey.general_audio_transcription && (
        <Text style={st.note}>
          Trascrizione: {clean(survey.general_audio_transcription)}
        </Text>
      )}
      <Text style={st.section} minPresenceAhead={45}>
        Foto e allegati
      </Text>
      {report.media.length ? (
        report.media.map(picture)
      ) : (
        <Text style={st.caption}>
          Nessun allegato registrato. Non sono state aggiunte fotografie
          dimostrative.
        </Text>
      )}
      <Text style={st.section} minPresenceAhead={45}>
        Firma registrata
      </Text>
      <Text>
        {survey.client_signature_at
          ? `${clean(survey.client_signature_name || "Firmatario non indicato")} - ${dateSurvey(survey.client_signature_at, true)}`
          : "Nessuna firma registrata."}
      </Text>
      {images.firma && (
        <Image
          src={images.firma}
          style={{ height: 70, width: 200, objectFit: "contain", marginTop: 8 }}
        />
      )}
      <Text style={st.neutral}>
        Report dei dati salvati. Non sostituisce un originale sottoscritto, una
        dichiarazione di conformità o una verifica tecnica. Le quote del foro
        non sono automaticamente misure finite per l’ordine.
      </Text>
    </>
  );
  return (
    <Document
      title={`Sopralluogo ${detail.template.category} ${survey.code}`}
      author={companyName}
      subject="Dossier tecnico dei dati salvati - non valido come ordine di produzione"
    >
      <Page size="A4" style={st.page}>
        <View style={st.mast} wrap={false}>
          <View style={{ width: "45%" }}>
            {identity && images.logo ? (
              <Image src={images.logo} style={st.logo} />
            ) : (
              <Text style={st.firm}>{clean(companyName)}</Text>
            )}
          </View>
          <View style={st.contact}>
            {images.logo && (
              <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>
                {clean(companyName)}
              </Text>
            )}
            {identity?.address && <Text>{clean(identity.address)}</Text>}
            {identity?.vatNumber && (
              <Text>P. IVA {clean(identity.vatNumber)}</Text>
            )}
            {identity?.email && <Text>{clean(identity.email)}</Text>}
            {identity?.phone && <Text>{clean(identity.phone)}</Text>}
          </View>
        </View>
        <Text style={st.eyebrow}>SOPRALLUOGO / DOSSIER TECNICO</Text>
        <Text style={st.title}>{detail.template.category === "fotovoltaico" ? "Rilievo fotovoltaico" : detail.template.category === "climatizzazione" ? "Rilievo impianto termico" : "Rilievo serramenti"}</Text>
        <Text style={st.subtitle}>{clean(detail.template.name)}</Text>
        <Text style={st.code}>
          {clean(survey.code)} /{" "}
          {clean(SURVEY_STATUS[survey.status] || survey.status)}
        </Text>
        <View style={st.info} wrap={false}>
          {[
            ["IMMOBILE / CANTIERE", surveyAddress(survey)],
            ["RIFERIMENTO CLIENTE", references?.reference || "Non registrato"],
            ["APPUNTAMENTO", dateSurvey(survey.scheduled_at, true)],
            [
              "INCARICATI",
              references?.assignees.join(", ") ||
                "Nessuna assegnazione registrata",
            ],
          ].map(([label, value]) => (
            <View key={label} style={st.infoCell}>
              <Text style={st.label}>{label}</Text>
              <Text style={st.value}>{clean(value)}</Text>
            </View>
          ))}
        </View>
        <View style={st.stats} wrap={false}>
          {[
            [report.areas.length, energy ? "ZONE DI RILIEVO" : "AMBIENTI"],
            [elements.length, "ELEMENTI"],
            [
              report.media.filter(surveyMediaIsImage).length,
              "FOTO / DISEGNI ALLEGATI",
            ],
          ].map(([count, label]) => (
            <View key={label} style={st.stat}>
              <Text style={st.number}>{count}</Text>
              <Text style={st.label}>{label}</Text>
            </View>
          ))}
        </View>
        {elements.length <= coverIndexLimit ? (
          indexContent()
        ) : (
          <Text style={st.neutral}>
            {elements.length} schede organizzate per ambiente. L’indice completo
            è nella pagina seguente, con collegamenti alle schede tecniche.
          </Text>
        )}
        <Text style={st.notice}>
          Rilievo tecnico, non ordine di produzione. Le quote descrivono i dati
          registrati; tolleranze, posa e misure finite richiedono una verifica
          dedicata. Gli schemi illustrativi sono dichiarati non in scala; le
          viste proporzionali non sono disegni esecutivi.
        </Text>
        {(report.missingFields > 0 || report.missingPhotos > 0) && (
          <Text style={st.notice}>
            Da completare: {report.missingFields} campi obbligatori e{" "}
            {report.missingPhotos} foto richieste. Lo stato amministrativo non
            certifica la completezza tecnica.
          </Text>
        )}
        {identity?.logoUrl && !images.logo && (
          <Text style={st.caption}>
            Logo aziendale non disponibile in questa copia.
          </Text>
        )}
        <Text style={st.caption}>
          Dati aggiornati al {dateSurvey(surveyLastUpdated(detail), true)}. Nessun
          documento inviato o nuovo atto di firma creato.
        </Text>
        {footer()}
      </Page>
      {elements.length > coverIndexLimit && (
        <Page size="A4" style={st.page}>
          <View style={st.sheetHead}>
            <Text style={st.eyebrow}>INDICE DEL SOPRALLUOGO</Text>
            <Text style={st.sheetTitle}>Schede per ambiente</Text>
            <Text style={st.caption}>{clean(survey.code)}</Text>
          </View>
          {indexContent(false)}
          {footer()}
        </Page>
      )}
      {(!report.media.length ||
        report.header.some((s) => s.fields.length) ||
        report.areas.some(
          (a) => a.fields.length || a.notes || a.audio_transcription,
        )) && (
        <Page size="A4" style={st.page}>
          <View style={st.sheetHead}>
            <Text style={st.eyebrow}>CONTESTO DEL RILIEVO</Text>
            <Text style={st.sheetTitle}>Dati generali e ambienti</Text>
            <Text style={st.caption}>
              {clean(survey.code)} - {clean(companyName)}
            </Text>
          </View>
          {report.header.map((s) => (
            <Fields key={s.key} title={s.label} fields={s.fields} />
          ))}
          {report.areas.some(
            (a) => !a.fields.length && !a.notes && !a.audio_transcription,
          ) && (
            <Text style={st.note}>
              Ambienti:{" "}
              {report.areas
                .filter(
                  (a) => !a.fields.length && !a.notes && !a.audio_transcription,
                )
                .map((a) => clean(a.name))
                .join("; ")}
              .
            </Text>
          )}
          {report.areas
            .filter((a) => a.fields.length || a.notes || a.audio_transcription)
            .map((a) => (
              <View key={a.id}>
                <Text style={st.section} minPresenceAhead={45}>
                  {clean(a.name)}
                </Text>
                <Fields title="Dati dell’ambiente" fields={a.fields} />
                {a.notes && <Text style={st.note}>{clean(a.notes)}</Text>}
                {a.audio_transcription && (
                  <Text style={st.note}>
                    Nota vocale: {clean(a.audio_transcription)}
                  </Text>
                )}
              </View>
            ))}
          {!report.media.length && closingNotes()}
          {footer()}
        </Page>
      )}
      {elements.map((e, i) => {
        const type = detail.template.schema.element_types.find(
          (t) => t.key === e.element_type,
        );
        const drawings = type
          ? WINDOW_COMPONENTS.filter(
              ([component]) =>
                component === "primary" ||
                (type.key === "infisso" &&
                  Array.isArray(e.values.complementi) &&
                  e.values.complementi.includes(component)),
            ).flatMap(([component]) => {
              const projected = windowComponentData(
                type,
                windowDisplayValues(type, e.values, survey.header_data),
                component,
              );
              const drawing = windowSurveyDrawing(
                projected.type,
                projected.values,
              );
              return drawing ? [drawing] : [];
            })
          : [];
        const shownChecks = new Set([
          ...drawings.flatMap((drawing) => [
            ...drawing.warnings,
            ...(windowAbacoHasDetails(e.values)
              ? (drawing.abaco?.checks ?? [])
              : []),
            ...(drawing.installation?.warnings ?? []),
            ...(drawing.system?.checks ?? []),
          ]),
        ]);
        const shownMeasures = new Set(
          drawings.flatMap((drawing) => {
            const i = drawing.installation;
            const installationKeys =
              i &&
              (i.measurements.some((m) => m.value != null) || i.warnings.length)
                ? [
                    ...i.measurements.map((m) => m.key),
                    ...i.sketches.flatMap((s) => s.keys),
                  ]
                : [];
            return [
              ...installationKeys,
              ...(drawing.system?.measurements.map((m) => m.key) ?? []),
            ];
          }),
        );
        return (
          <Page key={e.id} size="A4" style={st.page}>
            <Text
              fixed
              style={{
                position: "absolute",
                top: 17,
                left: 36,
                right: 36,
                fontSize: 7,
                color: muted,
              }}
            >
              SCHEDA {String(i + 1).padStart(2, "0")} ·{" "}
              {clean(areaFor(e.area_id))} · {clean(e.title).slice(0, 105)}
            </Text>
            <View style={st.sheetHead} id={`survey-element-${e.id}`}>
              <Text style={st.eyebrow}>
                SCHEDA {String(i + 1).padStart(2, "0")} /{" "}
                {clean(areaFor(e.area_id))}
              </Text>
              <Text style={st.sheetTitle}>{clean(e.title)}</Text>
              <Text style={st.caption}>
                Quantità {quantityLabel(e)} - {clean(survey.code)} - {type && isEnergySurvey(type) ? "unità indicate nelle singole viste" : "quote del disegno in mm"}
              </Text>
            </View>
            {e.notes && type && isWindowSurvey(type) ? (
              <Text style={[st.caption, { marginBottom: 6 }]}>
                Note: {clean(e.notes)}
              </Text>
            ) : e.notes ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={st.subheading} minPresenceAhead={25}>
                  Note sull’elemento
                </Text>
                <Text style={st.caption}>{clean(e.notes)}</Text>
              </View>
            ) : null}
            {type && isEnergySurvey(type) && <EnergySurveyPdf type={type} values={e.values}/>}
            {type && isWindowSurvey(type) && (
              <WindowSurveyPdf
                type={type}
                values={e.values}
                headerValues={survey.header_data}
                compact
              />
            )}
            {e.sections
              .filter((s) => s.key !== "rv_summary" && s.key !== "en_checks")
              .map((s) => (
                <Fields
                  key={s.key}
                  title={s.label}
                  fields={s.fields.filter((f) => !shownMeasures.has(f.key))}
                  compact={!!type && (isWindowSurvey(type) || isEnergySurvey(type))}
                />
              ))}
            {e.sections
              .filter((s) => s.key === "rv_summary")
              .flatMap((s) =>
                s.fields
                  .filter(
                    (f) =>
                      !shownChecks.has(f.value) &&
                      !(
                        drawings.length &&
                        f.value.startsWith("Misure d’ordine non verificate:")
                      ),
                  )
                  .map((f) => (
                    <Text key={f.key} style={st.caption}>
                      {clean(f.label)}: {clean(f.value)}
                    </Text>
                  )),
              )}
            {e.audio_transcription && (
              <Text style={st.note}>
                Nota vocale: {clean(e.audio_transcription)}
              </Text>
            )}
            {footer()}
          </Page>
        );
      })}
      {report.media.length > 0 && (
        <Page size="A4" style={st.page}>
          <View style={st.sheetHead}>
            <Text style={st.eyebrow}>ANNOTAZIONI E DOCUMENTI</Text>
            <Text style={st.sheetTitle}>Note, allegati e firma</Text>
            <Text style={st.caption}>{clean(survey.code)}</Text>
          </View>
          {closingNotes()}
          {footer()}
        </Page>
      )}
    </Document>
  );
}
