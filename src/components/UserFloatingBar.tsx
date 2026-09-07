import React, { useEffect, useRef, useState } from 'react';
import {
    LogIn,
    LogOut,
    Mail,
    Settings as SettingsIcon,
    UserRound,
} from 'lucide-react';

import { useHomepageAuth } from '@/auth/AuthProvider';
import type { BookmarkControls } from '@/hooks/useBookmarks';
import { useLocale } from '@/hooks/useLocale';
import type { InitialAppPreferences } from '@/types/preferences';
import { SettingsMenu } from './SettingsMenu';
import { WallpaperSettingsMenu } from './WallpaperSettingsMenu';

interface UserFloatingBarProps {
    bookmarkControls: BookmarkControls;
    className?: string;
    closeMenusSignal?: number;
    initialPreferences: InitialAppPreferences;
    isSupabaseEnabled: boolean;
    settingsPlacement?: 'above' | 'mobile';
    showSettingsInMenu?: boolean;
}

interface CloseableMenuProps {
    bookmarkControls: BookmarkControls;
    className?: string;
    closeMenusSignal?: number;
    initialPreferences: InitialAppPreferences;
    settingsPlacement?: 'above' | 'mobile';
    showSettingsInMenu?: boolean;
}

const getDisplayName = (emailAddress?: string, name?: string | null) => {
    if (name !== undefined && name !== null && name.trim() !== '') {
        return name;
    }

    if (emailAddress !== undefined) {
        return emailAddress.split('@')[0];
    }

    return 'Guest';
};

const UserFloatingBarContent: React.FC<CloseableMenuProps> = ({
    bookmarkControls,
    className,
    closeMenusSignal,
    initialPreferences,
    settingsPlacement = 'above',
    showSettingsInMenu = false,
}) => {
    const { isSignedIn, openSignIn, signOut, user } = useHomepageAuth();
    const { t } = useLocale(initialPreferences.locale);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const emailAddress = user?.email;
    const displayName = getDisplayName(
        emailAddress,
        typeof user?.user_metadata.name === 'string'
            ? user.user_metadata.name
            : undefined
    );
    const profileLabel = isSignedIn ? displayName : 'Guest';

    useEffect(() => {
        if (!isMenuOpen) {
            return undefined;
        }

        const onClickOutside = (event: MouseEvent) => {
            if (menuRef.current?.contains(event.target as Node) === false) {
                setIsMenuOpen(false);
            }
        };

        globalThis.document.addEventListener('click', onClickOutside);
        return () => {
            globalThis.document.removeEventListener('click', onClickOutside);
        };
    }, [isMenuOpen]);

    useEffect(() => {
        if (closeMenusSignal === undefined) {
            return;
        }

        setIsMenuOpen(false);
        setIsSettingsOpen(false);
    }, [closeMenusSignal]);

    return (
        <div
            className={['user-floating-bar', className]
                .filter(Boolean)
                .join(' ')}
        >
            <div className='user-menu-control' ref={menuRef}>
                <button
                    className='user-menu-trigger'
                    type='button'
                    aria-label='Open user menu'
                    aria-haspopup='menu'
                    aria-expanded={isMenuOpen}
                    onClick={(event) => {
                        event.stopPropagation();
                        setIsMenuOpen((current) => !current);
                    }}
                >
                    <span className='user-avatar' aria-hidden>
                        {typeof user?.user_metadata.avatar_url === 'string' &&
                        user.user_metadata.avatar_url !== '' ? (
                            <img src={user.user_metadata.avatar_url} alt='' />
                        ) : (
                            <UserRound className='icon' size={20} />
                        )}
                    </span>
                    <span className='user-card-name'>{profileLabel}</span>
                </button>
                {isMenuOpen ? (
                    <div className='user-menu' role='menu'>
                        {isSignedIn ? (
                            <>
                                <div className='user-menu-email'>
                                    <Mail className='icon' size={16} />
                                    <span>
                                        {emailAddress ?? 'No email address'}
                                    </span>
                                </div>
                                {showSettingsInMenu ? (
                                    <button
                                        className='user-menu-action'
                                        type='button'
                                        role='menuitem'
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            setIsSettingsOpen(true);
                                        }}
                                    >
                                        <SettingsIcon
                                            className='icon'
                                            size={16}
                                        />
                                        <span>{t.settings}</span>
                                    </button>
                                ) : undefined}
                                <button
                                    className='user-menu-action'
                                    type='button'
                                    role='menuitem'
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        signOut().catch(() => undefined);
                                    }}
                                >
                                    <LogOut className='icon' size={16} />
                                    <span>Log out</span>
                                </button>
                            </>
                        ) : (
                            <>
                                {showSettingsInMenu ? (
                                    <button
                                        className='user-menu-action'
                                        type='button'
                                        role='menuitem'
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            setIsSettingsOpen(true);
                                        }}
                                    >
                                        <SettingsIcon
                                            className='icon'
                                            size={16}
                                        />
                                        <span>{t.settings}</span>
                                    </button>
                                ) : undefined}
                                <button
                                    className='user-menu-action'
                                    type='button'
                                    role='menuitem'
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        openSignIn();
                                    }}
                                >
                                    <LogIn className='icon' size={16} />
                                    <span>Sign in</span>
                                </button>
                            </>
                        )}
                    </div>
                ) : undefined}
            </div>
            <WallpaperSettingsMenu
                bookmarkControls={bookmarkControls}
                closeSignal={closeMenusSignal}
                isOpen={showSettingsInMenu ? isSettingsOpen : undefined}
                isTriggerHidden={showSettingsInMenu}
                initialPreferences={initialPreferences}
                onOpenChange={
                    showSettingsInMenu ? setIsSettingsOpen : undefined
                }
                placement={settingsPlacement}
            />
        </div>
    );
};

