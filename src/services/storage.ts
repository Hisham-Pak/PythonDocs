// src/services/storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PythonVersion } from "./pythonDocs";

// bumped keys because cached versions now include zipUrl/sha/ref
const DOWNLOADED_KEY = "downloaded_versions_v2";
const VERSIONS_CACHE_KEY = "versions_cache_v2";

export type DownloadedMap = Record<
  string,
  {
    indexPath: string;
    downloadedAt: number;
    zipUrl?: string;
    etag?: string;
    lastModified?: string;

    // optional: store build identity (useful for "Update available")
    sha?: string;
    ref?: string;
  }
>;

export type CachedVersions = {
  savedAt: number;
  versions: PythonVersion[];
};

export async function getDownloadedMap(): Promise<DownloadedMap> {
  const raw = await AsyncStorage.getItem(DOWNLOADED_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function setDownloadedMap(map: DownloadedMap) {
  await AsyncStorage.setItem(DOWNLOADED_KEY, JSON.stringify(map));
}

export async function getCachedVersions(): Promise<CachedVersions | null> {
  const raw = await AsyncStorage.getItem(VERSIONS_CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedVersions(versions: PythonVersion[]) {
  const payload: CachedVersions = { savedAt: Date.now(), versions };
  await AsyncStorage.setItem(VERSIONS_CACHE_KEY, JSON.stringify(payload));
}

const LAST_URL_PREFIX = "docs_last_url_v1:";

export async function getLastUrl(versionSlug: string): Promise<string | null> {
  return (await AsyncStorage.getItem(LAST_URL_PREFIX + versionSlug)) ?? null;
}

export async function setLastUrl(versionSlug: string, url: string) {
  await AsyncStorage.setItem(LAST_URL_PREFIX + versionSlug, url);
}

const BOOKMARKS_PREFIX = "docs_bookmarks_v1:";

export type Bookmark = {
  id: string;          // unique (we'll use url)
  url: string;         // file://...
  title?: string;      // from <title> or injected label
  createdAt: number;
};

export async function getBookmarks(versionSlug: string): Promise<Bookmark[]> {
  const raw = await AsyncStorage.getItem(BOOKMARKS_PREFIX + versionSlug);
  return raw ? JSON.parse(raw) : [];
}

export async function setBookmarks(versionSlug: string, bookmarks: Bookmark[]) {
  await AsyncStorage.setItem(BOOKMARKS_PREFIX + versionSlug, JSON.stringify(bookmarks));
}

export async function addBookmark(versionSlug: string, bm: Bookmark) {
  const list = await getBookmarks(versionSlug);
  if (list.some((x) => x.id === bm.id)) return; // de-dupe
  const next = [bm, ...list].slice(0, 200); // cap list if you want
  await setBookmarks(versionSlug, next);
}

export async function removeBookmark(versionSlug: string, id: string) {
  const list = await getBookmarks(versionSlug);
  await setBookmarks(versionSlug, list.filter((x) => x.id !== id));
}

export async function isBookmarked(versionSlug: string, id: string): Promise<boolean> {
  const list = await getBookmarks(versionSlug);
  return list.some((x) => x.id === id);
}
