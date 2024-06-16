const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

async function getLatestTagName() {
  try {
    const { stdout } = await execPromise("git describe --tags --abbrev=0");
    return stdout.trim();
  } catch (error) {
    console.error("Error fetching latest tag:", error);
    return null; // Default to null if there's an error or no tag found
  }
}

function convertToDateFormat(dateString) {
  const rawDate = dateString.slice(1);

  const year = rawDate.substring(0, 4);
  const month = rawDate.substring(4, 6);
  const day = rawDate.substring(6, 8);
  const formattedDate = `${year}-${month}-${day}`;

  return formattedDate;
}

function buildDate(dateString) {
  const t = dateString.indexOf("T");
  if (t !== -1) {
    dateString = dateString.substring(0, t);
  }
  var parts = dateString.split("-");
  return new Date(parts[0], parts[1] - 1, parts[2]);
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
];

async function checkModUpdate(date) {
  for (const id of watchedMods) {
    const info = await fetch(
      `https://api.paradox-interactive.com/mods?modId=${id}&os=Windows`
    );
    const name = (await info.json()).modDetail.displayName;
    //console.log(`Checking %s's update...`, name);
    const resp = await fetch(
      `https://api.paradox-interactive.com/mods/versions?modId=${id}`
    );
    const modVersions = (await resp.json()).modVersions;
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
  const lastUpdatedTime = buildDate(convertToDateFormat(latestTagTime));

  await checkModUpdate(lastUpdatedTime);
}

main();
