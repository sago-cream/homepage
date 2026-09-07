/* eslint-disable no-nested-ternary -- Visual state branches are clearest inline in this workspace. */
import React, {
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { DragDropProvider, useDroppable } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import {
    Bookmark,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    ClipboardPaste,
    Download,
    FolderOpen,
    FolderPlus,
    Link2,
    LoaderCircle,
    Plus,
    Search,
    Trash2,
    Undo2,
    Upload,
    X,
} from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type {
    BookmarkCategoryData,
    BookmarkFolderData,
    BookmarkLinkData,
    BookmarkNodeData,
} from '@/types/bookmarks';
import {
    categoryIconOptions,
    createBookmarkIcon,
    decorateBookmarkTree,
    normalizeCategoryIconSearch,
    resolveFolderIconName,
} from '@/utils/bookmarkPresentation';
import {
    getBookmarkRootNodes,
    isBookmarkFolder,
    isBookmarkLink,
    isBookmarkRootCategory,
} from '@/utils/bookmarks';
import { getFeedBookmarks, setFeedBookmarkIds } from '@/utils/feeds';
import { BookmarkActions, BookmarkCard } from './BookmarkCard';

export interface BookmarkManagerHandle {
    requestClose: () => boolean;
    openBookmark: (bookmarkId: string) => void;
}

interface BookmarkManagerProps {
    bookmarkControls: BookmarkControls;
    ref?: React.Ref<BookmarkManagerHandle>;
    onClose: () => void;
}

interface BookmarkLocation {
    categoryIndex: number;
    folderPath: string[];
}

interface NavigationSnapshot {
    location: BookmarkLocation;
    selectedLocation?: BookmarkLocation;
    focusedPane: 'left' | 'right';
}

interface EditorDraft extends BookmarkLocation {
    bookmarkId?: string;
    icon: string;
    kind: 'bookmark' | 'category' | 'folder';
    mode: 'add' | 'edit';
    title: string;
    url: string;
}

interface DeleteTarget extends BookmarkLocation {
    bookmarkId?: string;
    kind: EditorDraft['kind'];
}

interface NavigationItem {
    containerLocation: BookmarkLocation;
    folderLocation?: BookmarkLocation;
    isCategory: boolean;
    node: BookmarkNodeData;
}

interface FormErrors {
    title?: string;
    url?: string;
}

interface DragNodeData {
    nodeIndex: number;
    isFolder: boolean;
    kind: 'node';
    location: BookmarkLocation;
}

interface DropLocationData {
    kind: 'location';
    location: BookmarkLocation;
}

const getLocationKey = (
    categoryIndex: number,
    folderPath: readonly string[]
): string => JSON.stringify([categoryIndex, ...folderPath]);

const isSameLocation = (
    first: Readonly<BookmarkLocation>,
    second: Readonly<BookmarkLocation>
): boolean =>
    getLocationKey(first.categoryIndex, first.folderPath) ===
    getLocationKey(second.categoryIndex, second.folderPath);

interface SortableBookmarkRowProps {
    children: (sourceRef: (element: Element | null) => void) => React.ReactNode;
    disabled: boolean;
    isFolder: boolean;
    location: BookmarkLocation;
    nodeId: string;
    nodeIndex: number;
    selected: boolean;
}

const SortableBookmarkRow: React.FC<SortableBookmarkRowProps> = ({
    children,
    disabled,
    isFolder,
    location,
    nodeId,
    nodeIndex,
    selected,
}) => {
    const sortable = useSortable<DragNodeData>({
        accept: 'bookmark-node',
        data: { isFolder, kind: 'node', location, nodeIndex },
        disabled,
        group: getLocationKey(location.categoryIndex, location.folderPath),
        id: nodeId,
        index: nodeIndex,
        type: 'bookmark-node',
    });

    return (
        <div
            ref={sortable.targetRef}
            className='bookmark-workspace-list-row'
            data-dragging={sortable.isDragSource ? 'true' : undefined}
            data-drop-position={sortable.isDropTarget ? 'inside' : undefined}
            data-selected={selected}
        >
            {children(sortable.sourceRef)}
        </div>
    );
};

interface BookmarkLocationDropTargetProps {
    children: React.ReactNode;
    className: string;
    disabled?: boolean;
    idSuffix: string;
    location: BookmarkLocation;
}

const BookmarkLocationDropTarget: React.FC<BookmarkLocationDropTargetProps> = ({
    children,
    className,
    disabled = false,
    idSuffix,
    location,
}) => {
    const droppable = useDroppable<DropLocationData>({
        accept: 'bookmark-node',
        data: { kind: 'location', location },
        disabled,
        id: `bookmark-location:${getLocationKey(
            location.categoryIndex,
            location.folderPath
        )}:${idSuffix}`,
    });

    return (
        <div
            ref={droppable.ref}
            className={className}
            data-drop-target={droppable.isDropTarget ? 'true' : undefined}
        >
            {children}
        </div>
    );
};

const FolderLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className='bookmark-workspace-folder-label'>{children}</span>
);

interface BookmarkSidebarDropTargetProps {
    children: React.ReactNode;
    disabled: boolean;
    label: string;
    location: BookmarkLocation;
    onClick: React.MouseEventHandler<HTMLElement>;
}

const BookmarkSidebarDropTarget: React.FC<BookmarkSidebarDropTargetProps> = ({
    children,
    disabled,
    label,
    location,
    onClick,
}) => {
    const droppable = useDroppable<DropLocationData>({
        accept: 'bookmark-node',
        data: { kind: 'location', location },
        disabled,
        id: `bookmark-sidebar:${getLocationKey(
            location.categoryIndex,
            location.folderPath
        )}`,
    });

    return (
        <nav
            ref={droppable.ref}
            className='bookmark-workspace-tree'
            aria-label={label}
            data-drop-target={droppable.isDropTarget ? 'true' : undefined}
            onClick={onClick}
        >
            {children}
        </nav>
    );
};

const defaultIconName = 'Folder';
const maxVisibleIconOptions = 40;
const bookmarkRootLocation: BookmarkLocation = {
    categoryIndex: -1,
    folderPath: [],
};

const normalizeUrl = (value: string): string | undefined => {
    const trimmedValue = value.trim();
    if (trimmedValue === '' || /\s/.test(trimmedValue)) {
        return undefined;
    }

    const candidate = /^[a-z][\d+.a-z-]*:/i.test(trimmedValue)
        ? trimmedValue
        : `https://${trimmedValue}`;

    try {
        const url = new URL(candidate);
        return ['http:', 'https:'].includes(url.protocol) && url.hostname !== ''
            ? url.href
            : undefined;
    } catch {
        return undefined;
    }
};

const getFolderAtPath = (
    nodes: readonly BookmarkNodeData[],
    folderPath: readonly string[]
): BookmarkFolderData | undefined => {
    const folderId = folderPath.at(0);
    const remainingPath = folderPath.slice(1);
    if (folderId === undefined) {
        return undefined;
    }

    const folder = nodes.find(
        (node): node is BookmarkFolderData =>
            isBookmarkFolder(node) && node.id === folderId
    );

    return remainingPath.length === 0 || folder === undefined
        ? folder
        : getFolderAtPath(folder.children, remainingPath);
};

const getNodesAtPath = (
    category: BookmarkCategoryData | undefined,
    folderPath: readonly string[]
): readonly BookmarkNodeData[] => {
    if (category === undefined) {
        return [];
    }

    return folderPath.length === 0
        ? category.children
        : (getFolderAtPath(category.children, folderPath)?.children ?? []);
};

const nodeMatchesSearch = (
    node: BookmarkNodeData,
    normalizedQuery: string
): boolean => {
    if (isBookmarkLink(node)) {
        return `${node.title} ${node.url}`
            .toLowerCase()
            .includes(normalizedQuery);
    }

    return (
        node.title.toLowerCase().includes(normalizedQuery) ||
        node.children.some((child) => nodeMatchesSearch(child, normalizedQuery))
    );
};

