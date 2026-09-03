import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    Check,
    ChevronDown,
    ChevronRight,
    Image,
    LayoutGrid,
    Monitor,
    Moon,
    Palette,
    Pencil,
    Rss,
    Settings,
    SlidersHorizontal,
    Sun,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { createPortal, flushSync } from 'react-dom';

import { isAppLocale, localeOptions } from '@/constants/i18n';
import { getLocationLabel, taiwanLocations } from '@/constants/taiwanLocations';
import type { AnimationMode, ThemeColor, ThemeMode } from '@/constants/theme';
import {
    animationStorageKey,
    defaultThemeColor,
    isAnimationMode,
    isThemeColor,
    isThemeMode,
    normalAnimationMode,
    skipAnimationMode,
    systemThemeQuery,
    themeColorOptions,
    themeColorStorageKey,
    themeResolvedStorageKey,
    themeStorageKey,
} from '@/constants/theme';
import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { WallpaperControls } from '@/hooks/useWallpaper';
import type { InitialAppPreferences } from '@/types/preferences';
import { isBrowser } from '@/utils/browserEnv';
import {
    clearPreferenceCookie,
    writePreferenceCookie,
} from '@/utils/preferenceCookies';
import { runThemeTransition } from '@/utils/themeTransition';
import { getCssUrlValue } from '@/utils/wallpaperStyle';
import { wallpaperAcceptedContentTypes } from '../../shared/wallpaper';
import { BookmarkManagerDialog } from './BookmarkManagerDialog';
import { FeedSettingsSection } from './FeedSettingsSection';

const myLocationOptionValue = 'my-location';

type SettingsSectionId = 'appearance' | 'preferences' | 'feeds' | 'content';

interface SettingsDropdownOption {
    readonly disabled?: boolean;
    readonly label: string;
    readonly searchText?: string;
    readonly value: string;
}

interface ThemeHydrationRoot extends HTMLElement {
    __homepageThemeHydrationObserver?: MutationObserver;
}

interface SettingsDropdownProps {
    id: string;
    isOpen: boolean;
    labelledBy: string;
    onChange: (value: string) => void;
    onOpenChange: (isOpen: boolean) => void;
    options: SettingsDropdownOption[];
    value: string;
}

const getInitialAnimationMode = (
    initialAnimationMode: AnimationMode
): AnimationMode => {
    if (!isBrowser()) {
        return initialAnimationMode;
    }

    const savedAnimationMode =
        globalThis.document.documentElement.dataset.animationMode ??
        globalThis.localStorage.getItem(animationStorageKey);

    return isAnimationMode(savedAnimationMode)
        ? savedAnimationMode
        : initialAnimationMode;
};

const getInitialThemeMode = (initialThemeMode: ThemeMode): ThemeMode => {
    if (!isBrowser()) {
        return initialThemeMode;
    }

    const savedThemeMode =
        globalThis.document.documentElement.dataset.themeMode ??
        globalThis.localStorage.getItem(themeStorageKey);

    return isThemeMode(savedThemeMode) ? savedThemeMode : initialThemeMode;
};

const getInitialThemeColor = (initialThemeColor: ThemeColor): ThemeColor => {
    if (!isBrowser()) {
        return initialThemeColor;
    }

    const savedThemeColor =
        globalThis.document.documentElement.dataset.themeColor ??
        globalThis.localStorage.getItem(themeColorStorageKey);

    return isThemeColor(savedThemeColor) ? savedThemeColor : initialThemeColor;
};

const getSystemTheme = (): Exclude<ThemeMode, 'system'> =>
    isBrowser() && globalThis.matchMedia(systemThemeQuery).matches
        ? 'dark'
        : 'light';

const resolveThemeMode = (
    themeMode: ThemeMode
): Exclude<ThemeMode, 'system'> =>
    themeMode === 'system' ? getSystemTheme() : themeMode;

const applyResolvedTheme = (
    theme: Exclude<ThemeMode, 'system'>,
    themeMode: ThemeMode
) => {
    const root = globalThis.document.documentElement;

    root.dataset.theme = theme;
    root.dataset.themeMode = themeMode;
    root.style.colorScheme = theme;
    writePreferenceCookie(themeResolvedStorageKey, theme);
};

