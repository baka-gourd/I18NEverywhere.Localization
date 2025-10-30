import { promisify } from "util";
import { exec as execCb } from "child_process";
import path from "path";

const exec = promisify(execCb);

async function getLatestTagName() {
  try {
    const { stdout } = await exec("git describe --tags --abbrev=0");
    return stdout.trim();
  } catch (error) {
    console.error("Error fetching latest tag:", error);
    return null;
  }
}

async function generateChangelog() {
  try {
    const latestTag = await getLatestTagName();
    if (!latestTag) {
      console.log("No tags found. Exiting changelog generation.");
      return;
    }

    const { stdout } = await exec(
      `git log ${latestTag}..HEAD --pretty=format:"%H %ad" --date=short --name-status --find-renames=30%`
    );
    const commits = stdout.split("\n");
    let changelog = "";
    let currentCommit = "";
    let changeGroup: string[] = [];
    commits.forEach((line) => {
      if (line.match(/^\w{40} \d{4}-\d{2}-\d{2}$/)) {
        const parts = line.split(" ");
        currentCommit = `${parts[1]}\n`;
      } else if (line === "") {
        if (changeGroup.length === 0) return;
        for (let s of changeGroup) changelog += s;
        changeGroup.splice(0);
      } else if (
        line.startsWith("A\t") ||
        line.startsWith("M\t") ||
        line.startsWith("D\t") ||
        line.startsWith("R")
      ) {
        if (line.startsWith("R")) {
          const parts = line.split(/\s+/);
          if (!parts[1].includes("project")) return;
          if (!parts[2].includes("project")) return;
          const match = /project\/([^\/]+)\/.+/.exec(parts[1]);
          const language = match ? match[1] : "";
          if (language === "en-US") return;
          changelog += `- ${language}: mov ${path.basename(
            parts[1],
            ".json"
          )} to ${path.basename(parts[2], ".json")} at ${currentCommit}`;
        } else {
          const type =
            line[0] === "A" ? "add" : line[0] === "M" ? "upd" : "del";
          const filePath = line.substring(2).trim();
          if (!filePath.includes("project")) return;
          const match = /project\/([^\/]+)\/.+/.exec(filePath);
          const language = match ? match[1] : "";
          if (language === "en-US") return;
          changelog += `- ${language}: ${type} ${path.basename(
            filePath,
            ".json"
          )} at ${currentCommit}`;
        }
      }
    });

    console.log(changelog);
  } catch (error) {
    console.error("Error generating changelog:", error);
  }
}

generateChangelog();
