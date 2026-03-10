import { Settings } from "lucide-react";

export function SettingsSection() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project configuration and access control
      </p>
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
        <Settings className="mb-3 size-10" />
        <p className="text-sm font-medium">Settings coming soon</p>
        <p className="mt-1 text-xs">
          Manage project members, permissions, and more.
        </p>
      </div>
    </div>
  );
}

