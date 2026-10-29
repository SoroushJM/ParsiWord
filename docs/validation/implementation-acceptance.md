# پذیرش بازآرایی و رابط — ۲۰۲۶-۱۰-۲۳

این گزارش تاریخی، تحویل محلی بازآرایی در ۲۰۲۶-۱۰-۲۳ روی مبنای `f38dde8` را ثبت می‌کند؛ در زمان این ارزیابی انتشار یا push انجام نشده بود. پیاده‌سازی به سه عامل `gpt-6.1-sol / xhigh` واگذار شد؛ سرپرست قراردادها، diff، شکست‌ها، فایل‌های خروجی و تصاویر را بررسی کرد. [نقشهٔ راه](../architecture-roadmap.md) مرجع دامنه و [قرارداد Markdown](../markdown-contracts.md) مرجع رفتار پذیرفته‌شده‌اند.

## نتیجهٔ review اولیه

جهت کلی roadmap درست بود: تکرار قواعد شکست سطر، reference، جهت پاراگراف و اعتبار تغییر سند، همراه با انتخاب نسخهٔ اشتباه هنگام Save/export، علت‌های واقعی و قابل‌آزمون داشتند. شاهد مستقل برای مشکل bidi و Save با ack تأخیردار ثبت شد. این برنامه می‌تواند بازگشت همان خانوادهٔ خطاها را با قرارداد و fixture آشکار کند؛ تضمین حذف تمام باگ‌های آینده نیست و درصد ساختگی برای «صحت review» معنی ندارد.

اصلاح‌های لازم به proposal اضافه شدند: `white-space` مؤثر نمونه `break-spaces` بود؛ تعریف reference می‌تواند تو‌در‌تو باشد؛ حفظ صرف بلوک‌های دست‌نخورده برای خواستهٔ کاربر کافی نبود؛ نمونهٔ injected PNG استقلال renderer از تم را ثابت نمی‌کرد؛ و lifetime واقعی editor و IME باید در میزبان آزمایش می‌شد. تعویض ویرایشگر، CRDT، Worker یا تقسیم گستردهٔ packageها شاهد نیاز نداشت و اجرا نشد.

دارک مود، تراکم و سه نما جهت اصلی معماری را تغییر ندادند؛ روی تم نمایش، snapshot و lifetime میزبان اثر گذاشتند و در U1–U3 ثبت شدند. پوستهٔ بومی VS Code بعداً با درخواست کاربر به همان دامنه اضافه شد. دستور آخر کاربر، سنجش بیشترِ سناریوهای سنگین و بهینه‌سازی‌های اختیاری را عقب انداخت.

## تغییرهای تحویلی

- parser/context و قواعد مشترک document، reference بازگشتی با تعریف نخست، نرم‌خط پیوسته و قرارداد autolink دارای source position.
- ledger حفظ منبع بر پایهٔ transaction واقعی: patch موضعی، حفظ ناحیهٔ نامرتبط، cache در سطح textblock و provenance متصل به عمر واقعی history. raw widget در source موقت ناقص بسته نمی‌شود؛ undo پس از جایگزینی خارجی source از مدل قدیمی استفاده نمی‌کند.
- session فوری، حد نهایی Markdown پس از escape، recovery بدون truncation، snapshot متن/تنظیمات قبل از await و APIهای prepared برای Word/PDF.
- protocol معتبر، صف مشترک URI، انتظار pending edit هنگام Save، composition و conflict/dispose recovery صریح؛ سه custom editor روی همان TextDocument.
- تم پایدار سیستم/روشن/تیرهٔ وب، چهار تم VS Code، بوم تیره، کنترل جمع‌وجور و پوستهٔ افزونه با فونت/رنگ native. چیدمان وب و لمس ۴۴px موبایل حفظ شدند.
- facadeهای document/host/UI/adapters، خطاهای codeدار، guard مبتنی بر AST، API سازگار و CI مرتبط با تغییرهای core/webview/CSS.

## شواهد نهایی

