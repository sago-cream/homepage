'use client';

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { X } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

interface HomepageAuth {
    getToken: () => Promise<string | undefined>;
    isLoaded: boolean;
    isSignedIn: boolean;
    openSignIn: () => void;
    signOut: () => Promise<void>;
    user: User | undefined;
    userId: string | undefined;
}

const AuthContext = createContext<HomepageAuth | undefined>(undefined);

const SignInDialog: React.FC<{
    close: () => void;
    isOpen: boolean;
}> = ({ close, isOpen }) => {
    const supabase = useMemo(() => createClient(), []);
    const [error, setError] = useState<string>();
    const [isSigningIn, setIsSigningIn] = useState(false);

    if (!isOpen) {
        return undefined;
    }

    return (
        <div
            className='auth-dialog-backdrop'
            role='presentation'
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
        >
            <div
                className='auth-dialog'
                role='dialog'
                aria-labelledby='auth-dialog-title'
                aria-modal='true'
            >
                <div className='auth-dialog-header'>
                    <div>
                        <span className='auth-dialog-eyebrow'>Homepage</span>
                        <h2 id='auth-dialog-title'>Sign in</h2>
                    </div>
                    <button
                        className='auth-dialog-close'
                        type='button'
                        aria-label='Close sign-in'
                        onClick={close}
                    >
                        <X className='icon' />
                    </button>
                </div>
                <button
                    className='auth-dialog-submit'
                    type='button'
                    disabled={isSigningIn}
                    onClick={() => {
                        setError(undefined);
                        setIsSigningIn(true);

                        supabase.auth
                            .signInWithOAuth({
                                provider: 'google',
                                options: {
                                    redirectTo: `${globalThis.location.origin}/auth/callback`,
                                },
                            })
                            .then(({ error: signInError }) => {
                                if (signInError !== null) {
                                    throw signInError;
                                }
                            })
                            .catch((signInError: unknown) => {
                                setError(
                                    signInError instanceof Error
                                        ? signInError.message
                                        : 'Google sign-in could not be started.'
                                );
                                setIsSigningIn(false);
                            });
                    }}
                >
                    {isSigningIn ? 'Opening Google…' : 'Continue with Google'}
                </button>
                {error === undefined ? undefined : (
                    <p className='auth-dialog-error' role='alert'>
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const supabase = useMemo(() => createClient(), []);
    const [session, setSession] = useState<Session | false>();
    const [isSignInOpen, setIsSignInOpen] = useState(false);

    useEffect(() => {
        let isCurrent = true;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (isCurrent) {
                    setSession(data.session ?? false);
                }
            })
            .catch(() => {
                if (isCurrent) {
                    setSession(false);
                }
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession ?? false);
            if (nextSession) {
                setIsSignInOpen(false);
            }
        });

        return () => {
            isCurrent = false;
            subscription.unsubscribe();
        };
    }, [supabase]);

    const openSignIn = useCallback(() => {
        setIsSignInOpen(true);
    }, []);
    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, [supabase]);
    const value = useMemo<HomepageAuth>(
        () => ({
            getToken: async () => {
                await Promise.resolve();
                return session ? session.access_token : undefined;
            },
            isLoaded: session !== undefined,
            isSignedIn: Boolean(session),
            openSignIn,
            signOut,
            user: session ? session.user : undefined,
            userId: session ? session.user.id : undefined,
        }),
        [openSignIn, session, signOut]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
            <SignInDialog
                close={() => {
                    setIsSignInOpen(false);
                }}
                isOpen={isSignInOpen}
            />
        </AuthContext.Provider>
    );
};

export const useHomepageAuth = (): HomepageAuth => {
    const auth = useContext(AuthContext);

    if (auth === undefined) {
        throw new Error('Homepage AuthProvider is missing.');
    }

    return auth;
};
