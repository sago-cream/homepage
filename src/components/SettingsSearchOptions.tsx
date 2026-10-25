import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

import { useLocale } from '@/hooks/useLocale';
import type { SettingsDropdownOption } from './SettingsDropdown';

export const SettingsSearchOptions = ({
    id,
    label,
    initialQuery,
    options,
    value,
    onSelect,
    onClose,
}: {
    id: string;
    label: string;
    initialQuery: string;
    options: SettingsDropdownOption[];
    value: string;
    onSelect: (value: string) => void;
    onClose: () => void;
}): ReactElement => {
    const { t } = useLocale();
    const [query, setQuery] = useState(initialQuery);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const results = options.filter((option) =>
        terms.every((term) =>
            `${option.label} ${option.searchText ?? ''}`
                .toLocaleLowerCase()
                .includes(term)
        )
    );
    const active = results.at(activeIndex);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    useEffect(() => {
        listRef.current
            ?.querySelector('[data-active="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, query]);

    const move = (direction: number) => {
        for (let step = 1; step <= results.length; step++) {
            const index =
                (activeIndex + direction * step + results.length) %
                results.length;
            if (!results[index]?.disabled) {
                setActiveIndex(index);
                break;
            }
        }
    };

    return (
        <>
            <div className='settings-dropdown-search'>
                <Search size={20} aria-hidden />
                <input
                    ref={inputRef}
                    type='text'
                    role='combobox'
                    aria-label={label}
                    placeholder={label}
                    aria-autocomplete='list'
                    aria-expanded='true'
                    aria-controls={`${id}-options`}
                    aria-activedescendant={
                        active ? `${id}-option-${activeIndex}` : undefined
                    }
                    autoComplete='off'
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                        if (
                            event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp'
                        ) {
                            event.preventDefault();
                            event.stopPropagation();
                            move(event.key === 'ArrowDown' ? 1 : -1);
                        } else if (
                            event.key === 'Enter' &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            if (active && !active.disabled) {
                                onSelect(active.value);
                            }
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            onClose();
                        }
                    }}
                />
                {query !== '' && (
                    <button
                        type='button'
                        aria-label={t.clearSearch}
                        onClick={() => {
                            setQuery('');
                            setActiveIndex(0);
                            inputRef.current?.focus();
                        }}
                    >
                        <X size={20} aria-hidden />
                    </button>
                )}
            </div>
            <div
                ref={listRef}
                className='settings-dropdown-options'
                id={`${id}-options`}
                role='listbox'
                aria-label={label}
            >
                {results.map((option, index) => (
                    <button
                        key={option.value}
                        id={`${id}-option-${index}`}
                        className='settings-dropdown-option'
                        role='option'
                        type='button'
                        tabIndex={-1}
                        disabled={option.disabled}
                        aria-selected={option.value === value}
                        data-active={index === activeIndex}
                        onMouseDown={(event) => {
                            event.preventDefault();
                        }}
                        onClick={() => {
                            onSelect(option.value);
                        }}
                    >
                        <span className='settings-option-label'>
                            {option.label}
                        </span>
                        {option.value === value && (
                            <Check size={16} aria-hidden />
                        )}
                    </button>
                ))}
                {results.length === 0 && (
                    <p className='settings-dropdown-empty' role='status'>
                        {t.keybindSearchEmpty}
                    </p>
                )}
            </div>
        </>
    );
};
