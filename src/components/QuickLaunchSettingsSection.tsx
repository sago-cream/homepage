import { useMemo, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { GripVertical, Link as LinkIcon, Plus, Search, X } from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type { BookmarkLinkData } from '@/types/bookmarks';
import {
    getQuickLaunchBookmarks,
    setQuickLaunchBookmarkIds,
} from '@/utils/quickLaunch';
import { getSearchItems, getSearchResults } from '@/utils/search';
import { BookmarkActions, BookmarkCard } from './BookmarkCard';

interface QuickLaunchBookmarkRowProps {
    bookmark: BookmarkLinkData;
    disabled: boolean;
    index: number;
    onRemove: () => void;
    onOpen: () => void;
}

const QuickLaunchBookmarkRow: React.FC<QuickLaunchBookmarkRowProps> = ({
    bookmark,
    disabled,
    index,
    onRemove,
    onOpen,
}) => {
    const { locale, t } = useLocale();
    const sortable = useSortable({
        accept: 'settings-launch-bookmark',
        disabled,
        group: 'settings-quick-launch',
        id: bookmark.id,
        index,
        type: 'settings-launch-bookmark',
    });

    return (
        <div
            ref={sortable.ref}
            className='bookmark-workspace-list-row settings-launch-bookmark'
            data-launch-id={bookmark.id}
            data-dragging={sortable.isDragSource ? 'true' : undefined}
        >
            <button
                ref={sortable.handleRef}
                className='settings-launch-drag-handle'
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
                    delete: t.removeFromQuickLaunch,
                }}
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
    const selectedListRef = useRef<HTMLDivElement>(null);
    const pendingAddedRef = useRef<string | undefined>(undefined);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const quickLaunchBookmarks = useMemo(
        () => getQuickLaunchBookmarks(bookmarkControls.bookmarkTree),
        [bookmarkControls.bookmarkTree]
    );
    const quickLaunchBookmarkIds = useMemo(
        () => new Set(quickLaunchBookmarks.map((bookmark) => bookmark.id)),
        [quickLaunchBookmarks]
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
                  searchItems.filter(
                      (item) => !quickLaunchBookmarkIds.has(item.id)
                  ),
                  trimmedQuery,
                  '',
                  searchItems.length
              );
    }, [quickLaunchBookmarkIds, query, searchItems]);

    const saveQuickLaunchBookmarkIds = (bookmarkIds: readonly string[]) =>
        bookmarkControls.replaceBookmarkTree(
            setQuickLaunchBookmarkIds(
                bookmarkControls.bookmarkTree,
                bookmarkIds
            )
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

        const bookmarkIds = quickLaunchBookmarks.map((bookmark) => bookmark.id);
        const [bookmarkId] = bookmarkIds.splice(sourceIndex, 1);
        bookmarkIds.splice(destinationIndex, 0, bookmarkId);
        saveQuickLaunchBookmarkIds(bookmarkIds);
    };

    const searchResultsContent = (() => {
        if (query.trim() === '') {
            return (
                <div className='settings-launch-search-empty'>
                    <Search aria-hidden='true' />
                    <span>{t.quickLaunchSearchPrompt}</span>
                </div>
            );
        }

        if (searchResults.length === 0) {
            return (
                <div className='settings-launch-search-empty'>
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
                    if (
                        saveQuickLaunchBookmarkIds([
                            ...quickLaunchBookmarks.map(
                                (bookmark) => bookmark.id
                            ),
                            result.id,
                        ])
                    ) {
                        pendingAddedRef.current = result.id;
                    }
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
            <Plus aria-hidden='true' />
            {t.addQuickLaunchBookmark}
        </button>
    );

    return (
        <section className='settings-page-section' data-setting='quickLaunch'>
            <div className='settings-launch-heading'>
                <div className='settings-section-heading'>
                    <h2>{t.quickLaunch}</h2>
                </div>
                {quickLaunchBookmarks.length > 0 && addButton}
            </div>
            <dialog
                ref={dialogRef}
                className='settings-launch-dialog'
                onClose={() => {
                    if (pendingAddedRef.current) {
                        const row = [
                            ...(selectedListRef.current?.querySelectorAll<HTMLElement>(
                                '[data-launch-id]'
                            ) ?? []),
                        ].find(
                            (item) =>
                                item.dataset.launchId ===
                                pendingAddedRef.current
                        );
                        row?.scrollIntoView({ block: 'nearest' });
                        pendingAddedRef.current = undefined;
                    }
                    setQuery('');
                    addButtonRef.current?.focus({ preventScroll: true });
                }}
                aria-labelledby='quick-launch-picker-title'
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        dialogRef.current?.close();
                    }
                }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                }}
            >
                <div className='settings-launch-search-area'>
                    <div className='settings-launch-subheading'>
                        <h3 id='quick-launch-picker-title'>
                            {t.addQuickLaunchBookmark}
                        </h3>
                        <button
                            type='button'
                            className='settings-icon-button'
                            aria-label={t.cancel}
                            onClick={() => dialogRef.current?.close()}
                        >
                            <X aria-hidden='true' />
                        </button>
                    </div>
                    <div className='settings-launch-search'>
                        <Search aria-hidden='true' />
                        <input
                            ref={searchInputRef}
                            id='quick-launch-bookmark-search'
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
                    <div className='settings-launch-results' aria-live='polite'>
                        {searchResultsContent}
                    </div>
                </div>
            </dialog>
            <div className='settings-launch-selected' ref={selectedListRef}>
                {quickLaunchBookmarks.length === 0 ? (
                    <div className='settings-empty-state'>
                        <LinkIcon aria-hidden='true' />
                        <strong>{t.quickLaunchEmpty}</strong>
                        <p>{t.quickLaunchEmptyDescription}</p>
                        {addButton}
                    </div>
                ) : (
                    <DragDropProvider onDragEnd={handleDragEnd}>
                        <div className='settings-launch-list bookmark-card-list'>
                            {quickLaunchBookmarks.map((bookmark, index) => (
                                <QuickLaunchBookmarkRow
                                    key={bookmark.id}
                                    bookmark={bookmark}
                                    disabled={!bookmarkControls.canEdit}
                                    index={index}
                                    onOpen={() => {
                                        onOpenBookmark(bookmark.id);
                                    }}
                                    onRemove={() => {
                                        saveQuickLaunchBookmarkIds(
                                            quickLaunchBookmarks.flatMap(
                                                (item) =>
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
