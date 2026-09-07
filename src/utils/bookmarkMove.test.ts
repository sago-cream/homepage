/* eslint-disable @typescript-eslint/no-non-null-assertion -- Successful-move fixtures must return a tree; missing results fail the test. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { BookmarkCategoryData, BookmarkNodeData } from '@/types/bookmarks';
import { moveBookmarkTreeNode } from './bookmarkMove';
import { bookmarkRootCategoryId, getBookmarkRootNodes } from './bookmarks';

const link = (id: string): BookmarkNodeData => ({
    id,
    type: 'link',
    title: id,
    url: `https://example.com/${id}`,
});
const tree: BookmarkCategoryData[] = [
    {
        id: bookmarkRootCategoryId,
        category: 'Bookmarks',
        children: [link('root')],
        links: [],
    },
    {
        id: 'a',
        category: 'A',
        children: [
            link('one'),
            link('two'),
            {
                id: 'nested',
                type: 'folder',
                title: 'Nested',
                children: [link('three')],
            },
        ],
        links: [],
    },
    { id: 'b', category: 'B', children: [], links: [] },
];
const root = { categoryIndex: -1, folderPath: [] };
const a = { categoryIndex: 1, folderPath: [] };
const b = { categoryIndex: 2, folderPath: [] };
const nested = { categoryIndex: 1, folderPath: ['nested'] };
const ids = (nodes: readonly BookmarkNodeData[]) =>
    nodes.map((node) => node.id);

describe('bookmark drag moves', () => {
    test('reorders siblings in both directions', () => {
        const down = moveBookmarkTreeNode(tree, a, 'one', a, 2)!;
        assert.deepEqual(ids(down[1].children), ['two', 'one', 'nested']);
        const up = moveBookmarkTreeNode(down, a, 'one', a, 0)!;
        assert.deepEqual(ids(up[1].children), ['one', 'two', 'nested']);
    });
    test('moves a root bookmark into an empty category', () => {
        const result = moveBookmarkTreeNode(tree, root, 'root', b)!;
        assert.deepEqual(
            ids(result.find((category) => category.id === 'b')!.children),
            ['root']
        );
        assert.equal(
            result.some((category) => category.id === bookmarkRootCategoryId),
            false
        );
    });
    test('moves bookmarks across folders and back to their parent', () => {
        const result = moveBookmarkTreeNode(tree, a, 'one', nested)!;
        const back = moveBookmarkTreeNode(result, nested, 'one', a, 0)!;
        assert.deepEqual(ids(back[1].children), ['one', 'two', 'nested']);
    });
    test('promotes nested folders to the root without losing their children', () => {
        const result = moveBookmarkTreeNode(tree, a, 'nested', root)!;
        assert.deepEqual(
            ids(result.find((category) => category.id === 'nested')!.children),
            ['three']
        );
    });
    test('nests a top-level folder inside another category', () => {
        const result = moveBookmarkTreeNode(tree, root, 'a', b)!;
        assert.deepEqual(
            ids(result.find((category) => category.id === 'b')!.children),
            ['a']
        );
        assert.equal(
            result.some((category) => category.id === 'a'),
            false
        );
    });
    test('reorders root folders', () => {
        const result = moveBookmarkTreeNode(tree, root, 'b', root, 1)!;
        assert.deepEqual(ids(getBookmarkRootNodes(result)), ['root', 'b', 'a']);
    });
    test('rejects self and descendant moves, missing nodes, and invalid destinations', () => {
        assert.equal(moveBookmarkTreeNode(tree, root, 'a', a), undefined);
        assert.equal(moveBookmarkTreeNode(tree, root, 'a', nested), undefined);
        assert.equal(
            moveBookmarkTreeNode(tree, a, 'nested', nested),
            undefined
        );
        assert.equal(moveBookmarkTreeNode(tree, a, 'missing', b), undefined);
        assert.equal(
            moveBookmarkTreeNode(tree, a, 'one', { categoryIndex: 50 }),
            undefined
        );
        assert.equal(moveBookmarkTreeNode(tree, a, 'one', a), undefined);
    });
    test('does not mutate the source tree', () => {
        const before = JSON.stringify(tree);
        moveBookmarkTreeNode(tree, a, 'nested', b);
        assert.equal(JSON.stringify(tree), before);
    });
});
