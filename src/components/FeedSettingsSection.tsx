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
import { BookmarkActions, BookmarkCard } from './BookmarkCard';

interface FeedBookmarkRowProps {
    bookmark: BookmarkLinkData;
    disabled: boolean;
    index: number;
    onRemove: () => void;
    onOpen: () => void;
}

const FeedBookmarkRow: React.FC<FeedBookmarkRowProps> = ({
    bookmark,
    disabled,
    index,
    onRemove,
    onOpen,
}) => {
    const { locale, t } = useLocale();
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
            className='bookmark-workspace-list-row settings-feed-bookmark'
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
            <BookmarkCard bookmark={bookmark} onClick={onOpen} />
            <BookmarkActions
                bookmark={bookmark}
                onEdit={onOpen}
                onDelete={disabled ? undefined : onRemove}
                labels={{
                    edit: t.openInBookmarkManager,
                    open: locale === 'zh-TW' ? '開啟' : 'Open',
                    delete: t.removeFromFeeds,
                }}
            />
        </div>
    );
};

interface FeedSettingsSectionProps {
    bookmarkControls: BookmarkControls;
    onOpenBookmark: (bookmarkId: string) => void;
}

export const FeedSettingsSection: React.FC<FeedSettingsSectionProps> = ({
    bookmarkControls,
    onOpenBookmark,
}) => {
    const { t } = useLocale();
    const dialogRef = useRef<HTMLDialogElement>(null);
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
            <div className='settings-feed-heading'>
                <div className='settings-section-heading'>
                    <h2>{t.feeds}</h2>
                    <p>{t.feedsDescription}</p>
                </div>
                <button
                    className='bookmark-workspace-primary-button'
                    type='button'
                    disabled={!bookmarkControls.canEdit}
                    onClick={() => {
                        dialogRef.current?.showModal();
                        searchInputRef.current?.focus();
                    }}
                >
                    <Plus aria-hidden='true' />
                    {t.addFeedBookmark}
                </button>
            </div>
            <dialog
                ref={dialogRef}
                className='settings-feed-dialog'
                aria-labelledby='feed-dialog-title'
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        dialogRef.current?.close();
                    }
                }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                }}
            >
                <div className='settings-feed-search-area'>
                    <div className='settings-feed-subheading'>
                        <h3 id='feed-dialog-title'>{t.addFeedBookmark}</h3>
                        <button
                            type='button'
                            className='settings-icon-button'
                            aria-label={t.cancel}
                            onClick={() => dialogRef.current?.close()}
                        >
                            <X aria-hidden='true' />
                        </button>
                    </div>
                    <div className='settings-feed-search'>
                        <Search aria-hidden='true' />
                        <input
                            ref={searchInputRef}
                            id='feed-bookmark-search'
                            type='search'
                            aria-label={t.bookmarkSearch}
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
            </dialog>
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
                        <div className='settings-feed-list bookmark-card-list'>
                            {feedBookmarks.map((bookmark, index) => (
                                <FeedBookmarkRow
                                    key={bookmark.id}
                                    bookmark={bookmark}
                                    disabled={!bookmarkControls.canEdit}
                                    index={index}
                                    onOpen={() => {
                                        onOpenBookmark(bookmark.id);
                                    }}
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
        </section>
    );
};
