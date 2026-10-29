import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export default function AdminConfirmDialog({
  title = "Confirm deletion",
  description,
  confirmLabel = "Delete",
  busy = false,
  busyLabel = "Deleting…",
  error,
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initialFocus = dialogRef.current?.querySelector("[data-dialog-initial-focus]");
    initialFocus?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape" && !busyRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} tabIndex="-1" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-cream/10 bg-mall-900 p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><AlertTriangle size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="admin-confirm-title" className="font-display text-lg text-cream">{title}</h2>
            <p id="admin-confirm-description" className="mt-1 text-sm leading-relaxed text-cream/55">{description}</p>
            {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
          </div>
          <button type="button" aria-label="Close confirmation" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-cream/45 transition hover:bg-cream/5 hover:text-cream disabled:opacity-40"><X size={17} /></button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-dialog-initial-focus disabled={busy} onClick={onClose} className="rounded-xl border border-cream/15 px-4 py-2.5 text-sm text-cream/65 transition hover:text-cream disabled:opacity-40">Keep it</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50">{busy ? busyLabel : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
