import { useMemo, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
    Check,
    GripVertical,
    Layers,
    Pencil,
    Plus,
    Search,
    X,
} from 'lucide-react';
import Link from 'next/link';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type { BookmarkLinkData } from '@/types/bookmarks';
import { getFeedBookmarks, setFeedBookmarkIds } from '@/utils/feeds';
import { getSearchItems, getSearchResults } from '@/utils/search';
import { settingsSectionPaths } from '@/utils/settingsNavigation';
import { ActionMenu } from './ActionMenu';
import { BookmarkCard } from './BookmarkCard';

interface QuickLaunchBookmarkRowProps {
    bookmark: BookmarkLinkData;
    disabled: boolean;
    index: number;
    onRemove: () => void;
    onOpen: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}

const QuickLaunchBookmarkRow: React.FC<QuickLaunchBookmarkRowProps> = ({
    bookmark,
    disabled,
    index,
    onRemove,
    onOpen,
    onMoveUp,
    onMoveDown,
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
            data-feed-id={bookmark.id}
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
            <ActionMenu
                label={`${bookmark.title}: ${t.bookmarkActions}`}
                items={[
                    { label: t.openInBookmarkManager, onSelect: onOpen },
                    {
                        label: locale === 'zh-TW' ? '開啟' : 'Open',
                        href: bookmark.url,
                    },
                    ...(onMoveUp
                        ? [{ label: t.moveUp, onSelect: onMoveUp }]
                        : []),
                    ...(onMoveDown
                        ? [{ label: t.moveDown, onSelect: onMoveDown }]
                        : []),
                    ...(disabled
                        ? []
                        : [
                              {
                                  label: t.removeFromQuickLaunch,
                                  onSelect: onRemove,
                              },
                          ]),
                ]}
            />
        </div>
    );
};

interface QuickLaunchSettingsSectionProps {
    bookmarkControls: BookmarkControls;
    onOpenBookmark: (bookmarkId: string) => void;
}

export const QuickLaunchSettingsSection: React.FC<
    QuickLaunchSettingsSectionProps
