'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useId, useRef, useState } from 'react';
import { apiUpload } from '@/components/api/client';
import { CsvDownloadButton } from '@/components/files/csv-download';
import { faNumber } from '@/components/format/fa';
import { copyText } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';

/** Shape of `POST /api/v1/imports/students` (modules/admin/student-import.ts). */
export type ImportRow = {
  line: number;
  ok: boolean;
  errors: Array<{ column: string; message: string }>;
  studentId?: string;
  inviteUrl?: string;
};
export type ImportResult = {
  dryRun: boolean;
  total: number;
  valid: number;
  imported: number;
  rows: ImportRow[];
};

const MAX_BYTES = 1024 * 1024;

/** Header row of the sample file (Persian names; English ones work too). */
const SAMPLE =
  '﻿نام,موبایل,مشاور,مرحله,شاخه,پلتفرم اصلی,لینک پروفایل,تیتر پروفایل,آخرین کار,مهلت,یادداشت\r\n' +
  'سارا محمدی,09121234567,,1,,Upwork,https://www.upwork.com/freelancers/~01abc,,سند نیچ,2026-11-01,از کوهورت تابستان\r\n';

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students-sample.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * M2b «ورود از اکسل» (F11, security C6): CSV only (Excel → «ذخیره به‌صورت CSV UTF-8»), up to
 * 1 MB and 500 rows. Step 1 sends `dryRun=true` and shows every row with its errors (line and
 * column, never the value); step 2 imports the valid rows. Invite links are shown only here,
 * once (SEC-V3).
 */
