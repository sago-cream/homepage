/* eslint-disable no-nested-ternary -- Visual state branches are clearest inline in this workspace. */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DragDropProvider, useDroppable } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
    Bookmark,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    ClipboardPaste,
    Download,
    ExternalLink,
    FolderOpen,
    FolderPlus,
    Link as LinkIcon,
    LoaderCircle,
    MoreHorizontal,
    Plus,
    Search,
    Trash2,
    Undo2,
    Upload,
    X,
} from 'lucide-react';
import { createPortal } from 'react-dom';

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
import { isBookmarkFolder, isBookmarkLink } from '@/utils/bookmarks';

interface BookmarkManagerDialogProps {
    bookmarkControls: BookmarkControls;
    onClose: () => void;
}

interface BookmarkLocation {
    categoryIndex: number;
    folderPath: string[];
}

interface EditorDraft extends BookmarkLocation {
    bookmarkId?: string;
    destinationKey: string;
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

interface DestinationOption {
    key: string;
    label: string;
    location: BookmarkLocation;
}

interface FormErrors {
    title?: string;
    url?: string;
}

interface PastedBookmark {
    title: string;
    url: string;
}

interface DragNodeData {
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
        data: { isFolder, kind: 'node', location },
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

const defaultIconName = 'Folder';
const folderPathSeparator = ' / ';
const maxVisibleIconOptions = 40;

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

const countBookmarks = (nodes: readonly BookmarkNodeData[]): number =>
    nodes.reduce(
        (count, node) =>
            count + (isBookmarkLink(node) ? 1 : countBookmarks(node.children)),
        0
    );

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

const categoryMatchesSearch = (
    category: BookmarkCategoryData,
    normalizedQuery: string
): boolean =>
    category.category.toLowerCase().includes(normalizedQuery) ||
    category.children.some((node) => nodeMatchesSearch(node, normalizedQuery));

const collectDestinations = (
    nodes: readonly BookmarkNodeData[],
    categoryIndex: number,
    parentLabel: string,
    folderPath: readonly string[] = []
): DestinationOption[] =>
    nodes.flatMap((node) => {
        if (!isBookmarkFolder(node)) {
            return [];
        }

        const nextPath = [...folderPath, node.id];
        const label = `${parentLabel}${folderPathSeparator}${node.title}`;

        return [
            {
                key: getLocationKey(categoryIndex, nextPath),
                label,
                location: { categoryIndex, folderPath: nextPath },
            },
            ...collectDestinations(
                node.children,
                categoryIndex,
                label,
                nextPath
            ),
        ];
    });

const getDestinationOptions = (
    bookmarkTree: readonly BookmarkCategoryData[]
): DestinationOption[] =>
    bookmarkTree.flatMap((category, categoryIndex) => [
        {
            key: getLocationKey(categoryIndex, []),
            label: category.category,
            location: { categoryIndex, folderPath: [] },
        },
        ...collectDestinations(
            category.children,
            categoryIndex,
            category.category
        ),
    ]);

const serializeDraft = (draft: EditorDraft): string =>
    JSON.stringify({
        destinationKey: draft.destinationKey,
        icon: draft.icon,
        title: draft.title,
        url: draft.url,
    });

const getBookmarkHost = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

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

export const BookmarkManagerDialog: React.FC<BookmarkManagerDialogProps> = ({
    bookmarkControls,
    onClose,
}) => {
    const { locale, t } = useLocale();
    const titleId = useId();
    const importInputId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const queryInputRef = useRef<HTMLInputElement>(null);
    const addMenuTriggerRef = useRef<HTMLButtonElement>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const locationPickerTriggerRef = useRef<HTMLButtonElement>(null);
    const locationOptionsRef = useRef<HTMLDivElement>(null);
    const iconPickerTriggerRef = useRef<HTMLButtonElement>(null);
    const iconSearchInputRef = useRef<HTMLInputElement>(null);
    const [location, setLocation] = useState<BookmarkLocation>(() => ({
        categoryIndex: bookmarkControls.bookmarkTree.length === 0 ? -1 : 0,
        folderPath: [],
    }));
    const [backLocations, setBackLocations] = useState<BookmarkLocation[]>([]);
    const [forwardLocations, setForwardLocations] = useState<
        BookmarkLocation[]
    >([]);
    const [query, setQuery] = useState('');
    const [activePane, setActivePane] = useState<'list' | 'tree'>(() =>
        bookmarkControls.bookmarkTree.length === 0 ? 'tree' : 'list'
    );
    const [editorDraft, setEditorDraft] = useState<EditorDraft>();
    const [draftBaseline, setDraftBaseline] = useState('');
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
    const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
    const [iconQuery, setIconQuery] = useState('');
    const [isTrashOpen, setIsTrashOpen] = useState(false);
    const [isEmptyTrashConfirmOpen, setIsEmptyTrashConfirmOpen] =
        useState(false);
    const [discardTarget, setDiscardTarget] = useState<'dialog' | 'editor'>();
    const [undoSnapshot, setUndoSnapshot] = useState<{
        id: string;
    }>();
    const undoToastRef = useRef<HTMLDivElement>(null);
    const [quickAddValue, setQuickAddValue] = useState('');
    const [quickAddMessage, setQuickAddMessage] = useState('');

    const { bookmarkTree } = bookmarkControls;
    const decoratedTree = useMemo(
        () => decorateBookmarkTree(bookmarkTree),
        [bookmarkTree]
    );
    const destinationOptions = useMemo(
        () => getDestinationOptions(bookmarkTree),
        [bookmarkTree]
    );
    const currentCategory = bookmarkTree.at(location.categoryIndex);
    const currentFolder = getFolderAtPath(
        currentCategory?.children ?? [],
        location.folderPath
    );
    const currentNodes = getNodesAtPath(currentCategory, location.folderPath);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleNodes =
        normalizedQuery === ''
            ? currentNodes
            : currentNodes.filter((node) =>
                  nodeMatchesSearch(node, normalizedQuery)
              );
    const rootCategoryIndex = bookmarkTree.findIndex(
        (category) =>
            category.category.trim().toLocaleLowerCase(locale) ===
            t.bookmarks.toLocaleLowerCase(locale)
    );
    const sidebarParentPath = location.folderPath.slice(0, -1);
    const sidebarParentFolder = getFolderAtPath(
        currentCategory?.children ?? [],
        sidebarParentPath
    );
    const activeAddLocation =
        activePane === 'tree'
            ? location.folderPath.length === 0
                ? undefined
                : {
                      categoryIndex: location.categoryIndex,
                      folderPath: sidebarParentPath,
                  }
            : location;
    const canAddBookmark =
        activeAddLocation !== undefined &&
        bookmarkTree.at(activeAddLocation.categoryIndex) !== undefined;
    const canAddFolder = activePane === 'tree' || currentCategory !== undefined;
    const sidebarLayerTitle =
        location.folderPath.length === 0
            ? t.folders
            : (sidebarParentFolder?.title ??
              currentCategory?.category ??
              t.folders);
    const sidebarLocations: BookmarkLocation[] = (() => {
        if (normalizedQuery !== '') {
            return destinationOptions.flatMap((option) => {
                const { location: optionLocation } = option;
                if (
                    optionLocation.categoryIndex === rootCategoryIndex &&
                    optionLocation.folderPath.length === 0
                ) {
                    return [];
                }

                const category = bookmarkTree.at(optionLocation.categoryIndex);
                const item =
                    optionLocation.folderPath.length === 0
                        ? category
                        : getFolderAtPath(
                              category?.children ?? [],
                              optionLocation.folderPath
                          );
                const matches =
                    item !== undefined &&
                    ('category' in item
                        ? categoryMatchesSearch(item, normalizedQuery)
                        : nodeMatchesSearch(item, normalizedQuery));

                return matches ? [optionLocation] : [];
            });
        }

        if (location.folderPath.length === 0) {
            return bookmarkTree.flatMap((_, categoryIndex) =>
                categoryIndex === rootCategoryIndex
                    ? []
                    : [{ categoryIndex, folderPath: [] }]
            );
        }

        return getNodesAtPath(currentCategory, sidebarParentPath).flatMap(
            (node) =>
                isBookmarkFolder(node)
                    ? [
                          {
                              categoryIndex: location.categoryIndex,
                              folderPath: [...sidebarParentPath, node.id],
                          },
                      ]
                    : []
        );
    })();
    const isDraftDirty =
        editorDraft !== undefined &&
        serializeDraft(editorDraft) !== draftBaseline;

    const addPastedBookmarks = (bookmarks: readonly PastedBookmark[]) => {
        if (currentCategory === undefined || bookmarks.length === 0) {
            setQuickAddMessage(t.bookmarkUrlInvalid);
            return;
        }

        const addedCount = bookmarkControls.addBookmarksToLocation(
            location,
            bookmarks
        );
        setQuickAddValue('');
        setQuickAddMessage(
            addedCount === 0
                ? t.bookmarksAlreadySaved
                : locale === 'zh-TW'
                  ? `已新增 ${addedCount} 個連結`
                  : `${addedCount} ${addedCount === 1 ? 'link' : 'links'} added`
        );
    };

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
        setIsLocationPickerOpen(false);
        setIsAddMenuOpen(false);
    };

