import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { DOMParser, type Element } from '@xmldom/xmldom';
import { BuilderElement, type AttributeData, type AttributePayload, type ParagraphChild } from 'docx';
import { RichContentError } from './rich-content';
import { bundledFont, mathFont } from './font-assets';

const supported = new Set('math menclose mfrac mglyph mi mmultiscripts mn mo mover mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover semantics'.split(' '));
const options = { trust: false, throwOnError: true, maxExpand: 1000, maxSize: 20 } as const;
export function renderMath(source: string, displayMode = false, output: 'htmlAndMathml' | 'mathml' = 'htmlAndMathml'): string {
  if (source.length > 20_000) throw new RichContentError('MATH_TOO_LARGE');
  try { return katex.renderToString(source, { ...options, displayMode, output }); }
  catch (cause) { throw new RichContentError('MATH_INVALID', { cause }); }
}

// Extend docx's public XML builder. Text is serialized and escaped by docx.
// ImportedXmlComponent.fromXmlString would introduce an unwanted wrapper here.
class MathElement extends BuilderElement<AttributeData> {
  constructor(element: Element) {
    if (!/^(m:|w:(rPr|rFonts|b|i|sz|color|lang)$)/.test(element.nodeName)) throw new Error('Unexpected equation element');
    const attributes: AttributePayload<AttributeData> = Object.fromEntries(Array.from(element.attributes).map((a, i) => [String(i), { key: a.name, value: a.value }]));
    super({ name: element.nodeName, attributes });
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) this.root.push(new MathElement(child as Element));
      else if (child.nodeType === 3) this.root.push(child.nodeValue || '');
    }
  }
}
export function wordMath(source: string, display = false): ParagraphChild {
  try {
    const html = renderMath(source, display, 'mathml');
    const mathml = html.match(/<math[\s\S]*<\/math>/)?.[0].replace(/<annotation\b[\s\S]*?<\/annotation>/g, '');
    if (!mathml) throw new Error('Missing MathML');
    const parsed = new DOMParser().parseFromString(mathml, 'application/xml');
    for (const element of Array.from(parsed.getElementsByTagName('*'))) {
      if (!supported.has(element.localName || '')) throw new Error('Unsupported MathML');
    }
    const omml = new DOMParser().parseFromString(mml2omml(mathml, { disableDecode: true }), 'application/xml');
    const element = omml.documentElement;
    if (!element || element.nodeName !== 'm:oMath') throw new Error('Invalid OMML');
    const m = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    // mathml2omml can merge text following a plain n-ary operand directly
    // into m:e instead of a run (e.g. the closing brace in {∑ k}). Such mixed
    // content is invalid OMML and can erase the operand during serialization.
    // Keep that following text outside the operator, in an ordinary math run.
    for (const nary of Array.from(omml.getElementsByTagName('m:nary'))) {
      const operand = Array.from(nary.childNodes).find(n => n.nodeName === 'm:e');
      const after = nary.nextSibling;
      for (const child of Array.from(operand?.childNodes || [])) {
        if (child.nodeType !== 3) continue;
        const run = omml.createElementNS(m, 'm:r');
        const text = omml.createElementNS(m, 'm:t');
        text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        text.appendChild(child);
        run.appendChild(text);
        nary.parentNode!.insertBefore(run, after);
      }
    }
    // KaTeX places a structured integrand (e.g. x² or a fraction) next to the
    // operator. mathml2omml attaches plain identifiers but leaves these outside
    // an empty n-ary operand, which Word/LibreOffice displays as a placeholder.
    // Move exactly that next component into the operand, without reordering text.
    for (const nary of Array.from(omml.getElementsByTagName('m:nary')).reverse()) {
      const operand = Array.from(nary.childNodes).find(n => n.nodeName === 'm:e') as Element | undefined;
      const next = nary.nextSibling;
      if (operand && !operand.hasChildNodes() && next?.nodeType === 1 && !/^[=<>≤≥≠≈]/.test(next.textContent || '')) operand.appendChild(next);
    }
    // Declare the bundled math face on runs and control properties too; this
    // avoids inheriting a prose font when a reader ignores the global math font.
    const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const targets = [...Array.from(omml.getElementsByTagName('m:r')), ...Array.from(omml.getElementsByTagName('m:ctrlPr'))];
    for (const target of targets) {
      let properties = Array.from(target.childNodes).find(n => n.nodeName === 'w:rPr') as Element | undefined;
      if (!properties) { properties = omml.createElementNS(w, 'w:rPr'); target.insertBefore(properties, target.firstChild); }
      const font = omml.createElementNS(w, 'w:rFonts');
      for (const slot of ['ascii', 'hAnsi', 'eastAsia', 'cs']) font.setAttributeNS(w, `w:${slot}`, slot === 'cs' ? bundledFont : mathFont);
      properties.insertBefore(font, properties.firstChild);
    }
    // The validated root implements the same XML component contract as docx.Math.
    return new MathElement(element) as ParagraphChild;
  } catch (error) {
    if (error instanceof RichContentError) throw error;
    throw new RichContentError('MATH_WORD_UNSUPPORTED', { cause: error });
  }
}
