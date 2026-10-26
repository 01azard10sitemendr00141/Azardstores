import { Wrench } from "lucide-react";

// Shown for every public route when Settings > maintenanceMode is on.
// Admin login and the admin panel itself stay reachable (gated in App.jsx)
// so whoever turned this on can also turn it back off.
export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-mall-900 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-mall-accent/10 flex items-center justify-center mx-auto mb-6">
          <Wrench size={36} className="text-mall-accent" />
        </div>
        <p className="font-mono-tag text-[10px] uppercase text-mall-orange tracking-widest mb-3">
          Azard Stores
        </p>
        <h1 className="font-display text-3xl sm:text-4xl text-cream mb-3 leading-tight">
          Back in a moment
        </h1>
        <p className="text-cream/50 text-sm sm:text-base leading-relaxed">
          We're making a few changes behind the scenes. The mall will be back open shortly — thanks for your patience.
        </p>
      </div>
    </div>
  );
}
