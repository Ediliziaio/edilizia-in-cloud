import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ModuleDocument } from "@/lib/moduli-vendita/moduleDocuments";

// Keep Italian title words intact; exceptionally long pasted tokens may break.
const titleHyphenation = (word: string) =>
  word.length > 28 ? (word.match(/.{1,20}/g) ?? [word]) : [word];

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    padding: 42,
    paddingBottom: 68,
    color: "#172b36",
    fontSize: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1 solid #e2e8ed",
    paddingBottom: 12,
    marginBottom: 28,
    fontSize: 8,
    color: "#647580",
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  title: { fontSize: 30, fontWeight: 700, lineHeight: 1.12, marginBottom: 14 },
  intro: { fontSize: 11, lineHeight: 1.6, color: "#526470", marginBottom: 23 },
  item: {
    borderBottom: "1 solid #e4e9ec",
    paddingBottom: 17,
    marginBottom: 17,
    flexDirection: "row",
    gap: 14,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    paddingTop: 8,
    textAlign: "center",
    color: "#ffffff",
    fontSize: 10,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  body: { fontSize: 10, lineHeight: 1.6, color: "#435762" },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 23,
    borderTop: "1 solid #dde4e8",
    paddingTop: 9,
    fontSize: 7,
    color: "#647580",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

/** A configuration proof, not a customer quote. No fabricated prices or signature link. */
export function ModuleDocumentPDF({
  document: d,
}: {
  document: ModuleDocument;
}) {
  const visible = d.pages.filter((p) => p.visible);
  const denseCover =
    d.title.length +
      d.subtitle.length +
      Object.values(d.company).join("").length >
    650;
  return (
    <Document
      title={`${d.title} - modello dimostrativo`}
      author={d.company.name || "EdiliziaInCloud"}
    >
      <Page
        size="A4"
        style={[s.page, { padding: 0, backgroundColor: "#f8f6f2" }]}
      >
        {d.image ? (
          <Image
            src={d.image}
            style={{
              width: 595,
              height: denseCover ? 200 : 330,
              objectFit: "cover",
            }}
          />
        ) : (
          <View
            style={{ height: denseCover ? 150 : 250, backgroundColor: d.color }}
          />
        )}
        <View style={{ padding: 42, paddingTop: 30 }}>
          <Text style={[s.eyebrow, { color: d.color }]}>
            PROPOSTA DI INTERVENTO
          </Text>
          <Text
            hyphenationCallback={titleHyphenation}
            style={[
              s.title,
              { fontSize: d.title.length > 90 ? 28 : 34, color: d.color },
            ]}
          >
            {d.title}
          </Text>
          <Text style={s.intro}>{d.subtitle}</Text>
          <View
            style={{
              borderLeft: `3 solid ${d.color}`,
              padding: 14,
              backgroundColor: "#ffffff",
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: 700 }}>
              {d.company.name || "La tua azienda"}
            </Text>
            <Text
              style={{
                fontSize: 9,
                marginTop: 6,
                lineHeight: 1.5,
                color: "#647580",
              }}
            >
              {[d.company.address, d.company.email, d.company.phone]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>
        <View style={s.footer} fixed>
          <View style={{ maxWidth: 440 }}>
            <Text>ANTEPRIMA DEL MODELLO · NON È UN PREVENTIVO DA INVIARE</Text>
            {d.image && (
              <Text style={{ marginTop: 5, fontSize: 6 }}>
                {d.imageCaption}
              </Text>
            )}
          </View>
          <Text>01</Text>
        </View>
      </Page>
      {visible.map((p, index) => (
        <Page key={p.id} size="A4" style={s.page}>
          <View style={s.header} fixed>
            <Text>{d.company.name || "La tua azienda"}</Text>
            <Text>MODELLO · {d.areaId.toUpperCase()}</Text>
          </View>
          <Text style={[s.eyebrow, { color: d.color }]}>
            {String(index + 1).padStart(2, "0")} / {d.title}
          </Text>
          <Text style={s.title} hyphenationCallback={titleHyphenation}>
            {p.title}
          </Text>
          <Text style={s.intro}>{p.intro}</Text>
          {p.items.map((item, i) => (
            <View key={i} style={s.item} wrap={false}>
              <Text style={[s.number, { backgroundColor: d.color }]}>
                {i + 1}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{item.title}</Text>
                <Text style={s.body}>{item.text}</Text>
              </View>
            </View>
          ))}
          <View style={s.footer} fixed>
            <Text>
              ANTEPRIMA DEL MODELLO · {d.company.name || "Da personalizzare"}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderModuleDocument(d: ModuleDocument): Promise<string> {
  const { pdf } = await import("@react-pdf/renderer");
  // Local WebP uploads need conversion; bundled JPG assets require no remote storage.
  let image = d.image;
  if (image?.startsWith("data:image/webp")) {
    const { toDataUrl } = await import("@/lib/serramenti/pdfImageUtils");
    image = await toDataUrl(image);
  }
  return URL.createObjectURL(
    await pdf(<ModuleDocumentPDF document={{ ...d, image }} />).toBlob(),
  );
}