    const navigateToLocation = (nextLocation: BookmarkLocation) => {
        if (isSameLocation(location, nextLocation)) {
            return;
        }

        setBackLocations((current: readonly BookmarkLocation[]) => [
            ...current.slice(-49),
            location,
        ]);
        setForwardLocations([]);
        setLocation(nextLocation);
    };

    const navigateBack = () => {
        const previousLocation = backLocations.at(-1);
        if (previousLocation === undefined) {
            return;
        }

        setBackLocations((current: readonly BookmarkLocation[]) =>
            current.slice(0, -1)
        );
        setForwardLocations((current: readonly BookmarkLocation[]) => [
            location,
            ...current.slice(0, 49),
        ]);
        setLocation(previousLocation);
    };

    const navigateForward = () => {
        const nextLocation = forwardLocations.at(0);
        if (nextLocation === undefined) {
            return;
        }

        setForwardLocations((current: readonly BookmarkLocation[]) =>
            current.slice(1)
        );
        setBackLocations((current: readonly BookmarkLocation[]) => [
            ...current.slice(-49),
            location,
        ]);
        setLocation(nextLocation);
    };

    const navigateToCategory = (categoryIndex: number) => {
        navigateToLocation({ categoryIndex, folderPath: [] });
    };

    const navigateToFolder = (nextLocation: BookmarkLocation) => {
        navigateToLocation(nextLocation);
    };

