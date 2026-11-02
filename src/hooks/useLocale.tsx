import { useCallback, useEffect, useState } from 'react';

import type { AppLocale } from '@/constants/i18n';
import {
    defaultLocale,
    getMessages,
    isAppLocale,
    localeCookieName,
    localeStorageKey,
} from '@/constants/i18n';
import { isBrowser } from '@/utils/browserEnv';
import { readStorageValue, writeStorageValue } from '@/utils/browserStorage';
import { writePreferenceCookie } from '@/utils/preferenceCookies';

const LOCALE_CHANGE_EVENT = 'homepage-locale-change';

function getInitialLocale(initialLocale: AppLocale = defaultLocale): AppLocale {
    if (!isBrowser()) {
        return initialLocale;
    }

    const documentLocale = globalThis.document.documentElement.lang;
    if (isAppLocale(documentLocale)) {
        return documentLocale;
    }

    const savedLocale = readStorageValue(localeStorageKey);

    return isAppLocale(savedLocale) ? savedLocale : initialLocale;
}

function getLocaleFromEvent(event: Event): AppLocale | undefined {
    if (!(event instanceof CustomEvent) || !isAppLocale(event.detail)) {
        return undefined;
    }

    return event.detail;
}

export const useLocale = (
    initialLocale: AppLocale = defaultLocale
): {
    locale: AppLocale;
    setLocale: (locale: AppLocale) => void;
    t: ReturnType<typeof getMessages>;
} => {
    const [locale, setLocaleState] = useState(() =>
        getInitialLocale(initialLocale)
    );

    const setLocale = useCallback((nextLocale: AppLocale) => {
        writeStorageValue(localeStorageKey, nextLocale);
        writePreferenceCookie(localeCookieName, nextLocale);
        globalThis.document.documentElement.lang = nextLocale;
        setLocaleState(nextLocale);
        globalThis.dispatchEvent(
            new CustomEvent(LOCALE_CHANGE_EVENT, { detail: nextLocale })
        );
    }, []);

    useEffect(() => {
        globalThis.document.documentElement.lang = locale;
    }, [locale]);

    useEffect(() => {
        const onLocaleChange = (event: Event) => {
            const nextLocale = getLocaleFromEvent(event);

            if (nextLocale !== undefined) {
                setLocaleState(nextLocale);
            }
        };

        globalThis.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
        return () => {
            globalThis.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
        };
    }, []);

    return {
        locale,
        setLocale,
        t: getMessages(locale),
    };
};
