import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';

import { getHotkey, normalizeHotkey, parseKeybinds } from './keybinds';

test('accepts one letter or its Zhuyin equivalent, normalizes case, and permits clearing', () => {
    expect(normalizeHotkey('A')).toBe('a');
    expect(normalizeHotkey('z')).toBe('z');
    expect(normalizeHotkey('')).toBe('');
    const zhuyinLetters = [
        'ㄇ',
        'ㄖ',
        'ㄏ',
        'ㄎ',
        'ㄍ',
        'ㄑ',
        'ㄕ',
        'ㄘ',
        'ㄛ',
        'ㄨ',
        'ㄜ',
        'ㄠ',
        'ㄩ',
        'ㄙ',
        'ㄟ',
        'ㄣ',
        'ㄆ',
        'ㄐ',
        'ㄋ',
        'ㄔ',
        'ㄧ',
        'ㄒ',
        'ㄊ',
        'ㄌ',
        'ㄗ',
        'ㄈ',
    ];
    for (const [index, letter] of zhuyinLetters.entries()) {
        expect(normalizeHotkey(letter)).toBe(String.fromCodePoint(97 + index));
    }
    for (const value of [
        'ab',
        '1',
        ' ',
        'é',
        '中',
        'Ａ',
        'a\n',
        'ㄑㄍ',
        'ㄅ',
        'ㄥ',
    ]) {
        expect(normalizeHotkey(value)).toBeUndefined();
    }
});

test('loads drafts and rejects corrupt entries and case-insensitive duplicates', () => {
    expect(parseKeybinds('{')).toEqual([]);
    expect(parseKeybinds('{}')).toEqual([]);
    expect(parseKeybinds(undefined)).toEqual([]);
    expect(
        parseKeybinds(
            JSON.stringify([
                { id: 'a', target: 'command:feeds', key: 'F' },
                { id: 'b', target: 'bookmark:one', key: 'f' },
                { id: 'zhuyin-duplicate', target: 'bookmark:one', key: 'ㄑ' },
                { id: 'zhuyin', target: 'bookmark:two', key: 'ㄕ' },
                { id: 'a', target: '', key: 'b' },
                { id: 'c', target: '', key: '' },
                { id: 'd', target: '', key: '' },
                { id: 'e', target: 'bookmark:two', key: '12' },
                { id: 'f', target: 2, key: 'x' },
                undefined,
            ])
        )
    ).toEqual([
        { id: 'a', target: 'command:feeds', key: 'f' },
        { id: 'zhuyin', target: 'bookmark:two', key: 'g' },
        { id: 'c', target: '', key: '' },
        { id: 'd', target: '', key: '' },
    ]);
});

test('hotkeys ignore editable targets, dialogs, modifiers, composition, repeats, and handled events', async () => {
    const browser = new Window();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
    Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: browser.HTMLElement,
    });
    try {
        const press = (
            target: ReturnType<typeof browser.document.createElement> = browser
                .document.body,
            options = {}
        ) => {
            const event = new browser.KeyboardEvent('keydown', {
                key: 'a',
                cancelable: true,
                ...options,
            });
            target.dispatchEvent(event);
            return getHotkey(event as unknown as KeyboardEvent);
        };
        expect(press()).toBe('a');
        expect(press(undefined, { key: 'ㄑ' })).toBe('f');
        expect(press(undefined, { key: 'Process', code: 'KeyF' })).toBe('f');
        expect(press(undefined, { key: 'Unidentified', code: 'KeyG' })).toBe(
            'g'
        );
        for (const options of [
            { ctrlKey: true },
            { metaKey: true },
            { altKey: true },
            { shiftKey: true },
            { repeat: true },
            { isComposing: true },
            { key: '1' },
            { key: 'Process', code: 'Digit1' },
            { key: 'Process', code: 'KeyF', isComposing: true },
            { key: 'Process', code: 'KeyF', ctrlKey: true },
            { key: 'ㄑ', altKey: true },
        ]) {
            expect(press(undefined, options)).toBeUndefined();
        }
        for (const tag of ['input', 'textarea', 'select']) {
            expect(press(browser.document.createElement(tag))).toBeUndefined();
            expect(
                press(browser.document.createElement(tag), { key: 'ㄑ' })
            ).toBeUndefined();
            expect(
                press(browser.document.createElement(tag), {
                    key: 'Process',
                    code: 'KeyF',
                })
            ).toBeUndefined();
        }
        const editor = browser.document.createElement('div');
        editor.contentEditable = 'true';
        const child = browser.document.createElement('span');
        editor.append(child);
        expect(press(child)).toBeUndefined();
        const dialog = browser.document.createElement('section');
        dialog.setAttribute('role', 'dialog');
        const button = browser.document.createElement('button');
        dialog.append(button);
        expect(press(button)).toBeUndefined();
        browser.document.body.addEventListener(
            'keydown',
            (event) => {
                event.preventDefault();
            },
            { once: true }
        );
        expect(press()).toBeUndefined();
    } finally {
        if (original) {
            Object.defineProperty(globalThis, 'HTMLElement', original);
        } else {
            Reflect.deleteProperty(globalThis, 'HTMLElement');
        }
        await browser.happyDOM.close();
    }
});
