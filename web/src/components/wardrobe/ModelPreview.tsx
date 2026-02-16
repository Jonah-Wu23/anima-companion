import React from 'react';
import Image from 'next/image';
import { resolveModelThumbnailPath, type ModelInfo } from '@/lib/wardrobe/model-registry';
import { Sparkles, User, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelPreviewProps {
  model: ModelInfo;
  isPreview: boolean;
}

export function ModelPreview({ model, isPreview }: ModelPreviewProps) {
  const thumbnailSrc = resolveModelThumbnailPath(model);

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className={cn(
        'relative w-full max-w-2xl aspect-square max-h-[70vh]',
        'rounded-3xl overflow-hidden transition-all duration-500',
        isPreview && 'animate-pulse-glow'
      )}>
        {/* Glass Panel */}
        <div className={cn(
          'absolute inset-0 rounded-3xl',
          'bg-white/40 backdrop-blur-xl',
          'border border-white/60',
          'shadow-2xl shadow-slate-200/50'
        )}>
          {/* Preview Content */}
          <div className="relative w-full h-full flex flex-col items-center justify-center p-8">
            {/* Large Avatar Placeholder */}
            <div className={cn(
              'w-48 h-48 lg:w-64 lg:h-64 rounded-full mb-8',
              'bg-gradient-to-br from-sky-100 via-cyan-50 to-sky-100',
              'border-4 border-white shadow-xl',
              'flex items-center justify-center',
              'relative overflow-hidden'
            )}>
              {thumbnailSrc ? (
                <Image
                  src={thumbnailSrc}
                  alt={`${model.name}预览图`}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 192px, 256px"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span className="text-6xl lg:text-8xl font-bold bg-gradient-to-br from-sky-400 to-cyan-600 bg-clip-text text-transparent">
                  {model.name.charAt(0)}
                </span>
              )}

              {/* Decorative Rings */}
              <div className="absolute inset-0 rounded-full border-2 border-sky-200/50" />
              <div className="absolute inset-2 rounded-full border border-cyan-200/30" />
              
              {/* Preview Badge */}
              {isPreview && (
                <div className="absolute -top-2 -right-2 px-3 py-1 bg-cyan-500 text-white text-sm font-medium rounded-full shadow-lg">
                  预览模式
                </div>
              )}
            </div>
            
            {/* Model Info */}
            <div className="text-center space-y-3">
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-800">
                {model.name}
              </h2>
              
              {model.nameEn && (
                <p className="text-lg text-slate-400 font-medium">
                  {model.nameEn}
                </p>
              )}
              
              <p className="text-slate-600 max-w-md mx-auto leading-relaxed">
                {model.description}
              </p>
              
              {/* Meta Info */}
              <div className="flex items-center justify-center gap-4 text-sm text-slate-500">
                {model.author && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>{model.author}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  <span>{model.tags.join(' · ')}</span>
                </div>
              </div>
              
              {/* Tags */}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {model.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      'bg-sky-100 text-sky-700',
                      'border border-sky-200'
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute top-6 right-6 w-20 h-20 rounded-full bg-gradient-to-br from-sky-200/30 to-cyan-200/20 blur-2xl" />
          <div className="absolute bottom-6 left-6 w-32 h-32 rounded-full bg-gradient-to-br from-cyan-200/20 to-sky-200/30 blur-3xl" />
          
          {/* Corner Accents */}
          <div className="absolute top-0 left-0 w-16 h-16 overflow-hidden">
            <div className="absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-br from-sky-400/20 to-transparent rotate-45" />
          </div>
          <div className="absolute bottom-0 right-0 w-16 h-16 overflow-hidden">
            <div className="absolute -bottom-8 -right-8 w-16 h-16 bg-gradient-to-tl from-cyan-400/20 to-transparent rotate-45" />
          </div>
        </div>
        
        {/* Priority Indicator */}
        {model.priority <= 3 && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-white/80 backdrop-blur rounded-full shadow-sm border border-white/60">
            <Sparkles className={cn(
              'w-4 h-4',
              model.priority === 1 ? 'text-yellow-500' : 'text-sky-500'
            )} />
            <span className="text-xs font-medium text-slate-700">
              {model.priority === 1 ? '默认装扮' : '推荐'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
