import { memo } from 'react';
import type { Direction } from './document-model';
import { EditablePreview } from './EditablePreview';

const ignoreChange = () => {};
/** @deprecated Compatibility-only read-only view. Active editors use EditablePreview. */
export const DocumentPreview = memo(function DocumentPreview(props: {
  markdown: string; direction: Direction; fontFamily: string; fontSize: number; onStartWriting: () => void;
}) {
  return <EditablePreview {...props} readOnly onChange={ignoreChange} />;
});