const applyThemeMode = (themeMode: ThemeMode) => {
    globalThis.localStorage.setItem(themeStorageKey, themeMode);
    writePreferenceCookie(themeStorageKey, themeMode);
    applyResolvedTheme(resolveThemeMode(themeMode), themeMode);
};

const getThemeModeIcon = (themeMode: ThemeMode) => {
    if (themeMode === 'system') {
        return <Monitor className='icon' size={20} />;
    }

    return themeMode === 'dark' ? (
        <Moon className='icon' size={20} />
    ) : (
        <Sun className='icon' size={20} />
    );
};

const applyThemeColor = (themeColor: ThemeColor) => {
    const root = globalThis.document.documentElement;

    if (themeColor === defaultThemeColor) {
        delete root.dataset.themeColor;
        globalThis.localStorage.removeItem(themeColorStorageKey);
        clearPreferenceCookie(themeColorStorageKey);
        return;
    }

    root.dataset.themeColor = themeColor;
    globalThis.localStorage.setItem(themeColorStorageKey, themeColor);
    writePreferenceCookie(themeColorStorageKey, themeColor);
};

const releaseThemeHydrationGuard = () => {
    const root = globalThis.document.documentElement as ThemeHydrationRoot;

    root.__homepageThemeHydrationObserver?.disconnect();
    delete root.__homepageThemeHydrationObserver;
};

const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
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
    const typeaheadRef = useRef('');
    const typeaheadTimeRef = useRef(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxRef = useRef<HTMLDivElement>(null);

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
    }, [isOpen]);

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
                ref={triggerRef}
                className='settings-select'
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
                <div
                    ref={listboxRef}
                    className='settings-dropdown'
                    id={`${id}-listbox`}
                    role='listbox'
                    aria-labelledby={labelledBy}
                >
                    {options.map((option) => {
                        const isSelected = option.value === value;

                        return (
                            <button
                                className='settings-dropdown-option'
                                type='button'
                                role='option'
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
            ) : undefined}
        </span>
    );
};

