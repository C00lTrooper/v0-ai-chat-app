"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { format, endOfMonth, startOfMonth } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Hash,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  Receipt,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth-provider";
import { ChatHeader } from "@/components/chat-header";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransactionType = "income" | "expense";

interface TransactionFormData {
  title: string;
  amount: string;
  type: TransactionType;
  categoryId: string;
  projectId: string;
  newCategoryName: string;
  newCategoryColor: string;
  date: Date;
}

const EMPTY_FORM: TransactionFormData = {
  title: "",
  amount: "",
  type: "expense",
  categoryId: "",
  projectId: "",
  newCategoryName: "",
  newCategoryColor: "#6366f1",
  date: new Date(),
};

const CATEGORY_COLORS = [
  "#6366f1",
  "#f43f5e",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

const PROJECT_CHART_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#f43f5e",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#6366f1",
  "#14b8a6",
];

const PIE_CHART_VIEWS = [
  { key: "income-expense", label: "Income vs Expense" },
  { key: "by-project", label: "By Project" },
  { key: "by-category", label: "By Category" },
] as const;

type PieChartView = (typeof PIE_CHART_VIEWS)[number]["key"];
type PieSubFilter = "expense" | "income";

const TIME_CHART_VIEWS = [
  { key: "income-vs-expense", label: "Income vs Expenses" },
  { key: "balance", label: "Balance Over Time" },
] as const;

