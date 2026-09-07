import type {
    BookmarkCategoryData,
    BookmarkFolderData,
    BookmarkNodeData,
} from '@/types/bookmarks';
import {
    getBookmarkRootNodes,
    isBookmarkRootCategory,
    replaceBookmarkRootNodes,
} from './bookmarks';

interface BookmarkLocationInput {
    categoryIndex: number;
    folderPath?: string[];
}
const getNodesAtFolderPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[]
): readonly BookmarkNodeData[] | undefined => {
    if (folderPath.length === 0) {
        return nodes;
    }

    const folder = nodes.find(
        (node): node is BookmarkFolderData =>
            node.type === 'folder' && node.id === folderPath[0]
    );

    return folder === undefined
        ? undefined
        : getNodesAtFolderPath(folder.children, folderPath.slice(1));
};

const updateNodesAtFolderPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[],
    updateNodes: (
        nodes: readonly BookmarkNodeData[]
    ) => BookmarkNodeData[] | undefined
): BookmarkNodeData[] | undefined => {
    if (folderPath.length === 0) {
        return updateNodes(nodes);
    }

    const folderId = folderPath[0];
    const remainingPath = folderPath.slice(1);

    for (const [nodeIndex, node] of nodes.entries()) {
        if (node.type !== 'folder' || node.id !== folderId) {
            continue;
        }

        const nextChildren = updateNodesAtFolderPath(
            node.children,
            remainingPath,
            updateNodes
        );

        if (nextChildren === undefined) {
            return undefined;
        }

        return nodes.map((currentNode, currentIndex) =>
            currentIndex === nodeIndex
                ? {
                      ...node,
                      children: nextChildren,
                  }
                : currentNode
        );
    }

    return undefined;
};

export const moveBookmarkTreeNode = (
    bookmarkTree: readonly BookmarkCategoryData[],
    source: BookmarkLocationInput,
    nodeId: string,
    destination: BookmarkLocationInput,
    destinationIndex?: number
): BookmarkCategoryData[] | undefined => {
    const rootNodes = getBookmarkRootNodes(bookmarkTree);
    const toRootPath = (
        location: BookmarkLocationInput
    ): string[] | undefined => {
        if (location.categoryIndex === -1) {
            return [];
        }
        const category = bookmarkTree.at(location.categoryIndex);
        if (!category) {
            return undefined;
        }
        return [
            ...(isBookmarkRootCategory(category) ? [] : [category.id]),
            ...(location.folderPath ?? []),
        ];
    };
    const sourcePath = toRootPath(source);
    const destinationPath = toRootPath(destination);
    if (!sourcePath || !destinationPath) {
        return undefined;
    }
    const sourceNodes = getNodesAtFolderPath(rootNodes, sourcePath);
    const destinationNodes = getNodesAtFolderPath(rootNodes, destinationPath);
    const sourceIndex =
        sourceNodes?.findIndex((node) => node.id === nodeId) ?? -1;
    const node = sourceNodes?.at(sourceIndex);
    if (
        sourceIndex < 0 ||
        !node ||
        !destinationNodes ||
        (node.type === 'folder' && destinationPath.includes(node.id))
    ) {
        return undefined;
    }
    const sameLocation = sourcePath.join('/') === destinationPath.join('/');
    if (sameLocation && destinationIndex === undefined) {
        return undefined;
    }
    let index = Math.max(
        0,
        Math.min(
            destinationIndex ?? destinationNodes.length,
            destinationNodes.length
        )
    );
    if (sameLocation && sourceIndex < index) {
        index--;
    }
    if (sameLocation && sourceIndex === index) {
        return undefined;
    }
    const withoutSource = updateNodesAtFolderPath(
        rootNodes,
        sourcePath,
        (nodes) => nodes.filter((item) => item.id !== nodeId)
    );
    if (!withoutSource) {
        return undefined;
    }
    const moved = updateNodesAtFolderPath(
        withoutSource,
        destinationPath,
        (nodes) => {
            const result = [...nodes];
            result.splice(index, 0, node);
            return result;
        }
    );
    return moved === undefined
        ? undefined
        : replaceBookmarkRootNodes(bookmarkTree, moved);
};
