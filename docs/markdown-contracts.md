# قرارداد قابلیت‌ها و fixtureهای Markdown

جدول نخست قرارداد پذیرفته‌شدهٔ W0 است؛ شاهد اجرای نهایی در بخش «نتیجهٔ پذیرش» همین سند آمده است. نتیجهٔ کل بسته در [گزارش پذیرش بازآرایی](validation/implementation-acceptance.md) ثبت شده است. واژه‌ها در [واژه‌نامه](../GLOSSARY.md) و مرز حفظ متن در [ADR ۰۰۰۵](adr/0005-logical-markdown-source.md) تعریف شده‌اند. Markdown منطقی مرجع است؛ حفظ encoding یا BOM اولیهٔ فایل در این قرارداد نیست.

## مرزهای مشترک و تفاوت مقصدها

| قابلیت | منبع و ویرایش rich | Word | PDF | مالک قاعده |
| --- | --- | --- | --- | --- |
| نرم‌خط داخل پاراگراف | منبع LF/CRLF و فاصله‌ها محفوظ؛ نمایش پیوسته با فاصله | همان پاراگراف | همان پاراگراف؛ wrap تابع عرض صفحه | grammar و `flowingText` |
| hard break صریح | شکست قابل‌ویرایش؛ نوشتار دست‌نخوردهٔ منبع حفظ شود | شکست در پاراگراف | شکست در پاراگراف | adapter inline؛ AST نوع `break` |
| متن، تیتر، bold/italic/strike | ویرایش مستقیم؛ patch موضعی با provenance transaction | ساختار و runهای واقعی | متن برداری با سبک | grammar مشترک؛ تولید قالب مستقل |
| جهت متن ترکیبی | جهت پاراگراف مستقل از زبان UI؛ منبع textarea بومی و `plaintext` خودش را حفظ می‌کند | قراردادهای ویژهٔ OOXML در ADRهای ۰۰۰۳/۰۰۰۴ | جهت پاراگراف/سلول پیش از wrap، متن منطقی برای جست‌وجو | `document-model` و adapter مقصد |
| لینک مستقیم و reference | label و href مشتق تازه باشند؛ تغییر تعریف مرجع به لینک‌ها برسد | لینک مجاز مقصددار | annotation لینک مجاز | تعریف نخست در ترتیب سند، حتی داخل blockquote/list؛ سیاست URL مقصد |
| کد inline و fenced | متن literal، fence/lang/meta نامرتبط محفوظ؛ رنگ صرفاً نمایش | متن قابل‌ویرایش با فونت/رنگ export | متن برداری؛ خط‌های کد معنی‌دار | grammar، highlight token، palette مستقل خروجی |
| فرمول inline/block و fenceهای فرمول | source قابل‌ویرایش؛ newline معنی‌دار فرمول حفظ شود | OMML قابل‌ویرایش برای ساختار پشتیبانی‌شده | تصویر محلی فرمول در سند با متن برداری پیرامون | math adapter و محدودیت صریح قالب |
| Mermaid | source قابل‌ویرایش و نمایش محلی | تصویر نمودار | تصویر نمودار | renderer/cache مشترک مستقل از تم نمایش |
| جدول GFM | سلول قابل‌ویرایش؛ hard break با `<br>`؛ padding نامرتبط در ویرایش کوچک حفظ شود | جدول واقعی | جدول صفحه‌بندی‌شده با جهت ثابت هر سلول | grammar و layout مستقل مقصد |
| فهرست و task list و blockquote | ویرایش متن زیرساختار، حفظ شمارش/indent/trivia نامرتبط؛ تغییر ساختار در کوچک‌ترین ناحیهٔ لازم | numbering/جدول checkbox مطابق رفتار موجود | marker و checkbox چاپی | AST مشترک، adapterهای مقصد |
| HTML خام | متن/ویجت source؛ اجرا نمی‌شود؛ `<br>` مورد صریح شکست است | HTML به متن؛ اجرای markup ندارد | HTML به متن؛ اجرای markup ندارد | fallback صریح adapterها |
| تصویر Markdown | source/label قابل‌ویرایش؛ تعبیهٔ تصویر خارجی در دامنه نیست | placeholder متنی | placeholder متنی | قابلیت پشتیبانی‌نشدهٔ صریح |
| footnote | نگهداری syntax در ویجت خام؛ ویرایش ساختاری پاورقی در دامنه نیست | label/تعریف متنی طبق fallback موجود | label/تعریف متنی | تفاوت عمدی قابلیت مقصد؛ نه ادعای پاورقی بومی |
| تغییر theme یا locale یا view | متن، تنظیمات خروجی و تاریخچهٔ سند تغییر نکنند | رنگ چاپ ثابت | رنگ چاپ و تصاویر ثابت | لایهٔ display و میزبان |

نمای Combined و Rendered Result هر دو از همان EditablePreview استفاده می‌کنند؛ سه نمای VS Code قابلیت Markdown متفاوتی ندارند. نمای source از همان textarea فارسی ParsiWord استفاده می‌کند. native Text Editor VS Code انتخاب مستقل باقی می‌ماند.

