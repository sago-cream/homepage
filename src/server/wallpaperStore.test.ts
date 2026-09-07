/* eslint-disable @typescript-eslint/promise-function-async, unicorn/no-null -- Match Supabase response shapes in query mocks. */
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, mock, spyOn, test } from 'bun:test';

import type { Database } from '@/types/database';

mock.module('server-only', () => ({}));
const { clearUserWallpaper } = await import('./wallpaperStore');

function clientWithDeletion(databaseError: unknown, storageError: unknown) {
    const remove = mock(() => Promise.resolve({ error: storageError }));
    const query = {
        delete: () => query,
        eq: () => query,
        select: () => query,
        maybeSingle: () =>
            Promise.resolve({
                data: { object_key: 'old.webp' },
                error: databaseError,
            }),
    };
    return {
        client: {
            from: () => query,
            storage: { from: () => ({ remove }) },
        } as unknown as SupabaseClient<Database>,
        remove,
    };
}

test('metadata deletion succeeds even when storage cleanup fails', async () => {
    const { client, remove } = clientWithDeletion(
        null,
        new Error('Storage unavailable')
    );
    const log = spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        await clearUserWallpaper(client, 'user-a');
        expect(remove).toHaveBeenCalledWith(['old.webp']);
        expect(log).toHaveBeenCalledTimes(1);
    } finally {
        log.mockRestore();
    }
});

test('database deletion failure rejects without deleting the file', async () => {
    const { client, remove } = clientWithDeletion(
        new Error('Database unavailable'),
        null
    );
    await assert.rejects(
        clearUserWallpaper(client, 'user-a'),
        /Wallpaper could not be removed/
    );
    expect(remove).not.toHaveBeenCalled();
});
