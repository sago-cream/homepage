'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';

import { useHomepageAuth } from '@/auth/AuthProvider';
import { getCssUrlValue } from '@/utils/wallpaperStyle';
import type {
    WallpaperAsset,
    WallpaperContentType,
} from '../../shared/wallpaper';
import {
    getWallpaperUploadPath,
    wallpaperMaxDimensionPx,
    wallpaperMaxFileSizeBytes,
} from '../../shared/wallpaper';

interface WallpaperApiResponse {
    wallpaper?: WallpaperAsset;
}

interface ProcessedWallpaper {
    blob: Blob;
    contentType: WallpaperContentType;
    height: number;
    width: number;
}

export interface WallpaperControls {
    clearWallpaper: () => Promise<void>;
    error: string | undefined;
    isAvailable: boolean;
    isBusy: boolean;
    progress: number | undefined;
    uploadWallpaper: (file: File) => Promise<void>;
    wallpaper: WallpaperAsset | undefined;
}

type CanvasSource = {
    cleanup: () => void;
    height: number;
    source: CanvasImageSource;
    width: number;
};

const wallpaperApiPath = '/api/wallpaper';
const wallpaperUploadApiPath = '/api/wallpaper-upload';
const wallpaperCacheKeyPrefix = 'homepage.wallpaper';
const outputContentType = 'image/webp' satisfies WallpaperContentType;
const outputQualities = [0.92, 0.86, 0.8] as const;

const getWallpaperCacheKey = (userId: string): string =>
    `${wallpaperCacheKeyPrefix}.${userId}`;

const applyWallpaper = (wallpaper: WallpaperAsset | undefined): void => {
    const root = globalThis.document.documentElement;

    if (wallpaper === undefined) {
        delete root.dataset.wallpaper;
        root.style.removeProperty('--wallpaper-image');
        return;
    }

    root.dataset.wallpaper = 'custom';
    root.style.setProperty('--wallpaper-image', getCssUrlValue(wallpaper.url));
};

const readCachedWallpaper = (userId: string): WallpaperAsset | undefined => {
    try {
        const cached = globalThis.localStorage.getItem(
            getWallpaperCacheKey(userId)
        );

        return cached === null
            ? undefined
            : (JSON.parse(cached) as WallpaperAsset);
    } catch {
        return undefined;
    }
};

const writeCachedWallpaper = (
    userId: string,
    wallpaper: WallpaperAsset | undefined
): void => {
    try {
        const key = getWallpaperCacheKey(userId);

        if (wallpaper === undefined) {
            globalThis.localStorage.removeItem(key);
            return;
        }

        globalThis.localStorage.setItem(key, JSON.stringify(wallpaper));
    } catch {
        // Ignore private-mode or storage permission failures.
    }
};

const loadCanvasSource = async (file: File): Promise<CanvasSource> => {
    if ('createImageBitmap' in globalThis) {
        const bitmap = await globalThis.createImageBitmap(file);

        return {
            cleanup: () => {
                bitmap.close();
            },
            height: bitmap.height,
            source: bitmap,
            width: bitmap.width,
        };
    }

    const url = URL.createObjectURL(file);

    return await new Promise<CanvasSource>((resolve, reject) => {
        const image = new Image();
        const removeListeners = () => {
            image.removeEventListener('load', handleLoad);
            image.removeEventListener('error', handleError);
        };
        const cleanupUrl = () => {
            URL.revokeObjectURL(url);
        };
        const handleLoad = () => {
            removeListeners();
            resolve({
                cleanup: cleanupUrl,
                height: image.naturalHeight,
                source: image,
                width: image.naturalWidth,
            });
        };
        const handleError = () => {
            removeListeners();
            cleanupUrl();
            reject(new Error('Wallpaper image could not be decoded.'));
        };

        image.addEventListener('load', handleLoad, { once: true });
        image.addEventListener('error', handleError, { once: true });
        image.src = url;
    });
};

