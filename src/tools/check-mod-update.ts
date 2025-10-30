import { promisify } from "util";
import { exec as execCb } from "child_process";

const exec = promisify(execCb);

async function getLatestTagName() {
  try {
    const { stdout } = await exec("git describe --tags --abbrev=0");
    return stdout.trim();
  } catch (error) {
    console.error("Error fetching latest tag:", error);
    return null; // Default to null if there's an error or no tag found
  }
}

function convertToDateFormat(dateString: string) {
  const rawDate = dateString.slice(1);
  const year = rawDate.substring(0, 4);
  const month = rawDate.substring(4, 6);
  const day = rawDate.substring(8, 10);
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

function buildDate(dateString: string) {
  const t = dateString.indexOf("T");
  if (t !== -1) {
    dateString = dateString.substring(0, t);
  }
  const parts = dateString.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

const watchedMods = [
  "82370",
  "81157",
  "74324",
  "77260",
  "78188",
  "79634",
  "78554",
  "75862",
  "77171",
  "78903",
];

async function checkModUpdate(date: Date) {
  for (const id of watchedMods) {
    const info = await fetch(
      `https://api.paradox-interactive.com/mods?modId=${id}&os=Windows`
    );
    const name = ((await info.json()) as any).modDetail.displayName;
    const resp = await fetch(
      `https://api.paradox-interactive.com/mods/versions?modId=${id}`
    );
    const modVersions = ((await resp.json()) as any).modVersions as Array<{
      created: string;
    }>;
    const latestVersion = modVersions[modVersions.length - 1];
    const newVersionPublishTime = buildDate(latestVersion.created);
    if (date <= newVersionPublishTime) {
      console.log(
        "%s need to update:\n%s",
        name,
        `https://mods.paradoxplaza.com/mods/${id}/Windows`
      );
    }
  }
}

async function main() {
  const latestTagTime = await getLatestTagName();
  if (!latestTagTime) return;
  const lastUpdatedTime = buildDate(convertToDateFormat(latestTagTime));
  await checkModUpdate(lastUpdatedTime);
}

main();
