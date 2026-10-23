# وضعیت قابل‌بازیابی اجرای هدف

آخرین به‌روزرسانی: ۲۰۲۶-۱۰-۲۳. وضعیت: **دامنهٔ پذیرفته‌شده تکمیل و توسط سرپرست بررسی شد؛ کار الزامی باز ندارد**. [گزارش تحویل](validation/implementation-acceptance.md) نتیجهٔ نهایی و محدودیت‌ها را ثبت می‌کند.

## شروع پس از compact

`AGENTS.md`، `agent.md`، [هدف](implementation-goal.md)، [roadmap](architecture-roadmap.md) و همین فایل را بخوان؛ سپس وضعیت Git/هدف را بررسی کن. کار تمام‌شده را دوباره شروع نکن. پیاده‌سازی با سه عامل `gpt-6.1-sol / xhigh` انجام شد و سرپرست review و پذیرش را بر عهده داشت. متن ابزار سؤال فقط انگلیسی باشد.

**آخرین دستور کاربر:** سناریوهای سنگین کافی‌اند؛ این فیچر جمع و سپس کار بعدی دنبال شود. stress/fuzz تازه و پروژهٔ بهینه‌سازی باز وارد این دامنه نشد. فقط normal source، normal rich و یک long-block rich موجود پس از تغییر سنجیده شدند. AFTER شش مورد سنگین دیگر و بهینه‌سازی هزینه‌های باقی‌مانده backlog هستند؛ برای بستن هدف الزامی نیستند.

## تصمیم‌های اجراشده

- سه نمای **فقط VS Code**: Source + Result، Markdown Source با textarea فارسی ParsiWord و Rendered Result قابل‌ویرایش؛ native Text Editor جدا. چیدمان وب حفظ شد.
- وب: System/Light/Dark پایدار؛ افزونه: چهار تم میزبان. UI و سند تیره، رنگ Word/PDF مستقل.
- افزونه پوستهٔ تخت، فونت/رنگ native، کنترل‌های ۲۶px و آیکن ۱۶px دارد؛ فونت سند مستقل. وب: کنترل دسکتاپ ۳۲px و لمس موبایل ۴۴px.
- Markdown منطقی مرجع فوری؛ delay فقط نمایش ثانویه. حفظ متن نامرتبط، فاصله/escape/EOL حتی داخل پاراگراف؛ تغییر ساختاری محدود. متن تازه می‌تواند escape/entity شود؛ منبع قدیمیِ نامرتبط normalize نمی‌شود.
- نرم‌خط عادی در rich/Word/PDF فاصلهٔ نمایشی؛ hard break و کد/فرمول محفوظ. view/theme منبع را بازنویسی نمی‌کند.

## وضعیت مخزن

مسیر `C:\Users\sorou\Desktop\New folder\ParsiWord`؛ مبنای پیاده‌سازی `f38dde8`. پس از پایان هدف، کاربر صریحاً commit و push تغییرهای تکمیل‌شده به مقصد موجود `origin/main` را درخواست کرد؛ نتیجهٔ ارسال و شناسهٔ commit از Git قابل‌بازیابی است. گزارش‌های اعتبارسنجی پیش از این درخواست نوشته شده‌اند. حذف‌های قبلی `docs/vscode-plan.md`، `docs/vscode-validation.md` و `docs/word-android-bidi-investigation.md` حفظ شدند؛ restore نکن. roadmap و `docs/astera-architecture-review` از ابتدا ورودی untracked کاربر بودند؛ review تاریخی دست‌نخورده است. READMEهای ریشه/افزونه اکنون سه نما، تم، نصب و محدودیت view position را توضیح می‌دهند.

## بسته‌های تمام‌شده

| بسته | نتیجه |
| --- | --- |
| W0 | مصاحبه، glossary، ADRها، [قرارداد M01–M13](markdown-contracts.md)، [baseline](validation/architecture-baseline.json) و [شاهد bidi](validation/bidi-comparison.json) ثبت شد. |
| W1/W2/W3 | document-model/grammar مشترک، reference بازگشتی، source ledger با transaction/StepMap، cache و history محدود؛ یافته‌های raw widget، code cache، syntax/entity، hard break و split list بسته شدند. |
| W4/W6/U3 | session/limits/snapshot/recovery، protocol، journal/drain و صف مشترک URI، IME و سه نما؛ Save/switch/dispose raceها تست و اصلاح شدند. مهاجرت alignmentOnly قدیمی نیز مطابق مبنا اصلاح شد. |
| W5 | context مشترک و خروجی snapshot؛ فایل واقعی OOXML/PDF و استقلال تم با فونت/KaTeX/Mermaid واقعی در دو context تازه پاس. |
| U1/U2/W7 | تم، تراکم، پوستهٔ native و scope CSS؛ تصاویر چهار تم و سه نمای ۴۰۰px دیده شد. آخرین اشکال syntax در HC Light با شاهد before/after بسته شد. |
| W8 | facadeهای document/host/UI/adapters، API سازگار، خطاهای codeدار، guard مبتنی بر AST و CI. [مرجع API](core-api.md). |
| W9 | baseline معمولی/هفت heavy و سه AFTER محدود انجام شد؛ هزینهٔ باقی‌مانده صریح و توسط سرپرست در دامنهٔ کاهش‌یافته پذیرفته شد. [پروتکل](validation/heavy-input-protocol.md) و [گزارش کامل](validation/performance-comparison.json). |

