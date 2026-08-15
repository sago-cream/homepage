import { Bookmark, Rss, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

import type {
    LinkItem,
    SearchSuggestionsPosition,
    SlashCommandItem,
} from '@/utils/search';

interface SearchSuggestionsProps {
    googleSearchResultIndex: number;
    hasGoogleSearchResult: boolean;
    highlightedSearchResultIndex?: number;
    id: string;
    onHighlightGoogleSearch: () => void;
    onHighlightSearchResult: (resultIndex: number) => void;
    onSearchGoogle: () => void;
    onSelectSearchResult: (result: LinkItem) => void;
    onSelectSlashCommand: (command: SlashCommandItem) => void;
    position: SearchSuggestionsPosition;
    searchResults: LinkItem[];
    searchResultIndexOffset: number;
    slashCommandResults: SlashCommandItem[];
    trimmedSearchValue: string;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
    googleSearchResultIndex,
    hasGoogleSearchResult,
    highlightedSearchResultIndex,
    id,
    onHighlightGoogleSearch,
    onHighlightSearchResult,
    onSearchGoogle,
    onSelectSearchResult,
    onSelectSlashCommand,
    position,
    searchResults,
    searchResultIndexOffset,
    slashCommandResults,
    trimmedSearchValue,
}) =>
    createPortal(
        <div
            className='search-suggestions'
            id={id}
            role='listbox'
            aria-label='Other bookmark matches'
            style={
                {
                    '--suggestion-left': `${position.left}px`,
                    '--suggestion-top': `${position.top}px`,
                    '--suggestion-width': `${position.width}px`,
                } as React.CSSProperties
            }
        >
            {slashCommandResults.map((command, commandIndex) => {
                const isSelected =
                    highlightedSearchResultIndex === commandIndex;

                return (
                    <button
                        key={command.command}
                        className={`search-suggestion command-suggestion ${
                            isSelected ? 'selected' : ''
                        }`}
                        id={`${id}-command-${command.command}`}
                        type='button'
                        role='option'
                        aria-selected={isSelected}
                        onPointerDown={(event) => {
                            event.preventDefault();
                        }}
                        onFocus={() => {
                            onHighlightSearchResult(commandIndex);
                        }}
                        onPointerMove={() => {
                            onHighlightSearchResult(commandIndex);
                        }}
                        onClick={() => {
                            onSelectSlashCommand(command);
                        }}
                    >
                        <span className='search-suggestion-icon'>
                            <Rss className='icon' size={24} />
                        </span>
                        <span className='search-suggestion-text'>
                            {command.label}
                        </span>
                    </button>
                );
            })}
            {searchResults.map((result, resultIndex) => {
                const navigationIndex = resultIndex + searchResultIndexOffset;
                const isSelected =
                    highlightedSearchResultIndex === navigationIndex;

                return (
                    <button
                        key={result.id}
                        className={`search-suggestion ${
                            isSelected ? 'selected' : ''
                        }`}
                        id={`${id}-${resultIndex}`}
                        type='button'
                        role='option'
                        aria-selected={isSelected}
                        onPointerDown={(event) => {
                            event.preventDefault();
                        }}
                        onFocus={() => {
                            onHighlightSearchResult(navigationIndex);
                        }}
                        onPointerMove={() => {
                            onHighlightSearchResult(navigationIndex);
                        }}
                        onClick={() => {
                            onSelectSearchResult(result);
                        }}
                    >
                        <span className='search-suggestion-icon'>
                            <Bookmark className='icon' size={24} />
                        </span>
                        <span className='search-suggestion-text'>
                            {result.pathLabel === ''
                                ? result.title
                                : `${result.title} · ${result.pathLabel}`}
                        </span>
                    </button>
                );
            })}
            {hasGoogleSearchResult && (
                <button
                    className={`search-suggestion google-search-suggestion ${
                        highlightedSearchResultIndex === googleSearchResultIndex
                            ? 'selected'
                            : ''
                    }`}
                    type='button'
                    role='option'
                    aria-selected={
                        highlightedSearchResultIndex === googleSearchResultIndex
                    }
                    onPointerDown={(event) => {
                        event.preventDefault();
                    }}
                    onFocus={onHighlightGoogleSearch}
                    onPointerMove={onHighlightGoogleSearch}
                    onClick={onSearchGoogle}
                >
                    <span className='search-suggestion-icon'>
                        <Search className='icon' size={24} />
                    </span>
                    <span className='search-suggestion-text'>
                        {trimmedSearchValue}
                    </span>
                </button>
            )}
        </div>,
        globalThis.document.body
    );
