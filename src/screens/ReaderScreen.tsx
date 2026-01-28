// src/screens/ReaderScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { WebView } from "react-native-webview";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { findSearchHtml, versionRootDir } from "../services/download";
import {
  getLastUrl,
  setLastUrl,
  addBookmark,
  removeBookmark,
  getBookmarks,
} from "../services/storage";

type Props = NativeStackScreenProps<RootStackParamList, "Reader">;

function toFileUrl(absPath: string) {
  return `file://${absPath}`;
}

export default function ReaderScreen({ route, navigation }: Props) {
  const { versionSlug, indexPath, openUrl } = route.params;

  const homeUrl = useMemo(() => toFileUrl(indexPath), [indexPath]);
  const [currentUrl, setCurrentUrl] = useState(homeUrl);
  const [searchPath, setSearchPath] = useState<string | null>(null);

  const [pageTitle, setPageTitle] = useState<string>("");
  const [bookmarked, setBookmarked] = useState(false);

  const [fullscreen, setFullscreen] = useState(false);

  const webRef = useRef<WebView>(null);

  async function syncBookmarked(url: string) {
    try {
      const list = await getBookmarks(versionSlug);
      setBookmarked(list.some((x) => x.id === url));
    } catch {
      setBookmarked(false);
    }
  }

  useEffect(() => {
    navigation.setOptions({ title: `Python ${versionSlug}` });

    (async () => {
      // Restore last page unless openUrl is provided
      try {
        if (openUrl) {
          setCurrentUrl(openUrl);
        } else {
          const last = await getLastUrl(versionSlug);
          setCurrentUrl(last || homeUrl);
        }
      } catch {
        setCurrentUrl(homeUrl);
      }

      // Find search.html if available
      try {
        const root = versionRootDir(versionSlug);
        const sp = await findSearchHtml(root);
        setSearchPath(sp);
      } catch {
        setSearchPath(null);
      }
    })();
  }, [versionSlug, navigation, homeUrl, openUrl]);

  useEffect(() => {
    syncBookmarked(currentUrl);
  }, [currentUrl, versionSlug]);

  function openSearch() {
    if (!searchPath) {
      Alert.alert(
        "Search not found",
        "This offline package did not include search.html."
      );
      return;
    }
    const url = toFileUrl(searchPath);
    setCurrentUrl(url);
    setLastUrl(versionSlug, url).catch(() => {});
  }

  function openHome() {
    const url = toFileUrl(indexPath);
    setCurrentUrl(url);
    setLastUrl(versionSlug, url).catch(() => {});
  }

  async function toggleBookmark() {
    try {
      const id = currentUrl; // use url as id
      if (bookmarked) {
        await removeBookmark(versionSlug, id);
        setBookmarked(false);
      } else {
        await addBookmark(versionSlug, {
          id,
          url: currentUrl,
          title: pageTitle || undefined,
          createdAt: Date.now(),
        });
        setBookmarked(true);
      }
    } catch (e: any) {
      Alert.alert("Bookmark error", e?.message ?? "Failed");
    }
  }

  function openBookmarks() {
    navigation.navigate("Bookmarks", { versionSlug, indexPath });
  }

  function toggleFullscreen() {
    setFullscreen((v) => !v);
  }

  return (
    <View style={{ flex: 1 }}>
      {!fullscreen && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            padding: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#eee",
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={openHome}
              style={{ padding: 8, backgroundColor: "#e8f0fe", borderRadius: 8 }}
            >
              <Text>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openSearch}
              style={{ padding: 8, backgroundColor: "#fff7ed", borderRadius: 8 }}
            >
              <Text>Search</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={openBookmarks}
              style={{ padding: 8, backgroundColor: "#eef2ff", borderRadius: 8 }}
            >
              <Text>Bookmarks</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleBookmark}
              style={{
                padding: 8,
                backgroundColor: bookmarked ? "#d1fae5" : "#f3f4f6",
                borderRadius: 8,
              }}
            >
              <Text>{bookmarked ? "Bookmarked ✓" : "Bookmark +"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleFullscreen}
              style={{ padding: 8, backgroundColor: "#fef3c7", borderRadius: 8 }}
            >
              <Text>Hide</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {fullscreen && (
        <View style={{ position: "absolute", top: 10, right: 10, zIndex: 999 }}>
          <TouchableOpacity
            onPress={toggleFullscreen}
            style={{ padding: 8, backgroundColor: "#fef3c7", borderRadius: 8 }}
          >
            <Text>Show</Text>
          </TouchableOpacity>
        </View>
      )}

      <WebView
        ref={webRef}
        source={{ uri: currentUrl }}
        originWhitelist={["*"]}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        onMessage={(ev) => {
          try {
            const msg = JSON.parse(ev.nativeEvent.data);
            if (msg?.type === "title") setPageTitle(String(msg.title || ""));
          } catch {}
        }}
        onNavigationStateChange={(nav) => {
          if (!nav?.url) return;
          setCurrentUrl(nav.url);
          setLastUrl(versionSlug, nav.url).catch(() => {});
        }}
      />
    </View>
  );
}
