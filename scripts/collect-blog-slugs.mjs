/** Both hand-written TypeScript and JSON-style post objects are supported. */
export function collectBlogSlugs(source) {
  return [...new Set([...source.matchAll(/(?:\bslug|["']slug["'])\s*:\s*["']([^"']+)["']/g)].map(match => match[1]))];
}
