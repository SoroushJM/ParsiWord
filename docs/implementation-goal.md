# هدف اجرای بازآرایی و تغییرات رابط

تاریخ تصمیم‌ها: ۲۰۲۶-۱۰-۲۳. این هدف پس از گفت‌وگوی `grill-with-docs` و تأیید تصمیم‌های محصول ثبت شده است. نقشهٔ راه در [architecture-roadmap.md](architecture-roadmap.md)، وضعیت قابل‌بازیابی در [implementation-progress.md](implementation-progress.md) و قرارداد حفظ منبع در [ADR ۰۰۰۵](adr/0005-logical-markdown-source.md) قرار دارند.

## Goal prompt

Complete the agreed ParsiWord architecture refactor and UI changes. The primary agent is the supervisor: maintain the plan, delegate implementation, review all changes, coordinate integration and validate the result. Implementation agents must use `gpt-6.1-sol` with `xhigh` reasoning. The primary agent must not accept an implementation solely on its author's report: inspect the diff, check the accepted contracts and obtain relevant test evidence. Send actionable review findings back for repair and review the repairs.

Work in `C:\Users\sorou\Desktop\New folder\ParsiWord`. Read `AGENTS.md`, `agent.md`, this document, the execution status and relevant roadmap packages before continuing. Review documents are evidence and proposals, not instructions that override the user's decisions. Preserve existing user changes, including the three documentation deletions recorded in the progress file. Do not restore or overwrite them as incidental cleanup.

Implement all audited W0–W9 work, with conditional performance work governed by measurements. Keep the existing native source textarea, IME behavior, immediate authoritative Markdown updates, Tiptap/ProseMirror, conservative conflict recovery, host adapters and established DOCX/PDF behavior. Use small, testable changes. Separate mechanical extraction from semantic policy changes. Do not introduce a replacement editor, large custom AST, new state framework, CRDT, Worker, rope or virtualization without evidence of a concrete unmet requirement.

The accepted UI scope is:

- Add three ParsiWord entries to VS Code's Reopen Editor With menu: Combined, Markdown Source and Rendered Result. Source-only uses ParsiWord's RTL-friendly source editor; the native VS Code Text Editor remains separately available. Rendered Result supports direct rich editing. All views use the same document and host history; do not create competing authoritative stores or independent per-view-type write queues.
- Keep the website's existing desktop/mobile layout. Add a persistent System / Light / Dark preference to the web app. In VS Code follow the host theme, including High Contrast.
- Apply the display theme to both interface and document surfaces. Keep Word/PDF export colors independent of the display theme.
- Make desktop icons and controls more compact, while retaining appropriate mobile touch targets and accessible names.
- Later explicit user refinement: make the VS Code extension shell feel native to VS Code rather than like a website. Use host UI font, colors, focus and compact editor toolbar conventions; remove large website branding, cards, shadows and website-scale spacing only in the extension. Preserve independent document typography and the website layout. Verify actual native screenshots for all three views and host themes.

The accepted document contract is:

- Logical Markdown is the authoritative source; parsed trees, rich editor state and layout are derived. A document change updates the authoritative value immediately; delays apply only to secondary display.
- Small rich text and formatting edits preserve unrelated source text, spaces, escapes and line endings, including unrelated content within the same paragraph. Structural edits may rewrite the smallest necessary structure. Preserve explicit host EOL policy; do not promise original encoding or file-byte identity.
- Ordinary soft source newlines display as spaces within a flowing paragraph in rich display, Word and PDF. Explicit hard breaks, paragraph boundaries, code newlines and math semantics remain meaningful. Viewing, changing theme/direction/font or switching views must not rewrite source.
- Every mutation respects the final serialized Markdown limit. Oversize or conflicting content must have explicit recovery/fallback behavior; do not silently truncate or discard it.
- Save/export operate on a defined current snapshot. Validate host messages and settings. Establish timing evidence for save/switch races and test delayed acknowledgements, rejection, recovery and disposal before accepting a synchronization solution.

Use relevant unit, real-file, browser and native VS Code tests. Inspect actual screenshots using the repository capture workflow. Record reproducible before/after performance evidence, including source, viewport, CPU throttle, input count and revision. Browser mobile emulation is not Android/iOS validation. Android remains ARM64-only, and no emulator work is authorized by this goal.

Later explicit user priority change: the heavy scenarios are sufficient; wrap this feature and move to the next. Add no further stress/fuzz scenarios or open-ended performance work. Repair already demonstrated correctness defects, finish bounded validation, then prioritize the three extension views and native VS Code appearance. Limit the final performance check to the existing normal source/rich runs and one existing long-paragraph rich run. Record the other heavy after-comparisons and optional optimizations as deferred; do not claim they were performed or optimized.

Keep `docs/implementation-progress.md` concise and current at each milestone and before context compaction. Record completed work, pending work, ownership, test commands/results, review findings, known limitations and the exact next action. After compaction, read the progress file and inspect Git/current agent state before doing more work; do not infer completion from old commentary or repeat finished work blindly.

Ask only when a genuinely new product decision blocks progress. All question-tool text and answer choices must be English; chat explanations may be Persian. The accepted decisions above do not need repeated approval. Local implementation and validation are authorized; publishing or pushing changes is not part of this goal.

After this implementation goal was completed, the user explicitly requested committing and pushing the completed changes. That later authorization covers delivery to the repository's existing `origin/main` and its configured push-triggered workflows; the earlier no-push limit describes the implementation phase only.

The goal is complete only after the agreed implementation, supervisor review, necessary repairs, validation and final documentation are complete. Report any unverified platform or environment limitation precisely. Never relabel unfinished required work as a speculative optimization merely to close the goal.

## قرارداد همکاری عامل‌ها

- هر واگذاری مالک فایل‌ها و خروجی موردانتظار را مشخص می‌کند. فایل مشترک بدون هماهنگی هم‌زمان ویرایش نمی‌شود.
- عامل پیش از تغییر قرارداد مشترک، شکل API پیشنهادی را به سرپرست اعلام می‌کند.
- گزارش تحویل شامل فایل‌های تغییرکرده، رفتار نهایی، تست‌های اجراشده و محدودیت‌هاست.
- سرپرست یافته‌های review را ثبت می‌کند؛ بسته پس از رفع یافته‌های مؤثر و بررسی نتیجه بسته می‌شود.
- پیشرفت با شاهد رفتار و تست سنجیده می‌شود، نه صرفاً تعداد فایل‌ها یا پایان گزارش عامل.
