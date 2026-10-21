/** Safe both in a DOM script.textContent and in prerendered HTML.
 * JSON escaping preserves the original text without letting </script>
 * terminate a structured-data script when HTML is parsed again.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
