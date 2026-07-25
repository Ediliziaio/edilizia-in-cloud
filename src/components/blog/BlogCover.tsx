/**
 * Copertina di un articolo del blog, servita in WebP con due larghezze.
 *
 * Le copertine sono JPG 1200x630 da ~154KB l'una. Sulle liste (blog, categoria,
 * articoli correlati) vengono mostrate a 300-500px di larghezza ma il browser
 * scaricava comunque il JPG intero: la sola /blog/ trasferiva 1,1MB di immagini.
 *
 * Qui accanto a ogni `X.jpg` esistono `X.webp` (1200x630, ~51KB) e
 * `X-600.webp` (600x315, ~23KB), generati da public/blog/covers.
 * Il <img> continua a puntare al JPG: resta il fallback per i browser senza
 * WebP e — soprattutto — og:image e JSON-LD continuano a usare il JPG, che i
 * crawler social gestiscono sempre (il WebP no, non ovunque).
 *
 * `display:contents` sul <picture> lo toglie dal layout: il <img> resta figlio
 * diretto del contenitore, quindi i wrapper `relative overflow-hidden` e le
 * classi `group-hover:scale-105` continuano a funzionare come prima.
 */
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
      fetchPriority={fetchPriority}
      decoding="async"
      className={className}
      style={style}
    />
  );

  // Copertine remote (o non JPG locali) non hanno le varianti: niente <picture>.
  const isLocalJpg = src.startsWith("/blog/covers/") && src.endsWith(".jpg");
  if (!isLocalJpg) return img;

  const base = src.slice(0, -4);
  return (
    <picture className="contents">
      <source
        type="image/webp"
        srcSet={`${base}-600.webp 600w, ${base}.webp 1200w`}
        sizes={sizes}
      />
      {img}
    </picture>
  );
}
