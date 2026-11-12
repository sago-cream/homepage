export interface BookmarkLinkData {
    feed?: boolean;
    feedOrder?: number;
    id: string;
    title: string;
    type: 'link';
    url: string;
}

export interface BookmarkFolderData {
    children: BookmarkNodeData[];
    id: string;
    icon?: string;
    title: string;
    type: 'folder';
}

export type BookmarkNodeData = BookmarkFolderData | BookmarkLinkData;

export interface BookmarkCategoryData {
    category: string;
    children: BookmarkNodeData[];
    id: string;
    icon?: string;
    links: BookmarkLinkData[];
}

export interface BookmarkTrashItemData {
    categoryId?: string;
    deletedAt: string;
    folderPath: string[];
    id: string;
    item: BookmarkCategoryData | BookmarkNodeData;
    kind: 'bookmark' | 'category' | 'folder';
    label: string;
}