type TimeChartView = (typeof TIME_CHART_VIEWS)[number]["key"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BudgetPage() {
  const router = useRouter();
  const { isAuthenticated, sessionToken } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !sessionToken) {
    return null;
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader hasMessages={false} onClear={() => {}} />
      <div className="flex-1 overflow-y-auto pt-14">
        <BudgetContent token={sessionToken} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content (requires token)
// ---------------------------------------------------------------------------

function BudgetContent({ token }: { token: string }) {
  const transactions = useQuery(api.budget.listTransactions, { token });
  const categories = useQuery(api.budget.listCategories, { token });
  const projects = useQuery(api.projects.list, { token });

  const createTransaction = useMutation(api.budget.createTransaction);
  const updateTransaction = useMutation(api.budget.updateTransaction);
  const deleteTransaction = useMutation(api.budget.deleteTransaction);
  const createCategory = useMutation(api.budget.createCategory);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"transactions"> | null>(null);
  const [form, setForm] = useState<TransactionFormData>(EMPTY_FORM);

  // Filters
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);

  // Pie chart carousel
  const [pieView, setPieView] = useState<PieChartView>("income-expense");
  const [pieSubFilter, setPieSubFilter] = useState<PieSubFilter>("expense");
  const pieViewIndex = PIE_CHART_VIEWS.findIndex((v) => v.key === pieView);

  function prevPie() {
    const idx = (pieViewIndex - 1 + PIE_CHART_VIEWS.length) % PIE_CHART_VIEWS.length;
    setPieView(PIE_CHART_VIEWS[idx].key);
  }
  function nextPie() {
    const idx = (pieViewIndex + 1) % PIE_CHART_VIEWS.length;
    setPieView(PIE_CHART_VIEWS[idx].key);
  }

  // Time chart carousel
  const [timeView, setTimeView] = useState<TimeChartView>("income-vs-expense");
  const timeViewIndex = TIME_CHART_VIEWS.findIndex((v) => v.key === timeView);

  function prevTime() {
    const idx = (timeViewIndex - 1 + TIME_CHART_VIEWS.length) % TIME_CHART_VIEWS.length;
    setTimeView(TIME_CHART_VIEWS[idx].key);
  }
  function nextTime() {
    const idx = (timeViewIndex + 1) % TIME_CHART_VIEWS.length;
    setTimeView(TIME_CHART_VIEWS[idx].key);
  }

  // Derived data
  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterCategory !== "all" && t.categoryId !== filterCategory) return false;
      if (filterProject !== "all") {
        if (filterProject === "__none__" && t.projectId) return false;
        if (filterProject !== "__none__" && t.projectId !== filterProject) return false;
      }
      if (filterDateFrom && t.date < filterDateFrom.getTime()) return false;
      if (filterDateTo && t.date > endOfMonth(filterDateTo).getTime()) return false;
      return true;
    });
  }, [transactions, filterType, filterCategory, filterProject, filterDateFrom, filterDateTo]);

  const totals = useMemo(() => {
    const income = (transactions ?? [])
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const expense = (transactions ?? [])
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  // Chart data: Income vs Expense donut
  const incomeExpenseData = useMemo(() => {
    if (!transactions) return [];
    const result: { name: string; value: number; color: string }[] = [];
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    if (income > 0) result.push({ name: "Income", value: income, color: "#10b981" });
    if (expense > 0) result.push({ name: "Expense", value: expense, color: "#f43f5e" });
    return result;
  }, [transactions]);

  // Chart data: By project (filterable by income/expense)
  const byProject = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { name: string; value: number; color: string }>();
    let colorIdx = 0;
    for (const t of transactions) {
      if (t.type !== pieSubFilter) continue;
      const key = t.projectId ?? "__none__";
      const existing = map.get(key);
      if (existing) {
        existing.value += t.amount;
      } else {
        map.set(key, {
          name: t.project?.projectName ?? "No Project",
          value: t.amount,
          color: PROJECT_CHART_COLORS[colorIdx % PROJECT_CHART_COLORS.length],
        });
        colorIdx++;
      }
    }
    return Array.from(map.values());
  }, [transactions, pieSubFilter]);

  // Chart data: By category (filterable by income/expense)
  const byCategory = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const t of transactions) {
      if (t.type !== pieSubFilter) continue;
      const cat = t.category;
      const key = cat?._id ?? "uncategorized";
      const existing = map.get(key);
      if (existing) {
        existing.value += t.amount;
      } else {
        map.set(key, {
          name: cat?.name ?? "Uncategorized",
          value: t.amount,
          color: cat?.color ?? "#94a3b8",
        });
      }
    }
    return Array.from(map.values());
  }, [transactions, pieSubFilter]);

  // Chart data: Monthly bar + cumulative balance line
  const monthlyData = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of transactions) {
      const key = format(new Date(t.date), "yyyy-MM");
      const label = format(new Date(t.date), "MMM yyyy");
      const existing = map.get(key);
      if (existing) {
        if (t.type === "income") existing.income += t.amount;
        else existing.expense += t.amount;
      } else {
        map.set(key, {
          month: label,
          income: t.type === "income" ? t.amount : 0,
          expense: t.type === "expense" ? t.amount : 0,
        });
      }
    }
    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    let runningBalance = 0;
    return sorted.map((m) => {
      runningBalance += m.income - m.expense;
      return { ...m, balance: runningBalance };
    });
  }, [transactions]);

  // Detailed stats
  const detailedStats = useMemo(() => {
    const all = transactions ?? [];
    const expenses = all.filter((t) => t.type === "expense");
    const incomes = all.filter((t) => t.type === "income");

    const now = new Date();
    const monthStart = startOfMonth(now).getTime();
    const monthEnd = endOfMonth(now).getTime();
    const thisMonthExpenses = expenses
      .filter((t) => t.date >= monthStart && t.date <= monthEnd)
      .reduce((s, t) => s + t.amount, 0);
    const thisMonthIncome = incomes
      .filter((t) => t.date >= monthStart && t.date <= monthEnd)
      .reduce((s, t) => s + t.amount, 0);

    const avgExpense =
      expenses.length > 0
        ? expenses.reduce((s, t) => s + t.amount, 0) / expenses.length
        : 0;

    const largestExpense =
      expenses.length > 0
        ? expenses.reduce((max, t) => (t.amount > max.amount ? t : max), expenses[0])
        : null;

    const topCategory = (() => {
      const map = new Map<string, { name: string; total: number }>();
      for (const t of expenses) {
        const key = t.categoryId;
        const existing = map.get(key);
        if (existing) {
          existing.total += t.amount;
        } else {
          map.set(key, { name: t.category?.name ?? "Uncategorized", total: t.amount });
        }
      }
      let best: { name: string; total: number } | null = null;
      for (const v of map.values()) {
        if (!best || v.total > best.total) best = v;
      }
      return best;
    })();

    const topProject = (() => {
      const map = new Map<string, { name: string; total: number }>();
      for (const t of expenses) {
        const key = t.projectId ?? "__none__";
        const existing = map.get(key);
        if (existing) {
          existing.total += t.amount;
        } else {
          map.set(key, {
            name: t.project?.projectName ?? "No Project",
            total: t.amount,
          });
        }
      }
      let best: { name: string; total: number } | null = null;
      for (const v of map.values()) {
        if (!best || v.total > best.total) best = v;
      }
      return best;
    })();

    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

    return {
      totalTransactions: all.length,
      thisMonthExpenses,
      thisMonthIncome,
      avgExpense,
      largestExpense,
      topCategory,
      topProject,
      savingsRate,
    };
  }, [transactions]);

  // Pick current pie data based on view
  const currentPieData = useMemo(() => {
    switch (pieView) {
      case "income-expense":
        return incomeExpenseData;
      case "by-project":
        return byProject;
      case "by-category":
        return byCategory;
    }
  }, [pieView, incomeExpenseData, byProject, byCategory]);

  const showSubFilter = pieView === "by-project" || pieView === "by-category";

  // Handlers
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(t: NonNullable<typeof transactions>[number]) {
    setEditingId(t._id);
    setForm({
      title: t.title,
      amount: String(t.amount),
      type: t.type,
      categoryId: t.categoryId,
      projectId: t.projectId ?? "",
      newCategoryName: "",
      newCategoryColor: "#6366f1",
      date: new Date(t.date),
    });
    setModalOpen(true);
  }

  async function handleSave() {
    let categoryId = form.categoryId as Id<"budgetCategories"> | "";

    if (form.categoryId === "__new__" && form.newCategoryName.trim()) {
      categoryId = await createCategory({
        token,
        name: form.newCategoryName.trim(),
        color: form.newCategoryColor,
      });
    }

    if (!categoryId) return;

    const payload = {
      token,
      title: form.title,
      amount: parseFloat(form.amount),
      type: form.type,
      categoryId: categoryId as Id<"budgetCategories">,
      projectId: form.projectId
        ? (form.projectId as Id<"projects">)
        : undefined,
      date: form.date.getTime(),
    };

    if (editingId) {
      await updateTransaction({ ...payload, id: editingId });
    } else {
      await createTransaction(payload);
    }

    setModalOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function handleDelete(id: Id<"transactions">) {
    await deleteTransaction({ token, id });
  }

  const isLoading = transactions === undefined || categories === undefined;
  const formValid =
    form.title.trim() &&
    form.amount &&
    parseFloat(form.amount) > 0 &&
    (form.categoryId === "__new__"
      ? form.newCategoryName.trim().length > 0
      : form.categoryId.length > 0);

  const hasFilters =
    filterType !== "all" ||
    filterCategory !== "all" ||
    filterProject !== "all" ||
    filterDateFrom ||
    filterDateTo;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-12 md:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="size-4" />
          Add Transaction
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Income
            </CardTitle>
            <TrendingUp className="size-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ${totals.income.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
            <TrendingDown className="size-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              ${totals.expense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Balance
            </CardTitle>
            <Wallet className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-bold",
                totals.net >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              ${totals.net.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={filterType}
                onValueChange={(v) => setFilterType(v as typeof filterType)}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project</Label>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="__none__">No Project</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !filterDateFrom && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-3.5" />
                    {filterDateFrom ? format(filterDateFrom, "MMM d, yyyy") : "Start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateFrom}
                    onSelect={setFilterDateFrom}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !filterDateTo && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-3.5" />
                    {filterDateTo ? format(filterDateTo, "MMM d, yyyy") : "End"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateTo}
                    onSelect={setFilterDateTo}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterType("all");
                  setFilterCategory("all");
                  setFilterProject("all");
                  setFilterDateFrom(undefined);
                  setFilterDateTo(undefined);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              Loading transactions...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
              <p>No transactions found</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                Add your first transaction
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(t.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      {t.project ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <FolderOpen className="size-3.5" />
                          {t.project.projectName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.category && (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ backgroundColor: t.category.color }}
                          />
                          {t.category.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-xs",
                          t.type === "income"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400",
                        )}
                        variant="outline"
                      >
                        {t.type === "income" ? "Income" : "Expense"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      <span
                        className={
                          t.type === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }
                      >
                        {t.type === "income" ? "+" : "-"}$
                        {t.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(t._id)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      {transactions && transactions.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Switchable pie chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevPie}
                  aria-label="Previous chart"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <CardTitle className="min-w-[10rem] text-center text-base">
                  {PIE_CHART_VIEWS[pieViewIndex].label}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextPie}
                  aria-label="Next chart"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {/* Dot indicators */}
              <div className="flex gap-1.5">
                {PIE_CHART_VIEWS.map((v, i) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setPieView(v.key)}
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      i === pieViewIndex
                        ? "bg-foreground"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
                    )}
                    aria-label={v.label}
                  />
                ))}
              </div>
            </CardHeader>
            {showSubFilter && (
              <div className="flex items-center justify-center gap-1 px-6 pb-2">
                <Button
                  type="button"
                  size="sm"
                  variant={pieSubFilter === "expense" ? "default" : "outline"}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs",
                    pieSubFilter === "expense" &&
                      "bg-rose-600 text-white hover:bg-rose-700",
                  )}
                  onClick={() => setPieSubFilter("expense")}
                >
                  Expenses
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pieSubFilter === "income" ? "default" : "outline"}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs",
                    pieSubFilter === "income" &&
                      "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                  onClick={() => setPieSubFilter("income")}
                >
                  Income
                </Button>
              </div>
            )}
            <CardContent>
              {currentPieData.length === 0 ? (
                <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No data yet
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={currentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {currentPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) =>
                        `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Switchable time chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevTime}
                  aria-label="Previous chart"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <CardTitle className="min-w-[10rem] text-center text-base">
                  {TIME_CHART_VIEWS[timeViewIndex].label}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextTime}
                  aria-label="Next chart"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="flex gap-1.5">
                {TIME_CHART_VIEWS.map((v, i) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setTimeView(v.key)}
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      i === timeViewIndex
                        ? "bg-foreground"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
                    )}
                    aria-label={v.label}
                  />
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? (
                <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No data yet
                </p>
              ) : timeView === "income-vs-expense" ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                        name,
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                        "Balance",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      name="Balance"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#balanceGradient)"
                      dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed stats */}
      {transactions && transactions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Transactions
              </CardTitle>
              <Hash className="size-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{detailedStats.totalTransactions}</p>
              <p className="mt-1 text-xs text-muted-foreground">all time total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                This Month&apos;s Spending
              </CardTitle>
              <ArrowDownRight className="size-3.5 text-rose-500" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                ${detailedStats.thisMonthExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(new Date(), "MMMM yyyy")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                This Month&apos;s Income
              </CardTitle>
              <ArrowUpRight className="size-3.5 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                ${detailedStats.thisMonthIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(new Date(), "MMMM yyyy")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Avg. Expense
              </CardTitle>
              <Activity className="size-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                ${detailedStats.avgExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">per transaction</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Largest Expense
              </CardTitle>
              <Receipt className="size-3.5 text-rose-500" />
            </CardHeader>
            <CardContent>
              {detailedStats.largestExpense ? (
                <>
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                    ${detailedStats.largestExpense.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {detailedStats.largestExpense.title}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">--</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Top Category
              </CardTitle>
              <Target className="size-3.5 text-amber-500" />
            </CardHeader>
            <CardContent>
              {detailedStats.topCategory ? (
                <>
                  <p className="text-xl font-bold">
                    {detailedStats.topCategory.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ${detailedStats.topCategory.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} spent
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">--</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Top Project
              </CardTitle>
              <FolderOpen className="size-3.5 text-blue-500" />
            </CardHeader>
            <CardContent>
              {detailedStats.topProject ? (
                <>
                  <p className="truncate text-xl font-bold">
                    {detailedStats.topProject.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ${detailedStats.topProject.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} spent
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">--</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Savings Rate
              </CardTitle>
              <TrendingUp className="size-3.5 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-xl font-bold",
                  detailedStats.savingsRate >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
              >
                {detailedStats.savingsRate.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">of income saved</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Transaction" : "Add Transaction"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the details of this transaction."
                : "Fill in the details to record a new transaction."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-title">Title</Label>
              <Input
                id="tx-title"
                placeholder="e.g. Office supplies"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount ($)</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>

            {/* Type toggle */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.type === "income" ? "default" : "outline"}
                  className={cn(
                    "flex-1",
                    form.type === "income" &&
                      "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                  onClick={() => setForm((f) => ({ ...f, type: "income" }))}
                >
                  Income
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.type === "expense" ? "default" : "outline"}
                  className={cn(
                    "flex-1",
                    form.type === "expense" &&
                      "bg-rose-600 text-white hover:bg-rose-700",
                  )}
                  onClick={() => setForm((f) => ({ ...f, type: "expense" }))}
                >
                  Expense
                </Button>
              </div>
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.projectId || "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, projectId: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      <span className="flex items-center gap-2">
                        <FolderOpen className="size-3.5 text-muted-foreground" />
                        {p.projectName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create new category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* New category fields */}
            {form.categoryId === "__new__" && (
              <div className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-cat-name" className="text-xs">
                    Category name
                  </Label>
                  <Input
                    id="new-cat-name"
                    placeholder="e.g. Marketing"
                    value={form.newCategoryName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, newCategoryName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={cn(
                          "size-6 rounded-full border-2 transition-transform",
                          form.newCategoryColor === c
                            ? "scale-110 border-foreground"
                            : "border-transparent hover:scale-105",
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() =>
                          setForm((f) => ({ ...f, newCategoryColor: c }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 size-3.5" />
                    {format(form.date, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date}
                    onSelect={(d) => d && setForm((f) => ({ ...f, date: d }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formValid}>
              {editingId ? "Save Changes" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
