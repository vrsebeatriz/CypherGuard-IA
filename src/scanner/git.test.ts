import { execSync } from 'child_process';
import { GitHelper } from './git';

jest.mock('child_process');
const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('GitHelper', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('isGitRepo retorna true quando o comando git sucede', () => {
    mockedExecSync.mockReturnValue(Buffer.from('true'));
    expect(GitHelper.isGitRepo()).toBe(true);
  });

  it('isGitRepo retorna false quando o comando git falha', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(GitHelper.isGitRepo()).toBe(false);
  });

  it('isDirty retorna true quando git status --porcelain tem saída', () => {
    mockedExecSync.mockReturnValue(' M src/server.ts\n' as any);
    expect(GitHelper.isDirty()).toBe(true);
  });

  it('isDirty retorna false quando a árvore está limpa', () => {
    mockedExecSync.mockReturnValue('' as any);
    expect(GitHelper.isDirty()).toBe(false);
  });

  it('getCurrentBranch retorna o nome da branch sem espaços extras', () => {
    mockedExecSync.mockReturnValue('main\n' as any);
    expect(GitHelper.getCurrentBranch()).toBe('main');
  });

  it('getCurrentBranch retorna "unknown" se o comando falhar', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(GitHelper.getCurrentBranch()).toBe('unknown');
  });
});
