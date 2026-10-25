export interface BookmarkLocation {
    categoryIndex: number;
    folderPath: string[];
}

export interface BookmarkDeletion extends BookmarkLocation {
    kind: 'bookmark' | 'category' | 'folder';
}

export const getLocationAfterDeletion = (
    location: BookmarkLocation,
    deleted: BookmarkDeletion
): BookmarkLocation => {
    if (location.categoryIndex === -1 || deleted.kind === 'bookmark') {
        return location;
    }
    if (deleted.kind === 'category') {
        if (location.categoryIndex === deleted.categoryIndex) {
            return { categoryIndex: -1, folderPath: [] };
        }
        return location.categoryIndex > deleted.categoryIndex
            ? { ...location, categoryIndex: location.categoryIndex - 1 }
            : location;
    }
    return location.categoryIndex === deleted.categoryIndex &&
        deleted.folderPath.every(
            (id, index) => location.folderPath[index] === id
        )
        ? { ...location, folderPath: deleted.folderPath.slice(0, -1) }
        : location;
};
