'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type UserAvatarProps = {
  src?: string | null;
  alt: string;
  className?: string;
};

const DEFAULT_AVATAR_SRC = '/default-avatar.png';

export function UserAvatar({ src, alt, className }: UserAvatarProps) {
  const [imgSrc, setImgSrc] = useState(src || DEFAULT_AVATAR_SRC);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      className={cn('rounded-full object-cover', className)}
      onError={() => {
        if (imgSrc !== DEFAULT_AVATAR_SRC) {
          setImgSrc(DEFAULT_AVATAR_SRC);
        }
      }}
    />
  );
}
