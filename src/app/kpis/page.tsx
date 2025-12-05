"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ArrowLeftIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import { subscribeToProspects, Prospect } from '@/services/prospectService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Semana de inicio de operaciones (1-7 de diciembre 2025)
const OPERATION_START_WEEK = '2025W49';

// Get week number in format "2025W48"
function getWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}W${weekNo.toString().padStart(2, '0')}`;
}

// Parse week key back to date range
function getWeekDateRange(weekKey: string): { start: Date; end: Date } {
    const [yearStr, weekStr] = weekKey.split('W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay() || 7;
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + (1 - jan1Day) + (jan1Day > 4 ? 7 : 0));
    
    const start = new Date(firstMonday);
    start.setDate(start.getDate() + (week - 1) * 7);
    
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    
    return { start, end };
}

// Format week for display
function formatWeekDisplay(weekKey: string): string {
    const { start, end } = getWeekDateRange(weekKey);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('es-MX', options)} - ${end.toLocaleDateString('es-MX', options)}`;
}

// Get weeks from OPERATION_START_WEEK to current week (limited by n)
function getLastNWeeks(n: number): string[] {
    const weeks: string[] = [];
    const today = new Date();
    const currentWeek = getWeekKey(today);
    
    // Parse start week
    const [startYear, startWeekStr] = OPERATION_START_WEEK.split('W');
    const startWeekNum = parseInt(startWeekStr);
    const startYearNum = parseInt(startYear);
    
    // Parse current week
    const [currYear, currWeekStr] = currentWeek.split('W');
    const currWeekNum = parseInt(currWeekStr);
    const currYearNum = parseInt(currYear);
    
    // Generate weeks from start to current
    let year = startYearNum;
    let week = startWeekNum;
    
    while (year < currYearNum || (year === currYearNum && week <= currWeekNum)) {
        const weekKey = `${year}W${week.toString().padStart(2, '0')}`;
        weeks.push(weekKey);
        
        week++;
        // Handle year transition (ISO weeks: typically 52 or 53 weeks per year)
        if (week > 52) {
            // Check if this year has 53 weeks
            const dec31 = new Date(year, 11, 31);
            const dec31Week = getWeekKey(dec31);
            const maxWeek = parseInt(dec31Week.split('W')[1]);
            
            if (week > maxWeek) {
                week = 1;
                year++;
            }
        }
    }
    
    // Return last n weeks if we have more than n
    if (weeks.length > n) {
        return weeks.slice(-n);
    }
    
    return weeks;
}

// Calculate days between two dates
function daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay));
}

// Mes de inicio de operaciones (diciembre 2025)
const OPERATION_START_MONTH = '2025-12';

// Get month key in format "2025-12"
function getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

