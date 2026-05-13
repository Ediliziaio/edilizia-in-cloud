/**
 * htmlToPdf — converte HTML formattato (output di RichTextEditor) in nodi
 * @react-pdf/renderer (`<Text>`, `<View>`).
 *
 * Supporta i tag generati da TipTap:
 *  - <p>, <br>: paragrafi (View con marginBottom)
 *  - <strong>/<b>: bold
 *  - <em>/<i>: italic
 *  - <u>: underline
 *  - <s>/<strike>: line-through
 *  - <h1>/<h2>/<h3>: heading sizes
 *  - <ul>/<ol>/<li>: liste (bullet "• " / numero)
 *  - <a href="">: link (sottolineato + colore)
 *  - <span style="font-size: 12pt; font-family: ...; color: #...">: inline style
 *  - <div style="text-align: center">: alignment
 *
 * Sicurezza: l'HTML deve essere già sanitizzato (vedi RichTextEditor → DOMPurify).
 * Questo helper non sanitizza ulteriormente — assume input fidato.
 *
 * Performance: il parser usa DOMParser browser-side. Per react-pdf in Node SSR
 * non funzionerebbe — ma react-pdf nei serramenti viene generato client-side
 * (vedi useSerramentoPDF.ts), quindi DOMParser è disponibile.
 */
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

/** Stile base ereditato dal contesto. */
export interface BaseStyle {
  fontSize?: number;       // pt
  fontFamily?: string;
  color?: string;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
}

const DEFAULT_BASE: Required<BaseStyle> = {
  fontSize: 10,
  fontFamily: "Helvetica",
  color: "#374151",
  lineHeight: 1.5,
  textAlign: "left",
};

/** Converte "14pt" / "14px" / "14" → 14 (pt). */
function parseSize(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  // px → pt: 1px ≈ 0.75pt
  if (value.includes("px")) return n * 0.75;
  return n;
}

/** Mappa font-family CSS → famiglia react-pdf valida (Helvetica / Times / Courier). */
function mapFontFamily(css: string | null | undefined): string | null {
  if (!css) return null;
  const lower = css.toLowerCase();
  if (lower.includes("serif") && !lower.includes("sans")) return "Times-Roman";
  if (lower.includes("mono") || lower.includes("courier")) return "Courier";
  return "Helvetica";
}

/** Parsea l'attributo style="" CSS in oggetto chiave-valore. */
function parseStyleAttr(s: string | null | undefined): Record<string, string> {
  if (!s) return {};
  const out: Record<string, string> = {};
  s.split(";").forEach((decl) => {
    const [k, v] = decl.split(":");
    if (k && v) out[k.trim().toLowerCase()] = v.trim();
  });
  return out;
}

interface Mark {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

/** Combina mark inherited + nuova mark dal nodo corrente. */
function mergeMark(parent: Mark, css: Record<string, string>, tag: string): Mark {
  const m: Mark = { ...parent };
  if (tag === "b" || tag === "strong") m.bold = true;
  if (tag === "i" || tag === "em") m.italic = true;
  if (tag === "u") m.underline = true;
  if (tag === "s" || tag === "strike") m.strike = true;
  const sz = parseSize(css["font-size"]);
  if (sz != null) m.fontSize = sz;
  const ff = mapFontFamily(css["font-family"]);
  if (ff) m.fontFamily = ff;
  if (css["color"]) m.color = css["color"];
  if (css["font-weight"] && /^(700|800|900|bold)$/i.test(css["font-weight"])) m.bold = true;
  if (css["font-style"] === "italic") m.italic = true;
  if (css["text-decoration"]?.includes("underline")) m.underline = true;
  if (css["text-decoration"]?.includes("line-through")) m.strike = true;
  return m;
}

/** Stile react-pdf da Mark. */
function markToStyle(m: Mark, base: BaseStyle): Style {
  const s: Style = {};
  if (m.bold) s.fontWeight = "bold";
  if (m.italic) s.fontStyle = "italic";
  const decorations: string[] = [];
  if (m.underline) decorations.push("underline");
  if (m.strike) decorations.push("line-through");
  if (decorations.length > 0) s.textDecoration = decorations.join(" ") as Style["textDecoration"];
  if (m.fontSize) s.fontSize = m.fontSize;
  if (m.fontFamily) s.fontFamily = m.fontFamily;
  if (m.color) s.color = m.color;
  else if (base.color) s.color = base.color;
  if (m.link) s.color = "#f97316"; // override per link
  return s;
}

/**
 * Renderizza HTML (già sanitizzato) come array di nodi react-pdf.
 *
 * Output: un singolo <View> con paragrafi/liste/heading dentro.
 */
export function htmlToPdfNodes(
  html: string | null | undefined,
  baseStyle: BaseStyle = {},
): React.ReactElement {
  const base = { ...DEFAULT_BASE, ...baseStyle };

  if (!html || !html.trim()) {
    return <View />;
  }

  // Browser-only parser. Se non disponibile (SSR/Node senza DOM), fallback al testo plain.
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return (
      <Text style={{
        fontSize: base.fontSize, fontFamily: base.fontFamily,
        color: base.color, lineHeight: base.lineHeight, textAlign: base.textAlign,
      }}>
        {html.replace(/<[^>]+>/g, "")}
      </Text>
    );
  }

