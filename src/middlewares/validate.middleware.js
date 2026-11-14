export const validate =
  (schema, source = "body", { partial = false } = {}) =>
  (req, res, next) => {
    const raw = req[source];
    const data = schema.parse(raw);
    // Partial schemas still apply field defaults in Zod, which would overwrite
    // stored values on a PATCH that only sends one field. Keep only the keys
    // the client actually sent.
    if (partial && raw && typeof raw === "object" && !Array.isArray(raw))
      for (const key of Object.keys(data))
        if (!Object.hasOwn(raw, key)) delete data[key];
    req.input = { ...req.input, [source]: data };
    next();
  };
