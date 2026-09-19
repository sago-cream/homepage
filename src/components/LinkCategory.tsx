import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingNode } from '@floating-ui/react';

import { useMenuAim } from '@/hooks/useMenuAim';
import type { BookmarkFolderData, BookmarkNodeData } from '@/types/bookmarks';
import type { CategoryData } from '@/utils/bookmarkPresentation';
import { createBookmarkIcon } from '@/utils/bookmarkPresentation';
import { isBookmarkFolder } from '@/utils/bookmarks';
import { MenuSafetyTriangle } from './MenuSafetyTriangle';

interface LinkCategoryProps {
    categoryData: CategoryData;
    clickedCategory?: number;
    clickedFolderPath: readonly string[];
    index: number;
    isMouseNav: boolean;
    highlightedLinkId?: string;
    highlightedFolderPath?: string[];
    onSelectCategory: (categoryIndex: number) => void;
    onSelectFolder: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
    onSelectLink: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
    padding: string;
    selectedCategory?: number;
}

interface BookmarkNodeListProps {
    categoryIndex: number;
    clickedFolderPath: readonly string[];
    currentFolderPath: readonly string[];
    depth: number;
    highlightedFolderPath?: string[];
    highlightedLinkId?: string;
    isMouseNav: boolean;
    nodes: readonly BookmarkNodeData[];
    onSelectFolder: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
    onSelectLink: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
}

interface BookmarkFolderNodeProps {
    categoryIndex: number;
    clickedFolderPath: readonly string[];
    currentFolderPath: readonly string[];
    depth: number;
    highlightedFolderPath?: string[];
    highlightedLinkId?: string;
    isMouseNav: boolean;
    node: BookmarkFolderData;
    onSelectFolder: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
    onSelectLink: (
        categoryIndex: number,
        folderPath: readonly string[]
    ) => void;
}

const submenuViewportPadding = 16;

const isFolderPathPrefix = (
    folderPath: readonly string[],
    candidatePath: readonly string[]
): boolean =>
    candidatePath.length >= folderPath.length &&
    folderPath.every((folderId, index) => folderId === candidatePath[index]);

