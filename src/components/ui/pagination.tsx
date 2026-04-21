import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
} & React.ComponentProps<'button'>;

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  const sizeClasses = {
    default: 'h-7 min-w-[1rem] p-0.5 text-[9px]',
    sm: 'h-3 min-w-[1.5rem] p-0.5 text-[9px]',
    lg: 'h-4 min-w-[1.5rem] p-0.5 text-[9px]',
    icon: 'h-8 w-8',
  } as const;

  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        'text-[12px] inline-flex items-center justify-center rounded-md bg-background font-medium hover:border-[var(--color-border-strong)] hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        sizeClasses[size],
        isActive
          ? 'border border-[var(--color-text-muted)] bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:border-primary/80 hover:bg-muted hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn('gap-1 px-2.5 border-none', className)}
      {...props}
    >
      <ChevronLeftIcon className="size-4" />
      <span className="hidden sm:block text-[12px]">Prev</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn('gap-1 px-2.5 border-none', className)}
      {...props}
    >
      <span className="hidden sm:block text-[12px]">Next</span>
      <ChevronRightIcon className="size-4" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4 text-[var(--color-text-muted)]" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
