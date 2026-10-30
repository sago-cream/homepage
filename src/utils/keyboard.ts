const bopomofoToLatinKeyMap: Partial<Record<string, string>> = {
    ㄆ: 'q',
    ㄇ: 'a',
    ㄈ: 'z',
    ㄊ: 'w',
    ㄋ: 's',
    ㄌ: 'x',
    ㄍ: 'e',
    ㄎ: 'd',
    ㄏ: 'c',
    ㄐ: 'r',
    ㄑ: 'f',
    ㄒ: 'v',
    ㄔ: 't',
    ㄕ: 'g',
    ㄖ: 'b',
    ㄗ: 'y',
    ㄘ: 'h',
    ㄙ: 'n',
    ㄧ: 'u',
    ㄨ: 'j',
    ㄩ: 'm',
    ㄛ: 'i',
    ㄜ: 'k',
    ㄟ: 'o',
    ㄠ: 'l',
    ㄣ: 'p',
    ㄥ: '/',
};

export const getLatinKeySequenceAlias = (query: string): string | undefined => {
    let alias = '';
    let hasBopomofo = false;

    for (const char of query) {
        const latinKey = bopomofoToLatinKeyMap[char];
        if (latinKey === undefined) {
            alias += char;
            continue;
        }

        hasBopomofo = true;
        alias += latinKey;
    }

    return hasBopomofo ? alias : undefined;
};

export const getKeyboardKey = (
    event: Pick<KeyboardEvent, 'key' | 'code'>
): string => {
    if (event.key === 'Process' || event.key === 'Unidentified') {
        const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
        return (
            letter?.toLowerCase() ?? (event.code === 'Slash' ? '/' : event.key)
        );
    }

    return getLatinKeySequenceAlias(event.key) ?? event.key;
};
