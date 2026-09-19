import type { BookmarkCategoryData } from '@/types/bookmarks';
import { getBookmarkLinkLocations } from '@/utils/bookmarks';

export interface LinkItem {
    category: number;
    categoryTitle: string;
    folderPath: string[];
    folderTitles: string[];
    id: string;
    pathLabel: string;
    title: string;
    url: string;
}

export interface SearchSuggestionsPosition {
    left: number;
    top: number;
    width: number;
}

export interface FeedsLink {
    link: string;
    url: string;
}

export interface SlashCommandItem {
    command: 'feeds';
    label: string;
}

const maxSearchResults = 4;
const bopomofoToLatinKeyMap: Partial<Record<string, string>> = {
    ㄆ: 'q',
    ㄇ: 'a',
    ㄈ: 'z',
    ㄊ: 'w',
    ㄋ: 's',
    ㄌ: 'x',
    ㄍ: 'e',
    ㄎ: 'd',
    ㄏ: 'c',
    ㄐ: 'r',
    ㄑ: 'f',
    ㄒ: 'v',
    ㄔ: 't',
    ㄕ: 'g',
    ㄖ: 'b',
    ㄗ: 'y',
    ㄘ: 'h',
    ㄙ: 'n',
    ㄧ: 'u',
    ㄨ: 'j',
    ㄩ: 'm',
    ㄛ: 'i',
    ㄜ: 'k',
    ㄟ: 'o',
    ㄠ: 'l',
    ㄣ: 'p',
};

const slashCommands = [
    {
        command: 'feeds',
        label: '/feeds',
    },
] as const satisfies readonly SlashCommandItem[];

const pathSeparator = ' / ';

export const getSearchItems = (
    bookmarkTree: readonly BookmarkCategoryData[]
): LinkItem[] =>
    getBookmarkLinkLocations(bookmarkTree).map((location) => {
        const pathLabel = [
            location.categoryTitle,
            ...location.folderTitles,
        ].join(pathSeparator);

        return {
            category: location.categoryIndex + 1,
            categoryTitle: location.categoryTitle,
            folderPath: location.folderPath,
            folderTitles: location.folderTitles,
            id: location.bookmark.id,
            pathLabel,
            title: location.bookmark.title,
            url: location.bookmark.url,
        };
    });

export const isSlashCommandSearch = (value: string): boolean =>
    value.trim().startsWith('/');

export const getSlashCommandResults = (value: string): SlashCommandItem[] => {
    const query = value.trim().toLowerCase();
    if (!isSlashCommandSearch(query)) {
        return [];
    }

    return slashCommands.filter((command) =>
        command.label.toLowerCase().startsWith(query)
    );
};

const getLatinKeySequenceAlias = (query: string): string | undefined => {
    let alias = '';
    let hasBopomofo = false;

    for (const char of query) {
        const latinKey = bopomofoToLatinKeyMap[char];
        if (latinKey === undefined) {
            alias += char;
            continue;
        }

        hasBopomofo = true;
        alias += latinKey;
    }

    return hasBopomofo ? alias : undefined;
};

const getTextSearchScore = (
    source: string,
    query: string
): number | undefined => {
    const includesIndex = source.indexOf(query);

    if (source === query) {
        return 0;
    }

    if (source.startsWith(query)) {
        return 1 + source.length / 100;
    }

    const wordStartIndex = source
        .split(/\s+/)
        .findIndex((word) => word.startsWith(query));

    if (wordStartIndex !== -1) {
        return 2 + wordStartIndex / 100;
    }

    if (includesIndex !== -1) {
        return 3 + includesIndex / 100;
    }

    let queryIndex = 0;
    for (const char of source) {
        if (char === query[queryIndex]) {
            queryIndex++;
        }
    }

    if (queryIndex === query.length) {
        return 4 + source.length / 100;
    }

    return undefined;
};

const getBestTextSearchScore = (
    source: string,
    queries: readonly string[]
): number | undefined => {
    let bestScore: number | undefined;

    for (const query of queries) {
        if (query === '') {
            continue;
        }

        const score = getTextSearchScore(source, query);
        if (score === undefined) {
            continue;
        }

        bestScore =
            bestScore === undefined ? score : Math.min(bestScore, score);
    }

    return bestScore;
};

const getSearchScore = (
    source: string,
    query: string,
    keySequence: string
): number | undefined => {
    const normalizedSource = source.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    const normalizedKeySequence = keySequence.toLowerCase();

    return getBestTextSearchScore(normalizedSource, [
        normalizedQuery,
        normalizedKeySequence ||
            (getLatinKeySequenceAlias(normalizedQuery) ?? ''),
    ]);
};

const getLinkItemSearchScore = (
    item: LinkItem,
    query: string,
    keySequence: string
): number | undefined => {
    const titleScore = getSearchScore(item.title, query, keySequence);
    const pathScore = getSearchScore(item.pathLabel, query, keySequence);

    if (titleScore === undefined) {
        return pathScore === undefined ? undefined : pathScore + 2;
    }

    return pathScore === undefined
        ? titleScore
        : Math.min(titleScore, pathScore + 2);
};

export const getSearchResults = (
    items: readonly LinkItem[],
    query: string,
    keySequence = '',
    maxResults = maxSearchResults
): LinkItem[] => {
    const trimmedQuery = query.trim();
    if (trimmedQuery === '') {
        return [];
    }

    return items
        .map((item) => ({
            item,
            score: getLinkItemSearchScore(
                item,
                trimmedQuery,
                keySequence.trim()
            ),
        }))
        .filter(
            (result): result is { item: LinkItem; score: number } =>
                result.score !== undefined
        )
        .toSorted(
            (a, b) =>
                a.score - b.score || a.item.title.localeCompare(b.item.title)
        )
        .slice(0, maxResults)
        .map(({ item }) => item);
};

export const getGoogleSearchUrl = (value: string): string =>
    `https://www.google.com/search?q=${encodeURIComponent(value.trim())}`;

export const isSameSearchSuggestionsPosition = (
    a: SearchSuggestionsPosition | undefined,
    b: SearchSuggestionsPosition
): boolean =>
    a !== undefined &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5;
