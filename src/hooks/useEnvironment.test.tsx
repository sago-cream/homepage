/* eslint-disable @typescript-eslint/promise-function-async, @typescript-eslint/require-await -- Async act flushes effects and controlled requests. */
import { act, StrictMode } from 'react';
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import {
    findTaiwanLocation,
    taiwanLocations,
} from '@/constants/taiwanLocations';
import type { AqiData, WeatherData } from '@/types/environment';
import { isWeatherData, readEnvironmentCache } from '@/utils/environmentCache';
import { useAqiWithInitialData } from './useAqi';
import { useLocale } from './useLocale';
import { useTaiwanLocation } from './useTaiwanLocation';
import { useWeatherWithInitialData } from './useWeather';

const weather: WeatherData = { temp: 25, weatherType: 'clear' };
const aqi: AqiData = {
    aqi: 40,
    county: '新竹市',
    pm10: 20,
    pm25: 10,
    pollutant: undefined,
    publishTime: '2026-11-02',
    siteName: '新竹',
    status: '良好',
};
const location = findTaiwanLocation(undefined);
const otherLocation = taiwanLocations.find((item) => item.id !== location.id);
if (otherLocation === undefined) {
    throw new Error('A second location is required');
}
const weatherKey = `weather_cache_cwa_v1_${location.id}`;
const aqiKey = `aqi_cache_${location.id}`;
let browser: Window;
let root: Root;
let consumers: Array<ReturnType<typeof useControls>>;
const originalFetch = globalThis.fetch;
const bindings = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'location',
    'CustomEvent',
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
] as const;
const originals = bindings.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
);

function useControls() {
    return {
        weather: useWeatherWithInitialData({}),
        aqi: useAqiWithInitialData({}),
        location: useTaiwanLocation(),
        locale: useLocale(),
    };
}

function Consumer({ index }: { index: number }) {
    consumers[index] = useControls();
    return <span />;
}
const render = async (count = 1) => {
    await act(async () => {
        root.render(
            <StrictMode>
                {Array.from({ length: count }, (_, index) => (
                    <Consumer key={index} index={index} />
                ))}
            </StrictMode>
        );
    });
};
beforeEach(() => {
    consumers = [];
    browser = new Window({ url: 'https://example.com' });
    for (const key of bindings) {
        const value = browser[key];
        Object.defineProperty(globalThis, key, {
            configurable: true,
            value:
                (typeof value === 'function' &&
                    key.endsWith('EventListener')) ||
                key === 'dispatchEvent'
                    ? (value as (...args: readonly never[]) => unknown).bind(
                          browser
                      )
                    : value,
        });
    }
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    root = createRoot(document.createElement('div'));
    globalThis.fetch = mock((url: string) =>
        Promise.resolve(
            Response.json(url.startsWith('/api/weather') ? weather : aqi)
        )
    ) as unknown as typeof fetch;
});
afterEach(async () => {
    await act(async () => {
        root.unmount();
    });
    globalThis.fetch = originalFetch;
    await browser.happyDOM.close();
    for (const [key, descriptor] of originals) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
});

test('corrupt cache records cannot crash loading or suppress fresh data', async () => {
    browser.localStorage.setItem(weatherKey, 'null');
    browser.localStorage.setItem(
        aqiKey,
        JSON.stringify({
            locationId: location.id,
            timestamp: Date.now(),
            data: { aqi: 'bad' },
        })
    );
    await render();
    expect(consumers[0].weather.weather).toEqual(weather);
    expect(consumers[0].aqi.aqi).toEqual(aqi);
});

test('cache validation rejects invalid timestamps, data, and mismatched locations', () => {
    for (const record of [
        JSON.parse('null') as unknown,
        [],
        { locationId: location.id, timestamp: 'now', data: weather },
        {
            locationId: location.id,
            timestamp: Date.now() + 60_000,
            data: weather,
        },
        { locationId: 'other', timestamp: Date.now(), data: weather },
        {
            locationId: location.id,
            timestamp: Date.now(),
            data: { temp: '25', weatherType: 'clear' },
        },
    ]) {
        browser.localStorage.setItem(weatherKey, JSON.stringify(record));
        expect(
            readEnvironmentCache(weatherKey, location.id, isWeatherData, {
                allowStale: true,
            })
        ).toBeUndefined();
    }
    browser.localStorage.setItem(
        weatherKey,
        JSON.stringify({
            locationId: location.id,
            timestamp: Date.now() - 31 * 60_000,
            data: weather,
        })
    );
    expect(
        readEnvironmentCache(weatherKey, location.id, isWeatherData)
    ).toBeUndefined();
    expect(
        readEnvironmentCache(weatherKey, location.id, isWeatherData, {
            allowStale: true,
        })?.data
    ).toEqual(weather);
});

