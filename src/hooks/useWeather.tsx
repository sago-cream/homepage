import { useCallback, useEffect, useRef, useState } from 'react';

import type { TaiwanLocation } from '@/constants/taiwanLocations';
import type { GeolocationPermissionState } from '@/hooks/useTaiwanLocation';
import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { WeatherData } from '@/types/environment';
import { writeStorageValue } from '@/utils/browserStorage';
import { isWeatherData, readEnvironmentCache } from '@/utils/environmentCache';
import type { EnvironmentCache } from '@/utils/environmentCache';

type CachedWeather = EnvironmentCache<WeatherData>;

interface UseWeatherOptions {
    hasInitialLocationCookie?: boolean;
    initialLocationId?: string;
    initialWeather?: WeatherData;
}

const BASE_API_URL = '/api/weather';
const WEATHER_CACHE_KEY_PREFIX = 'weather_cache_cwa_v1';
const weatherRequests = new Map<string, Promise<WeatherData | undefined>>();

function getWeatherCacheKey(locationId: string): string {
    return `${WEATHER_CACHE_KEY_PREFIX}_${locationId}`;
}

const getCachedWeather = (
    locationId: string,
    options: { allowStale?: boolean } = {}
): CachedWeather | undefined =>
    readEnvironmentCache(
        getWeatherCacheKey(locationId),
        locationId,
        isWeatherData,
        options
    );

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

        const data: unknown = await res.json();
        if (!isWeatherData(data)) {
            throw new Error('Invalid weather data');
        }
        return data;
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
            writeStorageValue(
                getWeatherCacheKey(location.id),
                JSON.stringify(cache)
            );
            setCachedWeather(cache);
        },
        []
    );

    useEffect(() => {
        const initialCache = initialCachedWeatherRef.current;
        initialCachedWeatherRef.current = undefined;
        const cached = getCachedWeather(selectedLocation.id);

        if (cached !== undefined) {
            setCachedWeather(cached);
            setIsLoading(false);
            return undefined;
        }

        if (initialCache?.locationId === selectedLocation.id) {
            updateCache(initialCache.data, selectedLocation);
            setIsLoading(false);
            return undefined;
        }

        setCachedWeather(
            getCachedWeather(selectedLocation.id, { allowStale: true })
        );
        setIsLoading(true);
        let isCurrent = true;
        const load = async () => {
            try {
                const data = await requestWeather(selectedLocation);
                if (isCurrent && data !== undefined) {
                    updateCache(data, selectedLocation);
                }
            } catch (error) {
                if (isCurrent) {
                    console.error(error);
                }
            } finally {
                if (isCurrent) {
                    setIsLoading(false);
                }
            }
        };
        load().catch(console.error);
        return () => {
            isCurrent = false;
        };
    }, [selectedLocation, updateCache]);

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
