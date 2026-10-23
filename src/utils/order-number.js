import { randomInt } from "node:crypto";
import { ApiError } from "./error.js";

const PREFIX = "barwaqt-";
const SPACE = 1000000;
const ATTEMPTS = 40;

// Order and shipment IDs are customer-facing: barwaqt- followed by six digits.
export const orderNumber = () =>
  PREFIX + String(randomInt(0, SPACE)).padStart(6, "0");

// Numbers must stay unique across orders and shipments so one short ID always
// resolves to a single record. `reserved` holds numbers picked in this request.
export async function allocateOrderNumber(tx, reserved = new Set()) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const candidate = orderNumber();
    if (reserved.has(candidate)) continue;
    const [order, shipment] = await Promise.all([
      tx.order.findUnique({ where: { id: candidate }, select: { id: true } }),
      tx.vendorOrder.findUnique({
        where: { id: candidate },
        select: { id: true },
      }),
    ]);
    if (!order && !shipment) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new ApiError(503, "Unable to allocate an order number. Please retry.");
}
