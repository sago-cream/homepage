import type { WeatherData } from '@/types/environment';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null
        ? (value as Readonly<Record<string, unknown>>)
        : {};

const asNumber = (value: unknown): number =>
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
        ? Number(value)
        : Number.NaN;

const mapWeather = (description: string): string => {
    if (description.includes('雷')) {
        return 'Thunderstorm';
    }
    if (/[雪雹霰]/u.test(description)) {
        return 'Snow';
    }
    if (description.includes('毛毛雨')) {
        return 'Drizzle';
    }
    if (description.includes('雨')) {
        return 'Rain';
    }
    if (description === '晴') {
        return 'Clear';
    }
    return 'Clouds';
};

// CWA provides both TWD67 and WGS84; browser coordinates use WGS84.
export const selectCwaWeather = (
    payload: unknown,
    lat: number,
    lon: number,
    now = Date.now()
): WeatherData => {
    const data = asRecord(payload);
    const stations = asRecord(data.records).Station;
    if (data.success !== 'true' || !Array.isArray(stations)) {
        throw new TypeError('CWA API returned an unexpected payload.');
    }

    let nearest: WeatherData | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const value of stations) {
        const station = asRecord(value);
        const elements = asRecord(station.WeatherElement);
        const temp = asNumber(elements.AirTemperature);
        const description = elements.Weather;
        const observedAt = Date.parse(
            String(asRecord(station.ObsTime).DateTime)
        );
        const coordinates = asRecord(station.GeoInfo).Coordinates;
        if (
            !Number.isFinite(temp) ||
            temp < -90 ||
            temp > 60 ||
            typeof description !== 'string' ||
            !/[\u3400-\u9FFF]/u.test(description) ||
            !Number.isFinite(observedAt) ||
            now - observedAt > 60 * 60 * 1000 ||
            observedAt > now + 10 * 60 * 1000 ||
            !Array.isArray(coordinates)
        ) {
            continue;
        }

        const coordinate = asRecord(
            coordinates.find(
                (entry: unknown) => asRecord(entry).CoordinateName === 'WGS84'
            )
        );
        const stationLat = asNumber(coordinate.StationLatitude);
        const stationLon = asNumber(coordinate.StationLongitude);
        if (
            !Number.isFinite(stationLat) ||
            Math.abs(stationLat) > 90 ||
            !Number.isFinite(stationLon) ||
            Math.abs(stationLon) > 180
        ) {
            continue;
        }

        const radians = Math.PI / 180;
        const distance =
            Math.sin(((stationLat - lat) * radians) / 2) ** 2 +
            Math.cos(lat * radians) *
                Math.cos(stationLat * radians) *
                Math.sin(((stationLon - lon) * radians) / 2) ** 2;
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = { temp, weatherType: mapWeather(description) };
        }
    }
    if (nearest === undefined) {
        throw new TypeError(
            'CWA API returned no recent valid weather observations.'
        );
    }
    return nearest;
};
