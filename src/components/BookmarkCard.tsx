import { useRef } from 'react';
import { Link2, MoreVertical } from 'lucide-react';

const getBookmarkHost = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

export const BookmarkCard: React.FC<{
    bookmark: { title: string; url: string };
    sourceRef?: (element: Element | null) => void;
    onClick: () => void;
}> = ({ bookmark, sourceRef, onClick }) => (
    <button
        ref={sourceRef}
        type='button'
        className='bookmark-workspace-tree-item bookmark-link-item'
        onClick={onClick}
    >
        <Link2 aria-hidden='true' />
        <span className='bookmark-settings-link-copy'>
            <strong>{bookmark.title}</strong>
            <small>{getBookmarkHost(bookmark.url)}</small>
        </span>
    </button>
);

export const BookmarkActions: React.FC<{
    bookmark: { title: string; url?: string };
    onEdit: () => void;
    onDelete?: () => void;
    onAddToFeeds?: () => void;
    addToFeedsLabel?: string;
    labels: { edit: string; open: string; delete: string };
}> = ({
    bookmark,
    onEdit,
    onDelete,
    onAddToFeeds,
    addToFeedsLabel,
    labels,
}) => {
    const menuRef = useRef<HTMLDetailsElement>(null);
    const close = () => {
        if (menuRef.current) {
            menuRef.current.open = false;
        }
    };
    return (
        <details
            ref={menuRef}
            className='bookmark-row-menu'
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    close();
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    close();
                    menuRef.current?.querySelector('summary')?.focus();
                }
            }}
        >
            <summary
                aria-label={`${bookmark.title}: ${labels.edit}${bookmark.url ? `, ${labels.open}` : ''}${onAddToFeeds ? `, ${addToFeedsLabel}` : ''}${onDelete ? `, ${labels.delete}` : ''}`}
            >
                <MoreVertical aria-hidden='true' />
            </summary>
            <div className='bookmark-row-menu-content'>
                <button
                    type='button'
                    onClick={() => {
                        close();
                        onEdit();
                    }}
                >
                    {labels.edit}
                </button>
                {bookmark.url && (
                    <a
                        href={bookmark.url}
                        target='_blank'
                        rel='noreferrer'
                        onClick={close}
                    >
                        {labels.open}
                    </a>
                )}
                {onAddToFeeds && (
                    <button
                        type='button'
                        onClick={() => {
                            close();
                            onAddToFeeds();
                        }}
                    >
                        {addToFeedsLabel}
                    </button>
                )}
                {onDelete && (
                    <button
                        type='button'
                        className='danger'
                        onClick={() => {
                            close();
                            onDelete();
                        }}
                    >
                        {labels.delete}
                    </button>
                )}
            </div>
        </details>
    );
};
