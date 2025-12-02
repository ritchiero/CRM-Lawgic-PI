"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    PlusIcon, 
    PlusCircleIcon, 
    XMarkIcon, 
    PencilIcon, 
    TrashIcon, 
    PauseCircleIcon,
    UserIcon,
    BuildingOfficeIcon,
    UserCircleIcon,
    EnvelopeIcon,
    PhoneIcon,
    FlagIcon,
    DocumentTextIcon,
    ClockIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    FunnelIcon,
    CalendarIcon,
    XCircleIcon,
    AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

export interface Prospect {
    id: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    notes: string;
    stage: string;
    createdAt: Date;
    createdBy: string;
    leadSource?: string;
    history: Array<{
        stage: string;
        date: Date;
        movedBy?: string;
    }>;
}

// ========== FILTER SYSTEM TYPES AND CONSTANTS ==========

export type DateFilterType = 'createdAt' | 'updatedAt' | 'lastAction';
export type ActivityStatus = 'all' | 'active' | 'inactive' | 'very_inactive';

export interface FilterState {
    searchQuery: string;
    dateType: DateFilterType;
    dateFrom: string;
    dateTo: string;
    responsibleId: string;
    stages: string[];
    activityStatus: ActivityStatus;
}

export const STAGE_OPTIONS = [
    'Detección de prospecto',
    '1er Contacto',
    'Contacto efectivo',
    'Muestra de interés',
    'Cita para demo',
    'Demo realizada',
    'Venta',
    'En Pausa',
    'Basura'
];

const FILTER_STORAGE_KEY = 'crm-filters-seguimiento';

// ========== FILTER HOOK ==========

export function useFiltrosProspectos(prospects: Prospect[], userMap: Record<string, string>) {
    const [filters, setFilters] = useState<FilterState>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(FILTER_STORAGE_KEY);
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch {
                    return getDefaultFilters();
                }
            }
        }
        return getDefaultFilters();
    });

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

    // Persist filters to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
        }
    }, [filters]);

    // Get unique responsibles from prospects
    const uniqueResponsibles = useMemo(() => {
        const responsibleSet = new Set<string>();
        prospects.forEach(p => {
            if (p.createdBy && p.createdBy !== 'anonymous') {
                responsibleSet.add(p.createdBy);
            }
        });
        return Array.from(responsibleSet).map(id => ({
            id,
            name: userMap[id] || id
        }));
    }, [prospects, userMap]);

    // Filter prospects based on current filters
    const filteredProspects = useMemo(() => {
        return prospects.filter(prospect => {
            // Search filter (name, email, company, phone)
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                const matchesSearch = 
                    prospect.name?.toLowerCase().includes(query) ||
                    prospect.email?.toLowerCase().includes(query) ||
                    prospect.company?.toLowerCase().includes(query) ||
                    prospect.phone?.toLowerCase().includes(query);
                if (!matchesSearch) return false;
            }

            // Date filter
            if (filters.dateFrom || filters.dateTo) {
                let dateToCheck: Date | undefined;
                
                switch (filters.dateType) {
                    case 'createdAt':
                        dateToCheck = prospect.createdAt;
                        break;
                    case 'updatedAt':
                        dateToCheck = (prospect as any).updatedAt || prospect.createdAt;
                        break;
                    case 'lastAction':
                        if (prospect.history && prospect.history.length > 0) {
                            dateToCheck = prospect.history[prospect.history.length - 1].date;
                        } else {
                            dateToCheck = prospect.createdAt;
                        }
                        break;
                }

                if (dateToCheck) {
                    const checkDate = new Date(dateToCheck);
                    if (filters.dateFrom) {
                        const fromDate = new Date(filters.dateFrom);
                        fromDate.setHours(0, 0, 0, 0);
                        if (checkDate < fromDate) return false;
                    }
                    if (filters.dateTo) {
                        const toDate = new Date(filters.dateTo);
                        toDate.setHours(23, 59, 59, 999);
                        if (checkDate > toDate) return false;
                    }
                }
            }

            // Responsible filter
            if (filters.responsibleId && filters.responsibleId !== 'all') {
                if (prospect.createdBy !== filters.responsibleId) return false;
            }

            // Stage filter
            if (filters.stages.length > 0) {
                if (!filters.stages.includes(prospect.stage)) return false;
            }

            // Activity status filter
            if (filters.activityStatus !== 'all') {
                const daysSinceLastAction = getDaysSinceLastMovement(prospect);
                switch (filters.activityStatus) {
                    case 'active':
                        if (daysSinceLastAction > 7) return false;
                        break;
                    case 'inactive':
                        if (daysSinceLastAction <= 7 || daysSinceLastAction > 30) return false;
                        break;
                    case 'very_inactive':
                        if (daysSinceLastAction <= 30) return false;
                        break;
                }
            }

            return true;
        });
    }, [prospects, filters]);

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.searchQuery) count++;
        if (filters.dateFrom || filters.dateTo) count++;
        if (filters.responsibleId && filters.responsibleId !== 'all') count++;
        if (filters.stages.length > 0) count++;
        if (filters.activityStatus !== 'all') count++;
        return count;
    }, [filters]);

    // Update individual filter
    const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    // Clear all filters
    const clearFilters = useCallback(() => {
        setFilters(getDefaultFilters());
    }, []);

    // Remove specific filter
    const removeFilter = useCallback((filterType: keyof FilterState) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: getDefaultFilters()[filterType]
        }));
    }, []);

    // Quick date presets
    const applyDatePreset = useCallback((preset: 'today' | '7days' | '30days' | 'thisMonth' | 'lastMonth') => {
        const today = new Date();
        let fromDate: Date;
        let toDate: Date = today;

        switch (preset) {
            case 'today':
                fromDate = today;
                break;
            case '7days':
                fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30days':
                fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'thisMonth':
                fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
                toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'lastMonth':
                fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                toDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
        }

        setFilters(prev => ({
            ...prev,
            dateFrom: formatDateForInput(fromDate),
            dateTo: formatDateForInput(toDate)
        }));
    }, []);

    return {
        filters,
        filteredProspects,
        activeFilterCount,
        isFilterPanelOpen,
        setIsFilterPanelOpen,
        updateFilter,
        clearFilters,
        removeFilter,
        applyDatePreset,
        uniqueResponsibles
    };
}

function getDefaultFilters(): FilterState {
    return {
        searchQuery: '',
        dateType: 'createdAt',
        dateFrom: '',
        dateTo: '',
        responsibleId: 'all',
        stages: [],
        activityStatus: 'all'
    };
}

function formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
}

// ========== FILTER BAR COMPONENT ==========

