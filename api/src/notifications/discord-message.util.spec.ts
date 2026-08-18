import {
  buildPreviewUrl,
  DEFAULT_DISCORD_MESSAGE_TEMPLATE,
  parseDiscordNotifyStatuses,
  renderDiscordMessageTemplate,
  serializeDiscordNotifyStatuses,
} from './discord-message.util';

describe('discord-message.util', () => {
  it('renders template placeholders', () => {
    const out = renderDiscordMessageTemplate(
      'Branch {{branch_name}} / {{project_name}}: {{old_status}} -> {{new_status}}\n{{preview_link}}\n{{branch_page}}',
      {
        branch_name: 'feature/foo',
        project_name: 'my-app',
        old_status: 'deploying',
        new_status: 'active',
        preview_link: 'https://preview.example.com/my-app/feature-foo/',
        branch_page: 'https://dashboard.example.com/instances/uuid',
      },
    );
    expect(out).toContain('feature/foo');
    expect(out).toContain('my-app');
    expect(out).toContain('deploying -> active');
    expect(out).toContain('https://preview.example.com/my-app/feature-foo/');
    expect(out).toContain('/instances/uuid');
  });

  it('uses default template constant in English', () => {
    expect(DEFAULT_DISCORD_MESSAGE_TEMPLATE).toContain('{{branch_name}}');
    expect(DEFAULT_DISCORD_MESSAGE_TEMPLATE).toContain('{{preview_link}}');
  });

  it('parses notify statuses JSON', () => {
    expect(parseDiscordNotifyStatuses('["active","error"]')).toEqual([
      'active',
      'error',
    ]);
    expect(parseDiscordNotifyStatuses('invalid')).toEqual([
      'active',
      'error',
      'paused',
      'deleted',
    ]);
  });

  it('serializes notify statuses', () => {
    expect(serializeDiscordNotifyStatuses(['active', 'bogus', 'paused'])).toBe(
      '["active","paused"]',
    );
  });

  it('builds preview url', () => {
    expect(
      buildPreviewUrl(
        { slug: 'app', serverUrl: 'https://host/' },
        'main',
        'main',
      ),
    ).toBe('https://host/app/main/');
  });
});
