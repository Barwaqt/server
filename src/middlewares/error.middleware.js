import { ZodError } from "zod";
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError)
    return res
      .status(422)
      .json({
        error: {
          message: "Validation failed",
          details: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        requestId: req.id,
      });
  const status =
    error.status ||
    (error.code === "P2002"
      ? 409
      : error.code === "P2025"
        ? 404
        : error.code === "P2034"
          ? 409
          : 500);
  if (status >= 500) req.log?.error({ err: error }, "Request failed");
  res
    .status(status)
    .json({
      error: {
        message:
          status >= 500
            ? "Internal server error"
            : error.code === "P2002"
              ? "Record already exists"
              : error.code === "P2025"
                ? "Record not found"
                : error.code === "P2034"
                  ? "Concurrent change; retry the request"
                  : error.message,
        details: error.details,
      },
      requestId: req.id,
    });
}
