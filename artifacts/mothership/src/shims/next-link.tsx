import * as React from 'react';
import { Link as WLink, useLocation } from 'wouter';

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;
interface NextLinkProps extends Omit<AnchorProps, 'href'> {
  href: string | { pathname: string; query?: Record<string, string | number | undefined> };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
  as?: string;
  children?: React.ReactNode;
}

function toHref(href: NextLinkProps['href']): string {
  if (typeof href === 'string') return href;
  const qs = href.query
    ? '?' +
      Object.entries(href.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return href.pathname + qs;
}

const Link = React.forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, locale, as, ...rest },
  ref,
) {
  const target = toHref(href);
  // External links use a normal <a>
  if (/^https?:\/\//i.test(target) || target.startsWith('mailto:') || target.startsWith('tel:')) {
    return (
      <a ref={ref} href={target} {...rest}>
        {children}
      </a>
    );
  }
  return (
    // @ts-ignore
    <WLink href={target} asChild>
      <a ref={ref} {...rest}>
        {children}
      </a>
    </WLink>
  );
});

export default Link;
export { Link };
