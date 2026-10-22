import unicodePairs from './unicode/bracket-pairs.json';

export type Part = { text: string; dir?: 'ltr' | 'rtl'; bold?: boolean; italic?: boolean; code?: boolean; href?: string; break?: boolean };
const rtl = (text: string, extra: Partial<Part> = {}): Part => ({ text, ...extra });
const ltr = (text: string, extra: Partial<Part> = {}): Part => ({ text, dir: 'ltr', ...extra });

// The reference's directions are specified by the fixture author, independently
// from the production segmenter. Never infer this HTML from exported Word runs.
export const hardCases: { id: string; title: string; base: 'rtl' | 'ltr'; parts: Part[]; malformed?: boolean; reference?: string }[] = [
  { id: 'S01', title: 'زاویه، آکولاد و براکت تودرتو', base: 'rtl', parts: [rtl('عبارت '), ltr('<React (version 19)>'), rtl(' و '), ltr('《TypeScript {stable [build 7]}》'), rtl(' را بررسی کنید.')] },
  { id: 'S02', title: 'تودرتوی کاملاً فارسی', base: 'rtl', parts: [rtl('نتیجه 《{[مرحلهٔ اول (شمارهٔ ۱۲۳)]}》 تأیید شد.')] },
  { id: 'S03', title: 'عبارت ترکیبی داخل علامت', base: 'rtl', parts: [rtl('گزینهٔ <'), ltr('React'), rtl(' و '), ltr('TypeScript'), rtl('> و گزینهٔ 《'), ltr('Node.js'), rtl(' و نسخهٔ فارسی》 آماده‌اند.')] },
  { id: 'S04', title: 'نقل‌قول و علامت تعجب', base: 'rtl', parts: [rtl('گفت '), ltr('«Hello, world!»'), rtl('؛ سپس '), ltr('“React (stable)”'), rtl(' و '), ltr("'don't panic!'"), rtl(' را نوشت.')] },
  { id: 'S05', title: 'پرانتزهای شرق آسیا و ریاضی', base: 'rtl', parts: [rtl('نمونه‌ها: '), ltr('〈React〉 《TypeScript》 「JavaScript」 『Node.js』 【API】 〔SDK〕 ⟨CLI⟩ ⟪JSON⟫'), rtl(' پایان.')] },
  { id: 'S06', title: 'عملگر مقایسه و کد', base: 'rtl', parts: [rtl('کد '), ltr('{x < y}', { code: true }), rtl(' و '), ltr('[a > b]', { code: true }), rtl(' و '), ltr('fn<{T}>(12);', { code: true }), rtl(' و '), ltr('|x| + ‖y‖', { code: true }), rtl(' باید قابل خواندن بماند.')] },
  { id: 'S07', title: 'مبلغ و شناسه با قالب‌بندی', base: 'rtl', parts: [rtl('مبلغ '), ltr('<'), ltr('250', { bold: true }), ltr(' USD>'), rtl('، شناسهٔ '), ltr('{123_456}'), rtl('، شمارهٔ '), ltr('[+98-21-12345678]'), rtl(' و تخفیف '), ltr('《۲۵٪》'), rtl(' ثبت شد.')] },
  { id: 'S08', title: 'مرز پررنگ، مورب و لینک داخل یک جفت', base: 'rtl', parts: [rtl('عبارت '), ltr('<', { bold: true }), ltr('React ', { href: 'https://react.dev/' }), ltr('version ', { italic: true }), ltr('19', { bold: true, href: 'https://react.dev/' }), ltr('>', { italic: true }), rtl(' را بخوانید.')] },
  { id: 'S09', title: 'شکست خط درون علامت', base: 'rtl', parts: [rtl('متن '), ltr('<React'), { text: '\n', break: true }, ltr('(version '), ltr('19', { bold: true }), ltr(')>'), rtl(' تمام شد.')] },
  { id: 'S10', title: 'شکست خودکار خط در نمایش گوشی', base: 'rtl', parts: [rtl('این جمله عمداً طولانی است تا در نمایش باریک گوشی چند بار بشکند. عبارت '), ltr('<React {version [19 (stable)]}>'), rtl(' باید همراه علامت‌هایش خوانا بماند و نتیجهٔ 《مرحلهٔ اول (نسخهٔ آزمایشی)》 هم با متن قبلی جابه‌جا نشود.')] },
  { id: 'S11', title: 'جملهٔ انگلیسی با بخش فارسی', base: 'ltr', reference: 'Read <bdi dir="rtl">[مرحلهٔ اول (<bdi dir="ltr">React 19</bdi>)]</bdi> then &lt;TypeScript {stable}&gt; and continue.', parts: [ltr('Read '), { text: '[مرحلهٔ اول (', dir: 'rtl' }, ltr('React 19'), { text: ')]', dir: 'rtl' }, ltr(' then <TypeScript {stable}> and continue.')] },
  { id: 'S12', title: 'هم‌ارزی Unicode و حفظ شکل اصلی', base: 'rtl', parts: [rtl('دو شکلِ هم‌ارز: '), ltr('〈React〉'), rtl(' و '), ltr('〈TypeScript〉'), rtl('؛ همچنین 🙂 و نیم‌فاصله در می‌رود حفظ شوند.')] },
  { id: 'S13', title: 'ظاهر HTML به صورت متن و لینک واقعی', base: 'rtl', parts: [rtl('متن '), ltr('<tag attr="x">'), rtl(' و پیوند '), ltr('《React {docs}》', { href: 'https://react.dev/' }), rtl(' و نشانی '), ltr('user@example.com'), rtl(' حفظ شوند.')] },
  { id: 'S14', title: 'ده لایهٔ تودرتو', base: 'rtl', parts: [rtl('آغاز '), ltr('<《{[⟨「(〔【(React 19)】〕)」⟩]}》>'), rtl(' پایان.')] },
  { id: 'E01', title: 'ناقصِ عمدی؛ فقط حفظ دقیق کاراکترها سنجیده می‌شود', base: 'rtl', malformed: true, parts: [rtl('این علامت‌ها عمداً ناقص‌اند: '), ltr('([React)]  <TypeScript  {Node.js'), rtl(' و پایان.')] },
];

