import { useMemo, useSyncExternalStore } from 'react';

import type { Keybind } from '@/utils/keybinds';
import {
    keybindChangeEvent,
    keybindStorageKey,
    parseKeybinds,
} from '@/utils/keybinds';

const subscribe = (callback: () => void) => {
    globalThis.addEventListener('storage', callback);
    globalThis.addEventListener(keybindChangeEvent, callback);
    return () => {
        globalThis.removeEventListener('storage', callback);
        globalThis.removeEventListener(keybindChangeEvent, callback);
    };
};
const getSnapshot = () => {
    try {
        return globalThis.localStorage.getItem(keybindStorageKey) ?? undefined;
    } catch {
        return undefined;
    }
};
const getServerSnapshot = () => undefined;

export const hotkeyVisibilityStorageKey = 'homepage.showHotkeys';
const getVisibilitySnapshot = () => {
    try {
        return (
            globalThis.localStorage.getItem(hotkeyVisibilityStorageKey) !==
            'false'
        );
    } catch {
        return true;
    }
};
const getServerVisibilitySnapshot = () => true;
const saveShowHotkeys = (show: boolean): boolean => {
    try {
        globalThis.localStorage.setItem(
            hotkeyVisibilityStorageKey,
            String(show)
        );
        globalThis.dispatchEvent(new Event(keybindChangeEvent));
        return true;
    } catch {
        return false;
    }
};

const saveKeybinds = (next: readonly Keybind[]): boolean => {
    try {
        globalThis.localStorage.setItem(
            keybindStorageKey,
            JSON.stringify(next)
        );
        globalThis.dispatchEvent(new Event(keybindChangeEvent));
        return true;
    } catch {
        return false;
    }
};

export const useKeybinds = (): {
    keybinds: Keybind[];
    saveKeybinds: (next: readonly Keybind[]) => boolean;
    showHotkeys: boolean;
    saveShowHotkeys: (show: boolean) => boolean;
} => {
    const stored = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );
    const keybinds = useMemo(() => parseKeybinds(stored), [stored]);
    const showHotkeys = useSyncExternalStore(
        subscribe,
        getVisibilitySnapshot,
        getServerVisibilitySnapshot
    );
    return { keybinds, saveKeybinds, showHotkeys, saveShowHotkeys };
};
