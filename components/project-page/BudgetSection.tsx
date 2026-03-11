"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  PiggyBank,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";

type Transaction = {
  _id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  date: number;
  category: { name: string; color: string } | null;
};

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className={`mt-1.5 text-lg font-semibold ${accent ?? "text-foreground"}`}>
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}

function EditableBudgetCard({
  budget,
  onSave,
  saving,
  canEdit,
}: {
  budget: number;
  onSave: (value: number) => void;
  saving: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(budget > 0 ? String(budget) : "");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
  };

  const save = () => {
    const parsed = parseFloat(draft.replace(/,/g, ""));
    if (Number.isNaN(parsed) || parsed < 0) {
      toast({ variant: "destructive", title: "Enter a valid budget amount." });
      return;
    }
    onSave(Math.round(parsed));
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <PiggyBank className="size-3.5" />
          Estimated Budget
        </div>
        {canEdit && !editing && (
          <button
            onClick={startEdit}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Pencil className="size-3" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-lg font-semibold text-foreground">$</span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            placeholder="0"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md p-1 text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-lg font-semibold text-foreground">
          {budget > 0 ? `$${budget.toLocaleString()}` : "—"}
        </p>
      )}

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {editing ? "Press Enter to save" : "From project plan"}
      </p>
    </div>
  );
}

function BudgetBar({
  spent,
  estimated,
}: {
  spent: number;
  estimated: number;
}) {
  const pct = estimated > 0 ? Math.min((spent / estimated) * 100, 100) : 0;
  const overBudget = spent > estimated && estimated > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Budget usage</span>
        <span className="font-medium">
          {estimated > 0 ? `${pct.toFixed(0)}%` : "N/A"}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            overBudget ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {estimated > 0 && (
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>${spent.toLocaleString()} spent</span>
          <span>${estimated.toLocaleString()} budget</span>
        </div>
      )}
    </div>
  );
}

function CategoryBreakdown({
  categories,
}: {
  categories: { name: string; color: string; total: number }[];
}) {
  if (categories.length === 0) return null;

  const max = Math.max(...categories.map((c) => c.total));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">
        Spending by category
      </p>
      <div className="mt-3 space-y-2.5">
        {categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-foreground">{cat.name}</span>
              </div>
              <span className="font-medium text-foreground">
                ${cat.total.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${max > 0 ? (cat.total / max) * 100 : 0}%`,
                  backgroundColor: cat.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentTransactions({
  transactions,
}: {
  transactions: Transaction[];
}) {
  if (transactions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">
        Recent transactions
      </p>
      <div className="mt-2 divide-y divide-border">
        {transactions.slice(0, 5).map((t) => (
          <div
            key={t._id}
            className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {t.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(t.date).toLocaleDateString()}
                {t.category ? ` · ${t.category.name}` : ""}
              </p>
            </div>
            <span
              className={`ml-3 shrink-0 text-xs font-semibold ${
                t.type === "income" ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {t.type === "income" ? "+" : "-"}${t.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BudgetSection({ project }: { project: ProjectData }) {
  const { sessionToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionToken || !convexClient) return;

    let cancelled = false;

    void (async () => {
      try {
        const result = await convexClient.query(
          api.budget.listTransactionsByProject,
          {
            token: sessionToken,
            projectId: project._id as Id<"projects">,
          },
        );
        if (!cancelled) setTransactions(result as Transaction[]);
      } catch {
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, project._id]);

  const [estimatedBudget, setEstimatedBudget] = useState(() => {
    try {
      const parsed = JSON.parse(project.data) as Project;
      return parsed.project_summary?.estimated_budget ?? 0;
    } catch {
      return 0;
    }
  });
  const [savingBudget, setSavingBudget] = useState(false);

  const handleBudgetSave = async (value: number) => {
    if (!sessionToken || !convexClient) return;
    setSavingBudget(true);
    try {
      let parsed: Project;
      try {
        parsed = JSON.parse(project.data) as Project;
      } catch {
        toast({ variant: "destructive", title: "Failed to update budget." });
        return;
      }

      const updated: Project = {
        ...parsed,
        project_summary: {
          ...parsed.project_summary,
          estimated_budget: value,
        },
      };

      await convexClient.mutation(api.projects.update, {
        token: sessionToken,
        projectId: project._id as Id<"projects">,
        data: JSON.stringify(updated),
      });

      setEstimatedBudget(value);
      toast({ title: "Budget updated." });
    } catch {
      toast({ variant: "destructive", title: "Failed to update budget." });
    } finally {
      setSavingBudget(false);
    }
  };

  const stats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const catMap: Record<string, { name: string; color: string; total: number }> = {};

    for (const t of transactions) {
      if (t.type === "income") {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        if (t.category) {
          const key = t.category.name;
          if (!catMap[key]) {
            catMap[key] = { name: t.category.name, color: t.category.color, total: 0 };
          }
          catMap[key].total += t.amount;
        }
      }
    }

    const categories = Object.values(catMap).sort((a, b) => b.total - a.total);

    return { totalIncome, totalExpense, net: totalIncome - totalExpense, categories };
  }, [transactions]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Project financial overview
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = transactions.length > 0 || estimatedBudget > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project financial overview
      </p>

      {!hasData ? (
        <div className="mt-10 flex flex-col items-center justify-center text-center">
          <DollarSign className="size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No budget data yet. Add transactions from the{" "}
            <span className="font-medium text-foreground">Budget</span> page
            and link them to this project.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EditableBudgetCard
              budget={estimatedBudget}
              onSave={handleBudgetSave}
              saving={savingBudget}
              canEdit={project.isOwner}
            />
            <StatCard
              icon={TrendingDown}
              label="Total Expenses"
              value={`$${stats.totalExpense.toLocaleString()}`}
              subtext={`${transactions.filter((t) => t.type === "expense").length} transactions`}
              accent="text-red-500"
            />
            <StatCard
              icon={TrendingUp}
              label="Total Income"
              value={`$${stats.totalIncome.toLocaleString()}`}
              subtext={`${transactions.filter((t) => t.type === "income").length} transactions`}
              accent="text-emerald-500"
            />
            <StatCard
              icon={DollarSign}
              label="Net Balance"
              value={`${stats.net < 0 ? "-" : ""}$${Math.abs(stats.net).toLocaleString()}`}
              subtext={
                estimatedBudget > 0
                  ? `$${Math.max(0, estimatedBudget - stats.totalExpense).toLocaleString()} remaining`
                  : undefined
              }
              accent={stats.net >= 0 ? "text-emerald-500" : "text-red-500"}
            />
          </div>

          {estimatedBudget > 0 && (
            <BudgetBar spent={stats.totalExpense} estimated={estimatedBudget} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <CategoryBreakdown categories={stats.categories} />
            <RecentTransactions transactions={transactions} />
          </div>
        </div>
      )}
    </div>
  );
}
