import type {
    BookmarkCategoryData,
    BookmarkFolderData,
    BookmarkLinkData,
    BookmarkNodeData,
    BookmarkTrashItemData,
} from '@/types/bookmarks';

const defaultCategoryName = 'Bookmarks';
const defaultFolderName = 'Folder';
const rootWrapperFolderNames = new Set(['bookmarks', 'favorites']);

export const bookmarkRootCategoryId = 'bookmark-root';

export const isBookmarkRootCategory = (
    category: BookmarkCategoryData
): boolean =>
    category.id === bookmarkRootCategoryId ||
    category.category.trim().toLowerCase() ===
        defaultCategoryName.toLowerCase();

export const getBookmarkRootNodes = (
    bookmarkTree: readonly BookmarkCategoryData[]
): BookmarkNodeData[] => {
    const rootCategory = bookmarkTree.find(isBookmarkRootCategory);
    const categories = bookmarkTree
        .filter((category) => !isBookmarkRootCategory(category))
        .map(
            (category): BookmarkFolderData => ({
                children: category.children,
                id: category.id,
                ...(category.icon === undefined ? {} : { icon: category.icon }),
                title: category.category,
                type: 'folder',
            })
        );

    return [...(rootCategory?.children ?? []), ...categories];
};

export const replaceBookmarkRootNodes = (
    bookmarkTree: readonly BookmarkCategoryData[],
    nodes: readonly BookmarkNodeData[]
): BookmarkCategoryData[] => {
    const existingRoot = bookmarkTree.find(isBookmarkRootCategory);
    const rootLinks = nodes.filter(isBookmarkLink);
    const categories = nodes.filter(isBookmarkFolder).map(
        (folder): BookmarkCategoryData => ({
            category: folder.title,
            children: folder.children,
            id: folder.id,
            ...(folder.icon === undefined ? {} : { icon: folder.icon }),
            links: getBookmarkLinks(folder.children),
        })
    );

    return [
        ...(rootLinks.length === 0
            ? []
            : [
                  {
                      category: defaultCategoryName,
                      children: rootLinks,
                      id: existingRoot?.id ?? bookmarkRootCategoryId,
                      links: rootLinks,
                  },
              ]),
        ...categories,
    ];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const normalizeText = (value: string): string =>
    value.replaceAll(/\s+/g, ' ').trim();

const createFallbackId = (prefix: string, index: number): string =>
    `${prefix}-${index}`;

const createUniqueIdGetter = (): ((id: string) => string) => {
    const usedIds = new Set<string>();

    return (id: string): string => {
        if (!usedIds.has(id)) {
            usedIds.add(id);
            return id;
        }

        let index = 2;
        let nextId = `${id}-${index}`;
        while (usedIds.has(nextId)) {
            index++;
            nextId = `${id}-${index}`;
        }

        usedIds.add(nextId);
        return nextId;
    };
};

const createNextIndexGetter = (): (() => number) => {
    let index = 0;

    return () => {
        index++;
        return index;
    };
};

export const isBookmarkFolder = (
    node: BookmarkNodeData
): node is BookmarkFolderData => node.type === 'folder';

export const isBookmarkLink = (
    node: BookmarkNodeData
): node is BookmarkLinkData => node.type === 'link';

export const getBookmarkLinks = (
    nodes: readonly BookmarkNodeData[]
): BookmarkLinkData[] =>
    nodes.flatMap((node) =>
        isBookmarkLink(node) ? [node] : getBookmarkLinks(node.children)
    );

const normalizeBookmarkLink = (
    bookmark: BookmarkLinkData,
    getUniqueId: (id: string) => string,
    bookmarkIndex: number
): BookmarkLinkData | undefined => {
    const title = normalizeText(bookmark.title);
    const url = bookmark.url.trim();

    if (title === '' || url === '') {
        return undefined;
    }

    const id =
        normalizeText(bookmark.id) ||
        createFallbackId('bookmark', bookmarkIndex);

    return {
        ...(bookmark.feed === undefined ? {} : { feed: bookmark.feed }),
        ...(bookmark.feedOrder === undefined
            ? {}
            : { feedOrder: bookmark.feedOrder }),
        id: getUniqueId(id),
        title,
        type: 'link',
        url,
    };
};

const normalizeBookmarkNodes = (
    nodes: readonly BookmarkNodeData[],
    getUniqueId: (id: string) => string,
    getNextIndex: () => number
): BookmarkNodeData[] =>
    nodes
        .map((node): BookmarkNodeData | undefined => {
            const fallbackIndex = getNextIndex();

            if (isBookmarkLink(node)) {
                return normalizeBookmarkLink(node, getUniqueId, fallbackIndex);
            }

            const title = normalizeText(node.title) || defaultFolderName;
            const icon =
                node.icon === undefined ? undefined : normalizeText(node.icon);
            const id =
                normalizeText(node.id) ||
                createFallbackId('folder', fallbackIndex);
            const children = normalizeBookmarkNodes(
                node.children,
                getUniqueId,
                getNextIndex
            );

            return {
                children,
                id: getUniqueId(id),
                ...(icon === undefined || icon === '' ? {} : { icon }),
                title,
                type: 'folder',
            };
        })
        .filter((node): node is BookmarkNodeData => node !== undefined);

const normalizeBookmarkTree = (
    bookmarkTree: readonly BookmarkCategoryData[]
): BookmarkCategoryData[] => {
    const getUniqueId = createUniqueIdGetter();
    const getNextIndex = createNextIndexGetter();

    return bookmarkTree.map((categoryData, categoryIndex) => {
        const category =
            normalizeText(categoryData.category) || defaultCategoryName;
        const icon =
            categoryData.icon === undefined
                ? undefined
                : normalizeText(categoryData.icon);
        const id =
            normalizeText(categoryData.id) ||
            createFallbackId('category', categoryIndex + 1);
        const children = normalizeBookmarkNodes(
            categoryData.children,
            getUniqueId,
            getNextIndex
        );

        return {
            category,
            children,
            id: getUniqueId(id),
            ...(icon === undefined || icon === '' ? {} : { icon }),
            links: getBookmarkLinks(children),
        };
    });
};

const coerceBookmarkLink = (value: unknown): BookmarkLinkData | undefined => {
    if (!isRecord(value)) {
        return undefined;
    }

    const title = typeof value.title === 'string' ? value.title : '';
    const url = typeof value.url === 'string' ? value.url : '';
    const id = typeof value.id === 'string' ? value.id : '';
    const feed = typeof value.feed === 'boolean' ? value.feed : undefined;
    const feedOrder =
        typeof value.feedOrder === 'number' &&
        Number.isSafeInteger(value.feedOrder) &&
        value.feedOrder >= 0
            ? value.feedOrder
            : undefined;

    return {
        ...(feed === undefined ? {} : { feed }),
        ...(feedOrder === undefined ? {} : { feedOrder }),
        id,
        title,
        type: 'link',
        url,
    };
};

const getFolderTitle = (value: Readonly<Record<string, unknown>>): string => {
    if (typeof value.title === 'string') {
        return value.title;
    }

    if (typeof value.category === 'string') {
        return value.category;
    }

    return defaultFolderName;
};

const coerceBookmarkNode = (value: unknown): BookmarkNodeData | undefined => {
    if (!isRecord(value)) {
        return undefined;
    }

    const childrenValue = value.children;
    if (Array.isArray(childrenValue)) {
        const title = getFolderTitle(value);
        const icon = typeof value.icon === 'string' ? value.icon : undefined;
        const id = typeof value.id === 'string' ? value.id : '';
        const children = childrenValue
            .map((nodeValue) => coerceBookmarkNode(nodeValue))
            .filter((node): node is BookmarkNodeData => node !== undefined);

        return {
            children,
            id,
            ...(icon === undefined ? {} : { icon }),
            title,
            type: 'folder',
        };
    }

    return coerceBookmarkLink(value);
};

const getCategoryTitle = (value: Readonly<Record<string, unknown>>): string => {
    if (typeof value.category === 'string') {
        return value.category;
    }

    if (typeof value.title === 'string') {
        return value.title;
    }

    return defaultCategoryName;
};

const coerceCategoryChildren = (
    categoryValue: Readonly<Record<string, unknown>>
): BookmarkNodeData[] | undefined => {
    const childrenValue = categoryValue.children;
    if (Array.isArray(childrenValue)) {
        return childrenValue
            .map((nodeValue) => coerceBookmarkNode(nodeValue))
            .filter((node): node is BookmarkNodeData => node !== undefined);
    }

    const linksValue = categoryValue.links;
    if (!Array.isArray(linksValue)) {
        return undefined;
    }

    return linksValue
        .map((bookmarkValue) => coerceBookmarkLink(bookmarkValue))
        .filter(
            (bookmark): bookmark is BookmarkLinkData => bookmark !== undefined
        );
};

export const coerceBookmarkTree = (
    value: unknown
): BookmarkCategoryData[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const bookmarkTree = value
        .map((categoryValue): BookmarkCategoryData | undefined => {
            if (!isRecord(categoryValue)) {
                return undefined;
            }

            const category = getCategoryTitle(categoryValue);
            const icon =
                typeof categoryValue.icon === 'string'
                    ? categoryValue.icon
                    : undefined;
            const id =
                typeof categoryValue.id === 'string' ? categoryValue.id : '';
            const children = coerceCategoryChildren(categoryValue);

            if (children === undefined) {
                return undefined;
            }

            return {
                category,
                children,
                id,
                ...(icon === undefined ? {} : { icon }),
                links: [],
            };
        })
        .filter(
            (categoryData): categoryData is BookmarkCategoryData =>
                categoryData !== undefined
        );

    const normalizedBookmarkTree = normalizeBookmarkTree(bookmarkTree);

    return normalizedBookmarkTree.length > 0
        ? normalizedBookmarkTree
        : undefined;
};

export const coerceBookmarkTrash = (
    value: unknown
): BookmarkTrashItemData[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.flatMap((itemValue): BookmarkTrashItemData[] => {
        if (
            !isRecord(itemValue) ||
            typeof itemValue.id !== 'string' ||
            typeof itemValue.deletedAt !== 'string' ||
            typeof itemValue.label !== 'string' ||
            !Array.isArray(itemValue.folderPath) ||
            !itemValue.folderPath.every((part) => typeof part === 'string') ||
            !['bookmark', 'category', 'folder'].includes(String(itemValue.kind))
        ) {
            return [];
        }

        const kind = itemValue.kind as BookmarkTrashItemData['kind'];
        const normalizedItem =
            kind === 'category'
                ? coerceBookmarkTree([itemValue.item])?.[0]
                : coerceBookmarkTree([
                      {
                          category: 'Trash',
                          children: [itemValue.item],
                          id: 'trash-wrapper',
                          links: [],
                      },
                  ])?.[0]?.children[0];

        if (normalizedItem === undefined) {
            return [];
        }
        if (kind === 'category') {
            if (!('category' in normalizedItem)) {
                return [];
            }
        } else {
            if ('category' in normalizedItem) {
                return [];
            }
            if (
                (kind === 'folder' && normalizedItem.type !== 'folder') ||
                (kind === 'bookmark' && normalizedItem.type !== 'link')
            ) {
                return [];
            }
        }

        return [
            {
                ...(typeof itemValue.categoryId === 'string'
                    ? { categoryId: itemValue.categoryId }
                    : {}),
                deletedAt: itemValue.deletedAt,
                folderPath: [...itemValue.folderPath],
                id: itemValue.id,
                item: normalizedItem,
                kind,
                label: itemValue.label,
            },
        ];
    });
};

export interface BookmarkLinkLocation {
    bookmark: BookmarkLinkData;
    categoryIndex: number;
    categoryTitle: string;
    folderPath: string[];
    folderTitles: string[];
}

const collectBookmarkLinkLocations = (
    nodes: readonly BookmarkNodeData[],
    categoryIndex: number,
    categoryTitle: string,
    folderPath: readonly string[],
    folderTitles: readonly string[]
): BookmarkLinkLocation[] => {
    const locations: BookmarkLinkLocation[] = [];

    for (const node of nodes) {
        if (isBookmarkLink(node)) {
            locations.push({
                bookmark: node,
                categoryIndex,
                categoryTitle,
                folderPath: [...folderPath],
                folderTitles: [...folderTitles],
            });
            continue;
        }

        locations.push(
            ...collectBookmarkLinkLocations(
                node.children,
                categoryIndex,
                categoryTitle,
                [...folderPath, node.id],
                [...folderTitles, node.title]
            )
        );
    }

    return locations;
};

export const getBookmarkLinkLocations = (
    bookmarkTree: readonly BookmarkCategoryData[]
): BookmarkLinkLocation[] => {
    const locations: BookmarkLinkLocation[] = [];

    for (const [categoryIndex, categoryData] of bookmarkTree.entries()) {
        locations.push(
            ...collectBookmarkLinkLocations(
                categoryData.children,
                categoryIndex,
                categoryData.category,
                [],
                []
            )
        );
    }

    return locations;
};

const isElementTag = <TagName extends keyof HTMLElementTagNameMap>(
    element: Element | null | undefined,
    tagName: TagName
): element is HTMLElementTagNameMap[TagName] =>
    element?.tagName.toLowerCase() === tagName;

const getDirectChild = <TagName extends keyof HTMLElementTagNameMap>(
    element: Element,
    tagName: TagName
): HTMLElementTagNameMap[TagName] | undefined => {
    for (const child of element.children) {
        if (isElementTag(child, tagName)) {
            return child;
        }
    }

    return undefined;
};

const getElementText = (element: Element): string =>
    normalizeText(element.textContent);

const findFolderList = (heading: Element): HTMLDListElement | undefined => {
    const parent = heading.parentElement;
    if (parent === null) {
        return undefined;
    }

    const childList = getDirectChild(parent, 'dl');
    if (childList !== undefined) {
        return childList;
    }

    let sibling = parent.nextElementSibling;
    while (sibling !== null) {
        if (isElementTag(sibling, 'dl')) {
            return sibling;
        }

        const nestedList = getDirectChild(sibling, 'dl');
        if (nestedList !== undefined) {
            return nestedList;
        }

        if (!isElementTag(sibling, 'p')) {
            return undefined;
        }

        sibling = sibling.nextElementSibling;
    }

    return undefined;
};

const isRootWrapperFolder = (
    node: BookmarkNodeData
): node is BookmarkFolderData =>
    isBookmarkFolder(node) &&
    rootWrapperFolderNames.has(node.title.toLowerCase());

export const parseBrowserBookmarks = (html: string): BookmarkCategoryData[] => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const rootList = document.querySelector('dl');
    const visitedLists = new WeakSet<HTMLDListElement>();
    let importedBookmarkIndex = 0;
    let importedFolderIndex = 0;

    const createBookmark = (anchor: HTMLAnchorElement): BookmarkLinkData => {
        const url = anchor.getAttribute('href')?.trim() ?? '';
        const title = getElementText(anchor) || url;
        importedBookmarkIndex++;

        return {
            id: `imported-link-${importedBookmarkIndex}`,
            title,
            type: 'link',
            url,
        };
    };

    const parseList = (list: HTMLDListElement): BookmarkNodeData[] => {
        if (visitedLists.has(list)) {
            return [];
        }

        visitedLists.add(list);

        const nodes: BookmarkNodeData[] = [];

        for (const child of list.children) {
            if (isElementTag(child, 'dt')) {
                const heading = getDirectChild(child, 'h3');
                if (heading !== undefined) {
                    const folderName =
                        getElementText(heading) || defaultFolderName;
                    const folderList = findFolderList(heading);
                    importedFolderIndex++;

                    nodes.push({
                        children:
                            folderList === undefined
                                ? []
                                : parseList(folderList),
                        id: `imported-folder-${importedFolderIndex}`,
                        title: folderName,
                        type: 'folder',
                    });

                    continue;
                }

                const anchor =
                    getDirectChild(child, 'a') ??
                    child.querySelector('a[href]');
                if (anchor instanceof HTMLAnchorElement) {
                    nodes.push(createBookmark(anchor));
                }

                continue;
            }

            if (child instanceof HTMLAnchorElement) {
                nodes.push(createBookmark(child));
                continue;
            }

            if (isElementTag(child, 'dl')) {
                nodes.push(...parseList(child));
            }
        }

        return nodes;
    };

    const rootNodes =
        rootList === null
            ? []
            : (() => {
                  const nodes = parseList(rootList);
                  return nodes.length === 1 && isRootWrapperFolder(nodes[0])
                      ? nodes[0].children
                      : nodes;
              })();

    const directLinks: BookmarkLinkData[] = [];
    const categories: BookmarkCategoryData[] = [];

    for (const node of rootNodes) {
        if (isBookmarkFolder(node)) {
            categories.push({
                category: node.title,
                children: node.children,
                id: node.id,
                links: [],
            });
            continue;
        }

        directLinks.push(node);
    }

    if (directLinks.length > 0) {
        categories.unshift({
            category: defaultCategoryName,
            children: directLinks,
            id: 'imported-root-category',
            links: [],
        });
    }

    if (categories.length === 0) {
        const links = [
            ...document.querySelectorAll<HTMLAnchorElement>('a[href]'),
        ].map((anchor) => createBookmark(anchor));

        if (links.length > 0) {
            categories.push({
                category: defaultCategoryName,
                children: links,
                id: 'imported-root-category',
                links: [],
            });
        }
    }

    return normalizeBookmarkTree(categories);
};

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const serializeBookmarkNodes = (
    nodes: readonly BookmarkNodeData[],
    timestamp: string,
    depth: number
): string[] => {
    const indent = '    '.repeat(depth);
    const lines: string[] = [];

    for (const node of nodes) {
        if (isBookmarkLink(node)) {
            lines.push(
                `${indent}<DT><A HREF="${escapeHtml(
                    node.url
                )}" ADD_DATE="${timestamp}">${escapeHtml(node.title)}</A>`
            );
            continue;
        }

        lines.push(
            `${indent}<DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(
                node.title
            )}</H3>`,
            `${indent}<DL><p>`,
            ...serializeBookmarkNodes(node.children, timestamp, depth + 1),
            `${indent}</DL><p>`
        );
    }

    return lines;
};

export const serializeBrowserBookmarks = (
    bookmarkTree: readonly BookmarkCategoryData[],
    date = new Date()
): string => {
    const timestamp = Math.floor(date.getTime() / 1000).toString();
    const normalizedBookmarkTree = normalizeBookmarkTree(bookmarkTree);
    const lines = [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>Bookmarks</TITLE>',
        '<H1>Bookmarks</H1>',
        '<DL><p>',
    ];

    for (const categoryData of normalizedBookmarkTree) {
        lines.push(
            `    <DT><H3 ADD_DATE="${timestamp}" LAST_MODIFIED="${timestamp}">${escapeHtml(
                categoryData.category
            )}</H3>`,
            '    <DL><p>',
            ...serializeBookmarkNodes(categoryData.children, timestamp, 2),
            '    </DL><p>'
        );
    }

    lines.push('</DL><p>');

    return `${lines.join('\n')}\n`;
};
