/* eslint-disable @typescript-eslint/promise-function-async, @typescript-eslint/require-await -- Async act callbacks flush state and deferred responses control request ordering. */
import { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import type { BookmarkCategoryData } from '@/types/bookmarks';
import { useBookmarks } from './useBookmarks';
import type { BookmarkControls } from './useBookmarks';

const category: BookmarkCategoryData = {
    category: 'Work',
    children: [],
    icon: '💼',
    id: 'work',
    links: [],
};
let browser: Window;
let root: Root;
let controls: BookmarkControls;
let userId: string | undefined;
let authenticated: boolean;
let token: string | undefined;
const originalFetch = globalThis.fetch;
const globals = ['window', 'document', 'localStorage', 'DOMParser'] as const;
const originals = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
);
const getToken = () => Promise.resolve(token);

function Consumer() {
    controls = useBookmarks(
        authenticated
            ? {
                  auth: {
                      getToken,
                      isLoaded: true,
                      isSignedIn: userId !== undefined,
                      userId,
                  },
              }
            : {}
    );
    return <span />;
}
const render = async () => {
    await act(async () => {
        root.render(<Consumer />);
        await Promise.resolve();
    });
};
const readCache = (id: string) =>
    JSON.parse(
        browser.localStorage.getItem(`homepage.bookmarks.user.${id}`) ?? '{}'
    ) as { categories?: BookmarkCategoryData[] };

beforeEach(() => {
    authenticated = true;
    userId = 'user-a';
    token = 'token';
    browser = new Window({ url: 'http://localhost' });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    for (const key of globals) {
        Object.defineProperty(globalThis, key, {
            configurable: true,
            value: browser[key],
        });
    }
    root = createRoot(document.createElement('div'));
    globalThis.fetch = mock(() =>
        Promise.resolve(Response.json({ categories: [category], trash: [] }))
    ) as unknown as typeof fetch;
});

afterEach(async () => {
    await act(async () => {
        root.unmount();
        await Promise.resolve();
    });
    globalThis.fetch = originalFetch;
    await browser.happyDOM.close();
    for (const [key, descriptor] of originals) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
});

test('deleting the final category persists an empty tree and retains restorable trash', async () => {
    const requests: RequestInit[] = [];
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
            requests.push(init);
            return Promise.resolve(
                Response.json(JSON.parse(init.body as string))
            );
        }
        return Promise.resolve(
            Response.json({ categories: [category], trash: [] })
        );
    }) as unknown as typeof fetch;
    await render();
    let trashId: false | string = false;
    await act(async () => {
        trashId = controls.deleteCategory(0);
    });
    expect(controls.bookmarkTree).toEqual([]);
    expect(controls.bookmarkTrash).toHaveLength(1);
    expect(controls.saveState).toBe('saved');
    expect(JSON.parse(requests[0]?.body as string)).toMatchObject({
        categories: [],
    });
    expect(readCache('user-a').categories).toEqual([]);
    await act(async () => {
        expect(controls.restoreTrashItem(String(trashId))).toBe(true);
    });
    expect(controls.bookmarkTree[0]?.id).toBe('work');
    expect(controls.bookmarkTrash).toEqual([]);
});

test('an older save response cannot overwrite the cache of a newer edit', async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    let saves = 0;
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
            saves++;
            return saves === 1 ? first.promise : second.promise;
        }
        return Promise.resolve(Response.json({ categories: [category] }));
    }) as unknown as typeof fetch;
    await render();
    await act(async () => {
        controls.updateCategory(0, { category: 'First' });
    });
    await act(async () => {
        controls.updateCategory(0, { category: 'Second' });
    });
    await act(async () => {
        first.resolve(
            Response.json({ categories: [{ ...category, category: 'First' }] })
        );
    });
    expect(readCache('user-a').categories?.[0]?.category).toBe('Second');
    expect(controls.saveState).toBe('saving');
    await act(async () => {
        second.resolve(
            Response.json({ categories: [{ ...category, category: 'Second' }] })
        );
    });
    expect(controls.saveState).toBe('saved');
});

test('switching accounts discards queued saves and isolates in-flight failures', async () => {
    const pending = Promise.withResolvers<Response>();
    let saves = 0;
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
            saves++;
            return saves === 1
                ? pending.promise
                : Promise.resolve(
                      Response.json(JSON.parse(init.body as string))
                  );
        }
        return Promise.resolve(
            Response.json({ categories: [{ ...category, category: userId }] })
        );
    }) as unknown as typeof fetch;
    await render();
    await act(async () => {
        controls.updateCategory(0, { category: 'Old account first' });
    });
    await act(async () => {
        controls.updateCategory(0, { category: 'Old account queued' });
    });
    userId = 'user-b';
    await render();
    await act(async () => {
        controls.updateCategory(0, { category: 'New account' });
    });
    expect(saves).toBe(2);
    expect(controls.saveState).toBe('saved');
    await act(async () => {
        pending.resolve(
            Response.json({ error: 'Late failure' }, { status: 502 })
        );
    });
    expect(saves).toBe(2);
    expect(controls.status).toBeUndefined();
    expect(controls.bookmarkTree[0]?.category).toBe('New account');
    expect(browser.localStorage.getItem('homepage.bookmarks.active-user')).toBe(
        'user-b'
    );
});

test('a successful old-account save cannot reactivate its cache after sign-out', async () => {
    const pending = Promise.withResolvers<Response>();
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) =>
        init?.method === 'POST'
            ? pending.promise
            : Promise.resolve(Response.json({ categories: [category] }))
    ) as unknown as typeof fetch;
    await render();
    await act(async () => {
        controls.updateCategory(0, { category: 'Old account' });
    });
    userId = undefined;
    await render();
    await act(async () => {
        pending.resolve(Response.json({ categories: [category] }));
    });
    expect(controls.bookmarkTree).toEqual([]);
    expect(
        browser.localStorage.getItem('homepage.bookmarks.active-user')
    ).toBeNull();
});

test('missing credentials report a failed save instead of staying in saving state', async () => {
    await render();
    token = undefined;
    await act(async () => {
        controls.updateCategory(0, { category: 'Unsynced' });
    });
    expect(controls.saveState).toBe('error');
    expect(controls.status?.messageKey).toBe('bookmarksSyncFailed');
});

test('guest bookmark editing can clear a category icon', async () => {
    authenticated = false;
    browser.localStorage.setItem(
        'homepage.bookmarks',
        JSON.stringify({ categories: [category], trash: [] })
    );
    await render();
    await act(async () => {
        controls.updateCategory(0, { category: 'Work', icon: '' });
    });
    expect(controls.bookmarkTree[0]?.icon).toBeUndefined();
});

test('unavailable storage cannot crash authenticated initialization or sign-out', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
            throw new Error('Storage blocked');
        },
    });
    await render();
    expect(controls.bookmarkTree[0]?.id).toBe('work');
    userId = undefined;
    await render();
    expect(controls.bookmarkTree).toEqual([]);
    expect(controls.isLoading).toBe(false);
});

test('an import finishing after an account switch cannot replace the new account bookmarks', async () => {
    const contents = Promise.withResolvers<string>();
    await render();
    let importing: Promise<void> | undefined;
    await act(async () => {
        importing = controls.importBookmarks({
            text: () => contents.promise,
        } as File);
    });
    userId = 'user-b';
    await render();
    await act(async () => {
        contents.resolve(
            '<DL><DT><A HREF="https://example.com">Imported</A></DL>'
        );
        await importing;
    });
    expect(controls.bookmarkTree).toEqual([category]);
    expect(controls.saveState).toBe('saved');
});
