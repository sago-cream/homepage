import { expect, test } from 'bun:test';

import type { BookmarkCategoryData, BookmarkLinkData } from '@/types/bookmarks';
import { coerceBookmarkTree } from './bookmarks';
import {
    getQuickLaunchBookmarks,
    setQuickLaunchBookmarkIds,
} from './quickLaunch';

const bookmark = (
    id: string,
    extra: Partial<BookmarkLinkData> = {}
): BookmarkLinkData => ({
    id,
    title: id,
    type: 'link',
    url: `https://example.com/${id}`,
    ...extra,
});
const tree = (
    bookmarks: readonly BookmarkLinkData[]
): BookmarkCategoryData[] => [
    {
        id: 'work',
        category: 'Work',
        children: [
            {
                id: 'folder',
                title: 'Folder',
                type: 'folder',
                children: [...bookmarks],
            },
        ],
        links: [...bookmarks],
    },
];
const reload = (
    value: readonly BookmarkCategoryData[]
): BookmarkCategoryData[] => {
    const stored = JSON.stringify(value);
    const restored = coerceBookmarkTree(JSON.parse(stored));
    if (!restored) {
        throw new Error('Stored bookmarks could not be restored');
    }
    return restored;
};
const selectedIds = (value: readonly BookmarkCategoryData[]) =>
    getQuickLaunchBookmarks(value).map(({ id }) => id);

test('stored selections and explicit order survive a round trip without migration', () => {
    const stored = tree([
        bookmark('first', { feed: true, feedOrder: 1 }),
        bookmark('second', { feed: true, feedOrder: 0 }),
        bookmark('GitHub', { feed: false }),
    ]);
    expect(selectedIds(reload(stored))).toEqual(['second', 'first']);
    expect(
        selectedIds(
            reload(setQuickLaunchBookmarkIds(stored, ['first', 'second']))
        )
    ).toEqual(['first', 'second']);
    expect(selectedIds(reload(setQuickLaunchBookmarkIds(stored, [])))).toEqual(
        []
    );
});

test('legacy defaults are retained until the user chooses a set, including nested bookmarks', () => {
    const legacy = tree([
        bookmark('GitHub'),
        bookmark('YouTube'),
        bookmark('custom'),
    ]);
    expect(selectedIds(legacy)).toEqual(['GitHub', 'YouTube']);
    expect(
        selectedIds(
            reload(setQuickLaunchBookmarkIds(legacy, ['custom', 'GitHub']))
        )
    ).toEqual(['custom', 'GitHub']);
    expect(selectedIds(reload(setQuickLaunchBookmarkIds(legacy, [])))).toEqual(
        []
    );
});
