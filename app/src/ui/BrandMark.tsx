import markUrl from '../assets/herdledger-mark.png';
import wordmarkUrl from '../assets/herdledger-wordmark.png';
import { PRODUCT_NAME, TAGLINE } from '../brand';

type MarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Compact HerdLedger mark for headers, nav, and app icon contexts. */
export function BrandMark({ size = 40, className, title = PRODUCT_NAME }: MarkProps) {
  return (
    <img
      src={markUrl}
      width={size}
      height={size}
      className={className}
      alt={title}
      draggable={false}
    />
  );
}

type WordmarkProps = {
  className?: string;
  showTagline?: boolean;
};

/** Full brand: Hereford ledger mark + HERDLEDGER wordmark. */
export function BrandWordmark({ className, showTagline = true }: WordmarkProps) {
  const alt = showTagline ? `${PRODUCT_NAME}. ${TAGLINE}` : PRODUCT_NAME;
  return (
    <img
      src={wordmarkUrl}
      className={className ?? 'brand-wordmark'}
      alt={alt}
      draggable={false}
    />
  );
}
