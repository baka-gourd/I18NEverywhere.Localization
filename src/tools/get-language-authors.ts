import { promisify } from "util";
import { exec as execCb } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const exec = promisify(execCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getLanguageDirs() {
  const projectPath = path.join(__dirname, "..", "..", "project");
  return fs.readdirSync(projectPath).filter((file) => {
    return fs.statSync(path.join(projectPath, file)).isDirectory();
  });
}

async function getAuthorsForLanguage(language: string) {
  try {
    const langPath = `project/${language}`;
    const { stdout } = await exec(
      `git log --pretty=format:"%an" -- ${langPath}`
    );
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
  const descriptionPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "Description.md"
  );
  let descriptionContent = fs.readFileSync(descriptionPath, "utf8");
  const languages = await getLanguageDirs();

  let githubAuthors = "";
  for (const lang of languages) {
    const authors = await getAuthorsForLanguage(lang);
    if (authors) {
      githubAuthors += `- ${lang}: ${authors}\n`;
    }
  }

  if (descriptionContent.includes("Github:")) {
    const sections = descriptionContent.split("Github:");
    const beforeGithub = sections[0];
    const afterGithub = sections[1].split(/\n[A-Za-z]+:/)[0];
    descriptionContent = beforeGithub + "Github:\n\n" + githubAuthors;
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
