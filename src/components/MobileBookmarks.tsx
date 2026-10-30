import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';

import type { BookmarkNodeData } from '@/types/bookmarks';
import type { CategoryData } from '@/utils/bookmarkPresentation';
import { createBookmarkIcon } from '@/utils/bookmarkPresentation';
import { isBookmarkFolder } from '@/utils/bookmarks';

interface MobileBookmarksProps {
    bookmarksLabel: string;
    disabled: boolean;
    emptyState: ReactNode;
    hidden: boolean;
    bookmarkTree: CategoryData[];
    onClearSearch: () => void;
    onOpenChange: (isOpen: boolean) => void;
}

const closeSwipeThreshold = 72;

interface MobileBookmarkFrame {
    nodes: readonly BookmarkNodeData[];
    title: string;
}

export const MobileBookmarks: React.FC<MobileBookmarksProps> = ({
    bookmarksLabel,
    disabled,
    emptyState,
    hidden,
    bookmarkTree,
    onClearSearch,
    onOpenChange,
}) => {
    const swipeStartXRef = useRef<number | undefined>(undefined);
    const [isOpen, setIsOpen] = useState(false);
    const [navigationStack, setNavigationStack] = useState<
        MobileBookmarkFrame[]
    >([]);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const currentFrame = navigationStack.at(-1);
    const isRootFrame = currentFrame === undefined;
    const headerTitle = currentFrame?.title ?? bookmarksLabel;

    const setPanelOpen = useCallback(
        (nextIsOpen: boolean) => {
            setIsOpen(nextIsOpen);
            onOpenChange(nextIsOpen);

            if (!nextIsOpen) {
                setNavigationStack([]);
                setSwipeOffset(0);
                swipeStartXRef.current = undefined;
            }
        },
        [onOpenChange]
    );

    useEffect(() => {
        if (disabled) {
            setPanelOpen(false);
        }
    }, [disabled, setPanelOpen]);

    useEffect(() => {
        setNavigationStack([]);
    }, [bookmarkTree]);

    const goBack = () => {
        if (!isRootFrame) {
            setNavigationStack(navigationStack.slice(0, -1));
            return;
        }

        setPanelOpen(false);
    };

    const mobileBookmarkContent = ((): ReactNode => {
        if (bookmarkTree.length === 0) {
            return emptyState;
        }

        if (currentFrame === undefined) {
            return bookmarkTree.map((categoryData, categoryIndex) => (
                <button
                    className='mobile-bookmark-link mobile-bookmark-folder'
                    type='button'
                    key={`${categoryData.category}-${categoryIndex}`}
                    onClick={() => {
                        setNavigationStack([
                            {
                                nodes: categoryData.children,
                                title: categoryData.category,
                            },
                        ]);
                    }}
                >
                    {categoryData.icon}
                    <span className='mobile-bookmark-node-label'>
                        {categoryData.category}
                    </span>
                    <ChevronRight
                        className='icon mobile-bookmark-chevron'
                        size={18}
                        aria-hidden
                    />
                </button>
            ));
        }

        return currentFrame.nodes.map((node) => {
            if (isBookmarkFolder(node)) {
                return (
                    <button
                        className='mobile-bookmark-link mobile-bookmark-folder'
                        type='button'
                        key={node.id}
                        onClick={() => {
                            setNavigationStack([
                                ...navigationStack,
                                {
                                    nodes: node.children,
                                    title: node.title,
                                },
                            ]);
                        }}
                    >
                        {createBookmarkIcon(
                            node.icon,
                            'icon mobile-bookmark-folder-icon'
                        )}
                        <span className='mobile-bookmark-node-label'>
                            {node.title}
                        </span>
                        <ChevronRight
                            className='icon mobile-bookmark-chevron'
                            size={18}
                            aria-hidden
                        />
                    </button>
                );
            }

            return (
                <a
                    className='mobile-bookmark-link'
                    href={node.url}
                    key={node.id}
                >
                    <Link2 className='icon' aria-hidden='true' />
                    <span className='mobile-bookmark-node-label'>
                        {node.title}
                    </span>
                </a>
            );
        });
    })();

    return (
        <>
            <button
                className={`mobile-bookmark-button ${
                    hidden || disabled ? 'hidden' : ''
                }`}
                type='button'
                aria-label='Open bookmarks'
                onClick={() => {
                    onClearSearch();
                    setPanelOpen(true);
                }}
            >
                <Bookmark className='icon' size={24} />
            </button>
            <div
                className={`mobile-bookmark-page ${isOpen ? 'open' : ''}`}
                style={
                    {
                        '--mobile-swipe-offset': `${swipeOffset}px`,
                    } as React.CSSProperties
                }
                aria-hidden={!isOpen}
                onTouchStart={(event) => {
                    swipeStartXRef.current = event.touches[0].clientX;
                    setSwipeOffset(0);
                }}
                onTouchMove={(event) => {
                    const startX = swipeStartXRef.current;
                    if (startX === undefined) {
                        return;
                    }
                    const currentX = event.touches[0].clientX;
                    setSwipeOffset(Math.max(0, currentX - startX));
                }}
                onTouchEnd={() => {
                    if (swipeOffset >= closeSwipeThreshold) {
                        setPanelOpen(false);
                        return;
                    }
                    setSwipeOffset(0);
                    swipeStartXRef.current = undefined;
                }}
            >
                <div className='mobile-bookmark-header'>
                    <button
                        className='mobile-bookmark-back'
                        type='button'
                        aria-label={isRootFrame ? 'Close bookmarks' : 'Back'}
                        onClick={goBack}
                    >
                        <ChevronLeft className='icon' size={24} />
                    </button>
                    <span>{headerTitle}</span>
                </div>
                <div
                    className={[
                        'mobile-bookmark-list',
                        bookmarkTree.length === 0 && 'empty',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                >
                    {mobileBookmarkContent}
                </div>
            </div>
        </>
    );
};
