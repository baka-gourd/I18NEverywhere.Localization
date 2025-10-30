import path from "path";
import { ParaTranzSync } from "../paratranz.js";
import { ParaTranzPush } from "../push.js";
import { Config } from "../types.js";

function getToken(): string {
  const token = process.argv[2];
  if (!token) {
    console.error('Usage: pnpm run sync -- "Bearer <TOKEN>"');
    process.exit(1);
  }
  return token;
}

(async () => {
  const token = getToken();
  const cfg: Config = {
    token,
    projectIds: [9588, 9797],
    langMap: { 9588: "zh-HANS", 9797: "fr-FR" },
    sourceLocale: "en-US",
    baseDir: path.join(process.cwd(), "project"),
  };

  const sync = new ParaTranzSync(cfg);
  const push = new ParaTranzPush(cfg);
  for (const pid of cfg.projectIds) {
    console.log(`==== Start syncing project ${pid} ====`);
    const startedAt = Date.now();
    try {
      console.log(`[${pid}] Pushing source originals...`);
      await push.pushSourceOriginals(pid);

      console.log(`[${pid}] Loading sync data...`);
      const data = await (sync as any)["loadSyncData"]();

      console.log(`[${pid}] Pushing translations...`);
      await push.pushTranslations(pid, data, false);

      console.log(`[${pid}] Saving sync data...`);
      await (sync as any)["saveSyncData"](data);

      console.log(`[${pid}] Downloading latest translations...`);
      await sync.downloadLatest(pid, true, cfg.langMap[pid]);
      console.log(`[${pid}] Done. Elapsed ${(Date.now() - startedAt) / 1000}s`);
    } catch (err: any) {
      console.error(
        `[${pid}] Error occurred: ${
          err?.message || err
        }. Skipping to next project.`
      );
    }
    console.log(`==== End syncing project ${pid} ====`);
  }
})();