const serializeDraft = (draft: EditorDraft): string =>
    JSON.stringify({
        icon: draft.icon,
        title: draft.title,
        url: draft.url,
    });

interface PastedBookmark {
    title: string;
    url: string;
}

const getBookmarkTitleFromUrl = (url: string): string => {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const name = hostname.split('.')[0].replaceAll(/[_-]+/g, ' ');

        return name === ''
            ? hostname
            : name.replace(/^\w/, (character) => character.toUpperCase());
    } catch {
        return url;
    }
};

const parsePastedBookmarkText = (value: string): PastedBookmark[] => {
    const bookmarks: PastedBookmark[] = [];
    const seenUrls = new Set<string>();
    const addBookmark = (urlValue: string, titleValue = '') => {
        const url = normalizeUrl(urlValue.replaceAll(/[),.;]+$/g, ''));
        if (url === undefined || seenUrls.has(url)) {
            return;
        }

        seenUrls.add(url);
        bookmarks.push({
            title: titleValue.trim() || getBookmarkTitleFromUrl(url),
            url,
        });
    };

    for (const line of value.split(/\r?\n/)) {
        const markdownLinks = [
            ...line.matchAll(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/gi),
        ];
        for (const match of markdownLinks) {
            addBookmark(match[2], match[1]);
        }

        const lineWithoutMarkdown = line.replaceAll(
            /\[.+?]\(https?:\/\/[^)]+\)/gi,
            ''
        );
        const urlMatches = [
            ...lineWithoutMarkdown.matchAll(
                /(?:https?:\/\/|www\.)[^\s"'<>]+/gi
            ),
        ];
        for (const match of urlMatches) {
            const matchedUrl = match[0];
            const title =
                urlMatches.length === 1
                    ? lineWithoutMarkdown
                          .replace(matchedUrl, '')
                          .replaceAll(/^[\s:|–—-]+|[\s:|–—-]+$/g, '')
                    : '';
            addBookmark(matchedUrl, title);
        }

        if (markdownLinks.length === 0 && urlMatches.length === 0) {
            addBookmark(line.trim());
        }
    }

    return bookmarks;
};

const parseClipboardBookmarks = (
    clipboardData: DataTransfer
): PastedBookmark[] => {
    const bookmarks = parsePastedBookmarkText(
        clipboardData.getData('text/plain')
    );
    const seenUrls = new Set(bookmarks.map((bookmark) => bookmark.url));
    const html = clipboardData.getData('text/html');
    if (html === '') {
        return bookmarks;
    }

    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
        'a[href]'
    )) {
        const url = normalizeUrl(anchor.href);
        if (url === undefined || seenUrls.has(url)) {
            continue;
        }

        seenUrls.add(url);
        bookmarks.push({
            title: anchor.textContent.trim() || getBookmarkTitleFromUrl(url),
            url,
        });
    }

    return bookmarks;
};

