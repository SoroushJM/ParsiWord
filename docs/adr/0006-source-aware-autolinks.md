---
status: accepted
---

# پیوند خودکار با موقعیت مشخص در منبع

این تصمیم پیاده‌سازی در review معماری ۲۰۲۶-۱۰-۲۳ برای تحقق [قرارداد حفظ منبع](0005-logical-markdown-source.md) انتخاب شد. نتیجهٔ تست و تحویل کد جداگانه در فایل پیشرفت ثبت می‌شود؛ وضعیت accepted این ADR به معنی پایان پیاده‌سازی نیست.

ParsiWord پیوند خودکار `http(s)`، `www` و ایمیل را با tokenizer مرحلهٔ parse در GFM تشخیص می‌دهد و پیوندهای داخل `<…>` در CommonMark را نیز حفظ می‌کند. فقط transform ثانویهٔ `gfm-autolink-literal` که متن decodeشده را دوباره برای ساخت لینک جست‌وجو می‌کند کنار گذاشته می‌شود. اگر tokenizer نشانه‌گذاری escape یا entity را پیوند تشخیص نداده باشد، transform بعدی آن را دوباره لینک نمی‌کند. سایر transformهای Markdown حفظ می‌شوند.

دلیل این انتخاب، امکان حذف لینک در ویرایش rich و نگاشت دقیق آن به منبع است. در بررسی کد موجود، writer برای متن بدون mark از `https\://example.com` استفاده می‌کرد؛ transform ثانویه پس از decode دوباره آن را به لینک تبدیل می‌کرد و می‌توانست node بدون source position بسازد. نتیجه یا بازگشت ناخواستهٔ لینک بود یا خطای نگاشت منبع. خاموش‌کردن همهٔ autolinkها، حذف خطای mapping بدون اصلاح معنا، و بازنویسی بی‌قید کل پاراگراف پذیرفته نشدند.

این یک تفاوت آگاهانه با برخی رفتارهای GitHub است، نه ادعای اشکال در تمام رفتارهای upstream. [مستندات رسمی افزونه](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal) دو الگوریتم parse و transform و تفاوت پردازش escape/entity را توضیح می‌دهد. قواعد پیوند خودکار هنگام parse در [بخش ۶٫۹ مشخصات GFM](https://github.github.io/gfm/#autolinks-extension-) آمده‌اند.

تمام مصرف‌کنندگان ParsiWord، شامل rich، Word و PDF، باید این انتخاب واحد را از parser مشترک بگیرند. قرارداد با نمونه‌های مستقل URL، www، ایمیل، پیوند داخل زاویه، reference و متن escape/entity سنجیده می‌شود. انتخاب transform نباید به نام تابعی وابسته باشد که minifier آن را تغییر می‌دهد؛ smoke test خروجی production نیز لازم است. تغییر نسخهٔ افزونه باید fixtureهای grammar و source position را دوباره بگذراند.
