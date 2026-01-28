import RNFS from "react-native-fs";
import { unzip } from "react-native-zip-archive";

export function docsRoot() {
  return `${RNFS.DocumentDirectoryPath}/python-docs`;
}

export function versionRootDir(versionSlug: string) {
  return `${docsRoot()}/${versionSlug}`;
}

export async function ensureDir(path: string) {
  const exists = await RNFS.exists(path);
  if (!exists) await RNFS.mkdir(path);
}

export async function resetDir(dir: string) {
  const exists = await RNFS.exists(dir);
  if (exists) await RNFS.unlink(dir);
  await ensureDir(dir);
}

export async function downloadZip(
  zipUrl: string,
  destPath: string,
  onProgress?: (p: number) => void
) {
  const job = RNFS.downloadFile({
    fromUrl: zipUrl,
    toFile: destPath,
    progressInterval: 250,
    progress: (data) => {
      if (!onProgress) return;
      if (data.contentLength > 0) onProgress(data.bytesWritten / data.contentLength);
    },
  });

  const res = await job.promise;
  if (res.statusCode && res.statusCode >= 400) {
    throw new Error(`Download failed: HTTP ${res.statusCode}`);
  }
}

export async function unzipDocs(zipPath: string, outDir: string) {
  await ensureDir(outDir);
  return unzip(zipPath, outDir);
}

export async function findIndexHtml(root: string): Promise<string> {
  const direct = `${root}/index.html`;
  if (await RNFS.exists(direct)) return direct;

  const items = await RNFS.readDir(root);
  for (const it of items) {
    if (it.isDirectory()) {
      const candidate = `${it.path}/index.html`;
      if (await RNFS.exists(candidate)) return candidate;
    }
  }
  throw new Error("index.html not found");
}

export async function findSearchHtml(root: string): Promise<string | null> {
  const direct = `${root}/search.html`;
  if (await RNFS.exists(direct)) return direct;

  const items = await RNFS.readDir(root);
  for (const it of items) {
    if (it.isDirectory()) {
      const candidate = `${it.path}/search.html`;
      if (await RNFS.exists(candidate)) return candidate;
    }
  }
  return null;
}
