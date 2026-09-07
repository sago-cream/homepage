import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '@/server/apiError';
import { deleteWallpaperObject } from '@/server/wallpaperStorage';
import type { Database } from '@/types/database';
import type { WallpaperAsset } from '../../shared/wallpaper';
import {
    getWallpaperUploadPrefix,
    isWallpaperContentType,
    wallpaperMaxDimensionPx,
    wallpaperMaxFileSizeBytes,
} from '../../shared/wallpaper';

interface WallpaperRow {
    content_type: string;
    height: number;
    object_key: string;
    size_bytes: number;
    updated_at: string;
    width: number;
}

const getWallpaperUrl = (key: string, download = false): string => {
    const parameters = new URLSearchParams({ key });

    if (download) {
        parameters.set('download', '1');
    }

    return `/api/wallpaper-file?${parameters.toString()}`;
};

const mapWallpaperRow = (row: WallpaperRow): WallpaperAsset => {
    if (!isWallpaperContentType(row.content_type)) {
        throw new ApiError('Stored wallpaper has an unsupported type.', 500);
    }

    return {
        contentType: row.content_type,
        downloadUrl: getWallpaperUrl(row.object_key, true),
        height: row.height,
        pathname: row.object_key,
        sizeBytes: row.size_bytes,
        uploadedAt: row.updated_at,
        url: getWallpaperUrl(row.object_key),
        width: row.width,
    };
};

const validateWallpaperAsset = (
    userId: string,
    asset: WallpaperAsset
): void => {
    if (!isWallpaperContentType(asset.contentType)) {
        throw new ApiError('Unsupported wallpaper image type.', 400);
    }

    if (
        !Number.isInteger(asset.sizeBytes) ||
        asset.sizeBytes <= 0 ||
        asset.sizeBytes > wallpaperMaxFileSizeBytes
    ) {
        throw new ApiError('Wallpaper file is too large.', 400);
    }

    if (
        !Number.isInteger(asset.width) ||
        !Number.isInteger(asset.height) ||
        asset.width <= 0 ||
        asset.height <= 0 ||
        asset.width > wallpaperMaxDimensionPx ||
        asset.height > wallpaperMaxDimensionPx
    ) {
        throw new ApiError('Wallpaper dimensions are not supported.', 400);
    }

    if (!asset.pathname.startsWith(`${getWallpaperUploadPrefix(userId)}/`)) {
        throw new ApiError('Wallpaper path does not belong to this user.', 400);
    }
};

const wallpaperColumns =
    'object_key, content_type, size_bytes, width, height, updated_at';

export const getUserWallpaper = async (
    client: SupabaseClient<Database>,
    userId: string
): Promise<WallpaperAsset | undefined> => {
    const { data, error } = await client
        .from('user_wallpapers')
        .select(wallpaperColumns)
        .eq('user_id', userId)
        .maybeSingle();

    if (error !== null) {
        throw new ApiError('Wallpaper could not be loaded.', 502);
    }

    return data === null ? undefined : mapWallpaperRow(data as WallpaperRow);
};

export const getUserWallpaperObject = async (
    client: SupabaseClient<Database>,
    userId: string,
    key: string
): Promise<WallpaperAsset['contentType']> => {
    const { data, error } = await client
        .from('user_wallpapers')
        .select('content_type, object_key')
        .eq('user_id', userId)
        .eq('object_key', key)
        .maybeSingle();

    if (
        error !== null ||
        data === null ||
        !isWallpaperContentType(data.content_type)
    ) {
        throw new ApiError('Wallpaper was not found.', 404);
    }

    return data.content_type;
};

export const saveUserWallpaper = async (
    client: SupabaseClient<Database>,
    userId: string,
    asset: WallpaperAsset
): Promise<WallpaperAsset> => {
    validateWallpaperAsset(userId, asset);

    const { data: previous, error: previousError } = await client
        .from('user_wallpapers')
        .select('object_key')
        .eq('user_id', userId)
        .maybeSingle();

    if (previousError !== null) {
        throw new ApiError('Wallpaper metadata could not be loaded.', 502);
    }

    const { data, error } = await client
        .from('user_wallpapers')
        .upsert(
            {
                content_type: asset.contentType,
                height: asset.height,
                object_key: asset.pathname,
                size_bytes: asset.sizeBytes,
                updated_at: new Date().toISOString(),
                user_id: userId,
                width: asset.width,
            },
            { onConflict: 'user_id' }
        )
        .select(wallpaperColumns)
        .single();

    if (error !== null) {
        throw new ApiError('Wallpaper could not be saved.', 502);
    }

    if (previous !== null && previous.object_key !== asset.pathname) {
        await deleteWallpaperObject(client, previous.object_key).catch(
            (deleteError: unknown) => {
                console.error(
                    'Failed to delete previous wallpaper:',
                    deleteError
                );
            }
        );
    }

    return mapWallpaperRow(data as WallpaperRow);
};

export const clearUserWallpaper = async (
    client: SupabaseClient<Database>,
    userId: string
): Promise<void> => {
    const { data, error } = await client
        .from('user_wallpapers')
        .delete()
        .eq('user_id', userId)
        .select('object_key')
        .maybeSingle();

    if (error !== null) {
        throw new ApiError('Wallpaper could not be removed.', 502);
    }

    if (data !== null) {
        // Metadata deletion is authoritative. A failed cleanup must not leave clients displaying a
        // wallpaper that no longer exists in the database.
        await deleteWallpaperObject(client, data.object_key).catch(
            (deleteError: unknown) => {
                console.error(
                    'Failed to delete removed wallpaper:',
                    deleteError
                );
            }
        );
    }
};
