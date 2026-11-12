import { expect, test } from 'bun:test';

import { getMessages } from '@/constants/i18n';
import { getSettingsSearchResults } from './settingsSearch';

test('finds setting values and synonyms rather than only category names', () => {
    for (const query of ['dark', '  DARK  ', 'appearance dark']) {
        expect(
            getSettingsSearchResults(getMessages('en'), query, '').map(
                (result) => result.id
            )
        ).toEqual(['theme']);
    }
    expect(getSettingsSearchResults(getMessages('en'), 'blue', '')[0]?.id).toBe(
        'accent'
    );
    expect(
        getSettingsSearchResults(
            getMessages('en'),
            'Taipei',
            'Taipei Tainan'
        )[0]?.id
    ).toBe('location');
    expect(getSettingsSearchResults(getMessages('en'), 'gps', '')[0]?.id).toBe(
        'location-tracking'
    );
    expect(getSettingsSearchResults(getMessages('en'), '中文', '')[0]?.id).toBe(
        'language'
    );
});

test('keeps translated result labels and category context', () => {
    expect(
        getSettingsSearchResults(getMessages('zh-TW'), '深色', '')[0]
    ).toMatchObject({
        id: 'theme',
        label: '主題',
        section: 'appearance',
        sectionLabel: '外觀',
    });
    expect(
        getSettingsSearchResults(getMessages('zh-TW'), 'dark', '')[0]?.id
    ).toBe('theme');
    expect(
        getSettingsSearchResults(getMessages('en'), 'unavailable setting', '')
    ).toEqual([]);
    expect(getSettingsSearchResults(getMessages('en'), ' ', '')).toEqual([]);
});

test('finds Quick Launch by its new name, old name, and bookmark-opening intent', () => {
    for (const locale of ['en', 'zh-TW'] as const) {
        for (const query of [
            'quick launch',
            '快速啟動',
            '/launch',
            '/feeds',
            '動態',
            'open tabs together',
        ]) {
            expect(
                getSettingsSearchResults(getMessages(locale), query, '')[0]
            ).toMatchObject({
                section: 'feeds',
                label: getMessages(locale).quickLaunch,
            });
        }
    }
});
