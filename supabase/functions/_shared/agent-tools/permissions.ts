/**
 * MP-AIE-01 — Permissions / RBAC filtering
 *
 * Filtra tool disponibili in base a (userRole, personaKey).
 * Pattern: tool dichiara whitelist; '*' significa "tutti".
 */

import type { GrantContext, ToolDefinition } from "./types.ts";

export function isToolAllowed(tool: ToolDefinition, ctx: GrantContext): boolean {
  // Role check
  if (!tool.allowedRoles.includes(ctx.userRole) && !tool.allowedRoles.includes("*")) {
    return false;
  }
  // Persona check (solo se ctx.personaKey valorizzato)
  if (ctx.personaKey) {
    if (!tool.allowedPersonas.includes(ctx.personaKey) && !tool.allowedPersonas.includes("*")) {
      return false;
    }
  }
  return true;
}

export function filterToolsByGrants(
  tools: ToolDefinition[],
  ctx: GrantContext,
): ToolDefinition[] {
  return tools.filter((t) => isToolAllowed(t, ctx));
}
