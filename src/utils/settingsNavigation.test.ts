import { expect, test } from 'bun:test';

import { getSettingsSection, settingsSectionPaths } from './settingsNavigation';

test('Quick Launch settings resolve only their canonical route', () => {
    expect(settingsSectionPaths.quickLaunch).toBe('/settings/quick-launch');
    expect(getSettingsSection('/settings/quick-launch')).toBe('quickLaunch');
    expect(getSettingsSection('/settings/feeds')).toBeUndefined();
    expect(getSettingsSection('/settings/unknown')).toBeUndefined();
});
