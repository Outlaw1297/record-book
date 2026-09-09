import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANCH_NAME,
  DOCUMENT_TITLE,
  PRODUCT_NAME,
  PRODUCT_WORDMARK,
  TAGLINE,
} from './brand';

describe('HerdLedger brand', () => {
  it('uses the one-word product name', () => {
    expect(PRODUCT_NAME).toBe('HerdLedger');
    expect(PRODUCT_WORDMARK).toBe('HERDLEDGER');
    expect(DEFAULT_RANCH_NAME).toBe('HerdLedger');
  });

  it('keeps the official tagline', () => {
    expect(TAGLINE).toBe('KNOW YOUR HERD. KNOW YOUR NUMBERS.');
    expect(DOCUMENT_TITLE).toContain('HerdLedger');
    expect(DOCUMENT_TITLE).toContain('Know Your Herd');
  });
});
