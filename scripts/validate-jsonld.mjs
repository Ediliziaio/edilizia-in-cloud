/** Validate the actual HTML artifact, not just the objects before serialization.
 * Search Console's 20/10/2026 Cassa Edile snapshot contained a HowTo script
 * ending in the middle of a string. Such an artifact must fail prerender.
 */
export function validateJsonLd(html) {
  const errors = [];
  const scripts = /<script\b([^>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi;
  let match;
  let index = 0;
  while ((match = scripts.exec(html))) {
    if (!/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json(?=\s|$))/i.test(match[1])) continue;
    index++;
    const id = match[1].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    const label = `JSON-LD ${id ? `#${id}` : index}`;
    if (!/<\/script\s*>$/i.test(match[0])) {
      errors.push(`${label}: missing closing script tag`);
      continue;
    }
    try {
      const data = JSON.parse(match[2]);
      if (data === null || typeof data !== "object") {
        errors.push(`${label}: expected an object or array, found ${data === null ? "null" : typeof data}`);
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  return errors;
}
