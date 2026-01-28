// src/services/pythonDocs.ts

export type PythonVersion = {
  slug: string;       // "dev", "3", "3.12", "2.7", "2.6", ...
  pageUrl: string;    // https://docs.python.org/<slug>/ (2.6 uses /release/2.6/)
  zipUrl?: string;    // direct zip url (from your manifest)
  sha?: string;       // commit SHA used to build (for update detection)
  ref?: string;       // "main" for dev, or tag like "v3.12.12"
};

type Manifest = {
  generatedAt: string;
  releaseTag: string;
  manifestUrl?: string;
  versions: PythonVersion[];
};

// ✅ configure these for your repo
const GH_OWNER = "Hisham-Pak";
const GH_REPO = "PythonDocs";
const GH_TAG = "offline-docs";

const MANIFEST_URL = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${GH_TAG}/manifest.json`;

// Optional fallback (if manifest is unavailable)
const DOCS_HOME = "https://docs.python.org/";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/**
 * Prefer manifest.json (authoritative: includes zipUrl/dev).
 * Fallback: scrape docs.python.org for slugs (no zipUrl info).
 */
export async function fetchAvailableVersions(): Promise<PythonVersion[]> {
  // 1) Prefer manifest
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      const m = (await res.json()) as Manifest;
      if (Array.isArray(m?.versions) && m.versions.length) {
        return m.versions;
      }
    }
  } catch {
    // ignore; fallback
  }

  // 2) Fallback: scrape homepage for version-like paths
  const res = await fetch(DOCS_HOME, { redirect: "follow" } as any);
  const html = await res.text();

  // match /3/, /3.12/, /2.7/ etc.
  const matches = html.matchAll(/\/((?:\d+(?:\.\d+)?)|dev)\//gi);

  const slugs = uniq(Array.from(matches, (m) => (m[1] || "").toLowerCase()))
    .filter(
      (s) =>
        s === "dev" ||
        s === "3" ||
        s === "2.6" ||
        s === "2.7" ||
        /^\d+\.\d+$/.test(s)
    )
    .sort((a, b) => {
      if (a === "dev") return -1;
      if (b === "dev") return 1;
      if (a === "3") return -1;
      if (b === "3") return 1;

      const [amaj, amin] = a.split(".").map((x) => Number(x));
      const [bmaj, bmin] = b.split(".").map((x) => Number(x));
      if (amaj !== bmaj) return bmaj - amaj;
      return (bmin || 0) - (amin || 0);
    });

  return slugs.map((slug) => ({
    slug,
    pageUrl:
      slug === "3"
        ? "https://docs.python.org/3/"
        : slug === "2.6"
          ? "https://docs.python.org/release/2.6/"
          : `https://docs.python.org/${slug}/`,
  }));
}

export async function fetchOfflineZipUrl(versionSlug: string): Promise<string | null> {
  // Try manifest first
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      const m = (await res.json()) as Manifest;
      const found = m?.versions?.find((v) => v.slug === versionSlug);
      if (found?.zipUrl) return found.zipUrl;
    }
  } catch {
    // ignore
  }

  // No safe generic fallback for Python zip naming (esp slug "3")
  return null;
}

export type RemoteZipMeta = {
  etag?: string;
  lastModified?: string;
};

export async function headZipMeta(zipUrl: string): Promise<RemoteZipMeta> {
  const res = await fetch(zipUrl, { method: "HEAD" });
  if (!res.ok) throw new Error(`HEAD failed (${res.status})`);

  return {
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };
}
