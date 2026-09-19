import { expect, test } from 'bun:test';

import type { LinkItem } from './search';
import { getSearchResults } from './search';

const bookmark = (title: string, pathLabel = 'Bookmarks'): LinkItem => ({
    category: 1,
    categoryTitle: pathLabel,
    folderPath: [],
    folderTitles: [],
    id: title,
    pathLabel,
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
});

test('recorded English keys keep the same results when Zhuyin shows only a residual', () => {
    const items = [
        'Google Maps',
        'Google Drive',
        'Excel',
        'Etsy',
        'eBay',
        'Evernote',
    ].map((title) => bookmark(title));
    const englishResults = getSearchResults(items, 'google', 'google');

    expect(englishResults.map(({ title }) => title)).toEqual([
        'Google Maps',
        'Google Drive',
    ]);
    expect(getSearchResults(items, 'ㄍ', 'google')).toEqual(englishResults);
});

test('a residual alias cannot introduce matches through a folder path', () => {
    const items = [bookmark('Documents', 'Google'), bookmark('Shopping', 'e')];

    expect(getSearchResults(items, 'ㄍ', 'google')).toEqual([
        bookmark('Documents', 'Google'),
    ]);
});

test('Zhuyin still maps to English keys when no key sequence was recorded', () => {
    const items = [bookmark('Google Maps'), bookmark('Excel')];

    expect(getSearchResults(items, 'ㄕㄟㄟㄕㄠㄍ')).toEqual(
        getSearchResults(items, 'google')
    );
});

test('literal Chinese text remains searchable alongside recorded keys', () => {
    const items = [bookmark('中文'), bookmark('Google Maps')];

    expect(getSearchResults(items, '中文', 'google')).toEqual(items);
});
