import { useRef } from 'react';
import { Upload } from 'lucide-react';

import type { BookmarkControls } from '@/hooks/useBookmarks';

interface BookmarkEmptyStateProps {
    bookmarkControls: BookmarkControls;
    className?: string;
    ctaLabel: string;
    description: string;
    statusMessage?: string;
    statusType?: 'error' | 'success';
    title: string;
}

const browserBookmarkFileAccept = '.html,.htm,text/html';

export const BookmarkEmptyState: React.FC<BookmarkEmptyStateProps> = ({
    bookmarkControls,
    className,
    ctaLabel,
    description,
    statusMessage,
    statusType,
    title,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div
            className={['bookmark-empty-state', className]
                .filter(Boolean)
                .join(' ')}
        >
            <input
                className='bookmark-import-input'
                type='file'
                accept={browserBookmarkFileAccept}
                disabled={!bookmarkControls.canEdit}
                ref={fileInputRef}
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (fileInputRef.current !== null) {
                        fileInputRef.current.value = '';
                    }

                    if (file !== undefined) {
                        bookmarkControls
                            .importBookmarks(file)
                            .catch(() => undefined);
                    }
                }}
            />
            <div className='bookmark-empty-copy'>
                <span className='bookmark-empty-title'>{title}</span>
                <span className='bookmark-empty-description'>
                    {description}
                </span>
            </div>
            <button
                className='bookmark-empty-action'
                type='button'
                disabled={!bookmarkControls.canEdit}
                onClick={() => {
                    fileInputRef.current?.click();
                }}
            >
                <Upload className='icon' />
                <span>{ctaLabel}</span>
            </button>
            {statusMessage === undefined ? undefined : (
                <div
                    className={['bookmark-empty-status', statusType]
                        .filter(Boolean)
                        .join(' ')}
                    role='status'
                >
                    {statusMessage}
                </div>
            )}
        </div>
    );
};
