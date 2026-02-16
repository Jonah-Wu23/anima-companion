import React from 'react';
import Image from 'next/image';
import { resolveModelThumbnailPath, type ModelInfo } from '@/lib/wardrobe/model-registry';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelCardProps {
  model: ModelInfo;
  isActive: boolean;
  isPreview: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function ModelCard({ 
  model, 
  isActive, 
  isPreview, 
  onClick, 
  className,
  style,
}: ModelCardProps) {
  const thumbnailSrc = resolveModelThumbnailPath(model);

  return (
    <button
      onClick={onClick}
      style={style}
      className={cn(
        'group relative w-full text-left rounded-xl overflow-hidden transition-all duration-200',
        'border-2 hover:shadow-lg',
        isActive 
          ? 'border-sky-500 bg-sky-50/50 shadow-md shadow-sky-500/10' 
          : isPreview
            ? 'border-cyan-400 bg-cyan-50/30 shadow-md shadow-cyan-500/10'
            : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white',
        className
      )}
    >
      {/* Card Content */}
      <div className="p-3">
        {/* Thumbnail Placeholder */}
        <div className={cn(
          'relative aspect-square rounded-lg mb-2 overflow-hidden',
          'bg-gradient-to-br from-slate-100 to-slate-200',
          'flex items-center justify-center'
        )}>
          {thumbnailSrc ? (
            <Image
              src={thumbnailSrc}
              alt={`${model.name}缩略图`}
              fill
              unoptimized
              sizes="(max-width: 768px) 140px, 180px"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="text-2xl font-bold text-slate-300">
              {model.name.charAt(0)}
            </span>
          )}
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Status Badges */}
          {isActive && (
            <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          
          {isPreview && !isActive && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-cyan-500 rounded text-[10px] font-medium text-white shadow-sm">
              预览
            </div>
          )}
          
          {/* Priority Badge (for featured models) */}
          {model.priority <= 3 && (
            <div className="absolute top-1.5 left-1.5">
              <Sparkles className={cn(
                'w-4 h-4',
                model.priority === 1 ? 'text-yellow-500' : 'text-sky-400'
              )} />
            </div>
          )}
        </div>
        
        {/* Text Info */}
        <div className="space-y-0.5">
          <h4 className="font-semibold text-sm text-slate-800 line-clamp-1 group-hover:text-sky-600 transition-colors">
            {model.name}
          </h4>
          <p className="text-xs text-slate-500 line-clamp-1">
            {model.description}
          </p>
        </div>
        
        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {model.tags.slice(0, 2).map((tag) => (
            <span 
              key={tag}
              className={cn(
                'px-1.5 py-0.5 text-[10px] rounded-full',
                isActive || isPreview
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-slate-100 text-slate-600'
              )}
            >
              {tag}
            </span>
          ))}
          {model.tags.length > 2 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-500">
              +{model.tags.length - 2}
            </span>
          )}
        </div>
      </div>
      
      {/* Hover Glow Effect */}
      <div className={cn(
        'absolute inset-0 rounded-xl pointer-events-none transition-opacity',
        'bg-gradient-to-br from-sky-400/0 via-sky-400/0 to-cyan-400/0',
        'group-hover:from-sky-400/5 group-hover:via-sky-400/2 group-hover:to-cyan-400/5'
      )} />
    </button>
  );
}
