import type { I18nMessages } from '@/constants/i18n';
import type { SettingsSectionId } from './settingsNavigation';

export interface SettingsSearchResult {
    id: string;
    label: string;
    section: SettingsSectionId;
    sectionLabel: string;
    keywords: string;
}

export const getSettingsSearchResults = (
    t: I18nMessages,
    query: string,
    locationLabels: string
): SettingsSearchResult[] => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
        return [];
    }
    const items: SettingsSearchResult[] = [
        {
            id: 'bookmarks',
            label: t.bookmarks,
            section: 'content',
            sectionLabel: t.bookmarks,
            keywords: t.bookmarkSettingsKeywords,
        },
        {
            id: 'feeds',
            label: t.feeds,
            section: 'feeds',
            sectionLabel: t.feeds,
            keywords: `/feeds ${t.feedEmpty} ${t.addFeedBookmark}`,
        },
        {
            id: 'keybinds',
            label: t.keybinds,
            section: 'keybinds',
            sectionLabel: t.keybinds,
            keywords: t.keybindSettingsKeywords,
        },
        {
            id: 'theme',
            label: t.theme,
            section: 'appearance',
            sectionLabel: t.appearance,
            keywords: `${t.system} ${t.light} ${t.dark} ${t.themeDescription} theme light dark system`,
        },
        {
            id: 'accent',
            label: t.accent,
            section: 'appearance',
            sectionLabel: t.appearance,
            keywords: `${t.amethyst} ${t.azure} ${t.accentDescription} accent color colour purple blue`,
        },
        {
            id: 'wallpaper',
            label: t.wallpaper,
            section: 'appearance',
            sectionLabel: t.appearance,
            keywords: `${t.uploadWallpaper} ${t.wallpaperDescription} wallpaper background image upload`,
        },
        {
            id: 'animations',
            label: t.skipRiseAnimations,
            section: 'appearance',
            sectionLabel: t.appearance,
            keywords: `${t.skipLoadingAnimationDescription} animation motion loading`,
        },
        {
            id: 'location-tracking',
            label: t.useCurrentLocation,
            section: 'preferences',
            sectionLabel: t.preferences,
            keywords: `${t.locationTrackingDescription} gps automatic tracking current location weather air quality`,
        },
        {
            id: 'location',
            label: t.location,
            section: 'preferences',
            sectionLabel: t.preferences,
            keywords: `${t.locationDescription} ${locationLabels} city weather air quality`,
        },
        {
            id: 'language',
            label: t.language,
            section: 'preferences',
            sectionLabel: t.preferences,
            keywords: 'language locale English 繁體中文 中文',
        },
    ];
    return items.filter((item) => {
        const text =
            `${item.sectionLabel} ${item.label} ${item.keywords}`.toLocaleLowerCase();
        return terms.every((term) => text.includes(term));
    });
};
