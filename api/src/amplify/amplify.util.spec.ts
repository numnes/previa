import {
  amplifyBranchPreviewUrl,
  amplifySlotUsage,
  DEFAULT_AMPLIFY_BRANCH_SLOT_LIMIT,
  isAmplifyBranchHidden,
  maskAmplifyAccessKey,
  parseAmplifyHiddenBranches,
  parseAmplifySlotLimit,
  serializeAmplifyHiddenBranches,
} from './amplify.util';

describe('amplify.util', () => {
  it('parses hidden branches from lines, commas, and JSON', () => {
    expect(parseAmplifyHiddenBranches('main\ndevelop\n')).toEqual([
      'main',
      'develop',
    ]);
    expect(parseAmplifyHiddenBranches('main, develop, main')).toEqual([
      'main',
      'develop',
    ]);
    expect(parseAmplifyHiddenBranches('["main","develop"]')).toEqual([
      'main',
      'develop',
    ]);
    expect(parseAmplifyHiddenBranches('')).toEqual([]);
    expect(parseAmplifyHiddenBranches(null)).toEqual([]);
  });

  it('serializes hidden branches as unique lines', () => {
    expect(serializeAmplifyHiddenBranches(['main', ' Main ', 'develop'])).toBe(
      'main\ndevelop',
    );
  });

  it('matches hidden branches case-insensitively', () => {
    expect(isAmplifyBranchHidden('main', ['main'])).toBe(true);
    expect(isAmplifyBranchHidden('Main', ['main'])).toBe(true);
    expect(isAmplifyBranchHidden('proj-1024', ['main'])).toBe(false);
  });

  it('builds the default Amplify preview URL', () => {
    expect(
      amplifyBranchPreviewUrl('d0exampleappid.amplifyapp.com', 'proj-1024'),
    ).toBe('https://proj-1024.d0exampleappid.amplifyapp.com');
    expect(
      amplifyBranchPreviewUrl(
        'https://d123.amplifyapp.com/',
        'feature/checkout',
      ),
    ).toBe('https://feature-checkout.d123.amplifyapp.com');
    expect(amplifyBranchPreviewUrl(null, 'main')).toBeNull();
  });

  it('parses branch slot limit with the AWS default of 50', () => {
    expect(parseAmplifySlotLimit(null)).toBe(DEFAULT_AMPLIFY_BRANCH_SLOT_LIMIT);
    expect(parseAmplifySlotLimit('')).toBe(50);
    expect(parseAmplifySlotLimit('50')).toBe(50);
    expect(parseAmplifySlotLimit('0')).toBe(50);
    expect(parseAmplifySlotLimit('80')).toBe(80);
    expect(amplifySlotUsage(6, 50)).toEqual({
      slotUsed: 6,
      slotLimit: 50,
      slotAvailable: 44,
    });
  });

  it('masks access keys', () => {
    expect(maskAmplifyAccessKey('AKIAEXAMPLE1234')).toEqual({
      amplifyAccessKeyConfigured: true,
      amplifyAccessKeyLast4: '1234',
    });
    expect(maskAmplifyAccessKey('')).toEqual({
      amplifyAccessKeyConfigured: false,
      amplifyAccessKeyLast4: '',
    });
  });
});
