# راهنمای وضعیت فعلی

برای ادامهٔ کار ابتدا [agent.md](../agent.md) و برای بررسی ظاهر
[ui-capture.md](ui-capture.md) را بخوان. نتیجهٔ نسخه‌های جدید در
[releases/](releases/) ثبت می‌شود؛ متن زیر تاریخچهٔ کار است و بعضی مسیرها،
نسخه‌ها و فرمان‌های قدیمی آن دیگر راهنمای اجرا نیستند.

## نسخهٔ ۰.۴.۶

اصلاح بومی اندروید، insets نوارهای سیستم و بریدگی را پس از padding والد
WebView مصرف می‌کند تا ناحیهٔ امن دوباره در CSS حساب نشود؛ insets صفحه‌کلید
حفظ می‌شوند. مسیر تایپ پیش‌نمایش از نتیجهٔ بلوک‌های دست‌نخورده استفاده
می‌کند؛ ساخت نقشهٔ اسکرول در هر کلید و اندازه‌گیری textarea پنهان حذف
شده‌اند. رابط ثابت هم با هر تغییر متن دوباره ساخته نمی‌شود. ابزارها از کنترل‌های
موجود shadcn/ui و [مهارت رسمی آن](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md)
پیروی می‌کنند.

Markdown اصلی و ورودی خروجی Word فوراً به‌روز می‌شوند. فقط نمایش textarea
ثانویه هنگام تایپ پیش‌نمایش ۱۲۰ms تأخیر دارد و با تغییر حالت یا فوکوس منبع
فوراً هماهنگ می‌شود؛ ذخیرهٔ خودکار از متن اصلی استفاده می‌کند.

مقایسهٔ باندل production روی سند نمونه همراه پاراگراف آزمون، ۲۸٬۱۴۷ نویسه،
۳۹۳×۸۵۱px، CPU چهار برابر کندشده و ۳۲ ورودی، میانهٔ ۳۳۱ms در ۰.۴.۵ را
به ۵۳ و ۵۶ms در دو اجرای ۰.۴.۶ رساند؛ صدک ۹۵ از ۵۱۴ به ۷۲ و ۹۹ms رسید.
زمان از beforeinput تا اولین requestAnimationFrame مرورگر اندازه‌گیری شد؛
این نتایج سرعت واقعی گوشی نیستند. جزئیات در
[گزارش کارایی](releases/0.4.6-performance.json) ثبت شده است.

۸۶۹ تست واحد، ۳۴ تست Chromium، همگامی نمونه‌ها و ساخت نهایی TypeScript/Vite
پاس شدند. تست‌های جدید IME فارسیِ مرورگر، تایپ پشت‌سرهم، خروجی فوری Word،
حفظ NodeViewها، تغییر فوری حالت و مرز دقیق ۵۰۰ هزار نویسه را پوشش می‌دهند.
عکس‌های موبایل/دسکتاپ سرریز افقی یا badge حذف‌شده ندارند؛ انتخابگر و نوار
منبع در اسکرول نمونه در y=0 و y=60 ماندند.

APK آزمایشی ۰.۴.۶ با کد ۴۰۰۶، شناسهٔ Preview و همان گواهی امضای ۰.۴.۵
ساخته و روی Gofile آپلود شد؛ حجم آن ۹٬۱۲۹٬۵۸۷ بایت است. امضاهای v2/v3،
ARM64، نبود debug/testOnly، CRC، منابع فرانت‌اند و هم‌ترازی ۱۶KB تأیید
شدند. اندازه و MD5 آپلود با فایل محلی یکسان‌اند. لینک دانلود، SHA256 و
[گزارش APK](releases/0.4.6-preview-verification.json) در
[یادداشت ۰.۴.۶](releases/0.4.6.md) ثبت‌اند. نصب و اجرای بومی روی گوشی را
کاربر انجام می‌دهد؛ شبیه‌ساز اجرا نشده و باینری دسکتاپ تازه‌ای ساخته نشده است.

## نتیجهٔ ۰.۴.۵

در ۰.۴.۴ ادیتور و پیش‌نمایش هم‌زمان، ادیتور با ارتفاع خودکار، نوار چسبان،
ذخیره/تنظیمات بالای سند و ابزار عکس‌گرفتن با یک فراخوانی اضافه شدند.
نشان‌های زنده/روی دستگاه حذف شده‌اند. اندروید فقط ARM64 است؛ فرمان‌های
قدیمیِ شامل x86 در تاریخچه را اجرا نکن. شبیه‌ساز بنا به خواست کاربر کنار
گذاشته شده است. remote یا push انجام نشده است.

