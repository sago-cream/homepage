import React, { lazy, Suspense, useCallback, useState } from 'react';
import { Layers, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useHomepageAuth } from '@/auth/AuthProvider';
import { useBookmarks } from '@/hooks/useBookmarks';
import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useBookmarkSearch } from '@/hooks/useBookmarkSearch';
import { useHideLinks } from '@/hooks/useHideLinks';
import { useLocale } from '@/hooks/useLocale';
import { useTime } from '@/hooks/useTime';
import type { AqiData, WeatherData } from '@/types/environment';
import type { InitialAppPreferences } from '@/types/preferences';
import { settingsSectionPaths } from '@/utils/settingsNavigation';
import { Mountains } from './Mountains';
import { SearchSuggestions } from './SearchSuggestions';

const LinkPanel = lazy(
    async () =>
        await import('./LinkPanel').then((module) => ({
            default: module.LinkPanel,
        }))
);

const RoutedSettings = lazy(
    async () =>
        await import('./RoutedSettings').then((module) => ({
            default: module.RoutedSettings,
        }))
);

const Weather = lazy(
    async () =>
        await import('./Weather').then((module) => ({
            default: module.Weather,
        }))
);

const timeBootstrapScript = `
(function () {
    try {
        var clock = document.currentScript.previousElementSibling;

        if (clock) {
            clock.textContent = new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                hour12: false,
                minute: '2-digit',
                timeZone: 'Asia/Taipei',
            });
        }
    } catch {}
})();
`;

interface CoverProps {
    initialAqi: AqiData | undefined;
    initialPreferences: InitialAppPreferences;
    initialWeather: WeatherData | undefined;
    isSupabaseEnabled: boolean;
}

interface CoverContentProps extends CoverProps {
    bookmarkControls: BookmarkControls;
}

