import path from "path";
import fs from "fs/promises";
import unzipper from "unzipper";
import { ParaTranzApi } from "./api.js";
import { ArtifactInfo, Config, ProjectId, SyncData } from "./types.js";
import { ensureDir, writeStreamToFile } from "./fs-utils.js";
import fsSync from "fs";

export class ParaTranzSync {
  private api: ParaTranzApi;
  private tmpDir: string =
    process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp";
  private syncDataFile = path.join(process.cwd(), "paratransz-sync-data.json");

  constructor(private cfg: Config) {
    this.api = new ParaTranzApi(cfg.token);
  }

  private async loadSyncData(): Promise<SyncData> {
    try {
      const txt = await fs.readFile(this.syncDataFile, "utf-8");
      const obj = JSON.parse(txt);
      return {
        artifact: obj.artifact || obj,
        localPush: obj.localPush || {},
      } as SyncData;
    } catch {
      return { artifact: {}, localPush: {} };
    }
  }

  private async saveSyncData(data: SyncData) {
    // Avoid touching the file if content did not change
    const next = JSON.stringify(data, null, 2);
    try {
      const prev = await fs.readFile(this.syncDataFile, "utf-8");
      if (prev === next) return; // no change
    } catch {
      // file not exist or unreadable; proceed to write
    }
    await fs.writeFile(this.syncDataFile, next, "utf-8");
  }