const BookmarkFolderNode: React.FC<BookmarkFolderNodeProps> = ({
    categoryIndex,
    clickedFolderPath,
    currentFolderPath,
    depth,
    highlightedFolderPath,
    highlightedLinkId,
    isMouseNav,
    node,
    onSelectFolder,
    onSelectLink,
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const folderNodeRef = useRef<HTMLDivElement>(null);
    const submenuRef = useRef<HTMLDivElement>(null);
    const folderPath = [...currentFolderPath, node.id];
    const isClicked = isFolderPathPrefix(folderPath, clickedFolderPath);
    const isFolderLayerLocked =
        isFolderPathPrefix(currentFolderPath, clickedFolderPath) &&
        clickedFolderPath.length > currentFolderPath.length;
    const isHighlighted = highlightedFolderPath?.[depth] === node.id;
    const isExpanded = isHighlighted || isClicked;
    const aim = useMenuAim(
        isMouseNav && !isFolderLayerLocked,
        isExpanded || isFocused
    );
    const isOpen = aim.open;
    const updateSubmenuPlacement = useCallback(() => {
        const folderNode = folderNodeRef.current;
        const submenu = submenuRef.current;

        if (folderNode === null || submenu === null) {
            return;
        }

        const viewport = globalThis.visualViewport;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportHeight = viewport?.height ?? globalThis.innerHeight;
        const topLimit = viewportTop + submenuViewportPadding;
        const bottomLimit =
            viewportTop + viewportHeight - submenuViewportPadding;
        const availableHeight = bottomLimit - topLimit;
        const anchor = folderNode.getBoundingClientRect();
        const anchorTop = anchor.top;
        const { width } = submenu.getBoundingClientRect();
        const opensLeft =
            anchor.right + width >
            globalThis.innerWidth - submenuViewportPadding;
        submenu.style.left = `${opensLeft ? anchor.left - width : anchor.right}px`;
        submenu.dataset.side = opensLeft ? 'left' : 'right';
        aim.setPlacement(opensLeft ? 'left-start' : 'right-start');
        const submenuHeight = Math.min(submenu.scrollHeight, availableHeight);
        const maxTop = Math.max(topLimit, bottomLimit - submenuHeight);
        const submenuTop = Math.min(Math.max(anchorTop, topLimit), maxTop);
        submenu.style.top = `${Math.round(submenuTop)}px`;
    }, [aim.setPlacement]);

    useEffect(() => {
        const submenu = submenuRef.current;
        if (!submenu) {
            return undefined;
        }
        if (!isOpen) {
            submenu.hidePopover();
            return undefined;
        }
        submenu.showPopover();
        updateSubmenuPlacement();
        const frame = globalThis.requestAnimationFrame(updateSubmenuPlacement);
        globalThis.addEventListener('resize', updateSubmenuPlacement);
        globalThis.addEventListener('scroll', updateSubmenuPlacement, true);

        return () => {
            globalThis.cancelAnimationFrame(frame);
            globalThis.removeEventListener('resize', updateSubmenuPlacement);
            globalThis.removeEventListener(
                'scroll',
                updateSubmenuPlacement,
                true
            );
        };
    }, [isOpen, updateSubmenuPlacement]);

    return (
        <div
            className={[
                'bookmark-node',
                'folder-node',
                isOpen && 'expanded',
                isClicked && 'clicked',
                isFolderLayerLocked && 'layer-locked',
            ]
                .filter(Boolean)
                .join(' ')}
            data-menu-row={node.id}
            key={node.id}
            onFocusCapture={() => {
                setIsFocused(true);
                updateSubmenuPlacement();
            }}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsFocused(false);
                }
            }}
            ref={folderNodeRef}
        >
            <button
                ref={aim.refs.setReference}
                {...aim.getReferenceProps()}
                className={[
                    'link',
                    'folder-link',
                    isMouseNav && 'hoverEffective',
                ]
                    .filter(Boolean)
                    .join(' ')}
                aria-expanded={isOpen}
                aria-pressed={isClicked}
                onClick={() => {
                    onSelectFolder(categoryIndex, folderPath);
                }}
                type='button'
            >
                {createBookmarkIcon(node.icon, 'icon folder-icon-display')}
                <span>{node.title}</span>
            </button>
            <FloatingNode id={aim.nodeId}>
                <div
                    className='bookmark-submenu'
                    popover='manual'
                    ref={(element) => {
                        submenuRef.current = element;
                        aim.refs.setFloating(element);
                    }}
                    {...aim.getFloatingProps({
                        onMouseEnter: aim.clearTriangle,
                    })}
                >
                    <MenuSafetyTriangle points={aim.triangle} />
                    {isOpen && (
                        <BookmarkNodeList
                            categoryIndex={categoryIndex}
                            clickedFolderPath={clickedFolderPath}
                            currentFolderPath={folderPath}
                            depth={depth + 1}
                            highlightedFolderPath={highlightedFolderPath}
                            highlightedLinkId={highlightedLinkId}
                            isMouseNav={isMouseNav}
                            nodes={node.children}
                            onSelectFolder={onSelectFolder}
                            onSelectLink={onSelectLink}
                        />
                    )}
                </div>
            </FloatingNode>
        </div>
    );
};

