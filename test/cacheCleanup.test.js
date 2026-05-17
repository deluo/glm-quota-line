import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { cleanupExpiredCache } from "../src/core/quota/cache.js";
import { withTempDir } from "./helpers.js";

test("cleanupExpiredCache removes cache files older than maxAge", async () => {
  await withTempDir(async (dir) => {
    const cacheDir = path.join(dir, "glm-quota-line");
    await fs.mkdir(cacheDir, { recursive: true });

    const savedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const oldCache = path.join(cacheDir, "cache-old123.json");
    await fs.writeFile(oldCache, JSON.stringify({ savedAt }));

    // Simulate a future "now" so both mtime and savedAt appear expired
    const result = await cleanupExpiredCache({
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      now: Date.now() + 40 * 24 * 60 * 60 * 1000,
      getCacheRoot: () => dir
    });

    assert.equal(result.deletedCount, 1);
    assert.equal(result.cacheDir, cacheDir);

    // 验证文件已被删除
    const exists = await fs.stat(oldCache).then(() => true).catch(() => false);
    assert.equal(exists, false);
  });
});

test("cleanupExpiredCache keeps recent cache files", async () => {
  await withTempDir(async (dir) => {
    const cacheDir = path.join(dir, "glm-quota-line");
    await fs.mkdir(cacheDir, { recursive: true });

    // 创建一个最近的缓存文件
    const recentCache = path.join(cacheDir, "cache-recent.json");
    await fs.writeFile(recentCache, JSON.stringify({ savedAt: Date.now() }));

    const result = await cleanupExpiredCache({
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      getCacheRoot: () => dir
    });

    assert.equal(result.deletedCount, 0);

    // 验证文件仍然存在
    const exists = await fs.stat(recentCache).then(() => true).catch(() => false);
    assert.equal(exists, true);
  });
});

test("cleanupExpiredCache handles non-existent directory gracefully", async () => {
  const result = await cleanupExpiredCache({
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,
    getCacheRoot: () => "/nonexistent/path/that/does/not/exist"
  });

  assert.equal(result.deletedCount, 0);
  assert.equal(result.totalSize, 0);
  assert.equal(result.errors.length, 0);
});

test("cleanupExpiredCache skips non-cache files", async () => {
  await withTempDir(async (dir) => {
    const cacheDir = path.join(dir, "glm-quota-line");
    await fs.mkdir(cacheDir, { recursive: true });

    // 创建一个非缓存文件
    const otherFile = path.join(cacheDir, "readme.txt");
    await fs.writeFile(otherFile, "not a cache file");

    const result = await cleanupExpiredCache({
      maxAgeMs: 0,
      getCacheRoot: () => dir
    });

    assert.equal(result.deletedCount, 0);

    // 验证非缓存文件仍然存在
    const exists = await fs.stat(otherFile).then(() => true).catch(() => false);
    assert.equal(exists, true);
  });
});

test("cleanupExpiredCache calculates total size correctly", async () => {
  await withTempDir(async (dir) => {
    const cacheDir = path.join(dir, "glm-quota-line");
    await fs.mkdir(cacheDir, { recursive: true });

    const oldTime = Date.now() - 1000000;
    const file1 = path.join(cacheDir, "cache-file1.json");
    const file2 = path.join(cacheDir, "cache-file2.json");
    await fs.writeFile(file1, JSON.stringify({ savedAt: oldTime, data: "a".repeat(100) }));
    await fs.writeFile(file2, JSON.stringify({ savedAt: oldTime, data: "b".repeat(200) }));

    // Use a future "now" so mtime-based early exit doesn't skip the files
    const result = await cleanupExpiredCache({
      maxAgeMs: 0,
      now: Date.now() + 2000000,
      getCacheRoot: () => dir
    });

    assert.equal(result.deletedCount, 2);
    assert.ok(result.totalSize > 0);
  });
});
