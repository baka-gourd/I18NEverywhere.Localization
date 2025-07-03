const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const execPromise = util.promisify(exec);

async function getLanguageDirs() {
  const projectPath = path.join(__dirname, "project");
  return fs.readdirSync(projectPath).filter((file) => {
    return fs.statSync(path.join(projectPath, file)).isDirectory();
  });
}

async function getAuthorsForLanguage(language) {
  try {
    const langPath = `project/${language}`;
    const { stdout } = await execPromise(
      `git log --pretty=format:"%an" -- ${langPath}`
    );

    // Remove duplicate authors and sort them
    const authors = [
      ...new Set(stdout.split("\n").filter((a) => a.trim() !== "")),
    ];
    return authors.sort().join(", ");
  } catch (error) {
    console.error(`Error getting authors for ${language}:`, error);
    return "";
  }
}

async function updateDescriptionFile() {
  const descriptionPath = path.join(__dirname, "..", "Description.md");
  let descriptionContent = fs.readFileSync(descriptionPath, "utf8");

  // Get all language directories
  const languages = await getLanguageDirs();

  // Generate authors for each language
  let githubAuthors = "";
  for (const lang of languages) {
    const authors = await getAuthorsForLanguage(lang);
    if (authors) {
      githubAuthors += `- ${lang}: ${authors}\n`;
    }
  }

  // Find the Github section specifically and replace only that
  if (descriptionContent.includes("Github:")) {
    const sections = descriptionContent.split("Github:");
    const beforeGithub = sections[0];
    const afterGithub = sections[1].split(/\n[A-Za-z]+:/)[0]; // Get content until next section

    // Replace the content after "Github:" header
    descriptionContent = beforeGithub + "Github:\n\n" + githubAuthors;

    // Check if there was more content after this section
    if (sections[1].includes("\n")) {
      const remainingContent = sections[1].substring(afterGithub.length);
      descriptionContent += remainingContent;
    }
  } else {
    console.log("Github section not found in Description.md");
  }

  fs.writeFileSync(descriptionPath, descriptionContent);
  console.log("Description.md updated with language authors");
}

updateDescriptionFile();
