import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { FloatingNode } from '@floating-ui/react';
import { createPortal } from 'react-dom';

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
    isParentOpen: boolean;
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
    isParentOpen: boolean;
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

const BookmarkFolderButton: React.FC<
    React.ComponentProps<'button'> & { icon: React.ReactNode }
> = ({ className, children, icon, ...props }) => (
    <button
        {...props}
        className={`bookmark-folder-trigger ${className ?? ''}`}
        type='button'
    >
        <span className='bookmark-folder-icon'>{icon}</span>
        <span className='bookmark-folder-title'>{children}</span>
    </button>
);

export const BookmarkPanelLayersContext = createContext<
    HTMLDivElement | undefined
>(undefined);

const submenuViewportPadding = 16;

const useRetainedMenuContent = (isOpen: boolean): boolean => {
    const [hasOpened, setHasOpened] = useState(isOpen);
    useEffect(() => {
        if (isOpen) {
            setHasOpened(true);
        }
    }, [isOpen]);
    return isOpen || hasOpened;
};

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
    isParentOpen,
    node,
    onSelectFolder,
    onSelectLink,
}) => {
    const layerRoot = useContext(BookmarkPanelLayersContext);
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
        isParentOpen && isMouseNav && !isFolderLayerLocked,
        isParentOpen && (isExpanded || isFocused)
    );
    const isOpen = aim.open;
    const renderContent = useRetainedMenuContent(isOpen);
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
        const { width } = anchor;
        const rootLeft = layerRoot?.getBoundingClientRect().left ?? 0;
        const opensLeft =
            anchor.right + width >
            globalThis.innerWidth - submenuViewportPadding;
        const left =
            (opensLeft ? anchor.left - width : anchor.right) - rootLeft;
        submenu.style.left = `${left}px`;
        submenu.style.setProperty('--submenu-offset', `${left}px`);
        submenu.style.zIndex = String(9 - Math.round(left / width));
        submenu.dataset.side = opensLeft ? 'left' : 'right';
        aim.setPlacement(opensLeft ? 'left-start' : 'right-start');
        const items = aim.refs.floating.current;
        const submenuHeight = Math.min(
            items?.scrollHeight ?? 0,
            availableHeight
        );
        const maxTop = Math.max(topLimit, bottomLimit - submenuHeight);
        const submenuTop = Math.min(
            Math.max(
                anchor.top + (anchor.height - submenuHeight) / 2,
                topLimit
            ),
            maxTop
        );
        submenu.style.top = `${viewportTop - (layerRoot?.getBoundingClientRect().top ?? 0)}px`;
        submenu.style.height = `${viewportHeight}px`;
        submenu.style.setProperty(
            '--padding',
            `${Math.round(submenuTop - viewportTop)}px`
        );
    }, [aim.refs.floating, aim.setPlacement, layerRoot]);

    useEffect(() => {
        const submenu = submenuRef.current;
        if (!submenu || !isOpen) {
            return undefined;
        }
        updateSubmenuPlacement();
        let frame: number | undefined;
        let remainingFrames = 2;
        const trackPlacement = () => {
            frame = undefined;
            updateSubmenuPlacement();
            const isSliding = layerRoot
                ?.getAnimations({ subtree: true })
                .some((animation) => animation.playState === 'running');
            remainingFrames--;
            if (remainingFrames > 0 || isSliding) {
                frame = globalThis.requestAnimationFrame(trackPlacement);
            }
        };
        const schedulePlacement = () => {
            remainingFrames = 2;
            frame ??= globalThis.requestAnimationFrame(trackPlacement);
        };
        schedulePlacement();
        globalThis.addEventListener('resize', schedulePlacement);
        globalThis.addEventListener('scroll', schedulePlacement, true);

        return () => {
            if (frame !== undefined) {
                globalThis.cancelAnimationFrame(frame);
            }
            globalThis.removeEventListener('resize', schedulePlacement);
            globalThis.removeEventListener('scroll', schedulePlacement, true);
        };
    }, [isOpen, layerRoot, updateSubmenuPlacement]);

    const submenu = (
        <div
            className='bookmark-submenu'
            data-open={isOpen}
            inert={!isOpen}
            aria-hidden={!isOpen}
            ref={submenuRef}
        >
            <div className='panel' />
            {aim.triangle.length > 0 && (
                <MenuSafetyTriangle points={aim.triangle} />
            )}
            <div className='bookmark-submenu-panel'>
                <div
                    className='bookmark-submenu-items'
                    ref={aim.refs.setFloating}
                    {...aim.getFloatingProps({
                        onMouseEnter: aim.clearTriangle,
                    })}
                >
                    {renderContent && (
                        <BookmarkNodeList
                            categoryIndex={categoryIndex}
                            clickedFolderPath={clickedFolderPath}
                            currentFolderPath={folderPath}
                            depth={depth + 1}
                            highlightedFolderPath={highlightedFolderPath}
                            highlightedLinkId={highlightedLinkId}
                            isMouseNav={isMouseNav}
                            isParentOpen={isOpen}
                            nodes={node.children}
                            onSelectFolder={onSelectFolder}
                            onSelectLink={onSelectLink}
                        />
                    )}
                </div>
            </div>
        </div>
    );

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
            <BookmarkFolderButton
                ref={aim.refs.setReference}
                {...aim.getReferenceProps()}
                className={[
                    'folder-link',
                    isExpanded && 'selected',
                    isOpen && 'hover-open',
                ]
                    .filter(Boolean)
                    .join(' ')}
                aria-expanded={isOpen}
                aria-pressed={isClicked}
                onClick={() => {
                    onSelectFolder(categoryIndex, folderPath);
                }}
                icon={createBookmarkIcon(node.icon)}
            >
                {node.title}
            </BookmarkFolderButton>
            <FloatingNode id={aim.nodeId}>
                {layerRoot ? createPortal(submenu, layerRoot) : submenu}
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
    isParentOpen,
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
                        isParentOpen={isParentOpen}
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
    const renderContent = useRetainedMenuContent(isCategoryOpen);

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
            <BookmarkFolderButton
                ref={aim.refs.setReference}
                {...aim.getReferenceProps()}
                data-menu-row={String(categoryIndex)}
                className={categoryClassName}
                icon={categoryData.icon}
                aria-expanded={isCategoryOpen}
                aria-pressed={isCategoryClicked}
                onClick={() => {
                    onSelectCategory(categoryIndex);
                }}
            >
                {categoryData.category}
            </BookmarkFolderButton>
            <div
                className={`links ${isMouseNav ? 'hoverEffective' : ''}`}
                style={{ '--padding': padding } as React.CSSProperties}
            >
                <div className='panel' />
                {aim.triangle.length > 0 && (
                    <MenuSafetyTriangle points={aim.triangle} />
                )}
                <div
                    className='bookmark-category-items'
                    inert={!isCategoryOpen}
                    aria-hidden={!isCategoryOpen}
                    ref={aim.refs.setFloating}
                    {...aim.getFloatingProps({
                        onMouseEnter: aim.clearTriangle,
                    })}
                >
                    {renderContent && (
                        <BookmarkNodeList
                            categoryIndex={categoryIndex}
                            clickedFolderPath={clickedFolderPath}
                            currentFolderPath={[]}
                            depth={0}
                            highlightedFolderPath={highlightedFolderPath}
                            highlightedLinkId={highlightedLinkId}
                            isMouseNav={isMouseNav}
                            isParentOpen={isCategoryOpen}
                            nodes={categoryData.children}
                            onSelectFolder={onSelectFolder}
                            onSelectLink={onSelectLink}
                        />
                    )}
                </div>
            </div>
        </FloatingNode>
    );
};
