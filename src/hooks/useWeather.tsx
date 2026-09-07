import { useCallback, useEffect, useRef, useState } from 'react';

import type { TaiwanLocation } from '@/constants/taiwanLocations';
import type { GeolocationPermissionState } from '@/hooks/useTaiwanLocation';
import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { WeatherData } from '@/types/environment';
import { isBrowser } from '@/utils/browserEnv';

interface CachedWeather {
    data: WeatherData;
    locationId: string;
    timestamp: number;
}

interface UseWeatherOptions {
    hasInitialLocationCookie?: boolean;
    initialLocationId?: string;
    initialWeather?: WeatherData;
}

const BASE_API_URL = '/api/weather';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const WEATHER_CACHE_KEY_PREFIX = 'weather_cache_cwa_v1';
const weatherRequests = new Map<string, Promise<WeatherData | undefined>>();

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

function isCacheFresh(timestamp: number, ttl: number): boolean {
    return Date.now() - timestamp < ttl;
}

function getWeatherCacheKey(locationId: string): string {
    return `${WEATHER_CACHE_KEY_PREFIX}_${locationId}`;
}

function getCachedWeather(
    locationId: string,
    { allowStale = false }: { allowStale?: boolean } = {}
): CachedWeather | undefined {
    const cached = readJson(getWeatherCacheKey(locationId)) as
        | CachedWeather
        | undefined;

    if (
        cached === undefined ||
        cached.locationId !== locationId ||
        (!allowStale && !isCacheFresh(cached.timestamp, CACHE_TTL))
    ) {
        return undefined;
    }

    return cached;
}

async function requestWeather(
    location: TaiwanLocation
): Promise<WeatherData | undefined> {
    const pendingRequest = weatherRequests.get(location.id);

    if (pendingRequest !== undefined) {
        return await pendingRequest;
    }

    const request = (async () => {
        const params = new URLSearchParams({
            lat: String(location.lat),
            lon: String(location.lon),
        });
        const res = await fetch(`${BASE_API_URL}?${params.toString()}`);

        if (res.status === 204) {
            return undefined;
        }

        if (!res.ok) {
            throw new Error('Failed to fetch weather data');
        }

        return (await res.json()) as WeatherData;
    })().finally(() => {
        weatherRequests.delete(location.id);
    });

    weatherRequests.set(location.id, request);
    return await request;
}

export const useWeatherWithInitialData = ({
    hasInitialLocationCookie,
    initialLocationId,
    initialWeather,
}: UseWeatherOptions): {
    weather: WeatherData | undefined;
    geolocationPermission: GeolocationPermissionState;
    isLoading: boolean;
    isGeolocationAvailable: boolean;
    isSyncingLocation: boolean;
    lastLocationSyncSucceededAt: number | undefined;
    selectedLocation: TaiwanLocation;
    syncCurrentLocation: () => void;
} => {
    const {
        selectedLocation,
        geolocationPermission,
        isGeolocationAvailable,
        isSyncingLocation,
        lastLocationSyncSucceededAt,
        syncCurrentLocation,
    } = useTaiwanLocation({
        hasInitialLocationCookie,
        initialLocationId,
    });
    const selectedLocationIdRef = useRef(selectedLocation.id);
    selectedLocationIdRef.current = selectedLocation.id;
    const initialCachedWeatherRef = useRef<CachedWeather | undefined>(
        initialWeather === undefined
            ? undefined
            : {
                  data: initialWeather,
                  locationId: selectedLocation.id,
                  timestamp: Date.now(),
              }
    );
    const [cachedWeather, setCachedWeather] = useState<
        CachedWeather | undefined
    >(() => initialCachedWeatherRef.current);
    const weather = cachedWeather?.data;
    const [isLoading, setIsLoading] = useState(false);

    const updateCache = useCallback(
        (data: WeatherData, location: TaiwanLocation) => {
            const cache: CachedWeather = {
                data,
                locationId: location.id,
                timestamp: Date.now(),
            };
            globalThis.localStorage.setItem(
                getWeatherCacheKey(location.id),
                JSON.stringify(cache)
            );
            setCachedWeather(cache);
        },
        []
    );

    const fetchWeather = useCallback(
        async (location: TaiwanLocation) => {
            setIsLoading(true);
            try {
                const data = await requestWeather(location);
                if (selectedLocationIdRef.current !== location.id) {
                    return;
                }

                if (data !== undefined) {
                    updateCache(data, location);
                    return;
                }

                const cached = getCachedWeather(location.id, {
                    allowStale: true,
                });

                if (cached !== undefined) {
                    setCachedWeather(cached);
                }
            } catch (error) {
                console.error(error);
            } finally {
                if (selectedLocationIdRef.current === location.id) {
                    setIsLoading(false);
                }
            }
        },
        [updateCache]
    );

    useEffect(() => {
        const cached = getCachedWeather(selectedLocation.id);

        if (cached !== undefined) {
            setCachedWeather(cached);
            setIsLoading(false);
            return;
        }

        if (
            initialCachedWeatherRef.current?.locationId === selectedLocation.id
        ) {
            updateCache(initialCachedWeatherRef.current.data, selectedLocation);
            initialCachedWeatherRef.current = undefined;
            setIsLoading(false);
            return;
        }

        setCachedWeather(undefined);
        const staleCached = getCachedWeather(selectedLocation.id, {
            allowStale: true,
        });

        if (staleCached !== undefined) {
            setCachedWeather(staleCached);
        }

        fetchWeather(selectedLocation).catch(console.error);
    }, [fetchWeather, selectedLocation, updateCache]);

    return {
        weather,
        geolocationPermission,
        isLoading,
        isGeolocationAvailable,
        isSyncingLocation,
        lastLocationSyncSucceededAt,
        selectedLocation,
        syncCurrentLocation,
    };
};