export function FilterBar({
    filters,
    activeFilterCount,
    isFilterPanelOpen,
    setIsFilterPanelOpen,
    updateFilter,
    clearFilters,
    removeFilter,
    applyDatePreset,
    uniqueResponsibles,
    resultCount,
    userMap
}: {
    filters: FilterState;
    activeFilterCount: number;
    isFilterPanelOpen: boolean;
    setIsFilterPanelOpen: (open: boolean) => void;
    updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
    clearFilters: () => void;
    removeFilter: (filterType: keyof FilterState) => void;
    applyDatePreset: (preset: 'today' | '7days' | '30days' | 'thisMonth' | 'lastMonth') => void;
    uniqueResponsibles: Array<{ id: string; name: string }>;
    resultCount: number;
    userMap: Record<string, string>;
}) {
    const [searchValue, setSearchValue] = useState(filters.searchQuery);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            updateFilter('searchQuery', searchValue);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchValue, updateFilter]);

    // Sync search value with filters
    useEffect(() => {
        setSearchValue(filters.searchQuery);
    }, [filters.searchQuery]);

    const hasActiveFilters = activeFilterCount > 0;

    // Get active filter chips
    const getActiveFilterChips = () => {
        const chips: Array<{ type: keyof FilterState; label: string; icon: React.ReactNode }> = [];

        if (filters.dateFrom || filters.dateTo) {
            let label = '';
            if (filters.dateFrom && filters.dateTo) {
                label = `${formatDisplayDate(filters.dateFrom)} - ${formatDisplayDate(filters.dateTo)}`;
            } else if (filters.dateFrom) {
                label = `Desde ${formatDisplayDate(filters.dateFrom)}`;
            } else {
                label = `Hasta ${formatDisplayDate(filters.dateTo)}`;
            }
            chips.push({
                type: 'dateFrom',
                label,
                icon: <CalendarIcon style={{ width: '0.75rem', height: '0.75rem' }} />
            });
        }

        if (filters.responsibleId && filters.responsibleId !== 'all') {
            chips.push({
                type: 'responsibleId',
                label: userMap[filters.responsibleId] || filters.responsibleId,
                icon: <UserIcon style={{ width: '0.75rem', height: '0.75rem' }} />
            });
        }

        if (filters.stages.length > 0) {
            chips.push({
                type: 'stages',
                label: filters.stages.length === 1 ? filters.stages[0] : `${filters.stages.length} etapas`,
                icon: <FlagIcon style={{ width: '0.75rem', height: '0.75rem' }} />
            });
        }

        if (filters.activityStatus !== 'all') {
            const statusLabels: Record<ActivityStatus, string> = {
                all: 'Todos',
                active: 'Activos (<7d)',
                inactive: 'Inactivos (7-30d)',
                very_inactive: 'Muy inactivos (>30d)'
            };
            chips.push({
                type: 'activityStatus',
                label: statusLabels[filters.activityStatus],
                icon: <ClockIcon style={{ width: '0.75rem', height: '0.75rem' }} />
            });
        }

        return chips;
    };

    const handleRemoveChip = (type: keyof FilterState) => {
        if (type === 'dateFrom') {
            updateFilter('dateFrom', '');
            updateFilter('dateTo', '');
        } else {
            removeFilter(type);
        }
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Main Filter Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--surface)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border)'
            }}>
                {/* Search Input */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--background)',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)'
                }}>
                    <MagnifyingGlassIcon style={{ 
                        width: '1rem', 
                        height: '1rem', 
                        color: 'var(--secondary)',
                        flexShrink: 0
                    }} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, email, empresa o teléfono..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            backgroundColor: 'transparent',
                            color: 'var(--foreground)',
                            fontSize: '0.8125rem',
                            fontFamily: 'inherit'
                        }}
                    />
                    {searchValue && (
                        <button
                            onClick={() => setSearchValue('')}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--secondary)',
                                padding: '0.125rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <XMarkIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                        </button>
                    )}
                </div>

                {/* Filter Toggle Button */}
                <button
                    onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.875rem',
                        backgroundColor: hasActiveFilters ? 'var(--primary)' : 'var(--background)',
                        color: hasActiveFilters ? 'white' : 'var(--foreground)',
                        border: `1px solid ${hasActiveFilters ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '0.5rem',
                        fontSize: '0.8125rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative'
                    }}
                >
                    <AdjustmentsHorizontalIcon style={{ width: '1rem', height: '1rem' }} />
                    Filtros
                    {hasActiveFilters && (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '1.25rem',
                            height: '1.25rem',
                            backgroundColor: 'white',
                            color: 'var(--primary)',
                            borderRadius: '50%',
                            fontSize: '0.6875rem',
                            fontWeight: '700'
                        }}>
                            {activeFilterCount}
                        </span>
                    )}
                    <ChevronDownIcon style={{
                        width: '0.875rem',
                        height: '0.875rem',
                        transform: isFilterPanelOpen ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s'
                    }} />
                </button>

                {/* Results Counter */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--background)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--secondary)',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                }}>
                    <span style={{ 
                        color: 'var(--primary)', 
                        fontWeight: '700',
                        fontSize: '0.875rem'
                    }}>
                        {resultCount}
                    </span>
                    prospectos
                </div>
            </div>

            {/* Active Filter Chips */}
            {getActiveFilterChips().length > 0 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginTop: '0.75rem',
                    paddingLeft: '0.25rem'
                }}>
                    {getActiveFilterChips().map((chip, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                padding: '0.375rem 0.625rem',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                borderRadius: '1rem',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                            }}
                        >
                            {chip.icon}
                            <span>{chip.label}</span>
                            <button
                                onClick={() => handleRemoveChip(chip.type)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'white',
                                    padding: '0.125rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: 0.8,
                                    marginLeft: '0.125rem'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                            >
                                <XMarkIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                            </button>
                        </div>
                    ))}
                    {activeFilterCount > 1 && (
                        <button
                            onClick={clearFilters}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.375rem 0.625rem',
                                backgroundColor: 'transparent',
                                color: 'var(--secondary)',
                                border: '1px dashed var(--border)',
                                borderRadius: '1rem',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'var(--secondary)';
                            }}
                        >
                            <XCircleIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                            Limpiar todo
                        </button>
                    )}
                </div>
            )}

            {/* Filter Panel */}
            {isFilterPanelOpen && (
                <div style={{
                    marginTop: '0.75rem',
                    padding: '1.25rem',
                    backgroundColor: 'var(--surface)',
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border)',
                    animation: 'slideDown 0.2s ease-out'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1.25rem'
                    }}>
                        {/* Date Filter */}
                        <div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                marginBottom: '0.625rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                textTransform: 'uppercase'
                            }}>
                                <CalendarIcon style={{ width: '0.875rem', height: '0.875rem', color: 'var(--primary)' }} />
                                Rango de Fechas
                            </div>
                            
                            {/* Date Type Radio */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.375rem',
                                marginBottom: '0.75rem',
                                padding: '0.625rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem'
                            }}>
                                {[
                                    { value: 'createdAt', label: 'Fecha creación' },
                                    { value: 'updatedAt', label: 'Última modificación' },
                                    { value: 'lastAction', label: 'Última acción' }
                                ].map(option => (
                                    <label
                                        key={option.value}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.75rem',
                                            color: 'var(--foreground)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="dateType"
                                            checked={filters.dateType === option.value}
                                            onChange={() => updateFilter('dateType', option.value as DateFilterType)}
                                            style={{ accentColor: 'var(--primary)' }}
                                        />
                                        {option.label}
                                    </label>
                                ))}
                            </div>

                            {/* Date Inputs */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ 
                                        display: 'block', 
                                        fontSize: '0.6875rem', 
                                        color: 'var(--secondary)', 
                                        marginBottom: '0.25rem' 
                                    }}>
                                        Desde
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={(e) => updateFilter('dateFrom', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            backgroundColor: 'var(--background)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '0.375rem',
                                            color: 'var(--foreground)',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ 
                                        display: 'block', 
                                        fontSize: '0.6875rem', 
                                        color: 'var(--secondary)', 
                                        marginBottom: '0.25rem' 
                                    }}>
                                        Hasta
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={(e) => updateFilter('dateTo', e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            backgroundColor: 'var(--background)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '0.375rem',
                                            color: 'var(--foreground)',
                                            fontSize: '0.75rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Quick Date Presets */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                {[
                                    { key: 'today', label: 'Hoy' },
                                    { key: '7days', label: '7 días' },
                                    { key: '30days', label: '30 días' },
                                    { key: 'thisMonth', label: 'Este mes' },
                                    { key: 'lastMonth', label: 'Mes pasado' }
                                ].map(preset => (
                                    <button
                                        key={preset.key}
                                        onClick={() => applyDatePreset(preset.key as any)}
                                        style={{
                                            padding: '0.25rem 0.5rem',
                                            backgroundColor: 'transparent',
                                            border: '1px solid var(--border)',
                                            borderRadius: '0.25rem',
                                            color: 'var(--secondary)',
                                            fontSize: '0.6875rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--primary)';
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                            e.currentTarget.style.color = 'white';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = 'var(--border)';
                                            e.currentTarget.style.color = 'var(--secondary)';
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Responsible Filter */}
                        <div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                marginBottom: '0.625rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                textTransform: 'uppercase'
                            }}>
                                <UserIcon style={{ width: '0.875rem', height: '0.875rem', color: 'var(--primary)' }} />
                                Responsable
                            </div>
                            <select
                                value={filters.responsibleId}
                                onChange={(e) => updateFilter('responsibleId', e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">Todos los responsables</option>
                                {uniqueResponsibles.map(resp => (
                                    <option key={resp.id} value={resp.id}>
                                        {resp.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Stage Filter */}
                        <div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                marginBottom: '0.625rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                textTransform: 'uppercase'
                            }}>
                                <FlagIcon style={{ width: '0.875rem', height: '0.875rem', color: 'var(--primary)' }} />
                                Etapa
                            </div>
                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.375rem',
                                padding: '0.625rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem',
                                maxHeight: '140px',
                                overflowY: 'auto'
                            }}>
                                {STAGE_OPTIONS.map(stage => {
                                    const isSelected = filters.stages.includes(stage);
                                    return (
                                        <button
                                            key={stage}
                                            onClick={() => {
                                                if (isSelected) {
                                                    updateFilter('stages', filters.stages.filter(s => s !== stage));
                                                } else {
                                                    updateFilter('stages', [...filters.stages, stage]);
                                                }
                                            }}
                                            style={{
                                                padding: '0.375rem 0.625rem',
                                                backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                                                border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                                borderRadius: '1rem',
                                                color: isSelected ? 'white' : 'var(--foreground)',
                                                fontSize: '0.6875rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {stage}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Activity Status Filter */}
                        <div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                                marginBottom: '0.625rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                textTransform: 'uppercase'
                            }}>
                                <ClockIcon style={{ width: '0.875rem', height: '0.875rem', color: 'var(--primary)' }} />
                                Estado de Actividad
                            </div>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.375rem',
                                padding: '0.625rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem'
                            }}>
                                {[
                                    { value: 'all', label: 'Todos', desc: '' },
                                    { value: 'active', label: 'Activos', desc: '< 7 días' },
                                    { value: 'inactive', label: 'Inactivos', desc: '7-30 días' },
                                    { value: 'very_inactive', label: 'Muy inactivos', desc: '> 30 días' }
                                ].map(option => (
                                    <label
                                        key={option.value}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.75rem',
                                            color: 'var(--foreground)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="activityStatus"
                                            checked={filters.activityStatus === option.value}
                                            onChange={() => updateFilter('activityStatus', option.value as ActivityStatus)}
                                            style={{ accentColor: 'var(--primary)' }}
                                        />
                                        <span>{option.label}</span>
                                        {option.desc && (
                                            <span style={{ 
                                                fontSize: '0.625rem', 
                                                color: 'var(--secondary)' 
                                            }}>
                                                ({option.desc})
                                            </span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.75rem',
                        marginTop: '1.25rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--border)'
                    }}>
                        <button
                            onClick={clearFilters}
                            style={{
                                padding: '0.625rem 1rem',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.8125rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            Limpiar filtros
                        </button>
                        <button
                            onClick={() => setIsFilterPanelOpen(false)}
                            style={{
                                padding: '0.625rem 1rem',
                                backgroundColor: 'var(--primary)',
                                border: 'none',
                                borderRadius: '0.5rem',
                                color: 'white',
                                fontSize: '0.8125rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Cerrar panel
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

function formatDisplayDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// Lead source options
export const LEAD_SOURCE_OPTIONS = [
    'Redes Sociales',
    'Contacto Directo',
    'Recomendación',
    'Sitio Web',
    'Email Marketing',
    'Cliente de otro servicio',
    'Referido por otro abogado/despacho',
    'Búsqueda en Google',
    'LinkedIn',
    'Publicidad Paga (Google Ads, Facebook Ads)',
    'Contenido/Blog',
    'Webinar/Presentación',
    'Partnership/Alianza',
    'Cold Call/Outbound',
    'Otro'
];

export function Column({
    title,
    icon: Icon,
    prospects = [],
    onAddClick,
    showAddButton = false,
    onDrop,
    onDragOver,
    onDragStart,
    onProspectClick,
    userMap = {},
    zoomLevel = 1.0
}: {
    title: string;
    icon: React.ElementType;
    prospects?: Prospect[];
    onAddClick?: () => void;
    showAddButton?: boolean;
    onDrop?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragStart?: (e: React.DragEvent, prospectId: string) => void;
    onProspectClick?: (prospect: Prospect) => void;
    userMap?: Record<string, string>;
    zoomLevel?: number;
}) {
    // Function to get icon color based on column title
    const getColumnIconColor = (columnTitle: string): string => {
        if (columnTitle === 'Pausa') {
            return '#f59e0b'; // Ámbar/naranja
        }
        if (columnTitle === 'Basura') {
            return '#ef4444'; // Rojo
        }
        return 'var(--primary)'; // Color primario por defecto
    };

    // Function to get special styles for special columns
    const getColumnSpecialStyles = (columnTitle: string): React.CSSProperties => {
        if (columnTitle === 'Pausa') {
            return {
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 12px rgba(245, 158, 11, 0.2)'
            };
        }
        if (columnTitle === 'Basura') {
            return {
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 12px rgba(239, 68, 68, 0.2)'
            };
        }
        return {};
    };
    const specialStyles = getColumnSpecialStyles(title);
    
    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{
                minWidth: `${220 * zoomLevel}px`,
                backgroundColor: 'var(--background)',
                borderRadius: '0.75rem',
                padding: `${0.75 * zoomLevel}rem`,
                display: 'flex',
                flexDirection: 'column',
                gap: `${0.5 * zoomLevel}rem`,
                transition: 'all 0.2s ease-out',
                ...specialStyles
            }}>
            <h3 style={{
                fontSize: `${0.8125 * zoomLevel}rem`,
                fontWeight: '600',
                color: 'var(--foreground)',
                margin: 0,
                padding: `${0.375 * zoomLevel}rem`,
                borderBottom: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: `${0.375 * zoomLevel}rem`
            }}>
                <Icon style={{ width: `${1 * zoomLevel}rem`, height: `${1 * zoomLevel}rem`, color: getColumnIconColor(title) }} />
                {title}
            </h3>

            {/* Column content area */}
            <div style={{
                flex: 1,
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                gap: `${0.5 * zoomLevel}rem`
            }}>
                {prospects.map(prospect => (
                    <ProspectCard
                        key={prospect.id}
                        prospect={prospect}
                        onDragStart={(e) => onDragStart?.(e, prospect.id)}
                        onClick={() => onProspectClick?.(prospect)}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                ))}

                {showAddButton && (
                    <button
                        onClick={onAddClick}
                        style={{
                            padding: `${0.625 * zoomLevel}rem`,
                            backgroundColor: 'transparent',
                            border: '2px dashed var(--border)',
                            borderRadius: '0.5rem',
                            color: 'var(--secondary)',
                            fontSize: `${0.8125 * zoomLevel}rem`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: `${0.375 * zoomLevel}rem`,
                            transition: 'all 0.2s'
                        }}
                    >
                        <PlusIcon style={{ width: `${0.875 * zoomLevel}rem`, height: `${0.875 * zoomLevel}rem` }} />
                        Agregar prospecto
                    </button>
                )}
            </div>
        </div>
    );
}

export function ProspectCard({
    prospect,
    onDragStart,
    onClick,
    userMap = {},
    zoomLevel = 1.0
}: {
    prospect: Prospect;
    onDragStart?: (e: React.DragEvent) => void;
    onClick?: () => void;
    userMap?: Record<string, string>;
    zoomLevel?: number;
}) {
    const COMPACT_VIEW_THRESHOLD = 0.9;
    const isCompactView = zoomLevel < COMPACT_VIEW_THRESHOLD;
    
    // Get creator display name
    const creatorName = userMap[prospect.createdBy] || prospect.createdBy;
    const isAnonymous = prospect.createdBy === 'anonymous';
    const displayName = isAnonymous ? '?' : (userMap[prospect.createdBy] ? userMap[prospect.createdBy].charAt(0).toUpperCase() : prospect.createdBy.charAt(0).toUpperCase());
    
    // Calculate padding based on view mode
    const paddingVertical = isCompactView ? 0.5 : 0.75;
    const paddingHorizontal = 0.75;

    // Calculate aging effects
    const daysSinceMovement = getDaysSinceLastMovement(prospect);
    const agingLevel = getAgingLevel(daysSinceMovement);
    const agingData = getAgingStyles(agingLevel);
    
    // Determine base background color (considering "En Pausa" state)
    const baseBackgroundColor = prospect.stage === 'En Pausa' ? '#FEF3C7' : 'var(--background)';
    
    // Merge aging styles with existing styles, but preserve "En Pausa" background if applicable
    const finalBackgroundColor = prospect.stage === 'En Pausa' && agingLevel === 'fresh' 
        ? baseBackgroundColor 
        : (agingData.container.backgroundColor || baseBackgroundColor);
    
    // Combine aging container styles with card styles
    const cardContainerStyles: React.CSSProperties = {
        padding: `${paddingVertical * zoomLevel}rem ${paddingHorizontal * zoomLevel}rem`,
        backgroundColor: finalBackgroundColor,
        borderRadius: '0.5rem',
        border: agingData.borderIrregular ? 'none' : (agingData.container.borderWidth || '1px'),
        borderStyle: agingData.borderIrregular ? 'none' : 'solid',
        borderColor: agingData.container.borderColor || 'var(--border)',
        cursor: 'grab',
        transition: 'all 0.2s',
        marginBottom: `${0.5 * zoomLevel}rem`,
        position: 'relative' as const,
        ...(agingData.container.backgroundImage && { backgroundImage: agingData.container.backgroundImage }),
        ...(agingData.container.filter && { filter: agingData.container.filter })
    };

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onClick={onClick}
            className={prospect.stage === 'En Pausa' ? 'paused-glow' : ''}
            style={cardContainerStyles}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Aging border overlay (irregular and cracked) */}
            {agingData.borderIrregular && (
                <AgingBorder 
                    irregular={agingData.borderIrregular}
                    gaps={agingData.borderGaps}
                    borderColor={agingData.container.borderColor || '#9B8A75'}
                />
            )}
            
            {/* Aging cracks overlay */}
            <AgingCracks count={agingData.cracks} opacity={agingData.cracksOpacity} />
            
            {/* Card content */}
            <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Header with name and creator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isCompactView ? 0 : `${0.375 * zoomLevel}rem` }}>
                <div style={{
                    fontSize: `${0.8125 * zoomLevel}rem`,
                    fontWeight: '600',
                    color: 'var(--foreground)',
                    flex: 1
                }}>
                    {prospect.name}
                </div>
                {/* Creator Badge */}
                <div
                    title={`Creado por: ${creatorName}`}
                    style={{
                        width: `${1.75 * zoomLevel}rem`,
                        height: `${1.75 * zoomLevel}rem`,
                        borderRadius: '50%',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: `${0.75 * zoomLevel}rem`,
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: `${0.5 * zoomLevel}rem`
                    }}
                >
                    {displayName}
                </div>
            </div>

            {/* Company and Email - Only show in full view */}
            {!isCompactView && (
                <>
                    <div style={{ fontSize: `${0.6875 * zoomLevel}rem`, color: 'var(--secondary)', marginBottom: `${0.375 * zoomLevel}rem` }}>
                        {prospect.company}
                    </div>
                    <div style={{
                        fontSize: `${0.6875 * zoomLevel}rem`,
                        color: 'var(--secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {prospect.email}
                    </div>
                </>
            )}
            </div>
        </div>
    );
}

export function ProspectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (prospect: Omit<Prospect, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy'>) => void }) {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        leadSource: '',
        countryCode: '+52'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const phoneWithCode = formData.phone ? `${formData.countryCode} ${formData.phone}` : '';
        onSubmit({
            name: formData.name,
            company: formData.company,
            email: formData.email,
            phone: phoneWithCode,
            notes: formData.notes,
            leadSource: formData.leadSource || undefined
        });
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            fontFamily: 'var(--font-plus-jakarta)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '1rem',
                padding: '1.5rem',
                width: '90%',
                maxWidth: '550px',
                maxHeight: '90vh',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: 'var(--foreground)',
                    marginBottom: '1rem',
                    margin: 0,
                    flexShrink: 0
                }}>
                    Nuevo Prospecto
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Nombre *
                            </label>
                            <input
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Firma / Despacho / Empresa *
                            </label>
                            <input
                                required
                                value={formData.company}
                                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Teléfono Móvil / WhatsApp
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                    value={formData.countryCode}
                                    onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                                    style={{
                                        padding: '0.625rem',
                                        backgroundColor: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.5rem',
                                        color: 'var(--foreground)',
                                        fontSize: '0.8125rem',
                                        width: '110px'
                                    }}
                                >
                                    <option value="+52">🇲🇽 +52</option>
                                    <option value="+1">🇺🇸 +1</option>
                                    <option value="+34">🇪🇸 +34</option>
                                    <option value="+54">🇦🇷 +54</option>
                                    <option value="+57">🇨🇴 +57</option>
                                    <option value="+56">🇨🇱 +56</option>
                                    <option value="+51">🇵🇪 +51</option>
                                    <option value="+593">🇪🇨 +593</option>
                                </select>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="5512345678"
                                    style={{
                                        flex: 1,
                                        padding: '0.625rem',
                                        backgroundColor: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.5rem',
                                        color: 'var(--foreground)',
                                        fontSize: '0.8125rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Origen / Medio
                            </label>
                            <select
                                value={formData.leadSource}
                                onChange={(e) => setFormData({ ...formData, leadSource: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">Seleccionar origen...</option>
                                {LEAD_SOURCE_OPTIONS.map(option => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                                Notas
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                                style={{
                                    width: '100%',
                                    padding: '0.625rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.8125rem',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                }}
                            />

                            {/* Quick Tags */}
                            <div style={{ marginTop: '0.5rem' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--secondary)', marginBottom: '0.375rem' }}>
                                    Etiquetas rápidas:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                    {['Cliente Lawgic', '+100 marcas', '+500 marcas', '+1,000 Marcas', '+2,000 marcas', 'Ya conoce el producto', 'Formulario web', 'Amigo de Ricardo', 'Amigo de Roberto', 'Referencia', 'Recontacto'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                const newNotes = formData.notes ? `${formData.notes}, ${tag}` : tag;
                                                setFormData({ ...formData, notes: newNotes });
                                            }}
                                            style={{
                                                padding: '0.25rem 0.5rem',
                                                backgroundColor: 'transparent',
                                                border: '1px solid var(--border)',
                                                borderRadius: '1rem',
                                                color: 'var(--secondary)',
                                                fontSize: '0.6875rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                whiteSpace: 'nowrap',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.backgroundColor = 'var(--primary)';
                                                e.currentTarget.style.color = 'white';
                                                e.currentTarget.style.borderColor = 'var(--primary)';
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                e.currentTarget.style.color = 'var(--secondary)';
                                                e.currentTarget.style.borderColor = 'var(--border)';
                                            }}
                                        >
                                            <PlusCircleIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexShrink: 0 }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '0.625rem',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.8125rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            style={{
                                flex: 1,
                                padding: '0.625rem',
                                backgroundColor: 'var(--primary)',
                                border: 'none',
                                borderRadius: '0.5rem',
                                color: 'white',
                                fontSize: '0.8125rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Crear Prospecto
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function ProspectDetailModal({
    prospect,
    onClose,
    onDelete,
    onMoveStage,
    onUpdate,
    userMap = {}
}: {
    prospect: Prospect;
    onClose: () => void;
    onDelete: (id: string) => void;
    onMoveStage: (id: string, stage: string) => void;
    onUpdate?: (id: string, updates: Partial<Prospect>) => void;
    userMap?: Record<string, string>;
}) {
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [editedNotes, setEditedNotes] = useState(prospect.notes || '');
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

    // Sync editedNotes when prospect changes
    useEffect(() => {
        setEditedNotes(prospect.notes || '');
        setIsEditingNotes(false);
        setIsHistoryExpanded(false);
    }, [prospect.id, prospect.notes]);

    // Function to get stage colors
    const getStageColor = (stage: string) => {
        const stageColors: Record<string, { backgroundColor: string; color: string }> = {
            'Detección de prospecto': { backgroundColor: '#6b7280', color: 'white' },
            '1er Contacto': { backgroundColor: '#60a5fa', color: 'white' },
            'Contacto efectivo': { backgroundColor: '#3b82f6', color: 'white' },
            'Muestra de interés': { backgroundColor: '#f59e0b', color: 'white' },
            'Cita para demo': { backgroundColor: '#a855f7', color: 'white' },
            'Demo realizada': { backgroundColor: '#10b981', color: 'white' },
            'Venta': { backgroundColor: '#059669', color: 'white' },
            'En Pausa': { backgroundColor: '#f59e0b', color: 'white' },
            'Basura': { backgroundColor: '#ef4444', color: 'white' }
        };
        return stageColors[stage] || { backgroundColor: 'var(--primary)', color: 'white' };
    };

    const creatorName = userMap[prospect.createdBy] || prospect.createdBy;
    const isAnonymous = prospect.createdBy === 'anonymous';
    const creatorInitials = isAnonymous ? '?' : (userMap[prospect.createdBy] ? userMap[prospect.createdBy].charAt(0).toUpperCase() : prospect.createdBy.charAt(0).toUpperCase());

    const handleSaveNotes = () => {
        if (onUpdate) {
            onUpdate(prospect.id, { notes: editedNotes });
            setIsEditingNotes(false);
        }
    };

    const handleCancelEdit = () => {
        setEditedNotes(prospect.notes || '');
        setIsEditingNotes(false);
    };
    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 40,
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.3s'
                }}
            />

            {/* Modal Panel */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '360px',
                backgroundColor: 'var(--surface)',
                boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideIn 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                        Detalles del Prospecto
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--secondary)',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--background)';
                            e.currentTarget.style.color = 'var(--foreground)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--secondary)';
                        }}
                    >
                        <XMarkIcon style={{ width: '1.5rem', height: '1.5rem' }} />
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Name */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                            }}>
                                <UserIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                Nombre
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--foreground)', fontWeight: '600' }}>
                                {prospect.name}
                            </div>
                        </div>

                        {/* Company */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                            }}>
                                <BuildingOfficeIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                Firma / Despacho / Empresa
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                                {prospect.company}
                            </div>
                        </div>

                        {/* Creator */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                            }}>
                                <UserCircleIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                Creado Por
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{
                                    width: '1.75rem',
                                    height: '1.75rem',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    flexShrink: 0
                                }}>
                                    {creatorInitials}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--foreground)', fontFamily: 'var(--font-plus-jakarta)' }}>
                                    {creatorName}
                                </div>
                            </div>
                        </div>

                        {/* Email and Phone - Two columns layout */}
                        {(prospect.email || prospect.phone) && (
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {prospect.email && (
                                    <div style={{ flex: 1 }}>
                                        <div style={{ 
                                            fontSize: '0.75rem', 
                                            fontWeight: '600', 
                                            color: 'var(--secondary)', 
                                            marginBottom: '0.375rem', 
                                            textTransform: 'uppercase',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.375rem'
                                        }}>
                                            <EnvelopeIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                            Email
                                        </div>
                                        <a href={`mailto:${prospect.email}`} style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                            {prospect.email}
                                        </a>
                                    </div>
                                )}
                                {prospect.phone && (
                                    <div style={{ flex: 1 }}>
                                        <div style={{ 
                                            fontSize: '0.75rem', 
                                            fontWeight: '600', 
                                            color: 'var(--secondary)', 
                                            marginBottom: '0.375rem', 
                                            textTransform: 'uppercase',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.375rem'
                                        }}>
                                            <PhoneIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                            Teléfono
                                        </div>
                                        <a href={`tel:${prospect.phone}`} style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                            {prospect.phone}
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Lead Source */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                            }}>
                                <ArrowPathIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                Origen / Medio
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
                                {prospect.leadSource || 'No especificado'}
                            </div>
                        </div>

                        {/* Stage */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                            }}>
                                <FlagIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                Etapa Actual
                            </div>
                            <div style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                backgroundColor: getStageColor(prospect.stage).backgroundColor,
                                borderRadius: '1rem',
                                fontSize: '0.8125rem',
                                color: getStageColor(prospect.stage).color,
                                fontWeight: '600'
                            }}>
                                {prospect.stage}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                marginBottom: '0.5rem' 
                            }}>
                                <div style={{ 
                                    fontSize: '0.75rem', 
                                    fontWeight: '600', 
                                    color: 'var(--secondary)', 
                                    marginBottom: '0.375rem',
                                    textTransform: 'uppercase',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.375rem'
                                }}>
                                    <DocumentTextIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                    Notas
                                </div>
                                {!isEditingNotes && (prospect.notes || onUpdate) && (
                                    <button
                                        onClick={() => {
                                            setEditedNotes(prospect.notes || '');
                                            setIsEditingNotes(true);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--primary)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--background)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <PencilIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                                        Editar
                                    </button>
                                )}
                            </div>
                            {isEditingNotes ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <textarea
                                        value={editedNotes}
                                        onChange={(e) => setEditedNotes(e.target.value)}
                                        rows={4}
                                        style={{
                                            fontSize: '0.8125rem',
                                            color: 'var(--foreground)',
                                            padding: '0.75rem',
                                            backgroundColor: 'var(--background)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '0.5rem',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            whiteSpace: 'pre-wrap'
                                        }}
                                        autoFocus
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={handleCancelEdit}
                                            style={{
                                                padding: '0.5rem 0.75rem',
                                                backgroundColor: 'transparent',
                                                border: '1px solid var(--border)',
                                                borderRadius: '0.5rem',
                                                color: 'var(--foreground)',
                                                fontSize: '0.8125rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveNotes}
                                            style={{
                                                padding: '0.5rem 0.75rem',
                                                backgroundColor: 'var(--primary)',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                color: 'white',
                                                fontSize: '0.8125rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.opacity = '0.9';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.opacity = '1';
                                            }}
                                        >
                                            Guardar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                prospect.notes ? (
                                    <div style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--foreground)',
                                        padding: '0.75rem',
                                        backgroundColor: 'var(--background)',
                                        borderRadius: '0.5rem',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {prospect.notes}
                                    </div>
                                ) : (
                                    onUpdate && (
                                        <div style={{
                                            fontSize: '0.8125rem',
                                            color: 'var(--secondary)',
                                            padding: '0.75rem',
                                            backgroundColor: 'var(--background)',
                                            borderRadius: '0.5rem',
                                            fontStyle: 'italic'
                                        }}>
                                            Sin notas. Haz clic en "Editar" para agregar notas.
                                        </div>
                                    )
                                )
                            )}
                        </div>

                        {/* History */}
                        <div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '600', 
                                color: 'var(--secondary)', 
                                marginBottom: '0.375rem', 
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <ClockIcon style={{ width: '0.75rem', height: '0.75rem' }} />
                                    Historial
                                </div>
                                {prospect.history.length > 1 && (
                                    <button
                                        onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--secondary)',
                                            padding: '0.25rem',
                                            borderRadius: '0.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--background)';
                                            e.currentTarget.style.color = 'var(--foreground)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.color = 'var(--secondary)';
                                        }}
                                    >
                                        {isHistoryExpanded ? (
                                            <ChevronUpIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                                        ) : (
                                            <ChevronDownIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                                        )}
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(isHistoryExpanded ? prospect.history : prospect.history.slice(0, 1)).map((entry, index) => (
                                    <div key={index} style={{
                                        padding: '0.625rem',
                                        backgroundColor: 'var(--background)',
                                        borderRadius: '0.5rem',
                                        borderLeft: '3px solid var(--primary)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--foreground)' }}>
                                                {entry.stage}
                                            </div>
                                            {entry.movedBy && (
                                                <div
                                                    title={`Por: ${userMap[entry.movedBy] || entry.movedBy}`}
                                                    style={{
                                                        width: '1.25rem',
                                                        height: '1.25rem',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'var(--primary)',
                                                        color: 'white',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.5rem',
                                                        fontWeight: '600',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {userMap[entry.movedBy] ? userMap[entry.movedBy].charAt(0).toUpperCase() : (entry.movedBy === 'anonymous' ? '?' : entry.movedBy.charAt(0).toUpperCase())}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                            {new Date(entry.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                    padding: '1rem',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                }}>
                    {/* Quick Actions */}
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button
                            onClick={() => onMoveStage(prospect.id, 'En Pausa')}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#f59e0b';
                                e.currentTarget.style.borderColor = '#f59e0b';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            style={{
                                flex: 1,
                                padding: '0.625rem',
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                boxShadow: '0 4px 0 0 rgba(245, 158, 11, 0.3)'
                            }}
                        >
                            <PauseCircleIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                            Pausar
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('¿Mover a Basura?')) {
                                    onMoveStage(prospect.id, 'Basura');
                                }
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#ef4444';
                                e.currentTarget.style.borderColor = '#ef4444';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            style={{
                                flex: 1,
                                padding: '0.625rem',
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                boxShadow: '0 4px 0 0 rgba(239, 68, 68, 0.3)'
                            }}
                        >
                            <TrashIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                            Basura
                        </button>
                    </div>

                    {/* Main Actions */}
                    {/* Main Actions */}
                    {/* Edit button removed until implementation */}

                    <button
                        onClick={() => {
                            if (confirm(`¿Estás seguro de eliminar a ${prospect.name}?`)) {
                                onDelete(prospect.id);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '0.625rem',
                            backgroundColor: 'transparent',
                            border: '1px solid #ef4444',
                            borderRadius: '0.5rem',
                            color: '#ef4444',
                            fontSize: '0.8125rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <TrashIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                        Eliminar Prospecto
                    </button>
                </div>
            </div>
        </>
    );
}

// ========== AGING SYSTEM FUNCTIONS AND COMPONENTS ==========

// Function to calculate days since last movement
export function getDaysSinceLastMovement(prospect: Prospect): number {
    if (!prospect.history || prospect.history.length === 0) {
        // If no history, use updatedAt or createdAt
        const referenceDate = (prospect as any).updatedAt || prospect.createdAt;
        const daysDiff = Math.floor((Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff;
    }
    
    // Get the most recent history entry (last stage change)
    const lastHistoryEntry = prospect.history[prospect.history.length - 1];
    const lastMovementDate = lastHistoryEntry.date;
    
    // Calculate days difference
    const daysDiff = Math.floor((Date.now() - lastMovementDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysDiff); // Ensure non-negative
}

// Function to get aging level based on days
export function getAgingLevel(days: number): 'fresh' | 'slight' | 'moderate' | 'noticeable' | 'significant' | 'severe' | 'critical' {
    if (days <= 1) return 'fresh';
    if (days <= 3) return 'slight';
    if (days <= 5) return 'moderate';
    if (days <= 10) return 'noticeable';
    if (days <= 15) return 'significant';
    if (days <= 20) return 'severe';
    return 'critical';
}

// Function to get aging styles based on level
export function getAgingStyles(level: string): {
    container: React.CSSProperties;
    cracks: number;
    cracksOpacity: number;
    borderIrregular: boolean;
    borderGaps: number;
} {
    const styles: Record<string, {
        container: React.CSSProperties;
        cracks: number;
        cracksOpacity: number;
        borderIrregular: boolean;
        borderGaps: number;
    }> = {
        fresh: {
            container: {
                backgroundColor: 'transparent',
                filter: 'sepia(0%) saturate(100%)',
                borderColor: 'var(--border)'
            },
            cracks: 0,
            cracksOpacity: 0,
            borderIrregular: false,
            borderGaps: 0
        },
        slight: {
            container: {
                backgroundColor: '#FFFEF5',
                filter: 'sepia(5%) saturate(95%)',
                borderColor: '#F5E6D3'
            },
            cracks: 0,
            cracksOpacity: 0,
            borderIrregular: false,
            borderGaps: 0
        },
        moderate: {
            container: {
                backgroundColor: '#FFF8E1',
                filter: 'sepia(15%) saturate(85%)',
                borderColor: '#E8D5C4',
                backgroundImage: `
                    radial-gradient(circle at 20% 30%, rgba(245, 230, 211, 0.3) 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, rgba(232, 213, 196, 0.2) 0%, transparent 50%)
                `
            },
            cracks: 1,
            cracksOpacity: 0.15,
            borderIrregular: true,
            borderGaps: 1
        },
        noticeable: {
            container: {
                backgroundColor: '#FFECB3',
                filter: 'sepia(30%) saturate(70%)',
                borderColor: '#D4C4B0',
                borderWidth: '1.5px',
                backgroundImage: `
                    radial-gradient(circle at 15% 25%, rgba(245, 230, 211, 0.4) 0%, transparent 50%),
                    radial-gradient(circle at 75% 65%, rgba(232, 213, 196, 0.3) 0%, transparent 50%),
                    radial-gradient(circle at 50% 80%, rgba(212, 196, 176, 0.25) 0%, transparent 50%)
                `
            },
            cracks: 2,
            cracksOpacity: 0.25,
            borderIrregular: true,
            borderGaps: 2
        },
        significant: {
            container: {
                backgroundColor: '#F5E6D3',
                filter: 'sepia(50%) saturate(60%)',
                borderColor: '#C4B5A0',
                borderWidth: '2px',
                backgroundImage: `
                    radial-gradient(circle at 10% 20%, rgba(245, 230, 211, 0.5) 0%, transparent 50%),
                    radial-gradient(circle at 70% 60%, rgba(232, 213, 196, 0.4) 0%, transparent 50%),
                    radial-gradient(circle at 40% 75%, rgba(212, 196, 176, 0.35) 0%, transparent 50%),
                    radial-gradient(circle at 85% 30%, rgba(196, 181, 160, 0.3) 0%, transparent 50%)
                `
            },
            cracks: 3,
            cracksOpacity: 0.4,
            borderIrregular: true,
            borderGaps: 3
        },
        severe: {
            container: {
                backgroundColor: '#E8D5C4',
                filter: 'sepia(70%) saturate(50%)',
                borderColor: '#B5A690',
                borderWidth: '2.5px',
                backgroundImage: `
                    radial-gradient(circle at 5% 15%, rgba(245, 230, 211, 0.6) 0%, transparent 50%),
                    radial-gradient(circle at 65% 55%, rgba(232, 213, 196, 0.5) 0%, transparent 50%),
                    radial-gradient(circle at 35% 70%, rgba(212, 196, 176, 0.45) 0%, transparent 50%),
                    radial-gradient(circle at 80% 25%, rgba(196, 181, 160, 0.4) 0%, transparent 50%),
                    radial-gradient(circle at 25% 90%, rgba(181, 166, 144, 0.35) 0%, transparent 50%)
                `
            },
            cracks: 4,
            cracksOpacity: 0.55,
            borderIrregular: true,
            borderGaps: 4
        },
        critical: {
            container: {
                backgroundColor: '#D4C4B0',
                filter: 'sepia(90%) saturate(40%)',
                borderColor: '#9B8A75',
                borderWidth: '3px',
                backgroundImage: `
                    radial-gradient(circle at 0% 10%, rgba(245, 230, 211, 0.7) 0%, transparent 50%),
                    radial-gradient(circle at 60% 50%, rgba(232, 213, 196, 0.6) 0%, transparent 50%),
                    radial-gradient(circle at 30% 65%, rgba(212, 196, 176, 0.55) 0%, transparent 50%),
                    radial-gradient(circle at 75% 20%, rgba(196, 181, 160, 0.5) 0%, transparent 50%),
                    radial-gradient(circle at 20% 85%, rgba(181, 166, 144, 0.45) 0%, transparent 50%),
                    radial-gradient(circle at 90% 70%, rgba(155, 138, 117, 0.4) 0%, transparent 50%)
                `
            },
            cracks: 6,
            cracksOpacity: 0.7,
            borderIrregular: true,
            borderGaps: 6
        }
    };
    
    return styles[level] || styles.fresh;
}

// Component for rendering aging border with cracks
export function AgingBorder({ irregular, gaps, borderColor }: { irregular: boolean; gaps: number; borderColor: string }) {
    if (!irregular) return null;
    
    const width = 280;
    const height = 200;
    const radius = 8;
    const borderWidth = 2 + (gaps * 0.3);
    
    const getBorderPath = (): string => {
        const variation = Math.min(gaps * 1.5, 8);
        
        const topVariations = [
            { x: width * 0.15, y: -variation * 0.3 },
            { x: width * 0.35, y: variation * 0.2 },
            { x: width * 0.55, y: -variation * 0.4 },
            { x: width * 0.75, y: variation * 0.3 },
            { x: width * 0.9, y: -variation * 0.2 }
        ];
        
        const rightVariations = [
            { y: height * 0.2, x: variation * 0.3 },
            { y: height * 0.5, x: -variation * 0.2 },
            { y: height * 0.8, x: variation * 0.4 }
        ];
        
        const bottomVariations = [
            { x: width * 0.85, y: variation * 0.3 },
            { x: width * 0.65, y: -variation * 0.2 },
            { x: width * 0.45, y: variation * 0.4 },
            { x: width * 0.25, y: -variation * 0.3 },
            { x: width * 0.1, y: variation * 0.2 }
        ];
        
        const leftVariations = [
            { y: height * 0.75, x: -variation * 0.3 },
            { y: height * 0.45, x: variation * 0.2 },
            { y: height * 0.2, x: -variation * 0.4 }
        ];
        
        let path = `M ${radius} 0`;
        topVariations.forEach(v => {
            path += ` L ${v.x} ${Math.max(0, v.y)}`;
        });
        path += ` L ${width - radius} 0`;
        path += ` L ${width} ${radius}`;
        rightVariations.forEach(v => {
            path += ` L ${Math.min(width, width + v.x)} ${v.y}`;
        });
        path += ` L ${width} ${height - radius}`;
        path += ` L ${width - radius} ${height}`;
        bottomVariations.forEach(v => {
            path += ` L ${v.x} ${Math.min(height, height + v.y)}`;
        });
        path += ` L ${radius} ${height}`;
        path += ` L 0 ${height - radius}`;
        leftVariations.forEach(v => {
            path += ` L ${Math.max(0, v.x)} ${v.y}`;
        });
        path += ` L 0 ${radius} Z`;
        return path;
    };
    
    const dashLength = Math.max(15 - gaps * 1.5, 5);
    const gapLength = 1 + gaps * 0.5;
    const dashArray = gaps > 0 ? `${dashLength} ${gapLength}` : 'none';
    
    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 11
            }}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
        >
            <path
                d={getBorderPath()}
                stroke={borderColor}
                strokeWidth={borderWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashArray}
                opacity={0.85}
            />
            {gaps >= 2 && Array.from({ length: Math.min(gaps, 6) }).map((_, i) => {
                const positions = [
                    { x: width * 0.15, y: 0, angle: 90, length: 8 + gaps },
                    { x: width, y: height * 0.25, angle: 180, length: 8 + gaps },
                    { x: width * 0.8, y: height, angle: 270, length: 8 + gaps },
                    { x: 0, y: height * 0.7, angle: 0, length: 8 + gaps },
                    { x: width * 0.5, y: 0, angle: 90, length: 6 + gaps },
                    { x: width, y: height * 0.75, angle: 180, length: 6 + gaps }
                ];
                const pos = positions[i % positions.length];
                const endX = pos.x + Math.cos((pos.angle * Math.PI) / 180) * pos.length;
                const endY = pos.y + Math.sin((pos.angle * Math.PI) / 180) * pos.length;
                return (
                    <path
                        key={`border-crack-${i}`}
                        d={`M ${pos.x} ${pos.y} Q ${pos.x + (endX - pos.x) * 0.5} ${pos.y + (endY - pos.y) * 0.5 + (Math.random() - 0.5) * 2} ${endX} ${endY}`}
                        stroke={borderColor}
                        strokeWidth={1}
                        fill="none"
                        strokeLinecap="round"
                        opacity={0.5 + (i * 0.1)}
                    />
                );
            })}
        </svg>
    );
}

// Component for rendering aging cracks
export function AgingCracks({ count, opacity }: { count: number; opacity: number }) {
    if (count === 0) return null;
    
    const crackPatterns = [
        "M 50 30 Q 60 40 70 35 T 85 45",
        "M 200 50 Q 210 60 220 55 T 235 65",
        "M 30 100 Q 40 110 50 105 Q 60 115 70 110 T 85 120",
        "M 150 80 Q 160 90 170 85 Q 180 95 190 90 T 205 100",
        "M 220 150 Q 230 160 240 155 Q 250 165 260 160",
        "M 20 40 Q 30 50 40 45 Q 50 55 60 50 Q 70 60 80 55 T 100 65",
        "M 180 120 Q 190 130 200 125 Q 210 135 220 130 Q 230 140 240 135",
        "M 100 160 Q 110 170 120 165 Q 130 175 140 170 Q 150 180 160 175",
        "M 10 60 Q 20 70 30 65 Q 40 75 50 70 Q 60 80 70 75 Q 80 85 90 80 T 110 90",
        "M 160 40 Q 170 50 180 45 Q 190 55 200 50 Q 210 60 220 55 Q 230 65 240 60",
    ];
    
    const selectedPatterns = crackPatterns.slice(0, Math.min(count, crackPatterns.length));
    
    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                opacity: opacity,
                zIndex: 10
            }}
            viewBox="0 0 280 200"
            preserveAspectRatio="none"
        >
            {selectedPatterns.map((path, i) => (
                <path
                    key={i}
                    d={path}
                    stroke="#5D4037"
                    strokeWidth={count <= 2 ? 0.8 : count <= 4 ? 1 : 1.2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.5 + (i * 0.1)}
                />
            ))}
            {count >= 3 && Array.from({ length: Math.floor(count / 2) }).map((_, i) => {
                const startX = 20 + (i * 40) % 240;
                const startY = 30 + (i * 30) % 150;
                return (
                    <path
                        key={`random-${i}`}
                        d={`M ${startX} ${startY} Q ${startX + 10} ${startY + 10} ${startX + 20} ${startY + 5}`}
                        stroke="#6D4C41"
                        strokeWidth={0.6}
                        fill="none"
                        strokeLinecap="round"
                        opacity={0.3}
                    />
                );
            })}
        </svg>
    );
}
