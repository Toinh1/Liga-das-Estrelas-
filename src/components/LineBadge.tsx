import React from 'react';
import { Shield } from 'lucide-react';

interface LineBadgeInput {
  name?: string;
  lineName?: string;
  shortName: string;
  colorHex: string;
  textColorHex: string;
}

interface LineBadgeProps {
  line?: LineBadgeInput;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

export const LineBadge: React.FC<LineBadgeProps> = ({
  line,
  size = 'md',
  showName = true,
}) => {
  if (!line) {
    return <span className="text-xs text-slate-500">Sem linha</span>;
  }

  const displayName = line.name || line.lineName || 'Linha';

  const sizeClasses =
    size === 'sm'
      ? 'w-6 h-6 text-[10px]'
      : size === 'lg'
      ? 'w-11 h-11 text-xs'
      : 'w-8 h-8 text-[11px]';

  return (
    <div className="inline-flex items-center gap-2.5 min-w-0">
      <div
        className={`${sizeClasses} rounded-xl font-extrabold flex items-center justify-center shrink-0 shadow-md border border-white/20`}
        style={{
          backgroundColor: line.colorHex,
          color: line.textColorHex,
        }}
        title={displayName}
      >
        {line.shortName || <Shield className="w-4 h-4" />}
      </div>
      {showName && (
        <span className="font-semibold text-slate-100 truncate">{displayName}</span>
      )}
    </div>
  );
};
