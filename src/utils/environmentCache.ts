import type { AqiData, WeatherData } from '@/types/environment';
import { readStorageValue } from '@/utils/browserStorage';

export interface EnvironmentCache<T> {
    data: T;
    locationId: string;
    timestamp: number;
}

const cacheTtl = 30 * 60 * 1000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;
const isOptionalNumber = (value: unknown): boolean =>
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value));

export const isWeatherData = (value: unknown): value is WeatherData =>
    isRecord(value) &&
    typeof value.weatherType === 'string' &&
    typeof value.temp === 'number' &&
    Number.isFinite(value.temp);

export const isAqiData = (value: unknown): value is AqiData =>
    isRecord(value) &&
    ['siteName', 'county', 'status', 'publishTime'].every(
        (key) => typeof value[key] === 'string'
    ) &&
    (value.pollutant === undefined || typeof value.pollutant === 'string') &&
    ['aqi', 'pm25', 'pm10'].every((key) => isOptionalNumber(value[key]));

export const readEnvironmentCache = <T>(
    key: string,
    locationId: string,
    isData: (value: unknown) => value is T,
    { allowStale = false }: { allowStale?: boolean } = {}
): EnvironmentCache<T> | undefined => {
    try {
        const cached: unknown = JSON.parse(readStorageValue(key) ?? 'null');
        if (
            !isRecord(cached) ||
            cached.locationId !== locationId ||
            typeof cached.timestamp !== 'number' ||
            !Number.isFinite(cached.timestamp) ||
            cached.timestamp > Date.now() ||
            (!allowStale && Date.now() - cached.timestamp >= cacheTtl) ||
            !isData(cached.data)
        ) {
            return undefined;
        }
        return { data: cached.data, locationId, timestamp: cached.timestamp };
    } catch {
        return undefined;
    }
};
