/* eslint-disable @typescript-eslint/promise-function-async, unicorn/no-null -- Match Supabase query response shapes. */
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, mock, test } from 'bun:test';

import type { Database } from '@/types/database';
import { coerceBookmarkTree } from '@/utils/bookmarks';

mock.module('server-only', () => ({}));
const { getUserBookmarks, saveUserBookmarks } = await import('./bookmarkStore');

test('empty bookmarks are valid while missing and malformed trees remain invalid', () => {
    expect(coerceBookmarkTree([])).toEqual([]);
    for (const value of [
        undefined,
        null,
        {},
        [null],
        [{ category: 'Invalid' }],
    ]) {
        expect(coerceBookmarkTree(value)).toBeUndefined();
    }
});

test('empty collections round-trip through the bookmark store with trash intact', async () => {
    const trash = [
        {
            deletedAt: '2026-11-02T00:00:00.000Z',
            folderPath: [],
            id: 'trash-work',
            item: { category: 'Work', children: [], id: 'work', links: [] },
            kind: 'category' as const,
            label: 'Work',
        },
    ];
    let row: { categories: unknown; trash: unknown } = {
        categories: [],
        trash,
    };
    const upsert = mock((value: typeof row) => {
        row = value;
        return query;
    });
    const query = {
        eq: () => query,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        select: () => query,
        single: () => Promise.resolve({ data: row, error: null }),
        upsert,
    };
    const client = { from: () => query } as unknown as SupabaseClient<Database>;
    expect(
        await saveUserBookmarks(client, 'user-a', { categories: [], trash })
    ).toEqual({ categories: [], trash });
    expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ categories: [], user_id: 'user-a' }),
        { onConflict: 'user_id' }
    );
    expect(await getUserBookmarks(client, 'user-a')).toEqual({
        categories: [],
        trash,
    });
    await assert.rejects(
        saveUserBookmarks(client, 'user-a', { categories: {}, trash }),
        /Bookmarks are invalid/
    );
    expect(upsert).toHaveBeenCalledTimes(1);
});
