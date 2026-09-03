import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { BookmarkCategoryData } from '@/types/bookmarks';
import {
    bookmarkRootCategoryId,
    getBookmarkRootNodes,
    replaceBookmarkRootNodes,
} from './bookmarks';

const bookmarkTree: BookmarkCategoryData[] = [
    {
        category: 'Bookmarks',
        children: [
            {
                id: 'root-link',
                title: 'Root link',
                type: 'link',
                url: 'https://example.com/',
            },
        ],
        id: bookmarkRootCategoryId,
        links: [],
    },
    {
        category: 'Reading',
        children: [],
        id: 'reading',
        links: [],
    },
];

describe('bookmark root adapter', () => {
    test('presents root bookmarks and categories as sibling nodes', () => {
        assert.deepEqual(getBookmarkRootNodes(bookmarkTree), [
            bookmarkTree[0]?.children[0],
            {
                children: [],
                id: 'reading',
                title: 'Reading',
                type: 'folder',
            },
        ]);
    });

    test('stores root links separately while keeping folders as categories', () => {
        const nextTree = replaceBookmarkRootNodes(bookmarkTree, [
            ...getBookmarkRootNodes(bookmarkTree),
            {
                id: 'second-link',
                title: 'Second link',
                type: 'link',
                url: 'https://example.org/',
            },
        ]);

        assert.deepEqual(
            nextTree.map((category) => category.category),
            ['Bookmarks', 'Reading']
        );
        assert.deepEqual(
            nextTree[0]?.children.map((node) => node.id),
            ['root-link', 'second-link']
        );
        assert.deepEqual(nextTree[1], {
            category: 'Reading',
            children: [],
            id: 'reading',
            links: [],
        });
    });
});
