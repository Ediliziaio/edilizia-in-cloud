/** Every browser read uses the server projection, including embeds and exports.
 * Mutations retain the original tables and their write policies. */
export function protectedBankUrl(input: string, method = "GET"): string {
  if (!["GET", "HEAD"].includes(method.toUpperCase()) || !input.includes("/rest/v1/") || input.includes("/rest/v1/rpc/")) return input;
  const url = new URL(input);
  const relation = url.pathname.split("/rest/v1/")[1];
  if (["bank_accounts", "bank_transactions"].includes(relation)) url.pathname = `/rest/v1/${relation}_operativi`;
  const select = url.searchParams.get("select");
  if (select) url.searchParams.set("select", select.replace(/(^|[,(])(?:(\w+):)?(bank_accounts|bank_transactions)((?:![\w]+)*)\(/g,
    (_match, before: string, alias: string | undefined, table: string, hints: string) => `${before}${alias ?? table}:${table}_operativi${hints}(`));
  return url.toString();
}
