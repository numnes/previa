import {
  extractClickupTaskId,
  maskClickupToken,
  parseClickupTaskRef,
  renderClickupCommentTemplate,
} from './clickup-task.util';

describe('clickup-task.util', () => {
  it('extracts custom task ids from branch names', () => {
    expect(extractClickupTaskId('cicm-4491')).toBe('CICM-4491');
    expect(extractClickupTaskId('feature/CICM-123')).toBe('CICM-123');
    expect(extractClickupTaskId('fix/abc-99-extra')).toBe('ABC-99');
  });

  it('returns null when no task id is present', () => {
    expect(extractClickupTaskId('main')).toBeNull();
    expect(extractClickupTaskId('feature/login')).toBeNull();
  });

  it('parses ClickUp URLs and bare ids', () => {
    expect(parseClickupTaskRef('https://app.clickup.com/t/86abc123')).toBe('86abc123');
    expect(parseClickupTaskRef('https://app.clickup.com/t/CICM-4491?comment=1')).toBe(
      'CICM-4491',
    );
    expect(parseClickupTaskRef('https://app.clickup.com/t/cicm-4491')).toBe('CICM-4491');
    expect(
      parseClickupTaskRef('https://app.clickup.com/123/v/li/456/t/86xyz789'),
    ).toBe('86xyz789');
    expect(parseClickupTaskRef('CICM-4491')).toBe('CICM-4491');
    expect(parseClickupTaskRef('cicm-4491')).toBe('CICM-4491');
    expect(parseClickupTaskRef('not a task')).toBeNull();
  });

  it('renders comment placeholders', () => {
    const out = renderClickupCommentTemplate(
      'Task {{task_id}} preview {{preview_link}} ({{project_name}} / {{branch_name}})',
      {
        task_id: 'cicm-1',
        preview_link: 'https://p.example/app/cicm-1/',
        project_name: 'app',
        branch_name: 'cicm-1',
      },
    );
    expect(out).toContain('cicm-1');
    expect(out).toContain('https://p.example/app/cicm-1/');
  });

  it('masks tokens', () => {
    expect(maskClickupToken('pk_secret1234')).toEqual({
      clickupApiTokenConfigured: true,
      clickupApiTokenLast4: '1234',
    });
    expect(maskClickupToken('')).toEqual({
      clickupApiTokenConfigured: false,
      clickupApiTokenLast4: '',
    });
  });
});
