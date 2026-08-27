import { describe, expect, it } from 'vitest';
import { RECORD_BOOK_FOLDER } from './types';
import { noSharedBookDetail } from './statusCopy';

describe('universal shared book', () => {
  it('keeps herd files under RecordBook in the chosen folder', () => {
    expect(RECORD_BOOK_FOLDER).toBe('RecordBook');
  });

  it('does not require a ranch server or developer keys', () => {
    expect(noSharedBookDetail()).toMatch(/Choose a shared folder/);
    expect(noSharedBookDetail()).not.toMatch(/Ranch API is not set/);
    expect(noSharedBookDetail()).not.toMatch(/GitHub/);
  });
});
