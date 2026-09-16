import { useEffect, useRef, useState } from 'react';

export interface MenuPoint {
    x: number;
    y: number;
}
interface MenuBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

// Direction-aware grace areas follow the approach used by Radix Menu:
// https://github.com/radix-ui/primitives/blob/main/packages/react/menu/src/menu.tsx
export const menuAimTriangle = (
    origin: MenuPoint,
    bounds: MenuBounds
): MenuPoint[] => {
    const edge =
        origin.x < (bounds.left + bounds.right) / 2
            ? bounds.left
            : bounds.right;
    return [
        origin,
        { x: edge, y: bounds.top - 8 },
        { x: edge, y: bounds.bottom + 8 },
    ];
};

export const movingToMenu = (
    origin: MenuPoint,
    previous: MenuPoint,
    point: MenuPoint,
    bounds: MenuBounds
): boolean => {
    const [a, b, c] = menuAimTriangle(origin, bounds);
    if (b.x > a.x ? point.x <= previous.x : point.x >= previous.x) {
        return false;
    }
    const cross = (p: MenuPoint, q: MenuPoint, r: MenuPoint) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
    return (
        !signs.some((value) => value < 0) || !signs.some((value) => value > 0)
    );
};

export const useMenuAim = (
    enabled: boolean,
    items?: readonly unknown[]
): {
    ref: React.RefObject<HTMLDivElement | null>;
    activeId: string | undefined;
    triangle: MenuPoint[];
} => {
    const ref = useRef<HTMLDivElement>(null);
    const [activeId, setActiveId] = useState<string>();
    const [triangle, setTriangle] = useState<MenuPoint[]>([]);
    useEffect(() => {
        const container = ref.current;
        setActiveId(undefined);
        setTriangle([]);
        if (!enabled || !container) {
            return undefined;
        }
        const rows = [
            ...container.querySelectorAll<HTMLElement>('[data-menu-row]'),
        ].filter((row) => row.closest('[data-menu-level]') === container);
        const menus = new Map(
            rows.map((row) => [
                row,
                row.matches('.category')
                    ? (row.nextElementSibling as HTMLElement | null)
                    : row.querySelector<HTMLElement>(
                          ':scope > .bookmark-submenu'
                      ),
            ])
        );
        const submenu = (row: Readonly<HTMLElement>) => menus.get(row);
        let active: Readonly<HTMLElement> | undefined;
        let origin: MenuPoint | undefined;
        let previous: MenuPoint | undefined;
        let returning = false;
        let pending: Readonly<HTMLElement> | undefined;
        let hasTriangle = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const clearGrace = () => {
            clearTimeout(timer);
            timer = undefined;
            pending = undefined;
            if (hasTriangle) {
                hasTriangle = false;
                setTriangle([]);
            }
        };
        const activate = (row?: Readonly<HTMLElement>) => {
            clearGrace();
            origin = undefined;
            returning = false;
            if (row !== active) {
                active = row;
                setActiveId(row?.dataset.menuRow);
            }
        };
        const reset = () => {
            activate();
            previous = undefined;
        };
        const move = (event: PointerEvent) => {
            if (
                event.pointerType !== 'mouse' ||
                !(event.target instanceof Element)
            ) {
                return;
            }
            const { target } = event;
            const point = { x: event.clientX, y: event.clientY };
            const last = previous ?? point;
            previous = point;
            const menu = active ? submenu(active) : undefined;
            if (menu?.contains(event.target)) {
                clearGrace();
                origin = undefined;
                returning = true;
                return;
            }
            const candidate = rows.find(
                (row) =>
                    row.contains(target) ||
                    submenu(row)?.contains(target) === true
            );
            if (candidate === active && active) {
                clearGrace();
                if (!returning) {
                    origin = point;
                }
                return;
            }
            if (active && origin && menu) {
                const bounds = menu.getBoundingClientRect();
                if (
                    bounds.width > 0 &&
                    bounds.height > 0 &&
                    movingToMenu(origin, last, point, bounds)
                ) {
                    if (timer === undefined) {
                        hasTriangle = true;
                        setTriangle(menuAimTriangle(origin, bounds));
                        timer = setTimeout(() => {
                            activate(pending);
                        }, 300);
                    }
                    pending = candidate;
                    return;
                }
            }
            activate(candidate);
            if (candidate) {
                origin = point;
            }
        };
        const down = (event: Event) => {
            clearGrace();
            if (
                event.type !== 'pointerdown' ||
                !(event.target instanceof Element) ||
                !active?.contains(event.target)
            ) {
                origin = undefined;
            }
        };
        const exitWindow = (event: PointerEvent) => {
            if (
                event.relatedTarget === null &&
                event.target === document.documentElement
            ) {
                reset();
            }
        };
        document.addEventListener('pointerout', exitWindow);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerdown', down);
        globalThis.addEventListener('blur', reset);
        globalThis.addEventListener('resize', reset);
        document.addEventListener('scroll', down, true);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointerout', exitWindow);
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerdown', down);
            globalThis.removeEventListener('blur', reset);
            globalThis.removeEventListener('resize', reset);
            document.removeEventListener('scroll', down, true);
        };
    }, [enabled, items]);
    return { ref, activeId, triangle };
};
