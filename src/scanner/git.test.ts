import { execFileSync } from 'child_process';
import { GitHelper } from './git';

jest.mock('child_process');
const mockedExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

describe('GitHelper', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('isGitRepo retorna true quando o comando git sucede', () => {
    mockedExecFileSync.mockReturnValue(Buffer.from('true'));
    expect(GitHelper.isGitRepo()).toBe(true);
  });

  it('isGitRepo retorna false quando o comando git falha', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(GitHelper.isGitRepo()).toBe(false);
  });

  it('isDirty retorna true quando git status --porcelain tem saída', () => {
    mockedExecFileSync.mockReturnValue(' M src/server.ts\n' as any);
    expect(GitHelper.isDirty()).toBe(true);
  });

  it('isDirty retorna false quando a árvore está limpa', () => {
    mockedExecFileSync.mockReturnValue('' as any);
    expect(GitHelper.isDirty()).toBe(false);
  });

  it('getCurrentBranch retorna o nome da branch sem espaços extras', () => {
    mockedExecFileSync.mockReturnValue('main\n' as any);
    expect(GitHelper.getCurrentBranch()).toBe('main');
  });

  it('getCurrentBranch retorna "unknown" se o comando falhar', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('fail');
    });
    expect(GitHelper.getCurrentBranch()).toBe('unknown');
  });

  it('assertCleanForApply lança quando o repositório Git está sujo', () => {
    mockedExecFileSync
      .mockReturnValueOnce(Buffer.from('true')) // isGitRepo
      .mockReturnValueOnce(' M src/server.ts\n' as any); // isDirty
    expect(() => GitHelper.assertCleanForApply()).toThrow(/requer um repositório Git limpo/);
  });

  it('assertCleanForApply não lança quando o repositório Git está limpo', () => {
    mockedExecFileSync
      .mockReturnValueOnce(Buffer.from('true')) // isGitRepo
      .mockReturnValueOnce('' as any); // isDirty
    expect(() => GitHelper.assertCleanForApply()).not.toThrow();
  });

  it('assertCleanForApply não lança fora de um repositório Git (nada para sujar)', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(() => GitHelper.assertCleanForApply()).not.toThrow();
  });
});