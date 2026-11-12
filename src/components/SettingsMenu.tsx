import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    ArrowLeft,
    Bookmark,
    ChevronRight,
    Keyboard,
    Layers,
    MapPin,
    MapPinOff,
    Monitor,
    Moon,
    Palette,
    Search,
    Settings,
    SlidersHorizontal,
    Sun,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';

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
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { WallpaperControls } from '@/hooks/useWallpaper';
import type { InitialAppPreferences } from '@/types/preferences';
import { isBrowser } from '@/utils/browserEnv';
import {
    readStorageValue,
    removeStorageValue,
    writeStorageValue,
} from '@/utils/browserStorage';
import {
    clearPreferenceCookie,
    writePreferenceCookie,
} from '@/utils/preferenceCookies';
import {
    getSettingsSection,
    settingsSectionPaths,
} from '@/utils/settingsNavigation';
import type { SettingsSectionId } from '@/utils/settingsNavigation';
import { getSettingsSearchResults } from '@/utils/settingsSearch';
import type { SettingsSearchResult } from '@/utils/settingsSearch';
import { getCssUrlValue } from '@/utils/wallpaperStyle';
import { wallpaperAcceptedContentTypes } from '../../shared/wallpaper';
import { BookmarkManager } from './BookmarkManager';
import type { BookmarkManagerHandle } from './BookmarkManager';
import { KeybindSettingsSection } from './KeybindSettingsSection';
import { QuickLaunchSettingsSection } from './QuickLaunchSettingsSection';
import { SettingsChoice } from './SettingsChoice';
import { SettingsDropdown } from './SettingsDropdown';
import type { SettingsDropdownOption } from './SettingsDropdown';
import { TooltipIconButton } from './TooltipIconButton';

interface ThemeHydrationRoot extends HTMLElement {
    __homepageThemeHydrationObserver?: MutationObserver;
}

const getInitialAnimationMode = (
    initialAnimationMode: AnimationMode
): AnimationMode => {
    if (!isBrowser()) {
        return initialAnimationMode;
    }

    const savedAnimationMode =
        globalThis.document.documentElement.dataset.animationMode ??
        readStorageValue(animationStorageKey);

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
        readStorageValue(themeStorageKey);

    return isThemeMode(savedThemeMode) ? savedThemeMode : initialThemeMode;
};

const getInitialThemeColor = (initialThemeColor: ThemeColor): ThemeColor => {
    if (!isBrowser()) {
        return initialThemeColor;
    }

    const savedThemeColor =
        globalThis.document.documentElement.dataset.themeColor ??
        readStorageValue(themeColorStorageKey);

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
    writeStorageValue(themeStorageKey, themeMode);
    writePreferenceCookie(themeStorageKey, themeMode);
    applyResolvedTheme(resolveThemeMode(themeMode), themeMode);
};

const getThemeModeIcon = (themeMode: ThemeMode) => {
    if (themeMode === 'system') {
        return <Monitor className='icon' />;
    }

    return themeMode === 'dark' ? (
        <Moon className='icon' />
    ) : (
        <Sun className='icon' />
    );
};

const applyThemeColor = (themeColor: ThemeColor) => {
    const root = globalThis.document.documentElement;

    if (themeColor === defaultThemeColor) {
        delete root.dataset.themeColor;
        removeStorageValue(themeColorStorageKey);
        clearPreferenceCookie(themeColorStorageKey);
        return;
    }

    root.dataset.themeColor = themeColor;
    writeStorageValue(themeColorStorageKey, themeColor);
    writePreferenceCookie(themeColorStorageKey, themeColor);
};

const releaseThemeHydrationGuard = () => {
    const root = globalThis.document.documentElement as ThemeHydrationRoot;

    root.__homepageThemeHydrationObserver?.disconnect();
    delete root.__homepageThemeHydrationObserver;
};

