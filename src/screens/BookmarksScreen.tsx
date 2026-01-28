// src/screens/BookmarksScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Alert } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { getBookmarks, removeBookmark, Bookmark } from "../services/storage";

type Props = NativeStackScreenProps<RootStackParamList, "Bookmarks">;

export default function BookmarksScreen({ route, navigation }: Props) {
  const { versionSlug, indexPath } = route.params;
  const [items, setItems] = useState<Bookmark[]>([]);

  async function load() {
    const list = await getBookmarks(versionSlug);
    setItems(list);
  }

  useEffect(() => {
    navigation.setOptions({ title: `Bookmarks — Python ${versionSlug}` });
    load().catch(() => {});
  }, [versionSlug, navigation]);

  function open(url: string) {
    navigation.navigate("Reader", { versionSlug, indexPath, openUrl: url } as any);
  }

  async function del(id: string) {
    await removeBookmark(versionSlug, id);
    load();
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, padding: 18, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>No bookmarks</Text>
        <Text style={{ marginTop: 10, color: "#666", textAlign: "center" }}>
          Add bookmarks from the Reader toolbar.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#eee" }} />}
        renderItem={({ item }) => (
          <View style={{ padding: 14 }}>
            <Text style={{ fontWeight: "600" }} numberOfLines={1}>
              {item.title || item.url}
            </Text>
            <Text style={{ color: "#666", marginTop: 4 }} numberOfLines={1}>
              {item.url}
            </Text>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => open(item.url)}
                style={{ padding: 10, backgroundColor: "#d1fae5", borderRadius: 8 }}
              >
                <Text>Open</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Remove bookmark?", item.title || item.url, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => del(item.id) },
                  ])
                }
                style={{ padding: 10, backgroundColor: "#fee2e2", borderRadius: 8 }}
              >
                <Text>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}