اصلاح رابط پس از ۰.۴.۴: در موبایل تا عرض ۸۹۹px، انتخابگر چسبان میان
ویرایش و پیش‌نمایش جابه‌جا می‌شود و فقط پنل فعال نمایش دارد؛ دسکتاپ دو
پنل هم‌زمان دارد. جای اسکرول بر اساس بلوک منبع در هر دو جهت هماهنگ
می‌شود و هنگام تغییر حالت حفظ می‌ماند. اندازهٔ نمودارهای Mermaid در
پیش‌نمایش با متن متناسب شده است. پیش‌نمایش با Tiptap 3 به ویرایشگر مستقیم
متن قالب‌بندی‌شده و نوار ابزار تیتر/فهرست تبدیل شده است؛ تغییرهای آن در
Markdown همان سند و ذخیرهٔ خودکار منعکس می‌شوند. ابزار عکس گزینهٔ `--view edit|preview`
دارد. این تغییرها در نسخهٔ ۰.۴.۵ و APK آزمایشی ARM64 بسته‌بندی شده‌اند؛
اجرای روی گوشی به تست کاربر واگذار شده است.
نوار ابزار موبایل دو ردیف با اسکرول داخلی افقی دارد. نمودارهایی که واقعاً
از عرض پنل بزرگ‌ترند، راهنمای اسکرول افقی نشان می‌دهند. مجوزهای وابستگی‌های
ویرایشگر با نسخه و منبعشان در `public/licenses/Rich-editor-MIT.txt` همراه اپ هستند.

اعتبارسنجی ۲۰۲۶/۱۰/۲۲: هر ۸۶۹ تست واحد و هر ۲۹ تست Chromium، بررسی
همگامی نمونه‌ها و ساخت TypeScript/Vite پاس شدند. تست‌ها ویرایش مستقیم و
رفت‌وبرگشت Markdown، ذخیرهٔ پیش‌نویس، Word واقعی و فونت‌های داخلش، جهت متن،
اسکرول دوطرفه، سطرهای بلند در عرض ۳۲۰px، تغییر عرض گوشی و حفظ موقعیت پس
از رسم دیرهنگام Mermaid را پوشش می‌دهند. خط‌شکست داخل سلول جدول با `<br>`
در Markdown و شکست خط واقعی Word حفظ می‌شود. عکس‌های واقعی موبایل و
دسکتاپ با ابزار پروژه بازبینی شدند؛ سرریز افقی صفحه وجود نداشت. این بررسی
اندازهٔ viewport مرورگر است و تأیید بومی Android/iOS محسوب نمی‌شود.

نسخهٔ ۰.۴.۵ با آیکن تازه و APK آزمایشی release ساخته و روی Gofile آپلود
شد. شناسهٔ `app.parsiword.mobile.preview` و نام ParsiWord Preview با نصب
عادی فرق دارند، چون کلید قبلی همراه سورس نبود؛ نصب جدید کنار برنامهٔ
قبلی می‌ماند و داده‌های آن را تغییر نمی‌دهد. امضا، CRC، ARM64، نسخهٔ ۴۰۰۵،
منابع فرانت‌اند و تراز ۱۶KB بررسی شدند. لینک دانلود، هش و گزارش کامل در
[یادداشت ۰.۴.۵](releases/0.4.5.md) هستند. منابع آیکن همهٔ پلتفرم‌ها به‌روزند؛
باینری دسکتاپ جدید یا شبیه‌ساز اجرا نشده است.

# وضعیت مرحلهٔ پلتفرم‌ها — ۰.۳.۰

کاربر نصب و اجرای اندروید ۰.۲.۴ را روی گوشی تأیید کرد و گفت تست شبیه‌ساز را رها کن. شبیه‌ساز متوقف شد؛ نصب روی آن تأیید نشده است. درخواست جدید: اول Git و کامیت نسخهٔ تقریباً درست، سپس ویندوز/لینوکس/iOS و کامیت جدا، سپس LaTeX و Mermaid. Git محلی روی main ایجاد شد؛ کامیت پایه 9439794 با tag android-v0.2.4-baseline است. remote ساخته/منتشر نشده است.

مرحلهٔ دوم: تنظیمات جداگانهٔ Linux (deb/AppImage)، Windows (NSIS per-user/WebView2)، iOS (حداقل 16.4 و Files)، فرمان‌های npm و دو workflow دستی GitHub آماده‌اند. alias Vite با fileURLToPath برای مسیر ویندوز اصلاح شد؛ target مرورگر Safari16.4 هم دارد. واردکردن فایل در iOS copy-to-sandbox می‌شود و نام فایل Windows/Linux/file URI درست حفظ می‌شود. هشت تست فایل اضافه شد؛ مجموع ۷۸۵ واحد و چهار Playwright و TypeScript/Vite پاس شدند. نسخهٔ نمایشی UI از package.json خوانده می‌شود.

لینوکس واقعاً کامپایل و روی Xvfb اجرا شد؛ فایل /workspace/tmp/native-portability.md از file dialog وارد و DOCX در /workspace/tmp/linux-native-export.docx ذخیره شد؛ ZIP و متن فارسی/انگلیسی بررسی شدند. screenshotهای خصوصی /workspace/tmp/linux-native-*.png. فایل اجرایی debug در /workspace/toolchains/desktop-target/debug/parsiword است. Docker image parsiword-cross-build و کانتینر parsiword-native-work برای GTK/WebKit/LLVM/NSIS آماده‌اند؛ کاربر اصلی root نیست. در کانتینر UID1000 account وجود دارد و sandbox WebKit عادی فعال است. HOME و SDKهای کراس‌کامپایل در /tmp، Cargo/Rustup و workspace mount هستند.

