import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectCwaWeather } from './cwaWeather';

const now = Date.parse('2026-09-07T13:00:00+08:00');
const station = (lat: string, temp: string, weather = '晴', age = 0) => ({
    ObsTime: { DateTime: new Date(now - age).toISOString() },
    GeoInfo: {
        Coordinates: [
            {
                CoordinateName: 'TWD67',
                StationLatitude: '25',
                StationLongitude: '121',
            },
            {
                CoordinateName: 'WGS84',
                StationLatitude: lat,
                StationLongitude: '121',
            },
        ],
    },
    WeatherElement: { AirTemperature: temp, Weather: weather },
});
const payload = (...stations: readonly unknown[]) => ({
    success: 'true',
    records: { Station: stations },
});

test('selects nearest valid WGS84 observation, skipping missing and stale data', () => {
    assert.deepEqual(
        selectCwaWeather(
            payload(
                station('24', '22'),
                station('25', '-99'),
                station('25', ''),
                station('25', '25', '-99'),
                station('25', '25', '晴', 3_600_001),
                station('25.1', '28', '陰')
            ),
            25,
            121,
            now
        ),
        { temp: 28, weatherType: 'Clouds' }
    );
});

test('maps CWA descriptions with storms and snow taking precedence over rain', () => {
    for (const [description, expected] of [
        ['晴', 'Clear'],
        ['多雲', 'Clouds'],
        ['陰', 'Clouds'],
        ['雷雨', 'Thunderstorm'],
        ['雨雪', 'Snow'],
        ['毛毛雨', 'Drizzle'],
        ['陣雨', 'Rain'],
    ]) {
        assert.equal(
            selectCwaWeather(
                payload(station('25', '0', description)),
                25,
                121,
                now
            ).weatherType,
            expected
        );
    }
});

test('rejects malformed, empty, expired and invalid-coordinate responses', () => {
    for (const value of [
        undefined,
        { success: 'false' },
        { success: 'true', records: { Station: [] } },
        payload(undefined),
        payload(station('bad', '25')),
        payload(station('25', '25', '晴', 3_600_001)),
    ]) {
        assert.throws(() => selectCwaWeather(value, 25, 121, now), TypeError);
    }
});
