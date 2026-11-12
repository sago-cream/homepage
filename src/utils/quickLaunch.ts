import type {
    BookmarkCategoryData,
    BookmarkLinkData,
    BookmarkNodeData,
} from '@/types/bookmarks';

export const legacyQuickLaunchTitles = [
    'Instagram',
    'Twitter',
    'Facebook',
    'GitHub',
    'YouTube',
    'Anigamer',
    'Crunchyroll',
    'Supercell Store',
] as const;

const legacyQuickLaunchTitleSet = new Set<string>(legacyQuickLaunchTitles);

export const isLegacyQuickLaunchTitle = (title: string): boolean =>
    legacyQuickLaunchTitleSet.has(title);

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

    return legacyQuickLaunchTitles.flatMap((title) => {
        const bookmark = bookmarks.find((item) => item.title === title);
        return bookmark === undefined ? [] : [bookmark];
    });
};

const updateQuickLaunchNodes = (
    nodes: readonly BookmarkNodeData[],
    quickLaunchOrderById: ReadonlyMap<string, number>
): BookmarkNodeData[] =>
    nodes.map((node) => {
        if (node.type === 'folder') {
            return {
                ...node,
                children: updateQuickLaunchNodes(
                    node.children,
                    quickLaunchOrderById
                ),
            };
        }

        const feedOrder = quickLaunchOrderById.get(node.id);
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
    const quickLaunchOrderById = new Map(
        bookmarkIds.map((bookmarkId, index) => [bookmarkId, index])
    );

    return bookmarkTree.map((category) => ({
        ...category,
        children: updateQuickLaunchNodes(
            category.children,
            quickLaunchOrderById
        ),
    }));
};

export const initializeQuickLaunchSelection = (
    bookmarkTree: readonly BookmarkCategoryData[]
): BookmarkCategoryData[] =>
    setQuickLaunchBookmarkIds(
        bookmarkTree,
        getQuickLaunchBookmarks(bookmarkTree).map((bookmark) => bookmark.id)
    );
