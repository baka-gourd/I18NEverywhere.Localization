const { exec } = require("child_process");
const fs = require("fs");
const util = require("util");
const path = require("path");
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

async function generateChangelog(outputFile) {
  try {
    const latestTag = await getLatestTagName();
    if (!latestTag) {
      console.log("No tags found. Exiting changelog generation.");
      return;
    }

    const { stdout } = await execPromise(
      `git log ${latestTag}..HEAD --pretty=format:"%H %ad" --date=short --name-status --find-renames=30%`
    );
    const commits = stdout.split("\n");
    let changelog = "";
    let currentCommit = ""; //commit time
    let changeGroup = [];
    commits.forEach((line) => {
      if (line.match(/^\w{40} \d{4}-\d{2}-\d{2}$/)) {
        // Regex to match commit hash and date
        const parts = line.split(" ");
        currentCommit = `${parts[1]}\n`;
      } else if (line === "") {
        if (changeGroup.length === 0) return;
        for (let s of changeGroup) changelog += s;
        changeGroup.splice(0);
      } else if (
        line.startsWith("A	") ||
        line.startsWith("M	") ||
        line.startsWith("D	") ||
        line.startsWith("R")
      ) {
        if (line.startsWith("R")) {
          const parts = line.split(/\s+/);
          if (parts[1].indexOf("project") === -1) return;
          if (parts[2].indexOf("project") === -1) return;
          const language = /project\/([^\/]+)\/.+/.exec(parts[1])[1];
          if (language === "en-US") return;
          changeGroup.push(
            `- ${language}: mov ${path.basename(
              parts[1],
              ".json"
            )} to ${path.basename(parts[2], ".json")} at ${currentCommit}`
          );
        } else {
          const type =
            line[0] === "A" ? "add" : line[0] === "M" ? "upd" : "del";
          const filePath = line.substring(2).trim();
          if (filePath.indexOf("project") === -1) return;
          const language = /project\/([^\/]+)\/.+/.exec(filePath)[1];
          if (language === "en-US") return;
          changeGroup.push(
            `- ${language}: ${type} ${path.basename(
              filePath,
              ".json"
            )} at ${currentCommit}`
          );
        }
      }
    });

    console.log(changelog);
  } catch (error) {
    console.error("Error generating changelog:", error);
  }
}

// Call the function with the path to the changelog file
generateChangelog("CHANGELOG.md");
