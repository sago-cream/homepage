import type { BookmarkCategoryData, BookmarkNodeData } from '@/types/bookmarks';
import type { BookmarkLocation } from './bookmarkNavigation';
import { isBookmarkRootCategory } from './bookmarks';

export interface BookmarkRouteState {
    location: BookmarkLocation;
    selectedLocation?: BookmarkLocation;
    query: string;
}

const rootLocation = (): BookmarkLocation => ({
    categoryIndex: -1,
    folderPath: [],
});

const findFolderPath = (
    nodes: readonly BookmarkNodeData[],
    folderId: string,
    parent: readonly string[] = []
): string[] | undefined => {
    for (const node of nodes) {
        if (node.type !== 'folder') {
            continue;
        }
        const path = [...parent, node.id];
        if (node.id === folderId) {
            return path;
        }
        const nested = findFolderPath(node.children, folderId, path);
        if (nested) {
            return nested;
        }
    }
    return undefined;
};

const findLocation = (
    tree: readonly BookmarkCategoryData[],
    folderId: string | null
): BookmarkLocation | undefined => {
    if (!folderId) {
        return undefined;
    }
    for (const [categoryIndex, category] of tree.entries()) {
        if (category.id === folderId && !isBookmarkRootCategory(category)) {
            return { categoryIndex, folderPath: [] };
        }
        const folderPath = findFolderPath(category.children, folderId);
        if (folderPath) {
            return { categoryIndex, folderPath };
        }
    }
    return undefined;
};

const getFolderId = (
    tree: readonly BookmarkCategoryData[],
    location: BookmarkLocation
): string | undefined =>
    location.categoryIndex === -1
        ? undefined
        : (location.folderPath.at(-1) ?? tree.at(location.categoryIndex)?.id);

export const readBookmarkRoute = (
    tree: readonly BookmarkCategoryData[],
    params: URLSearchParams
): BookmarkRouteState => {
    const selectedLocation = findLocation(tree, params.get('folder'));
    let location = rootLocation();
    if (params.has('layer')) {
        location = findLocation(tree, params.get('layer')) ?? rootLocation();
    } else if (selectedLocation && selectedLocation.folderPath.length > 0) {
        location = {
            ...selectedLocation,
            folderPath: selectedLocation.folderPath.slice(0, -1),
        };
    }
    if (
        selectedLocation &&
        location.categoryIndex !== -1 &&
        (location.categoryIndex !== selectedLocation.categoryIndex ||
            location.folderPath.length >= selectedLocation.folderPath.length ||
            !location.folderPath.every(
                (id, index) => id === selectedLocation.folderPath[index]
            ))
    ) {
        location = rootLocation();
    }
    return { location, selectedLocation, query: params.get('q') ?? '' };
};

export const createBookmarkRoute = (
    tree: readonly BookmarkCategoryData[],
    state: BookmarkRouteState
): string => {
    const params = new URLSearchParams();
    const folderId =
        state.selectedLocation && getFolderId(tree, state.selectedLocation);
    const layerId = getFolderId(tree, state.location);
    if (folderId) {
        params.set('folder', folderId);
    }
    if (layerId !== undefined) {
        params.set('layer', layerId);
    } else if (
        state.selectedLocation &&
        state.selectedLocation.folderPath.length > 0
    ) {
        params.set('layer', '');
    }
    if (state.query !== '') {
        params.set('q', state.query);
    }
    const query = params.toString();
    return `/settings/bookmarks${query === '' ? '' : `?${query}`}`;
};
