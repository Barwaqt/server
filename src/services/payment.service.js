import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
import { pagination } from "../validators/common.validator.js";
export async function accounts(admin = false) {
  return db.paymentAccount.findMany({
    where: admin ? {} : { active: true },
    orderBy: { method: "asc" },
  });
}
export async function saveAccount(user, input) {
  return transaction(async (tx) => {
    const result = await tx.paymentAccount.upsert({
      where: { method: input.method },
      create: input,
      update: input,
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PLATFORM_PAYMENT_ACCOUNT_UPDATED",
        entityId: result.id,
      },
    });
    return result;
  });
}
export async function createPayment(tx, order, method) {
  if (method === "COD") return;
  const account = await tx.paymentAccount.findUnique({ where: { method } });
  assert(account?.active, 503, "This payment method is not configured");
  const { id, active, updatedAt, ...snapshot } = account;
  await tx.payment.create({
    data: {
      orderId: order.id,
      method,
      amountMinor: order.totalMinor,
      accountSnapshot: snapshot,
    },
  });
}
export async function list(user, q) {
  const where = {
    ...(user.role === "CUSTOMER" ? { order: { customerId: user.id } } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [items, total] = await Promise.all([
    db.payment.findMany({
      where,
      ...pagination(q),
      orderBy: { createdAt: "desc" },
      include: {
        submissions: { orderBy: { createdAt: "desc" } },
        order: {
          select: {
            id: true,
            customerId: true,
            address: true,
            vendorOrders: {
              select: {
                id: true,
                status: true,
                totalMinor: true,
                refunds: true,
              },
            },
          },
        },
      },
    }),
    db.payment.count({ where }),
  ]);
  return { items, total, page: q.page, limit: q.limit };
}
export async function submit(user, orderId, input) {
  return transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { orderId, order: { customerId: user.id } },
      include: {
        order: { include: { vendorOrders: true } },
        submissions: true,
      },
    });
    assert(payment, 404, "Payment not found");
    assert(!payment.verifiedAt, 409, "Payment is already verified");
    const previous = await tx.paymentSubmission.findUnique({
      where: {
        method_reference: {
          method: payment.method,
          reference: input.reference,
        },
      },
    });
    if (previous) {
      assert(
        previous.paymentId === payment.id,
        409,
        "This transaction reference has already been submitted",
      );
      return previous;
    }
    assert(
      !payment.submissions.some((s) => s.status === "SUBMITTED"),
      409,
      "A reference is already awaiting review",
    );
    const result = await tx.paymentSubmission.create({
      data: {
        paymentId: payment.id,
        method: payment.method,
        reference: input.reference,
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "UNDER_REVIEW" },
    });
    return result;
  });
}
export async function review(user, id, input) {
  return transaction(async (tx) => {
    const claim = await tx.paymentSubmission.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            order: { include: { vendorOrders: { include: { vendor: true } } } },
          },
        },
      },
    });
    assert(claim, 404, "Payment submission not found");
    const p = claim.payment;
    if (input.action === "verify" && claim.status === "VERIFIED") return claim;
    assert(
      claim.status === "SUBMITTED" ||
        (input.action === "verify" && claim.status === "REJECTED"),
      409,
      "Submission has already been reviewed",
    );
    assert(!p.verifiedAt, 409, "Payment already verified");
    const result = await tx.paymentSubmission.update({
      where: { id },
      data: {
        status: input.action === "verify" ? "VERIFIED" : "REJECTED",
        note: input.note,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
    if (input.action === "verify") {
      const cancelled = p.order.vendorOrders.some((o) =>
        ["CANCELLED", "RETURNED"].includes(o.status),
      );
      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: cancelled ? "REFUND_DUE" : "PAID",
          verifiedAt: new Date(),
          verifiedBy: user.id,
        },
      });
      await tx.vendorOrder.updateMany({
        where: { orderId: p.orderId },
        data: { cashReceived: true },
      });
      for (const order of p.order.vendorOrders.filter(
        (o) => o.status === "NEW",
      ))
        await tx.notification.create({
          data: {
            userId: order.vendor.ownerId,
            title: "Payment verified",
            body: `Order ${order.id} is ready for acceptance.`,
          },
        });
    } else
      await tx.payment.update({
        where: { id: p.id },
        data: { status: "REJECTED" },
      });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CUSTOMER_PAYMENT_" + result.status,
        entityId: p.id,
        metadata: { submissionId: id, note: input.note },
      },
    });
    await tx.notification.create({
      data: {
        userId: p.order.customerId,
        title: "Payment " + result.status.toLowerCase(),
        body: `Order ${p.orderId}: ${input.note}`,
      },
    });
    return result;
  });
}
export async function syncPayment(tx, orderId) {
  const p = await tx.payment.findUnique({
    where: { orderId },
    include: {
      order: { include: { vendorOrders: { include: { refunds: true } } } },
    },
  });
  if (!p) return;
  const orders = p.order.vendorOrders;
  if (!p.verifiedAt) {
    if (orders.every((o) => o.status === "CANCELLED"))
      await tx.payment.update({
        where: { id: p.id },
        data: { status: "CANCELLED" },
      });
    return;
  }
  const refunded = orders.reduce(
    (n, o) => n + o.refunds.reduce((s, r) => s + r.amountMinor, 0),
    0,
  );
  const due = orders.some(
    (o) =>
      ["CANCELLED", "RETURNED"].includes(o.status) &&
      o.refunds.reduce((s, r) => s + r.amountMinor, 0) < o.totalMinor,
  );
  await tx.payment.update({
    where: { id: p.id },
    data: {
      status:
        refunded >= p.amountMinor ? "REFUNDED" : due ? "REFUND_DUE" : "PAID",
    },
  });
}