  const doc = new DOMParser().parseFromString(`<root>${html}</root>`, "text/html");
  const root = doc.body.firstChild as Element | null;
  if (!root) return <View />;

  const blocks: React.ReactElement[] = [];
  let listCounter: { ordered: boolean; idx: number } | null = null;

  const renderBlock = (el: Element, isListItem = false): React.ReactElement | null => {
    const tag = el.tagName.toLowerCase();
    const css = parseStyleAttr(el.getAttribute("style"));
    const align = (css["text-align"] as BaseStyle["textAlign"]) || base.textAlign;

    // Headings con fontSize calcolato (h1 1.5x, h2 1.3x, h3 1.15x)
    let headingSize: number | undefined;
    if (tag === "h1") headingSize = Math.round(base.fontSize * 1.7);
    else if (tag === "h2") headingSize = Math.round(base.fontSize * 1.4);
    else if (tag === "h3") headingSize = Math.round(base.fontSize * 1.2);
    const isHeading = headingSize != null;

    const inlineChildren = renderInline(el, {
      ...(isHeading ? { bold: true, fontSize: headingSize } : {}),
    });

    return (
      <View
        style={{
          marginBottom: isHeading ? 4 : (isListItem ? 0 : 3),
          marginTop: isHeading ? 4 : 0,
        }}
      >
        <Text style={{
          fontSize: headingSize ?? base.fontSize,
          fontFamily: base.fontFamily,
          color: base.color,
          lineHeight: base.lineHeight,
          textAlign: align,
        }}>
          {inlineChildren}
        </Text>
      </View>
    );
  };

  const renderInline = (node: Node, parentMark: Mark = {}): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    node.childNodes.forEach((child, i) => {
      if (child.nodeType === 3 /* text */) {
        const text = child.nodeValue ?? "";
        if (!text) return;
        out.push(
          <Text key={i} style={markToStyle(parentMark, base)}>{text}</Text>
        );
        return;
      }
      if (child.nodeType !== 1 /* element */) return;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === "br") { out.push(<Text key={i}>{"\n"}</Text>); return; }
      if (tag === "a") {
        const href = el.getAttribute("href") ?? "";
        const innerMark = mergeMark(parentMark, parseStyleAttr(el.getAttribute("style")), tag);
        innerMark.link = href;
        const inner = renderInline(el, innerMark);
        out.push(<Text key={i}>{inner}</Text>);
        return;
      }
      // marks inline (b, i, u, s, span, em, strong)
      const css = parseStyleAttr(el.getAttribute("style"));
      const innerMark = mergeMark(parentMark, css, tag);
      const inner = renderInline(el, innerMark);
      out.push(<Text key={i}>{inner}</Text>);
    });
    return out;
  };

  const walk = (parent: Element) => {
    Array.from(parent.children).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        listCounter = { ordered: tag === "ol", idx: 0 };
        Array.from(el.children).forEach((li) => {
          if (li.tagName.toLowerCase() !== "li") return;
          listCounter!.idx++;
          const bullet = listCounter!.ordered ? `${listCounter!.idx}. ` : "•  ";
          const align = (parseStyleAttr(li.getAttribute("style"))["text-align"] as BaseStyle["textAlign"]) || base.textAlign;
          blocks.push(
            <View key={`li-${blocks.length}`} style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={{
                fontSize: base.fontSize, fontFamily: base.fontFamily, color: base.color,
                lineHeight: base.lineHeight, width: 14,
              }}>
                {bullet}
              </Text>
              <Text style={{
                fontSize: base.fontSize, fontFamily: base.fontFamily, color: base.color,
                lineHeight: base.lineHeight, textAlign: align, flex: 1,
              }}>
                {renderInline(li)}
              </Text>
            </View>
          );
        });
        listCounter = null;
      } else if (["p", "h1", "h2", "h3", "div"].includes(tag)) {
        const block = renderBlock(el);
        if (block) blocks.push(block);
      }
    });
  };

  walk(root);

  if (blocks.length === 0) {
    // Fallback: solo testo inline senza wrapping block
    return <Text style={{
      fontSize: base.fontSize, fontFamily: base.fontFamily,
      color: base.color, lineHeight: base.lineHeight, textAlign: base.textAlign,
    }}>{renderInline(root)}</Text>;
  }

  return <View>{blocks}</View>;
}

/** Variante con key prop per liste di blocchi. */
export function htmlToPdfNodesKeyed(
  html: string | null | undefined,
  baseStyle: BaseStyle = {},
  key: string,
): React.ReactElement {
  const el = htmlToPdfNodes(html, baseStyle);
  return <View key={key}>{el}</View>;
}