const CoverContent: React.FC<CoverContentProps> = ({
    bookmarkControls,
    initialAqi,
    initialPreferences,
    initialWeather,
    isSupabaseEnabled,
}) => {
    const { time } = useTime();
    const router = useRouter();
    const openQuickLaunchSetup = useCallback(() => {
        const hasBookmarks = bookmarkControls.bookmarkTree.some(
            (category) => category.links.length > 0
        );
        router.push(
            hasBookmarks
                ? settingsSectionPaths.quickLaunch
                : settingsSectionPaths.content,
            { scroll: false }
        );
    }, [bookmarkControls.bookmarkTree, router]);
    const { t } = useLocale();
    const { hideLinks } = useHideLinks();
    const [isLinkPanelLocked, setIsLinkPanelLocked] = useState(false);
    const {
        blockedQuickLaunchBookmarks,
        clearBlockedQuickLaunchBookmarks,
        dismissBlockedQuickLaunchBookmark,
        clearSearch,
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
        searchGoogleCurrentValue,
        searchInputValue,
        searchResultIndexOffset,
        searchRef,
        searchResults,
        searchSuggestionsId,
        searchSuggestionsPosition,
        selectedSearchResult,
        slashCommandResults,
        trimmedSearchValue,
    } = useBookmarkSearch(
        bookmarkControls.bookmarkTree,
        bookmarkControls.isLoading,
        openQuickLaunchSetup
    );

    return (
        <section className='cover'>
            <Mountains />
            <div className={`cover-content ${inputFocused ? 'focused' : ''}`}>
                <div className='title-container'>
                    <div className='weather-slot'>
                        <Suspense fallback={undefined}>
                            <Weather
                                initialAqi={initialAqi}
                                initialPreferences={initialPreferences}
                                initialWeather={initialWeather}
                            />
                        </Suspense>
                    </div>
                    <span className='title' suppressHydrationWarning>
                        {time}
                    </span>
                    <script
                        dangerouslySetInnerHTML={{
                            __html: timeBootstrapScript,
                        }}
                    />
                </div>
                <div className='homepage-launch-bar'>
                    <div
                        className={[
                            'search',
                            inputFocused && 'focused',
                            hasSearchSuggestions && 'with-suggestions',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        ref={searchRef}
                    >
                        <form
                            className='search-form'
                            ref={searchFormRef}
                            onSubmit={handleSubmit}
                            onClick={focusSearchInput}
                        >
                            <div className='search-icon'>
                                <Search className='icon' />
                            </div>
                            <input
                                className='search-input'
                                type='text'
                                placeholder={t.homepageSearch}
                                aria-label={t.homepageSearch}
                                autoComplete='off'
                                value={searchInputValue}
                                ref={inputRef}
                                aria-controls={
                                    hasSearchSuggestions
                                        ? searchSuggestionsId
                                        : undefined
                                }
                                aria-expanded={hasSearchSuggestions}
                                aria-autocomplete='list'
                                onKeyDown={handleSearchKeyDown}
                                onChange={handleSearchChange}
                                onFocus={handleSearchFocus}
                                onBlur={handleSearchBlur}
                            />
                        </form>
                    </div>
                    <button
                        type='button'
                        className='quick-launch-entry'
                        disabled={bookmarkControls.isLoading}
                        onClick={() => {
                            executeSlashCommand({
                                command: 'quick-launch',
                                label: '/launch',
                            });
                        }}
                    >
                        <Layers aria-hidden />
                        <span>{t.quickLaunch}</span>
                    </button>
                </div>
            </div>
            {hasSearchSuggestions && searchSuggestionsPosition && (
                <SearchSuggestions
                    googleSearchResultIndex={googleSearchResultIndex}
                    hasGoogleSearchResult={hasGoogleSearchResult}
                    highlightedSearchResultIndex={highlightedSearchResultIndex}
                    id={searchSuggestionsId}
                    onHighlightGoogleSearch={highlightGoogleSearch}
                    onHighlightSearchResult={highlightSearchResult}
                    onSearchGoogle={searchGoogleCurrentValue}
                    onSelectSearchResult={navigateToSearchResult}
                    onSelectSlashCommand={executeSlashCommand}
                    position={searchSuggestionsPosition}
                    searchResults={searchResults}
                    searchResultIndexOffset={searchResultIndexOffset}
                    slashCommandResults={slashCommandResults}
                    trimmedSearchValue={trimmedSearchValue}
                />
            )}

            {blockedQuickLaunchBookmarks.length > 0 && (
                <aside
                    className='quick-launch-fallback'
                    aria-labelledby='quick-launch-fallback-title'
                >
                    <div className='quick-launch-fallback-header'>
                        <h2 id='quick-launch-fallback-title'>
                            {t.quickLaunch}
                        </h2>
                        <button
                            type='button'
                            className='settings-icon-button'
                            aria-label={t.close}
                            onClick={clearBlockedQuickLaunchBookmarks}
                        >
                            <X aria-hidden />
                        </button>
                    </div>
                    <p role='status'>{t.quickLaunchBlocked}</p>
                    <div className='quick-launch-fallback-links'>
                        {blockedQuickLaunchBookmarks.map((bookmark) => (
                            <a
                                key={bookmark.id}
                                href={bookmark.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={() => {
                                    dismissBlockedQuickLaunchBookmark(
                                        bookmark.id
                                    );
                                }}
                            >
                                {bookmark.title}
                            </a>
                        ))}
                    </div>
                </aside>
            )}

            <Suspense fallback={undefined}>
                <RoutedSettings
                    bookmarkControls={bookmarkControls}
                    initialPreferences={initialPreferences}
                    isSupabaseEnabled={isSupabaseEnabled}
                />
                <LinkPanel
                    bookmarkControls={bookmarkControls}
                    hidden={hideLinks}
                    initialPreferences={initialPreferences}
                    isSupabaseEnabled={isSupabaseEnabled}
                    isLockedOpen={isLinkPanelLocked}
                    isSearchNav={inputFocused}
                    highlightedLink={selectedSearchResult?.id}
                    highlightedFolderPath={selectedSearchResult?.folderPath}
                    highlightedCategory={selectedSearchResult?.category}
                    onClearSearch={clearSearch}
                    onToggleLockedOpen={() => {
                        setIsLinkPanelLocked((current) => !current);
                    }}
                />
            </Suspense>
        </section>
    );
};

const CoverWithRemoteBookmarks: React.FC<CoverProps> = (props) => {
    const { getToken, isLoaded, isSignedIn, userId } = useHomepageAuth();
    const bookmarkControls = useBookmarks({
        auth: {
            getToken,
            isLoaded,
            isSignedIn,
            userId,
        },
    });

    return <CoverContent {...props} bookmarkControls={bookmarkControls} />;
};

const CoverWithLocalBookmarks: React.FC<CoverProps> = (props) => {
    const bookmarkControls = useBookmarks();

    return <CoverContent {...props} bookmarkControls={bookmarkControls} />;
};

export const Cover: React.FC<CoverProps> = (props) => {
    if (props.isSupabaseEnabled) {
        return <CoverWithRemoteBookmarks {...props} />;
    }

    return <CoverWithLocalBookmarks {...props} />;
};
