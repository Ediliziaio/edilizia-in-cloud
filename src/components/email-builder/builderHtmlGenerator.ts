import {
  BuilderBlock,
  TextProps,
  ImageProps,
  ButtonProps,
  DividerProps,
  SpacerProps,
  HtmlProps,
  ColumnsProps,
  getColumnWidths,
} from "./builderTypes";

function normalizeTextContent(content: string): string {
  return content
    .split(/\n/)
    .map((line) => line.trim() ? line : "&nbsp;")
    .join("<br />");
}

function renderBlockHtml(block: BuilderBlock): string {
  switch (block.type) {
    case "text": {
      const p = block.props as TextProps;
      const bg = p.backgroundColor ? `background-color:${p.backgroundColor};` : "";
      const pad = p.backgroundColor ? "padding:16px;" : "padding:10px 0;";
      const italic = p.italic ? "font-style:italic;" : "";
      const underline = p.underline ? "text-decoration:underline;" : "";
      const lh = p.lineHeight || "1.6";
      return `<div style="font-family:${p.fontFamily},Arial,sans-serif;font-size:${p.fontSize};color:${p.color};text-align:${p.textAlign};font-weight:${p.fontWeight};line-height:${lh};${italic}${underline}${bg}${pad}border-radius:${p.backgroundColor ? "8px" : "0"};">${normalizeTextContent(p.content)}</div>`;
    }
    case "image": {
      const p = block.props as ImageProps;
      const alignStyle = p.align === "center" ? "margin:0 auto;display:block;" : p.align === "right" ? "margin-left:auto;display:block;" : "";
      return `<img src="${p.src}" alt="${p.alt}" width="${p.width}" style="max-width:100%;height:auto;${alignStyle}" />`;
    }
    case "button": {
      const p = block.props as ButtonProps;
      const alignStyle = p.align === "center" ? "text-align:center;" : p.align === "right" ? "text-align:right;" : "text-align:left;";
      const py = p.paddingY || "13px";
      const px = p.paddingX || "26px";
      const fs = p.fontSize || "16px";
      const widthStyle = p.fullWidth ? "display:block;width:100%;text-align:center;box-sizing:border-box;" : "display:inline-block;";
      return `<div style="${p.fullWidth ? "" : alignStyle}padding:14px 0;">
        <a href="${p.url}" target="_blank" style="${widthStyle}background-color:${p.backgroundColor};color:${p.textColor};padding:${py} ${px};border-radius:${p.borderRadius};text-decoration:none;font-family:Arial,sans-serif;font-size:${fs};font-weight:bold;line-height:1.2;">${p.text}</a>
      </div>`;
    }
    case "divider": {
      const p = block.props as DividerProps;
      return `<hr style="border:none;border-top:${p.thickness} solid ${p.color};margin:${p.margin} 0;" />`;
    }
    case "spacer": {
      const p = block.props as SpacerProps;
      return `<div style="height:${p.height};line-height:${p.height};font-size:0;">&nbsp;</div>`;
    }
    case "html": {
      const p = block.props as HtmlProps;
      return p.code;
    }
    case "columns": {
      const p = block.props as ColumnsProps;
      const widths = getColumnWidths(p.layout);
      const children = block.children || [];
      const cols = widths.map((w, i) => {
        const colBlocks = children[i] || [];
        const inner = colBlocks.map(renderBlockHtml).join("");
        return `<td style="width:${w};vertical-align:top;padding:0 ${parseInt(p.gap, 10) / 2}px;">${inner || "&nbsp;"}</td>`;
      }).join("");
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>${cols}</tr></table>`;
    }
    default:
      return "";
  }
}

export function generateEmailBodyHtml(blocks: BuilderBlock[]): string {
  return blocks.map(renderBlockHtml).join("");
}

export function generateEmailHtml(blocks: BuilderBlock[]): string {
  const body = generateEmailBodyHtml(blocks);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
<tr><td style="padding:36px;">
${body}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
