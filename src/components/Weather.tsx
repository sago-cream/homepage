import { useEffect, useRef, useState } from 'react';
import {
    Cloud,
    CloudDrizzle,
    CloudLightning,
    CloudRain,
    CloudSnow,
    MapPinCheck,
    MapPinOff,
    Sun,
} from 'lucide-react';

import { aqiRankLabels, getAqiRank } from '@/constants/aqi';
import { getDateLocale } from '@/constants/i18n';
import { getLocationLabel } from '@/constants/taiwanLocations';
import { useAqiWithInitialData } from '@/hooks/useAqi';
import { useLocale } from '@/hooks/useLocale';
import { useWeatherWithInitialData } from '@/hooks/useWeather';
import type { AqiData, WeatherData } from '@/types/environment';
import type { InitialAppPreferences } from '@/types/preferences';

const weatherIcons = {
    Thunderstorm: <CloudLightning />,
    Drizzle: <CloudDrizzle />,
    Rain: <CloudRain />,
    Snow: <CloudSnow />,
    Clear: <Sun />,
    Clouds: <Cloud />,
};
const locationGrantFeedbackDuration = 1600;

interface WeatherProps {
    initialAqi: AqiData | undefined;
    initialPreferences: InitialAppPreferences;
    initialWeather: WeatherData | undefined;
}

export const Weather: React.FC<WeatherProps> = ({
    initialAqi,
    initialPreferences,
    initialWeather,
}) => {
    const {
        weather,
        geolocationPermission,
        isGeolocationAvailable,
        isSyncingLocation,
        lastLocationSyncSucceededAt,
        selectedLocation,
        syncCurrentLocation,
    } = useWeatherWithInitialData({
        hasInitialLocationCookie: initialPreferences.hasLocationCookie,
        initialLocationId: initialPreferences.locationId,
        initialWeather,
    });
    const { aqi } = useAqiWithInitialData({
        hasInitialLocationCookie: initialPreferences.hasLocationCookie,
        initialAqi,
        initialLocationId: initialPreferences.locationId,
    });
    const { locale, t } = useLocale(initialPreferences.locale);
    const [showLocationGranted, setShowLocationGranted] = useState(false);
    const locationSyncRequestRef = useRef<
        { previousSuccessAt: number | undefined } | undefined
    >(undefined);
    const hasWeather = weather !== undefined;
    const hasAqi = aqi !== undefined;
    const locationLabel = getLocationLabel(selectedLocation, locale);
    const aqiRank = getAqiRank(aqi?.aqi);
    const aqiRankLabel = aqiRankLabels[locale][aqiRank];

    const date = new Date();
    const dateStr = date.toLocaleDateString(getDateLocale(locale), {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
    });

    const weatherIcon =
        weather?.weatherType !== undefined &&
        weather.weatherType in weatherIcons
            ? weatherIcons[weather.weatherType as keyof typeof weatherIcons]
            : weatherIcons.Clouds;
    const showLocationTrigger =
        isGeolocationAvailable && geolocationPermission !== 'granted';
    const showLocationControl = showLocationTrigger || showLocationGranted;
    const hasWeatherRowContent = hasWeather || hasAqi || showLocationControl;
    const locationControlState = showLocationGranted ? 'granted' : 'request';
    let locationControlLabel: string = t.myLocation;

    if (showLocationGranted) {
        locationControlLabel = locationLabel;
    } else if (isSyncingLocation) {
        locationControlLabel = t.syncing;
    }

    useEffect(() => {
        if (
            locationSyncRequestRef.current === undefined ||
            lastLocationSyncSucceededAt === undefined ||
            lastLocationSyncSucceededAt ===
                locationSyncRequestRef.current.previousSuccessAt ||
            geolocationPermission !== 'granted'
        ) {
            return undefined;
        }

        locationSyncRequestRef.current = undefined;
        setShowLocationGranted(true);
    }, [geolocationPermission, lastLocationSyncSucceededAt]);

    useEffect(() => {
        if (!showLocationGranted) {
            return undefined;
        }

        const timeoutId = setTimeout(() => {
            setShowLocationGranted(false);
        }, locationGrantFeedbackDuration);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [showLocationGranted]);

    return (
        <div
            className={[
                'weather-container',
                !hasWeatherRowContent && 'placeholder',
                showLocationControl && 'with-location-control',
            ]
                .filter(Boolean)
                .join(' ')}
            aria-hidden={!hasWeatherRowContent}
        >
            <span className='weather-date'>{dateStr}</span>
            <span className='weather-metrics'>
                {hasWeather && (
                    <span className='weather-info' title={locationLabel}>
                        {weatherIcon}
                        {`${Math.round(weather.temp)}°C`}
                    </span>
                )}
                {hasAqi && (
                    <span
                        className='aqi-info'
                        data-aqi-rank={aqiRank}
                        title={`${locationLabel} · ${aqi.publishTime} · ${aqiRankLabel}`}
                        aria-label={`${t.aqi} ${aqi.aqi ?? '--'}, ${aqiRankLabel}`}
                    >
                        <span>{t.aqi}</span>
                        <span>{aqi.aqi ?? '--'}</span>
                    </span>
                )}
            </span>
            {showLocationControl && (
                <button
                    className='weather-location-sync'
                    type='button'
                    aria-label={locationControlLabel}
                    title={locationControlLabel}
                    data-state={locationControlState}
                    data-syncing={isSyncingLocation}
                    disabled={isSyncingLocation || showLocationGranted}
                    onClick={() => {
                        locationSyncRequestRef.current = {
                            previousSuccessAt: lastLocationSyncSucceededAt,
                        };
                        syncCurrentLocation();
                    }}
                >
                    <span className='weather-location-sync-icons' aria-hidden>
                        <MapPinOff className='weather-location-sync-icon weather-location-sync-icon-off' />
                        <MapPinCheck className='weather-location-sync-icon weather-location-sync-icon-granted' />
                    </span>
                </button>
            )}
        </div>
    );
};
