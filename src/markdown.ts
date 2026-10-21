import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { mathLanguage } from './rich-content';
export const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
export function documentFontUsage(markdown: string) {
  const usage = { code: false, math: false };
  function visit(node: { type: string; lang?: string | null; children?: readonly unknown[] }) {
    if (node.type === 'math' || node.type === 'inlineMath' || node.type === 'code' && mathLanguage(node.lang)) usage.math = true;
    else if (node.type === 'inlineCode' || node.type === 'code' && node.lang?.toLowerCase() !== 'mermaid') usage.code = true;
    node.children?.forEach(child => visit(child as Parameters<typeof visit>[0]));
  }
  visit(markdownParser.parse(markdown));
  return usage;
}
