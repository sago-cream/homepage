import 'server-only';

import type { TaiwanLocation } from '@/constants/taiwanLocations';
import { selectCwaWeather } from '@/server/cwaWeather';
import type { AqiData, WeatherData } from '@/types/environment';

type AqiRecord = Readonly<Record<string, unknown>>;

interface CachedData<T> {
    updatedAt: number;
    value: T;
}

const moenvAqiUrl = 'https://data.moenv.gov.tw/api/v2/aqx_p_432';
const cwaWeatherUrl =
    'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001';
const sharedDataRevalidateSeconds = 300;
const staleCacheMaxAgeMs = 30 * 60 * 1000;
const weatherCache = new Map<string, CachedData<WeatherData>>();
const aqiCache = new Map<string, CachedData<AqiData>>();

const getMoenvApiKey = (): string | undefined => process.env.MOENV_API_KEY;

const readCachedData = <T>(
    cache: ReadonlyMap<string, CachedData<T>>,
    key: string
): T | undefined => {
    const cachedData = cache.get(key);

    if (cachedData === undefined) {
        return undefined;
    }

    if (Date.now() - cachedData.updatedAt > staleCacheMaxAgeMs) {
        return undefined;
    }

    return cachedData.value;
};

const createCachedData = <T>(
    value: T | undefined
): CachedData<T> | undefined => {
    if (value === undefined) {
        return undefined;
    }

    return {
        updatedAt: Date.now(),
        value,
    };
};

const getWeatherCacheKey = (lat: number, lon: number): string =>
    `${lat.toFixed(4)},${lon.toFixed(4)}`;

const readString = (record: AqiRecord, key: string): string => {
    const value = record[key];

    return typeof value === 'string' ? value : '';
};

const readOptionalString = (
    record: AqiRecord,
    key: string
): string | undefined => {
    const value = readString(record, key).trim();

    return value === '' ? undefined : value;
};

const readNumber = (record: AqiRecord, key: string): number | undefined => {
    const value = Number.parseFloat(readString(record, key));

    return Number.isNaN(value) ? undefined : value;
};

const isRecordArray = (value: unknown): value is readonly AqiRecord[] =>
    Array.isArray(value) &&
    value.every((record) => typeof record === 'object' && record !== null);

const buildMoenvUrl = (apiKey: string): URL => {
    const url = new URL(moenvAqiUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('format', 'json');

    return url;
};

const fetchMoenvRecords = async (url: URL): Promise<readonly AqiRecord[]> => {
    const response = await fetch(url, {
        next: { revalidate: sharedDataRevalidateSeconds },
    });

    if (!response.ok) {
        throw new Error(`MOENV API responded with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;

    if (!isRecordArray(payload)) {
        throw new TypeError('MOENV API returned an unexpected payload.');
    }

    return payload;
};

const mapAqiRecord = (record: AqiRecord): AqiData => ({
    aqi: readNumber(record, 'aqi'),
    county: readString(record, 'county'),
    pm10: readNumber(record, 'pm10'),
    pm25: readNumber(record, 'pm2.5'),
    pollutant: readOptionalString(record, 'pollutant'),
    publishTime: readString(record, 'publishtime'),
    siteName: readString(record, 'sitename'),
    status: readString(record, 'status'),
});

export const fetchWeatherByCoordinates = async (
    lat: number,
    lon: number
): Promise<WeatherData | undefined> => {
    const cacheKey = getWeatherCacheKey(lat, lon);
    const apiKey = process.env.CWA_API_KEY?.trim();

    if (!apiKey) {
        return undefined;
    }

    try {
        const response = await fetch(cwaWeatherUrl, {
            headers: { Authorization: apiKey },
            next: { revalidate: sharedDataRevalidateSeconds },
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            throw new Error(`CWA API responded with status ${response.status}`);
        }

        const payload: unknown = await response.json();
        const weather = selectCwaWeather(payload, lat, lon);

        const cachedWeather = createCachedData(weather);
        if (cachedWeather !== undefined) {
            weatherCache.set(cacheKey, cachedWeather);
        }

        return weather;
    } catch (error) {
        const cachedWeather = readCachedData(weatherCache, cacheKey);

        if (cachedWeather !== undefined) {
            console.error('Weather fetch failed; using stale cache:', error);
            return cachedWeather;
        }

        throw error;
    }
};

export const fetchWeatherData = async (
    location: TaiwanLocation
): Promise<WeatherData | undefined> =>
    await fetchWeatherByCoordinates(location.lat, location.lon);

export const fetchAqiData = async (
    siteName: string
): Promise<AqiData | undefined> => {
    const apiKey = getMoenvApiKey();

    if (apiKey === undefined || apiKey.trim() === '') {
        return undefined;
    }

    try {
        const url = buildMoenvUrl(apiKey);
        url.searchParams.set('filters', `sitename,EQ,${siteName}`);
        url.searchParams.set('limit', '1');

        const records = await fetchMoenvRecords(url);
        const record = records.at(0);
        const aqi = record === undefined ? undefined : mapAqiRecord(record);

        const cachedAqi = createCachedData(aqi);
        if (cachedAqi !== undefined) {
            aqiCache.set(siteName, cachedAqi);
        }

        return aqi;
    } catch (error) {
        const cachedAqi = readCachedData(aqiCache, siteName);

        if (cachedAqi !== undefined) {
            console.error('AQI fetch failed; using stale cache:', error);
            return cachedAqi;
        }

        throw error;
    }
};
