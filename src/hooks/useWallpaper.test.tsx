/* eslint-disable @typescript-eslint/promise-function-async -- Deferred mocks deliberately return controlled promises. */
import { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import type { WallpaperAsset } from '../../shared/wallpaper';
import type { WallpaperControls } from './useWallpaper';

let userId: string | undefined = 'user-a';
await mock.module('@/auth/AuthProvider', () => ({
    useHomepageAuth: () => ({
        getToken: () => Promise.resolve('token'),
        isLoaded: true,
        isSignedIn: userId !== undefined,
        userId,
    }),
}));
const { WallpaperProvider, useWallpaper } = await import('./useWallpaper');
const asset: WallpaperAsset = {
    contentType: 'image/webp',
    downloadUrl: '/old.webp',
    height: 1,
    pathname: 'old.webp',
    sizeBytes: 1,
    uploadedAt: '2026-09-07',
    url: '/old.webp',
    width: 1,
};
let browser: Window;
const cache = {
    get: (key: string) => browser.localStorage.getItem(key) ?? undefined,
    has: (key: string) => browser.localStorage.getItem(key) !== null,
};
const styles = {
    has: (key: string) =>
        browser.document.documentElement.style.getPropertyValue(key) !== '',
};
let dataset: DOMStringMap;
const consumers: WallpaperControls[] = [];
let renderer: Root | undefined;
const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document'
);
const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
);

function Consumer({ index }: { index: number }) {
    const controls = useWallpaper();
    if (controls) {
        consumers[index] = controls;
    }
    return <span />;
}
const tree = () => (
    <WallpaperProvider>
        <Consumer index={0} />
        <Consumer index={1} />
    </WallpaperProvider>
);
const mount = async () => {
    await act(async () => {
        renderer = createRoot(globalThis.document.createElement('div'));
        renderer.render(tree());
        await Promise.resolve();
    });
};
const deferred = () => Promise.withResolvers<Response>();

beforeEach(() => {
    userId = 'user-a';
    browser = new Window({ url: 'http://localhost' });
    ({ dataset } = browser.document.documentElement);
    browser.localStorage.setItem(
        'homepage.wallpaper.user-a',
        JSON.stringify(asset)
    );
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: browser,
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: browser.document,
    });
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: browser.localStorage,
    });
});
afterEach(async () => {
    await act(async () => {
        renderer?.unmount();
        await Promise.resolve();
    });
    renderer = undefined;
    globalThis.fetch = originalFetch;
    if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
        Reflect.deleteProperty(globalThis, 'window');
    }
    await browser.happyDOM.close();
    if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
    } else {
        Reflect.deleteProperty(globalThis, 'document');
    }
    if (originalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalStorage);
    } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
    }
});

test('both menus share one load without a state/refetch feedback loop', async () => {
    const fetcher = mock(() =>
        Promise.resolve(Response.json({ wallpaper: asset }))
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await mount();
    await act(async () => {
        renderer?.render(tree());
        await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(consumers[0]).toBe(consumers[1]);
    expect(consumers[0].wallpaper).toEqual(asset);
});

test('a delayed GET cannot restore wallpaper after deletion', async () => {
    const load = deferred();
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) =>
        init?.method === 'DELETE'
            ? Promise.resolve(Response.json({}))
            : load.promise
    ) as unknown as typeof fetch;
    await mount();
    await act(() => consumers[0].clearWallpaper());
    await act(async () => {
        await Promise.resolve();
        load.resolve(Response.json({ wallpaper: asset }));
    });
    expect(consumers[0].wallpaper).toBeUndefined();
    expect(consumers[1].wallpaper).toBeUndefined();
    expect(cache.has('homepage.wallpaper.user-a')).toBe(false);
    expect(dataset.wallpaper).toBeUndefined();
    expect(styles.has('--wallpaper-image')).toBe(false);
});

test('simultaneous menu actions send one DELETE and share busy state', async () => {
    const deletion = deferred();
    const fetcher = mock((_url: unknown, init?: RequestInit) =>
        init?.method === 'DELETE'
            ? deletion.promise
            : Promise.resolve(Response.json({ wallpaper: asset }))
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await mount();
    let pending: Promise<void>;
    await act(async () => {
        await Promise.resolve();
        pending = consumers[0].clearWallpaper();
        await consumers[1].clearWallpaper();
    });
    expect(consumers[0].isBusy).toBe(true);
    expect(consumers[1].isBusy).toBe(true);
    expect(
        fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')
    ).toHaveLength(1);
    await act(async () => {
        deletion.resolve(Response.json({}));
        await pending;
    });
    expect(consumers[1].isBusy).toBe(false);
});

test('a failed DELETE preserves wallpaper and allows retry', async () => {
    let fail = true;
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
            return Promise.resolve(
                fail
                    ? Response.json({ error: 'Remove failed' }, { status: 502 })
                    : Response.json({})
            );
        }
        return Promise.resolve(Response.json({ wallpaper: asset }));
    }) as unknown as typeof fetch;
    await mount();
    await act(() => consumers[0].clearWallpaper());
    expect(consumers[0].wallpaper).toEqual(asset);
    expect(consumers[0].error).toBe('Remove failed');
    expect(consumers[0].isBusy).toBe(false);
    fail = false;
    await act(() => consumers[0].clearWallpaper());
    expect(consumers[0].wallpaper).toBeUndefined();
    expect(consumers[0].error).toBeUndefined();
});

