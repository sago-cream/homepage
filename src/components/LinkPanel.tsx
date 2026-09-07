import { useCallback, useEffect, useMemo, useState } from 'react';
import { Moon, PanelLeft, PanelLeftClose, Sun } from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLinkNavigation } from '@/hooks/useLinkNavigation';
import { useLocale } from '@/hooks/useLocale';
import type { InitialAppPreferences } from '@/types/preferences';
import { decorateBookmarkTree } from '@/utils/bookmarkPresentation';
import { isBrowser } from '@/utils/browserEnv';
import { runThemeTransition } from '@/utils/themeTransition';
import type { WallpaperAsset } from '../../shared/wallpaper';
import { BookmarkEmptyState } from './BookmarkEmptyState';
import { LinkCategory } from './LinkCategory';
import { MobileBookmarks } from './MobileBookmarks';
import { UserFloatingBar } from './UserFloatingBar';

interface LinkPanelProps {
    hidden: boolean;
    bookmarkControls: BookmarkControls;
    isSupabaseEnabled: boolean;
    isLockedOpen: boolean;
    isSearchNav: boolean;
    highlightedLink?: string;
    highlightedFolderPath?: string[];
    highlightedCategory?: number;
    initialPreferences: InitialAppPreferences;
    onClearSearch: () => void;
    onToggleLockedOpen: () => void;
    initialWallpaper: WallpaperAsset | undefined;
    onWallpaperChange: (wallpaper: WallpaperAsset | undefined) => void;
}

const areFolderPathsEqual = (
    firstPath: readonly string[],
    secondPath: readonly string[]
): boolean =>
    firstPath.length === secondPath.length &&
    firstPath.every((folderId, index) => folderId === secondPath[index]);

