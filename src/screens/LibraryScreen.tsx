// src/screens/LibraryScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import RNFS from "react-native-fs";
import NetInfo from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";

import {
  fetchAvailableVersions,
  fetchOfflineZipUrl,
  headZipMeta,
  PythonVersion,
} from "../services/pythonDocs";

import {
  getDownloadedMap,
  setDownloadedMap,
  DownloadedMap,
  getCachedVersions,
  setCachedVersions,
} from "../services/storage";

import {
  downloadZip,
  findIndexHtml,
  unzipDocs,
  versionRootDir,
  ensureDir,
  docsRoot,
} from "../services/download";

import { maybeShowInterstitial } from "../services/interstitial";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

const MANIFEST_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function isOnline(net: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) {
  // Some Android devices report isInternetReachable as null initially.
  // Treat "not explicitly false" as OK when connected.
  return !!net.isConnected && net.isInternetReachable !== false;
}

function stableKey(v: PythonVersion) {
  return `${v.slug}|${v.pageUrl ?? ""}|${v.zipUrl ?? ""}|${v.sha ?? ""}|${v.ref ?? ""}`;
}

function sameVersions(a: PythonVersion[], b: PythonVersion[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (stableKey(a[i]) !== stableKey(b[i])) return false;
  }
  return true;
}

