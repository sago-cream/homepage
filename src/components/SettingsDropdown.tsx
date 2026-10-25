import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    autoUpdate,
    flip,
    FloatingFocusManager,
    FloatingPortal,
    offset,
    shift,
    size,
    useDismiss,
    useFloating,
    useInteractions,
} from '@floating-ui/react';
import { Check, ChevronDown } from 'lucide-react';

export interface SettingsDropdownOption {
    readonly disabled?: boolean;
    readonly label: string;
    readonly searchText?: string;
    readonly value: string;
}

interface SettingsDropdownProps {
    disabled?: boolean;
    id: string;
    isOpen: boolean;
    labelledBy: string;
    onChange: (value: string) => void;
    onOpenChange: (isOpen: boolean) => void;
    options: SettingsDropdownOption[];
    value: string;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
    disabled = false,
    id,
    isOpen,
    labelledBy,
    onChange,
    onOpenChange,
    options,
    value,
}) => {
    const selectedOption =
        options.find((option) => option.value === value) ?? options[0];
    const [activeOption, setActiveOption] = useState(() =>
        Math.max(
            0,
            options.findIndex((option) => option.value === value)
        )
    );
    const typeaheadRef = useRef('');
    const typeaheadTimeRef = useRef(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxRef = useRef<HTMLDivElement>(null);
    const { refs, context, floatingStyles } = useFloating({
        open: isOpen,
        onOpenChange,
        placement: 'bottom-end',
        strategy: 'fixed',
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(4),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
            size({
                padding: 8,
                apply({ rects, availableHeight, elements }) {
                    const dropdown = elements.floating;
                    dropdown.style.width = `${rects.reference.width}px`;
                    dropdown.style.maxHeight = `${Math.min(320, Math.max(0, availableHeight))}px`;
                },
            }),
        ],
    });
    const { getReferenceProps, getFloatingProps } = useInteractions([
        useDismiss(context, { ancestorScroll: true }),
    ]);
    const setTriggerRef = useCallback(
        (element: HTMLButtonElement | null) => {
            triggerRef.current = element;
            refs.setReference(element);
        },
        [refs]
    );
    const setListboxRef = useCallback(
        (element: HTMLDivElement | null) => {
            listboxRef.current = element;
            refs.setFloating(element);
        },
        [refs]
    );

    const closeAndFocusTrigger = useCallback(() => {
        onOpenChange(false);
        triggerRef.current?.focus();
    }, [onOpenChange]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const selectedOptionButton =
            listboxRef.current?.querySelector<HTMLButtonElement>(
                '[aria-selected="true"]:not(:disabled)'
            );
        const firstOption =
            listboxRef.current?.querySelector<HTMLButtonElement>(
                'button:not(:disabled)'
            );
        (selectedOptionButton ?? firstOption)?.focus();
    }, [isOpen, context.elements.floating]);

    const searchMatchingOption = useCallback(
        (key: string) => {
            const now = Date.now();
            if (now - typeaheadTimeRef.current > 700) {
                typeaheadRef.current = '';
            }

            typeaheadRef.current =
                `${typeaheadRef.current}${key}`.toLowerCase();
            typeaheadTimeRef.current = now;

            const matchingOption = options.find((option) => {
                if (option.disabled) {
                    return false;
                }

                const searchText = option.searchText ?? option.label;

                return searchText
                    .toLowerCase()
                    .startsWith(typeaheadRef.current);
            });

            if (matchingOption !== undefined) {
                onChange(matchingOption.value);
                closeAndFocusTrigger();
            }
        },
        [closeAndFocusTrigger, onChange, options]
    );

    return (
        <span
            className={['settings-select-control', isOpen && 'open']
                .filter(Boolean)
                .join(' ')}
        >
            <button
                ref={setTriggerRef}
                {...getReferenceProps()}
                className='settings-select'
                disabled={disabled}
                type='button'
                id={id}
                aria-haspopup='listbox'
                aria-expanded={isOpen}
                aria-controls={`${id}-listbox`}
                aria-labelledby={labelledBy}
                onClick={() => {
                    onOpenChange(!isOpen);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        onOpenChange(false);
                    }

                    if (event.key === 'ArrowDown' && !isOpen) {
                        event.preventDefault();
                        onOpenChange(true);
                    }

                    if (
                        event.key.length === 1 &&
                        !event.altKey &&
                        !event.ctrlKey &&
                        !event.metaKey
                    ) {
                        event.preventDefault();
                        searchMatchingOption(event.key);
                    }
                }}
            >
                <span className='settings-select-value'>
                    {selectedOption.label}
                </span>
                <ChevronDown
                    className='settings-select-chevron'
                    size={16}
                    aria-hidden
                />
            </button>
            {isOpen ? (
                <FloatingPortal
                    root={context.elements.domReference?.closest<HTMLDialogElement>(
                        'dialog'
                    )}
                >
                    <FloatingFocusManager
                        context={context}
                        modal={false}
                        initialFocus={-1}
                    >
                        <div
                            {...getFloatingProps()}
                            style={floatingStyles}
                            ref={setListboxRef}
                            className='settings-dropdown'
                            id={`${id}-listbox`}
                            role='listbox'
                            aria-labelledby={labelledBy}
                        >
                            {options.map((option, optionIndex) => {
                                const isSelected = option.value === value;

                                return (
                                    <button
                                        className='settings-dropdown-option'
                                        type='button'
                                        role='option'
                                        tabIndex={
                                            activeOption === optionIndex
                                                ? 0
                                                : -1
                                        }
                                        onFocus={() => {
                                            setActiveOption(optionIndex);
                                        }}
                                        aria-selected={isSelected}
                                        data-value={option.value}
                                        disabled={option.disabled}
                                        key={option.value}
                                        onClick={() => {
                                            if (option.disabled) {
                                                return;
                                            }

                                            onChange(option.value);
                                            closeAndFocusTrigger();
                                        }}
                                        onKeyDown={(event) => {
                                            if (
                                                [
                                                    'ArrowDown',
                                                    'ArrowUp',
                                                    'Home',
                                                    'End',
                                                ].includes(event.key)
                                            ) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                const enabled = [
                                                    ...(listboxRef.current?.querySelectorAll<HTMLButtonElement>(
                                                        'button:not(:disabled)'
                                                    ) ?? []),
                                                ];
                                                const index = enabled.indexOf(
                                                    event.currentTarget
                                                );
                                                let next =
                                                    event.key === 'ArrowDown'
                                                        ? (index + 1) %
                                                          enabled.length
                                                        : (index -
                                                              1 +
                                                              enabled.length) %
                                                          enabled.length;
                                                if (event.key === 'Home') {
                                                    next = 0;
                                                }
                                                if (event.key === 'End') {
                                                    next = enabled.length - 1;
                                                }
                                                enabled[next]?.focus();
                                            }
                                            if (event.key === 'Escape') {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                closeAndFocusTrigger();
                                            }
                                        }}
                                    >
                                        <span className='settings-option-label'>
                                            {option.label}
                                        </span>
                                        {isSelected ? (
                                            <Check
                                                className='settings-dropdown-check'
                                                size={16}
                                                aria-hidden
                                            />
                                        ) : undefined}
                                    </button>
                                );
                            })}
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            ) : undefined}
        </span>
    );
};
