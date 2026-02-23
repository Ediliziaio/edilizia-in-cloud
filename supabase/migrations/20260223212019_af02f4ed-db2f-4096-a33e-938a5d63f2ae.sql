-- Performance indices for most queried tables
CREATE INDEX IF NOT EXISTS idx_automation_flows_company_status ON automation_flows(company_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_flows_company_folder ON automation_flows(company_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_automation_nodes_flow ON automation_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_connections_flow ON automation_connections(flow_id);
CREATE INDEX IF NOT EXISTS idx_automation_folders_company_parent ON automation_folders(company_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON orders(company_id, current_status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company ON marketing_contacts(company_id);
