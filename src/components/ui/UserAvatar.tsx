import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

interface UserAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export function UserAvatar({
  name,
  src,
  size = 'md',
  className,
  onClick,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : size === 'lg'
        ? 'w-14 h-14 text-base'
        : 'w-9 h-9 text-xs';

  const initials = (name || 'U').trim().slice(0, 2).toUpperCase();
  const hasPhoto = Boolean(src) && !imgError;

  const content = (
    <div
      className={cn(
        'rounded-lg bg-blue-700/90 text-white font-semibold flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700',
        sizeClass,
        onClick && hasPhoto && 'cursor-pointer hover:ring-2 hover:ring-blue-600/40 transition-shadow',
        className
      )}
    >
      {hasPhoto ? (
        <img
          src={src!}
          alt={name || 'Foto Profil'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );

  if (onClick && hasPhoto) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Lihat foto profil"
        className="shrink-0 rounded-lg focus:outline-none"
      >
        {content}
      </button>
    );
  }

  return content;
}
