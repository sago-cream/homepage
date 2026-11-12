import type {
    BookmarkCategoryData,
    BookmarkLinkData,
    BookmarkNodeData,
} from '@/types/bookmarks';

export const defaultQuickLaunchTitles = [
    'Instagram',
    'Twitter',
    'Facebook',
    'GitHub',
    'YouTube',
    'Anigamer',
    'Crunchyroll',
    'Supercell Store',
] as const;

export const hasCustomQuickLaunchSelection = (
    bookmarkTree: readonly BookmarkCategoryData[]
): boolean =>
    bookmarkTree.some((category) =>
        category.links.some((bookmark) => bookmark.feed !== undefined)
    );

export const getQuickLaunchBookmarks = (
    bookmarkTree: readonly BookmarkCategoryData[]
): BookmarkLinkData[] => {
    const bookmarks = bookmarkTree.flatMap((category) => category.links);

    if (hasCustomQuickLaunchSelection(bookmarkTree)) {
        return bookmarks
            .filter((bookmark) => bookmark.feed === true)
            .toSorted(
                (left, right) =>
                    (left.feedOrder ?? Number.MAX_SAFE_INTEGER) -
                    (right.feedOrder ?? Number.MAX_SAFE_INTEGER)
            );
    }

    return defaultQuickLaunchTitles.flatMap((title) => {
        const bookmark = bookmarks.find((item) => item.title === title);
        return bookmark === undefined ? [] : [bookmark];
    });
};

const updateQuickLaunchNodes = (
    nodes: readonly BookmarkNodeData[],
    launchOrderById: ReadonlyMap<string, number>
): BookmarkNodeData[] =>
    nodes.map((node) => {
        if (node.type === 'folder') {
            return {
                ...node,
                children: updateQuickLaunchNodes(
                    node.children,
                    launchOrderById
                ),
            };
        }

        const feedOrder = launchOrderById.get(node.id);
        return {
            ...node,
            feed: feedOrder !== undefined,
            ...(feedOrder === undefined
                ? { feedOrder: undefined }
                : { feedOrder }),
        };
    });

export const setQuickLaunchBookmarkIds = (
    bookmarkTree: readonly BookmarkCategoryData[],
    bookmarkIds: readonly string[]
): BookmarkCategoryData[] => {
    const launchOrderById = new Map(
        bookmarkIds.map((bookmarkId, index) => [bookmarkId, index])
    );

    return bookmarkTree.map((category) => ({
        ...category,
        children: updateQuickLaunchNodes(category.children, launchOrderById),
    }));
};

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
