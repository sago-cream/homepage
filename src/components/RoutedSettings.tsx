import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import type { InitialAppPreferences } from '@/types/preferences';
import { getSettingsSection } from '@/utils/settingsNavigation';
import { SettingsMenu } from './SettingsMenu';
import { WallpaperSettingsMenu } from './WallpaperSettingsMenu';

export const RoutedSettings: React.FC<{
    bookmarkControls: BookmarkControls;
    initialPreferences: InitialAppPreferences;
    isSupabaseEnabled: boolean;
}> = ({ bookmarkControls, initialPreferences, isSupabaseEnabled }) => {
    const pathname = usePathname();
    const router = useRouter();
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => {
        setHasMounted(true);
    }, []);
    const onOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                router.push('/', { scroll: false });
            }
        },
        [router]
    );
    if (!hasMounted) {
        return undefined;
    }
    const props = {
        bookmarkControls,
        initialPreferences,
        isOpen: getSettingsSection(pathname) !== undefined,
        isTriggerHidden: true,
        onOpenChange,
    };
    return isSupabaseEnabled ? (
        <WallpaperSettingsMenu {...props} />
    ) : (
        <SettingsMenu {...props} />
    );
};
