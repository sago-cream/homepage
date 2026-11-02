/* eslint-disable @typescript-eslint/promise-function-async, no-await-in-loop -- Controlled worker scenarios run sequentially with independent caches. */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, mock, test } from 'bun:test';

const script = readFileSync(
    new URL('../../public/sw.js', import.meta.url),
    'utf8'
);
interface FetchEvent {
    request: { method: string; mode: string; url: string };
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (task: Promise<unknown>) => void;
}
const response = (body: string) => {
    const result = new Response(body);
    Object.defineProperty(result, 'type', { value: 'basic' });
    return result;
};
async function readBody(result: Promise<Response> | undefined) {
    const value = await result;
    return await value?.text();
}

function worker({
    cached,
    fetcher = mock(() => Promise.resolve(response('network'))),
    unavailable = false,
    full = false,
    unreadable = false,
}: {
    cached?: Response;
    fetcher?: ReturnType<typeof mock<() => Promise<Response>>>;
    unavailable?: boolean;
    full?: boolean;
    unreadable?: boolean;
} = {}) {
    const listeners = new Map<string, (event: FetchEvent) => void>();
    const put = mock((_request: unknown, _response: Response) =>
        full ? Promise.reject(new Error('Quota exceeded')) : Promise.resolve()
    );
    const match = mock(() =>
        unreadable
            ? Promise.reject(new Error('Cache unreadable'))
            : Promise.resolve(cached)
    );
    runInNewContext(script, {
        URL,
        fetch: fetcher,
        self: {
            location: new URL('https://homepage.example'),
            addEventListener: (
                type: string,
                listener: (event: FetchEvent) => void
            ) => listeners.set(type, listener),
        },
        caches: {
            open: () =>
                unavailable
                    ? Promise.reject(new Error('Cache unavailable'))
                    : Promise.resolve({ match, put }),
        },
    });
    const navigate = (path = '/', mode = 'navigate', method = 'GET') => {
        let result: Promise<Response> | undefined;
        const lifetime: Array<Promise<unknown>> = [];
        listeners.get('fetch')?.({
            request: {
                method,
                mode,
                url: new URL(path, 'https://homepage.example').href,
            },
            respondWith: (value) => {
                result = value;
            },
            waitUntil: (task) => {
                lifetime.push(task);
            },
        });
        return { result, lifetime };
    };
    return { navigate, fetcher, put };
}

test('cached navigation returns immediately and keeps the shell refresh alive', async () => {
    const pending = Promise.withResolvers<Response>();
    const { navigate, put } = worker({
        cached: response('cached'),
        fetcher: mock(() => pending.promise),
    });
    const event = navigate('/?bookmarks=work');
    expect(await readBody(event.result)).toBe('cached');
    expect(event.lifetime).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();
    pending.resolve(response('fresh'));
    await Promise.all(event.lifetime);
    expect(put).toHaveBeenCalledTimes(1);
    expect(await put.mock.calls[0]?.[1]?.text()).toBe('fresh');
});

test('unavailable or unreadable cache falls back to the network', async () => {
    for (const options of [{ unavailable: true }, { unreadable: true }]) {
        const { navigate } = worker(options);
        const event = navigate();
        expect(await readBody(event.result)).toBe('network');
        await Promise.all(event.lifetime);
    }
});

test('a full cache cannot turn successful navigation and asset fetches into failures', async () => {
    for (const [path, mode] of [
        ['/', 'navigate'],
        ['/_next/static/app.js', 'cors'],
    ]) {
        const { navigate, put } = worker({ full: true });
        const event = navigate(path, mode);
        expect(await readBody(event.result)).toBe('network');
        expect(put).toHaveBeenCalledTimes(1);
        await Promise.all(event.lifetime);
    }
});

test('offline navigation uses the cached shell and handles background failure', async () => {
    const { navigate } = worker({
        cached: response('offline'),
        fetcher: mock(() => Promise.reject(new Error('Offline'))),
    });
    const event = navigate();
    expect(await readBody(event.result)).toBe('offline');
    await Promise.all(event.lifetime);
});

test('cached static assets avoid another network request', async () => {
    const { navigate, fetcher } = worker({ cached: response('asset') });
    const event = navigate('/_next/static/app.js', 'cors');
    expect(await readBody(event.result)).toBe('asset');
    expect(fetcher).not.toHaveBeenCalled();
});

test('API, auth, cross-origin, and non-GET requests bypass the shell cache', () => {
    const { navigate, fetcher } = worker();
    for (const path of [
        '/api/bookmarks',
        '/auth/callback',
        'https://other.example/',
    ]) {
        expect(navigate(path).result).toBeUndefined();
    }
    expect(navigate('/', 'navigate', 'POST').result).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
});
