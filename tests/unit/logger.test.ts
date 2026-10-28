import { describe, expect, it, vi } from 'vitest';
import { quietLogger, scrub } from '../../src/core/support/logger';

describe('консоль — тоже лог', () => {
  it('токены, коды и пароли не доходят', () => {
    expect(scrub('GET /sync?access_token=syt_abc_123&since=s1')).toBe('GET /sync?access_token=xxx&since=s1');
    expect(scrub('Authorization: Bearer mat_Secret123')).toBe('Authorization: Bearer xxx');
    expect(scrub('back to https://web.iskra.wtf/#code=ABC&state=def')).toBe('back to https://web.iskra.wtf/#code=xxx&state=xxx');
    expect(scrub('body {"refresh_token":"mar_zzz","password":"hunter2"}')).toBe('body {"refresh_token":"xxx","password":"xxx"}');
    expect(scrub('token syr_qwe in text')).toBe('token syr_xxx in text');
  });

  it('объект ошибки — именем и текстом, без его полей', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = Object.assign(new Error('Refresh failed for mat_SECRET'), { data: { access_token: 'syt_x' } });
    quietLogger().error('token refresh:', failure, { headers: { Authorization: 'Bearer y' } });
    expect(error).toHaveBeenCalledWith('token refresh: Error: Refresh failed for mat_xxx [object]');
    error.mockRestore();
  });
});