test('old account deletion cannot clear the new account wallpaper', async () => {
    const deletion = deferred();
    const nextAsset = { ...asset, url: '/new.webp' };
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) =>
        init?.method === 'DELETE'
            ? deletion.promise
            : Promise.resolve(
                  Response.json({
                      wallpaper: userId === 'user-a' ? asset : nextAsset,
                  })
              )
    ) as unknown as typeof fetch;
    await mount();
    let pending: Promise<void>;
    await act(async () => {
        await Promise.resolve();
        pending = consumers[0].clearWallpaper();
    });
    userId = 'user-b';
    await act(async () => {
        renderer?.render(tree());
        await Promise.resolve();
    });
    await act(async () => {
        deletion.resolve(Response.json({}));
        await pending;
    });
    expect(consumers[0].wallpaper).toEqual(nextAsset);
    expect(JSON.parse(cache.get('homepage.wallpaper.user-b') ?? '{}')).toEqual(
        nextAsset
    );
    expect(consumers[0].isBusy).toBe(false);
});

test('unmounted controller ignores an outstanding load', async () => {
    const load = deferred();
    globalThis.fetch = mock(() => load.promise) as unknown as typeof fetch;
    await mount();
    await act(async () => {
        renderer?.unmount();
        await Promise.resolve();
    });
    await act(async () => {
        await Promise.resolve();
        load.resolve(
            Response.json({ wallpaper: { ...asset, url: '/late.webp' } })
        );
    });
    expect(dataset.wallpaper).toBeUndefined();
    expect(JSON.parse(cache.get('homepage.wallpaper.user-a') ?? '{}')).toEqual(
        asset
    );
});

test('an empty server result clears cached wallpaper without reloading', async () => {
    const fetcher = mock(() => Promise.resolve(Response.json({})));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    await mount();
    await act(async () => {
        renderer?.render(tree());
        await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(consumers[0].wallpaper).toBeUndefined();
    expect(cache.has('homepage.wallpaper.user-a')).toBe(false);
    expect(styles.has('--wallpaper-image')).toBe(false);
});

test('a delayed GET cannot overwrite a newly uploaded wallpaper', async () => {
    const load = deferred();
    const uploaded = { ...asset, url: '/uploaded.webp' };
    const originalBitmap = Object.getOwnPropertyDescriptor(
        globalThis,
        'createImageBitmap'
    );
    Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        value: () =>
            Promise.resolve({
                width: 1,
                height: 1,
                close: () => undefined,
            }),
    });
    Object.defineProperty(browser.HTMLCanvasElement.prototype, 'getContext', {
        value: () => ({ drawImage: () => undefined }),
    });
    Object.defineProperty(browser.HTMLCanvasElement.prototype, 'toBlob', {
        value: (callback: BlobCallback) => {
            callback(new Blob(['image'], { type: 'image/webp' }));
        },
    });
    globalThis.fetch = mock((_url: unknown, init?: RequestInit) =>
        init?.method === 'POST'
            ? Promise.resolve(Response.json({ wallpaper: uploaded }))
            : load.promise
    ) as unknown as typeof fetch;
    try {
        await mount();
        await act(() =>
            consumers[0].uploadWallpaper(
                new File(['image'], 'wallpaper.png', { type: 'image/png' })
            )
        );
        await act(async () => {
            load.resolve(Response.json({ wallpaper: asset }));
            await Promise.resolve();
        });
        expect(consumers[0].wallpaper).toEqual(uploaded);
        expect(consumers[1].wallpaper).toEqual(uploaded);
        expect(
            JSON.parse(cache.get('homepage.wallpaper.user-a') ?? '{}')
        ).toEqual(uploaded);
        expect(consumers[0].isBusy).toBe(false);
    } finally {
        if (originalBitmap) {
            Object.defineProperty(
                globalThis,
                'createImageBitmap',
                originalBitmap
            );
        } else {
            Reflect.deleteProperty(globalThis, 'createImageBitmap');
        }
    }
});
