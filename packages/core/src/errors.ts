/** Stable failure codes shared by the editor, output adapters and host bridges. */
export const errorMessages = {
  FONT_MISSING: 'این فونت در دسترس نیست. یک فونت دیگر انتخاب کن.',
  FONT_STORAGE: 'فضای نگهداری فونت در دسترس نیست. فضای خالی گوشی را بررسی کن.',
  FONT_TOO_LARGE:
    'فایل این فونت برای این نسخه بیش از حد بزرگ است؛ فونت دیگری انتخاب کن.',
  FONT_FORMAT:
    'نسخهٔ قابل استفاده در Word برای این فونت دریافت نشد. فونت دیگری انتخاب کن.',
  FONT_NETWORK:
    'فونت دانلود نشد. اتصال اینترنت را بررسی کن و دوباره امتحان کن؛ فونت قبلی حفظ شده است.',
  FONT_CATALOGUE:
    'فونت دانلود نشد. اتصال اینترنت را بررسی کن و دوباره امتحان کن؛ فونت قبلی حفظ شده است.',
  FILE_TOO_LARGE: 'برای این نسخه، متن باید کمتر از ۵۰۰ هزار نویسه باشد.',
  FILE_OPEN_FAILED:
    'باز کردن فایل انجام نشد. یک فایل متنی یا Markdown انتخاب کن.',
  FILE_SAVE_FAILED:
    'ذخیرهٔ فایل انجام نشد. فضای خالی و محل ذخیره را بررسی کن و دوباره امتحان کن.',
  DOCUMENT_TOO_LARGE:
    'سند بیش از حد بزرگ است. حداکثر ۵۰۰ هزار نویسه پشتیبانی می‌شود.',
  MATH_TOO_LARGE: 'فرمول بیش از حد طولانی است. آن را کوتاه‌تر کن.',
  MATH_INVALID:
    'فرمول LaTeX معتبر نیست یا پشتیبانی نمی‌شود. متن فرمول را بررسی کن.',
  MATH_WORD_UNSUPPORTED:
    'این ساختار فرمول هنوز به Word تبدیل نمی‌شود. فرمول را ساده‌تر کن.',
  MATH_PDF_UNAVAILABLE:
    'برای ساخت PDF فرمول، سند را در برنامه یا مرورگر باز کن.',
  DIAGRAM_TOO_LARGE: 'نمودار بیش از حد بزرگ است. آن را به چند نمودار تقسیم کن.',
  DIAGRAM_RENDER_FAILED: 'نمودار Mermaid رسم نشد. دستورهای نمودار را بررسی کن.',
  DIAGRAM_NOT_READY: 'نمودار هنوز برای خروجی آماده نشده است. دوباره امتحان کن.',
  TIKZ_TOO_LARGE: 'کد TikZ بیش از حد بزرگ است. شکل را به چند بخش تقسیم کن.',
  TIKZ_RENDER_FAILED: 'رسم نمودار TikZ انجام نشد. کد و کتابخانه‌های شکل را بررسی کن.',
  TIKZ_TIMEOUT: 'رسم نمودار TikZ بیش از حد طول کشید. کد شکل را ساده‌تر کن و دوباره امتحان کن.',
  TIKZ_LOAD_TIMEOUT: 'بارگیری موتور TikZ بیش از حد طول کشید. اتصال را بررسی کن و دوباره امتحان کن.',
  TIKZ_UNAVAILABLE: 'موتور TikZ بارگیری نشد. اتصال یا فایل‌های برنامه را بررسی کن و دوباره امتحان کن.',
  IMAGE_NOT_READY: 'تصویر هنوز برای خروجی آماده نشده است. دوباره امتحان کن.',
  IMAGE_EXPORT_FAILED: 'تصویر به خروجی اضافه نشد. مسیر فایل، دسترسی به پوشه و اجازهٔ CORS تصاویر اینترنتی را بررسی کن.',
  IMAGE_EXPORT_TOO_LARGE: 'تصاویر این سند برای خروجی بیش از حد بزرگ‌اند. اندازه یا تعداد تصاویر را کمتر کن.',
  PDF_FONT_NOT_READY: 'فونت خروجی آماده نیست. دوباره امتحان کن.',
  PDF_IMAGE_INVALID: 'اندازهٔ تصویر خروجی معتبر نیست.',
  PDF_IMAGE_BUDGET:
    'فرمول‌ها و نمودارهای این سند برای حافظهٔ خروجی PDF بیش از حد بزرگ‌اند. سند را به چند بخش تقسیم کن.',
  PDF_COLUMN_TOO_NARROW:
    'عرض یک ستون برای نمایش متن PDF کافی نیست. تعداد ستون‌ها یا اندازهٔ فونت را کمتر کن.',
  PDF_TABLE_TOO_WIDE:
    'جدول بیش از حد ستون دارد. آن را به جدول‌های کوچک‌تر تقسیم کن.',
  PDF_CELL_TOO_LARGE:
    'محتوای یک خانهٔ جدول از صفحه بزرگ‌تر است. فرمول یا تصویر را کوچک‌تر کن.',
  PDF_FORMULA_IMAGE_FAILED:
    'ساخت تصویر فرمول برای PDF انجام نشد. دوباره امتحان کن.',
  INVALID_HOST_REQUEST: 'درخواست برنامه معتبر نیست. سند را دوباره باز کن.',
  DOCUMENT_CHANGED_DURING_SAVE: 'سند هنگام ذخیره تغییر کرد. دوباره ذخیره کن.',
  DOCUMENT_SAVE_CANCELLED: 'ذخیرهٔ سند لغو شد. سند فعلی باز می‌ماند.',
  SYNC_TIMEOUT: 'هماهنگ‌سازی سند کامل نشد. دوباره امتحان کن.',
  DOCUMENT_CONFLICT: 'تغییرهای هم‌زمان سند تداخل دارند. سند را دوباره باز کن.',
  SYNC_REJECTED: 'تغییر سند پذیرفته نشد. سند را دوباره باز کن.',
  HOST_REQUEST_FAILED: 'درخواست برنامه انجام نشد. دوباره امتحان کن.',
  RICH_CONTENT_FAILED:
    'آماده‌سازی فرمول یا نمودار انجام نشد. دوباره امتحان کن.',
} as const;

export type ErrorCode = keyof typeof errorMessages;
export type ErrorDetails = { cause?: unknown };

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(errorMessages, value)
  );
}

export class ParsiWordError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, details: ErrorDetails = {}) {
    super(errorMessages[code]);
    this.name = 'ParsiWordError';
    this.code = code;
    this.cause = details.cause;
  }
}

/** Accepts serialized host errors too; arbitrary message strings are never classified. */
export function getErrorCode(error: unknown): ErrorCode | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  return isErrorCode(error.code) ? error.code : undefined;
}

const fontCodes: ReadonlySet<ErrorCode> = new Set([
  'FONT_MISSING',
  'FONT_STORAGE',
  'FONT_TOO_LARGE',
  'FONT_FORMAT',
  'FONT_NETWORK',
  'FONT_CATALOGUE',
]);

export function isFontError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code !== undefined && fontCodes.has(code);
}

/** Returns a locale key; callers translate it through their existing locale provider. */
export function errorMessage(
  error: unknown,
  fallback: string = errorMessages.HOST_REQUEST_FAILED,
): string {
  const code = getErrorCode(error);
  return code ? errorMessages[code] : fallback;
}
