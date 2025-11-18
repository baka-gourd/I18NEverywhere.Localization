import path from "path";
import fs from "fs/promises";
import { hash } from "hasha";
import { ParaTranzApi } from "./api.js";
import { Config, FileItem, ProjectId, SyncData } from "./types.js";
import { readFileBuffer, walk } from "./fs-utils.js";

export class ParaTranzPush {
  private api: ParaTranzApi;
  constructor(private cfg: Config) {
    this.api = new ParaTranzApi(cfg.token);
  }

  private toRel(from: string): string {
    return path.relative(this.cfg.baseDir, from).replace(/\\/g, "/");
  }

  private targetProjectLocale(projectId: ProjectId): string {
    return this.cfg.langMap[projectId];
  }

  private async ensureFileMapping(
    projectId: ProjectId
  ): Promise<Map<string, FileItem>> {
    const files = await this.api.listFiles(projectId);
    const map = new Map<string, FileItem>();
    for (const f of files) map.set(f.name, f);
    return map;
  }

  async pushSourceOriginals(projectId: ProjectId) {
    const srcLocale = this.cfg.sourceLocale; // 'en-US'
    const srcDir = path.join(this.cfg.baseDir, srcLocale);
    const filePaths = await walk(srcDir, (p) => p.endsWith(".json"));
    const remote = await this.ensureFileMapping(projectId);

    for (const abs of filePaths) {
      const relFromLocale = path.relative(srcDir, abs).replace(/\\/g, "/");
      // place into same path at project root on ParaTranz
      const remoteName = relFromLocale; // path/to/file.json
      const buffer = await readFileBuffer(abs);
      // Use hasha to align with common md5sum output
      const currHash = await hash(buffer, { algorithm: "md5" });
      const existing = remote.get(remoteName);
      if (existing) {
        // Server-provided hash is for the uploaded source file (md5). Skip if unchanged.
        if (existing.hash === currHash) {
          // console.log(`[${projectId}] Skip unchanged source: ${remoteName}`);
        } else {
          await this.api.updateFile(
            projectId,
            existing.id,
            buffer,
            path.basename(remoteName)
          );
          console.log(`[${projectId}] Updated source: ${remoteName}`);
        }
      } else {
        const dirOnly = path.dirname(remoteName);
        await this.api.createFile(
          projectId,
          dirOnly === "." ? "" : dirOnly + "/",
          path.basename(remoteName),
          buffer
        );
        console.log(`[${projectId}] Created source: ${remoteName}`);
      }
    }

    // 删除远端多余的源文件（本地已删除）
    const localSet = new Set(
      filePaths.map((abs) => path.relative(srcDir, abs).replace(/\\/g, "/"))
    );
    const toDelete: FileItem[] = [];
    for (const [name, f] of remote) {
      if (!localSet.has(name)) {
        toDelete.push(f);
      }
    }
    for (const f of toDelete) {
      if (!f.name.endsWith(".json")) continue; // 仅删除我们管理的 JSON 源文件
      await this.api.deleteFile(projectId, f.id);
      console.log(
        `[${projectId}] Deleted remote source (not in local): ${f.name}`
      );
    }
  }

  async pushTranslations(
    projectId: ProjectId,
    syncData: SyncData,
    force = false
  ) {
    const locale = this.targetProjectLocale(projectId);
    const locDir = path.join(this.cfg.baseDir, locale);
    const filePaths = await walk(locDir, (p) => p.endsWith(".json"));
    const remote = await this.ensureFileMapping(projectId);

    // Track content hash to avoid re-upload (backward compatible with old mtime values)
    if (!syncData.localPush[projectId]) syncData.localPush[projectId] = {};
    const m = syncData.localPush[projectId];

    for (const abs of filePaths) {
      const relFromLocale = path.relative(locDir, abs).replace(/\\/g, "/");
      const remoteName = relFromLocale;

      // Decide whether to upload based on stored value type
      const stored = m[remoteName];
      let shouldUpload = true;
      let buffer: Buffer | null = null;
      let currHash = "";
      if (!force) {
        if (typeof stored === "string") {
          // Hash-based check
          buffer = await readFileBuffer(abs);
          currHash = await hash(buffer, { algorithm: "md5" });
          if (stored === currHash) {
            shouldUpload = false;
          }
        } else if (typeof stored === "number") {
          // Backward compatibility: mtime-based check, avoid touching the value to reduce data file churn
          const stat = await fs.stat(abs);
          if (stat.mtimeMs <= stored) {
            shouldUpload = false;
          }
          // Do not migrate to hash unless we actually upload, to avoid rewriting data on every sync
        } else {
          // No record: will upload
          shouldUpload = true;
        }
      }

      const existing = remote.get(remoteName);
      if (!existing) {
        console.warn(
          `[${projectId}] Translation file not found remotely for ${remoteName}, skipping translation upload. Upload source first.`
        );
        continue;
      }

      if (!buffer) buffer = await readFileBuffer(abs);
      if (!currHash) currHash = await hash(buffer, { algorithm: "md5" });

      if (!shouldUpload) {
        // Skip unchanged
        // console.log(`[${projectId}] Skip unchanged translation: ${remoteName}`);
        continue;
      }
      // Use original filename for JSON format; ParaTranz also accepts standard JSON with
      // originalName + '.json' but not needed if original format is JSON.
      await this.api.updateFileTranslation(
        projectId,
        existing.id,
        buffer,
        path.basename(remoteName),
        force
      );
      // Store content hash for future comparisons
      m[remoteName] = currHash;
      console.log(`[${projectId}] Uploaded translation: ${remoteName}`);
    }
    // Optional cleanup: remove records for files that no longer exist locally to keep data small
    const localSet = new Set(
      filePaths.map((abs) => path.relative(locDir, abs).replace(/\\/g, "/"))
    );
    for (const key of Object.keys(m)) {
      if (!localSet.has(key)) delete m[key];
    }
    console.log(
      `[${projectId}] pushTranslations done. total=${
        filePaths.length
      }, uploaded=${Object.keys(syncData.localPush[projectId] || {}).length}`
    );
  }
}
