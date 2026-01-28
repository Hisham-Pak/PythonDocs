import AsyncStorage from "@react-native-async-storage/async-storage";
import mobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

const STORAGE_KEYS = {
  lastShownAt: "ads_interstitial_lastShownAt_v1",
};

const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

// ✅ Use test ads in dev to avoid account issues
const INTERSTITIAL_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : "ca-app-pub-1648050772922935/1109776303";

let initialized = false;
let interstitial: InterstitialAd | null = null;
let loaded = false;
let showing = false;

async function getLastShownAt(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.lastShownAt);
  return raw ? Number(raw) || 0 : 0;
}

async function setLastShownAt(ts: number) {
  await AsyncStorage.setItem(STORAGE_KEYS.lastShownAt, String(ts));
}

export async function initAdsOnce() {
  if (initialized) return;
  await mobileAds().initialize();
  initialized = true;
  preloadInterstitial();
}

export function preloadInterstitial() {
  if (!initialized) return;

  loaded = false;
  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    loaded = true;
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    showing = false;
    loaded = false;
    // Preload next one after close
    preloadInterstitial();
  });

  interstitial.addAdEventListener(AdEventType.ERROR, () => {
    showing = false;
    loaded = false;
    // Try again later — next call to maybeShowInterstitial can trigger preload too
  });

  interstitial.load();
}

/**
 * Call this on user actions (Open/Download click).
 * - Will show at most once per cooldown period.
 * - Does NOT block your navigation/download; it's "best-effort".
 */
export async function maybeShowInterstitial(): Promise<boolean> {
  try {
    if (!initialized) {
      // init lazily if caller forgot
      await initAdsOnce();
    }

    if (!interstitial) preloadInterstitial();

    if (showing) return false;

    const last = await getLastShownAt();
    const now = Date.now();

    // cooldown
    if (now - last < COOLDOWN_MS) return false;

    // only show if loaded
    if (!loaded || !interstitial) return false;

    showing = true;
    await setLastShownAt(now);
    interstitial.show();
    return true;
  } catch {
    return false;
  }
}