export const BookmarkManager: React.FC<BookmarkManagerProps> = ({
    bookmarkControls,
    ref,
    onClose,
}) => {
    const { locale, t } = useLocale();
    const titleId = useId();
    const importInputId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const queryInputRef = useRef<HTMLInputElement>(null);
    const iconPickerTriggerRef = useRef<HTMLButtonElement>(null);
    const iconSearchInputRef = useRef<HTMLInputElement>(null);
    const [location, setLocation] =
        useState<BookmarkLocation>(bookmarkRootLocation);
    const [focusedPane, setFocusedPane] = useState<'left' | 'right'>('left');
    const [selectedLocation, setSelectedLocation] =
        useState<BookmarkLocation>();
    const [backLocations, setBackLocations] = useState<NavigationSnapshot[]>(
        []
    );
    const [forwardLocations, setForwardLocations] = useState<
        NavigationSnapshot[]
    >([]);
    const [query, setQuery] = useState('');
    const [pasteMessage, setPasteMessage] = useState('');
    const [isAppleDevice, setIsAppleDevice] = useState(false);
    useEffect(() => {
        setIsAppleDevice(/mac|iphone|ipad|ipod/i.test(navigator.userAgent));
    }, []);
    const pasteShortcut = isAppleDevice ? '⌘V' : 'Ctrl+V';
    const [editorDraft, setEditorDraft] = useState<EditorDraft>();
    const [draftBaseline, setDraftBaseline] = useState('');
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
    const [iconQuery, setIconQuery] = useState('');
    const [isTrashOpen, setIsTrashOpen] = useState(false);
    const [isEmptyTrashConfirmOpen, setIsEmptyTrashConfirmOpen] =
        useState(false);
    const [discardTarget, setDiscardTarget] = useState<'dialog' | 'editor'>();
    const [undoSnapshot, setUndoSnapshot] = useState<{
        id: string;
    }>();
    const undoToastRef = useRef<HTMLDivElement>(null);

    const { bookmarkTree } = bookmarkControls;
    const decoratedTree = useMemo(
        () => decorateBookmarkTree(bookmarkTree),
        [bookmarkTree]
    );
    const currentCategory =
        selectedLocation === undefined
            ? undefined
            : bookmarkTree.at(selectedLocation.categoryIndex);
    const currentNodes =
        selectedLocation === undefined
            ? []
            : getNodesAtPath(currentCategory, selectedLocation.folderPath);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleNodes =
        normalizedQuery === ''
            ? currentNodes
            : currentNodes.filter((node) =>
                  nodeMatchesSearch(node, normalizedQuery)
              );
    const rootCategoryIndex = bookmarkTree.findIndex(isBookmarkRootCategory);
    const activeAddLocation =
        focusedPane === 'right' ? (selectedLocation ?? location) : location;
    const rightLocation = selectedLocation ?? bookmarkRootLocation;
    const getLocationTitle = (target: BookmarkLocation): string => {
        if (target.categoryIndex === -1) {
            return t.bookmarks;
        }
        const category = bookmarkTree.at(target.categoryIndex);
        if (category === undefined) {
            return t.bookmarks;
        }
        return target.folderPath.length === 0
            ? category.category
            : (getFolderAtPath(category.children, target.folderPath)?.title ??
                  category.category);
    };
    const sidebarLayerTitle = getLocationTitle(location);
    const activeCategory =
        activeAddLocation.categoryIndex === -1
            ? undefined
            : bookmarkTree.at(activeAddLocation.categoryIndex);
    const activeFolder = getFolderAtPath(
        activeCategory?.children ?? [],
        activeAddLocation.folderPath
    );
    const activeIcon = activeFolder?.icon ?? activeCategory?.icon ?? 'Folder';
    const sidebarItems: NavigationItem[] = (() => {
        if (location.categoryIndex === -1) {
            return getBookmarkRootNodes(bookmarkTree).flatMap(
                (node): NavigationItem[] => {
                    if (isBookmarkLink(node)) {
                        return rootCategoryIndex === -1
                            ? []
                            : [
                                  {
                                      containerLocation: {
                                          categoryIndex: rootCategoryIndex,
                                          folderPath: [],
                                      },
                                      isCategory: false,
                                      node,
                                  },
                              ];
                    }
                    const categoryIndex = bookmarkTree.findIndex(
                        (category) =>
                            !isBookmarkRootCategory(category) &&
                            category.id === node.id
                    );
                    return categoryIndex === -1
                        ? []
                        : [
                              {
                                  containerLocation: bookmarkRootLocation,
                                  folderLocation: {
                                      categoryIndex,
                                      folderPath: [],
                                  },
                                  isCategory: true,
                                  node,
                              },
                          ];
                }
            );
        }

        const category = bookmarkTree.at(location.categoryIndex);
        return getNodesAtPath(category, location.folderPath).map(
            (node): NavigationItem => ({
                containerLocation: location,
                ...(isBookmarkFolder(node)
                    ? {
                          folderLocation: {
                              categoryIndex: location.categoryIndex,
                              folderPath: [...location.folderPath, node.id],
                          },
                      }
                    : {}),
                isCategory: false,
                node,
            })
        );
    })();
    const visibleSidebarItems =
        normalizedQuery === ''
            ? sidebarItems
            : sidebarItems.filter(({ node }) =>
                  nodeMatchesSearch(node, normalizedQuery)
              );
    const isDraftDirty =
        editorDraft !== undefined &&
        serializeDraft(editorDraft) !== draftBaseline;

    const itemCountLabel = (count: number) =>
        locale === 'zh-TW'
            ? `${count} 個項目`
            : `${count} ${count === 1 ? 'item' : 'items'}`;

    const openDraft = (draft: EditorDraft) => {
        setEditorDraft(draft);
        setDraftBaseline(serializeDraft(draft));
        setFormErrors({});
        setIsIconPickerOpen(false);
        setIconQuery('');
    };

    const navigationSnapshot: NavigationSnapshot = {
        location,
        selectedLocation,
        focusedPane,
    };
    const restoreNavigation = (snapshot: NavigationSnapshot) => {
        setLocation(snapshot.location);
        setSelectedLocation(snapshot.selectedLocation);
        setFocusedPane(snapshot.focusedPane);
        setEditorDraft(undefined);
        setQuery('');
    };
    const navigateTo = (snapshot: NavigationSnapshot) => {
        setBackLocations((current: readonly NavigationSnapshot[]) => [
            ...current.slice(-49),
            navigationSnapshot,
        ]);
        setForwardLocations([]);
        restoreNavigation(snapshot);
    };
    const selectSidebarFolder = (nextLocation: BookmarkLocation) => {
        if (
            selectedLocation !== undefined &&
            isSameLocation(selectedLocation, nextLocation)
        ) {
            setFocusedPane('right');
            return;
        }
        navigateTo({
            location,
            selectedLocation: nextLocation,
            focusedPane: 'right',
        });
    };
    const enterFolder = (nextLocation: BookmarkLocation) => {
        navigateTo({
            location: selectedLocation ?? location,
            selectedLocation: nextLocation,
            focusedPane: 'right',
        });
    };
    const navigateBack = () => {
        const previous = backLocations.at(-1);
        if (!previous) {
            return;
        }
        setBackLocations((current: readonly NavigationSnapshot[]) =>
            current.slice(0, -1)
        );
        setForwardLocations((current: readonly NavigationSnapshot[]) => [
            navigationSnapshot,
            ...current.slice(0, 49),
        ]);
        restoreNavigation(previous);
    };
    const navigateForward = () => {
        const next = forwardLocations.at(0);
        if (!next) {
            return;
        }
        setForwardLocations((current: readonly NavigationSnapshot[]) =>
            current.slice(1)
        );
        setBackLocations((current: readonly NavigationSnapshot[]) => [
            ...current.slice(-49),
            navigationSnapshot,
        ]);
        restoreNavigation(next);
    };

    const editCategory = (categoryIndex: number) => {
        const category = bookmarkTree.at(categoryIndex);
        const decoratedCategory = decoratedTree.at(categoryIndex);
        if (category === undefined || decoratedCategory === undefined) {
            return;
        }

        openDraft({
            categoryIndex,
            folderPath: [],
            icon: decoratedCategory.iconName,
            kind: 'category',
            mode: 'edit',
            title: category.category,
            url: '',
        });
    };

    const editFolder = (nextLocation: Readonly<BookmarkLocation>) => {
        const category = bookmarkTree.at(nextLocation.categoryIndex);
        const folder = getFolderAtPath(
            category?.children ?? [],
            nextLocation.folderPath
        );
        if (folder === undefined) {
            return;
        }

        openDraft({
            ...nextLocation,
            icon: resolveFolderIconName(folder),
            kind: 'folder',
            mode: 'edit',
            title: folder.title,
            url: '',
        });
    };

    const editBookmark = (
        nextLocation: BookmarkLocation,
        bookmark: BookmarkLinkData
    ) => {
        openDraft({
            ...nextLocation,
            bookmarkId: bookmark.id,
            icon: '',
            kind: 'bookmark',
            mode: 'edit',
            title: bookmark.title,
            url: bookmark.url,
        });
    };

    const beginAddFolder = () => {
        openDraft({
            ...activeAddLocation,
            icon: defaultIconName,
            kind: 'folder',
            mode: 'add',
            title: '',
            url: '',
        });
    };

    const beginAddBookmark = () => {
        openDraft({
            ...activeAddLocation,
            icon: '',
            kind: 'bookmark',
            mode: 'add',
            title: '',
            url: '',
        });
    };

    const feedBookmarkIds = new Set(
        getFeedBookmarks(bookmarkControls.bookmarkTree).map(
            (bookmark) => bookmark.id
        )
    );
    const getAddToFeedsAction = (bookmarkId: string) =>
        bookmarkControls.canEdit && !feedBookmarkIds.has(bookmarkId)
            ? () =>
                  bookmarkControls.replaceBookmarkTree(
                      setFeedBookmarkIds(bookmarkControls.bookmarkTree, [
                          ...feedBookmarkIds,
                          bookmarkId,
                      ])
                  )
            : undefined;

    const bookmarkActionLabels = {
        edit: locale === 'zh-TW' ? '編輯' : 'Edit',
        open: locale === 'zh-TW' ? '開啟' : 'Open',
        delete: locale === 'zh-TW' ? '刪除' : 'Delete',
    };
    const pasteLinks = (text: string, clipboardData?: DataTransfer) => {
        const links = clipboardData
            ? parseClipboardBookmarks(clipboardData)
            : parsePastedBookmarkText(text);
        if (links.length === 0) {
            setPasteMessage(t.bookmarkUrlInvalid);
            return;
        }
        const count = bookmarkControls.addBookmarksToLocation(
            activeAddLocation,
            links
        );
        setPasteMessage(
            count === 0
                ? t.bookmarksAlreadySaved
                : locale === 'zh-TW'
                  ? `已新增 ${count} 個連結`
                  : `${count} ${count === 1 ? 'link' : 'links'} added`
        );
    };
    const pasteFromClipboard = async () => {
        try {
            pasteLinks(await navigator.clipboard.readText());
        } catch {
            setPasteMessage(
                locale === 'zh-TW'
                    ? `請在面板中按 ${pasteShortcut} 貼上連結。`
                    : `Press ${pasteShortcut} in the panel to paste links.`
            );
        }
    };

    const saveDraft = () => {
        if (editorDraft === undefined) {
            return;
        }

        const title = editorDraft.title.trim();
        const errors: FormErrors = {};
        if (title === '') {
            errors.title = t.bookmarkTitleRequired;
        }

        const normalizedUrl =
            editorDraft.kind === 'bookmark'
                ? normalizeUrl(editorDraft.url)
                : undefined;
        if (editorDraft.kind === 'bookmark' && normalizedUrl === undefined) {
            errors.url = t.bookmarkUrlInvalid;
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        let didSave = false;
        if (editorDraft.kind === 'category') {
            didSave =
                editorDraft.mode === 'add'
                    ? bookmarkControls.addCategory({
                          category: title,
                          icon: editorDraft.icon,
                      })
                    : bookmarkControls.updateCategory(
                          editorDraft.categoryIndex,
                          { category: title, icon: editorDraft.icon }
                      );
        } else if (editorDraft.kind === 'folder') {
            const folder = { icon: editorDraft.icon, title };
            didSave =
                editorDraft.mode === 'add'
                    ? bookmarkControls.addFolder(editorDraft, folder)
                    : bookmarkControls.updateFolder(editorDraft, folder);
        } else if (normalizedUrl !== undefined) {
            didSave =
                editorDraft.mode === 'add'
                    ? bookmarkControls.addBookmarkToLocation(editorDraft, {
                          title,
                          url: normalizedUrl,
                      })
                    : bookmarkControls.updateBookmarkInLocation(
                          editorDraft,
                          editorDraft.bookmarkId ?? '',
                          { title, url: normalizedUrl }
                      );
        }

        if (!didSave) {
            return;
        }

        if (editorDraft.mode === 'add') {
            setEditorDraft(undefined);
            setDraftBaseline('');
            return;
        }

        const savedDraft = {
            ...editorDraft,
            title,
            url: normalizedUrl ?? editorDraft.url,
        };
        setEditorDraft(savedDraft);
        setDraftBaseline(serializeDraft(savedDraft));
        setFormErrors({});
    };

    const cancelEditor = () => {
        if (isDraftDirty) {
            setDiscardTarget('editor');
            return;
        }

        setEditorDraft(undefined);
    };

    const requestDialogClose = () => {
        if (isDraftDirty) {
            setDiscardTarget('dialog');
            return false;
        }

        onClose();
        return true;
    };

    useImperativeHandle(ref, () => ({
        requestClose: requestDialogClose,
        openBookmark: (bookmarkId) => {
            const find = (
                nodes: readonly BookmarkNodeData[],
                path: readonly string[]
            ): string[] | undefined => {
                for (const node of nodes) {
                    if (node.id === bookmarkId && isBookmarkLink(node)) {
                        return [...path];
                    }
                    if (isBookmarkFolder(node)) {
                        const found = find(node.children, [...path, node.id]);
                        if (found) {
                            return found;
                        }
                    }
                }
                return undefined;
            };
            for (const [categoryIndex, category] of bookmarkTree.entries()) {
                const folderPath = find(category.children, []);
                if (folderPath) {
                    setQuery('');
                    navigateTo({
                        location: bookmarkRootLocation,
                        selectedLocation: { categoryIndex, folderPath },
                        focusedPane: 'right',
                    });
                    return;
                }
            }
        },
    }));

    const confirmDiscard = () => {
        const target = discardTarget;
        setDiscardTarget(undefined);
        setEditorDraft(undefined);
        setDraftBaseline('');
        if (target === 'dialog') {
            onClose();
        }
    };

    const deleteItem = (deleteTarget: DeleteTarget) => {
        const trashItemId = (() => {
            if (deleteTarget.kind === 'category') {
                return bookmarkControls.deleteCategory(
                    deleteTarget.categoryIndex
                );
            }
            if (deleteTarget.kind === 'folder') {
                return bookmarkControls.deleteFolder(deleteTarget);
            }
            return bookmarkControls.deleteBookmark(
                deleteTarget.categoryIndex,
                deleteTarget.bookmarkId ?? ''
            );
        })();

        if (trashItemId !== false) {
            setUndoSnapshot({ id: trashItemId });
            setEditorDraft(undefined);
            setDraftBaseline('');
            setBackLocations([]);
            setForwardLocations([]);
            setLocation(bookmarkRootLocation);
            setSelectedLocation(undefined);
        }
    };

    const undoDelete = () => {
        if (undoSnapshot === undefined) {
            return;
        }

        bookmarkControls.restoreTrashItem(undoSnapshot.id);
        setUndoSnapshot(undefined);
    };

    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    useEffect(() => {
        if (isIconPickerOpen) {
            iconSearchInputRef.current?.focus();
        }
    }, [isIconPickerOpen]);

    useEffect(() => {
        if (undoSnapshot === undefined) {
            return undefined;
        }

        let timeout: number;
        const dismissWhenIdle = (_timeoutArgument: undefined) => {
            if (undoToastRef.current?.matches(':hover') === true) {
                timeout = globalThis.window.setTimeout(
                    dismissWhenIdle,
                    100,
                    undefined
                );
                return;
            }
            setUndoSnapshot(undefined);
        };
        timeout = globalThis.window.setTimeout(
            dismissWhenIdle,
            1000,
            undefined
        );

        return () => {
            globalThis.clearTimeout(timeout);
        };
    }, [undoSnapshot]);

    useEffect(() => {
        if (
            location.categoryIndex === -1 ||
            (location.categoryIndex >= 0 &&
                location.categoryIndex < bookmarkTree.length)
        ) {
            return;
        }

        setLocation(bookmarkRootLocation);
        setSelectedLocation(undefined);
        setBackLocations([]);
        setForwardLocations([]);
    }, [bookmarkTree.length, location.categoryIndex]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { source, target } = event.operation;
        const sourceData = source?.data as DragNodeData | undefined;
        if (
            event.canceled ||
            source === null ||
            sourceData?.kind !== 'node' ||
            target === null
        ) {
            return;
        }

        const targetData = target.data as
            | DragNodeData
            | DropLocationData
            | undefined;
        let destination = targetData?.location;
        let destinationIndex: number | undefined;

        if (targetData?.kind === 'node') {
            if (String(source.id) === String(target.id)) {
                return;
            }
            const bounds = target.element?.getBoundingClientRect();
            const pointerY = event.operation.position.current.y;
            // Middle of a folder opens it as a destination; its edges reorder siblings.
            const insideFolder =
                targetData.isFolder &&
                bounds !== undefined &&
                pointerY > bounds.top + bounds.height * 0.25 &&
                pointerY < bounds.bottom - bounds.height * 0.25;
            if (insideFolder) {
                destination =
                    targetData.location.categoryIndex === -1
                        ? {
                              categoryIndex: bookmarkTree.findIndex(
                                  (category) =>
                                      category.id === String(target.id)
                              ),
                              folderPath: [],
                          }
                        : {
                              categoryIndex: targetData.location.categoryIndex,
                              folderPath: [
                                  ...targetData.location.folderPath,
                                  String(target.id),
                              ],
                          };
            } else {
                const after =
                    bounds !== undefined &&
                    pointerY > bounds.top + bounds.height / 2;
                destinationIndex = targetData.nodeIndex + (after ? 1 : 0);
            }
        }

        if (
            destination !== undefined &&
            bookmarkControls.moveBookmarkNode(
                sourceData.location,
                String(source.id),
                destination,
                destinationIndex
            )
        ) {
            setEditorDraft(undefined);
            if (
                sourceData.location.categoryIndex === -1 ||
                destination.categoryIndex === -1
            ) {
                setLocation(bookmarkRootLocation);
                setSelectedLocation(undefined);
                setFocusedPane('left');
                setBackLocations([]);
                setForwardLocations([]);
            }
        }
    };

    const selectedKey =
        editorDraft?.mode === 'edit'
            ? editorDraft.kind === 'category'
                ? `category-${editorDraft.categoryIndex}`
                : editorDraft.kind === 'folder'
                  ? `folder-${getLocationKey(
                        editorDraft.categoryIndex,
                        editorDraft.folderPath
                    )}`
                  : `bookmark-${editorDraft.bookmarkId}`
            : undefined;

    const formTitle =
        editorDraft?.kind === 'category'
            ? editorDraft.mode === 'add'
                ? t.newFolder
                : t.folderSettings
            : editorDraft?.kind === 'folder'
              ? editorDraft.mode === 'add'
                  ? t.newFolder
                  : t.folderSettings
              : editorDraft?.mode === 'add'
                ? t.newBookmark
                : t.bookmarkSettings;

    const filteredIconOptions = categoryIconOptions
        .filter((option) =>
            option.searchText.includes(normalizeCategoryIconSearch(iconQuery))
        )
        .slice(0, maxVisibleIconOptions);
    const saveStatus = bookmarkControls.isLoading
        ? {
              icon: <LoaderCircle aria-hidden='true' className='is-spinning' />,
              label: t.bookmarksLoading,
              tone: 'loading',
          }
        : bookmarkControls.saveState === 'saving'
          ? {
                icon: (
                    <LoaderCircle aria-hidden='true' className='is-spinning' />
                ),
                label: t.bookmarkSaving,
                tone: 'loading',
            }
          : bookmarkControls.saveState === 'error'
            ? {
                  icon: <CircleAlert aria-hidden='true' />,
                  label: t.bookmarkSaveFailed,
                  tone: 'error',
              }
            : {
                  icon: <Check aria-hidden='true' />,
                  label: t.bookmarkSaved,
                  tone: 'success',
              };

    return (
        <div
            className='bookmark-workspace-embedded-shell'
            inert={!bookmarkControls.canEdit}
        >
            <div
                ref={dialogRef}
                className='bookmark-workspace bookmark-settings'
                data-editing={editorDraft !== undefined}
                role='region'
                aria-labelledby={titleId}
                tabIndex={-1}
                onPaste={(event) => {
                    if (
                        editorDraft !== undefined ||
                        isTrashOpen ||
                        (event.target instanceof Element &&
                            event.target.closest(
                                'input, textarea, [contenteditable="true"]'
                            ))
                    ) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    pasteLinks(
                        event.clipboardData.getData('text/plain'),
                        event.clipboardData
                    );
                }}
                onKeyDown={(event) => {
                    if (event.key !== 'Escape') {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    if (isEmptyTrashConfirmOpen) {
                        setIsEmptyTrashConfirmOpen(false);
                    } else if (isTrashOpen) {
                        setIsTrashOpen(false);
                    } else if (discardTarget !== undefined) {
                        setDiscardTarget(undefined);
                    } else if (isIconPickerOpen) {
                        setIsIconPickerOpen(false);
                        setIconQuery('');
                        iconPickerTriggerRef.current?.focus();
                    } else if (editorDraft === undefined) {
                        requestDialogClose();
                    } else {
                        cancelEditor();
                    }
                }}
            >
                <header
                    className='bookmark-settings-heading'
                    inert={editorDraft !== undefined}
                >
                    <div className='bookmark-workspace-title-group'>
                        <div className='settings-section-heading'>
                            <h2 id={titleId}>{t.bookmarks}</h2>
                            <p>{t.bookmarksDescription}</p>
                        </div>
                        <span role='status' aria-live='polite'>
                            {pasteMessage}
                        </span>
                        {bookmarkControls.status?.type === 'error' ? (
                            <span
                                className={`bookmark-workspace-operation-status ${bookmarkControls.status.type}`}
                                role='alert'
                            >
                                <CircleAlert aria-hidden='true' />
                                {t[bookmarkControls.status.messageKey]}
                            </span>
                        ) : undefined}
                    </div>
                    <div className='bookmark-workspace-header-actions'>
                        <button
                            className='bookmark-workspace-secondary-button'
                            type='button'
                            aria-keyshortcuts={
                                isAppleDevice ? 'Meta+V' : 'Control+V'
                            }
                            onClick={() => {
                                pasteFromClipboard().catch(() => undefined);
                            }}
                        >
                            <ClipboardPaste aria-hidden='true' />
                            {locale === 'zh-TW' ? '貼上連結' : 'Paste link'}
                            <kbd>{pasteShortcut}</kbd>
                        </button>
                        <button
                            className='bookmark-workspace-secondary-button'
                            type='button'
                            onClick={beginAddBookmark}
                        >
                            <Plus aria-hidden='true' />
                            {locale === 'zh-TW' ? '新增連結' : 'Add link'}
                        </button>
                        <button
                            className='bookmark-workspace-secondary-button'
                            type='button'
                            onClick={beginAddFolder}
                        >
                            <FolderPlus aria-hidden='true' />
                            {t.newFolder}
                        </button>
                        <input
                            ref={importInputRef}
                            id={importInputId}
                            className='bookmark-workspace-file-input'
                            type='file'
                            accept='.html,text/html'
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file !== undefined) {
                                    bookmarkControls
                                        .importBookmarks(file)
                                        .catch(() => undefined);
                                }
                                if (importInputRef.current !== null) {
                                    importInputRef.current.value = '';
                                }
                            }}
                        />
                        <button
                            className='bookmark-workspace-header-button'
                            type='button'
                            aria-label={t.import}
                            onClick={() => importInputRef.current?.click()}
                        >
                            <Upload aria-hidden='true' />
                            <span>{t.import}</span>
                        </button>
                        <button
                            className='bookmark-workspace-header-button'
                            type='button'
                            aria-label={t.export}
                            onClick={bookmarkControls.exportBookmarks}
                        >
                            <Download aria-hidden='true' />
                            <span>{t.export}</span>
                        </button>
                        <button
                            className='bookmark-workspace-header-button'
                            type='button'
                            aria-label={t.trash}
                            onClick={() => {
                                setIsTrashOpen(true);
                            }}
                        >
                            <Trash2 aria-hidden='true' />
                            <span>{t.trash}</span>
                            {bookmarkControls.bookmarkTrash.length ===
                            0 ? undefined : (
                                <small className='bookmark-workspace-count-badge'>
                                    {bookmarkControls.bookmarkTrash.length}
                                </small>
                            )}
                        </button>
                    </div>
                </header>

                <div
                    className='bookmark-settings-toolbar'
                    inert={editorDraft !== undefined}
                >
                    <div className='bookmark-settings-path'>
                        <div className='bookmark-workspace-layer-controls'>
                            <button
                                type='button'
                                aria-label={t.previousFolderLayer}
                                disabled={backLocations.length === 0}
                                onClick={navigateBack}
                            >
                                <ChevronLeft aria-hidden='true' />
                            </button>
                            <button
                                type='button'
                                aria-label={t.nextFolderLayer}
                                disabled={forwardLocations.length === 0}
                                onClick={navigateForward}
                            >
                                <ChevronRight aria-hidden='true' />
                            </button>
                        </div>
                        <div className='bookmark-settings-current-location'>
                            {createBookmarkIcon(activeIcon, 'icon')}
                            <span>{getLocationTitle(activeAddLocation)}</span>
                        </div>
                    </div>
                    <div
                        className='bookmark-workspace-search quiet'
                        role='search'
                    >
                        <Search aria-hidden='true' />
                        <input
                            ref={queryInputRef}
                            type='search'
                            aria-label={t.bookmarkSearch}
                            placeholder={t.bookmarkSearch}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                            }}
                        />
                        {query === '' ? undefined : (
                            <button
                                type='button'
                                aria-label={t.cancel}
                                onClick={() => {
                                    setQuery('');
                                    queryInputRef.current?.focus();
                                }}
                            >
                                <X aria-hidden='true' />
                            </button>
                        )}
                    </div>
                </div>
                <DragDropProvider onDragEnd={handleDragEnd}>
                    <div
                        className='bookmark-settings-browser bookmark-workspace-grid'
                        inert={editorDraft !== undefined}
                    >
                        <aside
                            className='bookmark-workspace-tree-pane'
                            tabIndex={0}
                            onPointerDownCapture={(event) => {
                                if (
                                    event.target instanceof Element &&
                                    !event.target.closest(
                                        '.bookmark-workspace-list-row'
                                    )
                                ) {
                                    setFocusedPane('left');
                                }
                            }}
                            onFocusCapture={(event) => {
                                if (event.target === event.currentTarget) {
                                    setFocusedPane('left');
                                }
                            }}
                            aria-label={sidebarLayerTitle}
                        >
                            <BookmarkSidebarDropTarget
                                disabled={
                                    bookmarkControls.isLoading ||
                                    normalizedQuery !== ''
                                }
                                label={sidebarLayerTitle}
                                location={location}
                                onClick={(event) => {
                                    if (event.target === event.currentTarget) {
                                        setFocusedPane('left');
                                    }
                                }}
                            >
                                {bookmarkControls.isLoading ? (
                                    <div
                                        className='bookmark-workspace-skeleton-list'
                                        aria-label={t.bookmarksLoading}
                                    >
                                        {Array.from(
                                            { length: 6 },
                                            (_, index) => (
                                                <span key={index} />
                                            )
                                        )}
                                    </div>
                                ) : visibleSidebarItems.length === 0 ? (
                                    <div className='bookmark-workspace-empty compact'>
                                        <Search aria-hidden='true' />
                                        <strong>
                                            {normalizedQuery === ''
                                                ? t.bookmarksEmpty
                                                : t.bookmarkSearchEmpty}
                                        </strong>
                                        <span>
                                            {normalizedQuery === ''
                                                ? t.bookmarksEmptyDescription
                                                : t.bookmarkSearchEmptyDescription}
                                        </span>
                                    </div>
                                ) : (
                                    visibleSidebarItems.map(
                                        (item, nodeIndex) => {
                                            const folder = isBookmarkFolder(
                                                item.node
                                            )
                                                ? item.node
                                                : undefined;
                                            const bookmark = isBookmarkLink(
                                                item.node
                                            )
                                                ? item.node
                                                : undefined;
                                            const itemKey = item.node.id;
                                            const isSelected =
                                                item.folderLocation !==
                                                    undefined &&
                                                selectedLocation !==
                                                    undefined &&
                                                isSameLocation(
                                                    item.folderLocation,
                                                    selectedLocation
                                                );
                                            return (
                                                <SortableBookmarkRow
                                                    key={itemKey}
                                                    nodeId={itemKey}
                                                    nodeIndex={nodeIndex}
                                                    isFolder={
                                                        folder !== undefined
                                                    }
                                                    selected={isSelected}
                                                    disabled={
                                                        normalizedQuery !== ''
                                                    }
                                                    location={location}
                                                >
                                                    {(sourceRef) => (
                                                        <>
                                                            {folder ? (
                                                                <>
                                                                    <button
                                                                        ref={
                                                                            sourceRef
                                                                        }
                                                                        className='bookmark-workspace-tree-item'
                                                                        type='button'
                                                                        aria-pressed={
                                                                            isSelected
                                                                        }
                                                                        onClick={() => {
                                                                            if (
                                                                                item.folderLocation
                                                                            ) {
                                                                                selectSidebarFolder(
                                                                                    item.folderLocation
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
                                                                        {createBookmarkIcon(
                                                                            folder.icon,
                                                                            'icon'
                                                                        )}
                                                                        <FolderLabel>
                                                                            <strong>
                                                                                {
                                                                                    folder.title
                                                                                }
                                                                            </strong>
                                                                            <small>
                                                                                {itemCountLabel(
                                                                                    folder
                                                                                        .children
                                                                                        .length
                                                                                )}
                                                                            </small>
                                                                        </FolderLabel>
                                                                    </button>
                                                                    <BookmarkActions
                                                                        bookmark={
                                                                            folder
                                                                        }
                                                                        labels={
                                                                            bookmarkActionLabels
                                                                        }
                                                                        onDelete={() => {
                                                                            if (
                                                                                item.folderLocation
                                                                            ) {
                                                                                deleteItem(
                                                                                    {
                                                                                        ...item.folderLocation,
                                                                                        kind: item.isCategory
                                                                                            ? 'category'
                                                                                            : 'folder',
                                                                                    }
                                                                                );
                                                                            }
                                                                        }}
                                                                        onEdit={() => {
                                                                            if (
                                                                                item.folderLocation
                                                                            ) {
                                                                                if (
                                                                                    item.isCategory
                                                                                ) {
                                                                                    editCategory(
                                                                                        item
                                                                                            .folderLocation
                                                                                            .categoryIndex
                                                                                    );
                                                                                } else {
                                                                                    editFolder(
                                                                                        item.folderLocation
                                                                                    );
                                                                                }
                                                                            }
                                                                        }}
                                                                    />
                                                                </>
                                                            ) : bookmark ? (
                                                                <>
                                                                    <BookmarkCard
                                                                        sourceRef={
                                                                            sourceRef
                                                                        }
                                                                        bookmark={
                                                                            bookmark
                                                                        }
                                                                        onClick={() => {
                                                                            editBookmark(
                                                                                item.containerLocation,
                                                                                bookmark
                                                                            );
                                                                        }}
                                                                    />
                                                                    <BookmarkActions
                                                                        bookmark={
                                                                            bookmark
                                                                        }
                                                                        addToFeedsLabel={
                                                                            t.addToFeeds
                                                                        }
                                                                        onAddToFeeds={getAddToFeedsAction(
                                                                            bookmark.id
                                                                        )}
                                                                        labels={
                                                                            bookmarkActionLabels
                                                                        }
                                                                        onEdit={() => {
                                                                            editBookmark(
                                                                                item.containerLocation,
                                                                                bookmark
                                                                            );
                                                                        }}
                                                                        onDelete={() => {
                                                                            deleteItem(
                                                                                {
                                                                                    ...item.containerLocation,
                                                                                    kind: 'bookmark',
                                                                                    bookmarkId:
                                                                                        bookmark.id,
                                                                                }
                                                                            );
                                                                        }}
                                                                    />
                                                                </>
                                                            ) : undefined}
                                                        </>
                                                    )}
                                                </SortableBookmarkRow>
                                            );
                                        }
                                    )
                                )}
                            </BookmarkSidebarDropTarget>
                        </aside>

                        <main
                            className='bookmark-workspace-list-pane'
                            tabIndex={0}
                            onPointerDownCapture={() => {
                                setFocusedPane('right');
                            }}
                            onFocusCapture={() => {
                                setFocusedPane('right');
                            }}
                            data-empty={selectedLocation === undefined}
                            aria-label={
                                selectedLocation === undefined
                                    ? t.bookmarks
                                    : getLocationTitle(selectedLocation)
                            }
                        >
                            <BookmarkLocationDropTarget
                                className='bookmark-workspace-list'
                                disabled={
                                    currentCategory === undefined ||
                                    normalizedQuery !== ''
                                }
                                idSuffix='content'
                                location={rightLocation}
                            >
                                {bookmarkControls.isLoading ? (
                                    <div className='bookmark-workspace-skeleton-list large'>
                                        {Array.from(
                                            { length: 5 },
                                            (_, index) => (
                                                <span key={index} />
                                            )
                                        )}
                                    </div>
                                ) : currentCategory === undefined ? (
                                    <div className='bookmark-workspace-empty'>
                                        <Bookmark aria-hidden='true' />
                                        <strong>{t.bookmarksEmpty}</strong>
                                        <span>
                                            {t.bookmarksEmptyDescription}
                                        </span>
                                    </div>
                                ) : visibleNodes.length === 0 ? (
                                    <div className='bookmark-workspace-empty'>
                                        {normalizedQuery === '' ? (
                                            <FolderOpen aria-hidden='true' />
                                        ) : (
                                            <Search aria-hidden='true' />
                                        )}
                                        <strong>
                                            {normalizedQuery === ''
                                                ? t.noItems
                                                : t.bookmarkSearchEmpty}
                                        </strong>
                                        <span>
                                            {normalizedQuery === ''
                                                ? t.noItemsDescription
                                                : t.bookmarkSearchEmptyDescription}
                                        </span>
                                    </div>
                                ) : (
                                    visibleNodes.map((node, nodeIndex) => {
                                        const isFolder = isBookmarkFolder(node);
                                        const rowKey = isFolder
                                            ? `folder-${getLocationKey(
                                                  rightLocation.categoryIndex,
                                                  [
                                                      ...rightLocation.folderPath,
                                                      node.id,
                                                  ]
                                              )}`
                                            : `bookmark-${node.id}`;
                                        const folderLocation = {
                                            categoryIndex:
                                                rightLocation.categoryIndex,
                                            folderPath: [
                                                ...rightLocation.folderPath,
                                                node.id,
                                            ],
                                        };
                                        return (
                                            <SortableBookmarkRow
                                                key={node.id}
                                                disabled={
                                                    normalizedQuery !== ''
                                                }
                                                isFolder={isFolder}
                                                location={rightLocation}
                                                nodeId={node.id}
                                                nodeIndex={nodeIndex}
                                                selected={
                                                    selectedKey === rowKey
                                                }
                                            >
                                                {(sourceRef) => (
                                                    <>
                                                        {isFolder ? (
                                                            <button
                                                                ref={sourceRef}
                                                                className='bookmark-workspace-tree-item'
                                                                type='button'
                                                                onClick={() => {
                                                                    enterFolder(
                                                                        folderLocation
                                                                    );
                                                                }}
                                                            >
                                                                <span
                                                                    className='bookmark-workspace-item-icon'
                                                                    data-kind='folder'
                                                                >
                                                                    {createBookmarkIcon(
                                                                        node.icon,
                                                                        'icon'
                                                                    )}
                                                                </span>
                                                                <FolderLabel>
                                                                    <strong>
                                                                        {
                                                                            node.title
                                                                        }
                                                                    </strong>
                                                                    <small>
                                                                        {itemCountLabel(
                                                                            node
                                                                                .children
                                                                                .length
                                                                        )}
                                                                    </small>
                                                                </FolderLabel>
                                                            </button>
                                                        ) : (
                                                            <BookmarkCard
                                                                sourceRef={
                                                                    sourceRef
                                                                }
                                                                bookmark={node}
                                                                onClick={() => {
                                                                    editBookmark(
                                                                        rightLocation,
                                                                        node
                                                                    );
                                                                }}
                                                            />
                                                        )}
                                                        {isFolder ? (
                                                            <BookmarkActions
                                                                bookmark={node}
                                                                labels={
                                                                    bookmarkActionLabels
                                                                }
                                                                onDelete={() => {
                                                                    deleteItem({
                                                                        ...folderLocation,
                                                                        kind: 'folder',
                                                                    });
                                                                }}
                                                                onEdit={() => {
                                                                    editFolder(
                                                                        folderLocation
                                                                    );
                                                                }}
                                                            />
                                                        ) : (
                                                            <BookmarkActions
                                                                bookmark={node}
                                                                addToFeedsLabel={
                                                                    t.addToFeeds
                                                                }
                                                                onAddToFeeds={getAddToFeedsAction(
                                                                    node.id
                                                                )}
                                                                labels={
                                                                    bookmarkActionLabels
                                                                }
                                                                onEdit={() => {
                                                                    editBookmark(
                                                                        rightLocation,
                                                                        node
                                                                    );
                                                                }}
                                                                onDelete={() => {
                                                                    deleteItem({
                                                                        ...rightLocation,
                                                                        kind: 'bookmark',
                                                                        bookmarkId:
                                                                            node.id,
                                                                    });
                                                                }}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </SortableBookmarkRow>
                                        );
                                    })
                                )}
                            </BookmarkLocationDropTarget>
                        </main>
                    </div>
                </DragDropProvider>

                {editorDraft === undefined ? undefined : (
                    <dialog
                        className='bookmark-settings-editor bookmark-edit-dialog'
                        aria-label={formTitle}
                        ref={(element) => {
                            if (element && !element.open) {
                                element.showModal();
                            }
                        }}
                        onCancel={(event) => {
                            event.preventDefault();
                            cancelEditor();
                        }}
                    >
                        <div
                            className='bookmark-settings-editor-content'
                            role='region'
                            aria-label={formTitle}
                            onPointerDownCapture={(event) => {
                                const { target } = event;
                                if (!(target instanceof Element)) {
                                    return;
                                }

                                if (
                                    isIconPickerOpen &&
                                    !target.closest(
                                        '.bookmark-workspace-icon-picker-trigger, .bookmark-workspace-icon-picker'
                                    )
                                ) {
                                    setIsIconPickerOpen(false);
                                    setIconQuery('');
                                }
                            }}
                        >
                            <form
                                className='bookmark-workspace-form'
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    saveDraft();
                                }}
                            >
                                <div className='bookmark-workspace-form-heading'>
                                    <div>
                                        <h3>{formTitle}</h3>
                                    </div>
                                    <button
                                        className='bookmark-workspace-inspector-close'
                                        type='button'
                                        aria-label={t.cancel}
                                        onClick={cancelEditor}
                                    >
                                        <X aria-hidden='true' />
                                    </button>
                                </div>

                                <label className='bookmark-workspace-field'>
                                    <span>
                                        {editorDraft.kind === 'folder'
                                            ? t.folderName
                                            : editorDraft.kind === 'category'
                                              ? t.folderName
                                              : t.bookmarkTitle}
                                    </span>
                                    <input
                                        autoFocus
                                        type='text'
                                        value={editorDraft.title}
                                        aria-invalid={
                                            formErrors.title !== undefined
                                        }
                                        onPointerDown={(event) => {
                                            event.currentTarget.focus();
                                        }}
                                        onChange={(event) => {
                                            setEditorDraft({
                                                ...editorDraft,
                                                title: event.target.value,
                                            });
                                            setFormErrors((current) => ({
                                                ...current,
                                                title: undefined,
                                            }));
                                        }}
                                    />
                                    {formErrors.title ===
                                    undefined ? undefined : (
                                        <small role='alert'>
                                            {formErrors.title}
                                        </small>
                                    )}
                                </label>

                                {editorDraft.kind === 'bookmark' ? (
                                    <>
                                        <label className='bookmark-workspace-field'>
                                            <span>{t.bookmarkUrl}</span>
                                            <input
                                                type='text'
                                                inputMode='url'
                                                placeholder='https://'
                                                value={editorDraft.url}
                                                aria-invalid={
                                                    formErrors.url !== undefined
                                                }
                                                onPointerDown={(event) => {
                                                    event.currentTarget.focus();
                                                }}
                                                onChange={(event) => {
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        url: event.target.value,
                                                    });
                                                    setFormErrors(
                                                        (current) => ({
                                                            ...current,
                                                            url: undefined,
                                                        })
                                                    );
                                                }}
                                            />
                                            {formErrors.url ===
                                            undefined ? undefined : (
                                                <small role='alert'>
                                                    {formErrors.url}
                                                </small>
                                            )}
                                        </label>
                                    </>
                                ) : (
                                    <div className='bookmark-workspace-field'>
                                        <span>{t.categoryIcon}</span>
                                        <button
                                            ref={iconPickerTriggerRef}
                                            className='bookmark-workspace-icon-picker-trigger'
                                            type='button'
                                            aria-expanded={isIconPickerOpen}
                                            onClick={() => {
                                                const nextIsOpen =
                                                    !isIconPickerOpen;
                                                setIconQuery('');
                                                setIsIconPickerOpen(nextIsOpen);
                                            }}
                                        >
                                            {createBookmarkIcon(
                                                editorDraft.icon,
                                                'icon'
                                            )}
                                            <span>{editorDraft.icon}</span>
                                            <ChevronDown aria-hidden='true' />
                                        </button>
                                        {isIconPickerOpen ? (
                                            <div className='bookmark-workspace-icon-picker'>
                                                <div
                                                    className='bookmark-workspace-search bookmark-workspace-icon-search quiet'
                                                    role='search'
                                                >
                                                    <Search aria-hidden='true' />
                                                    <input
                                                        ref={iconSearchInputRef}
                                                        type='text'
                                                        inputMode='search'
                                                        aria-label={
                                                            t.categoryIconSearch
                                                        }
                                                        placeholder={
                                                            t.categoryIconSearch
                                                        }
                                                        value={iconQuery}
                                                        onPointerDown={(
                                                            event
                                                        ) => {
                                                            event.currentTarget.focus();
                                                        }}
                                                        onChange={(event) => {
                                                            setIconQuery(
                                                                event.target
                                                                    .value
                                                            );
                                                        }}
                                                    />
                                                    {iconQuery ===
                                                    '' ? undefined : (
                                                        <button
                                                            type='button'
                                                            aria-label={t.clear}
                                                            onClick={() => {
                                                                setIconQuery(
                                                                    ''
                                                                );
                                                                iconSearchInputRef.current?.focus();
                                                            }}
                                                        >
                                                            <X aria-hidden='true' />
                                                        </button>
                                                    )}
                                                </div>
                                                {filteredIconOptions.length ===
                                                0 ? (
                                                    <p className='bookmark-workspace-icon-empty'>
                                                        {
                                                            t.categoryIconSearchEmpty
                                                        }
                                                    </p>
                                                ) : (
                                                    <div className='bookmark-workspace-icon-grid'>
                                                        {filteredIconOptions.map(
                                                            (option) => (
                                                                <button
                                                                    key={
                                                                        option.iconName
                                                                    }
                                                                    type='button'
                                                                    aria-label={
                                                                        option.label
                                                                    }
                                                                    aria-pressed={
                                                                        editorDraft.icon ===
                                                                        option.iconName
                                                                    }
                                                                    onClick={() => {
                                                                        setEditorDraft(
                                                                            {
                                                                                ...editorDraft,
                                                                                icon: option.iconName,
                                                                            }
                                                                        );
                                                                        setIsIconPickerOpen(
                                                                            false
                                                                        );
                                                                        setIconQuery(
                                                                            ''
                                                                        );
                                                                        iconPickerTriggerRef.current?.focus();
                                                                    }}
                                                                >
                                                                    <option.Icon aria-hidden='true' />
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : undefined}
                                    </div>
                                )}

                                <div className='bookmark-workspace-form-spacer' />
                                {bookmarkControls.saveState ===
                                'saved' ? undefined : (
                                    <div
                                        className={`bookmark-workspace-form-save-state ${saveStatus.tone}`}
                                        role='status'
                                    >
                                        {saveStatus.icon}
                                        {saveStatus.label}
                                    </div>
                                )}
                                <div
                                    className='bookmark-workspace-form-actions'
                                    data-editing={editorDraft.mode === 'edit'}
                                >
                                    <span />
                                    <button
                                        className='bookmark-workspace-secondary-button'
                                        type='button'
                                        onClick={cancelEditor}
                                    >
                                        {t.cancel}
                                    </button>
                                    <button
                                        className='bookmark-workspace-primary-button'
                                        type='submit'
                                        disabled={!isDraftDirty}
                                    >
                                        {bookmarkControls.saveState ===
                                        'saving' ? (
                                            <LoaderCircle
                                                aria-hidden='true'
                                                className='is-spinning'
                                            />
                                        ) : (
                                            <Check aria-hidden='true' />
                                        )}
                                        {t.save}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </dialog>
                )}

                {isTrashOpen ? (
                    <div className='bookmark-workspace-editor-backdrop'>
                        <section
                            className='bookmark-workspace-trash-dialog'
                            role='dialog'
                            aria-label={t.trash}
                            aria-modal='true'
                        >
                            <header>
                                <div>
                                    <Trash2 aria-hidden='true' />
                                    <div>
                                        <h3>{t.trash}</h3>
                                        <p>{t.trashEmptyDescription}</p>
                                    </div>
                                </div>
                                <button
                                    className='bookmark-workspace-icon-button'
                                    type='button'
                                    aria-label={t.cancel}
                                    onClick={() => {
                                        setIsTrashOpen(false);
                                    }}
                                >
                                    <X aria-hidden='true' />
                                </button>
                            </header>
                            {bookmarkControls.bookmarkTrash.length === 0 ? (
                                <div className='bookmark-workspace-empty'>
                                    <Trash2 aria-hidden='true' />
                                    <strong>{t.trashEmpty}</strong>
                                    <span>{t.trashEmptyDescription}</span>
                                </div>
                            ) : (
                                <div className='bookmark-workspace-trash-list'>
                                    {bookmarkControls.bookmarkTrash.map(
                                        (trashItem) => (
                                            <div key={trashItem.id}>
                                                <span className='bookmark-workspace-item-icon'>
                                                    {trashItem.kind ===
                                                    'bookmark' ? (
                                                        <Link2 aria-hidden='true' />
                                                    ) : (
                                                        <FolderOpen aria-hidden='true' />
                                                    )}
                                                </span>
                                                <span>
                                                    <strong>
                                                        {trashItem.label}
                                                    </strong>
                                                    <small>
                                                        {t[trashItem.kind]} ·{' '}
                                                        {new Intl.DateTimeFormat(
                                                            locale,
                                                            {
                                                                dateStyle:
                                                                    'medium',
                                                            }
                                                        ).format(
                                                            new Date(
                                                                trashItem.deletedAt
                                                            )
                                                        )}
                                                    </small>
                                                </span>
                                                <button
                                                    className='bookmark-workspace-secondary-button'
                                                    type='button'
                                                    onClick={() => {
                                                        bookmarkControls.restoreTrashItem(
                                                            trashItem.id
                                                        );
                                                    }}
                                                >
                                                    <Undo2 aria-hidden='true' />
                                                    {t.restore}
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                            <footer>
                                <button
                                    className='bookmark-workspace-danger-button'
                                    type='button'
                                    disabled={
                                        bookmarkControls.bookmarkTrash
                                            .length === 0
                                    }
                                    onClick={() => {
                                        setIsEmptyTrashConfirmOpen(true);
                                    }}
                                >
                                    <Trash2 aria-hidden='true' />
                                    {t.emptyTrash}
                                </button>
                            </footer>
                        </section>
                    </div>
                ) : undefined}

                {isEmptyTrashConfirmOpen ? (
                    <div className='bookmark-workspace-confirm-backdrop'>
                        <div
                            className='bookmark-workspace-confirm'
                            role='alertdialog'
                            aria-modal='true'
                        >
                            <span className='bookmark-workspace-confirm-icon danger'>
                                <Trash2 aria-hidden='true' />
                            </span>
                            <div>
                                <h3>{t.emptyTrash}?</h3>
                                <p>{t.emptyTrashConfirm}</p>
                            </div>
                            <div>
                                <button
                                    type='button'
                                    onClick={() => {
                                        setIsEmptyTrashConfirmOpen(false);
                                    }}
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    className='danger'
                                    type='button'
                                    onClick={() => {
                                        bookmarkControls.emptyTrash();
                                        setIsEmptyTrashConfirmOpen(false);
                                    }}
                                >
                                    <Trash2 aria-hidden='true' />
                                    {t.emptyTrash}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : undefined}

                {discardTarget === undefined ? undefined : (
                    <dialog
                        className='bookmark-workspace-confirm-backdrop bookmark-discard-dialog'
                        ref={(element) => {
                            if (element && !element.open) {
                                element.showModal();
                            }
                        }}
                        onCancel={(event) => {
                            event.preventDefault();
                            setDiscardTarget(undefined);
                        }}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                        }}
                    >
                        <div
                            className='bookmark-workspace-confirm'
                            role='alertdialog'
                            aria-modal='true'
                        >
                            <span className='bookmark-workspace-confirm-icon danger'>
                                <CircleAlert aria-hidden='true' />
                            </span>
                            <div>
                                <h3>{t.discardChanges}</h3>
                                <p>{t.discardChangesConfirm}</p>
                            </div>
                            <div>
                                <button
                                    type='button'
                                    onClick={() => {
                                        setDiscardTarget(undefined);
                                    }}
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    className='danger'
                                    type='button'
                                    onClick={confirmDiscard}
                                >
                                    {t.discard}
                                </button>
                            </div>
                        </div>
                    </dialog>
                )}

                {undoSnapshot === undefined ? undefined : (
                    <div
                        ref={undoToastRef}
                        className='bookmark-workspace-toast'
                        role='status'
                    >
                        <span>{t.deleted}</span>
                        <button type='button' onClick={undoDelete}>
                            {t.undo}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
