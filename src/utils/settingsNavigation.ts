export const settingsSectionPaths = {
    content: '/settings/bookmarks',
    feeds: '/settings/quick-launch',
    keybinds: '/settings/keybinds',
    appearance: '/settings/appearance',
    preferences: '/settings/preferences',
} as const;

export type SettingsSectionId = keyof typeof settingsSectionPaths;

export const getSettingsSection = (
    pathname: string
): SettingsSectionId | undefined =>
    pathname === '/settings/feeds'
        ? 'feeds'
        : (Object.keys(settingsSectionPaths) as SettingsSectionId[]).find(
              (section) => settingsSectionPaths[section] === pathname
          );
