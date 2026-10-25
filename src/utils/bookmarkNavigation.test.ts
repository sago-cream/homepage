import { expect, test } from 'bun:test';

import { getLocationAfterDeletion } from './bookmarkNavigation';

const location = { categoryIndex: 2, folderPath: ['parent', 'child'] };

test('deleting a bookmark preserves the exact folder location', () => {
    expect(
        getLocationAfterDeletion(location, { ...location, kind: 'bookmark' })
    ).toBe(location);
});

test('deleting an unrelated folder preserves location and scroll identity', () => {
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 2,
            folderPath: ['sibling'],
            kind: 'folder',
        })
    ).toBe(location);
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 1,
            folderPath: ['parent'],
            kind: 'folder',
        })
    ).toBe(location);
});

test('deleting a selected folder or ancestor returns to its surviving parent', () => {
    expect(
        getLocationAfterDeletion(location, { ...location, kind: 'folder' })
    ).toEqual({ categoryIndex: 2, folderPath: ['parent'] });
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 2,
            folderPath: ['parent'],
            kind: 'folder',
        })
    ).toEqual({ categoryIndex: 2, folderPath: [] });
});

test('deleting a category keeps other categories aligned after their indices shift', () => {
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 0,
            folderPath: [],
            kind: 'category',
        })
    ).toEqual({ ...location, categoryIndex: 1 });
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 3,
            folderPath: [],
            kind: 'category',
        })
    ).toBe(location);
    expect(
        getLocationAfterDeletion(location, {
            categoryIndex: 2,
            folderPath: [],
            kind: 'category',
        })
    ).toEqual({ categoryIndex: -1, folderPath: [] });
});
