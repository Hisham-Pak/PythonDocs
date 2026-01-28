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

  const injectedBefore = `
  (function () {
    try {
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        // Ensure viewport
        var existing = document.querySelectorAll('meta[name="viewport"]');
        for (var i = 0; i < existing.length; i++) existing[i].remove();

        var meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
        head.appendChild(meta);
      }

      // REMOVE #sidebar (top doc or iframe doc)
      function removeSidebar(doc) {
        if (!doc) return;
        try {
          var sb = doc.getElementById('sidebar');
          if (sb && sb.parentNode) sb.parentNode.removeChild(sb);
        } catch (e) {}
      }

      // Force margin-right to 0 (inline styles)
      function killMarginRightInline(doc) {
        if (!doc) return;
        try {
          var nodes = doc.querySelectorAll('[style]');
          for (var i = 0; i < nodes.length; i++) {
            try {
              nodes[i].style.marginRight = '0px';
            } catch (e) {}
          }
        } catch (e) {}
      }

      // Helper to apply CSS to a document (top doc or iframe doc)
      function apply(doc) {
        if (!doc) return;

        removeSidebar(doc);

        var style = doc.createElement('style');
        style.type = 'text/css';
        style.appendChild(doc.createTextNode(\`
          html, body {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            overflow-x: hidden !important;
          }

          /* HARD HIDE sidebar */
          #sidebar { display: none !important; }

          /* Force margin-right to 0 everywhere */
          * { margin-right: 0 !important; }

          /* The big one: kill desktop min-width/fixed widths */
          * {
            max-width: 100% !important;
            min-width: 0 !important;
          }

          /* Force wrapping (even if theme used nowrap) */
          body, p, li, div, span, a, td, th {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          /* Images/media */
          img, video, iframe {
            max-width: 100% !important;
            height: auto !important;
          }

          /* Tables: scroll instead of pushing page wide */
          table {
            display: block !important;
            width: 100% !important;
            overflow-x: auto !important;
          }

          /* If your docs are Sphinx/RTD-ish, these often set fixed widths */
          .document, .content, .container, main,
          .wy-nav-content, .rst-content, .bd-content {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
        \`));

        (doc.head || doc.documentElement).appendChild(style);

        // Kill inline widths + margin-right
        var nodes = doc.querySelectorAll('[style]');
        for (var i = 0; i < nodes.length; i++) {
          try {
            nodes[i].style.maxWidth = '100%';
            nodes[i].style.minWidth = '0';
            nodes[i].style.whiteSpace = 'normal';
            nodes[i].style.marginRight = '0px';
          } catch (e) {}
        }
      }

      // Apply to top document
      apply(document);

      // Apply to same-origin iframes too (common in offline docs)
      function applyToIframes() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var idoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
            apply(idoc);
          } catch (e) {}
        }
      }

      applyToIframes();

      // Re-apply after load in case theme rewrites DOM
      setTimeout(applyToIframes, 300);
      setTimeout(applyToIframes, 1000);

      // Also re-remove sidebar and re-kill margin-right later (themes often re-add styles)
      setTimeout(function(){ removeSidebar(document); killMarginRightInline(document); }, 50);
      setTimeout(function(){ removeSidebar(document); killMarginRightInline(document); }, 300);
      setTimeout(function(){ removeSidebar(document); killMarginRightInline(document); }, 1000);

      // MutationObserver: keep enforcing if theme changes DOM later
      try {
        var obs = new MutationObserver(function () {
          try {
            removeSidebar(document);
            killMarginRightInline(document);
            applyToIframes();
          } catch (e) {}
        });
        obs.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
      } catch (e) {}

    } catch (e) {}
    return true;
  })();
  `;

  const injectedAfter = `
  (function() {
    try {
      // remove sidebar again after load (some themes add it late)
      try {
        var sb = document.getElementById('sidebar');
        if (sb && sb.parentNode) sb.parentNode.removeChild(sb);
      } catch (e) {}

      // kill inline margin-right again after load
      try {
        var nodes = document.querySelectorAll('[style]');
        for (var i=0; i<nodes.length; i++) {
          try { nodes[i].style.marginRight = '0px'; } catch (e) {}
        }
      } catch (e) {}

      var style = document.createElement('style');
      style.type = 'text/css';
      style.appendChild(document.createTextNode(\`
        html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; }

        /* HARD HIDE sidebar */
        #sidebar { display: none !important; }

        /* Force margin-right to 0 everywhere */
        * { margin-right: 0 !important; }

        body * { max-width: 100% !important; }

        p, li, div, span, a, td, th {
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }

        pre, code {
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }

        table { display: block !important; width: 100% !important; overflow-x: auto !important; }
        img, video, iframe { max-width: 100% !important; height: auto !important; }
        .document, .content, .container, main, .wy-nav-content, .rst-content, .bd-content {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
        }
        .wy-nav-side, .bd-sidebar { display: none !important; }
      \`));
      (document.head || document.documentElement).appendChild(style);

      // Also try to kill "fixed width" inline styles (common in old docs)
      var all = document.querySelectorAll('[style]');
      for (var i=0; i<all.length; i++) {
        var s = all[i].getAttribute('style') || '';
        if (s.includes('width') || s.includes('white-space') || s.includes('margin-right')) {
          all[i].style.maxWidth = '100%';
          all[i].style.whiteSpace = 'normal';
          all[i].style.marginRight = '0px';
        }
      }
    } catch (e) {}
    true;
  })();
  `;

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
        injectedJavaScriptBeforeContentLoaded={injectedBefore}
        injectedJavaScript={injectedAfter}
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