test('blocked storage preserves fetched data, manual location selection, and locale changes', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
            throw new Error('Storage blocked');
        },
    });
    await render();
    expect(consumers[0].weather.weather).toEqual(weather);
    expect(consumers[0].aqi.aqi).toEqual(aqi);
    await act(async () => {
        consumers[0].location.selectLocationId(otherLocation.id);
        consumers[0].locale.setLocale('zh-TW');
    });
    expect(consumers[0].location.selectedLocation.id).toBe(otherLocation.id);
    expect(consumers[0].weather.selectedLocation.id).toBe(otherLocation.id);
    expect(consumers[0].locale.locale).toBe('zh-TW');
    expect(consumers[0].weather.isLoading).toBe(false);
    expect(consumers[0].aqi.isLoading).toBe(false);
});

test('multiple consumers and Strict Mode share one request for each metric', async () => {
    const pendingWeather = Promise.withResolvers<Response>();
    const pendingAqi = Promise.withResolvers<Response>();
    const fetcher = mock((url: string) =>
        url.startsWith('/api/weather')
            ? pendingWeather.promise
            : pendingAqi.promise
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await render(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
        pendingWeather.resolve(Response.json(weather));
        pendingAqi.resolve(Response.json(aqi));
    });
    for (const consumer of consumers) {
        expect(consumer.weather.weather).toEqual(weather);
        expect(consumer.aqi.aqi).toEqual(aqi);
        expect(consumer.aqi.isLoading).toBe(false);
    }
});

test('late requests cannot replace data or loading state after switching to a cached location', async () => {
    const pendingWeather = Promise.withResolvers<Response>();
    const pendingAqi = Promise.withResolvers<Response>();
    globalThis.fetch = mock((url: string) =>
        url.startsWith('/api/weather')
            ? pendingWeather.promise
            : pendingAqi.promise
    ) as unknown as typeof fetch;
    const otherWeather = { ...weather, temp: 15 };
    const otherAqi = { ...aqi, aqi: 10, siteName: otherLocation.aqiSiteName };
    browser.localStorage.setItem(
        `weather_cache_cwa_v1_${otherLocation.id}`,
        JSON.stringify({
            data: otherWeather,
            locationId: otherLocation.id,
            timestamp: Date.now(),
        })
    );
    browser.localStorage.setItem(
        `aqi_cache_${otherLocation.id}`,
        JSON.stringify({
            data: otherAqi,
            locationId: otherLocation.id,
            timestamp: Date.now(),
        })
    );
    await render();
    await act(async () => {
        consumers[0].location.selectLocationId(otherLocation.id);
    });
    expect(consumers[0].weather.isLoading).toBe(false);
    expect(consumers[0].aqi.isLoading).toBe(false);
    await act(async () => {
        pendingWeather.resolve(Response.json(weather));
        pendingAqi.resolve(Response.json(aqi));
    });
    expect(consumers[0].weather.weather).toEqual(otherWeather);
    expect(consumers[0].aqi.aqi).toEqual(otherAqi);
});

test('invalid network payloads preserve usable stale data', async () => {
    for (const [key, data] of [
        [weatherKey, weather],
        [aqiKey, aqi],
    ] as const) {
        browser.localStorage.setItem(
            key,
            JSON.stringify({
                data,
                locationId: location.id,
                timestamp: Date.now() - 31 * 60_000,
            })
        );
    }
    globalThis.fetch = mock(() =>
        Promise.resolve(Response.json({ unexpected: true }))
    ) as unknown as typeof fetch;
    const log = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        await render();
        expect(consumers[0].weather.weather).toEqual(weather);
        expect(consumers[0].aqi.aqi).toEqual(aqi);
        expect(log).toHaveBeenCalledTimes(2);
    } finally {
        log.mockRestore();
    }
});
