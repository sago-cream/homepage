import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type {
    BookmarkCategoryData,
    BookmarkFolderData,
    BookmarkLinkData,
    BookmarkNodeData,
    BookmarkTrashItemData,
} from '@/types/bookmarks';
import {
    coerceBookmarkTrash,
    coerceBookmarkTree,
    getBookmarkRootNodes,
    parseBrowserBookmarks,
    replaceBookmarkRootNodes,
    serializeBrowserBookmarks,
} from '@/utils/bookmarks';
import { isBrowser } from '@/utils/browserEnv';

const bookmarkApiPath = '/api/bookmarks';
const activeBookmarkUserStorageKey = 'homepage.bookmarks.active-user';
const guestBookmarkStorageKey = 'homepage.bookmarks';
const userBookmarkStorageKeyPrefix = 'homepage.bookmarks.user';
const bookmarkStorageVersion = 3;

type BookmarkStatusMessageKey =
    | 'bookmarksExported'
    | 'bookmarksImportEmpty'
    | 'bookmarksImportFailed'
    | 'bookmarksStorageFailed'
    | 'bookmarksSyncFailed';

export interface BookmarkStatus {
    messageKey: BookmarkStatusMessageKey;
    type: 'error' | 'success';
}

export type BookmarkSaveState = 'error' | 'idle' | 'saved' | 'saving';

export interface BookmarkCategoryInput {
    category: string;
    icon?: string;
}

export interface BookmarkFolderInput {
    icon?: string;
    title: string;
}

export interface BookmarkInput {
    title: string;
    url: string;
}

export interface BookmarkLocationInput {
    categoryIndex: number;
    folderPath?: string[];
}

export interface BookmarkControls {
    addBookmark: (categoryIndex: number, bookmark: BookmarkInput) => boolean;
    addBookmarksToLocation: (
        location: BookmarkLocationInput,
        bookmarks: readonly BookmarkInput[]
    ) => number;
    addBookmarkToLocation: (
        location: BookmarkLocationInput,
        bookmark: BookmarkInput
    ) => boolean;
    addCategory: (category: BookmarkCategoryInput) => boolean;
    addFolder: (
        location: BookmarkLocationInput,
        folder: BookmarkFolderInput
    ) => boolean;
    bookmarkTree: BookmarkCategoryData[];
    bookmarkTrash: BookmarkTrashItemData[];
    deleteBookmark: (
        categoryIndex: number,
        bookmarkId: string
    ) => false | string;
    deleteCategory: (categoryIndex: number) => false | string;
    deleteFolder: (location: BookmarkLocationInput) => false | string;
    emptyTrash: () => boolean;
    exportBookmarks: () => void;
    importBookmarks: (file: File) => Promise<void>;
    canEdit: boolean;
    isLoading: boolean;
    moveBookmarkNode: (
        source: BookmarkLocationInput,
        nodeId: string,
        destination: BookmarkLocationInput,
        destinationIndex?: number
    ) => boolean;
    replaceBookmarkTree: (
        bookmarkTree: readonly BookmarkCategoryData[]
    ) => boolean;
    restoreTrashItem: (trashItemId: string) => boolean;
    saveState: BookmarkSaveState;
    status?: BookmarkStatus;
    updateBookmark: (
        categoryIndex: number,
        bookmarkId: string,
        bookmark: BookmarkInput,
        nextCategoryIndex?: number
    ) => boolean;
    updateBookmarkInLocation: (
        location: BookmarkLocationInput,
        bookmarkId: string,
        bookmark: BookmarkInput,
        nextLocation?: BookmarkLocationInput
    ) => boolean;
    updateCategory: (
        categoryIndex: number,
        category: BookmarkCategoryInput
    ) => boolean;
    updateCategoryIcon: (categoryIndex: number, icon: string) => void;
    updateFolder: (
        location: BookmarkLocationInput,
        folder: BookmarkFolderInput
    ) => boolean;
}

interface BookmarkApiResponse {
    categories?: BookmarkCategoryData[];
    trash?: BookmarkTrashItemData[];
}

interface StoredBookmarkData {
    categories?: BookmarkCategoryData[];
    trash: BookmarkTrashItemData[];
}

interface BookmarkAuthState {
    getToken: () => Promise<string | undefined>;
    isLoaded: boolean;
    isSignedIn: boolean | undefined;
    userId: null | string | undefined;
}

interface UseBookmarksOptions {
    auth?: BookmarkAuthState;
}

interface ActiveUserBookmarkData extends StoredBookmarkData {
    userId?: string;
}

const readStoredBookmarkData = (storageKey: string): StoredBookmarkData => {
    if (!isBrowser()) {
        return { trash: [] };
    }

    try {
        const storedValue = globalThis.localStorage.getItem(storageKey);
        if (storedValue === null) {
            return { trash: [] };
        }

        const parsedValue: unknown = JSON.parse(storedValue);
        if (
            typeof parsedValue === 'object' &&
            parsedValue !== null &&
            'categories' in parsedValue
        ) {
            const storedData = parsedValue as {
                categories: unknown;
                trash?: unknown;
            };
            return {
                categories: coerceBookmarkTree(storedData.categories),
                trash: coerceBookmarkTrash(storedData.trash ?? []) ?? [],
            };
        }

        return { categories: coerceBookmarkTree(parsedValue), trash: [] };
    } catch {
        return { trash: [] };
    }
};