پیوند خودکار bare URL/www/email و پیوند زاویه‌دار از tokenizer دارای source position می‌آیند. طبق [ADR ۰۰۰۶](adr/0006-source-aware-autolinks.md)، transform ثانویهٔ لینک‌سازی از متن decodeشده حذف می‌شود تا escape/entity بتواند لینک را به متن معمولی تبدیل کند. این تفاوت آگاهانه با بعضی رفتارهای GitHub است؛ لینک‌های عادی و سایر transformها نباید حذف شوند. در Word/PDF فقط مقصدهای مجاز `http:`، `https:` و `mailto:` فعال‌اند؛ مقصد نسبی یا نامجاز به معنی حذف متن label نیست.

## جدول‌های نامنظم

طبق [ADR ۰۰۱۰](adr/0010-explicit-ragged-table-repair.md)، همهٔ خانه‌های اضافه
در پیش‌نمایش باقی می‌مانند. اگر تعداد خانه‌های ردیف‌ها با هدر یکسان نباشد،
ابزارهای افزودن/حذف ستون غیرفعال‌اند؛ افزودن/حذف ردیف مجاز است و ردیف جدید
به تعداد خانه‌های هدر ساخته می‌شود. فقط دکمهٔ صریح اصلاح، همان جدول
انتخاب‌شده را تا بلندترین ردیف با خانه‌های خالی انتهایی کامل می‌کند.
تایپ، افزودن/حذف ردیف و ویرایش جدول دیگر نباید این اصلاح را ضمنی انجام دهند.
حفظ منبع اطراف، تعداد خانه‌های ردیف‌های دست‌نخورده، alignment، reload و
Undo/Redo باید با transaction و مرورگر واقعی سنجیده شوند.

## fixtureهای پذیرش و نوع شاهد

| شناسه | ورودی/عملیات مستقل | انتظار | نوع شاهد و محل |
| --- | --- | --- | --- |
| M01 | پاراگراف اول `agent.md` با `و\nTauri 2` | نرم‌خط فاصلهٔ نمایشی؛ منبع بدون تغییر؛ جهت واحد پاراگراف | اندازه‌گیری DOM و تصویر کنترل‌شده: [bidi-comparison.json](validation/bidi-comparison.json)؛ regression مرورگر نهایی لازم |
| M02 | `one\r\ntwo`، `one  \r\ntwo`، `one\\\r\ntwo`، کد و فرمول چندخطی | اولی پیوسته؛ دو مورد بعدی hard break؛ کد/فرمول چندخطی | مدل rich، ساختار OOXML و محتوای PDF، نه تنها snapshot رشته |
| M03 | `> [id]: https://example.com` سپس `[x][id]` و یک تعریف تکراری دیگر | تعریف نخست تو‌در‌تو resolve شود؛ تغییر definition مشتق href را تازه کند | تست grammar، لینک OOXML/PDF و مرورگر واقعی |
| M04 | `A &amp; \\*literal\\* __bold__\r\nnext   end`؛ ویرایش یک حرف و mark کلمهٔ دیگر | escape/entity/mark spelling/soft EOL نامرتبط دقیقاً محفوظ | assertion متن کامل در `rich-source.test.ts`؛ تجربهٔ واقعی rich نیز لازم |
| M05 | `&#97;a`؛ حذف اول یا دومین `a` با transaction واقعی؛ undo | به‌ترتیب `a` یا `&#97;`؛ انتخاب occurrence از StepMap، نه حدس diff | ProseMirror transaction و assertion دقیق source |
| M06 | `a * b*` و `a & amp; b`؛ حذف فاصلهٔ داخلی | متن rich ناخواسته italic/entity نشود؛ اصلاح فقط syntax لازم | source نهایی و parse معنایی مستقل؛ جلوگیری از خطای mapping |
| M07 | چند بلوک یکسان با syntax متفاوت، blank line اضافه، CRLF، leading/trailing trivia؛ split/join | بلوک و فاصلهٔ نامرتبط تغییر نکند؛ کوچک‌ترین ساختار متاثر بازنویسی شود | transaction واقعی و متن دقیق، undo/redo |
| M08 | سند نزدیک ۵۰۰هزار با `$` قابل escape و toolbar؛ سند بیرونی بزرگ‌تر | حد بر متن نهایی؛ درج بیش‌ازحد رد؛ حذف از سند بزرگ مجاز؛ recovery کامل | unit session/protocol، rich/browser و draft reload |
| M09 | آخرین تایپ و export در همان task؛ تغییر settings در await فونت | خروجی فقط snapshot آغاز عملیات؛ آخرین حرف موجود | فایل Word/PDF/Markdown واقعی و snapshot مستقل |
| M10 | ack تأخیردار، E1 ارسال‌شده و tail محلی، Save و dispose/reopen | tail ذخیره یا recovery صریح؛ بی‌صدا گم نشود | VS Code واقعی؛ baseline شکست در `artifacts/vscode-test/delayed-ack-before.json`؛ آزمون بعد از اصلاح لازم |
| M11 | composition فارسی با ack یا تغییر بیرونی؛ چند نمای یک URI و native editor | IME یک بار commit؛ عدم overwrite؛ تعارض متداخل recovery؛ undo/redo مشترک | browser و native host؛ unit صرف کافی نیست |
| M12 | light/dark/system و چهار تم VS Code؛ ۳۲۰/۳۹۳/دسکتاپ | رابط و سند خوانا؛ source/selection/IME ثابت؛ موبایل ۴۴px و دسکتاپ ۳۲px | مرورگر، تصویر واقعی و computed contrast؛ UI تم از export جدا |
| M13 | همان متن/تنظیمات حاوی کد، فرمول و Mermaid در دو تم | محتوای OOXML، رنگ/style و تصاویر Word/PDF ثابت؛ metadata ناپایدار مستثنا | فایل خروجی واقعی؛ مقایسهٔ رنگ DOM به‌تنهایی کافی نیست |