export const LinkPanel: React.FC<LinkPanelProps> = ({
    hidden,
    bookmarkControls,
    isSupabaseEnabled,
    isLockedOpen,
    isSearchNav,
    highlightedLink,
    highlightedFolderPath,
    highlightedCategory,
    initialPreferences,
    onClearSearch,
    onToggleLockedOpen,
    initialWallpaper,
    onWallpaperChange,
}) => {
    const {
        selectedCategory,
        isMouseNav,
        mouseLeaveCloseSignal,
        startMouseNav,
        endMouseNav,
    } = useLinkNavigation(isSearchNav, onClearSearch, highlightedCategory);
    const { t } = useLocale(initialPreferences.locale);

    const [windowHeight, setWindowHeight] = useState(() =>
        isBrowser() ? globalThis.innerHeight : 768
    );
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [clickedCategory, setClickedCategory] = useState<number>();
    const [clickedFolderPath, setClickedFolderPath] = useState<string[]>([]);
    const isExpanded = selectedCategory !== 0 || clickedCategory !== undefined;
    const bookmarkTree = useMemo(
        () => decorateBookmarkTree(bookmarkControls.bookmarkTree),
        [bookmarkControls.bookmarkTree]
    );
    const bookmarkStatusMessage =
        bookmarkControls.status === undefined
            ? undefined
            : t[bookmarkControls.status.messageKey];

    useEffect(() => {
        const onResize = () => {
            setWindowHeight(globalThis.innerHeight);
        };
        globalThis.addEventListener('resize', onResize);
        return () => {
            globalThis.removeEventListener('resize', onResize);
        };
    }, []);

    useEffect(() => {
        if (!hidden && !isSearchNav) {
            return;
        }

        setClickedCategory(undefined);
        setClickedFolderPath([]);
    }, [hidden, isSearchNav]);

    const selectCategory = useCallback(
        (categoryIndex: number) => {
            setClickedCategory((currentCategory) =>
                currentCategory === categoryIndex &&
                clickedFolderPath.length === 0
                    ? undefined
                    : categoryIndex
            );
            setClickedFolderPath([]);
            onClearSearch();
        },
        [clickedFolderPath.length, onClearSearch]
    );

    const selectFolder = useCallback(
        (categoryIndex: number, folderPath: readonly string[]) => {
            setClickedCategory(categoryIndex);
            setClickedFolderPath(
                areFolderPathsEqual(clickedFolderPath, folderPath)
                    ? folderPath.slice(0, -1)
                    : [...folderPath]
            );
            onClearSearch();
        },
        [clickedFolderPath, onClearSearch]
    );

    const selectLink = useCallback(
        (categoryIndex: number, folderPath: readonly string[]) => {
            setClickedCategory(categoryIndex);
            setClickedFolderPath([...folderPath]);
            onClearSearch();
        },
        [onClearSearch]
    );

    const panelPaddings = useMemo(() => {
        const remToPx = 16;
        const linkHeight = 3.5 * remToPx;

        return bookmarkTree.map((categoryData, categoryIndex) => {
            const headerPosition =
                windowHeight / 2 +
                (categoryIndex + 1 - bookmarkTree.length / 2 - 0.5) *
                    linkHeight;
            const linksHeight = categoryData.children.length * linkHeight;
            let padding: number;
            padding =
                headerPosition + linksHeight / 2 <= windowHeight - remToPx
                    ? headerPosition - linksHeight / 2
                    : windowHeight - linksHeight - remToPx;
            if (padding < remToPx) {
                padding = remToPx;
            }
            return `${padding}px`;
        });
    }, [bookmarkTree, windowHeight]);

    return (
        <nav
            className={[
                'link-panel',
                isMouseNav && 'hoverEffective',
                isSearchNav && 'search-nav',
                clickedCategory !== undefined && 'category-layer-locked',
            ]
                .filter(Boolean)
                .join(' ')}
            onMouseDown={(e) => {
                e.preventDefault();
            }}
            onMouseMove={startMouseNav}
            onMouseLeave={endMouseNav}
            aria-hidden={hidden}
            aria-expanded={isLockedOpen || isExpanded || isMobileOpen}
        >
            <MobileBookmarks
                bookmarkTree={bookmarkTree}
                bookmarksLabel={t.bookmarks}
                disabled={isSearchNav}
                emptyState={
                    <BookmarkEmptyState
                        bookmarkControls={bookmarkControls}
                        className='mobile-bookmark-empty-state'
                        ctaLabel={t.importBookmarksFromBrowser}
                        description={t.bookmarksEmptyDescription}
                        statusMessage={bookmarkStatusMessage}
                        statusType={bookmarkControls.status?.type}
                        title={t.bookmarksEmpty}
                    />
                }
                hidden={hidden}
                onClearSearch={onClearSearch}
                onOpenChange={setIsMobileOpen}
            />
            <UserFloatingBar
                bookmarkControls={bookmarkControls}
                className='mobile-user-floating-bar'
                closeMenusSignal={mouseLeaveCloseSignal}
                initialPreferences={initialPreferences}
                initialWallpaper={initialWallpaper}
                isSupabaseEnabled={isSupabaseEnabled}
                onWallpaperChange={onWallpaperChange}
                settingsPlacement='mobile'
                showSettingsInMenu
            />
            <div className={`trigger ${hidden && 'hidden'}`} />
            <div
                className='panel-lock-control'
                onMouseMove={(event) => {
                    event.stopPropagation();
                }}
            >
                <button
                    className='panel-lock-trigger'
                    type='button'
                    aria-label={
                        isLockedOpen
                            ? 'Unlock bookmark panel'
                            : 'Lock bookmark panel open'
                    }
                    aria-pressed={isLockedOpen}
                    onClick={onToggleLockedOpen}
                >
                    {isLockedOpen ? (
                        <PanelLeftClose className='icon' size={20} />
                    ) : (
                        <PanelLeft className='icon' size={20} />
                    )}
                </button>
                {!isLockedOpen &&
                    !isExpanded &&
                    !isMobileOpen &&
                    !isMouseNav && (
                        <button
                            className='panel-lock-trigger theme-toggle-trigger'
                            type='button'
                            aria-label={t.theme}
                            title={t.theme}
                            onClick={(event) => {
                                runThemeTransition({
                                    button: event.currentTarget,
                                    isDarkMode:
                                        globalThis.document.documentElement
                                            .dataset.theme === 'dark',
                                });
                            }}
                        >
                            <Sun
                                className='icon theme-icon-light'
                                size={20}
                                aria-hidden
                            />
                            <Moon
                                className='icon theme-icon-dark'
                                size={20}
                                aria-hidden
                            />
                        </button>
                    )}
            </div>
            <div
                className={[
                    'link-tree',
                    (isExpanded || isLockedOpen) && 'expanded',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <div className='panel' />
                {bookmarkTree.length === 0 ? (
                    <BookmarkEmptyState
                        bookmarkControls={bookmarkControls}
                        className='bookmark-panel-empty-state'
                        ctaLabel={t.importBookmarksFromBrowser}
                        description={t.bookmarksEmptyDescription}
                        statusMessage={bookmarkStatusMessage}
                        statusType={bookmarkControls.status?.type}
                        title={t.bookmarksEmpty}
                    />
                ) : (
                    bookmarkTree.map((categoryData, i) => (
                        <LinkCategory
                            key={`${categoryData.category}-${i}`}
                            categoryData={categoryData}
                            index={i}
                            clickedCategory={clickedCategory}
                            clickedFolderPath={
                                clickedCategory === i + 1
                                    ? clickedFolderPath
                                    : []
                            }
                            selectedCategory={selectedCategory}
                            isMouseNav={isMouseNav}
                            padding={panelPaddings[i]}
                            highlightedLinkId={highlightedLink}
                            highlightedFolderPath={highlightedFolderPath}
                            onSelectCategory={selectCategory}
                            onSelectFolder={selectFolder}
                            onSelectLink={selectLink}
                        />
                    ))
                )}
                <UserFloatingBar
                    bookmarkControls={bookmarkControls}
                    className='desktop-user-floating-bar'
                    closeMenusSignal={mouseLeaveCloseSignal}
                    initialPreferences={initialPreferences}
                    initialWallpaper={initialWallpaper}
                    isSupabaseEnabled={isSupabaseEnabled}
                    onWallpaperChange={onWallpaperChange}
                />
            </div>
        </nav>
    );
};
