import { useCallback, useEffect, useRef, useState } from 'react';

export const useLinkNavigation = (
    isSearchNav: boolean,
    onClearSearch: () => void,
    highlightedCategory?: number
): {
    selectedCategory: number;
    isMouseNav: boolean;
    mouseLeaveCloseSignal: number;
    startMouseNav: () => void;
    endMouseNav: () => void;
} => {
    const hoverExitTimeoutRef = useRef<
        ReturnType<typeof globalThis.setTimeout> | undefined
    >(undefined);
    const selectedCategory = highlightedCategory ?? 0;
    const [isMouseNav, setIsMouseNav] = useState(false);
    const [mouseLeaveCloseSignal, setMouseLeaveCloseSignal] = useState(0);

    useEffect(() => {
        if (isSearchNav) {
            setIsMouseNav(false);
        }
    }, [isSearchNav]);

    useEffect(
        () => () => {
            if (hoverExitTimeoutRef.current) {
                clearTimeout(hoverExitTimeoutRef.current);
            }
        },
        []
    );

    const startMouseNav = useCallback(() => {
        if (hoverExitTimeoutRef.current) {
            clearTimeout(hoverExitTimeoutRef.current);
            hoverExitTimeoutRef.current = undefined;
        }
        setIsMouseNav(true);
        onClearSearch();
    }, [onClearSearch]);

    const endMouseNav = useCallback(() => {
        if (hoverExitTimeoutRef.current) {
            clearTimeout(hoverExitTimeoutRef.current);
        }
        hoverExitTimeoutRef.current = setTimeout(() => {
            // Floating UI temporarily redirects pointer events while crossing menus.
            if (Object.hasOwn(document.body.dataset, 'floatingUiSafePolygon')) {
                hoverExitTimeoutRef.current = undefined;
                return;
            }
            setIsMouseNav(false);
            setMouseLeaveCloseSignal((signal) => signal + 1);
            hoverExitTimeoutRef.current = undefined;
        }, 40);
    }, []);

    return {
        selectedCategory,
        isMouseNav,
        mouseLeaveCloseSignal,
        startMouseNav,
        endMouseNav,
    };
};
