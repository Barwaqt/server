import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
// Runtime files stay outside source directories so deploys never overwrite them.
export const uploadRoot = path.resolve(serverRoot, env.UPLOAD_DIR);
// Public images are plain files served by express.static at /uploads.
export const publicUploadRoot = path.join(uploadRoot, "public");
export const publicUploadPath = "/uploads";
const publicApiUrl = env.PUBLIC_API_URL.replace(/\/+$/, "");
export function publicFileUrl(name) {
  return `${publicApiUrl}${publicUploadPath}/${name}`;
}
