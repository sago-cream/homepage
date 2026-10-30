import { act } from 'react';
import type { ChangeEvent } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

import { keybindStorageKey } from '@/utils/keybinds';
import { useBookmarkSearch } from './useBookmarkSearch';

test('Zhuyin hotkeys and residual slash input execute feeds through the search hook', async () => {
    const browser = new Window({ url: 'https://example.com' });
    const opened: string[] = [];
    const bindings = {
        window: browser,
        document: browser.document,
        HTMLElement: browser.HTMLElement,
        localStorage: browser.localStorage,
        addEventListener: browser.addEventListener.bind(browser),
        removeEventListener: browser.removeEventListener.bind(browser),
        getComputedStyle: browser.getComputedStyle.bind(browser),
        ResizeObserver: browser.ResizeObserver,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => undefined,
        open: (url: string) => {
            opened.push(url);
            return undefined;
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
    let search!: ReturnType<typeof useBookmarkSearch>;
    function Consumer() {
        search = useBookmarkSearch(bookmarks);
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
        options: Pick<KeyboardEventInit, 'key' | 'code'>
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
        await press(document.body, { key: 'ㄑ' });
        await press(document.body, { key: 'Process', code: 'KeyF' });
        expect(opened).toEqual([feed.url, feed.url]);
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
            { command: 'feeds', label: '/feeds' },
        ]);
        expect(search.hasGoogleSearchResult).toBe(false);
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(3);

        await act(async () => {
            search.handleSearchBlur();
            await Promise.resolve();
        });
        await change('ㄥㄑㄍㄍㄎㄋ');
        expect(search.slashCommandResults).toHaveLength(1);
        await press(input, { key: 'Enter' });
        expect(opened).toHaveLength(4);
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
