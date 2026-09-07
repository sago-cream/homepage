'use client';

import { Main } from '@/components/Main';
import { WallpaperProvider } from '@/hooks/useWallpaper';
import type { AqiData, WeatherData } from '@/types/environment';
import type { InitialAppPreferences } from '@/types/preferences';

interface HomePageClientProps {
    initialAqi: AqiData | undefined;
    initialPreferences: InitialAppPreferences;
    initialWeather: WeatherData | undefined;
    isSupabaseEnabled: boolean;
}

export const HomePageClient: React.FC<HomePageClientProps> = ({
    initialAqi,
    initialPreferences,
    initialWeather,
    isSupabaseEnabled,
}) => {
    const content = (
        <Main
            initialAqi={initialAqi}
            initialPreferences={initialPreferences}
            initialWeather={initialWeather}
            isSupabaseEnabled={isSupabaseEnabled}
        />
    );

    return isSupabaseEnabled ? (
        <WallpaperProvider>{content}</WallpaperProvider>
    ) : (
        content
    );
};