  private async triggerAndWaitExport(
    projectId: ProjectId,
    timeoutMs = 120000,
    intervalMs = 3000
  ): Promise<ArtifactInfo> {
    const before = await this.api.getArtifact(projectId).catch(() => undefined);
    await this.api.triggerExport(projectId);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const art = await this.api.getArtifact(projectId);
        if (art?.createdAt && (!before || art.createdAt !== before.createdAt))
          return art;
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
      `Export not available within ${timeoutMs}ms for ${projectId}`
    );
  }

  async downloadLatest(
    projectId: ProjectId,
    forceExport = true,
    localeDirName?: string
  ): Promise<{ unzipDir: string; artifact: ArtifactInfo }> {
    console.log(
      `[${projectId}] downloadLatest(forceExport=${forceExport}, locale=${
        localeDirName || "-"
      })`
    );
    let artifact: ArtifactInfo | undefined = undefined;
    if (forceExport) {
      console.log(`[${projectId}] Triggering export...`);
      artifact = await this.triggerAndWaitExport(projectId);
      console.log(`[${projectId}] Export ready at ${artifact.createdAt}`);
    }
    console.log(`[${projectId}] Downloading artifact...`);
    const zipPath = path.join(this.tmpDir, `project_${projectId}_artifact.zip`);
    const body = await this.api.downloadArtifact(projectId);
    await writeStreamToFile(body, zipPath);
    console.log(`[${projectId}] Zip saved to ${zipPath}`);

    const unzipDir = path.join(this.tmpDir, `project_${projectId}_artifact`);
    // Clean and recreate unzip dir to avoid stale files from previous runs
    await this.emptyDir(unzipDir);
    await ensureDir(unzipDir);
    console.log(`[${projectId}] Unzipping to ${unzipDir}...`);
    const unzipStats = await this.unzipUtf8(zipPath, unzipDir);
    console.log(
      `[${projectId}] Unzip done. entriesHandled=${unzipStats.handled}, filesWritten=${unzipStats.written}`
    );
    // Process JSON files the same way as the old script
    console.log(`[${projectId}] Processing extracted JSON...`);
    const procStats = await this.processExtracted(unzipDir);
    console.log(
      `[${projectId}] Processing done. jsonSeen=${procStats.seen}, jsonConverted=${procStats.converted}`
    );
    // Copy to local project/<locale>
    if (localeDirName) {
      // Prefer copying only the specific locale subfolder if it exists
      const localeSrcDir = path.join(unzipDir, localeDirName);
      const srcDir = fsSync.existsSync(localeSrcDir) ? localeSrcDir : unzipDir;
      const destDir = path.join(process.cwd(), "project", localeDirName);
      // Mirror the content by clearing destination before copy
      console.log(
        `[${projectId}] Copying (merge, no delete) from ${srcDir} to ${destDir}...`
      );
      await ensureDir(destDir);
      await this.copyDir(srcDir, destDir);
      console.log(
        `[${projectId}] Copied processed files from ${srcDir} to ${destDir}`
      );
    }
    if (!artifact) {
      artifact = await this.api.getArtifact(projectId);
      console.log(
        `[${projectId}] Artifact info fetched: ${artifact.createdAt}`
      );
    }
    return { unzipDir, artifact };
  }

  private async unzipUtf8(
    zipPath: string,
    outputDir: string
  ): Promise<{ handled: number; written: number }> {
    let handled = 0;
    let written = 0;
    await new Promise<void>((resolve, reject) => {
      const pending: Promise<void>[] = [];
      // Use default parser to align with previous working behavior
      const parser = unzipper.Parse();

      const normalize = (p: string) => p.replace(/\\/g, "/");
      const stripUtf8Prefix = (p: string) => {
        const n = normalize(p);
        // Only accept entries that contain the utf8 segment (case-insensitive)
        const idx = n.toLowerCase().indexOf("/utf8/");
        if (/^utf8\//i.test(n)) return n.replace(/^utf8\//i, "");
        if (idx >= 0) return n.substring(idx + "/utf8/".length);
        return ""; // ignore entries not under utf8
      };

      parser.on("entry", (entry: any) => {
        const originalPath = entry.path as string;
        const rel = stripUtf8Prefix(originalPath);
        if (!rel) {
          // Extra debug to see the path being skipped
          // console.debug(`[unzip] skip: ${originalPath}`);
          entry.autodrain();
          return;
        }
        handled++;
        const destPath = path.join(outputDir, rel);

        if (entry.type === "File") {
          ensureDir(path.dirname(destPath))
            .then(() => {
              const ws = fsSync.createWriteStream(destPath);
              const p = new Promise<void>((res, rej) => {
                ws.on("finish", () => {
                  written++;
                  res();
                });
                ws.on("error", rej);
              });
              pending.push(p);
              entry.pipe(ws);
            })
            .catch(() => entry.autodrain());
        } else {
          // Directory or others
          ensureDir(destPath)
            .then(() => {})
            .catch(() => {})
            .finally(() => entry.autodrain());
        }
      });

      const done = () => {
        Promise.allSettled(pending)
          .then(() => resolve())
          .catch(reject);
      };

      parser.on("close", done);
      parser.on("finish", done);
      parser.on("end", done);
      parser.on("error", reject);

      const rs = fsSync.createReadStream(zipPath);
      rs.on("error", reject);
      rs.pipe(parser);

      // Failsafe timeout to avoid hanging forever
      const timeout = setTimeout(() => {
        reject(new Error("unzip timeout after 120s"));
      }, 120000);
      const clearAll = () => clearTimeout(timeout);
      parser.on("close", clearAll);
      parser.on("finish", clearAll);
      parser.on("end", clearAll);
    });
    return { handled, written };
  }

  private async processExtracted(
    dir: string
  ): Promise<{ seen: number; converted: number }> {
    let seen = 0;
    let converted = 0;
    const walk = async (d: string) => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile() && full.endsWith(".json")) {
          try {
            let raw = await fs.readFile(full, "utf-8");
            // 清理可能影响 JSON.parse 的前导不可见字符（BOM、零宽字符、控制字符）
            raw = raw.replace(
              /^[\u0000-\u001F\uFEFF\u200B\u200C\u200D\u2060]+/,
              ""
            );
            const trimmed = raw.trim();
            if (!trimmed) {
              // 空文件，跳过
              continue;
            }
            const json = JSON.parse(trimmed);
            seen++;
            if (Array.isArray(json)) {
              const obj = (
                json as Array<{ key: string; translation: string }>
              ).reduce((acc, item) => {
                const v = (item.translation ?? "").replaceAll("\\n", "\n");
                (acc as any)[item.key] = v;
                return acc;
              }, {} as Record<string, string>);
              await fs.writeFile(full, JSON.stringify(obj, null, 2), "utf-8");
              converted++;
            }
          } catch (err) {
            console.error(`Failed processing ${full}:`, err);
          }
        }
      }
    };
    await walk(dir);
    return { seen, converted };
  }

  private async copyDir(src: string, dest: string) {
    // Node 16+ fs.cp
    await ensureDir(dest);
    await (fs as any).cp(src, dest, { recursive: true, force: true });
  }

  private async emptyDir(dir: string) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  }
}