export default function LibraryScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [versions, setVersions] = useState<PythonVersion[]>([]);
  const [downloaded, setDownloaded] = useState<DownloadedMap>({});

  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const data = useMemo(() => versions, [versions]);

  // keep background sync from overlapping + throttle it
  const syncingRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  async function syncManifestIfNeeded() {
    const now = Date.now();
    if (now - lastSyncAtRef.current < MANIFEST_SYNC_MIN_INTERVAL_MS) return;
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const v = await fetchAvailableVersions(); // manifest-first in your service
      const cached = await getCachedVersions();

      if (!cached || !sameVersions(cached.versions, v)) {
        setVersions(v);
        await setCachedVersions(v);
      }

      lastSyncAtRef.current = now;
    } catch {
      // ignore; keep cached list
    } finally {
      syncingRef.current = false;
    }
  }

  async function loadOfflineFirst() {
    // Always load downloaded docs map (works offline)
    const dl = await getDownloadedMap();
    setDownloaded(dl);

    // Load cached versions list (works offline)
    const cached = await getCachedVersions();
    if (cached?.versions?.length) {
      setVersions(cached.versions);
      return { hadCache: true };
    }

    // No cache yet: only then try network (first-run requirement)
    const net = await NetInfo.fetch();
    const online = isOnline(net);

    if (!online) {
      // Offline + no cache: still show downloaded items if any
      if (Object.keys(dl).length > 0) {
        const fallback: PythonVersion[] = Object.keys(dl).map((slug) => ({
          slug,
          pageUrl:
            slug === "3"
              ? "https://docs.python.org/3/"
              : slug === "2.6"
                ? "https://docs.python.org/release/2.6/"
                : `https://docs.python.org/${slug}/`,
        }));
        setVersions(fallback);
      } else {
        setVersions([]);
      }
      return { hadCache: false, needsInternet: true };
    }

    // Online first run: fetch versions (from manifest) and cache them
    const v = await fetchAvailableVersions();
    setVersions(v);
    await setCachedVersions(v);
    return { hadCache: false, needsInternet: false };
  }

  useEffect(() => {
    let unsub: null | (() => void) = null;

    (async () => {
      try {
        const res = await loadOfflineFirst();

        // auto-update manifest whenever we have internet (no pull-to-refresh required)
        unsub = NetInfo.addEventListener((net) => {
          if (isOnline(net)) {
            syncManifestIfNeeded(); // fire-and-forget
          }
        });

        // also try once on launch if already online
        const net = await NetInfo.fetch();
        if (isOnline(net)) {
          syncManifestIfNeeded();
        }

        if ((res as any).needsInternet) {
          Alert.alert(
            "First run needs internet",
            "Connect to the internet once to load available Python versions and download docs. After you download a version, it works fully offline."
          );
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(slug: string) {
    const info = downloaded[slug];
    if (!info) return;
    navigation.navigate("Reader", { versionSlug: slug, indexPath: info.indexPath });
  }

  async function download(item: PythonVersion) {
    const slug = item.slug;

    try {
      // Internet is required for downloads
      const net = await NetInfo.fetch();
      const online = isOnline(net);
      if (!online) {
        Alert.alert("Offline", "You’re offline. Connect to the internet to download this version.");
        return;
      }

      setBusySlug(slug);
      setProgress(0);

      // Prefer manifest-provided zipUrl (repo-built zips + dev)
      // Fallback to fetchOfflineZipUrl if missing.
      const zipUrl = item.zipUrl ?? (await fetchOfflineZipUrl(slug));

      if (!zipUrl) {
        Alert.alert("Not available", `No offline zip found for "${slug}".`);
        return;
      }

      let meta: { etag?: string; lastModified?: string } = {};
      try {
        meta = await headZipMeta(zipUrl);
      } catch {}

      await ensureDir(docsRoot());
      const root = versionRootDir(slug);
      await ensureDir(root);

      const zipPath = `${root}/docs.zip`;
      await downloadZip(zipUrl, zipPath, setProgress);
      await unzipDocs(zipPath, root);

      try {
        await RNFS.unlink(zipPath);
      } catch {}

      const indexPath = await findIndexHtml(root);

      const next: DownloadedMap = {
        ...downloaded,
        [slug]: {
          indexPath,
          downloadedAt: Date.now(),
          zipUrl,
          etag: meta.etag,
          lastModified: meta.lastModified,
          sha: item.sha,
          ref: item.ref,
        },
      };

      setDownloaded(next);
      await setDownloadedMap(next);

      navigation.navigate("Reader", { versionSlug: slug, indexPath });
    } catch (e: any) {
      Alert.alert("Download error", e?.message ?? "Failed");
    } finally {
      setBusySlug(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      const dl = await getDownloadedMap();
      setDownloaded(dl);

      const cached = await getCachedVersions();
      if (cached?.versions?.length) {
        setVersions(cached.versions);
      } else {
        await loadOfflineFirst();
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  if (data.length === 0 && Object.keys(downloaded).length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>No docs yet</Text>
        <Text style={{ marginTop: 10, textAlign: "center", color: "#666" }}>
          Connect to the internet once to load versions and download a Python docs set. After downloading, everything works offline.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(i) => i.slug}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#eeeeeeff" }} />}
        renderItem={({ item }) => {
          const isDownloaded = !!downloaded[item.slug];
          const isBusy = busySlug === item.slug;

          return (
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: "600" }}>{item.slug}</Text>
              <Text style={{ color: "#666", marginTop: 4 }}>
                {isDownloaded ? "Downloaded" : "Not downloaded"}
              </Text>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                {isDownloaded && (
                  <TouchableOpacity
                    onPress={() => {
                      maybeShowInterstitial(); // do not await; do not block
                      open(item.slug);
                    }}
                    style={{ padding: 10, backgroundColor: "#d1fae5", borderRadius: 8 }}
                  >
                    <Text>Open</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  disabled={!!busySlug}
                  onPress={() => {
                    maybeShowInterstitial(); // do not await; do not block
                    download(item);
                  }}
                  style={{
                    padding: 10,
                    backgroundColor: isBusy ? "#ddd" : "#fff7ed",
                    borderRadius: 8,
                    opacity: !!busySlug && !isBusy ? 0.5 : 1,
                  }}
                >
                  <Text>{isBusy ? "Downloading…" : isDownloaded ? "Re-download" : "Download"}</Text>
                </TouchableOpacity>
              </View>

              {isBusy && (
                <Text style={{ marginTop: 8, color: "#444" }}>
                  {Math.round(progress * 100)}%
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
