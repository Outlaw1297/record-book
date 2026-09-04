import { PRODUCT_NAME, PRODUCT_WORDMARK, TAGLINE_LINES } from '../brand';

type MarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Compact HerdLedger mark for headers, nav, and app icon contexts. */
export function BrandMark({ size = 40, className, title = PRODUCT_NAME }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <rect width="512" height="512" rx="108" fill="#3A2417" />
      <rect x="86" y="108" width="340" height="300" rx="28" fill="#F5F0E6" />
      <rect x="86" y="108" width="36" height="300" rx="10" fill="#A62F27" />
      <circle cx="292" cy="248" r="72" fill="#3A2417" />
      <circle cx="268" cy="232" r="14" fill="#F5F0E6" />
      <circle cx="316" cy="232" r="14" fill="#F5F0E6" />
      <path
        d="M220 212c-18-28-48-24-58-8 22 8 40 28 58 44 8-14 10-26 0-36Z"
        fill="#3A2417"
      />
      <path
        d="M364 212c18-28 48-24 58-8-22 8-40 28-58 44-8-14-10-26 0-36Z"
        fill="#3A2417"
      />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  showTagline?: boolean;
};

/** Full brand: mark + HERDLEDGER wordmark, optional tagline. */
export function BrandWordmark({ className, showTagline = true }: WordmarkProps) {
  return (
    <div className={className ?? 'brand-lockup'}>
      <BrandMark size={56} />
      <div>
        <p className="wordmark">{PRODUCT_WORDMARK}</p>
        {showTagline ? (
          <p className="tagline">
            {TAGLINE_LINES[0]}
            <br />
            {TAGLINE_LINES[1]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
