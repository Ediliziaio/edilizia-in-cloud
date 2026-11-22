// A deliberately small local-only adapter for the existing domain tools.
// Neither SQL nor table/function names can be supplied through the HTTP API.
const RPC = {
  fish_save_callback: {
    p_company: "uuid",
    p_agent: "uuid",
    p_session: "text",
    p_contact: "uuid",
    p_creator: "uuid",
    p_title: "text",
    p_notes: "text",
    p_due: "date",
    p_priority: "text",
  },
  fish_assistance_start: {
    p_company: "uuid",
    p_agent: "uuid",
    p_session: "text",
  },
  fish_match_customer: { p_company: "uuid", p_phone: "text" },
  fish_assistance_office: {
    p_case: "uuid",
    p_company: "uuid",
    p_reason: "text",
  },
  fish_assistance_identity: {
    p_case: "uuid",
    p_company: "uuid",
    p_customer: "uuid",
    p_revision: "timestamptz",
    p_phone: "text",
  },
  fish_customer_case_memory: {
    p_company: "uuid",
    p_customer: "uuid",
    p_include_trials: "boolean",
  },
  fish_assistance_ticket: {
    p_case: "uuid",
    p_company: "uuid",
    p_phone: "text",
    p_description: "text",
    p_urgent: "boolean",
    p_existing: "uuid",
  },
  fish_assistance_end: {
    p_company: "uuid",
    p_agent: "uuid",
    p_session: "text",
  },
  calendar_booking_slots: {
    p_calendar: "uuid",
    p_date: "date",
    p_exclude: "uuid",
  },
  fish_save_opportunity_outcome: {
    p_company: "uuid",
    p_agent: "uuid",
    p_session: "text",
    p_outcome: "text",
    p_note: "text",
    p_next_action: "text",
    p_confirmed: "boolean",
  },
  reserve_calendar_booking: {
    p_calendar_id: "uuid",
    p_company_id: "uuid",
    p_data: "date",
    p_inizio: "time",
    p_fine: "time",
    p_buffer_prima: "integer",
    p_buffer_dopo: "integer",
    p_durata_min: "integer",
    p_riga: "jsonb",
  },
  fish_reserve_assistance_booking: {
    p_case_id: "uuid",
    p_phone: "text",
    p_calendar_id: "uuid",
    p_company_id: "uuid",
    p_data: "date",
    p_inizio: "time",
    p_fine: "time",
    p_buffer_prima: "integer",
    p_buffer_dopo: "integer",
    p_durata_min: "integer",
    p_riga: "jsonb",
  },
};
const TABLES = [
  "marketing_calendars",
  "marketing_contacts",
  "marketing_contact_activities",
  "appointments",
  "ai_fish_calls",
  "marketing_opportunities",
  "profiles",
  "user_roles",
  "tasks",
];
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Local identifier rejected");
  return '"' + value + '"';
};
const failure = (error) => ({
  data: null,
  error: { code: error.code || "LOCAL_SQL", message: error.message },
});
export function localDbAdapter(db) {
  return {
    async rpc(name, params = {}) {
      try {
        const fields = RPC[name];
        if (!fields || Object.keys(params).some((key) => !fields[key]))
          throw new Error("Local RPC rejected");
        const keys = Object.keys(params);
        const args = keys.map(
          (key, i) => `${identifier(key)} => $${i + 1}::${fields[key]}`,
        );
        const values = keys.map((key) =>
          fields[key] === "jsonb" ? JSON.stringify(params[key]) : params[key],
        );
        return {
          data: (
            await db.query(
              `SELECT public.${identifier(name)}(${args.join(",")}) AS result`,
              values,
            )
          ).rows[0]?.result,
          error: null,
        };
      } catch (error) {
        return failure(error);
      }
    },
    from(table) {
      if (!TABLES.includes(table)) throw new Error("Local table rejected");
      const filters = [],
        values = [];
      let columns = "id",
        max = 100,
        single = false,
        maybe = false,
        insert = null,
        cached;
      const query = {
        select(value) {
          columns = value
            .split(",")
            .map((x) => identifier(x.trim()))
            .join(",");
          return query;
        },
        eq(column, value) {
          values.push(value);
          filters.push(`${identifier(column)} = $${values.length}`);
          return query;
        },
        is(column, value) {
          if (value !== null) throw new Error("Local null filter rejected");
          filters.push(`${identifier(column)} IS NULL`);
          return query;
        },
        in(column, entries) {
          if (!entries.length) {
            filters.push("false");
            return query;
          }
          const args = entries.map((value) => {
            values.push(value);
            return "$" + values.length;
          });
          filters.push(`${identifier(column)} IN (${args.join(",")})`);
          return query;
        },
        ilike(column, value) {
          values.push(value);
          filters.push(`${identifier(column)} ILIKE $${values.length}`);
          return query;
        },
        limit(value) {
          max = Math.min(100, Math.max(0, Number(value) || 0));
          return query;
        },
        insert(row) {
          insert = row;
          return query;
        },
        maybeSingle() {
          maybe = true;
          return query;
        },
        single() {
          single = true;
          return query;
        },
        then(resolve, reject) {
          cached ??= execute();
          return cached.then(resolve, reject);
        },
      };
      async function execute() {
        try {
          let result;
          if (insert) {
            if (!["marketing_contact_activities", "tasks"].includes(table))
              throw new Error("Local insert rejected");
            const keys = Object.keys(insert);
            result = await db.query(
              `INSERT INTO ${identifier(table)} (${keys.map(identifier).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING ${columns}`,
              keys.map((key) =>
                typeof insert[key] === "object"
                  ? JSON.stringify(insert[key])
                  : insert[key],
              ),
            );
          } else
            result = await db.query(
              `SELECT ${columns} FROM ${identifier(table)}${filters.length ? " WHERE " + filters.join(" AND ") : ""} LIMIT ${max}`,
              values,
            );
          if (
            (single && result.rows.length !== 1) ||
            (maybe && result.rows.length > 1)
          )
            return {
              data: null,
              error: {
                code: "LOCAL_ROWS",
                message: "Local row count mismatch",
              },
            };
          return {
            data: single || maybe ? result.rows[0] || null : result.rows,
            error: null,
          };
        } catch (error) {
          return failure(error);
        }
      }
      return query;
    },
  };
}
