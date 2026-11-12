import type { BookmarkLinkData } from '@/types/bookmarks';

// Open synchronously inside the user's click so browsers can allow multiple tabs.
export const openQuickLaunchBookmarks = (
    bookmarks: readonly BookmarkLinkData[],
    openTab: (url: string, target: string) => Window | null | undefined = (
        url,
        target
    ) => globalThis.open(url, target)
): BookmarkLinkData[] =>
    bookmarks.filter((bookmark) => {
        try {
            const tab = openTab(bookmark.url, '_blank');
            if (!tab) {
                return true;
            }
            tab.opener = undefined;
            return false;
        } catch {
            return true;
        }
    });