export function ImportStudentsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => setOpen(true)} className="max-md:hidden">
        <Icon name="upload" size={16} />
        ورود از اکسل
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="ورود هنرجوها از فایل"
        description="فقط CSV با کدگذاری UTF-8؛ حداکثر ۱ مگابایت و ۵۰۰ ردیف."
        className="md:max-w-[720px]"
      >
        <ImportFlow onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function ImportFlow({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);

  async function send(f: File, dryRun: boolean) {
    const form = new FormData();
    form.append('file', f);
    form.append('dryRun', dryRun ? 'true' : 'false');
    return apiUpload<ImportResult>('/api/v1/imports/students', form);
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0] ?? null;
    setPreview(null);
    setResult(null);
    setError(null);
    setFile(f);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setError('فقط فایل CSV. در اکسل: «Save As» ← «CSV UTF-8».');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('حجم فایل بیش از ۱ مگابایت است؛ آن را به چند فایل تقسیم کن.');
      return;
    }
    setBusy('check');
    const res = await send(f, true);
    setBusy(null);
    if (res.ok) setPreview(res.data);
    else setError(res.error.fields.file ?? res.error.message);
  }

  async function onImport() {
    if (!file || !preview?.valid) return;
    setBusy('import');
    setError(null);
    const res = await send(file, false);
    setBusy(null);
    if (!res.ok) {
      setError(res.error.fields.file ?? res.error.message);
      return;
    }
    setResult(res.data);
    toast.show({ message: `${faNumber(res.data.imported)} هنرجو ساخته شد.` });
    router.refresh();
  }

  if (result) {
    const made = result.rows.filter((r) => r.inviteUrl);
    return (
      <>
        <Alert tone="ok" role="status" title={`${faNumber(result.imported)} هنرجو ساخته شد.`}>
          {result.total > result.imported
            ? ` ${faNumber(result.total - result.imported)} ردیف به‌خاطر خطا ثبت نشد.`
            : ''}
        </Alert>
        {made.length ? (
          <>
            <Alert tone="warn" title="لینک‌های دعوت فقط همین حالا دیده می‌شوند.">
              هر لینک را برای همان هنرجو بفرست؛ بعداً از پرونده‌اش لینک تازه بساز.
            </Alert>
            <ul className="mb-4 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
              {made.map((r) => (
                <li
                  key={r.line}
                  className="flex items-center gap-2 rounded-sm border border-line bg-bg px-3 py-2"
                >
                  <span className="text-sm text-fg-3">{`ردیف ${faNumber(r.line)}`}</span>
                  <code dir="ltr" className="min-w-0 flex-1 truncate text-sm">
                    {r.inviteUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const ok = await copyText(r.inviteUrl ?? '');
                      toast.show({ message: ok ? 'لینک کپی شد.' : 'کپی نشد؛ دستی انتخاب کن.' });
                    }}
                  >
                    <Icon name="copy" size={14} />
                    کپی
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <DialogActions>
          <Button variant="primary" onClick={onClose}>
            تمام
          </Button>
        </DialogActions>
      </>
    );
  }

  const bad = preview ? preview.rows.filter((r) => !r.ok) : [];

  return (
    <>
      <ol className="mb-4 list-decimal space-y-1 ps-5 text-sm text-fg-2">
        <li>
          ستون‌ها: نام، موبایل (لازم)، و اختیاری مشاور، مرحله، شاخه، پلتفرم اصلی، لینک پروفایل، تیتر
          پروفایل، آخرین کار، مهلت، یادداشت.{' '}
          <button
            type="button"
            onClick={downloadSample}
            className="cursor-pointer font-semibold text-link underline"
          >
            فایل نمونه
          </button>
        </li>
        <li>
          مهلت را میلادی بنویس (<bdi dir="ltr">2026-11-01</bdi>)؛ مرحله با شماره یا نام، مشاور با
          موبایل یا نام.
        </li>
        <li>اول بررسی می‌شود و هیچ چیزی ثبت نمی‌شود؛ بعد تأیید می‌کنی.</li>
      </ol>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      <div className="mb-4">
        <label htmlFor={inputId} className="mb-1.5 block text-ui font-semibold">
          فایل CSV
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onPick(e)}
          className="block w-full cursor-pointer rounded-sm border border-line-strong bg-surface text-ui file:me-3 file:cursor-pointer file:border-0 file:border-e file:border-line file:bg-surface-2 file:px-3 file:py-2.5 file:font-semibold"
        />
      </div>
      {busy === 'check' ? (
        <p role="status" className="mb-4 flex items-center gap-2 text-sm text-fg-2">
          <span
            aria-hidden="true"
            className="size-3.5 animate-spin rounded-full border-2 border-current border-e-transparent"
          />
          در حال بررسی ردیف‌ها…
        </p>
      ) : null}
      {preview ? (
        <section aria-label="پیش‌نمایش" className="mb-2">
          <p className="mb-3 flex flex-wrap items-center gap-2 text-ui">
            <strong>{`${faNumber(preview.total)} ردیف`}</strong>
            <span className="inline-flex items-center gap-1 rounded-full bg-h-green-bg px-2 py-[3px] text-xs font-bold text-h-green-fg">
              <Icon name="check" size={14} />
              {`${faNumber(preview.valid)} آماده`}
            </span>
            {bad.length ? (
              <Tag variant="late" icon="alert">{`${faNumber(bad.length)} با خطا`}</Tag>
            ) : null}
          </p>
          {bad.length ? (
            <div className="max-h-[36vh] overflow-y-auto rounded-sm border border-line">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">ردیف‌های دارای خطا</caption>
                <thead>
                  <tr className="bg-surface-2 text-xs text-fg-3">
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      ردیف
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      ستون
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">
                      مشکل
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bad.flatMap((r) =>
                    r.errors.map((e, i) => (
                      <tr
                        key={`${r.line}-${e.column}-${e.message}`}
                        className={cn('border-t border-line', i > 0 && 'text-fg-2')}
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {i === 0 ? faNumber(r.line) : ''}
                        </td>
                        <td className="px-3 py-2">{e.column}</td>
                        <td className="px-3 py-2 text-h-red-fg">{e.message}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-h-green-fg">همه‌ی ردیف‌ها درست‌اند.</p>
          )}
        </section>
      ) : null}
      <DialogActions>
        <Button onClick={onClose}>انصراف</Button>
        <Button
          variant="primary"
          loading={busy === 'import'}
          disabled={!preview?.valid || busy !== null}
          onClick={() => void onImport()}
        >
          {preview?.valid ? `ثبت ${faNumber(preview.valid)} هنرجو` : 'ثبت'}
        </Button>
      </DialogActions>
    </>
  );
}

/**
 * «خروجی CSV» (F11): students and tasks, after the SEC-V3 warning. Plain links: the browser
 * downloads with the session cookie; the server audits each export.
 */
export function ExportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => setOpen(true)} className="max-md:hidden">
        <Icon name="file" size={16} />
        خروجی CSV
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="خروجی CSV">
        <Alert tone="warn" title="توجه:">
          این فایل شامل موبایل و لینک پروفایل همه‌ی هنرجوهاست؛ پس از استفاده پاکش کن.
        </Alert>
        <div className="mb-2 flex flex-wrap gap-2">
          <CsvDownloadButton
            href="/api/v1/exports/students.csv"
            filename="students.csv"
            icon="users"
            onDone={() => setOpen(false)}
          >
            هنرجوها
          </CsvDownloadButton>
          <CsvDownloadButton
            href="/api/v1/exports/tasks.csv"
            filename="tasks.csv"
            icon="tasks"
            onDone={() => setOpen(false)}
          >
            کارها
          </CsvDownloadButton>
        </div>
        <p className="text-sm text-fg-3">در اکسل با کدگذاری UTF-8 باز می‌شود؛ تاریخ‌ها شمسی‌اند.</p>
      </Dialog>
    </>
  );
}
