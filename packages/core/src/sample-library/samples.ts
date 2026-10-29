import defaultDocument from '../default-document.md?raw';
import type { Sample } from './model';

const code = (language: string, text: string) => `\n\n\`\`\`${language}\n${text}\n\`\`\`\n`;
const sample = (id: string, name: string, markdown: string): Sample => ({ id, name, markdown });
const wide = `| ${Array.from({ length: 12 }, (_, i) => `ستون ${i + 1}`).join(' | ')} |\n| ${Array(12).fill('---').join(' | ')} |\n${Array.from({ length: 5 }, (_, row) => `| ${Array.from({ length: 12 }, (_, col) => `${row + 1} / ${col + 1}`).join(' | ')} |`).join('\n')}`;
const longFormula = String.raw`\displaystyle f(x)=` + Array.from({ length: 24 }, (_, i) => String.raw`\frac{x^{${i + 1}}+\sqrt{${i + 2}}}{${i + 1}!}`).join('+');
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320" viewBox="0 0 960 320"><rect width="960" height="320" fill="#e0f2fe"/><circle cx="240" cy="160" r="110" fill="#0891b2"/><path d="M520 260 L660 60 L800 260 Z" fill="#f59e0b"/></svg>');

// Expectations are ordinary Markdown beside each case, never hidden metadata.
export const builtInSamples: Sample[] = [
  sample('welcome', 'متن آغازین — Welcome document', defaultDocument),
  sample('wide-table', 'جدول عریض ۱۲ ستونی — Wide table', `# جدول عریض روی گوشی\n\nانتظار: ستون‌ها خوانا بمانند؛ ادامهٔ جدول را داخل خود جدول افقی بکش. صفحه نباید افقی جابه‌جا شود.\n\n${wide}\n\nبعد از جدول باید بتوانی این متن را عادی ویرایش کنی.`),
  sample('content-widths', 'عرض ستون بر اساس محتوا — Content widths', `# ستون کوتاه و بلند\n\nانتظار: ستون شماره باریک‌تر از توضیحات باشد. متن بلند بعد از یک عرض خوانا بشکند و ارتفاع ردیف زیاد شود.\n\n| ردیف | عنوان | توضیحات |\n| ---: | --- | --- |\n| ۱ | هندسه | ${'این توضیح فارسی باید خوانا بماند و بدون کوچک‌شدن حروف به چند سطر برود. '.repeat(7)} |\n| ۲ | جبر | متن کوتاه |`),
  sample('ragged-extra', 'جدول با خانهٔ اضافه — Extra cells', `# ردیف عریض‌تر از سرستون\n\nانتظار: خانهٔ اضافه دیده شود. گزینهٔ تکمیل جدول باید ظاهر شود؛ با زدن آن سرستون‌های خالی و خانه‌های کمبود اضافه شوند. حذف ستون باید همهٔ ردیف‌ها را به‌درستی تغییر دهد؛ Undo و Redo را هم امتحان کن.\n\n| نام | مقدار |\n| --- | --- |\n| الف | ۱ | خانهٔ اضافه | یکی دیگر |\n| ب | ۲ |\n| ج | ۳ | سوم |`),
  sample('ragged-missing', 'جدول با ردیف کوتاه — Missing cells', `# خانه‌های کمبود\n\nانتظار: تعداد سرستون‌ها مبنا باشد و تکمیل جدول، فقط خانهٔ خالی اضافه کند. مقدارها نباید حذف یا جابه‌جا شوند.\n\n| اول | دوم | سوم | چهارم |\n| --- | :---: | ---: | --- |\n| یک | دو |\n| فقط یک خانه |\n| الف | ب | ج | د |`),
  sample('table-pipes', 'کاراکترهای خاص جدول — Escaped pipes', String.raw`# خط عمودی، کد و فرمول در جدول

انتظار: خط عمودیِ فراری یک خانه را دو تکه نکند. با افزودن/حذف ستون، متن بیرون از جدول و قالب‌بندی خانه‌ها حفظ شوند.

| متن | کد | فرمول |
| --- | --- | --- |
| الف \| ب | ` + '`a\|b`' + String.raw` | $\lvert x\rvert$ |
| **پررنگ** و [پیوند](https://example.com) | ` + '`x < 10`' + String.raw` | $\frac{a+b}{1+x^2}$ |

این بند باید بعد از تغییر جدول سالم بماند.`),
  sample('long-url', 'نشانی و کلمهٔ بسیار بلند — Long URLs', `# شکستن متن بلند\n\nانتظار: نشانی‌ها و کلمهٔ بدون فاصله، داخل خانه بشکنند؛ منبع Markdown نباید تغییر کند.\n\n| نوع | مقدار |\n| --- | --- |\n| پیوند | [${'verylongaddress'.repeat(20)}](https://example.com/${'path'.repeat(100)}) |\n| کلمه | ${'Supercalifragilisticexpialidocious'.repeat(15)} |\n| فارسی | ${'واژهبدونفاصله'.repeat(40)} |`),
  sample('table-math', 'فرمول معمولی و خیلی بلند — Math overflow', String.raw`# فرمول در جدول

انتظار: فرمول معمولی با اندازهٔ طبیعی دیده شود و ستون را به اندازهٔ لازم باز کند. فرمول بسیار بلند، اسکرول افقی مستقل داشته باشد؛ فرمول را کوچک نکن و صفحه را عریض نکن. عرض پنل پیش‌نمایش و اندازهٔ قلم را هم تغییر بده.

| نوع | فرمول |
| --- | --- |
| کوتاه | $\frac{a+b}{\sqrt{1+x^2}}$ |
| متوسط | $\displaystyle \sum_{k=0}^{n}\binom{n}{k}x^k y^{n-k}=(x+y)^n$ |
| بسیار بلند | $` + longFormula + '$ |'),
  sample('advanced-math', 'فرمول‌های پیشرفته — Advanced mathematics', String.raw`# فرمول‌های پیشرفته

انتظار: ماتریس، انتگرال و چند سطر فرمول با جهت چپ‌به‌راست رندر شوند. فرمول‌ها را در پیش‌نمایش ویرایش و برای Word/PDF ذخیره کن.

$$
\int_{-\infty}^{\infty}e^{-x^2}\,dx=\sqrt{\pi},\qquad
\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}
$$

$$
\begin{aligned}
\nabla\cdot\mathbf{E}&=\frac{\rho}{\varepsilon_0}\\
\nabla\times\mathbf{B}&=\mu_0\mathbf{J}+\mu_0\varepsilon_0\frac{\partial\mathbf{E}}{\partial t}
\end{aligned}
$$

$$
A=\begin{pmatrix}1&2&3\\0&4&5\\0&0&6\end{pmatrix},\qquad \det(A)=24
$$`),
  sample('table-image', 'تصویر بزرگ داخل جدول — Images in tables', `# تصویر داخل جدول\n\nانتظار: تصویر با حفظ نسبت کوچک شود و از خانه بیرون نزند. تصویر این نمونه داخل خود متن است و اینترنت لازم ندارد.\n\n| شکل | توضیح |\n| --- | --- |\n| ![دایره و مثلث](${image}) | تصویر اصلی ۹۶۰ در ۳۲۰ است. |\n| متن کوتاه | ردیف بعد |`),
  sample('rtl-list', 'فهرست فارسی و لنگر — RTL lists', `# فهرست فارسی\n\nانتظار: شماره‌های فهرست دیده شوند؛ فاصلهٔ متن و شماره از لبهٔ پنل مناسب باشد. لنگر HTML در منبع حفظ شود.\n\n*تصویر ۶ — انتخاب روز در تقویم، مقدار فرم را تغییر می‌دهد.*\n\n<a id="sarir-folders"></a>\n\n## ۴. پوشه‌های مقصد را انتخاب کنید\n\n1. در بخش **«پوشه‌های مقصد در سریر»** روی **«مدیریت پوشه‌ها»** بزنید.\n2. نام پوشه را در **«جستجوی نام پوشه»** بنویسید یا شاخه‌ها را باز کنید.\n3. مربع کنار پوشهٔ مورد نظر را انتخاب کنید.\n4. تعداد انتخاب‌ها را بررسی کنید.\n5. پس از برگشت به فرم، فهرست پوشه‌ها را بررسی کنید.\n\n### تو در تو\n\n- مورد اول\n  - زیرمجموعهٔ فارسی با English (version 19)\n- مورد دوم`),
  sample('bilingual', 'متن ترکیبی فارسی و انگلیسی — Bidirectional text', `# فارسی و English کنار هم\n\nانتظار: پرانتز، عدد، نشانی و متن ترکیبی جابه‌جا یا ناپدید نشوند. جهت خودکار، راست‌به‌چپ و چپ‌به‌راست را امتحان کن.\n\nکتابخانهٔ React (version **19**) را نصب کنید؛ قیمت ۲۵۰٫۵۰ USD است و شناسهٔ AB-123/F5 را حفظ کنید.\n\nEnglish starts here (نسخهٔ فارسی دوم) and continues with item 2 and number 123.\n\n| زبان | جمله |\n| --- | --- |\n| فارسی | فرمول $E=mc^2$ در این جمله است. |\n| English | Mixed text with **فارسی** and 123. |`),
  sample('code', 'کد و کاراکترهای ویژه — Code blocks', '# کد و نویسه‌های خاص\n\nانتظار: کد و تورفتگی در منبع حفظ شود؛ بلوک عریض داخل خودش اسکرول بخورد.' + code('typescript', 'const result = data.tags.map((tag, i) => `${i}: ${tag}`);\nif (result.length < 10 && result.length > 0) {\n  console.log("<result>", result, "</result>");\n}\nconst veryLongLine = "' + 'long-content-'.repeat(25) + '";')),
  sample('mermaid', 'نمودار Mermaid — Diagrams', '# نمودار\n\nانتظار: متن فارسی در نمودار خوانا باشد؛ نمودار عریض داخل خودش اسکرول بخورد. تغییر کد باید نمودار را به‌روز کند.' + code('mermaid', 'flowchart LR\n  A["شروع / Start"] --> B["نوشتن Markdown"]\n  B --> C["پیش‌نمایش قابل ویرایش"]\n  C --> D["Word و PDF"]')),
  sample('tikz', 'هندسه با TikZ — Geometry', '# سؤال هندسه\n\nانتظار: دایره، دو شعاع، زاویه و برچسب‌ها رندر شوند. اولین اجرای موتور ممکن است به دریافت فایل‌ها نیاز داشته باشد.\n\nدر دایرهٔ زیر، شعاع ۳ و زاویهٔ مرکزی ۶۰ درجه است. طول وتر AB را حساب کنید.' + code('tikz', String.raw`\begin{tikzpicture}[scale=1.1]
\draw (0,0) circle (2);
\draw[thick,blue] (0,0) -- (2,0) node[right] {$A$};
\draw[thick,blue] (0,0) -- (60:2) node[above] {$B$};
\draw[thick,red] (2,0) -- (60:2);
\draw (0.5,0) arc (0:60:0.5);
\node at (30:0.8) {$60^\circ$};
\node[below left] at (0,0) {$O$};
\end{tikzpicture}`)),
  sample('export', 'سند چندبخشی برای خروجی — Word and PDF', '# آزمون خروجی سند\n\nانتظار: متن فارسی قابل جست‌وجو، جدول، شماره‌ها و فرمول در Word و PDF حفظ شوند. فایل خروجی را جداگانه باز کن.\n\n## فهرست\n\n1. متن فارسی با نیم‌فاصله و **تأکید**\n2. English words with (parentheses)\n3. فرمول $a^2+b^2=c^2$\n\n| بخش | وضعیت |\n| --- | --- |\n| متن | آماده |\n| فرمول | $\\int_0^1 x^2\\,dx=\\frac{1}{3}$ |\n\n> یادداشت: بررسی پیش‌نمایش به‌تنهایی، صحت فایل خروجی را ثابت نمی‌کند.'),
];
