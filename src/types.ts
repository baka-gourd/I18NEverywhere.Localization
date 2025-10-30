export type ProjectId = number;

export interface FileItem {
  id: number;
  name: string; // path/to/file.json
  project: number;
  createdAt: string;
  updatedAt: string;
  modifiedAt: string;
  total: number;
  translated: number;
  disputed: number;
  checked: number;
  reviewed: number;
  hidden: number;
  locked: number;
  words: number;
  hash: string;
}

export interface ArtifactInfo {
  id: number;
  createdAt: string;
}

export interface JobInfo {
  id: number;
  status: number; // 0 pending, 1 running, 2 success, -1 failed
  finishedAt?: string;
}

export interface SyncData {
  artifact: Record<string, string>; // projectId -> artifact createdAt
  localPush: Record<string, Record<string, number>>; // projectId -> relPath -> mtimeMs
}

export interface Config {
  token: string; // Bearer {TOKEN}
  projectIds: number[];
  langMap: Record<number, string>; // projectId -> locale dir name
  sourceLocale: string; // en-US
  baseDir: string; // project dir absolute
}
