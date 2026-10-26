import { AlertCircle, RefreshCw } from "lucide-react";

export default function AdminLoadError({ message = "Could not load this data.", onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <AlertCircle size={24} className="text-red-400" />
      <p className="text-cream/60 text-sm">{message}</p>
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-mall-800 px-4 py-2 text-sm font-medium text-cream/70 hover:text-cream transition">
        <RefreshCw size={13} /> Try again
      </button>
    </div>
  );
}
