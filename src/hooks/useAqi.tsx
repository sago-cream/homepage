import { useCallback, useEffect, useRef, useState } from 'react';

import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { AqiData } from '@/types/environment';
import { writeStorageValue } from '@/utils/browserStorage';
import { isAqiData, readEnvironmentCache } from '@/utils/environmentCache';
import type { EnvironmentCache } from '@/utils/environmentCache';

type CachedAqi = EnvironmentCache<AqiData>;

interface UseAqiOptions {
    hasInitialLocationCookie?: boolean;
    initialAqi?: AqiData;
    initialLocationId?: string;
}

const AQI_CACHE_KEY_PREFIX = 'aqi_cache';
const BASE_API_URL = '/api/aqi';

const aqiRequests = new Map<string, Promise<AqiData | undefined>>();

function getAqiCacheKey(locationId: string): string {
    return `${AQI_CACHE_KEY_PREFIX}_${locationId}`;
}

const getCachedAqi = (
    locationId: string,
    options: { allowStale?: boolean } = {}
): AqiData | undefined =>
    readEnvironmentCache(
        getAqiCacheKey(locationId),
        locationId,
        isAqiData,
        options
    )?.data;

async function requestAqi(
    locationId: string,
    siteName: string
): Promise<AqiData | undefined> {
    const pending = aqiRequests.get(locationId);
    if (pending !== undefined) {
        return await pending;
    }
    const request = (async () => {
        const params = new URLSearchParams({ site: siteName });
        const response = await fetch(`${BASE_API_URL}?${params.toString()}`);
        if (response.status === 204) {
            return undefined;
        }
        if (!response.ok) {
            throw new Error('Failed to fetch AQI data');
        }
        const data: unknown = await response.json();
        if (!isAqiData(data)) {
            throw new Error('Invalid AQI data');
        }
        return data;
    })().finally(() => {
        aqiRequests.delete(locationId);
    });
    aqiRequests.set(locationId, request);
    return await request;
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

    const requestVersionRef = useRef(0);

    const fetchAqi = useCallback(async () => {
        requestVersionRef.current++;
        const requestVersion = requestVersionRef.current;
        setIsLoading(true);
        try {
            const data = await requestAqi(
                selectedLocation.id,
                selectedLocation.aqiSiteName
            );
            if (requestVersion !== requestVersionRef.current) {
                return;
            }
            if (data === undefined) {
                return;
            }
            const cache: CachedAqi = {
                data,
                locationId: selectedLocation.id,
                timestamp: Date.now(),
            };
            writeStorageValue(
                getAqiCacheKey(selectedLocation.id),
                JSON.stringify(cache)
            );
            setAqi(data);
        } catch (error) {
            if (requestVersion === requestVersionRef.current) {
                console.error(error);
            }
        } finally {
            if (requestVersion === requestVersionRef.current) {
                setIsLoading(false);
            }
        }
    }, [selectedLocation]);

    useEffect(
        () => () => {
            requestVersionRef.current++;
        },
        [selectedLocation.id]
    );

    const refreshAqi = useCallback(() => {
        fetchAqi().catch(console.error);
    }, [fetchAqi]);

    useEffect(() => {
        const initialCache = initialCachedAqiRef.current;
        initialCachedAqiRef.current = undefined;
        const cached = getCachedAqi(selectedLocation.id);

        if (cached !== undefined) {
            setAqi(cached);
            setIsLoading(false);
            return undefined;
        }

        if (initialCache?.locationId === selectedLocation.id) {
            writeStorageValue(
                getAqiCacheKey(selectedLocation.id),
                JSON.stringify(initialCache)
            );
            setAqi(initialCache.data);
            setIsLoading(false);
            return undefined;
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
        return undefined;
    }, [fetchAqi, selectedLocation.id]);

    return {
        aqi,
        isLoading,
        refreshAqi,
    };
};
