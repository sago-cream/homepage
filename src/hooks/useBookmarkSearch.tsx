import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type React from 'react';

import type { BookmarkCategoryData } from '@/types/bookmarks';
import { getFeedBookmarks } from '@/utils/feeds';
import type {
    FeedsLink,
    LinkItem,
    SearchSuggestionsPosition,
    SlashCommandItem,
} from '@/utils/search';
import {
    getGoogleSearchUrl,
    getSearchItems,
    getSearchResults,
    getSlashCommandResults,
    isSameSearchSuggestionsPosition,
    isSlashCommandSearch,
} from '@/utils/search';

const defaultMotionTrackingMs = 2000;
const feedWindowOffsetHours = 8;
const feedWindowStartHour = 16;
const supercellStoreOpenedWindowKey = 'homepage.supercellStoreOpenedWindow';

const getSearchKeySequenceInput = (
    e: React.KeyboardEvent<HTMLInputElement>
): string | undefined => {
    if (e.metaKey || e.ctrlKey || e.altKey) {
        return undefined;
    }

    const keyCodeMatch = /^Key(?<key>[A-Z])$/.exec(e.code);
    if (keyCodeMatch?.groups?.key) {
        return keyCodeMatch.groups.key.toLowerCase();
    }

    return undefined;
};

const getFeedsWindowKey = (date = new Date()): string => {
    const shiftedTimestamp =
        date.getTime() +
        (feedWindowOffsetHours - feedWindowStartHour) * 60 * 60 * 1000;
    const shiftedDate = new Date(shiftedTimestamp);

    return shiftedDate.toISOString().slice(0, 10);
};

const shouldOpenFeedLink = (link: string, windowKey: string): boolean => {
    if (link !== 'Supercell Store') {
        return true;
    }

    try {
        return (
            globalThis.localStorage.getItem(supercellStoreOpenedWindowKey) !==
            windowKey
        );
    } catch {
        return true;
    }
};

const recordOpenedFeedLink = (link: string, windowKey: string): void => {
    if (link !== 'Supercell Store') {
        return;
    }

    try {
        globalThis.localStorage.setItem(
            supercellStoreOpenedWindowKey,
            windowKey
        );
    } catch {
        // Ignore private-mode or storage permission failures.
    }
};

const getMaxCssTime = (value: string): number =>
    Math.max(
        ...value.split(',').map((part) => {
            const time = part.trim();
            if (time.endsWith('ms')) {
                return Number.parseFloat(time);
            }
            if (time.endsWith('s')) {
                return Number.parseFloat(time) * 1000;
            }
            return 0;
        }),
        0
    );

const getElementMotionDuration = (element: HTMLElement): number => {
    const style = globalThis.getComputedStyle(element);

    return Math.max(
        getMaxCssTime(style.animationDelay) +
            getMaxCssTime(style.animationDuration),
        getMaxCssTime(style.transitionDelay) +
            getMaxCssTime(style.transitionDuration)
    );
};

