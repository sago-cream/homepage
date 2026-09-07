import type { StaticImageData } from 'next/image';

import { useWallpaper } from '@/hooks/useWallpaper';
import { getWallpaperStyle } from '@/utils/wallpaperStyle';
import backSrc from '../assets/images/mountain/back.svg';
import frontSrc from '../assets/images/mountain/front.svg';
import midSrc from '../assets/images/mountain/mid.svg';

type ImageAsset = StaticImageData | string;

const getImageSrc = (asset: ImageAsset): string =>
    typeof asset === 'string' ? asset : asset.src;

export const Mountains: React.FC = () => {
    const wallpaper = useWallpaper()?.wallpaper;

    return (
        <div
            className='mountains'
            data-wallpaper={wallpaper === undefined ? undefined : 'custom'}
            style={getWallpaperStyle(wallpaper)}
        >
            <img
                className='parallax-back'
                src={getImageSrc(backSrc)}
                loading='eager'
                decoding='async'
                fetchPriority='low'
                alt='a flat-color mountain in the background'
            />
            <img
                className='parallax-mid'
                src={getImageSrc(midSrc)}
                loading='eager'
                decoding='async'
                fetchPriority='low'
                alt='a flat-color mountain in the middle'
            />
            <img
                src={getImageSrc(frontSrc)}
                loading='eager'
                decoding='async'
                fetchPriority='high'
                alt='a flat-color mountain in the foreground'
            />
        </div>
    );
};
