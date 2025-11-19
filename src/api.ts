import fetch from "node-fetch";
import FormData from "form-data";
import { ArtifactInfo, FileItem, JobInfo, ProjectId } from "./types.js";

const API_BASE = "https://paratranz.cn/api";

export class ParaTranzApi {
  constructor(private token: string) {}

  private headers() {
    return { Authorization: this.token } as Record<string, string>;
  }

  async getArtifact(projectId: ProjectId): Promise<ArtifactInfo> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/artifacts`, {
      headers: this.headers(),
    });
    if (!res.ok)
      throw new Error(`getArtifact ${projectId} failed ${res.status}`);
    return (await res.json()) as ArtifactInfo;
  }

  async triggerExport(projectId: ProjectId): Promise<JobInfo> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/artifacts`, {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok)
      throw new Error(`triggerExport ${projectId} failed ${res.status}`);
    return (await res.json()) as JobInfo;
  }

  async downloadArtifact(projectId: ProjectId): Promise<NodeJS.ReadableStream> {
    const url = `${API_BASE}/projects/${projectId}/artifacts/download`;
    const res = await fetch(url, {
      headers: this.headers(),
      redirect: "follow",
    });
    if (!res.ok)
      throw new Error(
        `downloadArtifact ${projectId} failed ${res.status} ${res.statusText}`
      );
    const finalUrl = res.url;
    const contentLength = res.headers.get("content-length");
    const disposition = res.headers.get("content-disposition");
    console.log(
      `[${projectId}] GET ${url} -> ${finalUrl} (${
        contentLength || "?"
      } bytes) ${disposition || ""}`
    );
    return res.body as unknown as NodeJS.ReadableStream;
  }

  async listFiles(projectId: ProjectId): Promise<FileItem[]> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`listFiles ${projectId} failed ${res.status}`);
    return (await res.json()) as FileItem[];
  }

  async getFile(projectId: ProjectId, fileId: number): Promise<FileItem> {
    const res = await fetch(
      `${API_BASE}/projects/${projectId}/files/${fileId}`,
      {
        headers: this.headers(),
      }
    );
    if (!res.ok) throw new Error(`getFile ${fileId} failed ${res.status}`);
    return (await res.json()) as FileItem;
  }

  async createFile(
    projectId: ProjectId,
    filePath: string,
    fileName: string,
    buffer: Buffer
  ): Promise<{ file: FileItem }> {
    const fd = new FormData();
    fd.append("file", buffer, {
      filename: fileName,
      contentType: "application/json",
    });
    // If need upload to a path, ParaTranz supports "path" field
    const pathOnly = filePath.endsWith("/")
      ? filePath
      : filePath
      ? filePath + "/"
      : "";
    if (pathOnly) fd.append("path", pathOnly);

    const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
      method: "POST",
      headers: { Authorization: this.token, ...fd.getHeaders() },
      body: fd as any,
    });
    if (!res.ok) throw new Error(`createFile failed ${res.status}`);
    return (await res.json()) as { file: FileItem };
  }

  async updateFile(
    projectId: ProjectId,
    fileId: number,
    buffer: Buffer,
    fileName: string
  ): Promise<FileItem> {
    const fd = new FormData();
    fd.append("file", buffer, {
      filename: fileName,
      contentType: "application/json",
    });

    const res = await fetch(
      `${API_BASE}/projects/${projectId}/files/${fileId}`,
      {
        method: "POST",
        headers: { Authorization: this.token, ...fd.getHeaders() },
        body: fd as any,
      }
    );
    if (!res.ok) throw new Error(`updateFile failed ${res.status}`);
    return (await res.json()) as FileItem;
  }

  async updateFileTranslation(
    projectId: ProjectId,
    fileId: number,
    buffer: Buffer,
    fileName: string,
    force = false
  ) {
    const fd = new FormData();
    fd.append("file", buffer, {
      filename: fileName,
      contentType: "application/json",
    });
    if (force) fd.append("force", "true");

    const res = await fetch(
      `${API_BASE}/projects/${projectId}/files/${fileId}/translation`,
      {
        method: "POST",
        headers: { Authorization: this.token, ...fd.getHeaders() },
        body: fd as any,
      }
    );
   
    if (!res.ok) {
      console.log(await res.text());
      throw new Error(`updateFileTranslation failed ${res.status}`);
    }
    return (await res.json()) as FileItem;
  }

  async deleteFile(projectId: ProjectId, fileId: number): Promise<void> {
    const res = await fetch(
      `${API_BASE}/projects/${projectId}/files/${fileId}`,
      {
        method: "DELETE",
        headers: this.headers(),
      }
    );
    if (!res.ok) throw new Error(`deleteFile failed ${res.status}`);
  }
}
