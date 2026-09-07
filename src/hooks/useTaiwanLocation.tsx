import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { TaiwanLocation } from '@/constants/taiwanLocations';
import {
    findNearestTaiwanLocation,
    findTaiwanLocation,
    findTaiwanLocationByAqiSiteName,
    findTaiwanLocationByWeatherName,
    taiwanLocationCookieName,
} from '@/constants/taiwanLocations';
import { isBrowser } from '@/utils/browserEnv';

const LOCATION_CHANGE_EVENT = 'homepage-location-change';
const LOCATION_STORAGE_KEY = 'homepage_location_id';
const LEGACY_AQI_SITE_STORAGE_KEY = 'aqi_site';
const LEGACY_WEATHER_LOCATION_STORAGE_KEY = 'weather_location';
const locationCookieMaxAgeSeconds = 60 * 60 * 24 * 365;
const locationSyncTimeout = 10_000;
const TRACKING_STORAGE_KEY = 'homepage_location_tracking';
const trackingListeners = new Set<() => void>();
const initialTrackingState = {
    enabled: false,
    syncing: false,
    failed: false,
    updatedAt: undefined as number | undefined,
};
let trackingState = initialTrackingState;
let watchId: number | undefined;
let watchGeneration = 0;

function notifyTracking() {
    for (const listener of trackingListeners) {
        listener();
    }
}

function stopWatching() {
    watchGeneration++;
    if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
    }
    watchId = undefined;
}

function publishLocation(location: TaiwanLocation) {
    globalThis.localStorage.setItem(LOCATION_STORAGE_KEY, location.id);
    writeLocationCookie(location.id);
    globalThis.dispatchEvent(
        new CustomEvent(LOCATION_CHANGE_EVENT, { detail: location })
    );
}

function startWatching() {
    if (
        watchId !== undefined ||
        !trackingState.enabled ||
        trackingListeners.size === 0
    ) {
        return;
    }
    if (!('geolocation' in navigator)) {
        setLocationTracking(false);
        return;
    }
    watchGeneration++;
    const generation = watchGeneration;
    trackingState = { ...trackingState, syncing: true, failed: false };
    notifyTracking();
    watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
            if (generation !== watchGeneration) {
                return;
            }
            const location = findNearestTaiwanLocation(
                coords.latitude,
                coords.longitude
            );
            if (getStoredLocation().id !== location.id) {
                publishLocation(location);
            }
            trackingState = {
                ...trackingState,
                syncing: false,
                failed: false,
                updatedAt: Date.now(),
            };
            notifyTracking();
        },
        (error) => {
            if (generation !== watchGeneration) {
                return;
            }
            if (error.code === error.PERMISSION_DENIED) {
                setLocationTracking(false);
            }
            trackingState = { ...trackingState, syncing: false, failed: true };
            notifyTracking();
        },
        { maximumAge: 0, timeout: locationSyncTimeout }
    );
}

function setLocationTracking(enabled: boolean) {
    globalThis.localStorage.setItem(TRACKING_STORAGE_KEY, String(enabled));
    trackingState = {
        ...trackingState,
        enabled,
        syncing: false,
        failed: false,
    };
    if (enabled) {
        startWatching();
    } else {
        stopWatching();
    }
    notifyTracking();
}

function onTrackingStorage(event: StorageEvent) {
    if (event.key === TRACKING_STORAGE_KEY || event.key === null) {
        setLocationTracking(
            globalThis.localStorage.getItem(TRACKING_STORAGE_KEY) === 'true'
        );
    }
}

function subscribeTracking(listener: () => void) {
    trackingListeners.add(listener);
    if (trackingListeners.size === 1) {
        globalThis.addEventListener('storage', onTrackingStorage);
        trackingState = {
            ...trackingState,
            enabled:
                globalThis.localStorage.getItem(TRACKING_STORAGE_KEY) ===
                'true',
        };
        startWatching();
    }
    return () => {
        trackingListeners.delete(listener);
        if (trackingListeners.size === 0) {
            stopWatching();
            globalThis.removeEventListener('storage', onTrackingStorage);
        }
    };
}

const getTrackingSnapshot = () => trackingState;
const getServerTrackingSnapshot = () => initialTrackingState;
const unsupportedGeolocationPermission = 'unsupported';

export type GeolocationPermissionState =
    | PermissionState
    | typeof unsupportedGeolocationPermission;

function readJson(key: string): unknown {
    if (!isBrowser()) {
        return undefined;
    }

    const value = globalThis.localStorage.getItem(key);

    if (value === null) {
        return undefined;
    }

    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
}

function getLegacyWeatherName(): string | undefined {
    const savedLocation = readJson(LEGACY_WEATHER_LOCATION_STORAGE_KEY);

    if (typeof savedLocation !== 'object' || savedLocation === null) {
        return undefined;
    }

    const location = savedLocation as {
        label?: unknown;
        name?: unknown;
    };

    if (typeof location.name === 'string') {
        return location.name;
    }

    if (typeof location.label === 'string') {
        return location.label.split(',').at(0);
    }

    return undefined;
}

interface UseTaiwanLocationOptions {
    hasInitialLocationCookie?: boolean;
    initialLocationId?: string;
}

