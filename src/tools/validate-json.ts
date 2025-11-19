import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonFilePath = string;

const repoRoot = path.resolve(process.cwd());
const includeDirs: string[] = [path.join(repoRoot, "project"), repoRoot];

const excludeDirs = new Set<string>([
  path.join(repoRoot, "node_modules"),
  path.join(repoRoot, ".git"),
  path.join(repoRoot, "dist"),
]);

/**
 * 递归遍历目录，收集 .json 文件
 */
async function walk(dir: string, out: Set<JsonFilePath>): Promise<void> {
  if (excludeDirs.has(dir)) return;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // 无权限或目录不存在，直接跳过
    return;
  }

  for (const ent of entries) {
    const p = path.join(dir, ent.name);

    if (excludeDirs.has(p)) continue;

    if (ent.isDirectory()) {
      await walk(p, out);
    } else if (ent.isFile() && p.toLowerCase().endsWith(".json")) {
      out.add(p); // 用 Set 去重
    }
  }
}

/**
 * 读取并解析单个 JSON 文件
 */
async function validateJsonFile(file: JsonFilePath): Promise<Error | null> {
  try {
    const data = await fs.readFile(file, "utf8");
    // 去掉 UTF-8 BOM，避免某些编辑器写入 BOM 导致 JSON.parse 抛错
    const cleaned = data.replace(/^\uFEFF/, "");
    JSON.parse(cleaned);
    return null;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return err;
  }
}

async function main(): Promise<void> {
  const fileSet = new Set<JsonFilePath>();

  // 收集所有 JSON 文件
  for (const dir of includeDirs) {
    try {
      await fs.access(dir);
    } catch {
      // 目录不存在就跳过
      continue;
    }
    await walk(dir, fileSet);
  }

  const files = Array.from(fileSet).sort();
  let hasError = false;

  for (const file of files) {
    const err = await validateJsonFile(file);
    if (err) {
      hasError = true;
      console.error(`[JSON INVALID] ${file}: ${err.message}`);
    }
  }

  if (hasError) {
    console.error(`JSON validation failed. ${files.length} files checked.`);
    process.exit(1);
  } else {
    console.log(`All JSON valid. ${files.length} files checked.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
