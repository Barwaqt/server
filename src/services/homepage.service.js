import { db, transaction } from "../config/database.js";
import { assert } from "../utils/error.js";
export async function get() {
  const row = await db.storefrontPage.findUnique({
    where: { key: "homepage" },
  });
  assert(
    row,
    503,
    "Homepage content is unavailable; apply database migrations",
  );
  return {
    content: row.content,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}
export async function publish(user, input) {
  return transaction(async (tx) => {
    const categories = new Set(),
      products = new Set();
    function visit(v) {
      if (Array.isArray(v)) return v.forEach(visit);
      if (v && typeof v === "object") {
        if (v.categorySlug && v.categorySlug !== "all-products")
          categories.add(v.categorySlug);
        if (v.productIds) v.productIds.forEach((id) => products.add(id));
        Object.values(v).forEach(visit);
      }
    }
    visit(input.content);
    assert(
      (await tx.category.count({
        where: { slug: { in: [...categories] } },
      })) === categories.size,
      422,
      "A selected homepage category no longer exists",
    );
    assert(
      (await tx.product.count({
        where: {
          id: { in: [...products] },
          active: true,
          vendor: { status: "APPROVED" },
        },
      })) === products.size,
      422,
      "Featured products must be published by approved vendors",
    );
    const result = await tx.storefrontPage.updateMany({
      where: { key: "homepage", version: input.version },
      data: { content: input.content, version: { increment: 1 } },
    });
    assert(
      result.count,
      409,
      "The homepage was changed by another administrator. Reload the latest version before publishing.",
    );
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "HOMEPAGE_PUBLISHED",
        entityId: "homepage",
        metadata: { version: input.version + 1 },
      },
    });
    const row = await tx.storefrontPage.findUnique({
      where: { key: "homepage" },
    });
    return {
      content: row.content,
      version: row.version,
      updatedAt: row.updatedAt,
    };
  });
}