> = ({ bookmarkControls, onOpenBookmark }) => {
    const { t } = useLocale();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const [query, setQuery] = useState('');
    const [saveFailed, setSaveFailed] = useState(false);
    const hasSaveError = saveFailed || bookmarkControls.saveState === 'error';
    const selectedListRef = useRef<HTMLDivElement>(null);
    const pendingAddedRef = useRef<string | undefined>(undefined);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const feedBookmarks = useMemo(
        () => getFeedBookmarks(bookmarkControls.bookmarkTree),
        [bookmarkControls.bookmarkTree]
    );
    const selectedCountLabel =
        feedBookmarks.length === 1
            ? t.quickLaunchOneSelected
            : t.quickLaunchSelectedCount.replace(
                  '{count}',
                  String(feedBookmarks.length)
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
            ? searchItems
            : getSearchResults(
                  searchItems,
                  trimmedQuery,
                  '',
                  searchItems.length
              );
    }, [query, searchItems]);

    const saveFeedBookmarkIds = (bookmarkIds: readonly string[]) => {
        const saved = bookmarkControls.replaceBookmarkTree(
            setFeedBookmarkIds(bookmarkControls.bookmarkTree, bookmarkIds)
        );
        setSaveFailed(!saved);
        return saved;
    };

    const moveBookmark = (sourceIndex: number, destinationIndex: number) => {
        if (sourceIndex === destinationIndex) {
            return;
        }
        const bookmarkIds = feedBookmarks.map((bookmark) => bookmark.id);
        const [bookmarkId] = bookmarkIds.splice(sourceIndex, 1);
        bookmarkIds.splice(destinationIndex, 0, bookmarkId);
        saveFeedBookmarkIds(bookmarkIds);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { source } = event.operation;
        if (event.canceled || source === null || !isSortable(source)) {
            return;
        }
        moveBookmark(source.initialIndex, source.index);
    };

    const searchResultsContent = (() => {
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
                disabled={!bookmarkControls.canEdit}
                aria-pressed={feedBookmarkIds.has(result.id)}
                onClick={() => {
                    if (
                        saveFeedBookmarkIds([
                            ...feedBookmarks
                                .filter((bookmark) => bookmark.id !== result.id)
                                .map((bookmark) => bookmark.id),
                            ...(feedBookmarkIds.has(result.id)
                                ? []
                                : [result.id]),
                        ])
                    ) {
                        pendingAddedRef.current = result.id;
                    }
                    searchInputRef.current?.focus();
                }}
            >
                <span>
                    <strong>{result.title}</strong>
                    <small>{result.pathLabel}</small>
                </span>
                {feedBookmarkIds.has(result.id) ? (
                    <Check aria-hidden />
                ) : (
                    <Plus aria-hidden />
                )}
            </button>
        ));
    })();

    const addButton = (
        <button
            ref={addButtonRef}
            className='bookmark-workspace-primary-button'
            type='button'
            disabled={!bookmarkControls.canEdit}
            onClick={() => {
                dialogRef.current?.showModal();
                searchInputRef.current?.focus();
            }}
        >
            {feedBookmarks.length > 0 ? (
                <Pencil aria-hidden />
            ) : (
                <Plus aria-hidden />
            )}
            {feedBookmarks.length > 0 ? t.quickLaunchEdit : t.quickLaunchChoose}
        </button>
    );

    return (
        <section className='settings-page-section' data-setting='feeds'>
            <div className='settings-feed-heading'>
                <div className='settings-section-heading'>
                    <h2>{t.quickLaunch}</h2>
                    {feedBookmarks.length > 0 && (
                        <p className='settings-row-description'>
                            {t.quickLaunchSettingsDescription}
                        </p>
                    )}
                </div>
                {feedBookmarks.length > 0 && addButton}
            </div>
            <dialog
                ref={dialogRef}
                className='settings-feed-dialog'
                onClose={() => {
                    if (pendingAddedRef.current) {
                        const row = [
                            ...(selectedListRef.current?.querySelectorAll<HTMLElement>(
                                '[data-feed-id]'
                            ) ?? []),
                        ].find(
                            (item) =>
                                item.dataset.feedId === pendingAddedRef.current
                        );
                        row?.scrollIntoView({ block: 'nearest' });
                        pendingAddedRef.current = undefined;
                    }
                    setQuery('');
                    addButtonRef.current?.focus({ preventScroll: true });
                }}
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
                        <h3 id='feed-dialog-title'>
                            {t.chooseLaunchBookmarks}
                        </h3>
                        <button
                            type='button'
                            className='settings-icon-button'
                            aria-label={t.close}
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
                    <div className='settings-launch-picker-footer'>
                        <span role={hasSaveError ? 'alert' : 'status'}>
                            {hasSaveError
                                ? t.bookmarkSaveFailed
                                : selectedCountLabel}
                        </span>
                        <button
                            type='button'
                            className='settings-action-button'
                            onClick={() => dialogRef.current?.close()}
                        >
                            {t.done}
                        </button>
                    </div>
                </div>
            </dialog>
            {hasSaveError && (
                <p className='settings-row-description' role='alert'>
                    {t.bookmarkSaveFailed}
                </p>
            )}
            <div className='settings-feed-selected' ref={selectedListRef}>
                {feedBookmarks.length === 0 ? (
                    <div className='settings-empty-state'>
                        <Layers aria-hidden='true' />
                        <strong>
                            {searchItems.length === 0
                                ? t.bookmarksEmpty
                                : t.quickLaunchEmpty}
                        </strong>
                        <p>
                            {searchItems.length === 0
                                ? t.quickLaunchLibraryEmpty
                                : t.quickLaunchEmptyDescription}
                        </p>
                        {searchItems.length === 0 ? (
                            <Link
                                className='settings-action-button'
                                href={settingsSectionPaths.content}
                                scroll={false}
                            >
                                <Plus aria-hidden='true' />
                                {t.quickLaunchAddBookmarks}
                            </Link>
                        ) : (
                            addButton
                        )}
                    </div>
                ) : (
                    <DragDropProvider onDragEnd={handleDragEnd}>
                        <div className='settings-feed-list bookmark-card-list'>
                            {feedBookmarks.map((bookmark, index) => (
                                <QuickLaunchBookmarkRow
                                    key={bookmark.id}
                                    bookmark={bookmark}
                                    disabled={!bookmarkControls.canEdit}
                                    index={index}
                                    onMoveUp={
                                        index > 0 && bookmarkControls.canEdit
                                            ? () => {
                                                  moveBookmark(
                                                      index,
                                                      index - 1
                                                  );
                                              }
                                            : undefined
                                    }
                                    onMoveDown={
                                        index < feedBookmarks.length - 1 &&
                                        bookmarkControls.canEdit
                                            ? () => {
                                                  moveBookmark(
                                                      index,
                                                      index + 1
                                                  );
                                              }
                                            : undefined
                                    }
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
