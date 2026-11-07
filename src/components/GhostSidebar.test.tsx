import { act } from 'react';
import { expect, test } from 'bun:test';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- DOM runtime is used only by tests.
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';

import { hotkeyVisibilityStorageKey, useKeybinds } from '@/hooks/useKeybinds';
import { keybindStorageKey } from '@/utils/keybinds';
import { GhostSidebar } from './GhostSidebar';

const bookmark = (id: string, title: string) => ({
    id,
    title,
    type: 'link' as const,
    url: `https://example.com/${id}`,
});

test('fits whole available hotkeys, follows saved order, and persists visibility across consumers', async () => {
    const browser = new Window({ url: 'https://example.com' });
    let availableHeight = 120;
    const observers = new Set<() => void>();
    const bindings = {
        window: browser,
        document: browser.document,
        HTMLElement: browser.HTMLElement,
        localStorage: browser.localStorage,
        Event: browser.Event,
        addEventListener: browser.addEventListener.bind(browser),
        removeEventListener: browser.removeEventListener.bind(browser),
        dispatchEvent: browser.dispatchEvent.bind(browser),
        ResizeObserver: class {
            constructor(callback: () => void) {
                observers.add(callback);
                this.callback = callback;
            }

            callback: () => void;
            observe() {
                observers.add(this.callback);
            }

            disconnect() {
                observers.delete(this.callback);
            }
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
    Object.defineProperty(browser.HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get: () => availableHeight,
    });
    browser.HTMLElement.prototype.getBoundingClientRect = () =>
        new browser.DOMRect(0, 0, 0, 56);
    const links = [
        bookmark('one', 'First bookmark'),
        bookmark('two', 'Second bookmark'),
    ];
    const bookmarkTree = [
        { id: 'category', category: 'Bookmarks', children: links, links },
    ];
    const saved = [
        { id: 'draft', target: '', key: 'd' },
        { id: 'missing', target: 'bookmark:deleted', key: 'm' },
        { id: 'first', target: 'bookmark:one', key: 'a' },
        { id: 'command', target: 'command:feeds', key: 'f' },
        { id: 'second', target: 'bookmark:two', key: 'b' },
    ];
    browser.localStorage.setItem(keybindStorageKey, JSON.stringify(saved));
    let controls!: ReturnType<typeof useKeybinds>;
    function SettingsConsumer() {
        controls = useKeybinds();
        return <span hidden />;
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (visible = true) => {
        root.render(
            <>
                <SettingsConsumer />
                <GhostSidebar bookmarkTree={bookmarkTree} visible={visible} />
            </>
        );
    };
    const labels = () =>
        [...container.querySelectorAll('li span')].map(
            (item) => item.textContent
        );
    try {
        await act(async () => {
            await Promise.resolve();
            render();
        });
        expect(labels()).toEqual(['First bookmark', '/feeds']);
        expect(container.querySelector('kbd')?.textContent).toBe('A');
        await act(async () => {
            await Promise.resolve();
            availableHeight = 168;
            for (const resize of observers) {
                resize();
            }
        });
        expect(labels()).toEqual([
            'First bookmark',
            '/feeds',
            'Second bookmark',
        ]);
        await act(async () => {
            await Promise.resolve();
            controls.saveKeybinds([saved[4], saved[3], saved[2]]);
        });
        expect(labels()).toEqual([
            'Second bookmark',
            '/feeds',
            'First bookmark',
        ]);
        expect(
            JSON.parse(
                browser.localStorage.getItem(keybindStorageKey) ?? '[]'
            ).map((item: { id: string }) => item.id)
        ).toEqual(['second', 'command', 'first']);
        await act(async () => {
            await Promise.resolve();
            availableHeight = 112;
            for (const resize of observers) {
                resize();
            }
        });
        expect(labels()).toEqual(['Second bookmark', '/feeds']);
        await act(async () => {
            await Promise.resolve();
            controls.saveShowHotkeys(false);
        });
        expect(container.querySelector('aside')?.hidden).toBe(true);
        expect(browser.localStorage.getItem(hotkeyVisibilityStorageKey)).toBe(
            'false'
        );
        await act(async () => {
            await Promise.resolve();
            controls.saveShowHotkeys(true);
            render(false);
        });
        expect(container.querySelector('aside')?.hidden).toBe(true);
        await act(async () => {
            await Promise.resolve();
            render();
        });
        expect(container.querySelector('aside')?.hidden).toBe(false);
        await act(async () => {
            await Promise.resolve();
            availableHeight = 40;
            for (const resize of observers) {
                resize();
            }
        });
        expect(
            container.querySelector('aside')?.getAttribute('aria-hidden')
        ).toBe('true');
    } finally {
        await act(async () => {
            await Promise.resolve();
            root.unmount();
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
