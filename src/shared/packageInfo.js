import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_JSON_PATH = path.resolve(__dirname, "..", "..", "package.json");

let packageInfoPromise;

async function readPackageJson() {
  const raw = await fs.readFile(PACKAGE_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw);

  return {
    name: typeof parsed.name === "string" ? parsed.name : "glm-quota-line",
    version: typeof parsed.version === "string" ? parsed.version : "0.0.0"
  };
}

export async function readPackageInfo() {
  packageInfoPromise ||= readPackageJson();
  return packageInfoPromise;
}

export async function getPackageVersion() {
  const packageInfo = await readPackageInfo();
  return packageInfo.version;
}
