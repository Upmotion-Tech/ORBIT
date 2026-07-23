"use client";

// Shared data loader for Dashboard + Reports (both aggregate the same
// cross-module data: leads, projects, invoices/expenses/finance stats,
// time-allocations, category budgets, openings, FX rate). Ports
// loadLeads/loadProjects/loadFinanceData/loadTimeEntries's relevant
// pieces (script.js:1547-1582, 1584-1600, 1698-1709) plus
// settingsApi.getCurrency() for the USD->PKR rate.

import { useEffect, useState } from "react";
import {
  leadsApi,
  projectsApi,
  invoicesApi,
  expensesApi,
  financeStatsApi,
  expenseCategoryBudgetsApi,
  timeEntriesApi,
  openingsApi,
  settingsApi,
  DEFAULT_USD_TO_PKR_RATE,
} from "@/lib/orbit-client";

export type Lead = { id: string; name: string; stage: string; value: number | null; source: string; received: string };
export type Project = { id: string; name: string; client: string; status: string; budget: number; spent: number; deadline: string | null };
export type Invoice = { id: string; client: string; amount: number; status: string; due_date?: string | null };
export type Expense = { id: string; category: string; amount: number; currency: string; submitted_date: string };
export type FinanceStats = {
  total_outstanding_usd: number; total_paid_usd: number; monthly_revenue_usd: number;
  monthly_expenses_usd: number; pending_expenses_usd: number; payroll_cost_usd: number; upcoming_milestones_usd: number;
};
export type CategoryBudget = { category: string; actual_usd: number; budget_usd: number };
export type Opening = { id: string; title: string; department: string; status: string };
export type TimeAllocation = { name: string; pct: number };

const EMPTY_STATS: FinanceStats = {
  total_outstanding_usd: 0, total_paid_usd: 0, monthly_revenue_usd: 0,
  monthly_expenses_usd: 0, pending_expenses_usd: 0, payroll_cost_usd: 0, upcoming_milestones_usd: 0,
};

export function useCompanyData() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financeStats, setFinanceStats] = useState<FinanceStats>(EMPTY_STATS);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [timeAllocations, setTimeAllocations] = useState<TimeAllocation[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [currencyRate, setCurrencyRate] = useState(DEFAULT_USD_TO_PKR_RATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      leadsApi.list().catch(() => []),
      projectsApi.list().catch(() => []),
      invoicesApi.list().catch(() => []),
      expensesApi.list().catch(() => []),
      financeStatsApi.get().catch(() => EMPTY_STATS),
      expenseCategoryBudgetsApi.list().catch(() => []),
      timeEntriesApi.list().catch(() => ({ time_entries: [], allocations: [] })),
      openingsApi.list().catch(() => []),
      settingsApi.getCurrency().catch(() => ({ usd_to_pkr_rate: DEFAULT_USD_TO_PKR_RATE })),
    ]).then(([l, p, inv, exp, stats, budgets, timeData, open, currency]) => {
      setLeads(l);
      setProjects(p);
      setInvoices(inv);
      setExpenses(exp);
      setFinanceStats(stats);
      setCategoryBudgets(budgets);
      setTimeAllocations(timeData.allocations || []);
      setOpenings(open);
      setCurrencyRate(currency.usd_to_pkr_rate || DEFAULT_USD_TO_PKR_RATE);
      setLoading(false);
    });
  }, []);

  return { leads, projects, invoices, expenses, financeStats, categoryBudgets, timeAllocations, openings, currencyRate, loading };
}