Windows: cargo-xwin نصب، Rust target x86_64-pc-windows-msvc و SDK/CRT دریافت شدند؛ cargo xwin check روی هدف ویندوز پاس شد. build/link/اجرای Windows هنوز تأیید نشده است. Cache و SDK ویندوز در /tmp/parsiword-windows-target و /tmp/parsiword-xwin-cache هستند. iOS روی Linux CLI ندارد و Xcode موجود نیست؛ config/workflow آماده است ولی binary یا اجرای iOS تأیید نشده است. اسناد دقیق docs/platforms.md.

برای کمبود دیسک فقط cacheهای ساخته‌شدهٔ Android x86 و debug، و image شبیه‌ساز کنارگذاشته‌شده حذف شدند؛ source/APKها محفوظ‌اند. Android release cache برای ساخت نهایی باقی است. خروجی Android همچنان همیشه فقط ARM64؛ x86 desktop با این محدودیت فرق دارد. مرحلهٔ LaTeX/Mermaid باید پس از کامیت مستقل این مرحله شروع شود.

## وضعیت پیشین

# وضعیت فعلی — نسخهٔ آزمایشی ۰.۲.۴، فقط ARM64، 2026-10-21

درخواست پایدار تازه: کاربر می‌خواهد APK روی گوشی‌اش نصب شود و صریحاً گفته دیگر هیچ خروجی Android x86/x86_64 ساخته نشود. فقط ARM64 بساز. کاربر قبلاً گفته خودش روی گوشی تست می‌کند؛ شبیه‌ساز لازم نیست. در تصویر، نصب ۰.۲.۳ با «App not installed» رد شد. مقایسهٔ واقعی APKهای قبلی امضای یکسان، versionCode افزایشی، ARM64 و هم‌ترازی سالم ۱۶کیلوبایتی را نشان داد؛ علت دقیق خطای نصب از پیام عمومی معلوم نشده است. کاربر گفته نسخهٔ قدیمی را حذف کرده. هرگز علت را قطعی به امضا یا وجود x86 نسبت نده.

خروجی تازه: نسخهٔ ۰.۲.۴، versionCode=2004، فقط arm64-v8a، minSdk=24، targetSdk=36. Cargo/Android release ساخته شد، R8/بهینه‌سازی فعال است و APK نهایی نه debuggable است و نه testOnly. بسته‌بندی jniLibs.useLegacyPackaging=true شده: کتابخانهٔ بومی فشرده و هنگام نصب استخراج می‌شود. تنظیم ABI در app/build.gradle.kts و پیش‌فرض‌های ABI/arch/targets در RustPlugin.kt روی ARM64 قرار گرفته‌اند. npm run android:apk ساخت release ARM64 و npm run android:preview ساخت debug ARM64 دارد. تغییرهای Gradle تولیدشده را با android init بازنویسی نکن.

APK نهایی artifacts/ParsiWord-0.2.4-arm64.apk فقط ۵۳۲۴۳۴۷ بایت (۵٫۳۲ مگابایت ده‌دهی) است؛ نسخهٔ قبلی ۴۸۵۶۶۱۵۴ بایت بود. تنها native library آن lib/arm64-v8a/libparsiword_lib.so با حجم ۷۲۷۴۶۸۰ بایت و فشردهٔ ۳۵۸۷۸۰۴ بایت است. DEX فشرده حدود ۷۰۷ کیلوبایت است. فایل align و با همان کلید پیش‌نمایش بیرون پروژه امضا شد؛ SHA256 certificate همان 24392264692fef8a6696e40473a42c60a75823115c2a4b784fed58339bf11c33 است. امضاهای v1/v2/v3 فعال‌اند. APK از پروفایل release است ولی هنوز انتشار آزمایشی با کلید preview است، نه انتشار فروشگاهی.

لینک دانلود جدید: https://gofile.io/d/bg1oUt36
SHA256 APK: 120b3415d4a53ef7769f608e5957729f380317db778bf5d5808f133f092867e5
اندازه و MD5 پاسخ سرور و SHA256 محلی تطبیق داده شدند؛ صفحهٔ دانلود HTTP 200 داشت. متادیتای امن در artifacts/download-links-0.2.4.json است. هیچ guest token ذخیره نشده است.

بررسی نهایی با scripts/verify-android-apk.py انجام شد و گزارش در artifacts/verification-0.2.4.json است: امضا از API24، امضای یکسان با نسخهٔ قبلی، معماری فقط ARM64، نبودن debug/testOnly، استخراج native، CRC و alignment ZIP، صحت ELF AArch64 و PT_LOAD 16384، وجود آخرین bundle index-BzbppuGj.js و فونت ParsiWordSymbols-Regular.ttf. ساخت TypeScript/Vite/Rust release/Kotlin/Java/Android optimization موفق بود. تست‌های ۷۷۷ واحد و چهار Playwright مرحلهٔ عملکردی قبلی تکرار نشدند، چون در این نسخه مبدل و UI تغییر نکرده‌اند. نصب و اجرا روی گوشی کاربر هنوز pending است؛ نباید موفقیت روی گوشی را ادعا کرد.

گزارش بسته‌بندی و روش بازسازی در docs/android-packaging.md و README است. لاگ /workspace/toolchains/android-024.log. سورس ZIP و checksums نسخهٔ ۰.۲.۴ در artifacts ساخته می‌شوند. لینک‌های آزمون Word کوتاه و کامل ۰.۲.۳ همچنان معتبرند چون منطق تبدیل تغییر نکرده است. عکس و کلید خصوصی در آرشیو سورس یا خروجی عمومی نیستند.

