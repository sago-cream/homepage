import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { settingsSectionPaths } from '@/utils/settingsNavigation';

export const dynamicParams = false;
export const metadata: Metadata = { title: 'Settings · Homepage' };

export function generateStaticParams(): ReadonlyArray<{ section: string }> {
    return Object.values(settingsSectionPaths).map((path) => ({
        section: path.split('/').at(-1) ?? '',
    }));
}

export default function SettingsSection(): ReactNode {
    return undefined;
}