    const editCategory = (categoryIndex: number) => {
        const category = bookmarkTree.at(categoryIndex);
        const decoratedCategory = decoratedTree.at(categoryIndex);
        if (category === undefined || decoratedCategory === undefined) {
            return;
        }

        navigateToCategory(categoryIndex);
        openDraft({
            categoryIndex,
            destinationKey: '',
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

        navigateToFolder({
            categoryIndex: nextLocation.categoryIndex,
            folderPath: [...nextLocation.folderPath],
        });
        openDraft({
            ...nextLocation,
            destinationKey: '',
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
        setLocation(nextLocation);
        openDraft({
            ...nextLocation,
            bookmarkId: bookmark.id,
            destinationKey: getLocationKey(
                nextLocation.categoryIndex,
                nextLocation.folderPath
            ),
            icon: '',
            kind: 'bookmark',
            mode: 'edit',
            title: bookmark.title,
            url: bookmark.url,
        });
    };

    const beginAddCategory = () => {
        openDraft({
            categoryIndex: -1,
            destinationKey: '',
            folderPath: [],
            icon: defaultIconName,
            kind: 'category',
            mode: 'add',
            title: '',
            url: '',
        });
    };

    const beginAddFolder = () => {
        if (activeAddLocation === undefined) {
            beginAddCategory();
            return;
        }

        openDraft({
            ...activeAddLocation,
            destinationKey: '',
            icon: defaultIconName,
            kind: 'folder',
            mode: 'add',
            title: '',
            url: '',
        });
    };

    const beginAddBookmark = () => {
        if (
            activeAddLocation === undefined ||
            bookmarkTree.at(activeAddLocation.categoryIndex) === undefined
        ) {
            return;
        }

        openDraft({
            ...activeAddLocation,
            destinationKey: getLocationKey(
                activeAddLocation.categoryIndex,
                activeAddLocation.folderPath
            ),
            icon: '',
            kind: 'bookmark',
            mode: 'add',
            title: '',
            url: '',
        });
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
            const destination = destinationOptions.find(
                (option) => option.key === editorDraft.destinationKey
            )?.location;
            if (destination !== undefined) {
                didSave =
                    editorDraft.mode === 'add'
                        ? bookmarkControls.addBookmarkToLocation(destination, {
                              title,
                              url: normalizedUrl,
                          })
                        : bookmarkControls.updateBookmarkInLocation(
                              editorDraft,
                              editorDraft.bookmarkId ?? '',
                              { title, url: normalizedUrl },
                              destination
                          );
            }
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
            return;
        }

        onClose();
    };

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
            setLocation({
                categoryIndex:
                    deleteTarget.kind === 'category'
                        ? Math.min(
                              deleteTarget.categoryIndex,
                              bookmarkTree.length - 2
                          )
                        : deleteTarget.categoryIndex,
                folderPath: [],
            });
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
        if (!isAddMenuOpen) {
            return;
        }

        addMenuRef.current
            ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
            ?.focus();
    }, [isAddMenuOpen]);

    useEffect(() => {
        if (!isLocationPickerOpen) {
            return;
        }

        const selectedOption =
            locationOptionsRef.current?.querySelector<HTMLButtonElement>(
                '[aria-selected="true"]'
            );
        const firstOption =
            locationOptionsRef.current?.querySelector<HTMLButtonElement>(
                'button'
            );
        (selectedOption ?? firstOption)?.focus();
    }, [isLocationPickerOpen]);

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
        if (bookmarkTree.length === 0) {
            setActivePane('tree');
        }

        if (
            location.categoryIndex >= 0 &&
            location.categoryIndex < bookmarkTree.length
        ) {
            return;
        }

        setLocation({
            categoryIndex: bookmarkTree.length === 0 ? -1 : 0,
            folderPath: [],
        });
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

        if (
            targetData?.kind === 'node' &&
            targetData.isFolder &&
            String(source.id) !== String(target.id)
        ) {
            destination = {
                categoryIndex: targetData.location.categoryIndex,
                folderPath: [
                    ...targetData.location.folderPath,
                    String(target.id),
                ],
            };
        } else if (isSortable(source) && targetData?.kind === 'node') {
            const sortableDestination = destinationOptions.find(
                (option) => option.key === String(source.group)
            );
            destination = sortableDestination?.location ?? destination;
            destinationIndex = source.index;

            if (
                source.initialGroup === source.group &&
                source.initialIndex < source.index
            ) {
                destinationIndex++;
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
        }
    };

    const breadcrumbLabels = [currentCategory?.category ?? ''];
    let breadcrumbNodes = currentCategory?.children ?? [];
    for (const folderId of location.folderPath) {
        const folder = breadcrumbNodes.find(
            (node): node is BookmarkFolderData =>
                isBookmarkFolder(node) && node.id === folderId
        );
        if (folder === undefined) {
            break;
        }
        breadcrumbLabels.push(folder.title);
        breadcrumbNodes = folder.children;
    }

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
    const selectedDestination = destinationOptions.find(
        (option) => option.key === editorDraft?.destinationKey
    );

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

    return createPortal(
        <div
            className='bookmark-manager-backdrop'
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    requestDialogClose();
                }
            }}
        >
            <div
                ref={dialogRef}
                className='bookmark-manager-dialog bookmark-workspace'
                role='dialog'
                aria-labelledby={titleId}
                aria-modal='true'
                tabIndex={-1}
                onPointerDownCapture={(event) => {
                    const { target } = event;
                    if (
                        isAddMenuOpen &&
                        target instanceof Element &&
                        !target.closest('.bookmark-workspace-add-control')
                    ) {
                        setIsAddMenuOpen(false);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key !== 'Escape') {
                        return;
                    }

                    event.preventDefault();
                    if (isEmptyTrashConfirmOpen) {
                        setIsEmptyTrashConfirmOpen(false);
                    } else if (isTrashOpen) {
                        setIsTrashOpen(false);
                    } else if (discardTarget !== undefined) {
                        setDiscardTarget(undefined);
                    } else if (isLocationPickerOpen) {
                        setIsLocationPickerOpen(false);
                        locationPickerTriggerRef.current?.focus();
                    } else if (isIconPickerOpen) {
                        setIsIconPickerOpen(false);
                        setIconQuery('');
                        iconPickerTriggerRef.current?.focus();
                    } else if (editorDraft !== undefined) {
                        cancelEditor();
                    } else if (isAddMenuOpen) {
                        setIsAddMenuOpen(false);
                        addMenuTriggerRef.current?.focus();
                    } else {
                        requestDialogClose();
                    }
                }}
            >
                <header className='bookmark-manager-header'>
                    <div className='bookmark-workspace-title-group'>
                        <Bookmark aria-hidden='true' />
                        <h2 id={titleId}>{t.manageBookmarks}</h2>
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
                        <div className='bookmark-workspace-add-control'>
                            <button
                                ref={addMenuTriggerRef}
                                className='bookmark-workspace-primary-button'
                                type='button'
                                aria-haspopup='menu'
                                aria-expanded={isAddMenuOpen}
                                onClick={() => {
                                    setIsAddMenuOpen((isOpen) => !isOpen);
                                }}
                            >
                                <Plus aria-hidden='true' />
                                {t.addBookmark}
                            </button>
                            {isAddMenuOpen ? (
                                <div
                                    ref={addMenuRef}
                                    className='bookmark-workspace-add-menu'
                                    role='menu'
                                >
                                    <button
                                        type='button'
                                        role='menuitem'
                                        disabled={!canAddBookmark}
                                        onClick={beginAddBookmark}
                                    >
                                        <Bookmark aria-hidden='true' />
                                        {t.bookmark}
                                    </button>
                                    <button
                                        type='button'
                                        role='menuitem'
                                        disabled={!canAddFolder}
                                        onClick={beginAddFolder}
                                    >
                                        <FolderPlus aria-hidden='true' />
                                        {t.folder}
                                    </button>
                                </div>
                            ) : undefined}
                        </div>
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
                            onClick={() => importInputRef.current?.click()}
                        >
                            <Upload aria-hidden='true' />
                            <span>{t.import}</span>
                        </button>
                        <button
                            className='bookmark-workspace-header-button'
                            type='button'
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
                        <button
                            className='bookmark-workspace-icon-button'
                            type='button'
                            aria-label={t.cancel}
                            onClick={requestDialogClose}
                        >
                            <X aria-hidden='true' />
                        </button>
                    </div>
                </header>

