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
    Keyboard,
    Mailbox,
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
import { useTaiwanLocation } from '@/hooks/useTaiwanLocation';
import type { WallpaperControls } from '@/hooks/useWallpaper';
import type { InitialAppPreferences } from '@/types/preferences';
import { isBrowser } from '@/utils/browserEnv';
import {
    clearPreferenceCookie,
    writePreferenceCookie,
} from '@/utils/preferenceCookies';
import {
    getSettingsSection,
    settingsSectionPaths,
} from '@/utils/settingsNavigation';
import type { SettingsSectionId } from '@/utils/settingsNavigation';
import { getCssUrlValue } from '@/utils/wallpaperStyle';
import { wallpaperAcceptedContentTypes } from '../../shared/wallpaper';
import { BookmarkManager } from './BookmarkManager';
import type { BookmarkManagerHandle } from './BookmarkManager';
import { FeedSettingsSection } from './FeedSettingsSection';
import { KeybindSettingsSection } from './KeybindSettingsSection';
import { SettingsDropdown } from './SettingsDropdown';
import type { SettingsDropdownOption } from './SettingsDropdown';

interface ThemeHydrationRoot extends HTMLElement {
    __homepageThemeHydrationObserver?: MutationObserver;
}

const SettingsChoice: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement>
> = (props) => <button {...props} type='button' role='radio' />;

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
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedSection = getSettingsSection(pathname) ?? 'content';
    const bookmarksHrefRef = useRef<string>(settingsSectionPaths.content);
    if (selectedSection === 'content') {
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
    const openDropdownIdRef = useRef(openDropdownId);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | undefined>(undefined);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const controlRef = useRef<HTMLDivElement>(null);
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

    const requestSettingsClose = useCallback(() => {
        if (bookmarkManagerRef.current === null) {
            setMenuOpen(false);
        } else if (!bookmarkManagerRef.current.requestClose()) {
            setSelectedSection('content');
        }
    }, [setMenuOpen, setSelectedSection]);

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
                requestSettingsClose();
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
    }, [isOpen, requestSettingsClose]);

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
            keywords: t.bookmarkSettingsKeywords,
        },
        { icon: Mailbox, id: 'feeds', label: t.feeds, keywords: '/feeds' },
        {
            icon: Keyboard,
            id: 'keybinds',
            label: t.keybinds,
            keywords: t.keybindSettingsKeywords,
        },
        {
            icon: Palette,
            id: 'appearance',
            label: t.appearance,
            keywords: `${t.theme} ${t.accent} ${t.wallpaper} ${t.skipRiseAnimations}`,
        },
        {
            icon: SlidersHorizontal,
            id: 'preferences',
            label: t.preferences,
            keywords: `${t.location} ${t.language}`,
        },
    ] satisfies ReadonlyArray<{
        icon: typeof Palette;
        id: SettingsSectionId;
        label: string;
        keywords: string;
    }>;
    const visibleSections = settingsSections.filter((section) =>
        `${section.label} ${section.keywords}`
            .toLocaleLowerCase()
            .includes(settingsQuery.trim().toLocaleLowerCase())
    );

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
                                  requestSettingsClose();
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
                          <div className='settings-page-content'>
                              <aside className='settings-page-sidebar'>
                                  <h1 id='settings-page-title'>{t.settings}</h1>
                                  <button
                                      className='settings-page-sidebar-button settings-page-back'
                                      type='button'
                                      ref={closeButtonRef}
                                      onClick={requestSettingsClose}
                                  >
                                      <ArrowLeft size={18} aria-hidden />
                                      <span>{t.backToHomepage}</span>
                                  </button>
                                  <form
                                      className='settings-sidebar-search'
                                      role='search'
                                      onSubmit={(event) => {
                                          event.preventDefault();
                                          const first = visibleSections.at(0);
                                          if (first) {
                                              setOpenDropdownId(undefined);
                                              setSelectedSection(first.id);
                                          }
                                      }}
                                  >
                                      <Search size={18} aria-hidden />
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
                                              <X size={16} aria-hidden />
                                          </button>
                                      )}
                                  </form>
                                  <nav
                                      className='settings-page-navigation'
                                      aria-label={t.settings}
                                  >
                                      {visibleSections.length === 0 && (
                                          <p
                                              className='settings-search-empty'
                                              role='status'
                                          >
                                              {t.noMatchingSettings}
                                          </p>
                                      )}
                                      {visibleSections.map((section) => {
                                          const Icon = section.icon;
                                          const isSelected =
                                              selectedSection === section.id;

                                          return (
                                              <Link
                                                  className='settings-page-sidebar-button'
                                                  key={section.id}
                                                  href={
                                                      section.id === 'content'
                                                          ? bookmarksHrefRef.current
                                                          : settingsSectionPaths[
                                                                section.id
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
                                                      size={18}
                                                      aria-hidden
                                                  />
                                                  <span>{section.label}</span>
                                              </Link>
                                          );
                                      })}
                                  </nav>
                              </aside>

                              <section
                                  className='settings-page-section'
                                  hidden={selectedSection !== 'appearance'}
                              >
                                  <div className='settings-section-heading'>
                                      <h2>{t.appearance}</h2>
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
                                      <div className='settings-row settings-select-row'>
                                          <div className='settings-row-copy'>
                                              <span
                                                  className='settings-row-label'
                                                  id='location-picker-label'
                                              >
                                                  {t.location}
                                              </span>
                                              <span className='settings-row-description'>
                                                  {locationDescription}
                                              </span>
                                          </div>
                                          <div className='settings-location-controls'>
                                              <button
                                                  type='button'
                                                  className='settings-location-tracking'
                                                  aria-label={
                                                      t.locationTracking
                                                  }
                                                  aria-pressed={
                                                      isTrackingLocation
                                                  }
                                                  title={
                                                      isTrackingLocation
                                                          ? t.disableLocationTracking
                                                          : t.enableLocationTracking
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
                                                      <MapPin
                                                          size={20}
                                                          aria-hidden
                                                      />
                                                  ) : (
                                                      <MapPinOff
                                                          size={20}
                                                          aria-hidden
                                                      />
                                                  )}
                                              </button>
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

                              {selectedSection === 'keybinds' ? (
                                  <KeybindSettingsSection
                                      bookmarkControls={bookmarkControls}
                                      openDropdownId={openDropdownId}
                                      onOpenDropdownChange={setOpenDropdownId}
                                  />
                              ) : undefined}

                              {selectedSection === 'feeds' ? (
                                  <FeedSettingsSection
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
                                  hidden={selectedSection !== 'content'}
                              >
                                  <BookmarkManager
                                      ref={bookmarkManagerRef}
                                      bookmarkControls={bookmarkControls}
                                      onClose={() => {
                                          setMenuOpen(false);
                                      }}
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
        </div>
    );
};
