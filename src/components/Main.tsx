import React from 'react';

import { footerCredit, footerLink } from '@/constants/footer';
import type { AqiData, WeatherData } from '@/types/environment';
import type { InitialAppPreferences } from '@/types/preferences';
import { Cover } from './Cover';

interface MainProps {
    initialAqi: AqiData | undefined;
    initialPreferences: InitialAppPreferences;
    initialWeather: WeatherData | undefined;
    isSupabaseEnabled: boolean;
}

export const Main: React.FC<MainProps> = ({
    initialAqi,
    initialPreferences,
    initialWeather,
    isSupabaseEnabled,
}) => (
    <>
        <main>
            <Cover
                initialAqi={initialAqi}
                initialPreferences={initialPreferences}
                initialWeather={initialWeather}
                isSupabaseEnabled={isSupabaseEnabled}
            />
        </main>
        <footer>
            <a href={footerLink}>{footerCredit}</a>
        </footer>
    </>
);