const storeBookmarkTree = (
    storageKey: string,
    bookmarkTree: readonly BookmarkCategoryData[],
    bookmarkTrash: readonly BookmarkTrashItemData[]
): void => {
    globalThis.localStorage.setItem(
        storageKey,
        JSON.stringify({
            categories: bookmarkTree,
            trash: bookmarkTrash,
            version: bookmarkStorageVersion,
        })
    );
};

const getUserBookmarkStorageKey = (userId: string): string =>
    `${userBookmarkStorageKeyPrefix}.${userId}`;

const readGuestBookmarkData = (): StoredBookmarkData =>
    readStoredBookmarkData(guestBookmarkStorageKey);

const readUserBookmarkData = (userId: string): StoredBookmarkData =>
    readStoredBookmarkData(getUserBookmarkStorageKey(userId));

const readActiveUserBookmarkData = (): ActiveUserBookmarkData => {
    if (!isBrowser()) {
        return { trash: [] };
    }

    const activeUserId = globalThis.localStorage.getItem(
        activeBookmarkUserStorageKey
    );
    const legacyCachedUserIds: string[] = [];

    if (activeUserId === null) {
        const userStorageKeyPrefix = `${userBookmarkStorageKeyPrefix}.`;

        for (let index = 0; index < globalThis.localStorage.length; index++) {
            const storageKey = globalThis.localStorage.key(index);

            if (storageKey?.startsWith(userStorageKeyPrefix) === true) {
                legacyCachedUserIds.push(
                    storageKey.slice(userStorageKeyPrefix.length)
                );
            }
        }
    }

    const userId =
        activeUserId ??
        (legacyCachedUserIds.length === 1 ? legacyCachedUserIds[0] : undefined);

    return userId === undefined
        ? { trash: [] }
        : { ...readUserBookmarkData(userId), userId };
};

const clearActiveBookmarkUser = (): void => {
    if (isBrowser()) {
        globalThis.localStorage.removeItem(activeBookmarkUserStorageKey);
    }
};

const storeGuestBookmarkTree = (
    bookmarkTree: readonly BookmarkCategoryData[],
    bookmarkTrash: readonly BookmarkTrashItemData[]
): void => {
    storeBookmarkTree(guestBookmarkStorageKey, bookmarkTree, bookmarkTrash);
};

const storeUserBookmarkTree = (
    userId: string,
    bookmarkTree: readonly BookmarkCategoryData[],
    bookmarkTrash: readonly BookmarkTrashItemData[]
): void => {
    storeBookmarkTree(
        getUserBookmarkStorageKey(userId),
        bookmarkTree,
        bookmarkTrash
    );
    globalThis.localStorage.setItem(activeBookmarkUserStorageKey, userId);
};

const normalizeInputText = (value: string): string =>
    value.replaceAll(/\s+/g, ' ').trim();

