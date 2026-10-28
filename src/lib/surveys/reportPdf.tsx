import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";
import type { SurveyDetail } from "@/lib/api/surveys";
import {
  buildSurveyReport,
  dateSurvey,
  surveyLastUpdated,
  SURVEY_STATUS,
  surveyMediaIsImage,
  surveyMediaUrl,
  type ReportField,
  type SurveyReferences,
  surveyAddress,
  surveyOfficeReviewText,
} from "./report";
import { ensurePdfBufferCompatibility } from "@/lib/pdf/ensurePdfBufferCompatibility";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import { WindowSurveyPdf } from "./windowSurveyPdf";
import { isWindowSurvey } from "./windowSurvey";
import { isEnergySurvey } from "./energySurvey";
import type { SurveyPdfBrand } from "./pdfBrand";
import { SurveyTechnicalPdf } from "./technicalPdf";

ensurePdfBufferCompatibility();
Font.registerHyphenationCallback((word) => [word]);
// The built-in PDF font cannot render template emoji or typographic arrows.
const clean = (value: string) =>
  value
    .replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF]/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/[\u2011-\u2015]/g, "-")
    .replace(/→/g, "> ");
// Keep a short area introduction with its heading, without making long notes unbreakable.
const areaNoteLead = (note: string) => {
  if (note.length <= 240) return note;
  const boundary = note.lastIndexOf(" ", 240);
  return note.slice(0, boundary > 0 ? boundary + 1 : 240);
};
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#17243a",
    padding: 38,
    paddingBottom: 55,
  },
  title: {
    fontSize: 23,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  code: { fontSize: 10, color: "#c2410c", marginBottom: 15 },
  meta: {
    backgroundColor: "#eff5ff",
    padding: 12,
    borderRadius: 7,
    marginBottom: 16,
  },
  section: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1d3e6a",
    marginTop: 16,
    marginBottom: 8,
  },
  area: {
    backgroundColor: "#f1f5f9",
    padding: 9,
    marginTop: 12,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  element: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  key: { width: "43%", paddingRight: 12, color: "#52627a" },
  value: { width: "57%" },
  note: { marginTop: 7, color: "#52627a" },
  warning: {
    backgroundColor: "#fff7ed",
    color: "#9a3412",
    padding: 10,
    marginBottom: 10,
  },
  photo: { width: "100%", height: 230, objectFit: "contain", marginTop: 8 },
  caption: { fontSize: 9, color: "#52627a", marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 38,
    right: 38,
    height: 14,
    fontSize: 8,
    color: "#64748b",
  },
});
const Fields = ({
  fields,
  heading,
}: {
  fields: ReportField[];
  heading?: React.ReactNode;
}) => (
  <>
    {!fields.length && heading}
    {fields.map((f, index) => (
      <View key={f.key} wrap={f.value.length > 500}>
        {index === 0 && heading}
        <View style={styles.row}>
          <Text style={styles.key}>
            {clean(f.label)}
            {f.required ? " *" : ""}
          </Text>
          <Text style={styles.value}>{clean(f.value)}</Text>
        </View>
      </View>
    ))}
  </>
);
export function SurveyReportPdf({
  detail,
  companyName,
  images = {},
  references,
  brand,
}: {
  detail: SurveyDetail;
  companyName: string;
  images?: Record<string, string | null>;
  references?: SurveyReferences;
  brand?: SurveyPdfBrand;
}) {
  if (detail.template.schema.element_types.some(t => isWindowSurvey(t) || isEnergySurvey(t)))
    return (
      <SurveyTechnicalPdf
        detail={detail}
        companyName={companyName}
        images={images}
        references={references}
        brand={brand}
      />
    );
  const report = buildSurveyReport(detail),
    { survey } = report;
  const element = (e: (typeof report.unassigned)[number]) => (
    <View key={e.id}>
      {(() => {
        const type = detail.template.schema.element_types.find(
          (t) => t.key === e.element_type,
        );
        const title = `${clean(e.title)} - Quantità: ${e.quantity ?? "Non indicata"}`;
        return type && isWindowSurvey(type) ? (
          <WindowSurveyPdf
            type={type}
            values={e.values}
            headerValues={survey.header_data}
            heading={title}
          />
        ) : (
          <Text style={styles.element} minPresenceAhead={45}>
            {title}
          </Text>
        );
      })()}
      {e.sections.map((s) => (
        <View key={s.key}>
          <Fields
            fields={s.fields}
            heading={<Text style={styles.caption}>{clean(s.label)}</Text>}
          />
        </View>
      ))}
      {e.notes && <Text style={styles.note}>{clean(e.notes)}</Text>}
      {e.audio_transcription && (
        <Text style={styles.note}>
          Nota vocale: {clean(e.audio_transcription)}
        </Text>
      )}
    </View>
  );
  return (
    <Document
      title={`Sopralluogo ${survey.code}`}
      author={companyName}
      subject="Report dei dati salvati del sopralluogo"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Rilievo e sopralluogo</Text>
        <Text style={styles.code}>
          {clean(survey.code)} - {SURVEY_STATUS[survey.status] ?? survey.status}
        </Text>
        <View style={styles.meta}>
          <Text>{clean(companyName)}</Text>
          <Text>{clean(detail.template.name)}</Text>
          <Text>{clean(surveyAddress(survey))}</Text>
          {references?.reference && <Text>{clean(references.reference)}</Text>}
          {references && (
            <Text>
              Incaricati:{" "}
              {clean(
                references.assignees.join(", ") ||
                  "nessuna assegnazione registrata",
              )}
            </Text>
          )}
          <Text>Programmato: {dateSurvey(survey.scheduled_at, true)}</Text>
          <Text>
            Ultimo aggiornamento: {dateSurvey(surveyLastUpdated(detail), true)}
          </Text>
          <Text>
            {report.areas.length} aree - {detail.elements.length} elementi -{" "}
            {report.media.length} allegati
          </Text>
        </View>
        {(report.missingFields > 0 || report.missingPhotos > 0) && (
          <Text style={styles.warning}>
            Dati da verificare: {report.missingFields} campi obbligatori non
            compilati, {report.missingPhotos} foto richieste mancanti. Lo stato
            del sopralluogo non certifica da solo misure o documenti.
          </Text>
        )}
        {report.header.map((s) => (
          <View key={s.key}>
            <Fields
              fields={s.fields}
              heading={<Text style={styles.section}>{clean(s.label)}</Text>}
            />
          </View>
        ))}
        {report.areas.map((a) => (
          <View key={a.id}>
            {a.fields.length ? (
              <Fields
                fields={a.fields}
                heading={<Text style={styles.area}>{clean(a.name)}</Text>}
              />
            ) : (
              <View wrap={false}>
                <Text style={styles.area}>{clean(a.name)}</Text>
                {a.notes && (
                  <Text style={styles.note}>
                    {clean(areaNoteLead(a.notes))}
                  </Text>
                )}
              </View>
            )}
            {a.notes && (a.fields.length > 0 || a.notes.length > 240) && (
              <Text style={styles.note}>
                {clean(
                  a.fields.length
                    ? a.notes
                    : a.notes.slice(areaNoteLead(a.notes).length),
                )}
              </Text>
            )}
            {a.audio_transcription && (
              <Text style={styles.note}>
                Nota vocale: {clean(a.audio_transcription)}
              </Text>
            )}
            {a.elements.map(element)}
          </View>
        ))}
        {report.unassigned.length > 0 && (
          <View>
            <Text style={styles.section}>Elementi senza area riconosciuta</Text>
            {report.unassigned.map(element)}
          </View>
        )}
        {surveyOfficeReviewText(survey) && <View><Text style={styles.section} minPresenceAhead={40}>Ultimo riscontro dell’ufficio</Text><Text>{clean(surveyOfficeReviewText(survey)!)}</Text></View>}
        <Text style={styles.section} minPresenceAhead={40}>
          Note generali
        </Text>
        <Text>{clean(survey.notes || "Nessuna nota registrata.")}</Text>
        {survey.general_audio_transcription && (
          <Text style={styles.note}>
            Trascrizione: {clean(survey.general_audio_transcription)}
          </Text>
        )}
        <Text style={styles.section} minPresenceAhead={45}>
          Foto e allegati
        </Text>
        {!report.media.length && <Text>Nessun allegato registrato.</Text>}
        {report.media.map((m) => (
          <View key={m.id} style={{ marginBottom: 12 }}>
            <Text style={styles.element} minPresenceAhead={45}>
              {clean(m.filename || m.checklist_label || m.type)}
            </Text>
            <Text style={styles.caption}>
              {clean(
                report.areas.find((a) => a.id === m.area_id)?.name ||
                  "Sopralluogo",
              )}
              {m.element_id
                ? ` - ${clean(detail.elements.find((e) => e.id === m.element_id)?.element_label || "Elemento rilevato")}`
                : ""}
            </Text>
            {images[m.id] ? (
              <Image src={images[m.id]!} style={styles.photo} />
            ) : (
              <Text style={styles.caption}>
                {surveyMediaIsImage(m)
                  ? "Immagine non riprodotta nel PDF: consultare l’allegato nell’app."
                  : "Allegato consultabile nell’app."}
              </Text>
            )}
            {m.transcription && (
              <Text style={styles.note}>{clean(m.transcription)}</Text>
            )}
          </View>
        ))}
        <Text style={styles.section} minPresenceAhead={45}>
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
            style={{
              height: 70,
              width: 200,
              objectFit: "contain",
              marginTop: 8,
            }}
          />
        )}
        <Text style={styles.caption}>
          Report dei dati salvati. Non sostituisce un originale sottoscritto o
          una verifica tecnica; nessun nuovo atto di firma viene creato.
        </Text>
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${clean(survey.code)} - ${clean(companyName)} · ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
// eslint-disable-next-line react-refresh/only-export-components -- lazy PDF factory, not a mounted screen
export async function renderSurveyPdf(
  detail: SurveyDetail,
  companyName: string,
  references?: SurveyReferences,
  brand?: SurveyPdfBrand,
): Promise<Blob> {
  const pictures = detail.media
    .filter(surveyMediaIsImage)
    .map((m) => ({ key: m.id, url: surveyMediaUrl(m.url) }));
  if (detail.survey.client_signature_url)
    pictures.push({
      key: "firma",
      url: surveyMediaUrl(detail.survey.client_signature_url),
    });
  const images: Record<string, string | null> = {};
  const safeBrand =
    brand?.companyId === detail.survey.company_id ? brand : undefined;
  if (safeBrand?.logoUrl)
    pictures.push({ key: "logo", url: surveyMediaUrl(safeBrand.logoUrl) });
  // Bound decoding concurrency; unavailable photos remain explicitly listed.
  for (let i = 0; i < pictures.length; i += 4)
    await Promise.all(
      pictures.slice(i, i + 4).map(async (p) => {
        const result = await toDataUrl(p.url, { latoMax: 1400 });
        images[p.key] = /^data:image\/(png|jpe?g);base64,/i.test(result ?? "")
          ? result
          : null;
      }),
    );
  return pdf(
    <SurveyReportPdf
      detail={detail}
      companyName={companyName}
      references={references}
      images={images}
      brand={safeBrand}
    />,
  ).toBlob();
}
