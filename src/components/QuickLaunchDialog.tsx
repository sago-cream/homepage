import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Layers, X } from 'lucide-react';
import Link from 'next/link';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type { BookmarkLinkData } from '@/types/bookmarks';
import { getFeedBookmarks } from '@/utils/feeds';
import { openQuickLaunchBookmarks } from '@/utils/quickLaunch';
import { settingsSectionPaths } from '@/utils/settingsNavigation';

export const QuickLaunchDialog: React.FC<{
    bookmarkControls: BookmarkControls;
    onClose: () => void;
}> = ({ bookmarkControls, onClose }) => {
    const { t } = useLocale();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const launchButtonRef = useRef<HTMLButtonElement>(null);
    const [remaining, setRemaining] = useState<BookmarkLinkData[]>();
    const bookmarks = getFeedBookmarks(bookmarkControls.bookmarkTree);
    const hasLibrary = bookmarkControls.bookmarkTree.some(
        (category) => category.links.length > 0
    );
    const visibleBookmarks = remaining ?? bookmarks;
    const emptyDescription = hasLibrary
        ? t.quickLaunchEmptyDescription
        : t.quickLaunchLibraryEmpty;
    const countLabel =
        bookmarks.length === 1
            ? t.quickLaunchOpenOneTab
            : t.quickLaunchOpenTabs.replace(
                  '{count}',
                  String(bookmarks.length)
              );

    useEffect(() => {
        const previousFocus = document.activeElement;
        dialogRef.current?.showModal();
        launchButtonRef.current?.focus({ preventScroll: true });
        return () => {
            if (
                previousFocus instanceof HTMLElement &&
                previousFocus.isConnected
            ) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className='quick-launch-dialog'
            aria-labelledby='quick-launch-title'
            aria-describedby='quick-launch-description'
            onClose={onClose}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    dialogRef.current?.close();
                }
            }}
        >
            <div className='quick-launch-header'>
                <h2 id='quick-launch-title'>
                    <Layers aria-hidden />
                    {t.quickLaunch}
                </h2>
                <button
                    type='button'
                    className='settings-icon-button'
                    aria-label={t.close}
                    onClick={() => dialogRef.current?.close()}
                >
                    <X aria-hidden />
                </button>
            </div>
            <p
                id='quick-launch-description'
                className='settings-row-description'
            >
                {bookmarks.length === 0
                    ? emptyDescription
                    : t.quickLaunchDescription}
            </p>
            {bookmarks.length === 0 ? (
                <div className='settings-empty-state quick-launch-empty'>
                    <Layers aria-hidden />
                    <strong>
                        {hasLibrary ? t.quickLaunchEmpty : t.bookmarksEmpty}
                    </strong>
                    <Link
                        className='bookmark-workspace-primary-button'
                        href={
                            hasLibrary
                                ? settingsSectionPaths.feeds
                                : settingsSectionPaths.content
                        }
                        onClick={onClose}
                        scroll={false}
                    >
                        {hasLibrary
                            ? t.quickLaunchChoose
                            : t.quickLaunchAddBookmarks}
                    </Link>
                </div>
            ) : (
                <>
                    {remaining !== undefined && (
                        <p className='quick-launch-status' role='status'>
                            {remaining.length > 0
                                ? t.quickLaunchBlocked
                                : t.quickLaunchOpened}
                        </p>
                    )}
                    {visibleBookmarks.length > 0 && (
                        <ol className='quick-launch-bookmarks'>
                            {visibleBookmarks.map((bookmark) => (
                                <li key={bookmark.id}>
                                    <a
                                        href={bookmark.url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        onClick={() => {
                                            if (remaining) {
                                                setRemaining(
                                                    remaining.filter(
                                                        (item) =>
                                                            item.id !==
                                                            bookmark.id
                                                    )
                                                );
                                            }
                                        }}
                                    >
                                        <span>
                                            <strong>{bookmark.title}</strong>
                                            <small>{bookmark.url}</small>
                                        </span>
                                        <ExternalLink aria-hidden />
                                    </a>
                                </li>
                            ))}
                        </ol>
                    )}
                    <div className='quick-launch-footer'>
                        <Link
                            className='bookmark-workspace-secondary-button quick-launch-edit'
                            href={settingsSectionPaths.feeds}
                            onClick={onClose}
                            scroll={false}
                        >
                            {t.quickLaunchEdit}
                        </Link>
                        {remaining === undefined ? (
                            <button
                                ref={launchButtonRef}
                                type='button'
                                className='bookmark-workspace-primary-button'
                                onClick={() => {
                                    setRemaining(
                                        openQuickLaunchBookmarks(bookmarks)
                                    );
                                }}
                            >
                                <ExternalLink aria-hidden />
                                {countLabel}
                            </button>
                        ) : (
                            <button
                                type='button'
                                className='bookmark-workspace-primary-button'
                                onClick={() => dialogRef.current?.close()}
                            >
                                {t.done}
                            </button>
                        )}
                    </div>
                </>
            )}
        </dialog>
    );
};