                <DragDropProvider onDragEnd={handleDragEnd}>
                    <div className='bookmark-manager-body bookmark-workspace-grid'>
                        <aside
                            className='bookmark-workspace-tree-pane'
                            aria-label={t.folders}
                            data-active={activePane === 'tree'}
                            tabIndex={0}
                            onFocusCapture={() => {
                                setActivePane('tree');
                            }}
                            onPointerDownCapture={() => {
                                setActivePane('tree');
                            }}
                        >
                            <div className='bookmark-workspace-layer-header'>
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
                                <strong>{sidebarLayerTitle}</strong>
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
                            <nav
                                className='bookmark-workspace-tree'
                                aria-label={t.folders}
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
                                ) : sidebarLocations.length === 0 ? (
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
                                    sidebarLocations.map((sidebarLocation) => {
                                        const category = bookmarkTree.at(
                                            sidebarLocation.categoryIndex
                                        );
                                        const folder = getFolderAtPath(
                                            category?.children ?? [],
                                            sidebarLocation.folderPath
                                        );
                                        const isCategory =
                                            sidebarLocation.folderPath
                                                .length === 0;
                                        const label = isCategory
                                            ? category?.category
                                            : folder?.title;
                                        if (
                                            category === undefined ||
                                            label === undefined
                                        ) {
                                            return undefined;
                                        }

                                        const itemKey = isCategory
                                            ? category.id
                                            : (folder?.id ??
                                              getLocationKey(
                                                  sidebarLocation.categoryIndex,
                                                  sidebarLocation.folderPath
                                              ));
                                        const icon = isCategory
                                            ? decoratedTree.at(
                                                  sidebarLocation.categoryIndex
                                              )?.icon
                                            : createBookmarkIcon(
                                                  folder?.icon,
                                                  'icon'
                                              );
                                        return (
                                            <BookmarkLocationDropTarget
                                                key={itemKey}
                                                className='bookmark-workspace-tree-row'
                                                disabled={
                                                    normalizedQuery !== ''
                                                }
                                                idSuffix={`layer:${itemKey}`}
                                                location={sidebarLocation}
                                            >
                                                <button
                                                    className='bookmark-workspace-tree-item'
                                                    type='button'
                                                    aria-current={
                                                        isSameLocation(
                                                            location,
                                                            sidebarLocation
                                                        )
                                                            ? 'page'
                                                            : undefined
                                                    }
                                                    onClick={() => {
                                                        navigateToLocation(
                                                            sidebarLocation
                                                        );
                                                    }}
                                                >
                                                    {icon}
                                                    <span>{label}</span>
                                                    <ChevronRight
                                                        className='bookmark-workspace-layer-chevron'
                                                        aria-hidden='true'
                                                    />
                                                </button>
                                            </BookmarkLocationDropTarget>
                                        );
                                    })
                                )}
                            </nav>
                        </aside>

                        <main
                            className={`bookmark-workspace-list-pane ${
                                breadcrumbLabels.length > 1
                                    ? 'has-breadcrumb'
                                    : ''
                            }`}
                            aria-label={t.bookmarks}
                            data-active={activePane === 'list'}
                            tabIndex={0}
                            onFocusCapture={() => {
                                setActivePane('list');
                            }}
                            onPointerDownCapture={() => {
                                setActivePane('list');
                            }}
                        >
                            <div className='bookmark-workspace-list-header'>
                                <div className='bookmark-workspace-list-title'>
                                    <h3>
                                        {currentFolder?.title ??
                                            currentCategory?.category ??
                                            t.bookmarks}
                                    </h3>
                                    {currentCategory ===
                                    undefined ? undefined : (
                                        <button
                                            className='bookmark-workspace-icon-button'
                                            type='button'
                                            aria-label={t.folderSettings}
                                            onClick={() => {
                                                if (
                                                    currentFolder === undefined
                                                ) {
                                                    editCategory(
                                                        location.categoryIndex
                                                    );
                                                } else {
                                                    editFolder(location);
                                                }
                                            }}
                                        >
                                            <MoreHorizontal aria-hidden='true' />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {breadcrumbLabels.length > 1 ? (
                                <div className='bookmark-workspace-breadcrumb'>
                                    {breadcrumbLabels.slice(1).join(' / ')}
                                </div>
                            ) : undefined}
                            <form
                                className='bookmark-workspace-quick-add'
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    addPastedBookmarks(
                                        parsePastedBookmarkText(quickAddValue)
                                    );
                                }}
                            >
                                <ClipboardPaste aria-hidden='true' />
                                <input
                                    type='text'
                                    aria-label={t.pasteLinks}
                                    placeholder={t.pasteLinks}
                                    value={quickAddValue}
                                    disabled={currentCategory === undefined}
                                    onPointerDown={(event) => {
                                        event.currentTarget.focus();
                                    }}
                                    onChange={(event) => {
                                        setQuickAddValue(event.target.value);
                                        setQuickAddMessage('');
                                    }}
                                    onPaste={(event) => {
                                        const bookmarks =
                                            parseClipboardBookmarks(
                                                event.clipboardData
                                            );
                                        if (bookmarks.length === 0) {
                                            return;
                                        }

                                        event.preventDefault();
                                        addPastedBookmarks(bookmarks);
                                    }}
                                />
                                <span aria-live='polite'>
                                    {quickAddMessage}
                                </span>
                            </form>
                            <BookmarkLocationDropTarget
                                className='bookmark-workspace-list'
                                disabled={
                                    currentCategory === undefined ||
                                    normalizedQuery !== '' ||
                                    visibleNodes.length > 0
                                }
                                idSuffix='content'
                                location={location}
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
                                                  location.categoryIndex,
                                                  [
                                                      ...location.folderPath,
                                                      node.id,
                                                  ]
                                              )}`
                                            : `bookmark-${node.id}`;
                                        const folderLocation = {
                                            categoryIndex:
                                                location.categoryIndex,
                                            folderPath: [
                                                ...location.folderPath,
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
                                                location={location}
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
                                                                className='bookmark-workspace-list-item'
                                                                type='button'
                                                                onClick={() => {
                                                                    navigateToFolder(
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
                                                                <span className='bookmark-workspace-item-copy'>
                                                                    <strong>
                                                                        {
                                                                            node.title
                                                                        }
                                                                    </strong>
                                                                    <small>
                                                                        {itemCountLabel(
                                                                            countBookmarks(
                                                                                node.children
                                                                            )
                                                                        )}
                                                                    </small>
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            <div
                                                                ref={sourceRef}
                                                                className='bookmark-workspace-list-item'
                                                            >
                                                                <span
                                                                    className='bookmark-workspace-item-icon'
                                                                    data-kind='bookmark'
                                                                >
                                                                    <LinkIcon aria-hidden='true' />
                                                                </span>
                                                                <span className='bookmark-workspace-item-copy'>
                                                                    <strong>
                                                                        {
                                                                            node.title
                                                                        }
                                                                    </strong>
                                                                    <small>
                                                                        {getBookmarkHost(
                                                                            node.url
                                                                        )}
                                                                    </small>
                                                                </span>
                                                            </div>
                                                        )}
                                                        {isFolder ? undefined : (
                                                            <div className='bookmark-workspace-row-actions'>
                                                                <button
                                                                    className='bookmark-workspace-row-link'
                                                                    type='button'
                                                                    aria-label={
                                                                        t.bookmarkSettings
                                                                    }
                                                                    onClick={() => {
                                                                        editBookmark(
                                                                            location,
                                                                            node
                                                                        );
                                                                    }}
                                                                >
                                                                    <MoreHorizontal aria-hidden='true' />
                                                                </button>
                                                                <a
                                                                    className='bookmark-workspace-row-link'
                                                                    href={
                                                                        node.url
                                                                    }
                                                                    draggable={
                                                                        false
                                                                    }
                                                                    target='_blank'
                                                                    rel='noreferrer'
                                                                    aria-label={
                                                                        node.title
                                                                    }
                                                                >
                                                                    <ExternalLink aria-hidden='true' />
                                                                </a>
                                                            </div>
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
                    <div
                        className='bookmark-workspace-editor-backdrop'
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                cancelEditor();
                            }
                        }}
                    >
                        <div
                            className='bookmark-workspace-editor-dialog'
                            role='dialog'
                            aria-label={formTitle}
                            aria-modal='true'
                            onPointerDownCapture={(event) => {
                                const { target } = event;
                                if (!(target instanceof Element)) {
                                    return;
                                }

                                if (
                                    isLocationPickerOpen &&
                                    !target.closest(
                                        '.bookmark-workspace-location-trigger, .bookmark-workspace-location-options'
                                    )
                                ) {
                                    setIsLocationPickerOpen(false);
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
                                        <div className='bookmark-workspace-field'>
                                            <span>{t.location}</span>
                                            <button
                                                ref={locationPickerTriggerRef}
                                                className='bookmark-workspace-location-trigger'
                                                type='button'
                                                aria-haspopup='listbox'
                                                aria-expanded={
                                                    isLocationPickerOpen
                                                }
                                                onClick={() => {
                                                    setIsLocationPickerOpen(
                                                        (isOpen) => !isOpen
                                                    );
                                                }}
                                            >
                                                <span>
                                                    {selectedDestination?.label ??
                                                        t.bookmarks}
                                                </span>
                                                <ChevronDown aria-hidden='true' />
                                            </button>
                                            {isLocationPickerOpen ? (
                                                <div
                                                    ref={locationOptionsRef}
                                                    className='bookmark-workspace-location-options'
                                                    role='listbox'
                                                    aria-label={t.location}
                                                >
                                                    {destinationOptions.map(
                                                        (option) => (
                                                            <button
                                                                key={option.key}
                                                                type='button'
                                                                role='option'
                                                                aria-selected={
                                                                    editorDraft.destinationKey ===
                                                                    option.key
                                                                }
                                                                onClick={() => {
                                                                    setEditorDraft(
                                                                        {
                                                                            ...editorDraft,
                                                                            destinationKey:
                                                                                option.key,
                                                                        }
                                                                    );
                                                                    setIsLocationPickerOpen(
                                                                        false
                                                                    );
                                                                    locationPickerTriggerRef.current?.focus();
                                                                }}
                                                            >
                                                                <FolderOpen aria-hidden='true' />
                                                                <span>
                                                                    {
                                                                        option.label
                                                                    }
                                                                </span>
                                                                {editorDraft.destinationKey ===
                                                                option.key ? (
                                                                    <Check aria-hidden='true' />
                                                                ) : undefined}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            ) : undefined}
                                        </div>
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
                                    {editorDraft.mode === 'edit' ? (
                                        <button
                                            className='bookmark-workspace-danger-button'
                                            type='button'
                                            onClick={() => {
                                                deleteItem({
                                                    ...editorDraft,
                                                });
                                            }}
                                        >
                                            <Trash2 aria-hidden='true' />
                                            {editorDraft.kind === 'bookmark'
                                                ? t.deleteBookmark
                                                : t.deleteFolder}
                                        </button>
                                    ) : undefined}
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
                    </div>
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
                                                        <Bookmark aria-hidden='true' />
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
                    <div className='bookmark-workspace-confirm-backdrop'>
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
                    </div>
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
        </div>,
        globalThis.document.body
    );
};