interface SettingsMenuProps {
    bookmarkControls: BookmarkControls;
    closeSignal?: number;
    isOpen?: boolean;
    isTriggerHidden?: boolean;
    initialPreferences: InitialAppPreferences;
    onOpenChange?: (isOpen: boolean) => void;
    placement?: 'above' | 'below' | 'mobile';
    wallpaperControls?: WallpaperControls;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
    bookmarkControls,
    isOpen: controlledIsOpen,
    isTriggerHidden = false,
    initialPreferences,
    onOpenChange,
    placement = 'below',
    wallpaperControls,
}) => {
    const {
        isSyncingLocation,
        selectLocationId,
        selectedLocation,
        syncCurrentLocation,
    } = useTaiwanLocation({
        hasInitialLocationCookie: initialPreferences.hasLocationCookie,
        initialLocationId: initialPreferences.locationId,
    });
    const { locale, setLocale, t } = useLocale(initialPreferences.locale);
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isControlled = controlledIsOpen !== undefined;
    const isOpen = controlledIsOpen ?? internalIsOpen;
    const [themeMode, setThemeMode] = useState<ThemeMode>(
        initialPreferences.themeMode
    );
    const [hasHydratedThemePreferences, setHasHydratedThemePreferences] =
        useState(false);
    const [animationMode, setAnimationMode] = useState<AnimationMode>(() =>
        getInitialAnimationMode(initialPreferences.animationMode)
    );
    const [isBookmarkManagerOpen, setIsBookmarkManagerOpen] = useState(false);
    const [selectedThemeColor, setSelectedThemeColor] = useState<ThemeColor>(
        initialPreferences.themeColor
    );
    const [openDropdownId, setOpenDropdownId] = useState<string>();
    const [selectedSection, setSelectedSection] =
        useState<SettingsSectionId>('appearance');
    const openDropdownIdRef = useRef(openDropdownId);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const wallpaperInputRef = useRef<HTMLInputElement>(null);
    openDropdownIdRef.current = openDropdownId;

    const setMenuOpen = useCallback(
        (nextIsOpen: boolean) => {
            if (!isControlled) {
                setInternalIsOpen(nextIsOpen);
            }

            onOpenChange?.(nextIsOpen);
        },
        [isControlled, onOpenChange]
    );

    useLayoutEffect(() => {
        const initialThemeMode = getInitialThemeMode(
            initialPreferences.themeMode
        );
        const initialThemeColor = getInitialThemeColor(
            initialPreferences.themeColor
        );

        releaseThemeHydrationGuard();
        applyResolvedTheme(
            resolveThemeMode(initialThemeMode),
            initialThemeMode
        );
        applyThemeColor(initialThemeColor);
        setThemeMode(initialThemeMode);
        setSelectedThemeColor(initialThemeColor);
        setHasHydratedThemePreferences(true);
    }, [initialPreferences.themeColor, initialPreferences.themeMode]);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const previousOverflow = globalThis.document.body.style.overflow;
        const previouslyFocused = globalThis.document.activeElement;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (openDropdownIdRef.current !== undefined) {
                    setOpenDropdownId(undefined);
                    return;
                }
                setMenuOpen(false);
            }
        };

        globalThis.document.body.style.overflow = 'hidden';
        globalThis.document.addEventListener('keydown', onKeyDown);
        closeButtonRef.current?.focus();

        return () => {
            globalThis.document.body.style.overflow = previousOverflow;
            globalThis.document.removeEventListener('keydown', onKeyDown);

            if (
                previouslyFocused instanceof HTMLElement &&
                previouslyFocused.isConnected
            ) {
                previouslyFocused.focus();
            }
        };
    }, [isOpen, setMenuOpen]);

    useEffect(() => {
        if (!isOpen) {
            setOpenDropdownId(undefined);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!hasHydratedThemePreferences || themeMode !== 'system') {
            return undefined;
        }

        const mediaQuery = globalThis.matchMedia(systemThemeQuery);
        const updateSystemTheme = () => {
            applyResolvedTheme(getSystemTheme(), 'system');
        };

        updateSystemTheme();
        mediaQuery.addEventListener('change', updateSystemTheme);

        return () => {
            mediaQuery.removeEventListener('change', updateSystemTheme);
        };
    }, [hasHydratedThemePreferences, themeMode]);

    const updateThemeMode = useCallback(
        (nextThemeMode: ThemeMode, button?: HTMLButtonElement) => {
            const root = globalThis.document.documentElement;
            const currentDarkMode =
                (root.dataset.theme ?? resolveThemeMode(themeMode)) === 'dark';
            const nextDarkMode = resolveThemeMode(nextThemeMode) === 'dark';
            let hasCommittedThemeMode = false;

            const commitThemeModeState = () => {
                if (hasCommittedThemeMode) {
                    return;
                }

                hasCommittedThemeMode = true;
                flushSync(() => {
                    setThemeMode(nextThemeMode);
                });
            };

            if (button !== undefined && currentDarkMode !== nextDarkMode) {
                runThemeTransition({
                    button,
                    isDarkMode: currentDarkMode,
                    nextDarkMode,
                    onCommit: commitThemeModeState,
                    themeMode: nextThemeMode,
                });
            } else {
                applyThemeMode(nextThemeMode);
                setThemeMode(nextThemeMode);
            }
        },
        [themeMode]
    );

    const selectThemeColor = useCallback((themeColor: ThemeColor) => {
        applyThemeColor(themeColor);
        setSelectedThemeColor(themeColor);
    }, []);

    const updateAnimationMode = useCallback(
        (nextAnimationMode: AnimationMode) => {
            globalThis.document.documentElement.dataset.animationMode =
                nextAnimationMode;
            globalThis.localStorage.setItem(
                animationStorageKey,
                nextAnimationMode
            );
            writePreferenceCookie(animationStorageKey, nextAnimationMode);
            setAnimationMode(nextAnimationMode);
        },
        []
    );

    const themeModeOptions: SettingsDropdownOption[] = [
        { label: t.system, value: 'system' },
        { label: t.light, value: 'light' },
        { label: t.dark, value: 'dark' },
    ];

    const locationOptions: SettingsDropdownOption[] = [
        {
            disabled: isSyncingLocation,
            label: isSyncingLocation ? t.syncing : t.myLocation,
            searchText: 'my location',
            value: myLocationOptionValue,
        },
        ...taiwanLocations.map((location) => ({
            label: getLocationLabel(location, locale),
            searchText: getLocationLabel(location, 'en'),
            value: location.id,
        })),
    ];

    const languageOptions: SettingsDropdownOption[] = localeOptions.map(
        (option) => ({
            label: option.label,
            value: option.value,
        })
    );
    const dropdownOptionGroups: ReadonlyArray<
        readonly SettingsDropdownOption[]
    > = [locationOptions, languageOptions];
    const maxDropdownValueLength = Math.max(
        ...dropdownOptionGroups.flatMap((options) =>
            options.map((option) => option.label.length)
        )
    );
    const settingsMenuStyle = {
        '--settings-select-width': `max(10rem, calc(${maxDropdownValueLength}ch + 3rem))`,
    } as React.CSSProperties & Record<'--settings-select-width', string>;
    const settingsSections = [
        {
            icon: Palette,
            id: 'appearance',
            label: t.appearance,
        },
        {
            icon: SlidersHorizontal,
            id: 'preferences',
            label: t.preferences,
        },
        {
            icon: Rss,
            id: 'feeds',
            label: t.feeds,
        },
        {
            icon: LayoutGrid,
            id: 'content',
            label: t.content,
        },
    ] satisfies ReadonlyArray<{
        icon: typeof Palette;
        id: SettingsSectionId;
        label: string;
    }>;

    const getDropdownOpenHandler = (id: string) => (nextIsOpen: boolean) => {
        setOpenDropdownId(nextIsOpen ? id : undefined);
    };
    const wallpaperProgress =
        wallpaperControls?.progress === undefined
            ? undefined
            : Math.round(wallpaperControls.progress);

    const settingsPage =
        isOpen && isBrowser()
            ? createPortal(
                  <div
                      className='settings-page-backdrop'
                      onMouseDown={(event) => {
                          event.stopPropagation();
                      }}
                  >
                      <section
                          className='settings-page'
                          role='dialog'
                          aria-modal='true'
                          aria-labelledby='settings-page-title'
                          style={settingsMenuStyle}
                          onClickCapture={(event) => {
                              const { target } = event;

                              if (
                                  target instanceof Element &&
                                  !target.closest('.settings-select-control')
                              ) {
                                  setOpenDropdownId(undefined);
                              }
                          }}
                      >
                          <header className='settings-page-header'>
                              <div className='settings-page-heading'>
                                  <h1 id='settings-page-title'>{t.settings}</h1>
                                  <p>{t.settingsDescription}</p>
                              </div>
                              <button
                                  className='settings-page-close'
                                  type='button'
                                  aria-label={t.cancel}
                                  ref={closeButtonRef}
                                  onClick={() => {
                                      setMenuOpen(false);
                                  }}
                              >
                                  <X className='icon' size={20} />
                              </button>
                          </header>

                          <div className='settings-page-content'>
                              <nav
                                  className='settings-page-sidebar'
                                  aria-label={t.settings}
                              >
                                  {settingsSections.map((section) => {
                                      const Icon = section.icon;
                                      const isSelected =
                                          selectedSection === section.id;

                                      return (
                                          <button
                                              className='settings-page-sidebar-button'
                                              key={section.id}
                                              type='button'
                                              aria-current={
                                                  isSelected
                                                      ? 'page'
                                                      : undefined
                                              }
                                              onClick={() => {
                                                  setOpenDropdownId(undefined);
                                                  setSelectedSection(
                                                      section.id
                                                  );
                                              }}
                                          >
                                              <Icon
                                                  className='icon'
                                                  size={18}
                                                  aria-hidden
                                              />
                                              <span>{section.label}</span>
                                          </button>
                                      );
                                  })}
                              </nav>

                              <section
                                  className='settings-page-section'
                                  hidden={selectedSection !== 'appearance'}
                              >
                                  <div className='settings-section-heading'>
                                      <h2>{t.appearance}</h2>
                                      <p>{t.appearanceDescription}</p>
                                  </div>
                                  <div className='settings-card'>
                                      <div className='settings-row settings-stacked-row'>
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.theme}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {t.themeDescription}
                                              </span>
                                          </div>
                                          <div
                                              className='settings-choice-group settings-theme-group'
                                              role='radiogroup'
                                              aria-label={t.theme}
                                          >
                                              {themeModeOptions.map(
                                                  (option) => {
                                                      const isSelected =
                                                          option.value ===
                                                          themeMode;

                                                      return (
                                                          <button
                                                              className={[
                                                                  'settings-theme-choice',
                                                                  isSelected &&
                                                                      'selected',
                                                              ]
                                                                  .filter(
                                                                      Boolean
                                                                  )
                                                                  .join(' ')}
                                                              key={option.value}
                                                              type='button'
                                                              role='radio'
                                                              aria-checked={
                                                                  isSelected
                                                              }
                                                              onClick={(
                                                                  event
                                                              ) => {
                                                                  if (
                                                                      isThemeMode(
                                                                          option.value
                                                                      )
                                                                  ) {
                                                                      updateThemeMode(
                                                                          option.value,
                                                                          event.currentTarget
                                                                      );
                                                                  }
                                                              }}
                                                          >
                                                              {getThemeModeIcon(
                                                                  option.value as ThemeMode
                                                              )}
                                                              <span>
                                                                  {option.label}
                                                              </span>
                                                          </button>
                                                      );
                                                  }
                                              )}
                                          </div>
                                      </div>

                                      <div className='settings-row settings-stacked-row'>
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.accent}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {t.accentDescription}
                                              </span>
                                          </div>
                                          <div
                                              className='settings-choice-group settings-accent-group'
                                              role='radiogroup'
                                              aria-label={t.accent}
                                          >
                                              {themeColorOptions.map(
                                                  (option) => {
                                                      const isSelected =
                                                          option.value ===
                                                          selectedThemeColor;

                                                      return (
                                                          <button
                                                              className={[
                                                                  'settings-accent-choice',
                                                                  `settings-swatch-${option.value}`,
                                                                  isSelected &&
                                                                      'selected',
                                                              ]
                                                                  .filter(
                                                                      Boolean
                                                                  )
                                                                  .join(' ')}
                                                              key={option.value}
                                                              type='button'
                                                              role='radio'
                                                              aria-checked={
                                                                  isSelected
                                                              }
                                                              onClick={() => {
                                                                  selectThemeColor(
                                                                      option.value
                                                                  );
                                                              }}
                                                          >
                                                              <span
                                                                  className='settings-accent-swatch'
                                                                  aria-hidden
                                                              />
                                                              <span>
                                                                  {
                                                                      t[
                                                                          option
                                                                              .labelKey
                                                                      ]
                                                                  }
                                                              </span>
                                                              {isSelected ? (
                                                                  <Check
                                                                      className='icon'
                                                                      size={16}
                                                                      aria-hidden
                                                                  />
                                                              ) : undefined}
                                                          </button>
                                                      );
                                                  }
                                              )}
                                          </div>
                                      </div>

                                      {wallpaperControls ===
                                      undefined ? undefined : (
                                          <div className='settings-row settings-wallpaper-row'>
                                              <div className='settings-row-copy'>
                                                  <span className='settings-row-label'>
                                                      {t.wallpaper}
                                                  </span>
                                                  <span className='settings-row-description'>
                                                      {wallpaperControls.isAvailable
                                                          ? t.wallpaperDescription
                                                          : t.wallpaperUnavailable}
                                                  </span>
                                              </div>
                                              <div className='settings-wallpaper-actions'>
                                                  <input
                                                      className='settings-wallpaper-input'
                                                      type='file'
                                                      accept={wallpaperAcceptedContentTypes.join(
                                                          ','
                                                      )}
                                                      ref={wallpaperInputRef}
                                                      onChange={(event) => {
                                                          const file =
                                                              event
                                                                  .currentTarget
                                                                  .files?.[0];
                                                          if (
                                                              wallpaperInputRef.current !==
                                                              null
                                                          ) {
                                                              wallpaperInputRef.current.value =
                                                                  '';
                                                          }

                                                          if (
                                                              file !== undefined
                                                          ) {
                                                              wallpaperControls
                                                                  .uploadWallpaper(
                                                                      file
                                                                  )
                                                                  .catch(
                                                                      () =>
                                                                          undefined
                                                                  );
                                                          }
                                                      }}
                                                  />
                                                  <button
                                                      className={[
                                                          'settings-wallpaper-preview',
                                                          wallpaperControls.wallpaper !==
                                                              undefined &&
                                                              'has-wallpaper',
                                                      ]
                                                          .filter(Boolean)
                                                          .join(' ')}
                                                      type='button'
                                                      aria-label={
                                                          t.uploadWallpaper
                                                      }
                                                      style={
                                                          wallpaperControls.wallpaper ===
                                                          undefined
                                                              ? undefined
                                                              : ({
                                                                    '--settings-wallpaper-preview':
                                                                        getCssUrlValue(
                                                                            wallpaperControls
                                                                                .wallpaper
                                                                                .url
                                                                        ),
                                                                } as React.CSSProperties &
                                                                    Record<
                                                                        '--settings-wallpaper-preview',
                                                                        string
                                                                    >)
                                                      }
                                                      disabled={
                                                          !wallpaperControls.isAvailable ||
                                                          wallpaperControls.isBusy
                                                      }
                                                      onClick={() => {
                                                          wallpaperInputRef.current?.click();
                                                      }}
                                                  >
                                                      <Image
                                                          className='icon'
                                                          size={20}
                                                      />
                                                  </button>
                                                  <button
                                                      className='settings-action-button'
                                                      type='button'
                                                      disabled={
                                                          !wallpaperControls.isAvailable ||
                                                          wallpaperControls.isBusy
                                                      }
                                                      onClick={() => {
                                                          wallpaperInputRef.current?.click();
                                                      }}
                                                  >
                                                      <Upload
                                                          className='icon'
                                                          size={16}
                                                      />
                                                      <span>
                                                          {t.uploadWallpaper}
                                                      </span>
                                                  </button>
                                                  {wallpaperControls.wallpaper ===
                                                  undefined ? undefined : (
                                                      <button
                                                          className='settings-icon-button settings-danger-button'
                                                          type='button'
                                                          aria-label={
                                                              t.removeWallpaper
                                                          }
                                                          disabled={
                                                              wallpaperControls.isBusy
                                                          }
                                                          onClick={() => {
                                                              wallpaperControls
                                                                  .clearWallpaper()
                                                                  .catch(
                                                                      () =>
                                                                          undefined
                                                                  );
                                                          }}
                                                      >
                                                          <Trash2
                                                              className='icon'
                                                              size={16}
                                                          />
                                                      </button>
                                                  )}
                                              </div>
                                              {wallpaperControls.isBusy ? (
                                                  <div
                                                      className='settings-wallpaper-meter'
                                                      role='progressbar'
                                                      aria-label={
                                                          t.wallpaperUploading
                                                      }
                                                      aria-valuemin={0}
                                                      aria-valuemax={100}
                                                      aria-valuenow={
                                                          wallpaperProgress ?? 0
                                                      }
                                                      style={
                                                          {
                                                              '--settings-wallpaper-progress': `${wallpaperProgress ?? 0}%`,
                                                          } as React.CSSProperties &
                                                              Record<
                                                                  '--settings-wallpaper-progress',
                                                                  string
                                                              >
                                                      }
                                                  />
                                              ) : undefined}
                                              {wallpaperControls.error ===
                                              undefined ? undefined : (
                                                  <div
                                                      className='settings-wallpaper-status'
                                                      role='status'
                                                  >
                                                      {wallpaperControls.error}
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      <div className='settings-row'>
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.animations}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {animationMode ===
                                                  normalAnimationMode
                                                      ? t.useNormalAnimations
                                                      : t.skipRiseAnimations}
                                              </span>
                                          </div>
                                          <button
                                              className='settings-animation-switch'
                                              type='button'
                                              role='switch'
                                              aria-checked={
                                                  animationMode ===
                                                  normalAnimationMode
                                              }
                                              aria-label={t.animations}
                                              onClick={() => {
                                                  updateAnimationMode(
                                                      animationMode ===
                                                          normalAnimationMode
                                                          ? skipAnimationMode
                                                          : normalAnimationMode
                                                  );
                                              }}
                                          >
                                              <span
                                                  className='settings-switch-track'
                                                  aria-hidden
                                              >
                                                  <span className='settings-switch-thumb' />
                                              </span>
                                          </button>
                                      </div>
                                  </div>
                              </section>

                              <section
                                  className='settings-page-section'
                                  hidden={selectedSection !== 'preferences'}
                              >
                                  <div className='settings-section-heading'>
                                      <h2>{t.preferences}</h2>
                                      <p>{t.preferencesDescription}</p>
                                  </div>
                                  <div className='settings-card'>
                                      <div className='settings-row settings-select-row'>
                                          <div className='settings-row-copy'>
                                              <span
                                                  className='settings-row-label'
                                                  id='location-picker-label'
                                              >
                                                  {t.location}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {t.locationDescription}
                                              </span>
                                          </div>
                                          <SettingsDropdown
                                              id='location-picker'
                                              labelledBy='location-picker-label'
                                              value={selectedLocation.id}
                                              options={locationOptions}
                                              isOpen={
                                                  openDropdownId ===
                                                  'location-picker'
                                              }
                                              onOpenChange={getDropdownOpenHandler(
                                                  'location-picker'
                                              )}
                                              onChange={(nextLocationId) => {
                                                  if (
                                                      nextLocationId ===
                                                      myLocationOptionValue
                                                  ) {
                                                      syncCurrentLocation();
                                                      return;
                                                  }

                                                  selectLocationId(
                                                      nextLocationId
                                                  );
                                              }}
                                          />
                                      </div>

                                      <div className='settings-row settings-select-row'>
                                          <div className='settings-row-copy'>
                                              <span
                                                  className='settings-row-label'
                                                  id='language-picker-label'
                                              >
                                                  {t.language}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {t.languageDescription}
                                              </span>
                                          </div>
                                          <SettingsDropdown
                                              id='language-picker'
                                              labelledBy='language-picker-label'
                                              value={locale}
                                              options={languageOptions}
                                              isOpen={
                                                  openDropdownId ===
                                                  'language-picker'
                                              }
                                              onOpenChange={getDropdownOpenHandler(
                                                  'language-picker'
                                              )}
                                              onChange={(nextLocale) => {
                                                  if (isAppLocale(nextLocale)) {
                                                      setLocale(nextLocale);
                                                  }
                                              }}
                                          />
                                      </div>
                                  </div>
                              </section>

                              {selectedSection === 'feeds' ? (
                                  <FeedSettingsSection
                                      bookmarkControls={bookmarkControls}
                                  />
                              ) : undefined}

                              <section
                                  className='settings-page-section'
                                  hidden={selectedSection !== 'content'}
                              >
                                  <div className='settings-section-heading'>
                                      <h2>{t.content}</h2>
                                      <p>{t.contentDescription}</p>
                                  </div>
                                  <div className='settings-card'>
                                      <button
                                          className='settings-row settings-navigation-row'
                                          type='button'
                                          disabled={!bookmarkControls.canEdit}
                                          onClick={() => {
                                              setIsBookmarkManagerOpen(true);
                                              setMenuOpen(false);
                                          }}
                                      >
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.bookmarks}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {t.bookmarksDescription}
                                              </span>
                                          </div>
                                          <span className='settings-navigation-action'>
                                              <Pencil
                                                  className='icon'
                                                  size={16}
                                                  aria-hidden
                                              />
                                              <span>{t.manageBookmarks}</span>
                                              <ChevronRight
                                                  className='icon'
                                                  size={16}
                                                  aria-hidden
                                              />
                                          </span>
                                      </button>
                                  </div>
                              </section>
                          </div>
                      </section>
                  </div>,
                  globalThis.document.body
              )
            : undefined;

    return (
        <div className={`settings-control ${placement}`}>
            {isTriggerHidden ? undefined : (
                <button
                    className='settings-trigger'
                    type='button'
                    aria-label={t.settings}
                    aria-expanded={isOpen}
                    onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpen(!isOpen);
                    }}
                >
                    <span className='settings-trigger-icons' aria-hidden>
                        <Settings
                            className='settings-trigger-icon settings-trigger-icon-settings'
                            size={20}
                        />
                        <X
                            className='settings-trigger-icon settings-trigger-icon-close'
                            size={20}
                        />
                    </span>
                </button>
            )}
            {settingsPage}
            {isBookmarkManagerOpen ? (
                <BookmarkManagerDialog
                    bookmarkControls={bookmarkControls}
                    onClose={() => {
                        setIsBookmarkManagerOpen(false);
                    }}
                />
            ) : undefined}
        </div>
    );
};