const createEntityId = (prefix: string): string => {
    if (typeof globalThis.crypto.randomUUID === 'function') {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now().toString(36)}`;
};

const createBookmarkId = (): string => createEntityId('bookmark');

const createFolderId = (): string => createEntityId('folder');

const emptyBookmarkTree: BookmarkCategoryData[] = [];

const findBookmarkNode = (
    nodes: readonly BookmarkNodeData[],
    bookmarkId: string,
    folderPath: readonly string[] = []
): { bookmark: BookmarkLinkData; folderPath: string[] } | undefined => {
    for (const node of nodes) {
        if (node.type === 'link' && node.id === bookmarkId) {
            return { bookmark: node, folderPath: [...folderPath] };
        }
        if (node.type === 'folder') {
            const match = findBookmarkNode(node.children, bookmarkId, [
                ...folderPath,
                node.id,
            ]);
            if (match !== undefined) {
                return match;
            }
        }
    }
    return undefined;
};

const updateBookmarkNodes = (
    nodes: readonly BookmarkNodeData[],
    bookmarkId: string,
    bookmark: BookmarkLinkData
): BookmarkNodeData[] =>
    nodes.map((node) => {
        if (node.type === 'link') {
            return node.id === bookmarkId ? bookmark : node;
        }

        return {
            ...node,
            children: updateBookmarkNodes(node.children, bookmarkId, bookmark),
        };
    });

const deleteBookmarkNodes = (
    nodes: readonly BookmarkNodeData[],
    bookmarkId: string
): BookmarkNodeData[] =>
    nodes.flatMap((node): BookmarkNodeData[] => {
        if (node.type === 'link') {
            return node.id === bookmarkId ? [] : [node];
        }

        return [
            {
                ...node,
                children: deleteBookmarkNodes(node.children, bookmarkId),
            },
        ];
    });

const normalizeFolderPath = (location: BookmarkLocationInput): string[] =>
    location.folderPath ?? [];

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

const getFolderAtPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[]
): BookmarkFolderData | undefined => {
    if (folderPath.length === 0) {
        return undefined;
    }
    const folderId = folderPath[0];
    const folder = nodes.find(
        (node): node is BookmarkFolderData =>
            node.type === 'folder' && node.id === folderId
    );
    return folderPath.length === 1 || folder === undefined
        ? folder
        : getFolderAtPath(folder.children, folderPath.slice(1));
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

const updateFolderAtPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[],
    updateFolder: (folder: BookmarkFolderData) => BookmarkFolderData
): BookmarkNodeData[] | undefined => {
    if (folderPath.length === 0) {
        return undefined;
    }

    const folderId = folderPath[0];
    const remainingPath = folderPath.slice(1);

    for (const [nodeIndex, node] of nodes.entries()) {
        if (node.type !== 'folder' || node.id !== folderId) {
            continue;
        }

        if (remainingPath.length === 0) {
            return nodes.map((currentNode, currentIndex) =>
                currentIndex === nodeIndex ? updateFolder(node) : currentNode
            );
        }

        const nextChildren = updateFolderAtPath(
            node.children,
            remainingPath,
            updateFolder
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

const deleteFolderAtPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[]
): BookmarkNodeData[] | undefined => {
    if (folderPath.length === 0) {
        return undefined;
    }

    const folderId = folderPath[0];
    const remainingPath = folderPath.slice(1);

    if (remainingPath.length === 0) {
        const nextNodes = nodes.filter(
            (node) => node.type !== 'folder' || node.id !== folderId
        );

        return nextNodes.length === nodes.length ? undefined : nextNodes;
    }

    return updateFolderAtPath(nodes, [folderId], (folder) => {
        const nextChildren = deleteFolderAtPath(folder.children, remainingPath);

        return nextChildren === undefined
            ? folder
            : {
                  ...folder,
                  children: nextChildren,
              };
    });
};

const readBookmarkResponse = async (
    response: Response
): Promise<BookmarkApiResponse> => {
    const payload = (await response.json().catch(() => ({}))) as
        | BookmarkApiResponse
        | { error?: string };

    if (!response.ok) {
        throw new Error(
            'error' in payload && typeof payload.error === 'string'
                ? payload.error
                : 'Bookmark request failed.'
        );
    }

    if (!('categories' in payload) || payload.categories === undefined) {
        return {};
    }

    const categories = coerceBookmarkTree(payload.categories);
    const trash = coerceBookmarkTrash(payload.trash ?? []);
    if (categories === undefined || trash === undefined) {
        throw new Error('Bookmark data is invalid.');
    }

    return { categories, trash };
};

export const useBookmarks = (
    options: UseBookmarksOptions = {}
): BookmarkControls => {
    const hasAuth = options.auth !== undefined;
    const getToken = options.auth?.getToken;
    const isAuthLoaded = options.auth?.isLoaded === true;
    const remoteUserId =
        isAuthLoaded &&
        options.auth?.isSignedIn === true &&
        typeof options.auth.userId === 'string'
            ? options.auth.userId
            : undefined;
    const [initialStoredData] = useState<ActiveUserBookmarkData>(() =>
        hasAuth ? readActiveUserBookmarkData() : readGuestBookmarkData()
    );
    const [bookmarkTree, setBookmarkTree] = useState<BookmarkCategoryData[]>(
        () => initialStoredData.categories ?? emptyBookmarkTree
    );
    const [bookmarkTrash, setBookmarkTrash] = useState<BookmarkTrashItemData[]>(
        () => initialStoredData.trash
    );
    const [status, setStatus] = useState<BookmarkStatus>();
    const [isLoading, setIsLoading] = useState(
        hasAuth && initialStoredData.categories === undefined
    );
    const [saveState, setSaveState] = useState<BookmarkSaveState>(
        hasAuth && initialStoredData.categories === undefined ? 'idle' : 'saved'
    );
    const mutationVersionRef = useRef(0);
    const saveOperationRef = useRef(0);
    const remoteSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

    const getAuthHeaders = useCallback(async (): Promise<
        Record<'Authorization', string> | undefined
    > => {
        if (getToken === undefined || remoteUserId === undefined) {
            return undefined;
        }

        const token = await getToken();

        if (typeof token !== 'string') {
            return undefined;
        }

        return {
            Authorization: `Bearer ${token}`,
        };
    }, [getToken, remoteUserId]);

    const saveRemoteBookmarkTree = useCallback(
        async (
            nextBookmarkTree: readonly BookmarkCategoryData[],
            nextBookmarkTrash: readonly BookmarkTrashItemData[],
            shouldReportError = true,
            saveOperation?: number
        ): Promise<boolean> => {
            try {
                const headers = await getAuthHeaders();
                if (headers === undefined || remoteUserId === undefined) {
                    return false;
                }

                const response = await fetch(bookmarkApiPath, {
                    body: JSON.stringify({
                        categories: nextBookmarkTree,
                        trash: nextBookmarkTrash,
                    }),
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                });
                const payload = await readBookmarkResponse(response);

                try {
                    storeUserBookmarkTree(
                        remoteUserId,
                        payload.categories ?? nextBookmarkTree,
                        payload.trash ?? nextBookmarkTrash
                    );
                } catch {
                    // The remote copy remains authoritative if the cache fails.
                }

                if (saveOperation === saveOperationRef.current) {
                    setSaveState('saved');
                }

                return true;
            } catch {
                if (saveOperation === saveOperationRef.current) {
                    setSaveState('error');
                }
                if (shouldReportError) {
                    setStatus({
                        messageKey: 'bookmarksSyncFailed',
                        type: 'error',
                    });
                }

                return false;
            }
        },
        [getAuthHeaders, remoteUserId]
    );

    const commitBookmarkTree = useCallback(
        (
            nextBookmarkTree: readonly BookmarkCategoryData[],
            nextBookmarkTrash: readonly BookmarkTrashItemData[] = bookmarkTrash
        ) => {
            if (hasAuth && !isAuthLoaded) {
                return false;
            }

            const normalizedBookmarkTree =
                coerceBookmarkTree(nextBookmarkTree) ?? [];
            const normalizedBookmarkTrash =
                coerceBookmarkTrash(nextBookmarkTrash) ?? [];

            mutationVersionRef.current++;
            setBookmarkTree([...normalizedBookmarkTree]);
            setBookmarkTrash([...normalizedBookmarkTrash]);
            if (remoteUserId === undefined) {
                try {
                    storeGuestBookmarkTree(
                        normalizedBookmarkTree,
                        normalizedBookmarkTrash
                    );
                } catch {
                    setSaveState('error');
                    setStatus({
                        messageKey: 'bookmarksStorageFailed',
                        type: 'error',
                    });
                    return false;
                }
                setSaveState('saved');
            } else {
                try {
                    storeUserBookmarkTree(
                        remoteUserId,
                        normalizedBookmarkTree,
                        normalizedBookmarkTrash
                    );
                } catch {
                    // Saving remotely should not depend on the local cache.
                }
                saveOperationRef.current++;
                const saveOperation = saveOperationRef.current;
                setSaveState('saving');
                remoteSaveQueueRef.current = remoteSaveQueueRef.current.then(
                    async () => {
                        await saveRemoteBookmarkTree(
                            normalizedBookmarkTree,
                            normalizedBookmarkTrash,
                            true,
                            saveOperation
                        );
                    }
                );
            }
            return true;
        },
        [
            bookmarkTrash,
            hasAuth,
            isAuthLoaded,
            remoteUserId,
            saveRemoteBookmarkTree,
        ]
    );

    useLayoutEffect(() => {
        if (hasAuth && !isAuthLoaded) {
            setIsLoading(initialStoredData.categories === undefined);
            return undefined;
        }

        if (remoteUserId === undefined) {
            if (!hasAuth) {
                return undefined;
            }

            clearActiveBookmarkUser();
            const storedBookmarkData = readGuestBookmarkData();

            setBookmarkTree(storedBookmarkData.categories ?? emptyBookmarkTree);
            setBookmarkTrash(storedBookmarkData.trash);
            setIsLoading(false);
            setSaveState('saved');
            return undefined;
        }

        const cachedBookmarkData = readUserBookmarkData(remoteUserId);

        setBookmarkTree(cachedBookmarkData.categories ?? emptyBookmarkTree);
        setBookmarkTrash(cachedBookmarkData.trash);
        setIsLoading(cachedBookmarkData.categories === undefined);
        setSaveState(
            cachedBookmarkData.categories === undefined ? 'idle' : 'saved'
        );

        let isCurrent = true;
        const loadMutationVersion = mutationVersionRef.current;

        const loadRemoteBookmarkTree = async () => {
            try {
                const headers = await getAuthHeaders();
                if (headers === undefined) {
                    return;
                }

                const response = await fetch(bookmarkApiPath, { headers });
                const payload = await readBookmarkResponse(response);

                if (
                    !isCurrent ||
                    mutationVersionRef.current !== loadMutationVersion
                ) {
                    return;
                }

                if (payload.categories !== undefined) {
                    setBookmarkTree(payload.categories);
                    setBookmarkTrash(payload.trash ?? []);

                    try {
                        storeUserBookmarkTree(
                            remoteUserId,
                            payload.categories,
                            payload.trash ?? []
                        );
                    } catch {
                        // The fresh remote data can still be used without caching.
                    }
                }
            } catch {
                if (isCurrent) {
                    setSaveState('error');
                    setStatus({
                        messageKey: 'bookmarksSyncFailed',
                        type: 'error',
                    });
                }
            } finally {
                if (isCurrent) {
                    setIsLoading(false);
                }
            }
        };

        loadRemoteBookmarkTree().catch(() => undefined);

        return () => {
            isCurrent = false;
        };
    }, [
        getAuthHeaders,
        getToken,
        hasAuth,
        initialStoredData.categories,
        isAuthLoaded,
        remoteUserId,
    ]);

    const exportBookmarks = useCallback(() => {
        const html = serializeBrowserBookmarks(bookmarkTree);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = globalThis.URL.createObjectURL(blob);
        const anchor = globalThis.document.createElement('a');

        anchor.href = url;
        anchor.download = 'homepage-bookmarks.html';
        anchor.style.display = 'none';

        anchor.click();
        globalThis.requestAnimationFrame(() => {
            globalThis.URL.revokeObjectURL(url);
        });

        setStatus({ messageKey: 'bookmarksExported', type: 'success' });
    }, [bookmarkTree]);

    const importBookmarks = useCallback(
        async (file: File) => {
            setIsLoading(true);
            try {
                const nextBookmarkTree = parseBrowserBookmarks(
                    await file.text()
                );
                if (nextBookmarkTree.length === 0) {
                    setStatus({
                        messageKey: 'bookmarksImportEmpty',
                        type: 'error',
                    });
                    return;
                }

                commitBookmarkTree(nextBookmarkTree);
            } catch {
                setStatus({
                    messageKey: 'bookmarksImportFailed',
                    type: 'error',
                });
            } finally {
                setIsLoading(false);
            }
        },
        [commitBookmarkTree]
    );

    const addCategory = useCallback(
        (categoryInput: BookmarkCategoryInput) => {
            const category = normalizeInputText(categoryInput.category);
            const icon = normalizeInputText(categoryInput.icon ?? '');

            if (category === '') {
                return false;
            }

            return commitBookmarkTree([
                ...bookmarkTree,
                {
                    category,
                    children: [],
                    id: createEntityId('category'),
                    ...(icon === '' ? {} : { icon }),
                    links: [],
                },
            ]);
        },
        [bookmarkTree, commitBookmarkTree]
    );

    const updateCategory = useCallback(
        (categoryIndex: number, categoryInput: BookmarkCategoryInput) => {
            const category = normalizeInputText(categoryInput.category);
            const icon = normalizeInputText(categoryInput.icon ?? '');

            if (
                category === '' ||
                categoryIndex < 0 ||
                categoryIndex >= bookmarkTree.length
            ) {
                return false;
            }

            return commitBookmarkTree(
                bookmarkTree.map((categoryData, currentIndex) =>
                    currentIndex === categoryIndex
                        ? {
                              ...categoryData,
                              category,
                              ...(icon === '' ? {} : { icon }),
                          }
                        : categoryData
                )
            );
        },
        [bookmarkTree, commitBookmarkTree]
    );

    const deleteCategory = useCallback(
        (categoryIndex: number) => {
            const category = bookmarkTree.at(categoryIndex);
            if (category === undefined) {
                return false;
            }

            const trashItemId = createEntityId('trash');
            const trashItem: BookmarkTrashItemData = {
                deletedAt: new Date().toISOString(),
                folderPath: [],
                id: trashItemId,
                item: category,
                kind: 'category',
                label: category.category,
            };

            const nextBookmarkTree = bookmarkTree.filter(
                (_categoryData, currentIndex) => currentIndex !== categoryIndex
            );

            const didCommit = commitBookmarkTree(nextBookmarkTree, [
                trashItem,
                ...bookmarkTrash,
            ]);
            return didCommit ? trashItemId : false;
        },
        [bookmarkTrash, bookmarkTree, commitBookmarkTree]
    );

    const updateBookmarkLocation = useCallback(
        (
            location: BookmarkLocationInput,
            updateNodes: (
                nodes: readonly BookmarkNodeData[]
            ) => BookmarkNodeData[] | undefined
        ) => {
            if (location.categoryIndex === -1) {
                const nextRootNodes = updateNodes(
                    getBookmarkRootNodes(bookmarkTree)
                );
                return nextRootNodes === undefined
                    ? false
                    : commitBookmarkTree(
                          replaceBookmarkRootNodes(bookmarkTree, nextRootNodes)
                      );
            }

            const categoryData = bookmarkTree.at(location.categoryIndex);
            if (categoryData === undefined) {
                return false;
            }

            const nextChildren = updateNodesAtFolderPath(
                categoryData.children,
                normalizeFolderPath(location),
                updateNodes
            );

            if (nextChildren === undefined) {
                return false;
            }

            return commitBookmarkTree(
                bookmarkTree.map((currentCategoryData, currentIndex) =>
                    currentIndex === location.categoryIndex
                        ? {
                              ...currentCategoryData,
                              children: nextChildren,
                          }
                        : currentCategoryData
                )
            );
        },
        [bookmarkTree, commitBookmarkTree]
    );

    const addFolder = useCallback(
        (location: BookmarkLocationInput, folderInput: BookmarkFolderInput) => {
            const icon = normalizeInputText(folderInput.icon ?? '');
            const title = normalizeInputText(folderInput.title);
            if (title === '') {
                return false;
            }

            return updateBookmarkLocation(location, (nodes) => [
                ...nodes,
                {
                    children: [],
                    id: createFolderId(),
                    ...(icon === '' ? {} : { icon }),
                    title,
                    type: 'folder',
                },
            ]);
        },
        [updateBookmarkLocation]
    );

    const updateFolder = useCallback(
        (location: BookmarkLocationInput, folderInput: BookmarkFolderInput) => {
            const icon = normalizeInputText(folderInput.icon ?? '');
            const title = normalizeInputText(folderInput.title);
            const folderPath = normalizeFolderPath(location);

            if (title === '' || folderPath.length === 0) {
                return false;
            }

            const categoryData = bookmarkTree.at(location.categoryIndex);
            if (categoryData === undefined) {
                return false;
            }

            const nextChildren = updateFolderAtPath(
                categoryData.children,
                folderPath,
                (folder) => ({
                    ...folder,
                    ...(icon === '' ? {} : { icon }),
                    title,
                })
            );

            if (nextChildren === undefined) {
                return false;
            }

            return commitBookmarkTree(
                bookmarkTree.map((currentCategoryData, currentIndex) =>
                    currentIndex === location.categoryIndex
                        ? {
                              ...currentCategoryData,
                              children: nextChildren,
                          }
                        : currentCategoryData
                )
            );
        },
        [bookmarkTree, commitBookmarkTree]
    );

    const deleteFolder = useCallback(
        (location: BookmarkLocationInput) => {
            const folderPath = normalizeFolderPath(location);

            if (folderPath.length === 0) {
                return false;
            }

            const categoryData = bookmarkTree.at(location.categoryIndex);
            const folder =
                categoryData === undefined
                    ? undefined
                    : getFolderAtPath(categoryData.children, folderPath);
            if (categoryData === undefined || folder === undefined) {
                return false;
            }

            const nextChildren = deleteFolderAtPath(
                categoryData.children,
                folderPath
            );

            if (nextChildren === undefined) {
                return false;
            }

            const trashItemId = createEntityId('trash');
            const trashItem: BookmarkTrashItemData = {
                categoryId: categoryData.id,
                deletedAt: new Date().toISOString(),
                folderPath: folderPath.slice(0, -1),
                id: trashItemId,
                item: folder,
                kind: 'folder',
                label: folder.title,
            };
            const didCommit = commitBookmarkTree(
                bookmarkTree.map((currentCategoryData, currentIndex) =>
                    currentIndex === location.categoryIndex
                        ? {
                              ...currentCategoryData,
                              children: nextChildren,
                          }
                        : currentCategoryData
                ),
                [trashItem, ...bookmarkTrash]
            );
            return didCommit ? trashItemId : false;
        },
        [bookmarkTrash, bookmarkTree, commitBookmarkTree]
    );

    const moveBookmarkNode = useCallback(
        (
            source: BookmarkLocationInput,
            nodeId: string,
            destination: BookmarkLocationInput,
            destinationIndex?: number
        ) => {
            const sourceFolderPath = normalizeFolderPath(source);
            const destinationFolderPath = normalizeFolderPath(destination);
            const isSameLocation =
                source.categoryIndex === destination.categoryIndex &&
                sourceFolderPath.join('\n') ===
                    destinationFolderPath.join('\n');
            if (isSameLocation && destinationIndex === undefined) {
                return false;
            }

            const sourceCategory = bookmarkTree.at(source.categoryIndex);
            const destinationCategory = bookmarkTree.at(
                destination.categoryIndex
            );
            if (
                sourceCategory === undefined ||
                (destination.categoryIndex !== -1 &&
                    destinationCategory === undefined)
            ) {
                return false;
            }

            const movedNode = getNodesAtFolderPath(
                sourceCategory.children,
                sourceFolderPath
            )?.find((node) => node.id === nodeId);
            if (
                movedNode === undefined ||
                (movedNode.type === 'folder' &&
                    destinationFolderPath.includes(movedNode.id))
            ) {
                return false;
            }

            if (isSameLocation) {
                const sourceNodes = getNodesAtFolderPath(
                    sourceCategory.children,
                    sourceFolderPath
                );
                const sourceIndex = sourceNodes?.findIndex(
                    (node) => node.id === nodeId
                );
                if (
                    sourceNodes === undefined ||
                    sourceIndex === undefined ||
                    sourceIndex < 0
                ) {
                    return false;
                }

                let insertionIndex = Math.max(
                    0,
                    Math.min(
                        destinationIndex ?? sourceNodes.length,
                        sourceNodes.length
                    )
                );
                if (sourceIndex < insertionIndex) {
                    insertionIndex--;
                }
                if (insertionIndex === sourceIndex) {
                    return false;
                }

                return updateBookmarkLocation(source, (nodes) => {
                    const nextNodes = nodes.filter(
                        (node) => node.id !== nodeId
                    );
                    nextNodes.splice(insertionIndex, 0, movedNode);
                    return nextNodes;
                });
            }

            const sourceChildren = updateNodesAtFolderPath(
                sourceCategory.children,
                sourceFolderPath,
                (nodes) => nodes.filter((node) => node.id !== nodeId)
            );

            if (sourceChildren === undefined) {
                return false;
            }

            const withoutSource = bookmarkTree.map((category, categoryIndex) =>
                categoryIndex === source.categoryIndex
                    ? { ...category, children: sourceChildren }
                    : category
            );
            if (destination.categoryIndex === -1) {
                const rootNodes = getBookmarkRootNodes(withoutSource);
                const nextRootNodes = [...rootNodes];
                const insertionIndex = Math.max(
                    0,
                    Math.min(
                        destinationIndex ?? nextRootNodes.length,
                        nextRootNodes.length
                    )
                );
                nextRootNodes.splice(insertionIndex, 0, movedNode);
                return commitBookmarkTree(
                    replaceBookmarkRootNodes(withoutSource, nextRootNodes)
                );
            }

            const nextDestinationCategory = withoutSource.at(
                destination.categoryIndex
            );
            if (nextDestinationCategory === undefined) {
                return false;
            }

            const destinationChildren = updateNodesAtFolderPath(
                nextDestinationCategory.children,
                destinationFolderPath,
                (nodes) => {
                    const nextNodes = [...nodes];
                    const insertionIndex = Math.max(
                        0,
                        Math.min(
                            destinationIndex ?? nextNodes.length,
                            nextNodes.length
                        )
                    );
                    nextNodes.splice(insertionIndex, 0, movedNode);
                    return nextNodes;
                }
            );
            if (destinationChildren === undefined) {
                return false;
            }

            return commitBookmarkTree(
                withoutSource.map((category, categoryIndex) =>
                    categoryIndex === destination.categoryIndex
                        ? { ...category, children: destinationChildren }
                        : category
                )
            );
        },
        [bookmarkTree, commitBookmarkTree, updateBookmarkLocation]
    );

    const addBookmarkToLocation = useCallback(
        (location: BookmarkLocationInput, bookmarkInput: BookmarkInput) => {
            const title = normalizeInputText(bookmarkInput.title);
            const url = bookmarkInput.url.trim();

            if (title === '' || url === '') {
                return false;
            }

            const bookmark: BookmarkLinkData = {
                id: createBookmarkId(),
                title,
                type: 'link',
                url,
            };

            return updateBookmarkLocation(location, (nodes) => [
                ...nodes,
                bookmark,
            ]);
        },
        [updateBookmarkLocation]
    );

    const addBookmarksToLocation = useCallback(
        (
            location: BookmarkLocationInput,
            bookmarkInputs: readonly BookmarkInput[]
        ) => {
            const existingUrls = new Set(
                bookmarkTree.flatMap((category) =>
                    category.links.map((bookmark) => bookmark.url.trim())
                )
            );
            const bookmarks = bookmarkInputs.flatMap(
                (bookmarkInput): BookmarkLinkData[] => {
                    const title = normalizeInputText(bookmarkInput.title);
                    const url = bookmarkInput.url.trim();
                    if (title === '' || url === '' || existingUrls.has(url)) {
                        return [];
                    }

                    existingUrls.add(url);
                    return [
                        {
                            id: createBookmarkId(),
                            title,
                            type: 'link',
                            url,
                        },
                    ];
                }
            );

            if (bookmarks.length === 0) {
                return 0;
            }

            return updateBookmarkLocation(location, (nodes) => [
                ...nodes,
                ...bookmarks,
            ])
                ? bookmarks.length
                : 0;
        },
        [bookmarkTree, updateBookmarkLocation]
    );

    const addBookmark = useCallback(
        (categoryIndex: number, bookmarkInput: BookmarkInput) =>
            addBookmarkToLocation(
                {
                    categoryIndex,
                },
                bookmarkInput
            ),
        [addBookmarkToLocation]
    );

    const updateBookmarkInLocation = useCallback(
        (
            location: BookmarkLocationInput,
            bookmarkId: string,
            bookmarkInput: BookmarkInput,
            nextLocation = location
        ) => {
            const title = normalizeInputText(bookmarkInput.title);
            const url = bookmarkInput.url.trim();
            const sourceCategory = bookmarkTree.at(location.categoryIndex);
            const targetCategory = bookmarkTree.at(nextLocation.categoryIndex);
            const bookmark = sourceCategory?.links.find(
                (linkData) => linkData.id === bookmarkId
            );

            if (
                title === '' ||
                url === '' ||
                sourceCategory === undefined ||
                (nextLocation.categoryIndex !== -1 &&
                    targetCategory === undefined) ||
                bookmark === undefined
            ) {
                return false;
            }

            const sourceFolderPath = normalizeFolderPath(location);
            const targetFolderPath = normalizeFolderPath(nextLocation);
            const nextBookmark = {
                ...bookmark,
                title,
                url,
            };

            if (nextLocation.categoryIndex === -1) {
                const sourceChildren = updateNodesAtFolderPath(
                    sourceCategory.children,
                    sourceFolderPath,
                    (nodes) => deleteBookmarkNodes(nodes, bookmarkId)
                );
                if (sourceChildren === undefined) {
                    return false;
                }

                const withoutBookmark = bookmarkTree.map(
                    (categoryData, currentIndex) =>
                        currentIndex === location.categoryIndex
                            ? { ...categoryData, children: sourceChildren }
                            : categoryData
                );
                return commitBookmarkTree(
                    replaceBookmarkRootNodes(withoutBookmark, [
                        ...getBookmarkRootNodes(withoutBookmark),
                        nextBookmark,
                    ])
                );
            }

            if (
                location.categoryIndex === nextLocation.categoryIndex &&
                sourceFolderPath.join('\n') === targetFolderPath.join('\n')
            ) {
                return updateBookmarkLocation(
                    location,
                    (nodes): BookmarkNodeData[] =>
                        updateBookmarkNodes(nodes, bookmarkId, nextBookmark)
                );
            }

            const nextBookmarkTree = bookmarkTree.map(
                (categoryData, currentIndex) => {
                    if (
                        currentIndex !== location.categoryIndex &&
                        currentIndex !== nextLocation.categoryIndex
                    ) {
                        return categoryData;
                    }

                    if (location.categoryIndex === nextLocation.categoryIndex) {
                        const withoutBookmark = updateNodesAtFolderPath(
                            categoryData.children,
                            sourceFolderPath,
                            (nodes) => deleteBookmarkNodes(nodes, bookmarkId)
                        );

                        if (withoutBookmark === undefined) {
                            return categoryData;
                        }

                        const withBookmark = updateNodesAtFolderPath(
                            withoutBookmark,
                            targetFolderPath,
                            (nodes) => [...nodes, nextBookmark]
                        );

                        return {
                            ...categoryData,
                            children: withBookmark ?? categoryData.children,
                        };
                    }

                    if (currentIndex === location.categoryIndex) {
                        const nextChildren = updateNodesAtFolderPath(
                            categoryData.children,
                            sourceFolderPath,
                            (nodes) => deleteBookmarkNodes(nodes, bookmarkId)
                        );

                        return {
                            ...categoryData,
                            children: nextChildren ?? categoryData.children,
                        };
                    }

                    const nextChildren = updateNodesAtFolderPath(
                        categoryData.children,
                        targetFolderPath,
                        (nodes) => [...nodes, nextBookmark]
                    );

                    return {
                        ...categoryData,
                        children: nextChildren ?? categoryData.children,
                    };
                }
            );

            return commitBookmarkTree(nextBookmarkTree);
        },
        [bookmarkTree, commitBookmarkTree, updateBookmarkLocation]
    );

    const updateBookmark = useCallback(
        (
            categoryIndex: number,
            bookmarkId: string,
            bookmarkInput: BookmarkInput,
            nextCategoryIndex = categoryIndex
        ) =>
            updateBookmarkInLocation(
                {
                    categoryIndex,
                },
                bookmarkId,
                bookmarkInput,
                {
                    categoryIndex: nextCategoryIndex,
                }
            ),
        [updateBookmarkInLocation]
    );

    const deleteBookmark = useCallback(
        (categoryIndex: number, bookmarkId: string) => {
            const categoryData = bookmarkTree.at(categoryIndex);
            const match =
                categoryData === undefined
                    ? undefined
                    : findBookmarkNode(categoryData.children, bookmarkId);

            if (categoryData === undefined || match === undefined) {
                return false;
            }

            const trashItemId = createEntityId('trash');
            const trashItem: BookmarkTrashItemData = {
                categoryId: categoryData.id,
                deletedAt: new Date().toISOString(),
                folderPath: match.folderPath,
                id: trashItemId,
                item: match.bookmark,
                kind: 'bookmark',
                label: match.bookmark.title,
            };
            const didCommit = commitBookmarkTree(
                bookmarkTree.map((currentCategoryData, currentIndex) =>
                    currentIndex === categoryIndex
                        ? {
                              ...currentCategoryData,
                              children: deleteBookmarkNodes(
                                  currentCategoryData.children,
                                  bookmarkId
                              ),
                          }
                        : currentCategoryData
                ),
                [trashItem, ...bookmarkTrash]
            );
            return didCommit ? trashItemId : false;
        },
        [bookmarkTrash, bookmarkTree, commitBookmarkTree]
    );

    const updateCategoryIcon = useCallback(
        (categoryIndex: number, icon: string) => {
            if (
                categoryIndex < 0 ||
                categoryIndex >= bookmarkTree.length ||
                bookmarkTree[categoryIndex]?.icon === icon
            ) {
                return;
            }

            const nextBookmarkTree = bookmarkTree.map(
                (categoryData, currentIndex) =>
                    currentIndex === categoryIndex
                        ? { ...categoryData, icon }
                        : categoryData
            );

            commitBookmarkTree(nextBookmarkTree);
        },
        [bookmarkTree, commitBookmarkTree]
    );

    const replaceBookmarkTree = useCallback(
        (nextBookmarkTree: readonly BookmarkCategoryData[]) =>
            commitBookmarkTree(nextBookmarkTree),
        [commitBookmarkTree]
    );

    const restoreTrashItem = useCallback(
        (trashItemId: string) => {
            const trashItem = bookmarkTrash.find(
                (item) => item.id === trashItemId
            );
            if (trashItem === undefined) {
                return false;
            }

            let nextBookmarkTree: BookmarkCategoryData[];
            if (trashItem.kind === 'category') {
                nextBookmarkTree = [
                    ...bookmarkTree,
                    trashItem.item as BookmarkCategoryData,
                ];
            } else {
                const categoryIndex = Math.max(
                    bookmarkTree.findIndex(
                        (category) => category.id === trashItem.categoryId
                    ),
                    0
                );
                const category = bookmarkTree.at(categoryIndex);
                if (category === undefined) {
                    return false;
                }
                const node = trashItem.item as BookmarkNodeData;
                const restoredChildren = updateNodesAtFolderPath(
                    category.children,
                    trashItem.folderPath,
                    (nodes) => [...nodes, node]
                );
                nextBookmarkTree = bookmarkTree.map(
                    (currentCategory, currentIndex) =>
                        currentIndex === categoryIndex
                            ? {
                                  ...currentCategory,
                                  children: restoredChildren ?? [
                                      ...currentCategory.children,
                                      node,
                                  ],
                              }
                            : currentCategory
                );
            }

            return commitBookmarkTree(
                nextBookmarkTree,
                bookmarkTrash.filter((item) => item.id !== trashItemId)
            );
        },
        [bookmarkTrash, bookmarkTree, commitBookmarkTree]
    );

    const emptyTrash = useCallback(
        () => bookmarkTrash.length > 0 && commitBookmarkTree(bookmarkTree, []),
        [bookmarkTrash.length, bookmarkTree, commitBookmarkTree]
    );

    return {
        addBookmark,
        addBookmarksToLocation,
        addBookmarkToLocation,
        addCategory,
        addFolder,
        bookmarkTree,
        bookmarkTrash,
        canEdit: !hasAuth || isAuthLoaded,
        deleteBookmark,
        deleteCategory,
        deleteFolder,
        emptyTrash,
        exportBookmarks,
        importBookmarks,
        isLoading,
        moveBookmarkNode,
        replaceBookmarkTree,
        restoreTrashItem,
        saveState,
        status,
        updateBookmark,
        updateBookmarkInLocation,
        updateCategory,
        updateCategoryIcon,
        updateFolder,
    };
};
