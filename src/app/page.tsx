import type { ReactNode } from 'react';

import { defaultInitialAppPreferences } from '@/constants/defaultPreferences';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { HomePageClient } from './HomePageClient';

export const dynamic = 'force-static';

export default function Page(): ReactNode {
    return (
        <HomePageClient
            initialAqi={undefined}
            initialPreferences={defaultInitialAppPreferences}
            initialWeather={undefined}
            isSupabaseEnabled={isSupabaseConfigured()}
        />
    );
}
