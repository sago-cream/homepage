import type { ReactElement } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useKeybinds } from '@/hooks/useKeybinds';
import { useLocale } from '@/hooks/useLocale';
import type { BookmarkCategoryData } from '@/types/bookmarks';
import { getAvailableKeybinds } from '@/utils/keybinds';
import { getSearchItems, getSlashCommandResults } from '@/utils/search';

export const GhostSidebar = ({
    bookmarkTree,
    visible,
}: {
    bookmarkTree: readonly BookmarkCategoryData[];
    visible: boolean;
}): ReactElement => {
    const { keybinds, showHotkeys } = useKeybinds();
    const { t } = useLocale();
    const viewportRef = useRef<HTMLElement>(null);
    const rowRef = useRef<HTMLLIElement>(null);
    const [capacity, setCapacity] = useState(0);
    const items = useMemo(
        () =>
            getAvailableKeybinds(
                keybinds,
                getSearchItems(bookmarkTree),
                getSlashCommandResults('/')
            ),
        [bookmarkTree, keybinds]
    );
    const hidden = !visible || !showHotkeys || items.length === 0;

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const row = rowRef.current;
        if (!viewport || !row) {
            return undefined;
        }
        const measure = () => {
            const rowHeight = row.getBoundingClientRect().height;
            setCapacity(
                rowHeight > 0
                    ? Math.floor(viewport.clientHeight / rowHeight)
                    : 0
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(viewport);
        observer.observe(row);
        return () => {
            observer.disconnect();
        };
    }, [hidden, items]);

    return (
        <aside
            ref={viewportRef}
            className='ghost-sidebar'
            hidden={hidden}
            aria-label={t.keybinds}
            aria-hidden={capacity === 0 || hidden}
            data-ready={capacity > 0 ? 'true' : undefined}
        >
            <ul>
                {items.slice(0, Math.max(1, capacity)).map((item, index) => (
                    <li
                        key={item.id}
                        ref={index === 0 ? rowRef : undefined}
                        title={`${item.key.toUpperCase()} · ${item.label}`}
                    >
                        <kbd>{item.key.toUpperCase()}</kbd>
                        <span>{item.label}</span>
                    </li>
                ))}
            </ul>
        </aside>
    );
};