function getStoredLocation(): TaiwanLocation {
    if (!isBrowser()) {
        return findTaiwanLocation(undefined);
    }

    const savedLocation = globalThis.localStorage.getItem(LOCATION_STORAGE_KEY);

    if (savedLocation !== null) {
        return findTaiwanLocation(savedLocation);
    }

    const legacyAqiLocation = findTaiwanLocationByAqiSiteName(
        globalThis.localStorage.getItem(LEGACY_AQI_SITE_STORAGE_KEY)
    );

    if (legacyAqiLocation !== undefined) {
        return legacyAqiLocation;
    }

    return (
        findTaiwanLocationByWeatherName(getLegacyWeatherName()) ??
        findTaiwanLocation(undefined)
    );
}

function writeLocationCookie(locationId: string) {
    const secureAttribute =
        globalThis.location.protocol === 'https:' ? '; Secure' : '';

    // eslint-disable-next-line unicorn/no-document-cookie -- Cookie Store API is not available in all target browsers.
    globalThis.document.cookie = `${taiwanLocationCookieName}=${encodeURIComponent(
        locationId
    )}; Path=/; Max-Age=${locationCookieMaxAgeSeconds}; SameSite=Lax${secureAttribute}`;
}

function getLocationFromEvent(event: Event): TaiwanLocation | undefined {
    if (
        !(event instanceof CustomEvent) ||
        typeof event.detail !== 'object' ||
        event.detail === null
    ) {
        return undefined;
    }

    const { id } = event.detail as { id?: unknown };

    return typeof id === 'string' ? findTaiwanLocation(id) : undefined;
}

export const useTaiwanLocation = ({
    hasInitialLocationCookie,
    initialLocationId,
}: UseTaiwanLocationOptions = {}): {
    selectedLocation: TaiwanLocation;
    geolocationPermission: GeolocationPermissionState;
    isGeolocationAvailable: boolean;
    isSyncingLocation: boolean;
    lastLocationSyncSucceededAt: number | undefined;
    isTrackingLocation: boolean;
    locationTrackingFailed: boolean;
    toggleLocationTracking: () => void;
    selectLocationId: (locationId: string) => void;
    syncCurrentLocation: () => void;
} => {
    const [selectedLocation, setSelectedLocation] = useState(() =>
        findTaiwanLocation(initialLocationId)
    );
    const [geolocationPermission, setGeolocationPermission] =
        useState<GeolocationPermissionState>(unsupportedGeolocationPermission);
    const tracking = useSyncExternalStore(
        subscribeTracking,
        getTrackingSnapshot,
        getServerTrackingSnapshot
    );
    const selectLocation = useCallback((location: TaiwanLocation) => {
        publishLocation(location);
        setSelectedLocation(location);
    }, []);
    const selectLocationId = useCallback(
        (locationId: string) => {
            setLocationTracking(false);
            selectLocation(findTaiwanLocation(locationId));
        },
        [selectLocation]
    );
    const syncCurrentLocation = useCallback(() => {
        setLocationTracking(true);
    }, []);
    const toggleLocationTracking = useCallback(() => {
        setLocationTracking(!trackingState.enabled);
    }, []);

    useEffect(() => {
        if (hasInitialLocationCookie === true) {
            globalThis.localStorage.setItem(
                LOCATION_STORAGE_KEY,
                selectedLocation.id
            );
            return;
        }

        const storedLocation = getStoredLocation();

        if (storedLocation.id !== selectedLocation.id) {
            selectLocation(storedLocation);
            return;
        }

        writeLocationCookie(selectedLocation.id);
    }, [hasInitialLocationCookie, selectLocation, selectedLocation]);

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGeolocationPermission(unsupportedGeolocationPermission);
            return undefined;
        }

        setGeolocationPermission('prompt');

        if (!('permissions' in navigator)) {
            return undefined;
        }

        let permissionStatus: PermissionStatus | undefined;
        let isSubscribed = true;
        const updatePermission = () => {
            if (permissionStatus !== undefined) {
                setGeolocationPermission(permissionStatus.state);
                if (
                    permissionStatus.state === 'denied' &&
                    trackingState.enabled
                ) {
                    setLocationTracking(false);
                }
            }
        };

        navigator.permissions
            .query({ name: 'geolocation' })
            .then((status) => {
                if (!isSubscribed) {
                    return;
                }

                permissionStatus = status;
                updatePermission();
                permissionStatus.addEventListener('change', updatePermission);
            })
            .catch(console.error);

        return () => {
            isSubscribed = false;
            permissionStatus?.removeEventListener('change', updatePermission);
        };
    }, []);

    useEffect(() => {
        const onLocationChange = (event: Event) => {
            const location = getLocationFromEvent(event);

            if (location !== undefined) {
                setSelectedLocation(location);
            }
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key === LOCATION_STORAGE_KEY || event.key === null) {
                setSelectedLocation(getStoredLocation());
            }
        };
        globalThis.addEventListener('storage', onStorage);
        globalThis.addEventListener(LOCATION_CHANGE_EVENT, onLocationChange);
        return () => {
            globalThis.removeEventListener('storage', onStorage);
            globalThis.removeEventListener(
                LOCATION_CHANGE_EVENT,
                onLocationChange
            );
        };
    }, []);

    return {
        selectedLocation,
        geolocationPermission,
        isGeolocationAvailable: geolocationPermission !== 'unsupported',
        isSyncingLocation: tracking.syncing,
        lastLocationSyncSucceededAt: tracking.updatedAt,
        isTrackingLocation: tracking.enabled,
        locationTrackingFailed: tracking.failed,
        toggleLocationTracking,
        selectLocationId,
        syncCurrentLocation,
    };
};
