import { getKeyboardKey, getLatinKeySequenceAlias } from '@/utils/keyboard';

export interface Keybind {
    id: string;
    target: string;
    key: string;
}

export const keybindStorageKey = 'homepage.keybinds';
export const keybindChangeEvent = 'homepage-keybinds-change';

export const normalizeHotkey = (value: string): string | undefined => {
    const key = getLatinKeySequenceAlias(value) ?? value;
    return key === '' || /^[a-z]$/i.test(key) ? key.toLowerCase() : undefined;
};

export const parseKeybinds = (value: string | null | undefined): Keybind[] => {
    try {
        const parsed: unknown = JSON.parse(value ?? '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        const ids = new Set<string>();
        const keys = new Set<string>();
        return parsed.flatMap((item: unknown) => {
            if (
                typeof item !== 'object' ||
                item === null ||
                !('id' in item) ||
                typeof item.id !== 'string' ||
                !('target' in item) ||
                typeof item.target !== 'string' ||
                !('key' in item) ||
                typeof item.key !== 'string'
            ) {
                return [];
            }
            const key = normalizeHotkey(item.key);
            if (
                key === undefined ||
                ids.has(item.id) ||
                (key !== '' && keys.has(key))
            ) {
                return [];
            }
            ids.add(item.id);
            if (key !== '') {
                keys.add(key);
            }
            return [{ id: item.id, target: item.target, key }];
        });
    } catch {
        return [];
    }
};

export const getHotkey = (event: KeyboardEvent): string | undefined => {
    if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
    ) {
        return undefined;
    }
    const { target } = event;
    if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest(
                'input, textarea, select, [contenteditable], [role="dialog"], dialog'
            ))
    ) {
        return undefined;
    }
    const key = normalizeHotkey(getKeyboardKey(event));
    return key === '' ? undefined : key;
};
