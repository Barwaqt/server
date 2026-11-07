import { startMarketingWorker } from "./services/marketing.service.js";
import {
  adoptLegacyImages,
  adoptRelativeProductImages,
} from "./services/upload.service.js";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./config/database.js";
await db.$connect();
const adoptedImages = await adoptLegacyImages();
if (adoptedImages)
  console.log(
    `Moved ${adoptedImages} legacy image upload(s) into the public upload directory`,
  );
const adoptedProducts = await adoptRelativeProductImages();
if (adoptedProducts)
  console.log(
    `Normalized ${adoptedProducts} product image(s) to absolute public URLs`,
  );
const stopMarketingWorker = startMarketingWorker();
const server = app.listen(env.PORT, () =>
  console.log(`Barwaqt API listening on ${env.PORT}`),
);
function shutdown() {
  stopMarketingWorker();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