const writeCanvasBlob = async (
    canvas: HTMLCanvasElement,
    quality: number
): Promise<Blob> =>
    await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!(blob instanceof Blob)) {
                    reject(new Error('Wallpaper image could not be encoded.'));
                    return;
                }

                resolve(blob);
            },
            outputContentType,
            quality
        );
    });

const encodeWallpaperBlob = async (
    canvas: HTMLCanvasElement,
    qualityIndex = 0
): Promise<Blob> => {
    if (qualityIndex >= outputQualities.length) {
        throw new Error('Wallpaper image is too large after compression.');
    }

    const quality = outputQualities[qualityIndex];
    const blob = await writeCanvasBlob(canvas, quality);

    if (blob.size <= wallpaperMaxFileSizeBytes) {
        return blob;
    }

    return await encodeWallpaperBlob(canvas, qualityIndex + 1);
};

const processWallpaperFile = async (
    file: File
): Promise<ProcessedWallpaper> => {
    const image = await loadCanvasSource(file);

    try {
        const scale = Math.min(
            1,
            wallpaperMaxDimensionPx / Math.max(image.width, image.height)
        );
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = globalThis.document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (context === null) {
            throw new Error('Wallpaper image could not be processed.');
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image.source, 0, 0, width, height);

        const blob = await encodeWallpaperBlob(canvas);

        return {
            blob,
            contentType: outputContentType,
            height,
            width,
        };
    } finally {
        image.cleanup();
    }
};

const readWallpaperResponse = async (
    response: Response
): Promise<WallpaperApiResponse> => {
    const payload = (await response.json().catch(() => ({}))) as
        | WallpaperApiResponse
        | { error?: string };

    if (!response.ok) {
        throw new Error(
            'error' in payload && typeof payload.error === 'string'
                ? payload.error
                : 'Wallpaper request failed.'
        );
    }

    return payload as WallpaperApiResponse;
};

