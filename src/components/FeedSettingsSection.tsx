import { useMemo, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { GripVertical, Link as LinkIcon, Plus, Search, X } from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type { BookmarkLinkData } from '@/types/bookmarks';
import { getFeedBookmarks, setFeedBookmarkIds } from '@/utils/feeds';
import { getSearchItems, getSearchResults } from '@/utils/search';

interface FeedBookmarkRowProps {
    bookmark: BookmarkLinkData;
    disabled: boolean;
    index: number;
    onRemove: () => void;
}

const getBookmarkHost = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

const FeedBookmarkRow: React.FC<FeedBookmarkRowProps> = ({
    bookmark,
    disabled,
    index,
    onRemove,
}) => {
    const { t } = useLocale();
    const sortable = useSortable({
        accept: 'settings-feed-bookmark',
        disabled,
        group: 'settings-feeds',
        id: bookmark.id,
        index,
        type: 'settings-feed-bookmark',
    });

    return (
        <div
            ref={sortable.ref}
            className='settings-feed-bookmark'
            data-dragging={sortable.isDragSource ? 'true' : undefined}
        >
            <button
                ref={sortable.handleRef}
                className='settings-feed-drag-handle'
                type='button'
                aria-label={t.dragBookmark}
                disabled={disabled}
            >
                <GripVertical aria-hidden='true' />
            </button>
            <span className='settings-feed-bookmark-icon'>
                <LinkIcon aria-hidden='true' />
            </span>
            <span className='settings-feed-bookmark-copy'>
                <strong>{bookmark.title}</strong>
                <small>{getBookmarkHost(bookmark.url)}</small>
            </span>
            <button
                className='settings-icon-button settings-feed-remove'
                type='button'
                aria-label={`${t.removeFromFeeds}: ${bookmark.title}`}
                disabled={disabled}
                onClick={onRemove}
            >
                <X aria-hidden='true' />
            </button>
        </div>
    );
};

interface FeedSettingsSectionProps {
    bookmarkControls: BookmarkControls;
}

export const FeedSettingsSection: React.FC<FeedSettingsSectionProps> = ({
    bookmarkControls,
}) => {
    const { t } = useLocale();
    const [query, setQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const feedBookmarks = useMemo(
        () => getFeedBookmarks(bookmarkControls.bookmarkTree),
        [bookmarkControls.bookmarkTree]
    );
    const feedBookmarkIds = useMemo(
        () => new Set(feedBookmarks.map((bookmark) => bookmark.id)),
        [feedBookmarks]
    );
    const searchItems = useMemo(
        () => getSearchItems(bookmarkControls.bookmarkTree),
        [bookmarkControls.bookmarkTree]
    );
    const searchResults = useMemo(() => {
        const trimmedQuery = query.trim();
        return trimmedQuery === ''
            ? []
            : getSearchResults(
                  searchItems.filter((item) => !feedBookmarkIds.has(item.id)),
                  trimmedQuery,
                  '',
                  searchItems.length
              );
    }, [feedBookmarkIds, query, searchItems]);

    const saveFeedBookmarkIds = (bookmarkIds: readonly string[]) =>
        bookmarkControls.replaceBookmarkTree(
            setFeedBookmarkIds(bookmarkControls.bookmarkTree, bookmarkIds)
        );

    const handleDragEnd = (event: DragEndEvent) => {
        const { source } = event.operation;
        if (event.canceled || source === null || !isSortable(source)) {
            return;
        }

        const sourceIndex = source.initialIndex;
        const destinationIndex = source.index;
        if (sourceIndex === destinationIndex) {
            return;
        }

        const bookmarkIds = feedBookmarks.map((bookmark) => bookmark.id);
        const [bookmarkId] = bookmarkIds.splice(sourceIndex, 1);
        bookmarkIds.splice(destinationIndex, 0, bookmarkId);
        saveFeedBookmarkIds(bookmarkIds);
    };

    const searchResultsContent = (() => {
        if (query.trim() === '') {
            return (
                <div className='settings-feed-search-empty'>
                    <Search aria-hidden='true' />
                    <span>{t.feedSearchPrompt}</span>
                </div>
            );
        }

        if (searchResults.length === 0) {
            return (
                <div className='settings-feed-search-empty'>
                    <Search aria-hidden='true' />
                    <span>{t.bookmarkSearchEmpty}</span>
                </div>
            );
        }

        return searchResults.map((result) => (
            <button
                key={result.id}
                type='button'
                onClick={() => {
                    saveFeedBookmarkIds([
                        ...feedBookmarks.map((bookmark) => bookmark.id),
                        result.id,
                    ]);
                    setQuery('');
                    searchInputRef.current?.focus();
                }}
            >
                <span>
                    <strong>{result.title}</strong>
                    <small>{result.pathLabel}</small>
                </span>
                <Plus aria-hidden='true' />
            </button>
        ));
    })();

    return (
        <section className='settings-page-section'>
            <div className='settings-section-heading'>
                <h2>{t.feeds}</h2>
                <p>{t.feedsDescription}</p>
            </div>
            <div className='settings-card settings-feed-card'>
                <div className='settings-feed-selected'>
                    <div className='settings-feed-subheading'>
                        <span>{t.feedBookmarks}</span>
                        <small>{feedBookmarks.length}</small>
                    </div>
                    {feedBookmarks.length === 0 ? (
                        <div className='settings-feed-empty'>
                            <LinkIcon aria-hidden='true' />
                            <span>
                                <strong>{t.feedEmpty}</strong>
                                <small>{t.feedEmptyDescription}</small>
                            </span>
                        </div>
                    ) : (
                        <DragDropProvider onDragEnd={handleDragEnd}>
                            <div className='settings-feed-list'>
                                {feedBookmarks.map((bookmark, index) => (
                                    <FeedBookmarkRow
                                        key={bookmark.id}
                                        bookmark={bookmark}
                                        disabled={!bookmarkControls.canEdit}
                                        index={index}
                                        onRemove={() => {
                                            saveFeedBookmarkIds(
                                                feedBookmarks.flatMap((item) =>
                                                    item.id === bookmark.id
                                                        ? []
                                                        : [item.id]
                                                )
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                        </DragDropProvider>
                    )}
                </div>

                <div className='settings-feed-search-area'>
                    <label
                        className='settings-feed-subheading'
                        htmlFor='feed-bookmark-search'
                    >
                        {t.addFeedBookmark}
                    </label>
                    <div className='settings-feed-search'>
                        <Search aria-hidden='true' />
                        <input
                            ref={searchInputRef}
                            id='feed-bookmark-search'
                            type='search'
                            autoComplete='off'
                            placeholder={t.bookmarkSearch}
                            value={query}
                            disabled={!bookmarkControls.canEdit}
                            onChange={(event) => {
                                setQuery(event.target.value);
                            }}
                        />
                    </div>
                    <div className='settings-feed-results' aria-live='polite'>
                        {searchResultsContent}
                    </div>
                </div>
            </div>
        </section>
    );
};