// Format month for display "Diciembre 2025"
function formatMonthDisplay(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

// Get months from OPERATION_START_MONTH to current month
function getMonthsFromStart(): string[] {
    const months: string[] = [];
    const today = new Date();
    const currentMonth = getMonthKey(today);
    
    const [startYear, startMonth] = OPERATION_START_MONTH.split('-').map(Number);
    const [currYear, currMonth] = currentMonth.split('-').map(Number);
    
    let year = startYear;
    let month = startMonth;
    
    while (year < currYear || (year === currYear && month <= currMonth)) {
        months.push(`${year}-${month.toString().padStart(2, '0')}`);
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }
    
    return months;
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

interface WeeklyMetrics {
    weekKey: string;
    // Activity metrics
    nuevos: number;
    primerContacto: number;
    contactoEfectivo: number;
    muestraInteres: number;
    citaDemo: number;
    demoRealizada: number;
    ventas: number;
    enPausa: number;
    basura: number;
    clientePerdido: number;
    // Revenue metrics
    ingresoTotal: number;
    ventasCerradas: number;
    // Conversion metrics
    conversionRate: number;
    avgDaysToSale: number;
    // Churn metrics (solo Cliente Perdido - ex-clientes que no renovaron)
    churn: number;
    tasaChurn: number;
    // Descartados metrics (solo Basura - prospectos que nunca fueron clientes)
    descartados: number;
    tasaDescarte: number;
}

function calculateWeeklyMetrics(prospects: Prospect[], weeks: string[]): Map<string, WeeklyMetrics> {
    const metrics = new Map<string, WeeklyMetrics>();
    
    // Initialize metrics for each week
    weeks.forEach(weekKey => {
        metrics.set(weekKey, {
            weekKey,
            nuevos: 0,
            primerContacto: 0,
            contactoEfectivo: 0,
            muestraInteres: 0,
            citaDemo: 0,
            demoRealizada: 0,
            ventas: 0,
            enPausa: 0,
            basura: 0,
            clientePerdido: 0,
            ingresoTotal: 0,
            ventasCerradas: 0,
            conversionRate: 0,
            avgDaysToSale: 0,
            churn: 0,
            tasaChurn: 0,
            descartados: 0,
            tasaDescarte: 0
        });
    });
    
    const weeksSet = new Set(weeks);
    const salesDaysPerWeek: Map<string, number[]> = new Map();
    weeks.forEach(w => salesDaysPerWeek.set(w, []));
    
    // Track total ventas for churn rate calculation
    let totalVentasCumulative = 0;
    
    prospects.forEach(prospect => {
        // Count new prospects by creation date
        const createdWeek = getWeekKey(prospect.createdAt);
        if (weeksSet.has(createdWeek)) {
            const m = metrics.get(createdWeek)!;
            m.nuevos++;
        }
        
        // Process history for stage transitions
        prospect.history.forEach(entry => {
            const entryWeek = getWeekKey(entry.date);
            if (!weeksSet.has(entryWeek)) return;
            
            const m = metrics.get(entryWeek)!;
            
            switch (entry.stage) {
                case '1er Contacto':
                    m.primerContacto++;
                    break;
                case 'Contacto efectivo':
                    m.contactoEfectivo++;
                    break;
                case 'Muestra de interés':
                    m.muestraInteres++;
                    break;
                case 'Cita para demo':
                    m.citaDemo++;
                    break;
                case 'Demo realizada':
                    m.demoRealizada++;
                    break;
                case 'Venta':
                    m.ventas++;
                    m.ventasCerradas++;
                    m.ingresoTotal += prospect.accountValue || 0;
                    // Calculate days to sale
                    const daysToSale = daysBetween(prospect.createdAt, entry.date);
                    salesDaysPerWeek.get(entryWeek)!.push(daysToSale);
                    break;
                case 'En Pausa':
                    // Solo contar para actividad, NO es pérdida ni churn
                    m.enPausa++;
                    break;
                case 'Basura':
                    // Prospectos descartados (nunca fueron clientes)
                    m.basura++;
                    m.descartados++;
                    break;
                case 'Cliente Perdido':
                    // Churn real: ex-clientes que no renovaron
                    m.clientePerdido++;
                    m.churn++;
                    break;
            }
        });
    });
    
    // Calculate derived metrics
    let totalNewsCumulative = 0;
    
    weeks.forEach(weekKey => {
        const m = metrics.get(weekKey)!;
        
        // Average days to sale
        const salesDays = salesDaysPerWeek.get(weekKey)!;
        if (salesDays.length > 0) {
            m.avgDaysToSale = Math.round(salesDays.reduce((a, b) => a + b, 0) / salesDays.length);
        }
        
        // Cumulative news for conversion rate calculation
        totalNewsCumulative += m.nuevos;
        
        // Track cumulative sales for churn rate
        totalVentasCumulative += m.ventas;
        
        // Conversion rate (ventas / total nuevos hasta esa semana)
        if (totalNewsCumulative > 0) {
            m.conversionRate = (m.ventas / totalNewsCumulative) * 100;
        }
        
        // Tasa de descarte (basura / nuevos de esa semana)
        if (m.nuevos > 0) {
            m.tasaDescarte = (m.descartados / m.nuevos) * 100;
        }
        
        // Tasa de churn (clientes perdidos / total ventas acumuladas)
        if (totalVentasCumulative > 0) {
            m.tasaChurn = (m.churn / totalVentasCumulative) * 100;
        }
    });
    
    return metrics;
}

// Monthly metrics interface
interface MonthlyMetrics {
    monthKey: string;
    ventasCerradas: number;
    ingresoTotal: number;
}

function calculateMonthlyMetrics(prospects: Prospect[], months: string[]): Map<string, MonthlyMetrics> {
    const metrics = new Map<string, MonthlyMetrics>();
    
    // Initialize metrics for each month
    months.forEach(monthKey => {
        metrics.set(monthKey, {
            monthKey,
            ventasCerradas: 0,
            ingresoTotal: 0
        });
    });
    
    const monthsSet = new Set(months);
    
    prospects.forEach(prospect => {
        // Process history for sales
        prospect.history.forEach(entry => {
            if (entry.stage === 'Venta') {
                const entryMonth = getMonthKey(entry.date);
                if (monthsSet.has(entryMonth)) {
                    const m = metrics.get(entryMonth)!;
                    m.ventasCerradas++;
                    m.ingresoTotal += prospect.accountValue || 0;
                }
            }
        });
    });
    
    return metrics;
}

// Cumulative sales data for chart
type ChartGranularity = 'day' | 'week' | 'month';

interface SalesDataPoint {
    key: string;
    label: string;
    ventasAcumuladas: number;
    ingresoAcumulado: number;
}

function getDateKey(date: Date, granularity: ChartGranularity): string {
    switch (granularity) {
        case 'day':
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
        case 'week':
            return getWeekKey(date); // 2025W49
        case 'month':
            return getMonthKey(date); // 2025-12
    }
}

function formatKeyLabel(key: string, granularity: ChartGranularity): string {
    switch (granularity) {
        case 'day': {
            const date = new Date(key + 'T12:00:00');
            return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        }
        case 'week': {
            const weekNum = key.split('W')[1];
            return `Sem ${weekNum}`;
        }
        case 'month': {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            return date.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
        }
    }
}

// Generate all periods in a range
function generatePeriodRange(startDate: Date, endDate: Date, granularity: ChartGranularity): string[] {
    const periods: string[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
        const key = getDateKey(current, granularity);
        if (!periods.includes(key)) {
            periods.push(key);
        }
        
        // Advance based on granularity
        switch (granularity) {
            case 'day':
                current.setDate(current.getDate() + 1);
                break;
            case 'week':
                current.setDate(current.getDate() + 7);
                break;
            case 'month':
                current.setMonth(current.getMonth() + 1);
                break;
        }
    }
    
    return periods;
}

// Calculate date range based on period and offset
function getDateRange(periodDays: number | null, offset: number): { startDate: Date; endDate: Date } {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (periodDays === null) {
        // "All" period - from operation start to today
        const { start } = getWeekDateRange(OPERATION_START_WEEK);
        return { startDate: start, endDate: today };
    }
    
    // Calculate end date based on offset
    const endDate = new Date(today.getTime() - (offset * periodDays * 24 * 60 * 60 * 1000));
    const startDate = new Date(endDate.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    
    return { startDate, endDate };
}

function calculateCumulativeSales(
    prospects: Prospect[], 
    granularity: ChartGranularity, 
    periodDays: number | null,
    offset: number = 0
): SalesDataPoint[] {
    const { startDate, endDate } = getDateRange(periodDays, offset);
    
    // Get all sales data first (to calculate cumulative from the beginning)
    const allSalesByPeriod: Map<string, { ventas: number; ingreso: number; date: Date }> = new Map();
    
    prospects.forEach(prospect => {
        prospect.history.forEach(entry => {
            if (entry.stage === 'Venta') {
                const periodKey = getDateKey(entry.date, granularity);
                const existing = allSalesByPeriod.get(periodKey) || { ventas: 0, ingreso: 0, date: entry.date };
                existing.ventas++;
                existing.ingreso += prospect.accountValue || 0;
                allSalesByPeriod.set(periodKey, existing);
            }
        });
    });
    
    // Calculate cumulative values for all periods up to endDate
    const allPeriodsSorted = Array.from(allSalesByPeriod.keys()).sort();
    const cumulativeByPeriod: Map<string, { ventas: number; ingreso: number }> = new Map();
    let runningVentas = 0;
    let runningIngreso = 0;
    
    allPeriodsSorted.forEach(periodKey => {
        const periodData = allSalesByPeriod.get(periodKey)!;
        runningVentas += periodData.ventas;
        runningIngreso += periodData.ingreso;
        cumulativeByPeriod.set(periodKey, { ventas: runningVentas, ingreso: runningIngreso });
    });
    
    // Generate all periods in the visible range
    const visiblePeriods = generatePeriodRange(startDate, endDate, granularity);
    
    // Build result with all periods filled
    const result: SalesDataPoint[] = [];
    let lastVentas = 0;
    let lastIngreso = 0;
    
    // Find the cumulative value just before the start of visible range
    allPeriodsSorted.forEach(periodKey => {
        if (periodKey < visiblePeriods[0]) {
            const cumulative = cumulativeByPeriod.get(periodKey);
            if (cumulative) {
                lastVentas = cumulative.ventas;
                lastIngreso = cumulative.ingreso;
            }
        }
    });
    
    visiblePeriods.forEach(periodKey => {
        const cumulative = cumulativeByPeriod.get(periodKey);
        if (cumulative) {
            lastVentas = cumulative.ventas;
            lastIngreso = cumulative.ingreso;
        }
        
        result.push({
            key: periodKey,
            label: formatKeyLabel(periodKey, granularity),
            ventasAcumuladas: lastVentas,
            ingresoAcumulado: lastIngreso
        });
    });
    
    return result;
}

// ============================================================================
// TABLE COMPONENTS
// ============================================================================

const tableStyles = {
    container: {
        backgroundColor: 'var(--surface)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        marginBottom: '1.5rem'
    },
    header: {
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    title: {
        fontSize: '1rem',
        fontWeight: '600',
        color: 'var(--foreground)',
        margin: 0
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse' as const,
        fontSize: '0.8125rem'
    },
    th: {
        padding: '0.75rem 1rem',
        textAlign: 'left' as const,
        fontWeight: '600',
        color: 'var(--secondary)',
        backgroundColor: 'var(--background)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap' as const
    },
    td: {
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        color: 'var(--foreground)'
    },
    weekCell: {
        fontWeight: '500',
        color: 'var(--primary)'
    },
    numberCell: {
        textAlign: 'right' as const,
        fontVariantNumeric: 'tabular-nums'
    }
};

function ActivityTable({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>📊 Actividad Semanal por Etapa</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Semana</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Nuevos</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>1er Contacto</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Contacto Efectivo</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Interés</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Cita Demo</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Demo</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell, color: '#10b981' }}>Ventas</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell, color: '#f59e0b' }}>Pausa</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell, color: '#ef4444' }}>Basura</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell, color: '#991b1b' }}>Perdido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map(weekKey => {
                            const m = metrics.get(weekKey)!;
                            return (
                                <tr key={weekKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div>{weekKey}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', fontWeight: '400' }}>
                                            {formatWeekDisplay(weekKey)}
                                        </div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.nuevos}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.primerContacto}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.contactoEfectivo}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.muestraInteres}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.citaDemo}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.demoRealizada}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#10b981', fontWeight: '600' }}>{m.ventas}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#f59e0b' }}>{m.enPausa}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#ef4444' }}>{m.basura}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#991b1b' }}>{m.clientePerdido}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ConversionTable({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>🎯 Conversión a Ventas</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Semana</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Nuevos</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Convertidos</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Tasa Conversión</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Días Promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map(weekKey => {
                            const m = metrics.get(weekKey)!;
                            return (
                                <tr key={weekKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div>{weekKey}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', fontWeight: '400' }}>
                                            {formatWeekDisplay(weekKey)}
                                        </div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.nuevos}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#10b981', fontWeight: '600' }}>{m.ventas}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        <span style={{
                                            backgroundColor: m.conversionRate > 0 ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                            color: m.conversionRate > 0 ? '#10b981' : 'var(--secondary)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontWeight: '500'
                                        }}>
                                            {m.conversionRate.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        {m.avgDaysToSale > 0 ? `${m.avgDaysToSale} días` : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function RevenueTable({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    // Calculate week-over-week change
    const getChange = (current: number, previous: number): { value: number; isPositive: boolean } | null => {
        if (previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return { value: change, isPositive: change >= 0 };
    };

    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>💰 Ingresos Semanales</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Semana</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Ventas Cerradas</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Ingreso Total</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>vs Semana Anterior</th>
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map((weekKey, index) => {
                            const m = metrics.get(weekKey)!;
                            const prevWeek = index > 0 ? metrics.get(weeks[index - 1])! : null;
                            const change = prevWeek ? getChange(m.ingresoTotal, prevWeek.ingresoTotal) : null;
                            
                            return (
                                <tr key={weekKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div>{weekKey}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', fontWeight: '400' }}>
                                            {formatWeekDisplay(weekKey)}
                                        </div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.ventasCerradas}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, fontWeight: '600', color: '#10b981' }}>
                                        ${m.ingresoTotal.toLocaleString('en-US')}
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        {change ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                color: change.isPositive ? '#10b981' : '#ef4444',
                                                fontWeight: '500'
                                            }}>
                                                {change.isPositive ? (
                                                    <ArrowTrendingUpIcon style={{ width: '1rem', height: '1rem' }} />
                                                ) : (
                                                    <ArrowTrendingDownIcon style={{ width: '1rem', height: '1rem' }} />
                                                )}
                                                {change.isPositive ? '+' : ''}{change.value.toFixed(1)}%
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--secondary)' }}>-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MonthlyRevenueTable({ metrics, months }: { metrics: Map<string, MonthlyMetrics>; months: string[] }) {
    // Calculate month-over-month change
    const getChange = (current: number, previous: number): { value: number; isPositive: boolean } | null => {
        if (previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return { value: change, isPositive: change >= 0 };
    };

    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>📅 Ingresos Mensuales</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Mes</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Ventas Cerradas</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Ingreso Total</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>vs Mes Anterior</th>
                        </tr>
                    </thead>
                    <tbody>
                        {months.map((monthKey, index) => {
                            const m = metrics.get(monthKey)!;
                            const prevMonth = index > 0 ? metrics.get(months[index - 1])! : null;
                            const change = prevMonth ? getChange(m.ingresoTotal, prevMonth.ingresoTotal) : null;
                            
                            return (
                                <tr key={monthKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div style={{ textTransform: 'capitalize' }}>{formatMonthDisplay(monthKey)}</div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.ventasCerradas}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, fontWeight: '600', color: '#10b981' }}>
                                        ${m.ingresoTotal.toLocaleString('en-US')}
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        {change ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                color: change.isPositive ? '#10b981' : '#ef4444',
                                                fontWeight: '500'
                                            }}>
                                                {change.isPositive ? (
                                                    <ArrowTrendingUpIcon style={{ width: '1rem', height: '1rem' }} />
                                                ) : (
                                                    <ArrowTrendingDownIcon style={{ width: '1rem', height: '1rem' }} />
                                                )}
                                                {change.isPositive ? '+' : ''}{change.value.toFixed(1)}%
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--secondary)' }}>-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ChurnTable({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    // Calculate total ventas and churn for the period
    let totalVentas = 0;
    let totalChurn = 0;
    weeks.forEach(weekKey => {
        const m = metrics.get(weekKey)!;
        totalVentas += m.ventas;
        totalChurn += m.churn;
    });
    
    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>📉 Churn (Clientes Perdidos)</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                    Ex-clientes que no renovaron
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Semana</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Clientes Perdidos</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Tasa Churn</th>
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map(weekKey => {
                            const m = metrics.get(weekKey)!;
                            return (
                                <tr key={weekKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div>{weekKey}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', fontWeight: '400' }}>
                                            {formatWeekDisplay(weekKey)}
                                        </div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#991b1b', fontWeight: '600' }}>{m.churn}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        <span style={{
                                            backgroundColor: m.tasaChurn > 0 ? 'rgba(153, 27, 27, 0.1)' : 'transparent',
                                            color: m.tasaChurn > 0 ? '#991b1b' : 'var(--secondary)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontWeight: '500'
                                        }}>
                                            {m.tasaChurn.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ backgroundColor: 'var(--background)' }}>
                            <td style={{ ...tableStyles.td, fontWeight: '600' }}>Total</td>
                            <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#991b1b', fontWeight: '700' }}>{totalChurn}</td>
                            <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                <span style={{
                                    backgroundColor: totalVentas > 0 && totalChurn > 0 ? 'rgba(153, 27, 27, 0.1)' : 'transparent',
                                    color: totalVentas > 0 && totalChurn > 0 ? '#991b1b' : 'var(--secondary)',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontWeight: '600'
                                }}>
                                    {totalVentas > 0 ? ((totalChurn / totalVentas) * 100).toFixed(1) : '0.0'}%
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function DescartadosTable({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    // Calculate totals for the period
    let totalNuevos = 0;
    let totalDescartados = 0;
    weeks.forEach(weekKey => {
        const m = metrics.get(weekKey)!;
        totalNuevos += m.nuevos;
        totalDescartados += m.descartados;
    });
    
    return (
        <div style={tableStyles.container}>
            <div style={tableStyles.header}>
                <h3 style={tableStyles.title}>🗑️ Prospectos Descartados</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                    Prospectos que nunca fueron clientes
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={tableStyles.table}>
                    <thead>
                        <tr>
                            <th style={tableStyles.th}>Semana</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Nuevos</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Descartados</th>
                            <th style={{ ...tableStyles.th, ...tableStyles.numberCell }}>Tasa Descarte</th>
                        </tr>
                    </thead>
                    <tbody>
                        {weeks.map(weekKey => {
                            const m = metrics.get(weekKey)!;
                            return (
                                <tr key={weekKey}>
                                    <td style={{ ...tableStyles.td, ...tableStyles.weekCell }}>
                                        <div>{weekKey}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', fontWeight: '400' }}>
                                            {formatWeekDisplay(weekKey)}
                                        </div>
                                    </td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>{m.nuevos}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#ef4444', fontWeight: '600' }}>{m.descartados}</td>
                                    <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                        <span style={{
                                            backgroundColor: m.tasaDescarte > 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                            color: m.tasaDescarte > 0 ? '#ef4444' : 'var(--secondary)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontWeight: '500'
                                        }}>
                                            {m.tasaDescarte.toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ backgroundColor: 'var(--background)' }}>
                            <td style={{ ...tableStyles.td, fontWeight: '600' }}>Total</td>
                            <td style={{ ...tableStyles.td, ...tableStyles.numberCell, fontWeight: '600' }}>{totalNuevos}</td>
                            <td style={{ ...tableStyles.td, ...tableStyles.numberCell, color: '#ef4444', fontWeight: '700' }}>{totalDescartados}</td>
                            <td style={{ ...tableStyles.td, ...tableStyles.numberCell }}>
                                <span style={{
                                    backgroundColor: totalNuevos > 0 && totalDescartados > 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                    color: totalNuevos > 0 && totalDescartados > 0 ? '#ef4444' : 'var(--secondary)',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontWeight: '600'
                                }}>
                                    {totalNuevos > 0 ? ((totalDescartados / totalNuevos) * 100).toFixed(1) : '0.0'}%
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

// ============================================================================
// SALES GROWTH CHART
// ============================================================================

const granularityOptions: { value: ChartGranularity; label: string }[] = [
    { value: 'day', label: 'Día' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' }
];

type PeriodPreset = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

const periodPresets: { value: PeriodPreset; label: string; days: number | null }[] = [
    { value: '7d', label: '7 días', days: 7 },
    { value: '30d', label: '30 días', days: 30 },
    { value: '3m', label: '3 meses', days: 90 },
    { value: '6m', label: '6 meses', days: 180 },
    { value: '1y', label: '1 año', days: 365 },
    { value: 'all', label: 'Todo', days: null }
];

function SalesGrowthChart({ prospects }: { prospects: Prospect[] }) {
    const [granularity, setGranularity] = useState<ChartGranularity>('day');
    const [period, setPeriod] = useState<PeriodPreset>('all');
    const [offset, setOffset] = useState(0);
    
    const periodDays = periodPresets.find(p => p.value === period)?.days ?? null;
    const data = useMemo(() => calculateCumulativeSales(prospects, granularity, periodDays, offset), [prospects, granularity, periodDays, offset]);
    
    // Calculate date range for display
    const dateRange = useMemo(() => {
        const { startDate, endDate } = getDateRange(periodDays, offset);
        const formatDate = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' });
        return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }, [periodDays, offset]);
    
    // Reset offset when period changes
    const handlePeriodChange = (newPeriod: PeriodPreset) => {
        setPeriod(newPeriod);
        setOffset(0);
    };
    
    // Navigation is only available for non-"all" periods
    const canNavigate = periodDays !== null;

    if (data.length === 0) {
        return (
            <div style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border)',
                padding: '2rem',
                marginBottom: '1.5rem',
                textAlign: 'center'
            }}>
                <p style={{ color: 'var(--secondary)' }}>No hay datos de ventas para mostrar en este período</p>
            </div>
        );
    }

    return (
        <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            marginBottom: '1.5rem'
        }}>
            <div style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{
                        fontSize: '1rem',
                        fontWeight: '600',
                        color: 'var(--foreground)',
                        margin: 0
                    }}>📈 Crecimiento de Ventas Acumuladas</h3>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {granularityOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => setGranularity(option.value)}
                                style={{
                                    padding: '0.375rem 0.75rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '500',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    backgroundColor: granularity === option.value ? 'var(--primary)' : 'var(--background)',
                                    color: granularity === option.value ? 'white' : 'var(--secondary)'
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    {/* Navigation arrows */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {canNavigate && (
                            <>
                                <button
                                    onClick={() => setOffset(o => o + 1)}
                                    style={{
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        backgroundColor: 'var(--background)',
                                        color: 'var(--foreground)',
                                        transition: 'all 0.15s'
                                    }}
                                    title="Período anterior"
                                >
                                    ←
                                </button>
                                <span style={{ 
                                    fontSize: '0.6875rem', 
                                    color: 'var(--secondary)',
                                    minWidth: '140px',
                                    textAlign: 'center'
                                }}>
                                    {dateRange}
                                </span>
                                <button
                                    onClick={() => setOffset(o => Math.max(0, o - 1))}
                                    disabled={offset === 0}
                                    style={{
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.25rem',
                                        cursor: offset === 0 ? 'not-allowed' : 'pointer',
                                        backgroundColor: 'var(--background)',
                                        color: offset === 0 ? 'var(--border)' : 'var(--foreground)',
                                        opacity: offset === 0 ? 0.5 : 1,
                                        transition: 'all 0.15s'
                                    }}
                                    title="Período siguiente"
                                >
                                    →
                                </button>
                            </>
                        )}
                    </div>
                    
                    {/* Period presets */}
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {periodPresets.map(option => (
                            <button
                                key={option.value}
                                onClick={() => handlePeriodChange(option.value)}
                                style={{
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.6875rem',
                                    fontWeight: '500',
                                    border: period === option.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    borderRadius: '0.25rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    backgroundColor: period === option.value ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                    color: period === option.value ? 'var(--primary)' : 'var(--secondary)'
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ padding: '1.5rem', height: '350px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis 
                            dataKey="label" 
                            stroke="var(--secondary)"
                            fontSize={12}
                            tickMargin={10}
                        />
                        <YAxis 
                            yAxisId="left"
                            stroke="#10b981"
                            fontSize={12}
                            tickMargin={10}
                            label={{ 
                                value: 'Ventas', 
                                angle: -90, 
                                position: 'insideLeft',
                                style: { fill: '#10b981', fontSize: 12 }
                            }}
                        />
                        <YAxis 
                            yAxisId="right" 
                            orientation="right"
                            stroke="#8b5cf6"
                            fontSize={12}
                            tickMargin={10}
                            tickFormatter={(value) => `$${value.toLocaleString()}`}
                            label={{ 
                                value: 'Ingreso', 
                                angle: 90, 
                                position: 'insideRight',
                                style: { fill: '#8b5cf6', fontSize: 12 }
                            }}
                        />
                        <Tooltip 
                            contentStyle={{
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                fontSize: '0.875rem'
                            }}
                            formatter={(value: number, name: string) => {
                                if (name === 'ventasAcumuladas') return [value, 'Ventas'];
                                if (name === 'ingresoAcumulado') return [`$${value.toLocaleString()}`, 'Ingreso'];
                                return [value, name];
                            }}
                            labelFormatter={(label) => `${granularity === 'day' ? 'Fecha' : granularity === 'week' ? 'Semana' : 'Mes'}: ${label}`}
                        />
                        <Legend 
                            formatter={(value) => {
                                if (value === 'ventasAcumuladas') return 'Ventas Acumuladas';
                                if (value === 'ingresoAcumulado') return 'Ingreso Acumulado';
                                return value;
                            }}
                        />
                        <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="ventasAcumuladas" 
                            stroke="#10b981" 
                            strokeWidth={2}
                            dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="ingresoAcumulado" 
                            stroke="#8b5cf6" 
                            strokeWidth={2}
                            dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ============================================================================
// SUMMARY CARDS
// ============================================================================

function SummaryCards({ metrics, weeks }: { metrics: Map<string, WeeklyMetrics>; weeks: string[] }) {
    // Calculate totals
    const totals = useMemo(() => {
        let totalNuevos = 0;
        let totalVentas = 0;
        let totalIngreso = 0;
        let totalChurn = 0;
        let totalDescartados = 0;
        let totalDays = 0;
        let countWithDays = 0;

        weeks.forEach(weekKey => {
            const m = metrics.get(weekKey)!;
            totalNuevos += m.nuevos;
            totalVentas += m.ventas;
            totalIngreso += m.ingresoTotal;
            totalChurn += m.churn;
            totalDescartados += m.descartados;
            if (m.avgDaysToSale > 0) {
                totalDays += m.avgDaysToSale;
                countWithDays++;
            }
        });

        return {
            totalNuevos,
            totalVentas,
            totalIngreso,
            totalChurn,
            totalDescartados,
            avgDays: countWithDays > 0 ? Math.round(totalDays / countWithDays) : 0,
            conversionRate: totalNuevos > 0 ? (totalVentas / totalNuevos) * 100 : 0,
            avgTicket: totalVentas > 0 ? Math.round(totalIngreso / totalVentas) : 0,
            churnRate: totalVentas > 0 ? (totalChurn / totalVentas) * 100 : 0
        };
    }, [metrics, weeks]);

    const cards = [
        { label: 'Nuevos Prospectos', value: totals.totalNuevos.toString(), color: '#3b82f6' },
        { label: 'Ventas Cerradas', value: totals.totalVentas.toString(), color: '#10b981' },
        { label: 'Ingreso Total', value: `$${totals.totalIngreso.toLocaleString('en-US')}`, color: '#8b5cf6' },
        { label: 'Ticket Promedio', value: totals.avgTicket > 0 ? `$${totals.avgTicket.toLocaleString('en-US')}` : '-', color: '#a855f7' },
        { label: 'Tasa Conversión', value: `${totals.conversionRate.toFixed(1)}%`, color: '#f59e0b' },
        { label: 'Días Promedio', value: totals.avgDays > 0 ? `${totals.avgDays}` : '-', color: '#06b6d4' },
        { label: 'Churn', value: totals.totalChurn.toString(), color: '#991b1b', subtitle: `${totals.churnRate.toFixed(1)}% de clientes` },
        { label: 'Descartados', value: totals.totalDescartados.toString(), color: '#ef4444' }
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
        }}>
            {cards.map((card, index) => (
                <div key={index} style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border)',
                    padding: '1.25rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '4px',
                        height: '100%',
                        backgroundColor: card.color
                    }} />
                    <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--secondary)',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.025em'
                    }}>
                        {card.label}
                    </div>
                    <div style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: 'var(--foreground)'
                    }}>
                        {card.value}
                    </div>
                    {'subtitle' in card && card.subtitle && (
                        <div style={{
                            fontSize: '0.6875rem',
                            color: 'var(--secondary)',
                            marginTop: '0.25rem'
                        }}>
                            {card.subtitle}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KPIsPage() {
    return (
        <ProtectedRoute>
            <KPIsContent />
        </ProtectedRoute>
    );
}

function KPIsContent() {
    const router = useRouter();
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [loading, setLoading] = useState(true);
    const [weeksToShow, setWeeksToShow] = useState(12);

    // Subscribe to prospects
    useEffect(() => {
        const unsubscribe = subscribeToProspects((data) => {
            setProspects(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Calculate weeks and metrics
    const weeks = useMemo(() => getLastNWeeks(weeksToShow), [weeksToShow]);
    const metrics = useMemo(() => calculateWeeklyMetrics(prospects, weeks), [prospects, weeks]);

    // Calculate months and monthly metrics
    const months = useMemo(() => getMonthsFromStart(), []);
    const monthlyMetrics = useMemo(() => calculateMonthlyMetrics(prospects, months), [prospects, months]);

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--background)',
            fontFamily: 'var(--font-plus-jakarta)',
            padding: '2rem'
        }}>
            <div style={{
                maxWidth: '1400px',
                margin: '0 auto'
            }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'none',
                            border: 'none',
                            color: 'var(--secondary)',
                            cursor: 'pointer',
                            marginBottom: '1rem',
                            fontSize: '0.875rem'
                        }}
                    >
                        <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
                        Volver
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                                KPIs del Pipeline
                            </h1>
                            <p style={{ color: 'var(--secondary)', marginTop: '0.25rem' }}>
                                Métricas semanales del embudo de ventas
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--secondary)' }}>Mostrar:</span>
                            <select
                                value={weeksToShow}
                                onChange={(e) => setWeeksToShow(Number(e.target.value))}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value={4}>4 semanas</option>
                                <option value={8}>8 semanas</option>
                                <option value={12}>12 semanas</option>
                                <option value={24}>24 semanas</option>
                                <option value={52}>52 semanas</option>
                            </select>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{
                        backgroundColor: 'var(--surface)',
                        borderRadius: '1rem',
                        border: '1px solid var(--border)',
                        padding: '4rem 2rem',
                        textAlign: 'center'
                    }}>
                        <p style={{ color: 'var(--secondary)' }}>Cargando datos...</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <SummaryCards metrics={metrics} weeks={weeks} />

                        {/* Sales Growth Chart */}
                        <SalesGrowthChart prospects={prospects} />

                        {/* Tables */}
                        <ActivityTable metrics={metrics} weeks={weeks} />
                        <ConversionTable metrics={metrics} weeks={weeks} />
                        <RevenueTable metrics={metrics} weeks={weeks} />
                        <MonthlyRevenueTable metrics={monthlyMetrics} months={months} />
                        <ChurnTable metrics={metrics} weeks={weeks} />
                        <DescartadosTable metrics={metrics} weeks={weeks} />
                    </>
                )}
            </div>
        </div>
    );
}
