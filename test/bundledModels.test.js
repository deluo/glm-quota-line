import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadBundledModels } from "../src/core/context/models.js";

test("loadBundledModels returns the bundled default table", () => {
  const models = loadBundledModels();
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["glm-5.2"], 1000000);
  assert.equal(models["glm-4.5-air"], 128000);
});

test("loadBundledModels returns a non-empty object", () => {
  const models = loadBundledModels();
  assert.equal(typeof models, "object");
  assert.ok(Object.keys(models).length > 0);
});

function writeTmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glm-models-"));
  const filePath = path.join(dir, "models.json");
  if (content !== null) {
    fs.writeFileSync(filePath, content, "utf8");
  }
  return filePath; // content === null => file not created (missing)
}

test("loadBundledModels falls back to FALLBACK_MODEL_MAP when file is missing", () => {
  const filePath = writeTmpFile(null); // file does not exist
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  // bundled-only models are absent in fallback
  assert.equal(models["glm-5.2"], undefined);
});

test("loadBundledModels falls back when JSON is corrupt", () => {
  const filePath = writeTmpFile("{ not valid json ]]]");
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["glm-5.2"], undefined);
});

test("loadBundledModels falls back when models field is missing", () => {
  const filePath = writeTmpFile(JSON.stringify({ schemaVersion: 1 }));
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
});

test("loadBundledModels falls back when models field is not an object", () => {
  const filePath = writeTmpFile(JSON.stringify({ models: ["array", "not", "object"] }));
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
});

test("loadBundledModels skips invalid entries but keeps valid ones", () => {
  const filePath = writeTmpFile(
    JSON.stringify({
      models: {
        "glm-4.7": 200000,
        "bad-size": -50,
        "bad-type": "200000",
        "": 100000
      }
    })
  );
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["bad-size"], undefined);
  assert.equal(models["bad-type"], undefined);
  assert.equal(models[""], undefined);
});
