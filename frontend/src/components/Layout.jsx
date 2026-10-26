import Header from "./Header";
import Footer from "./Footer";
import { useSettings } from "../context/SettingsContext";

export default function Layout({ children }) {
  const { error: settingsError, refreshSettings } = useSettings();
  return (
    <div className="min-h-screen flex flex-col bg-mall-900">
      <Header />
      {settingsError && <div role="alert" className="border-b border-amber-300/20 bg-amber-300/10 px-4 py-2 text-center text-xs text-amber-100">{settingsError} <button type="button" onClick={() => refreshSettings().catch(() => {})} className="ml-2 underline">Retry</button></div>}
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