interface SettingsMenuProps {
    bookmarkControls: BookmarkControls;
    closeSignal?: number;
    isOpen?: boolean;
    isTriggerHidden?: boolean;
    initialPreferences: InitialAppPreferences;
    onOpenChange?: (isOpen: boolean) => void;
    onSignIn?: () => void;
    placement?: 'above' | 'below' | 'mobile';
    wallpaperControls?: WallpaperControls;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
    bookmarkControls,
    isOpen: controlledIsOpen,
    isTriggerHidden = false,
    initialPreferences,
    onOpenChange,
    onSignIn,
    placement = 'below',
    wallpaperControls,
}) => {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const routeSection = getSettingsSection(pathname);
    const selectedSection = routeSection ?? 'content';
    const isSettingsIndex = pathname === '/settings';
    const isCompactViewport = useMediaQuery('(width < 48rem)');
    const isMobileDetail = isCompactViewport && !isSettingsIndex;
    const bookmarksHrefRef = useRef<string>(settingsSectionPaths.content);
    if (routeSection === 'content') {
        bookmarksHrefRef.current = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`;
    }
    const setSelectedSection = useCallback(
        (section: SettingsSectionId) => {
            router.push(settingsSectionPaths[section], { scroll: false });
        },
        [router]
    );
    const {
        isSyncingLocation,
        selectLocationId,
        selectedLocation,
        isTrackingLocation,
        isGeolocationAvailable,
        locationTrackingFailed,
        toggleLocationTracking,
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
    const bookmarkManagerRef = useRef<BookmarkManagerHandle>(null);
    const [selectedThemeColor, setSelectedThemeColor] = useState<ThemeColor>(
        initialPreferences.themeColor
    );
    const [openDropdownId, setOpenDropdownId] = useState<string>();
    const [settingsQuery, setSettingsQuery] = useState('');
    const settingsSearchRef = useRef<HTMLInputElement>(null);
    const navigationRef = useRef<HTMLElement>(null);
    const [pendingSearchResult, setPendingSearchResult] =
        useState<SettingsSearchResult>();
    const openDropdownIdRef = useRef(openDropdownId);
    const settingsTitleRef = useRef<HTMLHeadingElement>(null);
    const returnFocusRef = useRef<HTMLElement | undefined>(undefined);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const controlRef = useRef<HTMLDivElement>(null);
    const wallpaperInputRef = useRef<HTMLInputElement>(null);
    const categoryBackRef = useRef<HTMLButtonElement>(null);
    const pendingSettingsPathRef = useRef<string | undefined>(undefined);
    const lastSectionRef = useRef<SettingsSectionId | undefined>(routeSection);
    const isMobileDetailRef = useRef(isMobileDetail);
    const focusedViewRef = useRef<string | undefined>(undefined);
    openDropdownIdRef.current = openDropdownId;
    isMobileDetailRef.current = isMobileDetail;
    if (routeSection !== undefined) {
        lastSectionRef.current = routeSection;
    }

    useEffect(() => {
        if (isCompactViewport && routeSection === 'keybinds') {
            router.replace('/settings', { scroll: false });
        }
    }, [isCompactViewport, routeSection, router]);

    useLayoutEffect(() => {
        const navigation = navigationRef.current;
        if (!navigation || settingsQuery.trim() !== '') {
            return undefined;
        }
        const revealSelectedSection = () => {
            navigation
                .querySelector('[aria-current="page"]')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };
        revealSelectedSection();
        const observer = new ResizeObserver(revealSelectedSection);
        observer.observe(navigation);
        return () => {
            observer.disconnect();
        };
    }, [isOpen, selectedSection, settingsQuery, locale]);

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

    const finishSettingsNavigation = useCallback(() => {
        const targetPath =
            pendingSettingsPathRef.current ??
            (isMobileDetailRef.current ? '/settings' : '/');
        pendingSettingsPathRef.current = undefined;
        if (targetPath === '/') {
            setMenuOpen(false);
        } else {
            setOpenDropdownId(undefined);
            setSettingsQuery('');
            router.push(targetPath, { scroll: false });
        }
    }, [router, setMenuOpen]);

    const requestSettingsNavigation = useCallback(
        (targetPath?: string) => {
            pendingSettingsPathRef.current = targetPath;
            if (bookmarkManagerRef.current === null) {
                finishSettingsNavigation();
            } else if (!bookmarkManagerRef.current.requestClose()) {
                setSelectedSection('content');
            }
        },
        [finishSettingsNavigation, setSelectedSection]
    );

    const requestSettingsClose = useCallback(() => {
        requestSettingsNavigation('/');
    }, [requestSettingsNavigation]);

    const requestSettingsCategories = useCallback(() => {
        requestSettingsNavigation('/settings');
    }, [requestSettingsNavigation]);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const previousOverflow = globalThis.document.body.style.overflow;
        const previouslyFocused = returnFocusRef.current;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                if (openDropdownIdRef.current !== undefined) {
                    setOpenDropdownId(undefined);
                    return;
                }
                if (isMobileDetailRef.current) {
                    requestSettingsCategories();
                } else {
                    requestSettingsClose();
                }
            }
        };

        globalThis.document.body.style.overflow = 'hidden';
        globalThis.document.addEventListener('keydown', onKeyDown);
        settingsTitleRef.current?.focus({ preventScroll: true });

        return () => {
            globalThis.document.body.style.overflow = previousOverflow;
            globalThis.document.removeEventListener('keydown', onKeyDown);

            if (
                previouslyFocused instanceof HTMLElement &&
                previouslyFocused.isConnected &&
                previouslyFocused.getClientRects().length > 0
            ) {
                previouslyFocused.focus();
            } else {
                const fallback =
                    triggerRef.current ??
                    controlRef.current
                        ?.closest('.user-floating-bar')
                        ?.querySelector<HTMLElement>('.user-menu-trigger');
                fallback?.focus();
            }
        };
    }, [isOpen, requestSettingsClose, requestSettingsCategories]);

    useLayoutEffect(() => {
        if (!isOpen) {
            focusedViewRef.current = undefined;
            return undefined;
        }
        const view = `${pathname}:${isCompactViewport}`;
        if (
            pendingSearchResult &&
            !isSettingsIndex &&
            selectedSection === pendingSearchResult.section
        ) {
            focusedViewRef.current = view;
            const frame = requestAnimationFrame(() => {
                const row = document.querySelector<HTMLElement>(
                    `.settings-page [data-setting="${pendingSearchResult.id}"]`
                );
                const control =
                    row?.querySelector<HTMLElement>('[aria-checked="true"]') ??
                    row?.querySelector<HTMLElement>(
                        '.settings-select:not(:disabled)'
                    ) ??
                    row?.querySelector<HTMLElement>(
                        'button:not(:disabled), input:not(:disabled)'
                    );
                row?.scrollIntoView({ block: 'nearest' });
                control?.focus({ preventScroll: true });
                setPendingSearchResult(undefined);
            });
            return () => {
                cancelAnimationFrame(frame);
            };
        }
        if (focusedViewRef.current === view) {
            return undefined;
        }
        focusedViewRef.current = view;
        if (isCompactViewport) {
            if (isSettingsIndex) {
                const selectedCategory =
                    navigationRef.current?.querySelector<HTMLElement>(
                        `[data-section="${lastSectionRef.current}"]`
                    );
                (selectedCategory ?? settingsTitleRef.current)?.focus({
                    preventScroll: true,
                });
            } else {
                const heading = [
                    ...document.querySelectorAll<HTMLElement>(
                        '.settings-page-section h2'
                    ),
                ].find((element) => element.getClientRects().length > 0);
                if (heading) {
                    heading.tabIndex = -1;
                    heading.classList.add('settings-page-title');
                    heading.focus({ preventScroll: true });
                } else {
                    categoryBackRef.current?.focus({ preventScroll: true });
                }
            }
        }
        return undefined;
    }, [
        isOpen,
        isCompactViewport,
        isSettingsIndex,
        selectedSection,
        pathname,
        pendingSearchResult,
    ]);

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

    useEffect(() => {
        const root = globalThis.document.documentElement;
        const observer = new MutationObserver(() => {
            if (isThemeMode(root.dataset.themeMode)) {
                setThemeMode(root.dataset.themeMode);
            }
        });
        observer.observe(root, {
            attributes: true,
            attributeFilter: ['data-theme-mode'],
        });
        return () => {
            observer.disconnect();
        };
    }, []);

    const updateThemeMode = useCallback((nextThemeMode: ThemeMode) => {
        applyThemeMode(nextThemeMode);
        setThemeMode(nextThemeMode);
    }, []);

    const selectThemeColor = useCallback((themeColor: ThemeColor) => {
        applyThemeColor(themeColor);
        setSelectedThemeColor(themeColor);
    }, []);

    const updateAnimationMode = useCallback(
        (nextAnimationMode: AnimationMode) => {
            globalThis.document.documentElement.dataset.animationMode =
                nextAnimationMode;
            writeStorageValue(animationStorageKey, nextAnimationMode);
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

    let locationDescription = t.locationDescription as string;
    if (isTrackingLocation) {
        locationDescription = t.locationTrackingDescription;
    }
    if (isSyncingLocation) {
        locationDescription = t.syncing;
    }
    if (locationTrackingFailed) {
        locationDescription = t.locationTrackingFailed;
    }

    const locationOptions: SettingsDropdownOption[] = taiwanLocations.map(
        (location) => ({
            label: getLocationLabel(location, locale),
            searchText: getLocationLabel(location, 'en'),
            value: location.id,
        })
    );

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
            icon: Bookmark,
            id: 'content',
            label: t.bookmarks,
        },
        { icon: Layers, id: 'quickLaunch', label: t.quickLaunch },
        {
            icon: Keyboard,
            id: 'keybinds',
            label: t.keybinds,
        },
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
    ] satisfies ReadonlyArray<{
        icon: typeof Palette;
        id: SettingsSectionId;
        label: string;
    }>;
    const visibleSettingsSections = settingsSections.filter(
        (section) => !isCompactViewport || section.id !== 'keybinds'
    );
    const searchResults = getSettingsSearchResults(
        t,
        settingsQuery,
        locationOptions.map((option) => option.label).join(' ')
    ).filter((result) => !isCompactViewport || result.section !== 'keybinds');
    const isSearching = settingsQuery.trim() !== '';
    const openSearchResult = (result: SettingsSearchResult) => {
        setOpenDropdownId(undefined);
        setSettingsQuery('');
        setPendingSearchResult(result);
        if (routeSection !== result.section) {
            setSelectedSection(result.section);
        }
    };

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
                      onMouseMove={(event) => {
                          event.stopPropagation();
                      }}
                      onMouseLeave={(event) => {
                          event.stopPropagation();
                      }}
                      onMouseDown={(event) => {
                          event.stopPropagation();
                      }}
                  >
                      <dialog
                          ref={(element) => {
                              if (element && !element.open) {
                                  const active = document.activeElement;
                                  returnFocusRef.current =
                                      active instanceof HTMLElement &&
                                      active !== document.body &&
                                      !active.closest('.settings-page')
                                          ? active
                                          : (triggerRef.current ??
                                            controlRef.current
                                                ?.closest('.user-floating-bar')
                                                ?.querySelector<HTMLElement>(
                                                    '.user-menu-trigger'
                                                ) ??
                                            undefined);
                                  element.showModal();
                              }
                          }}
                          onCancel={(event) => {
                              if (event.target === event.currentTarget) {
                                  event.preventDefault();
                                  if (isMobileDetail) {
                                      requestSettingsCategories();
                                  } else {
                                      requestSettingsClose();
                                  }
                              }
                          }}
                          className='settings-page'
                          role='dialog'
                          aria-modal='true'
                          aria-labelledby='settings-page-title'
                          style={settingsMenuStyle}
                          onClickCapture={(event) => {
                              const { target } = event;

                              if (
                                  target instanceof Element &&
                                  !target.closest(
                                      '.settings-select-control, .settings-dropdown'
                                  )
                              ) {
                                  setOpenDropdownId(undefined);
                              }
                          }}
                      >
                          <div
                              className='settings-page-content'
                              data-view={
                                  isSettingsIndex ? 'categories' : 'detail'
                              }
                          >
                              <header className='settings-mobile-header'>
                                  <button
                                      ref={categoryBackRef}
                                      className='settings-page-sidebar-button settings-category-back'
                                      type='button'
                                      aria-label={t.backToSettings}
                                      onClick={requestSettingsCategories}
                                  >
                                      <ArrowLeft aria-hidden />
                                      <span>{t.settings}</span>
                                  </button>
                                  <button
                                      className='settings-icon-button'
                                      type='button'
                                      aria-label={t.backToHomepage}
                                      onClick={requestSettingsClose}
                                  >
                                      <X aria-hidden />
                                  </button>
                              </header>
                              <aside className='settings-page-sidebar'>
                                  <h1
                                      id='settings-page-title'
                                      className='settings-page-title'
                                      ref={settingsTitleRef}
                                      tabIndex={-1}
                                  >
                                      {t.settings}
                                  </h1>
                                  <form
                                      className='settings-sidebar-search'
                                      role='search'
                                      onSubmit={(event) => {
                                          event.preventDefault();
                                          const first = searchResults.at(0);
                                          if (first) {
                                              openSearchResult(first);
                                          }
                                      }}
                                  >
                                      <Search aria-hidden />
                                      <input
                                          type='search'
                                          ref={settingsSearchRef}
                                          aria-label={t.searchSettings}
                                          placeholder={t.searchSettings}
                                          onKeyDown={(event) => {
                                              if (
                                                  event.key === 'Escape' &&
                                                  settingsQuery !== ''
                                              ) {
                                                  event.preventDefault();
                                                  event.stopPropagation();
                                                  setSettingsQuery('');
                                              }
                                          }}
                                          value={settingsQuery}
                                          onChange={(event) => {
                                              setSettingsQuery(
                                                  event.target.value
                                              );
                                          }}
                                      />
                                      {settingsQuery !== '' && (
                                          <button
                                              type='button'
                                              aria-label={t.clearSearch}
                                              onClick={() => {
                                                  setSettingsQuery('');
                                                  settingsSearchRef.current?.focus();
                                              }}
                                          >
                                              <X aria-hidden />
                                          </button>
                                      )}
                                  </form>
                                  <nav
                                      ref={navigationRef}
                                      className='settings-page-navigation'
                                      data-searching={isSearching}
                                      aria-label={t.settings}
                                  >
                                      {isSearching &&
                                          searchResults.length === 0 && (
                                              <p
                                                  className='settings-search-empty'
                                                  role='status'
                                              >
                                                  {t.noMatchingSettings}
                                              </p>
                                          )}
                                      {isSearching
                                          ? searchResults.map((result) => (
                                                <button
                                                    key={result.id}
                                                    type='button'
                                                    className='settings-page-sidebar-button settings-search-result'
                                                    onClick={() => {
                                                        openSearchResult(
                                                            result
                                                        );
                                                    }}
                                                >
                                                    <span>{result.label}</span>
                                                    {result.sectionLabel !==
                                                        result.label && (
                                                        <small>
                                                            {
                                                                result.sectionLabel
                                                            }
                                                        </small>
                                                    )}
                                                </button>
                                            ))
                                          : visibleSettingsSections.map(
                                                (section) => {
                                                    const Icon = section.icon;
                                                    const isSelected =
                                                        (!isCompactViewport ||
                                                            !isSettingsIndex) &&
                                                        selectedSection ===
                                                            section.id;

                                                    return (
                                                        <Link
                                                            className='settings-page-sidebar-button'
                                                            key={section.id}
                                                            data-section={
                                                                section.id
                                                            }
                                                            href={
                                                                section.id ===
                                                                'content'
                                                                    ? bookmarksHrefRef.current
                                                                    : settingsSectionPaths[
                                                                          section
                                                                              .id
                                                                      ]
                                                            }
                                                            scroll={false}
                                                            aria-current={
                                                                isSelected
                                                                    ? 'page'
                                                                    : undefined
                                                            }
                                                            onClick={() => {
                                                                setOpenDropdownId(
                                                                    undefined
                                                                );
                                                            }}
                                                        >
                                                            <Icon
                                                                className='icon'
                                                                aria-hidden
                                                            />
                                                            <span>
                                                                {section.label}
                                                            </span>
                                                            <ChevronRight
                                                                className='settings-section-chevron'
                                                                aria-hidden
                                                            />
                                                        </Link>
                                                    );
                                                }
                                            )}
                                  </nav>
                                  <button
                                      className='settings-page-sidebar-button settings-page-back'
                                      type='button'
                                      aria-label={t.backToHomepage}
                                      onClick={requestSettingsClose}
                                  >
                                      <ArrowLeft aria-hidden />
                                      <X
                                          className='settings-back-close'
                                          aria-hidden
                                      />
                                      <span>{t.backToHomepage}</span>
                                  </button>
                              </aside>

                              <section
                                  className='settings-page-section'
                                  hidden={selectedSection !== 'appearance'}
                              >
                                  <div className='settings-section-heading'>
                                      <h2>{t.appearance}</h2>
                                  </div>
                                  <div className='settings-card'>
                                      <div
                                          className='settings-row settings-stacked-row'
                                          data-setting='theme'
                                      >
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.theme}
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
                                                          <SettingsChoice
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
                                                              onClick={() => {
                                                                  if (
                                                                      isThemeMode(
                                                                          option.value
                                                                      )
                                                                  ) {
                                                                      updateThemeMode(
                                                                          option.value
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
                                                          </SettingsChoice>
                                                      );
                                                  }
                                              )}
                                          </div>
                                      </div>

                                      <div
                                          className='settings-row settings-stacked-row'
                                          data-setting='accent'
                                      >
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.accent}
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
                                                          <SettingsChoice
                                                              className={[
                                                                  'settings-theme-choice',
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
                                                          </SettingsChoice>
                                                      );
                                                  }
                                              )}
                                          </div>
                                      </div>

                                      {wallpaperControls ===
                                      undefined ? undefined : (
                                          <div
                                              className='settings-row settings-wallpaper-row'
                                              data-setting='wallpaper'
                                          >
                                              <div className='settings-row-copy'>
                                                  <span className='settings-row-label'>
                                                      {t.wallpaper}
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
                                                  {wallpaperControls.wallpaper ===
                                                  undefined ? undefined : (
                                                      <span
                                                          className='settings-wallpaper-preview has-wallpaper'
                                                          role='img'
                                                          aria-label={
                                                              t.wallpaper
                                                          }
                                                          style={
                                                              {
                                                                  '--settings-wallpaper-preview':
                                                                      getCssUrlValue(
                                                                          wallpaperControls
                                                                              .wallpaper
                                                                              .url
                                                                      ),
                                                              } as React.CSSProperties
                                                          }
                                                      />
                                                  )}
                                                  <button
                                                      className='settings-action-button'
                                                      type='button'
                                                      disabled={
                                                          (!wallpaperControls.isAvailable &&
                                                              !onSignIn) ||
                                                          wallpaperControls.isBusy
                                                      }
                                                      aria-label={
                                                          wallpaperControls.isAvailable
                                                              ? t.uploadWallpaper
                                                              : t.signInToUpload
                                                      }
                                                      onClick={() => {
                                                          if (
                                                              !wallpaperControls.isAvailable
                                                          ) {
                                                              if (
                                                                  bookmarkManagerRef.current?.requestClose() ===
                                                                  false
                                                              ) {
                                                                  setSelectedSection(
                                                                      'content'
                                                                  );
                                                                  return;
                                                              }
                                                              setMenuOpen(
                                                                  false
                                                              );
                                                              onSignIn?.();
                                                              return;
                                                          }
                                                          wallpaperInputRef.current?.click();
                                                      }}
                                                  >
                                                      <Upload className='icon' />
                                                      <span>
                                                          {wallpaperControls.isAvailable
                                                              ? t.uploadWallpaper
                                                              : t.signInToUpload}
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
                                                          <Trash2 className='icon' />
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

                                      <div
                                          className='settings-row'
                                          data-setting='animations'
                                      >
                                          <div className='settings-row-copy'>
                                              <span className='settings-row-label'>
                                                  {t.skipRiseAnimations}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {
                                                      t.skipLoadingAnimationDescription
                                                  }
                                              </span>
                                          </div>
                                          <button
                                              className='settings-animation-switch'
                                              type='button'
                                              role='switch'
                                              aria-checked={
                                                  animationMode ===
                                                  skipAnimationMode
                                              }
                                              aria-label={t.skipRiseAnimations}
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
                                  </div>
                                  <div className='settings-card'>
                                      <div
                                          className='settings-row settings-select-row'
                                          data-setting='location'
                                      >
                                          <div className='settings-row-copy'>
                                              <span
                                                  className='settings-row-label'
                                                  id='location-picker-label'
                                              >
                                                  {t.location}
                                              </span>
                                              <span
                                                  className='settings-row-description'
                                                  role={
                                                      locationTrackingFailed ||
                                                      isSyncingLocation
                                                          ? 'status'
                                                          : undefined
                                                  }
                                              >
                                                  {locationDescription}
                                              </span>
                                          </div>
                                          <div className='settings-location-controls'>
                                              <div
                                                  className='settings-location-tracking'
                                                  data-setting='location-tracking'
                                              >
                                                  <TooltipIconButton
                                                      label={t.locationTracking}
                                                      aria-pressed={
                                                          isTrackingLocation
                                                      }
                                                      disabled={
                                                          !isGeolocationAvailable
                                                      }
                                                      onClick={() => {
                                                          setOpenDropdownId(
                                                              undefined
                                                          );
                                                          toggleLocationTracking();
                                                      }}
                                                  >
                                                      {isTrackingLocation ? (
                                                          <MapPin aria-hidden />
                                                      ) : (
                                                          <MapPinOff
                                                              aria-hidden
                                                          />
                                                      )}
                                                  </TooltipIconButton>
                                              </div>
                                              <SettingsDropdown
                                                  id='location-picker'
                                                  labelledBy='location-picker-label'
                                                  disabled={isTrackingLocation}
                                                  value={selectedLocation.id}
                                                  options={locationOptions}
                                                  isOpen={
                                                      !isTrackingLocation &&
                                                      openDropdownId ===
                                                          'location-picker'
                                                  }
                                                  onOpenChange={getDropdownOpenHandler(
                                                      'location-picker'
                                                  )}
                                                  onChange={selectLocationId}
                                              />
                                          </div>
                                      </div>

                                      <div
                                          className='settings-row settings-select-row'
                                          data-setting='language'
                                      >
                                          <div className='settings-row-copy'>
                                              <span
                                                  className='settings-row-label'
                                                  id='language-picker-label'
                                              >
                                                  {t.language}
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

                              {selectedSection === 'keybinds' &&
                              !isCompactViewport ? (
                                  <KeybindSettingsSection
                                      bookmarkControls={bookmarkControls}
                                      openDropdownId={openDropdownId}
                                      onOpenDropdownChange={setOpenDropdownId}
                                  />
                              ) : undefined}

                              {selectedSection === 'quickLaunch' ? (
                                  <QuickLaunchSettingsSection
                                      onOpenBookmark={(bookmarkId) => {
                                          bookmarkManagerRef.current?.openBookmark(
                                              bookmarkId
                                          );
                                      }}
                                      bookmarkControls={bookmarkControls}
                                  />
                              ) : undefined}

                              <section
                                  className='settings-page-section'
                                  data-setting='bookmarks'
                                  hidden={selectedSection !== 'content'}
                              >
                                  <BookmarkManager
                                      ref={bookmarkManagerRef}
                                      bookmarkControls={bookmarkControls}
                                      onClose={finishSettingsNavigation}
                                  />
                              </section>
                          </div>
                      </dialog>
                  </div>,
                  globalThis.document.body
              )
            : undefined;

    return (
        <div ref={controlRef} className={`settings-control ${placement}`}>
            {isTriggerHidden ? undefined : (
                <button
                    className='settings-trigger'
                    ref={triggerRef}
                    type='button'
                    aria-label={t.settings}
                    aria-expanded={isOpen}
                    onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpen(!isOpen);
                    }}
                >
                    <span className='settings-trigger-icons' aria-hidden>
                        <Settings className='settings-trigger-icon settings-trigger-icon-settings' />
                        <X className='settings-trigger-icon settings-trigger-icon-close' />
                    </span>
                </button>
            )}
            {settingsPage}
        </div>
    );
};
