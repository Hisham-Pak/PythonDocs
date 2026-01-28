import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { enableScreens } from "react-native-screens";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LibraryScreen from "./src/screens/LibraryScreen";
import ReaderScreen from "./src/screens/ReaderScreen";
import BookmarksScreen from "./src/screens/BookmarksScreen";
import { initAdsOnce } from "./src/services/interstitial";

enableScreens(true);

export type RootStackParamList = {
  Library: undefined;
  Reader: { versionSlug: string; indexPath: string; openUrl?: string };
  Bookmarks: { versionSlug: string; indexPath: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    initAdsOnce();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Library"
          component={LibraryScreen}
          options={{ title: "Python Docs" }}
        />
        <Stack.Screen name="Reader" component={ReaderScreen} />
        <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