const UserFloatingBarFallback: React.FC<CloseableMenuProps> = ({
    bookmarkControls,
    className,
    closeMenusSignal,
    initialPreferences,
    settingsPlacement = 'above',
    showSettingsInMenu = false,
}) => {
    const { t } = useLocale(initialPreferences.locale);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) {
            return undefined;
        }

        const onClickOutside = (event: MouseEvent) => {
            if (menuRef.current?.contains(event.target as Node) === false) {
                setIsMenuOpen(false);
            }
        };

        globalThis.document.addEventListener('click', onClickOutside);
        return () => {
            globalThis.document.removeEventListener('click', onClickOutside);
        };
    }, [isMenuOpen]);

    useEffect(() => {
        if (closeMenusSignal === undefined) {
            return;
        }

        setIsMenuOpen(false);
        setIsSettingsOpen(false);
    }, [closeMenusSignal]);

    return (
        <div
            className={['user-floating-bar', className]
                .filter(Boolean)
                .join(' ')}
        >
            <div className='user-menu-control' ref={menuRef}>
                <button
                    className='user-menu-trigger'
                    type='button'
                    aria-label='Open user menu'
                    aria-haspopup='menu'
                    aria-expanded={isMenuOpen}
                    onClick={(event) => {
                        event.stopPropagation();
                        setIsMenuOpen((current) => !current);
                    }}
                >
                    <span className='user-avatar' aria-hidden>
                        <UserRound className='icon' size={20} />
                    </span>
                    <span className='user-card-name'>Guest</span>
                </button>
                {isMenuOpen ? (
                    <div className='user-menu' role='menu'>
                        <div className='user-menu-email'>
                            <Mail className='icon' size={16} />
                            <span>Supabase is not configured</span>
                        </div>
                        {showSettingsInMenu ? (
                            <button
                                className='user-menu-action'
                                type='button'
                                role='menuitem'
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setIsSettingsOpen(true);
                                }}
                            >
                                <SettingsIcon className='icon' size={16} />
                                <span>{t.settings}</span>
                            </button>
                        ) : undefined}
                    </div>
                ) : undefined}
            </div>
            <SettingsMenu
                bookmarkControls={bookmarkControls}
                closeSignal={closeMenusSignal}
                isOpen={showSettingsInMenu ? isSettingsOpen : undefined}
                isTriggerHidden={showSettingsInMenu}
                initialPreferences={initialPreferences}
                onOpenChange={
                    showSettingsInMenu ? setIsSettingsOpen : undefined
                }
                placement={settingsPlacement}
            />
        </div>
    );
};

export const UserFloatingBar: React.FC<UserFloatingBarProps> = ({
    bookmarkControls,
    className,
    closeMenusSignal,
    initialPreferences,
    isSupabaseEnabled,
    settingsPlacement,
    showSettingsInMenu,
}) => {
    if (isSupabaseEnabled) {
        return (
            <UserFloatingBarContent
                bookmarkControls={bookmarkControls}
                className={className}
                closeMenusSignal={closeMenusSignal}
                initialPreferences={initialPreferences}
                settingsPlacement={settingsPlacement}
                showSettingsInMenu={showSettingsInMenu}
            />
        );
    }

    return (
        <UserFloatingBarFallback
            bookmarkControls={bookmarkControls}
            className={className}
            closeMenusSignal={closeMenusSignal}
            initialPreferences={initialPreferences}
            settingsPlacement={settingsPlacement}
            showSettingsInMenu={showSettingsInMenu}
        />
    );
};
