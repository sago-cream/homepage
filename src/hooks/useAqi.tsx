import { useCallback, useEffect, useRef, useState } from 'react';

import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { AqiData } from '@/types/environment';
import { isBrowser } from '@/utils/browserEnv';

interface CachedAqi {
    data: AqiData;
    locationId: string;
    timestamp: number;
}

interface UseAqiOptions {
    hasInitialLocationCookie?: boolean;
    initialAqi?: AqiData;
    initialLocationId?: string;
}

const AQI_CACHE_KEY_PREFIX = 'aqi_cache';
const AQI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const BASE_API_URL = '/api/aqi';

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

function getAqiCacheKey(locationId: string): string {
    return `${AQI_CACHE_KEY_PREFIX}_${locationId}`;
}

function isCacheFresh(timestamp: number, ttl: number): boolean {
    return Date.now() - timestamp < ttl;
}

function getCachedAqi(
    locationId: string,
    { allowStale = false }: { allowStale?: boolean } = {}
): AqiData | undefined {
    const cached = readJson(getAqiCacheKey(locationId)) as
        | CachedAqi
        | undefined;

    if (
        cached === undefined ||
        cached.locationId !== locationId ||
        (!allowStale && !isCacheFresh(cached.timestamp, AQI_CACHE_TTL))
    ) {
        return undefined;
    }

    return cached.data;
}

export const useAqiWithInitialData = ({
    hasInitialLocationCookie,
    initialAqi,
    initialLocationId,
}: UseAqiOptions): {
    aqi: AqiData | undefined;
    isLoading: boolean;
    refreshAqi: () => void;
} => {
    const { selectedLocation } = useTaiwanLocation({
        hasInitialLocationCookie,
        initialLocationId,
    });
    const initialCachedAqiRef = useRef<CachedAqi | undefined>(
        initialAqi === undefined
            ? undefined
            : {
                  data: initialAqi,
                  locationId: selectedLocation.id,
                  timestamp: Date.now(),
              }
    );
    const [aqi, setAqi] = useState<AqiData | undefined>(
        () => initialCachedAqiRef.current?.data
    );
    const [isLoading, setIsLoading] = useState(false);

    const selectedLocationIdRef = useRef(selectedLocation.id);
    selectedLocationIdRef.current = selectedLocation.id;

    const fetchAqi = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                site: selectedLocation.aqiSiteName,
            });
            const res = await fetch(`${BASE_API_URL}?${params.toString()}`);

            if (selectedLocationIdRef.current !== selectedLocation.id) {
                return;
            }

            if (res.status === 204) {
                const cached = getCachedAqi(selectedLocation.id, {
                    allowStale: true,
                });

                if (cached !== undefined) {
                    setAqi(cached);
                }

                return;
            }

            if (!res.ok) {
                throw new Error('Failed to fetch AQI data');
            }

            const data = (await res.json()) as AqiData;
            if (selectedLocationIdRef.current !== selectedLocation.id) {
                return;
            }
            const cache: CachedAqi = {
                data,
                locationId: selectedLocation.id,
                timestamp: Date.now(),
            };
            globalThis.localStorage.setItem(
                getAqiCacheKey(selectedLocation.id),
                JSON.stringify(cache)
            );
            setAqi(data);
        } catch (error) {
            console.error(error);
        } finally {
            if (selectedLocationIdRef.current === selectedLocation.id) {
                setIsLoading(false);
            }
        }
    }, [selectedLocation]);

    const refreshAqi = useCallback(() => {
        fetchAqi().catch(console.error);
    }, [fetchAqi]);

    useEffect(() => {
        const cached = getCachedAqi(selectedLocation.id);

        if (cached !== undefined) {
            setAqi(cached);
            return;
        }

        if (initialCachedAqiRef.current?.locationId === selectedLocation.id) {
            globalThis.localStorage.setItem(
                getAqiCacheKey(selectedLocation.id),
                JSON.stringify(initialCachedAqiRef.current)
            );
            initialCachedAqiRef.current = undefined;
            return;
        }

        const staleCached = getCachedAqi(selectedLocation.id, {
            allowStale: true,
        });

        if (staleCached === undefined) {
            setAqi(undefined);
        } else {
            setAqi(staleCached);
        }

        fetchAqi().catch(console.error);
    }, [fetchAqi, selectedLocation.id]);

    return {
        aqi,
        isLoading,
        refreshAqi,
    };
};