| بررسی | نتیجه و دامنه |
| --- | --- |
| `pnpm test` | **۱۰۳۳ پاس در ۲۵ فایل** پس از آخرین اصلاح مهاجرت تنظیمات؛ `artifacts/final-unit.log` |
| `pnpm run check:architecture` | پاس؛ مسیر host در Node بدون DOM، API سازگار، PDF تنبل و ممنوعیت import میزبان در core |
| `pnpm run build` | پاس؛ `artifacts/final-build.log`؛ هشدار قبلی chunk بزرگ‌تر از ۵۰۰kB باقی است |
| مجموعهٔ موجود Chromium | ۵۵ مورد: اجرای کامل ۵۱ پاس/۴ شکست، سپس هر چهار شکست با فرمان متمرکز پاس؛ ادعای یک اجرای ۵۵/۵۵ نیست |
| VS Code واقعی 1.143.1 | **۳۱ بررسی پاس**؛ delayed ack/Save/IME/recovery/history/سه نما/خروجی/چهار تم/Tab در ۴۰۰px؛ گزارش [میزبان](vscode-session-validation.md) |
| اصلاح نهایی HC Light | شاهد native کوچک قبل/بعد: token سفید روی سفید → رنگ editor با کنتراست ۱۴٫۵۵؛ متن و overlay دقیقاً برابر. suite ۳۱تایی پس از این CSS دوباره اجرا نشد؛ `syntax-hc-light-after.json/png` |
| استقلال خروجی از تم | دو context تازه، فونت/KaTeX/Mermaid واقعی، برابری XML/style/media ورد و متن/operator/image PDF؛ شناسه/metadata ناپایدار مستثنا |
| تصاویر | سرپرست هفت تصویر وب، چهار پوستهٔ native، سه نمای ۴۰۰px و HC Light اصلاح‌شده را دید؛ [گزارش ظاهر](display-theme-and-native-shell.md) |
| بستهٔ محلی | `pnpm run package:vscode` پاس؛ `artifacts/parsiword-vscode-0.1.0.vsix`؛ نصب یا انتشار خودکار نشده |

چهار شکست integration به این شکل بسته شدند: `alignmentOnly:true` قدیمی اشتباهاً حفظ شده بود؛ migration دوباره آن را مطابق رفتار پیشین غیرفعال می‌کند و تست Word اصلی بدون تغییر پاس شد. دو تست burst/scroll انتظار فاصلهٔ literal تازه داشتند؛ اکنون متن کامل rendered، source دقیق پیش/پس از درج و محتوای کامل فقط ناحیهٔ تازه را مستقل می‌سنجند. تست اعلان به جای `.last()`، خطای واقعی را با پیام و visibility پیدا می‌کند؛ Sonner اعلان تازه را اول قرار می‌دهد.

فرمان‌های متمرکز چهار مورد: `playwright test tests/app.spec.ts --grep 'migrates legacy'`، `playwright test tests/rich-input.spec.ts tests/scroll-reflow.spec.ts --grep 'rapid burst|fast rich input' --workers=1` و `playwright test tests/rich.spec.ts --grep 'invalid diagrams and formulas' --project=chromium --workers=1`. نگاشت شواهد M01–M13 در [قرارداد Markdown](../markdown-contracts.md) است.

VSIX پس از به‌روزرسانی راهنما دوباره بسته‌بندی و manifest/README داخل ZIP بررسی شد؛ هر سه custom editor در آن وجود دارند. اندازهٔ نهایی ۵٬۳۹۷٬۲۱۱ بایت و SHA-256 برابر `78a9bbb362c3787191d7d3832860afaf41684d6cf18284c9ce0e8e649bdd544c` است.

## کارایی و موارد عقب‌افتاده

[پروتکل و نتیجه](heavy-input-protocol.md) ورودی، hash، viewport، CPU throttle، زمان‌بندی و محدودیت سنجه‌ها را ثبت می‌کند. فقط normal source/rich و یک long-block rich پس از تغییر مقایسه می‌شوند. AFTER دیگر شش سناریوی سنگین و بهینه‌سازی‌های اختیاری طبق دستور آخر کاربر backlog هستند؛ اجرای baseline آن‌ها به معنی اجرای AFTER یا رفع هزینه‌شان نیست.

مقایسهٔ نهایی انجام شد: p95 عادی منبع ۶۳→۷۰ms و rich برابر ۶۳→۷۷ms؛ long task هر دو بیشتر شد و به‌عنوان هزینهٔ باقی‌مانده ثبت و توسط سرپرست پذیرفته شد. p95 پاراگراف ۲۰۰هزارنویسه‌ای ۱۵۳۲→۱۳۵۸ms و کل منبع/پاراگراف دقیق بود؛ هنوز کند است. [گزارش ماشین‌خوان](performance-comparison.json) شاهد یک نمونه در هر حالت است، نه تضمین آماری یا سرعت گوشی.

## محدودیت‌های محصول و محیط

caret/scroll در view نگه‌داشته‌شده حفظ می‌شود؛ پس از dispose و ساخت editor type دیگر به نمای جدید منتقل نمی‌شود. Mermaid تصویر ذاتی روشن دارد، حتی در سند تیره. Markdown image و footnote بومی جدیدی به خروجی اضافه نشده؛ fallbackهای مستند باقی‌اند. autolink از متن entity/escapeشده طبق ADR ۰۰۰۶ عمداً با برخی رفتارهای GitHub متفاوت است.

Word از نظر فایل OOXML/فونت/فرمول و PDF از نظر متن/مختصات/تصویر آزموده شدند؛ runtime بومی Word، Android/iOS و چاپ فیزیکی اجرا نشدند. سنجش Chromium با CPU×4 سرعت گوشی واقعی نیست؛ IME رویدادمحور در webview، شاهد صفحه‌کلید فیزیکی سیستم‌عامل نیست.
