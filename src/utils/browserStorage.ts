// Preferences and disposable caches must not depend on storage availability.
export const readStorageValue = (key: string): string | null => {
    try {
        return globalThis.localStorage.getItem(key);
    } catch {
        // eslint-disable-next-line unicorn/no-null -- Preserve the Web Storage getItem contract.
        return null;
    }
};

export const writeStorageValue = (key: string, value: string): void => {
    try {
        globalThis.localStorage.setItem(key, value);
    } catch {
        // The current session can continue without persisting this value.
    }
};

export const removeStorageValue = (key: string): void => {
    try {
        globalThis.localStorage.removeItem(key);
    } catch {
        // The current session can continue without persisting this value.
    }
};
