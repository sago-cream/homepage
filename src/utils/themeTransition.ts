import { themeResolvedStorageKey, themeStorageKey } from '@/constants/theme';
import { createBlobPath } from '@/hooks/themeTransitionUtils';
import { writePreferenceCookie } from '@/utils/preferenceCookies';

interface ThemeTransitionOptions {
    button: HTMLButtonElement;
    isDarkMode: boolean;
}

let activeThemeTransition: ViewTransition | undefined;

const applyTheme = (nextDarkMode: boolean) => {
    const nextTheme = nextDarkMode ? 'dark' : 'light';
    const root = globalThis.document.documentElement;

    root.dataset.theme = nextTheme;
    root.dataset.themeMode = nextTheme;
    root.style.colorScheme = nextTheme;
    globalThis.localStorage.setItem(themeStorageKey, nextTheme);
    writePreferenceCookie(themeStorageKey, nextTheme);
    writePreferenceCookie(themeResolvedStorageKey, nextTheme);
};

export const runThemeTransition = ({
    button,
    isDarkMode,
}: ThemeTransitionOptions): boolean => {
    const searchSelector = '.search';
    const searchIconSelector = '.search-icon .icon';
    const transitionXVar = '--theme-transition-x';
    const transitionYVar = '--theme-transition-y';
    const transitionEndVar = '--theme-transition-end';
    const blobStartRadius = 14;
    const blobStartIrregularity = 0.2;
    const blobFrameConfigs = [
        { radiusMultiplier: 0.2, irregularity: 1.35, offset: 0.08 },
        { radiusMultiplier: 0.35, irregularity: 2.4, offset: 0.18 },
        { radiusMultiplier: 0.56, irregularity: 1.1, offset: 0.34 },
        { radiusMultiplier: 0.84, irregularity: 2.9, offset: 0.52 },
        { radiusMultiplier: 1.22, irregularity: 1.7, offset: 0.72 },
        { radiusMultiplier: 1.95, irregularity: 0, offset: 1 },
    ];
    const circleScalePeak = 1.16;
    const circleScaleEnd = 1.05;
    const circleMidScale = 0.52;
    const circleMidOffset = 0.56;
    const darkModeDuration = 1600;
    const lightModeDuration = 800;
    const darkModeEasing = 'linear';
    const lightBaseEasing = 'linear';
    const lightMidExpandEasing = 'cubic-bezier(0.33, 0.6, 0.4, 1)';
    const lightFinalExpandEasing = 'cubic-bezier(0.16, 0.9, 0.22, 1)';

    const root = globalThis.document.documentElement;
    const nextDarkMode = !isDarkMode;
    const searchElement = globalThis.document.querySelector(searchSelector);
    const searchRect = searchElement?.getBoundingClientRect();
    let transitionCenterX = globalThis.innerWidth / 2;
    let transitionCenterY = globalThis.innerHeight / 2;

    if (searchRect) {
        transitionCenterX = searchRect.left + searchRect.width / 2;
        transitionCenterY = searchRect.top + searchRect.height / 2;
    }

    const transitionMaxRadius = Math.hypot(
        Math.max(transitionCenterX, globalThis.innerWidth - transitionCenterX),
        Math.max(transitionCenterY, globalThis.innerHeight - transitionCenterY)
    );

    const buttonRect = button.getBoundingClientRect();
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;

    root.style.setProperty(transitionXVar, `${transitionCenterX}px`);
    root.style.setProperty(transitionYVar, `${transitionCenterY}px`);
    root.style.setProperty(transitionEndVar, `${transitionMaxRadius}px`);

    const pathFrames = [
        {
            clipPath: `path('${createBlobPath(transitionCenterX, transitionCenterY, blobStartRadius, blobStartIrregularity, 1)}')`,
            offset: 0,
        },
        ...blobFrameConfigs.map(
            ({ radiusMultiplier, irregularity, offset }) => ({
                clipPath: `path('${createBlobPath(transitionCenterX, transitionCenterY, transitionMaxRadius * radiusMultiplier, irregularity, 1)}')`,
                offset,
            })
        ),
    ];

    if ('startViewTransition' in globalThis.document) {
        const transition = (
            globalThis.document as Document & {
                startViewTransition: (callback: () => void) => ViewTransition;
            }
        ).startViewTransition(() => {
            // Capture the old view first, then reveal settled theme colors instead of repainting
            // ordinary CSS transitions underneath it.
            root.dataset.themeTransition = 'active';
            applyTheme(nextDarkMode);
        });
        activeThemeTransition = transition;

        const restoreTransitions = () => {
            // A superseded transition must not restore styles mid-reveal.
            if (activeThemeTransition === transition) {
                delete root.dataset.themeTransition;
                activeThemeTransition = undefined;
            }
        };
        transition.finished.then(restoreTransitions, restoreTransitions);

        transition.ready
            .then(() => {
                const searchIcon =
                    globalThis.document.querySelector(searchIconSelector);
                const searchIconRect = searchIcon?.getBoundingClientRect();
                const searchIconCenterX = searchIconRect
                    ? searchIconRect.left + searchIconRect.width / 2
                    : buttonCenterX;
                const searchIconCenterY = searchIconRect
                    ? searchIconRect.top + searchIconRect.height / 2
                    : buttonCenterY;
                const circularMaxRadius = Math.hypot(
                    Math.max(
                        searchIconCenterX,
                        globalThis.innerWidth - searchIconCenterX
                    ),
                    Math.max(
                        searchIconCenterY,
                        globalThis.innerHeight - searchIconCenterY
                    )
                );
                const circleCenter = `${(searchIconCenterX / globalThis.innerWidth) * 100}% ${(searchIconCenterY / globalThis.innerHeight) * 100}%`;
                const circleRadiusPercent =
                    (circularMaxRadius /
                        (Math.hypot(
                            globalThis.innerWidth,
                            globalThis.innerHeight
                        ) /
                            Math.SQRT2)) *
                    100;
                const circleFrames = [
                    {
                        clipPath: `circle(0% at ${circleCenter})`,
                        offset: 0,
                        easing: lightMidExpandEasing,
                    },
                    {
                        clipPath: `circle(${circleRadiusPercent * circleMidScale}% at ${circleCenter})`,
                        offset: circleMidOffset,
                        easing: lightFinalExpandEasing,
                    },
                    {
                        clipPath: `circle(${circleRadiusPercent * circleScalePeak}% at ${circleCenter})`,
                        offset: 0.9,
                    },
                    {
                        clipPath: `circle(${circleRadiusPercent * circleScaleEnd}% at ${circleCenter})`,
                        offset: 1,
                    },
                ];

                root.animate(nextDarkMode ? pathFrames : circleFrames, {
                    duration: nextDarkMode
                        ? darkModeDuration
                        : lightModeDuration,
                    easing: nextDarkMode ? darkModeEasing : lightBaseEasing,
                    fill: 'both',
                    pseudoElement: '::view-transition-new(root)',
                });
            })
            .catch(() => {
                // Skipping still runs the update callback. Reapplying here could overwrite the
                // theme chosen by a newer transition.
                transition.skipTransition();
            });

        return nextDarkMode;
    }

    applyTheme(nextDarkMode);
    return nextDarkMode;
};
