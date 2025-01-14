const fs = require("fs").promises; // Use fs.promises
const path = require("path");
const fetch = require("node-fetch-commonjs");
const unzipper = require("unzipper");
const fsSync = require("fs"); // For synchronous operations
const { argv } = require("process");

// Project ID list
const projectIds = [9588, 9797];

const langMap = { 9588: "zh-HANS", 9797: "fr-FR" };

// ParaTranz API Token
const token = argv[2];

// Temporary directory and sync data path
const tmpDir =
    process.env.TMPDIR || process.env.TEMP || process.env.TMP || "/tmp";
const dataFilePath = path.join(process.cwd(), "paratransz-sync-data.json");

// Process directories recursively
const processDirectory = async (directory) => {
    try {
        const entries = await fs.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await processDirectory(fullPath);
            } else if (entry.isFile() && path.extname(entry.name) === ".json") {
                await processFile(fullPath);
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${directory}:`, err);
    }
};

// Process a single JSON file
const processFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, "utf8");
        let translations;
        try {
            translations = JSON.parse(data);
        } catch (parseErr) {
            console.error(
                `Error parsing JSON from file ${filePath}:`,
                parseErr
            );
            return;
        }

        const newJson = translations.reduce((acc, item) => {
            acc[item.key] = item.translation.replaceAll("\\n", "\n");
            return acc;
        }, {});

        await fs.writeFile(filePath, JSON.stringify(newJson, null, 2));
        console.log(`File ${filePath} has been updated.`);
    } catch (err) {
        console.error(`Error processing file ${filePath}:`, err);
    }
};

// Copy processed files to project-specific directory
const copyToProjectDirectory = async (sourceDir, projectId) => {
    const destinationDir = path.join(process.cwd(), "project", `${projectId}`);

    try {
        // Ensure destination directory exists
        await fs.mkdir(destinationDir, { recursive: true });

        // Copy the source directory to the destination
        await fs.cp(sourceDir, destinationDir, {
            recursive: true,
            force: true,
        });

        console.log(
            `Directory ${sourceDir} has been copied to ${destinationDir} and overwritten.`
        );
    } catch (err) {
        console.error(
            `Error copying directory ${sourceDir} to ${destinationDir}:`,
            err
        );
    }
};

// Load or initialize sync data
const loadSyncData = async () => {
    try {
        const data = await fs.readFile(dataFilePath, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        return {}; // Return an empty object
    }
};

// Save sync data
const saveSyncData = async (data) => {
    await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
};

// Get artifact creation time
const getArtifactInfo = async (projectId) => {
    const url = `https://paratranz.cn/api/projects/${projectId}/artifacts`;
    const response = await fetch(url, {
        headers: { Authorization: token },
    });

    if (!response.ok) {
        throw new Error(`Query failed: HTTP ${response.status}`);
    }

    const artifact = await response.json();
    return artifact.createdAt;
};

// Download ZIP file
const downloadZip = async (projectId, outputPath) => {
    const url = `https://paratranz.cn/api/projects/${projectId}/artifacts/download`;
    const response = await fetch(url, {
        headers: { Authorization: token },
        redirect: "follow",
    });

    if (response.status !== 200) {
        throw new Error(`Download failed: HTTP ${response.status}`);
    }

    await new Promise((resolve, reject) => {
        const fileStream = fsSync.createWriteStream(outputPath);
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
        fileStream.on("error", reject); // Handle errors for the write stream
    });
};

// Unzip ZIP file
const unzipFile = async (zipPath, outputDir) => {
    console.log(`Unzipping files to directory: ${outputDir}`);
    try {
        await fs.access(outputDir);
    } catch {
        await fs.mkdir(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const stream = fsSync.createReadStream(zipPath).pipe(unzipper.Parse());

        stream.on("error", reject);

        stream.on("entry", async (entry) => {
            const filePath = entry.path;

            if (filePath.startsWith("utf8/")) {
                const cleanPath = filePath.replace(/^utf8\//, "");
                const destPath = path.join(outputDir, cleanPath);

                try {
                    if (entry.type === "File") {
                        await fs.mkdir(path.dirname(destPath), {
                            recursive: true,
                        });
                        entry.pipe(fsSync.createWriteStream(destPath));
                    } else {
                        await fs.mkdir(destPath, { recursive: true });
                        entry.autodrain();
                    }
                } catch (error) {
                    console.error(`Error processing file ${cleanPath}:`, error);
                    entry.autodrain();
                }
            } else {
                entry.autodrain();
            }
        });

        stream.on("finish", async () => {
            console.log(`Files unzipped to: ${outputDir}`);
            try {
                await processDirectory(outputDir);
                console.log(`Directory ${outputDir} has been processed.`);
            } catch (err) {
                console.error(`Error processing directory ${outputDir}:`, err);
            }
            resolve();
        });
    });
};

(async () => {
    const syncData = await loadSyncData();

    for (const projectId of projectIds) {
        try {
            console.log(`Processing project ${projectId}...`);
            const artifactCreatedAt = await getArtifactInfo(projectId);

            if (syncData[projectId] === artifactCreatedAt) {
                console.log(
                    `Project ${projectId} data has not changed, skipping download and extraction.`
                );
                continue;
            }

            console.log(
                `Project ${projectId} data has been updated, downloading...`
            );
            const zipPath = path.join(
                tmpDir,
                `project_${projectId}_artifact.zip`
            );
            const unzipDir = path.join(tmpDir, `project_${projectId}_artifact`);

            await downloadZip(projectId, zipPath);

            console.log(
                `Files for project ${projectId} downloaded to ${zipPath}, starting extraction...`
            );
            await unzipFile(zipPath, unzipDir);

            await copyToProjectDirectory(unzipDir, langMap[projectId]);

            syncData[projectId] = artifactCreatedAt;
        } catch (error) {
            console.error(
                `Error processing project ${projectId}:`,
                error.message
            );
        }
    }

    await saveSyncData(syncData);
    console.log("All projects processed, sync data updated.");
})();
