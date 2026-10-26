import { useSyncExternalStore, type ReactNode } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

const desktopQuery = '(min-width: 56.25rem)';
function subscribeDesktop(onChange: () => void) {
  const media = matchMedia(desktopQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const isDesktop = () => matchMedia(desktopQuery).matches;

export function WorkspacePanels({ source, preview, combined, direction, label, instanceId }: {
  instanceId?: string;
  source: ReactNode;
  preview: ReactNode;
  combined: boolean;
  direction: 'rtl' | 'ltr';
  label: string;
}) {
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop);
  const resizable = desktop && combined;

  // Keep both editors mounted across breakpoints so native selections and the
  // rich editor's history survive switching between mobile and desktop.
  return (
    <ResizablePanelGroup
      id={instanceId ? `document-panes-${instanceId}` : "document-panes"}
      className="workspace-panels"
      orientation="horizontal"
      dir={direction}
      disabled={!resizable}
      data-resizable={resizable}
      style={{ overflow: 'visible' }}
    >
      <ResizablePanel id={instanceId ? `source-pane-size-${instanceId}` : "source-pane-size"} defaultSize="50%" minSize="20rem" style={{ overflow: 'visible' }}>
        {source}
      </ResizablePanel>
      <ResizableHandle withHandle className="workspace-resize-handle" aria-label={label} title={label} />
      <ResizablePanel id={instanceId ? `preview-pane-size-${instanceId}` : "preview-pane-size"} defaultSize="50%" minSize="20rem" style={{ overflow: 'visible' }}>
        {preview}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
