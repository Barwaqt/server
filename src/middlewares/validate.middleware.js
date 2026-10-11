export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const data = schema.parse(req[source]);
    req.input = { ...req.input, [source]: data };
    next();
  };
