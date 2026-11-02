const CACHE_PREFIX = 'homepage-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v6`;
const SHELL_PATH = '/';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const IS_LOCALHOST = LOCAL_HOSTNAMES.has(self.location.hostname);

self.addEventListener('install', (event) => {
    if (IS_LOCALHOST) {
        event.waitUntil(self.skipWaiting());
        return;
    }

    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) =>
                cache.add(new Request(SHELL_PATH, { cache: 'reload' }))
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    if (IS_LOCALHOST) {
        event.waitUntil(
            caches
                .keys()
                .then((names) =>
                    Promise.all(
                        names
                            .filter((name) => name.startsWith(CACHE_PREFIX))
                            .map((name) => caches.delete(name))
                    )
                )
                .then(() => self.registration.unregister())
        );
        return;
    }

    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter(
                            (name) =>
                                name.startsWith(CACHE_PREFIX) &&
                                name !== CACHE_NAME
                        )
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

const cacheResponse = async (cache, request, response) => {
    if (cache && response.ok && response.type === 'basic') {
        try {
            await cache.put(request, response.clone());
        } catch {
            // Cache quota or availability must not prevent a network response.
        }
    }

    return response;
};

self.addEventListener('fetch', (event) => {
    if (IS_LOCALHOST) {
        return;
    }

    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === 'navigate' && url.pathname === SHELL_PATH) {
        const cache = caches.open(CACHE_NAME).catch(() => undefined);
        const cached = cache
            .then((store) => store?.match(SHELL_PATH))
            .catch(() => undefined);
        const fresh = fetch(request).then(async (response) =>
            cacheResponse(await cache, SHELL_PATH, response)
        );

        event.waitUntil(fresh.catch(() => undefined));
        event.respondWith(cached.then((response) => response ?? fresh));
        return;
    }

    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches
                .open(CACHE_NAME)
                .catch(() => undefined)
                .then(async (cache) => {
                    const cached = await cache
                        ?.match(request)
                        .catch(() => undefined);

                    return (
                        cached ??
                        fetch(request).then((response) =>
                            cacheResponse(cache, request, response)
                        )
                    );
                })
        );
    }
});
