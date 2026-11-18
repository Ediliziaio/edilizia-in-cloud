/** Blog cover: offer only WebP variants present in the published public assets. */
import { prioritaCaricamento } from "@/lib/immagini/prioritaCaricamento";
import availableVariants from "@/data/blog-cover-variants.json";

const webpVariants = new Set(availableVariants);

type BlogCoverProps = {
  /** Path della copertina come sta nei dati: "/blog/covers/slug.jpg". */
  src: string;
  alt: string;
  className?: string;
  /** Larghezza resa, per far scegliere al browser la variante giusta. */
  sizes?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  width?: number;
  height?: number;
  style?: React.CSSProperties;
};

export function BlogCover({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 600px",
  loading = "lazy",
  fetchPriority,
  width = 1200,
  height = 630,
  style,
}: BlogCoverProps) {
  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      {...(fetchPriority ? prioritaCaricamento(fetchPriority) : {})}
      decoding="async"
      className={className}
      style={style}
    />
  );

  // Copertine remote (o non JPG locali) non hanno le varianti: niente <picture>.
  const isLocalJpg = src.startsWith("/blog/covers/") && src.endsWith(".jpg");
  if (!isLocalJpg) return img;

  const base = src.slice(0, -4);
  const srcSet = [[`${base}-600.webp`, 600], [`${base}.webp`, 1200]]
    .filter(([url]) => webpVariants.has(String(url)))
    .map(([url, width]) => `${url} ${width}w`)
    .join(", ");
  if (!srcSet) return img;

  return (
    <picture className="contents">
      <source
        type="image/webp"
        srcSet={srcSet}
        sizes={sizes}
      />
      {img}
    </picture>
  );
}