export const useBookmarkSearch = (
    bookmarkTree: readonly BookmarkCategoryData[],
    bookmarksLoading = false
): {
    blockedFeedsLinks: FeedsLink[];
    clearSearch: () => void;
    clearBlockedFeedsLinks: () => void;
    executeSlashCommand: (command: SlashCommandItem) => void;
    focusSearchInput: () => void;
    googleSearchResultIndex: number;
    handleSearchBlur: () => void;
    handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleSearchFocus: () => void;
    handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    handleSubmit: (e: React.FormEvent) => void;
    hasGoogleSearchResult: boolean;
    hasSearchSuggestions: boolean;
    highlightGoogleSearch: () => void;
    highlightSearchResult: (resultIndex: number) => void;
    highlightedSearchResultIndex: number | undefined;
    inputFocused: boolean;
    inputRef: React.RefObject<HTMLInputElement | null>;
    navigateToSearchResult: (result?: LinkItem) => void;
    searchFormRef: React.RefObject<HTMLFormElement | null>;
    searchGoogleCurrentValue: () => void;
    searchInputValue: string;
    searchResultIndexOffset: number;
    searchRef: React.RefObject<HTMLDivElement | null>;
    searchResults: LinkItem[];
    searchSuggestionsId: string;
    searchSuggestionsPosition: SearchSuggestionsPosition | undefined;
    slashCommandResults: SlashCommandItem[];
    searchGoogle: (value: string) => void;
    selectedSearchResult: LinkItem | undefined;
    trimmedSearchValue: string;
} => {
    const inputRef = useRef<HTMLInputElement>(null);
    const searchFormRef = useRef<HTMLFormElement>(null);
    const searchRef = useRef<HTMLDivElement>(null);
    const searchSuggestionsId = useId();
    const [inputFocused, setInputFocused] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [searchKeySequence, setSearchKeySequence] = useState('');
    const [blockedFeedsLinks, setBlockedFeedsLinks] = useState<FeedsLink[]>([]);
    const [requestedSearchResultIndex, setRequestedSearchResultIndex] =
        useState<number | undefined>(undefined);
    const [searchSuggestionsPosition, setSearchSuggestionsPosition] = useState<
        SearchSuggestionsPosition | undefined
    >(undefined);
    const searchSuggestionsPositionRef = useRef<
        SearchSuggestionsPosition | undefined
    >(undefined);
    const pendingSearchRef = useRef<
        { keySequence: string; value: string } | undefined
    >(undefined);
    const flattenedSearchItems = useMemo<LinkItem[]>(
        () => getSearchItems(bookmarkTree),
        [bookmarkTree]
    );

    const trimmedSearchValue = searchValue.trim();
    const hasSearchQuery = trimmedSearchValue !== '';
    const isSlashCommandQuery = isSlashCommandSearch(trimmedSearchValue);
    const slashCommandResults = bookmarksLoading
        ? []
        : getSlashCommandResults(searchValue);
    const searchResults = useMemo(
        () =>
            hasSearchQuery && !isSlashCommandQuery
                ? getSearchResults(
                      flattenedSearchItems,
                      trimmedSearchValue,
                      searchKeySequence.trim()
                  )
                : [],
        [
            flattenedSearchItems,
            hasSearchQuery,
            isSlashCommandQuery,
            searchKeySequence,
            trimmedSearchValue,
        ]
    );
    const hasGoogleSearchResult =
        hasSearchQuery && !isSlashCommandQuery && !bookmarksLoading;
    const hasSearchSuggestions =
        hasGoogleSearchResult || slashCommandResults.length > 0;
    const searchResultIndexOffset = slashCommandResults.length;
    const defaultSearchResultIndex =
        slashCommandResults.length > 0 || searchResults.length > 0
            ? 0
            : undefined;
    const highlightedSearchResultIndex =
        requestedSearchResultIndex ?? defaultSearchResultIndex;
    const googleSearchResultIndex =
        searchResultIndexOffset + searchResults.length;
    const searchNavigationItemCount = hasSearchSuggestions
        ? searchResultIndexOffset +
          searchResults.length +
          (hasGoogleSearchResult ? 1 : 0)
        : 0;
    const selectedSearchResult =
        highlightedSearchResultIndex === undefined ||
        highlightedSearchResultIndex < searchResultIndexOffset ||
        highlightedSearchResultIndex >= googleSearchResultIndex
            ? undefined
            : searchResults[
                  highlightedSearchResultIndex - searchResultIndexOffset
              ];
    const searchInputValue = searchValue;

    const executeFeedsCommand = useCallback(() => {
        const nextBlockedLinks: FeedsLink[] = [];
        const windowKey = getFeedsWindowKey();

        for (const bookmark of getFeedBookmarks(bookmarkTree)) {
            const link = bookmark.title;
            if (!shouldOpenFeedLink(link, windowKey)) {
                continue;
            }

            const openedTab = globalThis.open(bookmark.url, '_blank');
            if (openedTab) {
                openedTab.opener = undefined;
                recordOpenedFeedLink(link, windowKey);
                continue;
            }

            nextBlockedLinks.push({
                link,
                url: bookmark.url,
            });
        }

        if (nextBlockedLinks.length === 0) {
            globalThis.requestAnimationFrame(() => {
                Reflect.apply(globalThis.close, globalThis, []);
            });
        }

        setBlockedFeedsLinks(nextBlockedLinks);
    }, [bookmarkTree]);

    const executeSlashCommand = useCallback(
        (_command: SlashCommandItem) => {
            executeFeedsCommand();
        },
        [executeFeedsCommand]
    );

    const updateSearchSuggestionsPosition = useCallback(() => {
        const rect =
            searchFormRef.current?.getBoundingClientRect() ??
            searchRef.current?.getBoundingClientRect();
        if (!rect) {
            searchSuggestionsPositionRef.current = undefined;
            setSearchSuggestionsPosition(undefined);
            return;
        }

        const nextPosition = {
            left: rect.left,
            top: rect.bottom,
            width: rect.width,
        };

        if (
            isSameSearchSuggestionsPosition(
                searchSuggestionsPositionRef.current,
                nextPosition
            )
        ) {
            return;
        }

        searchSuggestionsPositionRef.current = nextPosition;
        setSearchSuggestionsPosition(nextPosition);
    }, []);

    useLayoutEffect(() => {
        if (!hasSearchSuggestions) {
            searchSuggestionsPositionRef.current = undefined;
            setSearchSuggestionsPosition(undefined);
            return undefined;
        }

        updateSearchSuggestionsPosition();

        const motionElements = [
            searchRef.current,
            searchFormRef.current,
        ].filter(
            (element): element is HTMLDivElement | HTMLFormElement =>
                element !== null
        );
        let animationFrame: number | undefined;
        let motionTrackingEndsAt = 0;

        const trackMotion = () => {
            updateSearchSuggestionsPosition();

            if (performance.now() >= motionTrackingEndsAt) {
                animationFrame = undefined;
                return;
            }

            animationFrame = globalThis.requestAnimationFrame(trackMotion);
        };

        const startMotionTracking = () => {
            const motionDuration =
                Math.max(...motionElements.map(getElementMotionDuration), 0) ||
                defaultMotionTrackingMs;

            motionTrackingEndsAt = Math.max(
                motionTrackingEndsAt,
                performance.now() + motionDuration
            );

            animationFrame ??= globalThis.requestAnimationFrame(trackMotion);
        };

        const resizeObserver = new ResizeObserver(
            updateSearchSuggestionsPosition
        );
        if (searchFormRef.current) {
            resizeObserver.observe(searchFormRef.current);
        }
        for (const element of motionElements) {
            element.addEventListener('animationstart', startMotionTracking);
            element.addEventListener('transitionstart', startMotionTracking);
        }
        globalThis.addEventListener('resize', updateSearchSuggestionsPosition);
        globalThis.addEventListener('scroll', updateSearchSuggestionsPosition, {
            passive: true,
        });
        startMotionTracking();

        return () => {
            if (animationFrame !== undefined) {
                globalThis.cancelAnimationFrame(animationFrame);
            }
            resizeObserver.disconnect();
            for (const element of motionElements) {
                element.removeEventListener(
                    'animationstart',
                    startMotionTracking
                );
                element.removeEventListener(
                    'transitionstart',
                    startMotionTracking
                );
            }
            globalThis.removeEventListener(
                'resize',
                updateSearchSuggestionsPosition
            );
            globalThis.removeEventListener(
                'scroll',
                updateSearchSuggestionsPosition
            );
        };
    }, [hasSearchSuggestions, updateSearchSuggestionsPosition]);

    const navigateToSearchResult = useCallback((result?: LinkItem) => {
        if (result) {
            globalThis.location.href = result.url;
        }
    }, []);

    const searchGoogle = useCallback((value: string) => {
        if (value.trim() !== '') {
            globalThis.location.href = getGoogleSearchUrl(value);
        }
    }, []);

    const executeSearchValue = useCallback(
        (value: string, keySequence: string) => {
            const slashCommand = getSlashCommandResults(value).at(0);

            if (isSlashCommandSearch(value)) {
                if (slashCommand !== undefined) {
                    executeSlashCommand(slashCommand);
                }
                return;
            }

            const results = getSearchResults(
                flattenedSearchItems,
                value,
                keySequence
            );
            const result = results.at(requestedSearchResultIndex ?? 0);

            if (result !== undefined) {
                navigateToSearchResult(result);
                return;
            }

            searchGoogle(value);
        },
        [
            executeSlashCommand,
            flattenedSearchItems,
            navigateToSearchResult,
            requestedSearchResultIndex,
            searchGoogle,
        ]
    );

    const searchGoogleCurrentValue = useCallback(() => {
        searchGoogle(searchValue);
    }, [searchGoogle, searchValue]);

    useEffect(() => {
        if (bookmarksLoading || pendingSearchRef.current === undefined) {
            return;
        }

        const pendingSearch = pendingSearchRef.current;
        pendingSearchRef.current = undefined;
        executeSearchValue(pendingSearch.value, pendingSearch.keySequence);
    }, [bookmarksLoading, executeSearchValue]);

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            const sequenceInput = getSearchKeySequenceInput(e);
            if (sequenceInput !== undefined) {
                setSearchKeySequence((value) => value + sequenceInput);
                return;
            }

            if (e.nativeEvent.isComposing) {
                return;
            }

            if (e.key === 'ArrowDown' && searchNavigationItemCount > 0) {
                e.preventDefault();
                setRequestedSearchResultIndex((index) => {
                    const currentIndex =
                        index ?? highlightedSearchResultIndex ?? -1;
                    const nextIndex =
                        (currentIndex + 1) % searchNavigationItemCount;
                    return nextIndex;
                });
                return;
            }

            if (e.key === 'ArrowUp' && searchNavigationItemCount > 0) {
                e.preventDefault();
                setRequestedSearchResultIndex((index) => {
                    const currentIndex =
                        index ?? highlightedSearchResultIndex ?? 0;
                    const nextIndex =
                        highlightedSearchResultIndex === undefined
                            ? searchNavigationItemCount - 1
                            : (currentIndex - 1 + searchNavigationItemCount) %
                              searchNavigationItemCount;
                    return nextIndex;
                });
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                pendingSearchRef.current = undefined;
                setSearchValue('');
                setSearchKeySequence('');
                setRequestedSearchResultIndex(undefined);
                inputRef.current?.blur();
                return;
            }

            if (e.key === 'Backspace') {
                setSearchKeySequence((value) => value.slice(0, -1));
                return;
            }

            if (e.key === 'Delete') {
                setSearchKeySequence('');
                return;
            }

            if (e.key !== 'Enter') {
                return;
            }

            const currentSearchValue = e.currentTarget.value;

            if (bookmarksLoading) {
                e.preventDefault();
                pendingSearchRef.current = {
                    keySequence: searchKeySequence,
                    value: currentSearchValue,
                };
                return;
            }

            e.preventDefault();
            executeSearchValue(currentSearchValue, searchKeySequence);
        },
        [
            bookmarksLoading,
            highlightedSearchResultIndex,
            executeSearchValue,
            searchNavigationItemCount,
            searchKeySequence,
        ]
    );

    const focusSearchInput = useCallback(() => {
        inputRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const { target } = e;
            const isEditableTarget =
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

            if (inputFocused || isEditableTarget) {
                return;
            }

            if (e.key === ' ') {
                e.preventDefault();
                setInputFocused(true);
                focusSearchInput();
                return;
            }

            if (e.key === '/') {
                e.preventDefault();
                setSearchValue('/');
                setSearchKeySequence('/');
                setBlockedFeedsLinks([]);
                setInputFocused(true);
                focusSearchInput();
            }
        };

        globalThis.addEventListener('keydown', handleKeyDown);
        return () => {
            globalThis.removeEventListener('keydown', handleKeyDown);
        };
    }, [focusSearchInput, inputFocused]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            const currentSearchValue = inputRef.current?.value ?? searchValue;

            if (bookmarksLoading) {
                pendingSearchRef.current = {
                    keySequence: searchKeySequence,
                    value: currentSearchValue,
                };
                return;
            }

            executeSearchValue(currentSearchValue, searchKeySequence);
        },
        [bookmarksLoading, executeSearchValue, searchKeySequence, searchValue]
    );

    const clearSearch = useCallback(() => {
        inputRef.current?.blur();
    }, []);

    const handleSearchBlur = useCallback(() => {
        pendingSearchRef.current = undefined;
        setInputFocused(false);
        setSearchValue('');
        setSearchKeySequence('');
        setRequestedSearchResultIndex(undefined);
    }, []);

    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            pendingSearchRef.current = undefined;
            setSearchValue(e.target.value);
            if (e.target.value === '') {
                setSearchKeySequence('');
            }
            setRequestedSearchResultIndex(undefined);
            setBlockedFeedsLinks([]);
        },
        []
    );

    const clearBlockedFeedsLinks = useCallback(() => {
        setBlockedFeedsLinks([]);
    }, []);

    const handleSearchFocus = useCallback(() => {
        setInputFocused(true);
    }, []);

    const highlightSearchResult = useCallback((resultIndex: number) => {
        setRequestedSearchResultIndex(resultIndex);
    }, []);

    const highlightGoogleSearch = useCallback(() => {
        setRequestedSearchResultIndex(googleSearchResultIndex);
    }, [googleSearchResultIndex]);

    return {
        blockedFeedsLinks,
        clearSearch,
        clearBlockedFeedsLinks,
        executeSlashCommand,
        focusSearchInput,
        googleSearchResultIndex,
        handleSearchBlur,
        handleSearchChange,
        handleSearchFocus,
        handleSearchKeyDown,
        handleSubmit,
        hasGoogleSearchResult,
        hasSearchSuggestions,
        highlightGoogleSearch,
        highlightSearchResult,
        highlightedSearchResultIndex,
        inputFocused,
        inputRef,
        navigateToSearchResult,
        searchFormRef,
        searchGoogle,
        searchGoogleCurrentValue,
        searchInputValue,
        searchResultIndexOffset,
        searchRef,
        searchResults,
        searchSuggestionsId,
        searchSuggestionsPosition,
        slashCommandResults,
        selectedSearchResult,
        trimmedSearchValue,
    };
};
