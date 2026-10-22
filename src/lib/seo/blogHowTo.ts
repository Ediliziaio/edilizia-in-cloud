import type { BlogPost } from "@/data/blogPosts";

export function buildBlogHowTo(post: BlogPost, imageUrl: string) {
  // Questa guida spiega prestazioni e obblighi: i suoi elenchi non sono
  // istruzioni da eseguire. Article e FAQPage descrivono il contenuto reale.
  if (post.slug === "cassa-edile-come-funziona") return null;
  const isHowTo = /^(come-|sal-|durc-|giornale-|cassa-|computo-|appalti-|bim-|subappalto-|acquisire-|sito-web-|digitalizzazione-|gestione-operai-|sicurezza-|ccnl-|attestazione-|superbonus-|gestione-liquidita-|pnrr-|come-scegliere-|gestione-subappal)/.test(post.slug);
  if (!isHowTo) return null;
  const items = post.content.filter((block) => block.type === "list").flatMap((block) => block.items ?? []);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: post.title,
    description: post.excerpt,
    image: { "@type": "ImageObject", url: imageUrl, width: 1200, height: 630 },
    estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "0" },
    totalTime: `PT${post.readTime}M`,
    step: items.map((text, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: text.split(":")[0].replace(/^\d+\.\s*/, "").trim(),
      text,
    })),
  };
}
