import { ACTION_MAP, TRIGGER_MAP } from "./flow-node-catalog";
import type { FlowTemplate } from "./flow-templates";

const adminTriggers = new Set(["crm", "marketing", "comunicazione", "task", "generale", "piattaforma"]);
const adminActions = new Set(["comunicazione", "crm", "task", "generale", "logica", "piattaforma"]);
export function automationTemplateInScope(template: FlowTemplate, platform: boolean): boolean {
  return template.nodes.every(node => {
    if (node.nodeType !== "trigger" && node.nodeType !== "action") return true;
    const config = node.configJson;
    const id = String(config.action_type ?? config.trigger_type ?? config.item_id ?? config.itemId ?? "");
    const catalog = node.nodeType === "trigger" ? TRIGGER_MAP : ACTION_MAP;
    const item = catalog[id] ?? Object.values(catalog).find(item => "dbEvent" in item && item.dbEvent === id);
    if (!item) return false; // Never offer an unrecognized entry as ready to use.
    return platform ? (node.nodeType === "trigger" ? adminTriggers : adminActions).has(item.categoria) : item.categoria !== "piattaforma";
  });
}