const useWallpaperController = (): WallpaperControls => {
    const { getToken, isLoaded, isSignedIn, userId } = useHomepageAuth();
    const [wallpaper, setWallpaper] = useState<WallpaperAsset>();
    const [error, setError] = useState<string>();
    const [isBusy, setIsBusy] = useState(false);
    const [progress, setProgress] = useState<number>();
    const revision = useRef(0);
    const mutationPending = useRef(false);
    const isAvailable = isLoaded && isSignedIn && typeof userId === 'string';

    const updateWallpaper = useCallback(
        (ownerId: string, nextWallpaper: WallpaperAsset | undefined) => {
            writeCachedWallpaper(ownerId, nextWallpaper);
            setWallpaper(nextWallpaper);
            applyWallpaper(nextWallpaper);
        },
        []
    );

    const getAuthHeaders = useCallback(async (): Promise<
        Record<'Authorization', string>
    > => {
        const token = await getToken();

        if (typeof token !== 'string') {
            throw new TypeError('Sign in is required.');
        }

        return {
            Authorization: `Bearer ${token}`,
        };
    }, [getToken]);

    const getLoadAuthHeaders = useEffectEvent(getAuthHeaders);

    useEffect(() => {
        revision.current++;
        const currentRevision = revision.current;
        mutationPending.current = false;
        setIsBusy(false);
        setProgress(undefined);
        setError(undefined);
        setWallpaper(undefined);
        applyWallpaper(undefined);

        if (!isLoaded || !isSignedIn || typeof userId !== 'string') {
            return undefined;
        }

        const cached = readCachedWallpaper(userId);
        setWallpaper(cached);
        applyWallpaper(cached);
        const controller = new AbortController();

        const loadWallpaper = async () => {
            try {
                const response = await fetch(wallpaperApiPath, {
                    cache: 'no-store',
                    headers: await getLoadAuthHeaders(),
                    signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(30_000),
                    ]),
                });
                const payload = await readWallpaperResponse(response);

                if (revision.current !== currentRevision) {
                    return;
                }

                updateWallpaper(userId, payload.wallpaper);
            } catch (loadError) {
                if (revision.current !== currentRevision) {
                    return;
                }

                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : 'Wallpaper request failed.'
                );
            }
        };

        loadWallpaper().catch(() => undefined);

        return () => {
            revision.current++;
            controller.abort();
            applyWallpaper(undefined);
        };
    }, [isLoaded, isSignedIn, updateWallpaper, userId]);

    const uploadWallpaper = useCallback(
        async (file: File) => {
            if (!isAvailable || typeof userId !== 'string') {
                setError('Sign in is required.');
                return;
            }

            if (mutationPending.current) {
                return;
            }
            mutationPending.current = true;
            revision.current++;
            const currentRevision = revision.current;
            setError(undefined);
            setIsBusy(true);
            setProgress(0);

            try {
                const processed = await processWallpaperFile(file);
                if (revision.current !== currentRevision) {
                    return;
                }
                const assetId = globalThis.crypto.randomUUID();
                const pathname = getWallpaperUploadPath(
                    userId,
                    assetId,
                    processed.contentType
                );
                const headers = await getAuthHeaders();
                if (revision.current !== currentRevision) {
                    return;
                }
                const formData = new FormData();
                formData.set(
                    'file',
                    processed.blob,
                    pathname.split('/').at(-1) ?? 'wallpaper.webp'
                );
                formData.set('height', String(processed.height));
                formData.set('pathname', pathname);
                formData.set('width', String(processed.width));
                setProgress(50);
                const response = await fetch(wallpaperUploadApiPath, {
                    body: formData,
                    headers,
                    method: 'POST',
                });
                const payload = await readWallpaperResponse(response);

                if (revision.current !== currentRevision) {
                    return;
                }
                updateWallpaper(userId, payload.wallpaper);
            } catch (uploadError) {
                if (revision.current !== currentRevision) {
                    return;
                }
                setError(
                    uploadError instanceof Error
                        ? uploadError.message
                        : 'Wallpaper upload failed.'
                );
            } finally {
                if (revision.current === currentRevision) {
                    mutationPending.current = false;
                    setIsBusy(false);
                    setProgress(undefined);
                }
            }
        },
        [getAuthHeaders, isAvailable, updateWallpaper, userId]
    );

    const clearWallpaper = useCallback(async () => {
        if (!isAvailable || typeof userId !== 'string') {
            setError('Sign in is required.');
            return;
        }

        if (mutationPending.current) {
            return;
        }
        mutationPending.current = true;
        revision.current++;
        const currentRevision = revision.current;
        setError(undefined);
        setIsBusy(true);

        try {
            const headers = await getAuthHeaders();
            if (revision.current !== currentRevision) {
                return;
            }
            const response = await fetch(wallpaperApiPath, {
                headers,
                signal: AbortSignal.timeout(30_000),
                method: 'DELETE',
            });

            if (!response.ok) {
                await readWallpaperResponse(response);
            }

            if (revision.current !== currentRevision) {
                return;
            }
            updateWallpaper(userId, undefined);
        } catch (clearError) {
            if (revision.current !== currentRevision) {
                return;
            }
            setError(
                clearError instanceof Error
                    ? clearError.message
                    : 'Wallpaper remove failed.'
            );
        } finally {
            if (revision.current === currentRevision) {
                mutationPending.current = false;
                setIsBusy(false);
            }
        }
    }, [getAuthHeaders, isAvailable, updateWallpaper, userId]);

    return {
        clearWallpaper,
        error,
        isAvailable,
        isBusy,
        progress,
        uploadWallpaper,
        wallpaper,
    };
};

const WallpaperContext = createContext<WallpaperControls | undefined>(
    undefined
);

export const WallpaperProvider: React.FC<{ children: ReactNode }> = ({
    children,
}) => {
    const controls = useWallpaperController();
    return (
        <WallpaperContext.Provider value={controls}>
            {children}
        </WallpaperContext.Provider>
    );
};

export const useWallpaper = (): WallpaperControls | undefined =>
    useContext(WallpaperContext);
