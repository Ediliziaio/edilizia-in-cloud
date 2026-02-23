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

function renderBlockHtml(block: BuilderBlock): string {
  switch (block.type) {
    case "text": {
      const p = block.props as TextProps;
      return `<div style="font-family:${p.fontFamily},sans-serif;font-size:${p.fontSize};color:${p.color};text-align:${p.textAlign};font-weight:${p.fontWeight};line-height:1.5;padding:8px 0;">${p.content}</div>`;
    }
    case "image": {
      const p = block.props as ImageProps;
      const alignStyle = p.align === "center" ? "margin:0 auto;display:block;" : p.align === "right" ? "margin-left:auto;display:block;" : "";
      return `<img src="${p.src}" alt="${p.alt}" width="${p.width}" style="max-width:100%;height:auto;${alignStyle}" />`;
    }
    case "button": {
      const p = block.props as ButtonProps;
      const alignStyle = p.align === "center" ? "text-align:center;" : p.align === "right" ? "text-align:right;" : "text-align:left;";
      return `<div style="${alignStyle}padding:8px 0;">
        <a href="${p.url}" target="_blank" style="display:inline-block;background-color:${p.backgroundColor};color:${p.textColor};padding:12px 24px;border-radius:${p.borderRadius};text-decoration:none;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${p.text}</a>
      </div>`;
    }
    case "divider": {
      const p = block.props as DividerProps;
      return `<hr style="border:none;border-top:${p.thickness} solid ${p.color};margin:${p.margin} 0;" />`;
    }
    case "spacer": {
      const p = block.props as SpacerProps;
      return `<div style="height:${p.height};"></div>`;
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
        return `<td style="width:${w};vertical-align:top;padding:0 ${parseInt(p.gap) / 2}px;">${inner || "&nbsp;"}</td>`;
      }).join("");
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>${cols}</tr></table>`;
    }
    default:
      return "";
  }
}

export function generateEmailHtml(blocks: BuilderBlock[]): string {
  const body = blocks.map(renderBlockHtml).join("");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:24px 0;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;">
<tr><td style="padding:24px;">
${body}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
