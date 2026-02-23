export type BlockType = "text" | "image" | "button" | "divider" | "spacer" | "html" | "columns";

export type ColumnLayout = "1" | "1/2-1/2" | "1/3-1/3-1/3" | "1/3-2/3" | "2/3-1/3";

export interface TextProps {
  content: string;
  fontSize: string;
  color: string;
  textAlign: "left" | "center" | "right";
  fontFamily: string;
  fontWeight: "normal" | "bold";
}

export interface ImageProps {
  src: string;
  alt: string;
  width: string;
  align: "left" | "center" | "right";
}

export interface ButtonProps {
  text: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  align: "left" | "center" | "right";
}

export interface DividerProps {
  thickness: string;
  color: string;
  margin: string;
}

export interface SpacerProps {
  height: string;
}

export interface HtmlProps {
  code: string;
}

export interface ColumnsProps {
  layout: ColumnLayout;
  gap: string;
}

export type BlockProps = TextProps | ImageProps | ButtonProps | DividerProps | SpacerProps | HtmlProps | ColumnsProps;

export interface BuilderBlock {
  id: string;
  type: BlockType;
  props: BlockProps;
  children?: BuilderBlock[][]; // For columns: array of columns, each column is array of blocks
}

export const DEFAULT_PROPS: Record<BlockType, BlockProps> = {
  text: {
    content: "Scrivi il tuo testo qui...",
    fontSize: "16px",
    color: "#333333",
    textAlign: "left",
    fontFamily: "Arial",
    fontWeight: "normal",
  } as TextProps,
  image: {
    src: "",
    alt: "",
    width: "100%",
    align: "center",
  } as ImageProps,
  button: {
    text: "Clicca qui",
    url: "#",
    backgroundColor: "#3B82F6",
    textColor: "#FFFFFF",
    borderRadius: "4px",
    align: "center",
  } as ButtonProps,
  divider: {
    thickness: "1px",
    color: "#E5E7EB",
    margin: "16px",
  } as DividerProps,
  spacer: {
    height: "32px",
  } as SpacerProps,
  html: {
    code: "<p>HTML personalizzato</p>",
  } as HtmlProps,
  columns: {
    layout: "1/2-1/2",
    gap: "16px",
  } as ColumnsProps,
};

export function createBlock(type: BlockType): BuilderBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const block: BuilderBlock = {
    id,
    type,
    props: { ...DEFAULT_PROPS[type] },
  };
  if (type === "columns") {
    const layout = (block.props as ColumnsProps).layout;
    const colCount = layout === "1" ? 1 : layout.split("-").length;
    block.children = Array.from({ length: colCount }, (): BuilderBlock[] => []);
  }
  return block;
}

export function getColumnWidths(layout: ColumnLayout): string[] {
  switch (layout) {
    case "1": return ["100%"];
    case "1/2-1/2": return ["50%", "50%"];
    case "1/3-1/3-1/3": return ["33.33%", "33.33%", "33.33%"];
    case "1/3-2/3": return ["33.33%", "66.67%"];
    case "2/3-1/3": return ["66.67%", "33.33%"];
    default: return ["100%"];
  }
}