تست قدیمی با نام «preserves source bytes» که فقط برابری مدل پیش و پس از serialize را می‌سنجد، شاهد M04 تا M07 نیست. عدد کلی تست‌ها نیز جای پوشش مستقل هر قرارداد را نمی‌گیرد. fixtureها باید از ورودی و انتظار مشخص ساخته شوند؛ انتظار از همان helper تحت آزمون تولید نشود.

## نتیجهٔ پذیرش — ۲۰۲۶-۱۰-۲۳

| قرارداد | شاهد اجراشده و نتیجه |
| --- | --- |
| M01 | آزمایش کنترل‌شدهٔ bidi روی مبنا و تصاویر مشاهده‌شده، همراه grammar نرم‌خط و تست‌های واقعی `live-preview` و جهت پاراگراف. نتیجهٔ fixture تأیید شد؛ ادعای علت یگانهٔ تمام خطاهای bidi ندارد. |
| M02 | `markdown.test.ts`، `rich-source.test.ts` و تست واقعی OOXML/PDF؛ نرم‌خط پیوسته، hard break و کد CRLF محفوظ. مرورگر ویرایش فرمول چندخطی نیز پاس. |
| M03 | traversal بازگشتی و first-definition-wins، hyperlink ورد و annotation PDF، transaction تغییر/حذف/بازگشت تعریف، dialog واقعی چندبلوکی و لینک وابسته پاس. |
| M04–M07 | متن کامل source در `rich-source.test.ts`، StepMap واقعی، occurrenceهای تکراری، entity چندنویسه‌ای، flanking، fence/indent/CRLF، padding سلول، splitListItem و undo/redo پاس. مرورگر حفظ source پیش/پس از ناحیهٔ درج و متن کامل rich را مستقل سنجید. فقط فاصله/نشانهٔ تازه‌درج‌شده می‌تواند entity/escape شود؛ متن قدیمی normalize نشده است. |
| M08 | اولین PM edit در ۲۰۰هزار و ۴۹۹٬۹۹۸ نویسه، guard پس از escape، رد درج با یک اعلان و حذف مجاز در مرورگر پاس؛ draft بالای حد بدون truncation در وب و native recovery/export پاس. |
| M09 | prepared context و snapshot پیش از await در unit خروجی، Word واقعی با آخرین ورودی و settings هم‌زمان، Markdown دقیق و PDF واقعی در مرورگر/میزبان پاس. |
| M10 | شکست واقعی پیش از اصلاح ثبت شد؛ Save و File Save با ack تأخیردار، queue مشترک، dispose/reopen و recovery کامل در suite بومی پاس. [گزارش میزبان](validation/vscode-session-validation.md). |
| M11 | composition در دو ترتیب رویداد، تغییر غیرمتداخل/متداخل، چند view و native undo/redo پاس. این شاهد رویداد مرورگر در میزبان است، نه IME فیزیکی سیستم‌عامل. |
| M12 | انتخاب/persistence/system وب، textarea/IME/selection/forced-colors و تراکم موبایل/دسکتاپ پاس. چهار تم native و سه نمای ۴۰۰px با Tab واقعی پاس؛ ایراد مشاهده‌شدهٔ syntax در HC Light با شاهد کوچک جدا اصلاح شد. [گزارش ظاهر](validation/display-theme-and-native-shell.md). |
| M13 | دو context تازه با فونت/KaTeX/Mermaid واقعی، برابر بودن XML نرمال‌شده/style/media ورد و متن/operator/image PDF را ثابت کردند؛ تصویر تزریقی یا cache مشترک مبنای این پذیرش نیست. `tests/pdf-rich-export.spec.ts`، تست `fresh light and dark contexts…`؛ metadata و شناسهٔ ناپایدار مستثنا هستند. |

اجرای کامل Chromium اولیه ۵۱ پاس و چهار شکست داشت؛ پس از اصلاح مهاجرت تنظیم قدیمی و سه انتظار تست، هر چهار مورد با فرمان متمرکز پاس شدند. آزمون بومی Word، Android/iOS یا چاپ فیزیکی انجام نشده است. انتقال caret/scroll میان editor typeهای تازه‌ساختهٔ VS Code پیاده نشده؛ حفظ view موجود و تاریخچهٔ مشترک، شاهد آن انتقال نیست.
