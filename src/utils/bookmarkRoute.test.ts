import { describe, expect, test } from 'bun:test';

import type { BookmarkCategoryData } from '@/types/bookmarks';
import { createBookmarkRoute, readBookmarkRoute } from './bookmarkRoute';
import type { BookmarkRouteState } from './bookmarkRoute';

const tree: BookmarkCategoryData[] = [
    {
        id: 'work',
        category: 'Work',
        links: [],
        children: [
            {
                id: 'projects',
                title: 'Projects',
                type: 'folder',
                children: [
                    {
                        id: 'example',
                        title: 'Example',
                        type: 'link',
                        url: 'https://example.com',
                    },
                ],
            },
        ],
    },
    { id: 'archive', category: 'Archive', links: [], children: [] },
];
const root = { categoryIndex: -1, folderPath: [] };
const work = { categoryIndex: 0, folderPath: [] };
const projects = { categoryIndex: 0, folderPath: ['projects'] };

describe('bookmark deep links', () => {
    test('opens a nested folder with its parent layer and search query', () => {
        expect(
            readBookmarkRoute(
                tree,
                new URLSearchParams('folder=projects&q=Example')
            )
        ).toEqual({
            location: work,
            selectedLocation: projects,
            query: 'Example',
        });
    });
    test('round-trips both panes and search, including an explicitly visible root layer', () => {
        const states: BookmarkRouteState[] = [
            { location: root, query: '' },
            { location: root, selectedLocation: work, query: 'hello & 世界' },
            { location: work, selectedLocation: projects, query: '' },
            { location: root, selectedLocation: projects, query: '' },
            { location: work, query: '' },
        ];
        for (const state of states) {
            const url = new URL(
                createBookmarkRoute(tree, state),
                'https://example.com'
            );
            expect(readBookmarkRoute(tree, url.searchParams)).toEqual({
                selectedLocation: undefined,
                ...state,
            });
        }
    });
    test('resolves stable IDs after categories are reordered', () => {
        const reordered = [tree[1], tree[0]];
        const url = new URL(
            createBookmarkRoute(tree, {
                location: work,
                selectedLocation: projects,
                query: '',
            }),
            'https://example.com'
        );
        expect(readBookmarkRoute(reordered, url.searchParams)).toEqual({
            location: { categoryIndex: 1, folderPath: [] },
            selectedLocation: { categoryIndex: 1, folderPath: ['projects'] },
            query: '',
        });
    });
    test('finds a folder after it is moved and rejects a stale unrelated layer', () => {
        const moved = [
            { ...tree[0], children: [] },
            { ...tree[1], children: tree[0].children },
        ];
        expect(
            readBookmarkRoute(
                moved,
                new URLSearchParams('folder=projects&layer=work')
            )
        ).toEqual({
            location: root,
            selectedLocation: { categoryIndex: 1, folderPath: ['projects'] },
            query: '',
        });
    });
    test('handles deleted folders, link IDs, unrelated layers, and empty bookmark trees', () => {
        expect(
            readBookmarkRoute(tree, new URLSearchParams('folder=deleted'))
        ).toEqual({ location: root, selectedLocation: undefined, query: '' });
        expect(
            readBookmarkRoute(tree, new URLSearchParams('folder=example'))
        ).toEqual({ location: root, selectedLocation: undefined, query: '' });
        expect(
            readBookmarkRoute(
                tree,
                new URLSearchParams('folder=projects&layer=archive')
            ).location
        ).toEqual(root);
        expect(
            readBookmarkRoute(
                [],
                new URLSearchParams('folder=projects&layer=work&q=test')
            )
        ).toEqual({
            location: root,
            selectedLocation: undefined,
            query: 'test',
        });
    });
});
