import { expect, test } from 'bun:test';

import { getSettingsSection, settingsSectionPaths } from './settingsNavigation';

test('Quick Launch settings use a descriptive route and retain the Feeds route', () => {
    expect(settingsSectionPaths.feeds).toBe('/settings/quick-launch');
    expect(getSettingsSection('/settings/quick-launch')).toBe('feeds');
    expect(getSettingsSection('/settings/feeds')).toBe('feeds');
    expect(getSettingsSection('/settings/unknown')).toBeUndefined();
});