const BookmarkNodeList: React.FC<BookmarkNodeListProps> = ({
    categoryIndex,
    clickedFolderPath,
    currentFolderPath,
    depth,
    highlightedFolderPath,
    highlightedLinkId,
    isMouseNav,
    nodes,
    onSelectFolder,
    onSelectLink,
}) => (
    <div className='bookmark-node-list' data-menu-level>
        {nodes.map((node) => {
            if (isBookmarkFolder(node)) {
                return (
                    <BookmarkFolderNode
                        categoryIndex={categoryIndex}
                        clickedFolderPath={clickedFolderPath}
                        currentFolderPath={currentFolderPath}
                        depth={depth}
                        highlightedFolderPath={highlightedFolderPath}
                        highlightedLinkId={highlightedLinkId}
                        isMouseNav={isMouseNav}
                        key={node.id}
                        node={node}
                        onSelectFolder={onSelectFolder}
                        onSelectLink={onSelectLink}
                    />
                );
            }

            const isDisabled = node.url.trim() === '';
            const isHighlighted = highlightedLinkId === node.id;

            const linkClassName = [
                'link',
                isDisabled && 'disabled',
                isMouseNav && 'hoverEffective',
                isHighlighted && 'highlighted',
            ]
                .filter(Boolean)
                .join(' ');

            return (
                <div
                    className='bookmark-node link-node'
                    data-menu-row={node.id}
                    key={`${node.id}-${node.title}`}
                >
                    <a
                        data-bookmark-id={node.id}
                        href={isDisabled ? undefined : node.url}
                        className={linkClassName}
                        onClick={(event) => {
                            if (isDisabled) {
                                event.preventDefault();
                                return;
                            }

                            onSelectLink(categoryIndex, currentFolderPath);
                        }}
                    >
                        <span>{node.title}</span>
                    </a>
                </div>
            );
        })}
    </div>
);

export const LinkCategory: React.FC<LinkCategoryProps> = ({
    categoryData,
    clickedCategory,
    clickedFolderPath,
    index,
    isMouseNav,
    highlightedLinkId,
    highlightedFolderPath,
    onSelectCategory,
    onSelectFolder,
    onSelectLink,
    padding,
    selectedCategory,
}) => {
    const categoryIndex = index + 1;
    const isCategoryClicked = clickedCategory === categoryIndex;
    const isCategorySelected = selectedCategory === categoryIndex;
    const aim = useMenuAim(
        isMouseNav && clickedCategory === undefined,
        isCategorySelected || isCategoryClicked
    );
    const isCategoryOpen = aim.open;

    const categoryClassName = [
        'category',
        (isCategorySelected || isCategoryClicked) && 'selected',
        isCategoryOpen && 'hover-open',
        isCategoryClicked && 'clicked',
        isMouseNav && 'hoverEffective',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <FloatingNode id={aim.nodeId}>
            <button
                ref={aim.refs.setReference}
                {...aim.getReferenceProps()}
                data-menu-row={String(categoryIndex)}
                className={categoryClassName}
                type='button'
                aria-expanded={isCategoryOpen}
                aria-pressed={isCategoryClicked}
                onClick={() => {
                    onSelectCategory(categoryIndex);
                }}
            >
                {categoryData.icon}
                <span className='category-title'>{categoryData.category}</span>
            </button>
            <div
                ref={aim.refs.setFloating}
                {...aim.getFloatingProps({ onMouseEnter: aim.clearTriangle })}
                className={`links ${isMouseNav ? 'hoverEffective' : ''}`}
                style={{ '--padding': padding } as React.CSSProperties}
            >
                <div className='panel' />
                <MenuSafetyTriangle points={aim.triangle} />
                {isCategoryOpen && (
                    <BookmarkNodeList
                        categoryIndex={categoryIndex}
                        clickedFolderPath={clickedFolderPath}
                        currentFolderPath={[]}
                        depth={0}
                        highlightedFolderPath={highlightedFolderPath}
                        highlightedLinkId={highlightedLinkId}
                        isMouseNav={isMouseNav}
                        nodes={categoryData.children}
                        onSelectFolder={onSelectFolder}
                        onSelectLink={onSelectLink}
                    />
                )}
            </div>
        </FloatingNode>
    );
};