## اعتبارسنجی و artifact نهایی

- `pnpm test`: **۱۰۳۳ پاس در ۲۵ فایل** پس از آخرین اصلاح کد؛ `artifacts/final-unit.log`.
- `pnpm run check:architecture` و `pnpm run build`: پاس؛ `artifacts/final-build.log`. هشدار قبلی chunk بزرگ‌تر از ۵۰۰kB باقی است.
- مجموعهٔ موجود Chromium: ۵۵ مورد؛ اجرای کامل **۵۱ پاس/۴ شکست**، سپس چهار مورد با فرمان متمرکز پاس. خطای migration واقعی اصلاح شد؛ دو تست اکنون متن کامل rich و source دقیق اطراف ناحیهٔ درج را می‌سنجند؛ تست toast پیام را به جای ترتیب DOM بررسی می‌کند. ادعای یک اجرای ۵۵/۵۵ نکن.
- VS Code 1.143.1 واقعی: **۳۱ بررسی پاس** شامل delayed ack/Save، IME، conflict/dispose، history، CRLF، خروجی، چهار تم و Tab واقعی در ۴۰۰px. [گزارش میزبان](validation/vscode-session-validation.md). آخرین CSS برای syntax HC Light فقط شاهد کوچک جدا دارد، نه تکرار suite کامل.
- سرپرست هفت تصویر وب، چهار `shell-vscode-*.png`، سه `narrow-*.png` و `syntax-hc-light-after.png` را دید؛ آخرین math/code منبع HC Light کنتراست ۱۴٫۵۵ و متن/overlay دقیق دارد. [گزارش ظاهر](validation/display-theme-and-native-shell.md).
- `pnpm run package:vscode` پاس؛ پس از تغییر README فقط pack دوباره اجرا شد. `artifacts/parsiword-vscode-0.1.0.vsix` برابر ۵٬۳۹۷٬۲۱۱ بایت؛ SHA-256: `78a9bbb362c3787191d7d3832860afaf41684d6cf18284c9ce0e8e649bdd544c`. manifest و README داخل ZIP هر سه نما را دارند. نصب خودکار نشده است.
- `git diff --check` بدون خطای whitespace؛ فقط هشدارهای موجود LF/CRLF. تغییرهای کاربر محفوظ‌اند.

## کارایی و محدودیت‌های بازِ پذیرفته‌شده

با viewport۳۹۳×۸۵۱ و CPU×4، p95 منبع عادی ۶۳→۷۰ms و rich عادی ۶۳→۷۷ms شد. long task عادی ۵۵۶→۸۲۶ و ۵۸۶→۹۶۱ms افزایش یافت؛ بهبود عمومی کارایی ادعا نکن. پاراگراف ۲۰۰٬۰۴۰نویسه‌ای rich: p95 برابر ۱۵۳۲→۱۳۵۸ms و long task برابر ۲۷٬۱۹۲→۲۰٬۹۱۳ms، کل منبع و پاراگراف دقیق. هر حالت یک اجرا؛ event→اولین rAF سرعت گوشی یا تکمیل paint نیست. ابزار قدیمی normal-rich برابری کامل منبع را assert نمی‌کند؛ برای آن ادعای ثبت‌نشده نکن. هزینه‌ها و شش AFTER باقیمانده backlog هستند.

caret/scroll در view retained حفظ می‌شود؛ انتقال آن‌ها بعد از dispose و ساخت editor type دیگر پیاده نشده است. Mermaid تصویر ذاتی روشن و خوانا دارد. runtime بومی Android/iOS/Word، چاپ فیزیکی و IME سخت‌افزاری آزموده نشده‌اند. Android فقط ARM64 و emulator خارج از مجوز است. رفتار autolink literal طبق [ADR ۰۰۰۶](adr/0006-source-aware-autolinks.md) عمداً با برخی رفتارهای GitHub فرق دارد.

## اقدام بعدی

عامل‌های core/host/theme تحویل نهایی داده‌اند؛ کار کدنویسی یا تست فعال ندارند. سرور اختصاصی AFTER۱۴۲۲ و baseline۱۴۲۱ بسته شدند. برای همین هدف اقدام الزامی دیگری باقی نیست. گزارش نهایی و VSIX به کاربر تحویل شود؛ backlog اختیاری را بدون درخواست تازه دوباره شروع نکن. فیچر جدید باید از درخواست بعدی کاربر تعیین شود.
