/* eslint-disable no-await-in-loop -- Keyboard cases run sequentially against one mounted search field. */
import { act } from 'react';
import type { ChangeEvent } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

import { keybindStorageKey } from '@/utils/keybinds';
import { useBookmarkSearch } from './useBookmarkSearch';

test('search respects native controls and handles Zhuyin hotkeys and slash commands', async () => {
    const browser = new Window({ url: 'https://example.com' });
    let isCompactViewport = false;
    let shouldBlockTabs = true;
    let emptyLaunches = 0;
    const opened: string[] = [];
    const onEmptyQuickLaunch = () => {
        emptyLaunches++;
    };
    const bindings = {
        window: browser,
        document: browser.document,
        HTMLElement: browser.HTMLElement,
        localStorage: browser.localStorage,
        addEventListener: browser.addEventListener.bind(browser),
        removeEventListener: browser.removeEventListener.bind(browser),
        getComputedStyle: browser.getComputedStyle.bind(browser),
        matchMedia: () => ({ matches: isCompactViewport }),
        ResizeObserver: browser.ResizeObserver,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => undefined,
        open: (url: string) => {
            opened.push(url);
            return shouldBlockTabs ? undefined : { opener: undefined };
        },
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const originals = new Map(
        Object.keys(bindings).map((key) => [
            key,
            Object.getOwnPropertyDescriptor(globalThis, key),
        ])
    );
    for (const [key, value] of Object.entries(bindings)) {
        Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    browser.localStorage.setItem(
        keybindStorageKey,
        JSON.stringify([{ id: 'feeds', target: 'command:feeds', key: 'f' }])
    );
    const feed = {
        id: 'feed',
        title: 'GitHub',
        type: 'link' as const,
        url: 'https://github.com',
        feed: true,
    };
    const bookmarks = [
        { id: 'category', category: 'Feeds', children: [feed], links: [feed] },
    ];
    let currentBookmarks = bookmarks;
    let search!: ReturnType<typeof useBookmarkSearch>;
    function Consumer() {
        search = useBookmarkSearch(currentBookmarks, false, onEmptyQuickLaunch);
        return (
            <form ref={search.searchFormRef} onSubmit={search.handleSubmit}>
                <input
                    ref={search.inputRef}
                    value={search.searchInputValue}
                    onChange={search.handleSearchChange}
                    onKeyDown={search.handleSearchKeyDown}
                    onFocus={search.handleSearchFocus}
                />
            </form>
        );
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const press = async (
        target: Element,
        options: Pick<
            KeyboardEventInit,
            | 'key'
            | 'code'
            | 'ctrlKey'
            | 'metaKey'
            | 'altKey'
            | 'shiftKey'
            | 'repeat'
            | 'isComposing'
        >
    ) => {
        await act(async () => {
            target.dispatchEvent(
                new browser.KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    ...options,
                }) as unknown as Event
            );
            await Promise.resolve();
        });
    };
    const change = async (value: string) => {
        await act(async () => {
            search.handleSearchChange({
                target: { value },
            } as ChangeEvent<HTMLInputElement>);
            await Promise.resolve();
        });
    };
    try {
        await act(async () => {
            root.render(<Consumer />);
            await Promise.resolve();
        });
        const input = container.querySelector('input');
        if (!input) {
            throw new Error('Missing search input');
        }
        for (const markup of [
            '<button>Action</button>',
            '<a href="/settings">Settings</a>',
            '<div role="dialog"><button>Close</button></div>',
            '<div contenteditable="true"><span>Editor</span></div>',
            '<div role="listbox"><div role="option">Choice</div></div>',
        ]) {
            const host = document.createElement('div');
            host.innerHTML = markup;
            document.body.append(host);
            const target = host.querySelector(
                'button, a, span, [role="option"]'
            );
            if (!target) {
                throw new Error('Missing keyboard target');
            }
            for (const key of [' ', '/']) {
                await press(target, { key });
                expect(document.activeElement).not.toBe(input);
                expect(search.searchInputValue).toBe('');
            }
            host.remove();
        }
        for (const modifier of [
            { ctrlKey: true },
            { metaKey: true },
            { altKey: true },
            { isComposing: true },
            { repeat: true },
        ]) {
            for (const key of [' ', '/']) {
                await press(document.body, { key, ...modifier });
                expect(document.activeElement).not.toBe(input);
            }
        }
        await press(document.body, { key: ' ', shiftKey: true });
        expect(document.activeElement).not.toBe(input);
        document.body.addEventListener(
            'keydown',
            (event) => {
                event.preventDefault();
            },
            { once: true }
        );
        await press(document.body, { key: '/' });
        expect(document.activeElement).not.toBe(input);

        await press(document.body, { key: 'ㄑ' });
        await press(document.body, { key: 'Process', code: 'KeyF' });
        expect(opened).toEqual([feed.url, feed.url]);
        expect(search.blockedQuickLaunchBookmarks).toEqual([feed]);
        await act(async () => {
            search.clearBlockedQuickLaunchBookmarks();
            await Promise.resolve();
        });
        isCompactViewport = true;
        await press(document.body, { key: 'f', code: 'KeyF' });
        expect(opened).toHaveLength(2);
        isCompactViewport = false;
        await press(input, { key: 'Process', code: 'KeyF' });
        expect(opened).toHaveLength(2);

        await press(document.body, { key: 'Process', code: 'Slash' });
        expect(document.activeElement).toBe(input);
        expect(search.searchInputValue).toBe('/');
        await act(async () => {
            for (const letter of 'feeds') {
                input.dispatchEvent(
                    new browser.KeyboardEvent('keydown', {
                        key: 'Process',
                        code: `Key${letter.toUpperCase()}`,
                        isComposing: true,
                        bubbles: true,
                    }) as unknown as Event
                );
            }
            await Promise.resolve();
        });
        await change('/ㄋ');
        expect(search.slashCommandResults).toEqual([
            { command: 'feeds', label: '/launch' },
        ]);
        expect(search.hasGoogleSearchResult).toBe(false);
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(3);
        await act(async () => {
            search.clearBlockedQuickLaunchBookmarks();
            await Promise.resolve();
        });

        await act(async () => {
            search.handleSearchBlur();
            await Promise.resolve();
        });
        await change('ㄥㄑㄍㄍㄎㄋ');
        expect(search.slashCommandResults).toHaveLength(1);
        expect(input.value).toBe('ㄥㄑㄍㄍㄎㄋ');
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(4);
        await act(async () => {
            search.clearBlockedQuickLaunchBookmarks();
            await Promise.resolve();
        });
        await change('/launch');
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(5);
        expect(search.blockedQuickLaunchBookmarks).toEqual([feed]);
        await act(async () => {
            search.dismissBlockedQuickLaunchBookmark(feed.id);
            await Promise.resolve();
        });
        expect(search.blockedQuickLaunchBookmarks).toEqual([]);

        shouldBlockTabs = false;
        await change('/launch');
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(6);
        expect(search.blockedQuickLaunchBookmarks).toEqual([]);

        currentBookmarks = [];
        await act(async () => {
            root.render(<Consumer />);
            await Promise.resolve();
        });
        await act(async () => {
            search.executeSlashCommand({ command: 'feeds', label: '/launch' });
            await Promise.resolve();
        });
        expect(emptyLaunches).toBe(1);
        expect(opened).toHaveLength(6);
        expect(search.blockedQuickLaunchBookmarks).toEqual([]);
    } finally {
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
        container.remove();
        await browser.happyDOM.close();
        for (const [key, descriptor] of originals) {
            if (descriptor) {
                Object.defineProperty(globalThis, key, descriptor);
            } else {
                Reflect.deleteProperty(globalThis, key);
            }
        }
    }
});
