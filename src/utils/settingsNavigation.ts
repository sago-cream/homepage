export const settingsSectionPaths = {
    content: '/settings/bookmarks',
    feeds: '/settings/feeds',
    keybinds: '/settings/keybinds',
    appearance: '/settings/appearance',
    preferences: '/settings/preferences',
} as const;

export type SettingsSectionId = keyof typeof settingsSectionPaths;

export const getSettingsSection = (
    pathname: string
): SettingsSectionId | undefined =>
    (Object.keys(settingsSectionPaths) as SettingsSectionId[]).find(
        (section) => settingsSectionPaths[section] === pathname
    );