export const catalogPairs = [...unicodePairs, ...[
  { open: '<', close: '>', code: 'U+003C/U+003E' },
  { open: '«', close: '»', code: 'U+00AB/U+00BB' },
  { open: '‹', close: '›', code: 'U+2039/U+203A' },
  { open: '“', close: '”', code: 'U+201C/U+201D' },
  { open: '‘', close: '’', code: 'U+2018/U+2019' },
  { open: '"', close: '"', code: 'U+0022/U+0022' },
  { open: "'", close: "'", code: 'U+0027/U+0027' },
]];

export const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}\[\]<>|]/g, '\\$&');
export function caseMarkdown(parts: Part[]): string {
  return parts.map(part => {
    if (part.break) return '  \n';
    if (part.code) return '`' + part.text + '`';
    let value = escapeMarkdown(part.text);
    if (part.bold) value = '**' + value + '**';
    if (part.italic) value = '*' + value + '*';
    if (part.href) value = '[' + value + '](' + part.href + ')';
    return value;
  }).join('');
}
export function hardStressMarkdown(referenceImages = true): string { return [
  '# آزمون سخت جهت متن و علامت‌های جفت',
  referenceImages
    ? 'هر مورد با شناسهٔ S مشخص شده است. تصویر مرجعِ موارد اصلی در انتهای سند قرار دارد. شکل فونت و محل شکست خط می‌تواند متفاوت باشد؛ جای علامت‌ها و ترتیب متن را مقایسه کنید.'
    : 'موارد S01 تا S14 همان آزمون‌های سخت قبلی‌اند. E01 عمداً علامت‌های ناقص دارد و فقط حفظ متن آن سنجیده می‌شود. فهرست P01 تا P72 همهٔ جفت‌های قبلی را در متن فارسی، انگلیسی و ترکیبی نشان می‌دهد.',
  ...hardCases.flatMap(test => [`### ${test.id}`, test.title, caseMarkdown(test.parts)]),
  '## فهرست کامل جفت‌ها',
  'این فهرست شامل همهٔ ۶۵ جفتِ جدول Unicode 18 و هفت جفت زاویه و نقل‌قول تکمیلی است. نبودن شکل یک علامت می‌تواند از فونت باشد؛ کد Unicode همان سطر مشخص است.',
  '| ID / Unicode | فارسی | English | ترکیبی |',
  '| --- | --- | --- | --- |',
  ...catalogPairs.map((pair, index) => '| ' + [
    'P' + String(index + 1).padStart(2, '0') + ' / ' + pair.code,
    pair.open + 'متن فارسی' + pair.close,
    pair.open + 'React 19' + pair.close,
    pair.open + 'React و فارسی' + pair.close,
  ].map(escapeMarkdown).join(' | ') + ' |'),
].join('\n\n').replace(/\|\n\n(?=\|)/g, '|\n'); }
export const hardMarkdown = hardStressMarkdown();
