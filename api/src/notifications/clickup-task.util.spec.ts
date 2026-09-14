import {
  extractClickupTaskId,
  extractRelatedNativeTaskIds,
  maskClickupToken,
  mergeClickupSearchIds,
  parseClickupTaskRef,
  renderClickupCommentTemplate,
} from './clickup-task.util';

describe('clickup-task.util', () => {
  it('extracts custom task ids from branch names', () => {
    expect(extractClickupTaskId('proj-4491')).toBe('PROJ-4491');
    expect(extractClickupTaskId('feature/PROJ-123')).toBe('PROJ-123');
    expect(extractClickupTaskId('fix/abc-99-extra')).toBe('ABC-99');
  });

  it('returns null when no task id is present', () => {
    expect(extractClickupTaskId('main')).toBeNull();
    expect(extractClickupTaskId('feature/login')).toBeNull();
  });

  it('parses ClickUp URLs and bare ids', () => {
    expect(parseClickupTaskRef('https://app.clickup.com/t/86abc123')).toBe('86abc123');
    expect(parseClickupTaskRef('https://app.clickup.com/t/PROJ-4491?comment=1')).toBe(
      'PROJ-4491',
    );
    expect(parseClickupTaskRef('https://app.clickup.com/t/proj-4491')).toBe('PROJ-4491');
    expect(
      parseClickupTaskRef('https://app.clickup.com/123/v/li/456/t/86xyz789'),
    ).toBe('86xyz789');
    expect(parseClickupTaskRef('PROJ-4491')).toBe('PROJ-4491');
    expect(parseClickupTaskRef('proj-4491')).toBe('PROJ-4491');
    expect(parseClickupTaskRef('not a task')).toBeNull();
  });

  it('extracts related native ids from linked_tasks and dependencies', () => {
    expect(
      extractRelatedNativeTaskIds(
        {
          id: 'aaa',
          linked_tasks: [
            { task_id: 'aaa', link_id: 'bbb' },
            { task_id: 'ccc', link_id: 'aaa' },
          ],
          dependencies: [{ task_id: 'aaa', depends_on: 'ddd' }],
        },
        'aaa',
      ),
    ).toEqual(['bbb', 'ccc', 'ddd']);
  });

  it('merges searchable ClickUp ids without duplicates', () => {
    expect(mergeClickupSearchIds(['proj-1', 'abc'], ['PROJ-1', 'def', ''])).toEqual([
      'PROJ-1',
      'abc',
      'def',
    ]);
  });

  it('renders comment placeholders', () => {
    const out = renderClickupCommentTemplate(
      'Task {{task_id}} preview {{preview_link}} ({{project_name}} / {{branch_name}})',
      {
        task_id: 'proj-1',
        preview_link: 'https://p.example/app/proj-1/',
        project_name: 'app',
        branch_name: 'proj-1',
      },
    );
    expect(out).toContain('proj-1');
    expect(out).toContain('https://p.example/app/proj-1/');
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
