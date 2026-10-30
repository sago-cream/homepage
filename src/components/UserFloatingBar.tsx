import React, { useEffect, useRef, useState } from 'react';
import {
    LogIn,
    LogOut,
    Mail,
    Settings as SettingsIcon,
    UserRound,
} from 'lucide-react';
import Link from 'next/link';

import { useHomepageAuth } from '@/auth/AuthProvider';
import { useLocale } from '@/hooks/useLocale';
import type { InitialAppPreferences } from '@/types/preferences';

interface UserFloatingBarProps {
    className?: string;
    closeMenusSignal?: number;
    initialPreferences: InitialAppPreferences;
    isSupabaseEnabled: boolean;
    showSettingsInMenu?: boolean;
}

interface CloseableMenuProps {
    className?: string;
    closeMenusSignal?: number;
    initialPreferences: InitialAppPreferences;
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
    className,
    closeMenusSignal,
    initialPreferences,
    showSettingsInMenu = false,
}) => {
    const { isSignedIn, openSignIn, signOut, user } = useHomepageAuth();
    const { t } = useLocale(initialPreferences.locale);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
                                    <Link
                                        className='user-menu-action'
                                        href='/settings/bookmarks'
                                        role='menuitem'
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                        }}
                                    >
                                        <SettingsIcon
                                            className='icon'
                                            size={16}
                                        />
                                        <span>{t.settings}</span>
                                    </Link>
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
                                    <Link
                                        className='user-menu-action'
                                        href='/settings/bookmarks'
                                        role='menuitem'
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                        }}
                                    >
                                        <SettingsIcon
                                            className='icon'
                                            size={16}
                                        />
                                        <span>{t.settings}</span>
                                    </Link>
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
            {showSettingsInMenu ? undefined : (
                <div className='settings-control above'>
                    <Link
                        className='settings-trigger'
                        href='/settings/bookmarks'
                        aria-label={t.settings}
                    >
                        <SettingsIcon className='icon' size={20} />
                    </Link>
                </div>
            )}
        </div>
    );
};

const UserFloatingBarFallback: React.FC<CloseableMenuProps> = ({
    className,
    closeMenusSignal,
    initialPreferences,
    showSettingsInMenu = false,
}) => {
    const { t } = useLocale(initialPreferences.locale);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
                            <Link
                                className='user-menu-action'
                                href='/settings/bookmarks'
                                role='menuitem'
                                onClick={() => {
                                    setIsMenuOpen(false);
                                }}
                            >
                                <SettingsIcon className='icon' size={16} />
                                <span>{t.settings}</span>
                            </Link>
                        ) : undefined}
                    </div>
                ) : undefined}
            </div>
            {showSettingsInMenu ? undefined : (
                <div className='settings-control above'>
                    <Link
                        className='settings-trigger'
                        href='/settings/bookmarks'
                        aria-label={t.settings}
                    >
                        <SettingsIcon className='icon' size={20} />
                    </Link>
                </div>
            )}
        </div>
    );
};

export const UserFloatingBar: React.FC<UserFloatingBarProps> = ({
    className,
    closeMenusSignal,
    initialPreferences,
    isSupabaseEnabled,
    showSettingsInMenu,
}) => {
    if (isSupabaseEnabled) {
        return (
            <UserFloatingBarContent
                className={className}
                closeMenusSignal={closeMenusSignal}
                initialPreferences={initialPreferences}
                showSettingsInMenu={showSettingsInMenu}
            />
        );
    }

    return (
        <UserFloatingBarFallback
            className={className}
            closeMenusSignal={closeMenusSignal}
            initialPreferences={initialPreferences}
            showSettingsInMenu={showSettingsInMenu}
        />
    );
};
