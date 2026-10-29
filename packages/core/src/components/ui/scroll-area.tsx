import * as React from 'react';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// shadcn radix-nova ScrollArea; horizontal/viewport props also serve inline math.
function ScrollArea({ className, children, orientation = 'vertical', viewportProps, inline = false, ...props }:
  React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
    orientation?: 'horizontal' | 'vertical';
    inline?: boolean;
    viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>;
  }) {
  const content = <><ScrollAreaPrimitive.Viewport {...viewportProps} data-slot="scroll-area-viewport"
      className={cn('size-full rounded-[inherit] outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50', viewportProps?.className)}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar orientation={orientation} />
    <ScrollAreaPrimitive.Corner />
  </>;
  return inline
    ? <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props} asChild><span>{content}</span></ScrollAreaPrimitive.Root>
    : <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...props}>{content}</ScrollAreaPrimitive.Root>;
}

function ScrollBar({ className, orientation = 'vertical', ...props }:
  React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return <ScrollAreaPrimitive.ScrollAreaScrollbar data-slot="scroll-area-scrollbar" data-orientation={orientation}
    orientation={orientation} className={cn(
      'flex touch-none select-none p-[0.0625rem] transition-colors',
      orientation === 'vertical' ? 'h-full w-2.5 border-s-[0.0625rem] border-s-transparent' : 'h-2.5 flex-col border-t-[0.0625rem] border-t-transparent', className,
    )} onClick={event => event.stopPropagation()} {...props}>
    <ScrollAreaPrimitive.ScrollAreaThumb data-slot="scroll-area-thumb" className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>;
}

export { ScrollArea, ScrollBar };
