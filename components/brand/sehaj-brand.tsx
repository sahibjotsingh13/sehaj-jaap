import Image from 'next/image';

import { cn } from '@/lib/utils';

export function SehajBrand({
  compact = false,
  inverse = false,
  className,
}: {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'sehaj-brand inline-flex items-center gap-3',
        inverse && 'sehaj-brand-inverse',
        className,
      )}
    >
      <span className="brand-logo-shell size-11 shrink-0" aria-hidden="true">
        <Image
          alt=""
          className="size-full"
          height={48}
          priority
          src="/sehaj-jaap-mark.svg"
          width={48}
        />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block font-heading text-[1.08rem] font-semibold leading-none tracking-[-.025em]">
            Sehaj Jaap
          </span>
          <span className="mt-1 block font-gurmukhi text-[11px] tracking-[.08em] opacity-60">
            ਸਹਿਜ ਜਾਪ
          </span>
        </span>
      )}
    </span>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('brand-logo-shell', className)} aria-hidden="true">
      <Image
        alt=""
        className="size-full"
        height={48}
        priority
        src="/sehaj-jaap-mark.svg"
        width={48}
      />
    </span>
  );
}
