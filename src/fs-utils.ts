import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export async function ensureDir(p: string) {
  try {
    await fs.access(p);
  } catch {
    await fs.mkdir(p, { recursive: true });
  }
}

export async function writeStreamToFile(
  stream: NodeJS.ReadableStream,
  dest: string
): Promise<void> {
  await ensureDir(path.dirname(dest));
  await new Promise<void>((resolve, reject) => {
    const out = fsSync.createWriteStream(dest);
    stream.pipe(out);
    stream.on("error", reject);
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
}

export async function readJson(file: string): Promise<any> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content);
}

export async function readFileBuffer(file: string): Promise<Buffer> {
  return fs.readFile(file);
}

export async function walk(
  dir: string,
  filter: (p: string) => boolean
): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      result.push(...(await walk(full, filter)));
    } else if (e.isFile() && filter(full)) {
      result.push(full);
    }
  }
  return result;
}