## تاریخچهٔ ۰.۲.۳

# وضعیت فعلی — نسخهٔ آزمایشی ۰.۲.۳، 2026-10-21

درخواست کاربر: اصلاح خطاهای تأییدشدهٔ Word اندروید، سپس دریافت Markdown جملهٔ S09. متن درخواستی: `متن \<React\`، خط جدید، `(version **19**)\> تمام شد.` بک‌اسلش آخر خط hard break است؛ از نظر نمایش معادل دو فاصلهٔ fixture است. S09 در عکس اصلی Word گوشی درست بود و مسیر RTL آن تغییر نکرده است؛ اختلاف قدیمی LibreOffice در این مورد همچنان برقرار است.

اصلاحات: در پاراگراف LTR، جهت جفتِ حاوی فارسی و انگلیسی با اولین نویسهٔ قوی داخلش تعیین می‌شود؛ (React و فارسی) دیگر علامت RTL نمی‌گیرد. برای جفت RTL ترکیبی داخل پاراگراف LTR مثل S11، محدودهٔ کامل با RLE/PDF استاندارد محصور می‌شود تا عبارت فارسی و عبارت داخلی React 19 یک گروه بمانند. این محصورسازی فقط برای همین حالت است، عمق ۴۰۰۰ جفت را با یک محدوده پوشش می‌دهد، قبل از تقسیم استایل/لینک/فونت محاسبه می‌شود، در هر پاراگراف متوازن است و روی متن دارای scope صریح یا حالت فقط راست‌چین اعمال نمی‌شود. پیش‌نویس Markdown تغییر نمی‌کند؛ DOCX می‌تواند شامل LRM/RLE/PDF باشد و در کپی/جست‌وجو همراه متن بیاید. w:dir / w:bdo / وارونه‌کردن یا تعویض پرانتز وجود ندارد. تشخیص خودکار پایهٔ پاراگراف هم علامت‌های جدید را خنثی می‌کند تا دادهٔ قدیمی bidi-js آن‌ها را حرف قوی لاتین فرض نکند.

فونت: ۱۴ نویسهٔ P04/P05 و P44–P48 از یک فونت TrueType جایگزین ۴۱۱۲بایتی ParsiWord Symbols استفاده می‌کنند. شکل‌ها از GNU Unifont 18.0.01 با مجوز SIL OFL 1.1 بدون تغییر طرح به outline تبدیل شده‌اند؛ attribution، source subset، provenance و اسکریپت بازسازی داخل پروژه است. فونت فقط در سندی که این نویسه‌ها را دارد جاسازی می‌شود. فقط همین نویسه‌ها در چهار script slot فونت جایگزین می‌گیرند؛ فونت انتخابی متن عادی حفظ می‌شود. پیش‌نمایش هم fallback دارد. پشتیبانی Word موبایل از فونت جاسازی‌شده هنوز باید روی دستگاه تأیید شود.

اعتبارسنجی: ۷۷۷ آزمون واحد، چهار Playwright و TypeScript/Vite پاس شدند. Word کوتاه از مبدل واقعی در دو صفحه و Word سخت در ۱۰ صفحه رندر شد. S11 و P01/P02 در LibreOffice با مرجع مستقل تطبیق دارند؛ هندسهٔ کلمات PDF برای S11 ترتیب Read < React < عبارت فارسی < then را تأیید کرد. همهٔ ۱۴ نویسه در متن واقعی رندر دیده شدند و pdffonts استفاده از فونت جاسازی‌شده را تأیید کرد، بدون نصب آن در سیستم. نتیجهٔ نسخهٔ تازه در Word اندروید هنوز pending است؛ تست‌های ساختاری و رندر محلی معادل تأیید گوشی نیستند.

لینک آزمون کوتاه دوصفحه‌ای: https://gofile.io/d/YeaLt8vT (43856 بایت)
لینک آزمون سخت کامل تازه: https://gofile.io/d/cyGxgRC1 (172706 بایت)
لینک APK ۰.۲.۳: https://gofile.io/d/Tjdh4Dlb (48566154 بایت)

هر آپلود با اندازه و MD5 پاسخ سرور و SHA256 محلی تطبیق داده شد؛ صفحات دانلود HTTP 200 بودند. اطلاعات امن در artifacts/download-links-0.2.3.json است. APK با همان امضای debug قبلی، versionCode=2003، minSdk=24، targetSdk=36 و ARM64/x86_64 ساخته شد؛ وجود bundle آخر index-BzbppuGj.js و فونت جدید داخل هر دو کتابخانهٔ native بررسی شد. نصب به صورت آپدیت ممکن است و نیازی به حذف داده نیست. برای بررسی مستقیم فایل Word نیازی به نصب APK نیست.

فایل‌های اصلی: src/word-direction.ts، src/converter.ts، src/delimiter-font.ts و src/data/delimiter-font.json؛ تغییر کوچک fallback پیش‌نمایش در App.tsx/globals.css. تست‌ها در همان فایل‌های unit و stress گسترش یافتند و انتظار blanket RTL قبلی اصلاح شد. scripts/export-fix-check.mjs سند کوتاه و scripts/export-hard-stress.mjs ../artifacts/0.2.3/ سند کامل را می‌سازند. تصمیم و محدودیت‌ها در docs/adr/0004-nested-rtl-in-ltr.md است. لاگ‌ها unit-023-final.log، ui-023.log، frontend-023.log و android-023.log در /workspace/toolchains هستند. خروجی‌ها و manifest در artifacts/0.2.3. عکس اصلی کاربر فقط در /workspace/tmp/word-device-review است و در خروجی عمومی یا سورس قرار ندارد.

## تاریخچهٔ ۰.۲.۲

# وضعیت فعلی — نسخهٔ آزمایشی ۰.۲.۲، 2026-10-21

نتیجهٔ تازهٔ Word اندروید: عکس اصلی کاربر از آرشیو 7z با ابعاد 540×9580 استخراج و بررسی شد؛ نسخه‌های عکس در چت فقط 72×1280 بودند. S09 روی گوشی با مرجع تطبیق دارد؛ اختلاف LibreOffice در این عکس تکرار نشده است. S11 هنوز در گروه‌بندی عبارت فارسیِ حاوی React 19 خراب است. ستون ترکیبی جدول، از جمله P01/P02، هم جهت نادرست علامت‌ها دارد. بازتولید فقط‌خواندنی در کد تأیید کرد شرط «وجود هر متن RTL درون جفت» علامت‌های (React و فارسی) را با وجود پایهٔ LTR، RTL می‌کند. S01–S06 در بخش متن واقعی این عکس نیستند. مربع‌های P04/P05 و P44–P48 مسئلهٔ پوشش فونت‌اند؛ E01 عمداً ناقص است. گزارش دقیق‌تر در docs/rtl-hard-stress.md ثبت شد. در این بررسی مبدل و APK تغییر نکرده‌اند؛ تست‌های قبلی ثابت‌کنندهٔ صحت دیداری این موارد نیستند و انتظار blanket RTL برای متن ترکیبی در stress matrix باید هنگام اصلاح بازنگری شود. عکس شخصی فقط در /workspace/tmp/word-device-review است و نباید در خروجی عمومی وارد شود.

درخواست جدید کاربر: آزمون سخت با همهٔ علامت‌های جفت، مشخصاً < > و 《 》 و { }، و استفاده از کتابخانهٔ آمادهٔ جهت Word اگر موجود باشد. APIهای آمادهٔ rightToLeft و bidirectional کتابخانهٔ فعلی docx استفاده می‌شوند؛ متد مستقیم RtlRun در API آن وجود ندارد. API رسمی اجرای فرمان RtlRun به خود Word وابسته است و یک تبدیل‌کنندهٔ مستقل اندروید نیست. مرجع OpenEdition همچنان پشت Anubis مسدود بود؛ فقط تصویر کاربر و مستندات رسمی مستقل بررسی شدند و نباید ادعا شود متن کامل مقاله خوانده شده یا تطبیق قبل/بعد با Word انجام شده است.

آزمون جدید: همهٔ ۶۵ جفت BidiBrackets از Unicode 18، همراه هفت جفت زاویه/نقل‌قول تکمیلی، مجموعاً ۷۲ جفت. ۱۴ سناریوی S01–S14 و یک سناریوی ناقص عمدی E01، با ۱۰ لایهٔ تودرتو، متن فارسی/انگلیسی، مبلغ و شماره، سبک و لینک، شکست خط، هم‌ارزی Unicode، HTMLمانند، emoji و نیم‌فاصله. متن واقعی با converter خود اپ ساخته شده و دو تصویر مرجع با جهت‌های دستیِ مستقل در انتهای DOCX آمده است. سند در LibreOffice ۱۰ صفحه دارد. فایل Markdown برای واردکردن در اپ هم ساخته شده است.

پیش از اصلاح، ماتریس اولیه ۴۳۷ بررسی داشت که ۲۷ بررسی مردود شد؛ این تعداد تکرار یک خانوادهٔ مشکل در چند حالت است، نه ۲۷ باگ مستقل. پنج جفت جدید در دادهٔ قدیمی bidi-js نبودند؛ زاویهٔ ASCII و گیومهٔ تکی هم کامل پوشش داده نمی‌شدند. قطع stack در شکست خط و خراب‌شدن جفت بیرونی با یک بازکنندهٔ ناقص داخلی اصلاح شد. از API جفت‌ها و هم‌ارزی bidi-js استفاده می‌شود و fallback با مجوز Unicode 18 فقط داده‌های ناقص آن را تکمیل می‌کند. متن و علامت اصلی جابه‌جا/تعویض/normalize نمی‌شوند. مجوز Unicode در public/licenses است.

اعتبارسنجی: ۴۸۹ آزمون واحد و چهار Playwright پاس شدند؛ سه آزمون DOCX کامل پس از نهایی‌شدن fixture هم مجدد پاس شدند. نکتهٔ باز: S09 (شکست خط درون علامت) و S11 (عبارت RTL حاوی LTR در پاراگراف LTR) در LibreOffice با مرجع مستقل فرق دارند. این دو مورد نباید حل‌شده اعلام شوند؛ نتیجهٔ Word اندروید با کاربر است. بعضی جفت‌های نادر/جدید ممکن است در فونت گوشی شکل نداشته باشند؛ کد Unicode هر ردیف آمده است. تست‌های منطقی/ساختاری به معنی درست‌بودن همهٔ نمایش‌ها نیستند.

لینک Word سخت: https://gofile.io/d/3039PLhD (170195 بایت)
لینک Markdown سخت: https://gofile.io/d/V9gTUHoP (10222 بایت)
لینک APK آزمایشی ۰.۲.۲: https://gofile.io/d/m0Ch9V5O (48541450 بایت)

آپلودها با MD5/اندازهٔ سرور و SHA256 محلی تطبیق داده شدند و صفحات دانلود HTTP 200 داشتند. اطلاعات امن در artifacts/download-links-0.2.2.json است؛ هیچ guest token ذخیره نشده. اعتبار زمانی مشخصی برای سرویس نداریم. APK با versionCode=2002، minSdk=24، targetSdk=36، معماری ARM64 و x86_64 و همان امضای debug قبلی ساخته شد. وجود آخرین bundle فرانت در native هر دو معماری بررسی شد؛ باید به صورت آپدیت نصب شود. برای بررسی مستقیم Word نیازی به نصب APK نیست.

فایل‌ها و گزارش: artifacts/hard-stress/ParsiWord-hard-stress.docx و .md و manifest.json و reference-1/2.png. منبع و روش آزمون در docs/rtl-hard-stress.md. fixture در tests/fixtures/rtl-stress.ts؛ داده و مجوز Unicode در tests/fixtures/unicode. تولید دوباره با node scripts/export-hard-stress.mjs. دو فایل تست جدید src/word-direction.stress.test.ts و src/converter.stress.test.ts هستند. لاگ‌ها /workspace/toolchains/unit-022.log، ui-022.log و android-022.log هستند. سورس ZIP و SHA256SUMS نسخهٔ ۰.۲.۲ در artifacts ساخته شده‌اند. هیچ عکس شخصی کاربر در خروجی عمومی یا سورس نیست.

امکانات فونت، Tailwind/shadcn، حذف عبارت «از یادداشت تا سند»، مسیرهای ساخت و محدودیت کانتکست ۲۵۲k مثل قبل باقی‌اند؛ جزئیات در تاریخچهٔ زیر آمده‌اند. اپ را هنوز برای سایر سیستم‌عامل‌ها نساخته‌ایم. کاربر روی Microsoft Word اندروید تست می‌کند؛ شبیه‌ساز لازم نیست.

## تاریخچهٔ وضعیت ۰.۲.۱

# وضعیت پروژه — نسخهٔ ۰.۲.۱، 2026-10-21

هدف کاربر: اپ چندسکویی تبدیل Markdown به Word، با شروع از اندروید و تمرکز بر متن فارسی/انگلیسی. کاربر خودش گوشی را تست می‌کند؛ نمایش‌دهنده Microsoft Word اندروید است. نسخهٔ سایر پلتفرم‌ها هنوز ساخته نشده است.

توضیح تازهٔ کاربر پس از ۰.۲.۱: منظور او از RtlRun فرمان داخلی Word در راهنمای https://documentation.openedition.org/en/docs/14-styling-a-text-as-rtl/ بوده است. تصویرِ مراحل افزودن فرمان به Ribbon ارسال شد. متن کامل صفحه پشت Anubis مسدود بود و نباید ادعا شود تمام آن خوانده شد. مستند رسمی Microsoft سه فرمان RightPara / RtlPara / RtlRun را جدا می‌کند. معادل‌بودن دقیق خروجی اپ با اجرای واقعی RtlRun در Word هنوز با DOCX قبل/بعد تأیید نشده است. نسخهٔ تازهٔ APK برای این لینک ساخته نشده و ۰.۲.۱ همچنان نسخهٔ فعلی است. شرح و منابع در انتهای docs/word-android-bidi-investigation.md ثبت شده‌اند.

کاربر خواسته از Tailwind، shadcn/ui و مهارت رسمی shadcn استفاده شود؛ انجام شده و فایل‌های مهارت قبلاً خوانده شده‌اند. مهارت frontend-design آنتروپیک هم خوانده شد. عبارت «از یادداشت تا سند» به درخواست او حذف شده و نباید برگردد. رابط فعلی حفظ شده و در این اصلاح فقط یک نمونهٔ متن ترکیبی اضافه شده است.

مشکل: تصاویر کاربر اصلاح ۰.۲ را رد کردند. جداکردن فاصله و نشانه از فارسی درست نبود. در فایل مقایسهٔ A/B/C، روش A در بخش‌های خوانا درست بود؛ C هم درست به نظر رسید، با بخشی از متن بلند زیر دکمهٔ شناور گوشی. روش B عبارت‌های انگلیسی و مبلغ را به جای اشتباه برد و رد شد. این فایل تاریخی در artifacts/bidi-comparison است؛ لینک قدیمی آزمون https://gofile.io/d/M1iFqcCO است.

کاربر خواست بیشتر تحقیق شود و سپس اصلاح انجام شود. مستند Microsoft، Unicode، W3C و کد Pandoc بررسی شدند. پیاده‌سازی جدید ۰.۲.۱ در src/word-direction.ts جهت عبارت را پیش از تقسیم پررنگ/مورب/لینک تعیین می‌کند. از کلاس کاراکتر و دادهٔ جفت پرانتز استفاده می‌کند، نه ترتیب بصری نهایی. فاصله و نشانهٔ فارسی با فارسی RTL می‌مانند. عبارت انگلیسی/عددی با نشانه‌های متعلق به خودش LTR است. ویژگی RTL هرگز روی حروف قوی انگلیسی اعمال نمی‌شود؛ مقدار false روی متن قوی فارسی هم اعمال نمی‌شود. w:dir و w:bdo و برعکس‌کردن متن استفاده نمی‌شوند. استایل‌ها run RTL پیش‌فرض ندارند و تنظیم paragraph bidi و alignment مستقل است.

در خروجی Word، دو LRM فقط برای مرز مبهم عبارت LTR عددی یا نشانه‌دار اضافه می‌شوند؛ متن پیش‌نویس و Markdown تغییر نمی‌کند. کپی/جست‌وجو در DOCX ممکن است شامل این کاراکترهای نامرئی شود. عبارت انگلیسی و عدد ساده علامت اضافه نمی‌گیرند. حالت «فقط راست‌چین» علامت و RTL run اضافه نمی‌کند. حالت RTL اجباری برای پاراگراف کاملاً انگلیسی هم پوشش داده شده است. جهت خودکار پیش‌فرض پیش‌نویس تازه است و تنظیم قدیمی کاربر حفظ می‌شود.

آزمون گسترده‌تر واقعاً دو خطای دیگر پیدا کرد: علامت ! در نقل‌قول انگلیسی و ; در انتهای inline code جابه‌جا می‌شدند؛ اصلاح مرز عبارت آن‌ها را در خروجی تصویری درست کرد. نامرئی‌کردن یا تعویض پرانتز انجام نشده است. این راه عمومی‌تر از اصلاح صرفاً پرانتز است، اما نیت همهٔ متن‌های مبهم را نمی‌توان خودکار تضمین کرد.

اعتبارسنجی: ۴۷ آزمون واحد و ۴ آزمون Playwright پاس شده‌اند. آزمون‌ها شامل حفظ متن، عبارت ترکیبی، مبلغ، شماره، تاریخ، درصد، URL، ایمیل، مسیر فایل، نقل‌قول/آپاستروف، یونیکد و emoji، قالب‌بندی، لینک، hard break، کد، جدول/فهرست و کش/جاسازی فونت هستند. چهار DOCX از خود تبدیل‌کننده با scripts/export-verification.mjs ساخته و در LibreOffice به PDF رندر شدند. نمونهٔ اصلی، متن ترکیبی گسترده، فونت وزیرمتن و حالت RTL اجباری بررسی شده‌اند. نمونه‌های جدید در artifacts/0.2.1 هستند. این تست‌ها تأیید نهایی نسخهٔ جدید در Word گوشی نیستند؛ کاربر باید خروجی جدید را در Word اندروید ببیند.

APK نهایی ۰.۲.۱ با versionCode=2001، minSdk=24 و targetSdk=36، شامل ARM64 و x86_64 ساخته شد. امضای debug همان قبلی است و باید به‌صورت آپدیت نصب شود. وجود آخرین bundle فرانت در کتابخانهٔ native هر دو معماری بررسی شد. فایل artifacts/ParsiWord-0.2.1-android64-preview.apk، اندازه 70309126 بایت و SHA256 برابر 88c4610e9ef17b24c7f87e7465e82635aed1caeed29bb286527966587e92d9c7 است.

لینک APK نهایی: https://gofile.io/d/oPX2xm3K
لینک نمونهٔ Word نهایی (حدود ۱۱ کیلوبایت): https://gofile.io/d/P9OlPwx6

هر دو آپلود با اندازه و MD5 سرور تطبیق داده شدند و صفحهٔ دانلود HTTP 200 برگشت. اطلاعات امن در artifacts/download-links-0.2.1.json است. لینک‌های فایل superseded مربوط به build میانی‌اند و نباید تحویل داده شوند. هیچ guest token ذخیره نشده است. کاربر قبلاً آپلود و لینک عمومی را خواسته چون روی اندروید فایل محلی را نمی‌تواند بگیرد. اعتبار زمانی مشخصی برای Gofile اعلام نشده است.

فونت‌ها: کاتالوگ ۱۹۴۹ خانواده از Google Fonts، جست‌وجو/فیلتر، دریافت انتخابی regular/bold TTF با همهٔ subsetها، کش ماندگار IndexedDB و حذف کش. وزیرمتن با مجوز داخل اپ است. فونت در DOCX جاسازی می‌شود و فونت بدون عربی از وزیرمتن برای cs استفاده می‌کند. Word موبایل ممکن است فونت جاسازی‌شده را نپذیرد. API CSS بدون کلید و metadata عمومی به کار می‌روند؛ متن سند برای گوگل فرستاده نمی‌شود. reqwest 0.12 با WebPKI roots در command محدود به میزبان‌های فونت گوگل است. این امکانات در ۰.۲.۱ حفظ شده‌اند.

رابط settings و font picker از shadcn Radix و Tailwind 4 است. components.json و src/components/ui موجودند. import globals.css باید پیش از App.css باشد و CSS قدیمی در لایهٔ legacy بماند؛ عوض‌کردن ترتیب، چیدمان و کلیک‌ها را خراب می‌کند.

تصمیم جدید و منابع تحقیق: docs/adr/0003-contextual-word-runs.md. تاریخچهٔ خطاها: docs/word-android-bidi-investigation.md و ADR 0002. سورس ZIP و SHA256SUMS نسخهٔ ۰.۲.۱ در artifacts ساخته می‌شوند. هیچ عکس شخصی کاربر در APK، سورس انتشار یا نمونه‌های عمومی قرار نگرفته است. Site جدیدی ساخته نشده است.

محیط ساخت در /workspace/toolchains است. برای ساخت دوباره . /workspace/toolchains/env.sh و سپس npm run tauri -- android build --debug --apk --target aarch64 x86_64 --ci را اجرا کن. لاگ نهایی android-021-final.log و تست‌ها unit-021.log و ui-021-final.log هستند. شبیه‌ساز لازم نیست؛ کاربر خودش تست گوشی را انجام می‌دهد.

کاربر خواسته سقف کانتکست همین محیط ۲۵۲k باشد؛ ابزار تغییر سقف یا usage نداریم و نباید ادعا شود این تنظیم انجام شده است. این وضعیت برای ادامهٔ کوتاه‌تر در گفت‌وگوی تازه ذخیره شده است.

## 0.4.0 — LaTeX and Mermaid

The Android baseline was committed as 9439794 and tagged android-v0.2.4-baseline.
The platform work was committed separately as b8ab561, tagged platforms-v0.3.0.
Android emulator work was stopped at the user's request after they confirmed
that 0.2.4 installs and works on their phone.

Added remark-math parsing, local KaTeX preview, native editable OMML export,
and lazy local Mermaid SVG/PNG rendering. Complete formulas are not replaced
with screenshots; diagrams are raster images with their Markdown source in
alternative text. Invalid or unsupported rich content reports a useful error
and blocks misleading export. Existing RTL direction tests are retained.
The integral regression discovered during visual inspection was corrected by
attaching a structured integrand to the library's otherwise empty n-ary body.
See docs/rich-content.md for limits and bundled library licenses/source.

Final functional checks: 798 unit tests and all six Playwright tests pass;
TypeScript/Vite builds pass. The generated Word demo was visually checked
in LibreOffice after the integral fix. The actual Linux release application
opened the demo Markdown through its native dialog, rendered equations and
Mermaid, then saved a DOCX with two native equations and two PNG diagrams.
Windows MSVC release linking and NSIS generation also passed, but no Windows
runtime test was performed. Linux category validation was corrected in this
phase. iOS configuration/workflow are prepared but unbuilt/unexecuted.
Android 0.4.0 ARM64 release signature/ABI/16 KiB alignment checks passed with
the same preview signing certificate as 0.2.4; new phone confirmation pending.
DEB packaging succeeded after the category fix. An AppImage was also packaged
locally using the official runtime downloaded separately after the packager's
automatic download failed. Public Linux distribution uses the 6.24 MB DEB;
AppImage runtime/portability has not been tested and it was not uploaded.

## 0.4.1 — production controls and portable fonts

Removed sample buttons, bracket-test card and alignment-only switch from the UI.
New drafts start blank. Existing draft text is preserved; old alignment-only
settings are disabled and system-font selections migrate to bundled Vazirmatn.
The low-level diagnostic converter API and regression fixtures remain for tools.

All selectable fonts now have actual embeddable files. Word exports load the
selected family plus needed Persian, Noto Sans Mono code and STIX Two Math math
faces. Math font is declared globally and on native math runs/control properties.
Fonts are full SFNT files, obfuscated according to OOXML, with font relationships
and embedTrueTypeFonts enabled. Code and math assets plus OFL licenses are bundled
for offline use. The rare-symbol fallback remains embedded only when needed.

801 unit tests pass. Seven Chromium and seven WebKit UI tests pass, including
migration, absent test controls, Google-font caching and full decoded-font byte
comparisons. WebKit replaces spaces with underscores in download suggestions;
the filename tests account for that browser behavior. LibreOffice visual checks
show the Persian and code faces from the file; its math renderer substitutes its
own fonts even though STIX is correctly declared and embedded in the DOCX.
Reader-specific rendering cannot be forced by adding more copies of font files.

macOS desktop configuration/CI and native-host browser checks were added. macOS
and iOS cannot be built/run in this Linux-only environment; Windows release can
be linked/packaged here but cannot be certified as runtime-tested on Windows.

Final native result: Linux release and local AppImage both ran and saved actual
DOCX files through native dialogs; each output passed full-byte checks for all
six embedded faces. Windows release/NSIS generation passed, including current
asset and AMD64 checks; no Windows OS launch is claimed. Android 0.4.1 release
APK passed signing/ABI/alignment/current-assets checks and retains the previous
signing certificate. macOS/iOS config schemas pass, but native Apple builds
cannot be performed without their macOS/Xcode host. These host limitations are
not represented as completed runtime tests. No Android x86 build was created.
