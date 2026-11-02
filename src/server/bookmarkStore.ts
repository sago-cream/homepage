import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '@/server/apiError';
import type {
    BookmarkCategoryData,
    BookmarkTrashItemData,
} from '@/types/bookmarks';
import type { Database, Json } from '@/types/database';
import { coerceBookmarkTrash, coerceBookmarkTree } from '@/utils/bookmarks';

interface BookmarkData {
    categories: BookmarkCategoryData[];
    trash: BookmarkTrashItemData[];
}

const validateBookmarkTree = (value: unknown): BookmarkCategoryData[] => {
    const bookmarkTree = coerceBookmarkTree(value);

    if (bookmarkTree === undefined) {
        throw new ApiError('Bookmarks are invalid.', 400);
    }

    return bookmarkTree;
};

const validateBookmarkTrash = (value: unknown): BookmarkTrashItemData[] => {
    const trash = coerceBookmarkTrash(value);
    if (trash === undefined) {
        throw new ApiError('Bookmark trash is invalid.', 400);
    }
    return trash;
};

export const getUserBookmarks = async (
    client: SupabaseClient<Database>,
    userId: string
): Promise<BookmarkData | undefined> => {
    const { data, error } = await client
        .from('user_bookmarks')
        .select('categories, trash')
        .eq('user_id', userId)
        .maybeSingle();

    if (error !== null) {
        throw new ApiError('Bookmarks could not be loaded.', 502);
    }

    return data === null
        ? undefined
        : {
              categories: validateBookmarkTree(data.categories),
              trash: validateBookmarkTrash(data.trash),
          };
};

export const saveUserBookmarks = async (
    client: SupabaseClient<Database>,
    userId: string,
    value: { categories: unknown; trash: unknown }
): Promise<BookmarkData> => {
    const bookmarkTree = validateBookmarkTree(value.categories);
    const trash = validateBookmarkTrash(value.trash);
    const { data, error } = await client
        .from('user_bookmarks')
        .upsert(
            {
                categories: bookmarkTree as unknown as Json,
                trash: trash as unknown as Json,
                updated_at: new Date().toISOString(),
                user_id: userId,
            },
            { onConflict: 'user_id' }
        )
        .select('categories, trash')
        .single();

    if (error !== null) {
        throw new ApiError('Bookmarks could not be saved.', 502);
    }

    return {
        categories: validateBookmarkTree(data.categories),
        trash: validateBookmarkTrash(data.trash),
    };
};
