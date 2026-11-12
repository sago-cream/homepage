import { expect, test } from 'bun:test';

import type { BookmarkLinkData } from '@/types/bookmarks';
import { openQuickLaunchBookmarks } from './quickLaunch';

const bookmarks: BookmarkLinkData[] = [
    'Calendar',
    'Mail',
    'Supercell Store',
].map((title, index) => ({
    id: String(index),
    title,
    type: 'link',
    url: `https://example.com/${index}`,
}));

test('launch opens every selected bookmark in order, detaches openers, and returns only blocked tabs', () => {
    const calls: string[] = [];
    const openedTab = { opener: 'homepage' };
    const remaining = openQuickLaunchBookmarks(bookmarks, (url, target) => {
        calls.push(`${target}:${url}`);
        return url === bookmarks[1].url
            ? undefined
            : (openedTab as unknown as Window);
    });
    expect(calls).toEqual(bookmarks.map(({ url }) => `_blank:${url}`));
    expect(openedTab.opener).toBeUndefined();
    expect(remaining).toEqual([bookmarks[1]]);
});

test('empty sets open nothing, and a failure does not prevent later bookmarks from opening', () => {
    const calls: string[] = [];
    const openTab = (url: string) => {
        calls.push(url);
        if (url === bookmarks[0].url) {
            throw new Error('Blocked');
        }
        return { opener: undefined } as Window;
    };
    expect(openQuickLaunchBookmarks([], openTab)).toEqual([]);
    expect(calls).toEqual([]);
    expect(openQuickLaunchBookmarks(bookmarks, openTab)).toEqual([
        bookmarks[0],
    ]);
    expect(calls).toEqual(bookmarks.map(({ url }) => url));
});
