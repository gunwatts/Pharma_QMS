/**
 * QMS Cross-Filter & Analytics Module
 * Powers BI-style filtering with charts and dynamic table updates
 */

class QMSCrossFilter {
    constructor(config = {}) {
        // ===== DATA STORAGE =====
        this.allData = [];
        this.filteredData = [];
        
        // ===== KEYBOARD STATE (for shift+click detection) =====
        this.keyboardState = {
            shiftPressed: false,
            ctrlPressed: false
        };
        
        // ===== FILTER STATE =====
        this.activeFilters = {
            department: [],
            status: [],
            type: [],
            ageRange: [],
            targetMonth: null,  // Format: "YYYY-MM"
            involvedDepartment: []  // Multi-select for involved_departments
        };
        
        // ===== CONFIG (Use global window config if available) =====
        this.config = {
            apiUrl: (typeof window.QMS_CONFIG !== 'undefined' && window.QMS_CONFIG.apiUrl) 
                ? window.QMS_CONFIG.apiUrl 
                : '/api/qms/',  // Correct default path based on Django URL config
            chartTimeout: 500,
            ...config
        };
        
        // ===== CHART INSTANCES =====
        this.charts = {
            byDepartment: null,
            byType: null,
            byStatus: null,
            byTimeline: null,
            byTargetDate: null,
            byInvolvedDept: null
        };
        
        // ===== UI REFERENCES =====
        this.elements = {
            deptChart: document.getElementById('chartByDepartment'),
            typeChart: document.getElementById('chartByType'),
            statusChart: document.getElementById('chartByStatus'),
            timelineChart: document.getElementById('chartByTimeline'),
            targetDateChart: document.getElementById('chartByTargetDate'),
            involvedDeptChart: document.getElementById('chartByInvolvedDept'),
            table: document.getElementById('qmsTable'),
            resetBtn: document.getElementById('resetFilters')
        };
        
        // ===== DEBOUNCE & CHART UPDATE CONTROL =====
        this.chartDebounceTimer = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the system: fetch data, create charts, bind events
     */
    async init() {
        try {
            console.log('[QMS Cross-Filter] Initializing...');
            
            // Check dependencies
            if (typeof Chart === 'undefined') {
                console.error('[QMS Cross-Filter] ❌ Chart.js not loaded!');
                throw new Error('Chart.js library not found');
            }
            console.log('[QMS Cross-Filter] ✓ Chart.js loaded');
            
            if (typeof jQuery === 'undefined') {
                console.error('[QMS Cross-Filter] ❌ jQuery not loaded!');
                throw new Error('jQuery not found');
            }
            console.log('[QMS Cross-Filter] ✓ jQuery loaded');
            
            // Fetch API data
            console.log('[QMS Cross-Filter] Fetching data...');
            await this.fetchData();
            console.log('[QMS Cross-Filter] ✓ Data fetched:', this.allData.length, 'records');
            
            // Bind events
            console.log('[QMS Cross-Filter] Binding events...');
            this.bindEvents();
            console.log('[QMS Cross-Filter] ✓ Events bound');
            
            // Check if canvas elements exist
            console.log('[QMS Cross-Filter] Checking chart containers...');
            Object.entries(this.elements).forEach(([key, el]) => {
                if (el) {
                    console.log(`  ✓ ${key}: found`);
                } else {
                    console.warn(`  ⚠️ ${key}: NOT FOUND - charts may not render`);
                }
            });
            
            // Render charts
            console.log('[QMS Cross-Filter] Rendering charts...');
            this.renderCharts();
            console.log('[QMS Cross-Filter] ✓ Charts rendered');
            
            // Update table
            console.log('[QMS Cross-Filter] Updating table...');
            this.updateTableFromFilters();
            console.log('[QMS Cross-Filter] ✓ Table updated');
            
            this.isInitialized = true;
            console.log('[QMS Cross-Filter] ✓ Initialization complete!');
        } catch (error) {
            console.error('[QMS Cross-Filter] ❌ Initialization failed:', error);
            console.error('[QMS Cross-Filter] Stack:', error.stack);
        }
    }

    /**
     * Fetch all QMS data from API
     */
    async fetchData() {
        try {
            console.log(`[QMS Cross-Filter] Fetching from: ${this.config.apiUrl}`);
            const response = await fetch(this.config.apiUrl);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[QMS Cross-Filter] HTTP ${response.status}: ${errorText}`);
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            this.allData = await response.json();
            this.filteredData = [...this.allData];
            
            console.log(`[QMS Cross-Filter] Loaded ${this.allData.length} QMS records`);
            
            if (this.allData.length === 0) {
                console.warn('[QMS Cross-Filter] Warning: API returned empty data');
            }
            
            // Log first record structure to verify fields
            if (this.allData.length > 0) {
                console.log('[QMS Cross-Filter] ✓ First record structure:', this.allData[0]);
                console.log('[QMS Cross-Filter] Target date sample:', this.allData[0].target_date);
                console.log('[QMS Cross-Filter] Review on sample:', this.allData[0].review_on);
            }
        } catch (error) {
            console.error('[QMS Cross-Filter] Failed to fetch data:', error);
            console.error('[QMS Cross-Filter] Attempted URL:', this.config.apiUrl);
            throw error;
        }
    }

    /**
     * Bind event listeners for filters and reset button
     */
    bindEvents() {
        // ===== KEYBOARD STATE TRACKING (for Shift+Click detection) =====
        document.addEventListener('keydown', (e) => {
            if (e.shiftKey) this.keyboardState.shiftPressed = true;
            if (e.ctrlKey || e.metaKey) this.keyboardState.ctrlPressed = true;
            console.log('[Keyboard] Key pressed - Shift: ' + this.keyboardState.shiftPressed + ', Ctrl: ' + this.keyboardState.ctrlPressed);
        });
        
        document.addEventListener('keyup', (e) => {
            this.keyboardState.shiftPressed = false;
            this.keyboardState.ctrlPressed = false;
            console.log('[Keyboard] All keys released');
        });
        
        // Reset button
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => this.resetFilters());
        }
        
        // Existing filter UI controls (status buttons, dept filter, etc.)
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStatusFilterClick(e));
        });
        
        document.getElementById('deptFilter').addEventListener('change', (e) => {
            this.handleDepartmentFilterChange(e);
        });
        
        document.getElementById('globalSearch').addEventListener('keyup', (e) => {
            this.handleGlobalSearch(e);
        });
    }

    /**
     * ===== TIMELINE CALCULATION =====
     */
    getDaysDifference(date) {
        const today = new Date();
        const initDate = new Date(date);
        return Math.floor((today - initDate) / (1000 * 60 * 60 * 24));
    }

    getAgeRange(days) {
        if (days > 365) return '1_year_plus';
        if (days > 180) return '6_months_plus';
        if (days > 90) return '3_months_plus';
        if (days > 60) return '2_months_plus';
        return 'less_2_months';
    }

    /**
     * ===== FILTER APPLICATION =====
     */
    applyFilters() {
        this.filteredData = this.allData.filter(item => {
            const deptMatch = 
                this.activeFilters.department.length === 0 || 
                this.activeFilters.department.includes(item.department);
            
            const statusMatch = this.checkStatusFilter(item);
            
            const typeMatch = 
                this.activeFilters.type.length === 0 || 
                this.activeFilters.type.includes(item.type);
            
            const ageMatch = this.checkAgeFilter(item);
            
            const targetDateMatch = this.checkTargetDateFilter(item);
            
            const involvedDeptMatch = this.checkInvolvedDeptFilter(item);
            
            return deptMatch && statusMatch && typeMatch && ageMatch && targetDateMatch && involvedDeptMatch;
        });
        
        console.log(`[QMS Cross-Filter] Applied filters: ${this.filteredData.length} records match`);
    }

    checkAgeFilter(item) {
        if (this.activeFilters.ageRange.length === 0) return true;
        
        const days = this.getDaysDifference(item.initiated_date);
        const ageRange = this.getAgeRange(days);
        
        return this.activeFilters.ageRange.includes(ageRange);
    }

    checkStatusFilter(item) {
        if (this.activeFilters.status.length === 0) return true;
        
        // Check each active status filter
        return this.activeFilters.status.some(filterStatus => {
            if (filterStatus === 'Overdue') {
                // Overdue: target_date < today AND status is Open
                const today = new Date();
                const targetDate = new Date(item.target_date);
                return targetDate < today && item.status === 'Open';
            } else if (filterStatus === 'Review') {
                // Review: review_on is set AND review_on <= today + 7 days
                if (!item.review_on) return false;
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);  // Set to start of today
                const reviewDate = new Date(item.review_on);
                reviewDate.setHours(0, 0, 0, 0);  // Set to start of review date
                
                const sevenDaysFromNow = new Date(today);
                sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
                
                // Review date should be <= today + 7 days (i.e., it's soon or overdue)
                return reviewDate <= sevenDaysFromNow;
            } else {
                // Normal status field comparison
                return item.status === filterStatus;
            }
        });
    }

    checkTargetDateFilter(item) {
        if (!this.activeFilters.targetMonth) return true;
        
        if (!item.target_date) return false;
        
        const date = new Date(item.target_date);
        const monthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        
        return monthKey === this.activeFilters.targetMonth;
    }
    
    checkInvolvedDeptFilter(item) {
        if (this.activeFilters.involvedDepartment.length === 0) return true;
        
        // Check if any of the involved departments match the filter
        const involvedCodes = item.involved_dept_codes || [];
        return this.activeFilters.involvedDepartment.some(dept => involvedCodes.includes(dept));
    }

    /**
     * Handle status button clicks (Open, EM, CFT, Near Review, Overdue)
     */
    handleStatusFilterClick(e) {
        const btn = e.target;
        const status = btn.dataset.status;
        
        if (status === 'Overdue') {
            // Overdue filter: show QMS where target_date < today
            if (this.activeFilters.status.length > 0 && this.activeFilters.status[0] === 'Overdue') {
                this.activeFilters.status = [];
            } else {
                this.activeFilters.status = ['Overdue'];
            }
        } else if (status === 'Review') {
            // Handle "Near Review" separately
            if (this.activeFilters.status.includes('Review')) {
                this.activeFilters.status = this.activeFilters.status.filter(s => s !== 'Review');
            } else {
                this.activeFilters.status = ['Review'];
            }
        } else {
            if (this.activeFilters.status.includes(status)) {
                this.activeFilters.status = this.activeFilters.status.filter(s => s !== status);
            } else {
                // Single status at a time for status buttons
                this.activeFilters.status = [status];
            }
        }
        
        this.applyFilters();
        this.updateUI();
    }

    /**
     * Handle department filter change
     */
    handleDepartmentFilterChange(e) {
        const dept = e.target.value;
        
        if (dept === '') {
            this.activeFilters.department = [];
        } else {
            this.activeFilters.department = [dept];
        }
        
        this.applyFilters();
        this.updateUI();
    }

    /**
     * Toggle target month filter (click on target date chart bar)
     */
    toggleTargetMonthFilter(monthKey, monthLabel) {
        if (this.activeFilters.targetMonth === monthKey) {
            // Toggle off
            this.activeFilters.targetMonth = null;
            console.log('[Filter] Target month cleared');
        } else {
            // Toggle on
            this.activeFilters.targetMonth = monthKey;
            console.log('[Filter] Target month set to:', monthKey, '(', monthLabel, ')');
        }
        
        this.applyFilters();
        this.updateUI();
    }

    /**
     * Handle global search
     */
    handleGlobalSearch(e) {
        const query = e.target.value.toLowerCase();
        
        if (query === '') {
            this.applyFilters();
        } else {
            // Filter by qms_number, description, background, remarks
            this.filteredData = this.allData.filter(item => {
                const searchableText = `
                    ${item.qms_number}
                    ${item.description}
                    ${item.background}
                    ${item.remarks}
                `.toLowerCase();
                
                return searchableText.includes(query);
            });
        }
        
        this.updateUI();
    }

    /**
     * ===== CHART RENDERING =====
     */
    renderCharts() {
        console.log('[Chart Render] Starting chart rendering (debounced)...');
        clearTimeout(this.chartDebounceTimer);
        this.chartDebounceTimer = setTimeout(() => {
            try {
                console.log('[Chart Render] Rendering all 6 charts...');
                this.renderDepartmentChart();
                this.renderTypeChart();
                this.renderStatusChart();
                this.renderTimelineChart();
                this.renderTargetDateChart();
                this.renderInvolvedDeptChart();
                console.log('[Chart Render] ✓ All 6 charts rendered successfully');
            } catch (error) {
                console.error('[Chart Render] ❌ Error rendering charts:', error);
                console.error('[Chart Render] Stack:', error.stack);
            }
        }, 100);
    }

    renderDepartmentChart() {
        if (!this.elements.deptChart) {
            console.warn('[Chart] Department chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Department chart...');
            const data = this.aggregateByDepartment();
            
            if (this.charts.byDepartment) {
                this.charts.byDepartment.destroy();
            }
            
            const ctx = this.elements.deptChart.getContext('2d');
            
            this.charts.byDepartment = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: this.getBackgroundColors(data.labels, 'department'),
                        borderColor: this.getBorderColors(data.labels, 'department'),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const department = data.labels[index];
                            
                            // Multi-select with Shift+Click or Ctrl+Click
                            if (this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed) {
                                // Multi-select toggle
                                if (this.activeFilters.department.includes(department)) {
                                    this.activeFilters.department = this.activeFilters.department.filter(d => d !== department);
                                } else {
                                    this.activeFilters.department.push(department);
                                }
                            } else {
                                // Single select
                                if (this.activeFilters.department.length === 1 && this.activeFilters.department[0] === department) {
                                    this.activeFilters.department = [];
                                } else {
                                    this.activeFilters.department = [department];
                                }
                            }
                            
                            console.log('[Chart] Department filter:', this.activeFilters.department);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS by Department (Click: Single | Shift+Click: Multi)' },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 12 },
                            color: '#333'
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
            console.log('[Chart] ✓ Department chart rendered');
        } catch (error) {
            console.error('[Chart] ❌ Department chart error:', error);
        }
    }

    renderTypeChart() {
        if (!this.elements.typeChart) {
            console.warn('[Chart] Type chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Type chart...');
            const data = this.aggregateByType();
            
            if (this.charts.byType) {
                this.charts.byType.destroy();
            }
            
            const ctx = this.elements.typeChart.getContext('2d');
            
            this.charts.byType = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: data.colors,
                        borderColor: data.colors.map(c => this.darkenColor(c)),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    indexAxis: undefined, // Vertical bars (like Department)
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const type = data.labels[index];
                            
                            // Multi-select with Shift+Click or Ctrl+Click
                            if (this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed) {
                                // Multi-select toggle
                                if (this.activeFilters.type.includes(type)) {
                                    this.activeFilters.type = this.activeFilters.type.filter(t => t !== type);
                                } else {
                                    this.activeFilters.type.push(type);
                                }
                            } else {
                                // Single select
                                if (this.activeFilters.type.length === 1 && this.activeFilters.type[0] === type) {
                                    this.activeFilters.type = [];
                                } else {
                                    this.activeFilters.type = [type];
                                }
                            }
                            
                            console.log('[Chart] Type filter:', this.activeFilters.type);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS by Type (Click: Single | Shift+Click: Multi)' },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            color: '#333'
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: {
                            ticks: {
                                font: { size: 10 },
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    }
                }
            });
            console.log('[Chart] ✓ Type chart rendered');
        } catch (error) {
            console.error('[Chart] ❌ Type chart error:', error);
        }
    }

    renderStatusChart() {
        if (!this.elements.statusChart) {
            console.warn('[Chart] Status chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Status chart...');
            const data = this.aggregateByStatus();
            
            if (this.charts.byStatus) {
                this.charts.byStatus.destroy();
            }
            
            const ctx = this.elements.statusChart.getContext('2d');
            
            this.charts.byStatus = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Count',
                        data: data.values,
                        backgroundColor: data.colors
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const status = data.labels[index];
                            
                            // Multi-select with Shift+Click or Ctrl+Click
                            if (this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed) {
                                // Multi-select toggle
                                if (this.activeFilters.status.includes(status)) {
                                    this.activeFilters.status = this.activeFilters.status.filter(s => s !== status);
                                } else {
                                    this.activeFilters.status.push(status);
                                }
                            } else {
                                // Single select
                                if (this.activeFilters.status.length === 1 && this.activeFilters.status[0] === status) {
                                    this.activeFilters.status = [];
                                } else {
                                    this.activeFilters.status = [status];
                                }
                            }
                            
                            console.log('[Chart] Status filter:', this.activeFilters.status);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'bottom' },
                        title: { display: true, text: 'QMS by Status (Click: Single | Shift+Click: Multi)' },
                        datalabels: {
                            formatter: (value, context) => {
                                return value;
                            },
                            font: { weight: 'bold', size: 12 },
                            color: '#fff',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                        }
                    }
                }
            });
            console.log('[Chart] ✓ Status chart rendered');
        } catch (error) {
            console.error('[Chart] ❌ Status chart error:', error);
        }
    }

    renderTimelineChart() {
        if (!this.elements.timelineChart) {
            console.warn('[Chart] Timeline chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Timeline chart...');
            const data = this.aggregateByTimeline();
            
            if (this.charts.byTimeline) {
                this.charts.byTimeline.destroy();
            }
            
            const ctx = this.elements.timelineChart.getContext('2d');
            
            this.charts.byTimeline = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: '#ff7300',
                        borderColor: '#cc5c00',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const ageRange = data.ageRanges[index];
                            
                            // Multi-select with Shift+Click or Ctrl+Click
                            if (this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed) {
                                // Multi-select toggle
                                if (this.activeFilters.ageRange.includes(ageRange)) {
                                    this.activeFilters.ageRange = this.activeFilters.ageRange.filter(a => a !== ageRange);
                                } else {
                                    this.activeFilters.ageRange.push(ageRange);
                                }
                            } else {
                                // Single select - toggle
                                if (this.activeFilters.ageRange.length === 1 && this.activeFilters.ageRange[0] === ageRange) {
                                    this.activeFilters.ageRange = [];
                                } else {
                                    this.activeFilters.ageRange = [ageRange];
                                }
                            }
                            
                            console.log('[Chart] Age range filter:', this.activeFilters.ageRange);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS Aging Timeline (Click: Single | Shift+Click: Multi)' },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            color: '#333'
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
            console.log('[Chart] ✓ Timeline chart rendered');
        } catch (error) {
            console.error('[Chart] ❌ Timeline chart error:', error);
        }
    }

    renderTargetDateChart() {
        if (!this.elements.targetDateChart) {
            console.warn('[Chart] Target Date chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Target Date (drill-down) chart...');
            
            // Initialize hierarchy state
            if (!this.chartState) {
                this.chartState = {
                    targetDateMode: 'years',  // 'years' or 'months'
                    selectedYear: null,
                    hierarchy: null
                };
            }
            
            const aggregation = this.aggregateByTargetDate();
            this.chartState.hierarchy = aggregation.hierarchy;
            
            // Determine what to show based on current mode
            let chartLabels, chartValues, chartColors, drillDownData;
            let chartTitle = 'QMS Target Dates by Year (Click to Drill Down)';
            
            if (this.chartState.targetDateMode === 'years') {
                // Show year-level data
                chartLabels = aggregation.labels;
                chartValues = aggregation.values;
                chartColors = aggregation.colors;
                drillDownData = aggregation.yearKeys;
            } else if (this.chartState.targetDateMode === 'months' && this.chartState.selectedYear) {
                // Show month-level data for selected year
                const yearData = aggregation.hierarchy.data[this.chartState.selectedYear];
                const monthsArray = Object.values(yearData.months).sort((a, b) => {
                    const aMonth = parseInt(a.key.split('-')[1]);
                    const bMonth = parseInt(b.key.split('-')[1]);
                    return aMonth - bMonth;
                });
                
                chartLabels = monthsArray.map(m => m.label);
                chartValues = monthsArray.map(m => m.count);
                chartColors = this.generateColors(monthsArray.length || 1);
                drillDownData = monthsArray.map(m => m.key);
                chartTitle = 'Months in ' + this.chartState.selectedYear + ' (Click to Filter | ← Back to Years)';
            }
            
            if (!chartLabels || chartLabels.length === 0) {
                console.warn('[Chart] No data to display in Target Date chart');
                chartLabels = ['No Data'];
                chartValues = [0];
                chartColors = ['#ccc'];
            }
            
            if (this.charts.byTargetDate) {
                this.charts.byTargetDate.destroy();
                console.log('[Chart] Previous Target Date chart destroyed');
            }
            
            const ctx = this.elements.targetDateChart.getContext('2d');
            if (!ctx) {
                console.error('[Chart] Failed to get 2D context from Target Date canvas');
                return;
            }
            
            this.charts.byTargetDate = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'QMS Count',
                        data: chartValues,
                        backgroundColor: chartColors,
                        borderColor: chartColors.map(c => this.darkenColor(c)),
                        borderWidth: 2,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    indexAxis: undefined,  // Vertical bars
                    onClick: (event, elements) => {
                        // Check if Shift key is pressed for drill-up
                        if (this.keyboardState.shiftPressed && this.chartState.targetDateMode === 'months') {
                            // Drill up from months to years
                            this.chartState.targetDateMode = 'years';
                            this.chartState.selectedYear = null;
                            console.log('[Chart] Drilled up to year view');
                            this.renderTargetDateChart();
                            return;
                        }
                        
                        if (elements.length > 0 && drillDownData) {
                            const index = elements[0].index;
                            const drillValue = drillDownData[index];
                            
                            if (this.chartState.targetDateMode === 'years') {
                                // Drill into selected year
                                this.chartState.selectedYear = drillValue;
                                this.chartState.targetDateMode = 'months';
                                console.log('[Chart] Drilled down to year:', drillValue);
                                this.renderTargetDateChart();
                            } else if (this.chartState.targetDateMode === 'months') {
                                // Filter by this month
                                const monthKey = drillValue;
                                console.log('[Chart] Month filter applied:', monthKey);
                                this.toggleTargetMonthFilter(monthKey, chartLabels[index]);
                            }
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: chartTitle, font: { size: 13, weight: 'bold' } },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label + ': ' + context.parsed.y + ' QMS';
                                    if (this.chartState && this.chartState.targetDateMode === 'months') {
                                        label += '\n(Shift+Click to go back to years)';
                                    }
                                    return label;
                                }.bind(this),
                                afterLabel: function(context) {
                                    if (this.chartState && this.chartState.targetDateMode === 'years') {
                                        return 'Click to drill down to months';
                                    }
                                    return 'Click to filter by this month';
                                }.bind(this)
                            }
                        },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            color: '#333',
                            formatter: function(value) {
                                return value > 0 ? value : '';
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1, font: { size: 10 } },
                            title: { display: true, text: 'QMS Count', font: { size: 11, weight: 'bold' } }
                        },
                        x: {
                            ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 },
                            title: { display: true, text: this.chartState.targetDateMode === 'years' ? 'Year' : 'Month', font: { size: 11, weight: 'bold' } }
                        }
                    }
                }
            });
            console.log('[Chart] Target Date chart rendered (mode: ' + this.chartState.targetDateMode + ')');
        } catch (error) {
            console.error('[Chart] Target Date chart error:', error);
            console.error('[Chart] Stack:', error.stack);
        }
    }

    /**
     * ===== DATA AGGREGATION =====
     */
    aggregateByDepartment() {
        const agg = {};
        this.filteredData.forEach(item => {
            agg[item.department] = (agg[item.department] || 0) + 1;
        });
        
        const labels = Object.keys(agg).sort();
        const values = labels.map(k => agg[k]);
        
        return { labels, values };
    }

    aggregateByType() {
        const agg = {};
        this.filteredData.forEach(item => {
            agg[item.type] = (agg[item.type] || 0) + 1;
        });
        
        const labels = Object.keys(agg).sort();
        const values = labels.map(k => agg[k]);
        const colors = this.generateColors(labels.length);
        
        return { labels, values, colors };
    }

    aggregateByStatus() {
        const agg = {};
        this.filteredData.forEach(item => {
            agg[item.status] = (agg[item.status] || 0) + 1;
        });
        
        const labels = Object.keys(agg).sort();
        const values = labels.map(k => agg[k]);
        const colorMap = { 'Open': '#0d6efd', 'CFT': '#20c997', 'EM': '#6610f2', 'Closed': '#6c757d' };
        const colors = labels.map(l => colorMap[l] || '#999');
        
        return { labels, values, colors };
    }

    aggregateByTimeline() {
        const buckets = {
            'less_2_months': 0,
            '2_months_plus': 0,
            '3_months_plus': 0,
            '6_months_plus': 0,
            '1_year_plus': 0
        };
        
        this.filteredData.forEach(item => {
            const days = this.getDaysDifference(item.initiated_date);
            const bucket = this.getAgeRange(days);
            buckets[bucket]++;
        });
        
        const labelMap = {
            'less_2_months': '< 2 Months',
            '2_months_plus': '2-3 Months',
            '3_months_plus': '3-6 Months',
            '6_months_plus': '6-12 Months',
            '1_year_plus': '> 1 Year'
        };
        
        const ageRanges = Object.keys(buckets);
        const labels = ageRanges.map(k => labelMap[k]);
        const values = ageRanges.map(k => buckets[k]);
        
        return { labels, values, ageRanges };
    }

    aggregateByTargetDateHierarchy() {
        const yearMap = {};
        let itemsWithTargetDate = 0;
        
        console.log('[Chart] Aggregating target dates by year and month...');
        
        this.filteredData.forEach(item => {
            if (!item.target_date) return;
            
            itemsWithTargetDate++;
            const date = new Date(item.target_date);
            
            if (isNaN(date.getTime())) {
                console.warn('[Chart] Invalid date for item', item.id, ':', item.target_date);
                return;
            }
            
            const year = date.getFullYear();
            const monthKey = year + '-' + String(date.getMonth() + 1).padStart(2, '0');
            const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });  // 'Jan', 'Feb', etc.
            
            if (!yearMap[year]) {
                yearMap[year] = { label: year.toString(), count: 0, months: {} };
            }
            
            yearMap[year].count++;
            
            if (!yearMap[year].months[monthKey]) {
                yearMap[year].months[monthKey] = { label: monthLabel, count: 0, key: monthKey };
            }
            yearMap[year].months[monthKey].count++;
        });
        
        // Sort years
        const sortedYears = Object.keys(yearMap).sort().reverse();  // Newest first
        
        console.log('[Chart] ✓ Hierarchical aggregation complete:');
        console.log('  - Total filtered records:', this.filteredData.length);
        console.log('  - Records with target_date:', itemsWithTargetDate);
        console.log('  - Years found:', sortedYears.length);
        
        return {
            years: sortedYears,
            data: yearMap,
            totalCount: itemsWithTargetDate
        };
    }
    
    aggregateByTargetDate() {
        // For backward compatibility, delegate to hierarchy
        const hierarchy = this.aggregateByTargetDateHierarchy();
        
        // Return year-level data for initial view
        const yearData = hierarchy.years.map(year => ({
            label: year,
            count: hierarchy.data[year].count,
            key: year
        }));
        
        return {
            labels: yearData.map(y => y.label),
            values: yearData.map(y => y.count),
            colors: this.generateColors(yearData.length || 1),
            yearKeys: yearData.map(y => y.key),
            hierarchy: hierarchy
        };
    }

    /**
     * ===== FILTER TOGGLES =====
     */
    toggleDepartmentFilter(dept) {
        if (this.activeFilters.department.includes(dept)) {
            this.activeFilters.department = this.activeFilters.department.filter(d => d !== dept);
        } else {
            this.activeFilters.department = [dept]; // Single selection
        }
        
        this.applyFilters();
        this.updateUI();
    }

    toggleTypeFilter(type) {
        if (this.activeFilters.type.includes(type)) {
            this.activeFilters.type = this.activeFilters.type.filter(t => t !== type);
        } else {
            this.activeFilters.type.push(type);
        }
        
        this.applyFilters();
        this.updateUI();
    }

    toggleStatusFilter(status) {
        if (this.activeFilters.status.includes(status)) {
            this.activeFilters.status = this.activeFilters.status.filter(s => s !== status);
        } else {
            this.activeFilters.status = [status]; // Single selection
        }
        
        this.applyFilters();
        this.updateUI();
    }

    toggleAgeFilter(ageRange) {
        if (this.activeFilters.ageRange.includes(ageRange)) {
            this.activeFilters.ageRange = this.activeFilters.ageRange.filter(a => a !== ageRange);
        } else {
            this.activeFilters.ageRange.push(ageRange);
        }
        
        this.applyFilters();
        this.updateUI();
    }

    /**
     * ===== UI UPDATE =====
     */
    updateUI() {
        this.renderCharts();
        this.updateTableFromFilters();
        this.updateFilterIndicators();
    }

    updateFilterIndicators() {
        // Highlight active filter buttons
        document.querySelectorAll('.status-btn').forEach(btn => {
            const status = btn.dataset.status;
            if (this.activeFilters.status.includes(status)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    resetFilters() {
        this.activeFilters = {
            department: [],
            status: [],
            type: [],
            ageRange: [],
            targetMonth: null,
            involvedDepartment: []
        };
        this.applyFilters();
        this.updateUI();
        
        // Reset form inputs
        document.getElementById('globalSearch').value = '';
        document.getElementById('deptFilter').value = '';
        console.log('[QMS Cross-Filter] All filters reset');
    }

    /**
     * ===== TABLE UPDATE =====
     * Updates the DataTable with filtered data
     */
    updateTableFromFilters(retryCount = 0) {
        console.log('[Table] updateTableFromFilters() called - retryCount:', retryCount);
        console.log('[Table] Filtered data available:', this.filteredData.length, 'records');
        console.log('[Table] Filtered data sample:', this.filteredData.slice(0, 2));
        
        if (!this.elements.table) {
            console.warn('[Table] ❌ Table element not found (#qmsTable)');
            return;
        }
        
        console.log('[Table] ✓ Table element found');
        
        try {
            const isDataTable = jQuery.fn.dataTable.isDataTable(this.elements.table);
            console.log('[Table] jQuery.fn.dataTable.isDataTable() returned:', isDataTable);
            
            const table = isDataTable ? $(this.elements.table).DataTable() : null;
            console.log('[Table] Table instance obtained:', table ? '✓ Yes' : '❌ No');
            
            if (!table) {
                // Retry up to 10 times with longer delays if DataTable not ready yet
                if (retryCount < 10) {
                    const delay = 300 + (retryCount * 100);  // Progressive backoff
                    console.log('[Table] ⚠️ DataTable not initialized yet - retry', retryCount + 1, '/10 (delay:', delay, 'ms)');
                    setTimeout(() => this.updateTableFromFilters(retryCount + 1), delay);
                    return;
                } else {
                    console.warn('[Table] ❌ DataTable still not available after', retryCount, 'retries');
                    console.warn('[Table] Table will remain empty - DataTable initialization may have failed');
                    return;
                }
            }
            
            console.log('[Table] ✓ DataTable initialized, clearing existing rows...');
            
            // Clear existing rows
            table.clear();
            console.log('[Table] ✓ Table cleared');
            
            // Add filtered data rows
            console.log('[Table] Adding', this.filteredData.length, 'rows to table...');
            let rowsAdded = 0;
            let rowsErrored = 0;
            
            this.filteredData.forEach((item, index) => {
                try {
                    if (!item.qms_number) {
                        console.warn('[Table] ⚠️ Skipping row without qms_number');
                        rowsErrored++;
                        return;
                    }
                    const row = this.createTableRow(item);
                    table.row.add(row);
                    rowsAdded++;
                } catch (error) {
                    console.error('[Table] ❌ Error creating row for item', item.id, ':', error.message);
                    rowsErrored++;
                }
            });
            
            console.log('[Table] ✓ Added', rowsAdded, 'rows successfully, errored:', rowsErrored);
            
            // Draw table
            table.draw();
            console.log('[Table] ✓ Table redrawn');
            console.log('[Table] ✓ Table update complete - showing', rowsAdded, 'records');
            
            // Rebind handlers after draw
            this.bindTableHandlers();
        } catch (error) {
            console.error('[Table] ❌ Error updating table:', error);
            console.error('[Table] Stack:', error.stack);
        }
    }
    
    bindTableHandlers() {
        // This will be called from template's bindAjaxSaveHandlers
        console.log('[Table] Handlers rebinding after data update');
    }

    createTableRow(item) {
        const today = new Date();
        const targetDate = new Date(item.target_date);
        const isOverdue = targetDate < today && item.status === 'Open';
        const overdueClass = isOverdue ? 'overdue-text' : '';
        
        // Format review_on date for input field (YYYY-MM-DD)
        let reviewDateValue = '';
        let hasReviewDate = false;
        if (item.review_on) {
            const reviewDate = new Date(item.review_on);
            reviewDateValue = reviewDate.toISOString().split('T')[0];
            hasReviewDate = true;
        }
        
        // Get the detail URL from config if available
        const detailUrl = (typeof window.QMS_CONFIG !== 'undefined' && window.QMS_CONFIG.detailUrl)
            ? window.QMS_CONFIG.detailUrl(item.id)
            : `/qms/${item.id}/`;
        
        console.log('[Table] Row', item.id, 'review_on:', item.review_on, '-> formatted:', reviewDateValue);
        
        return [
            `<div class="cell-padding"><a href="${detailUrl}">${item.qms_number}</a></div>`,
            `<div class="cell-padding">${item.description}</div>`,
            `<div class="cell-padding">${item.background}</div>`,
            `<div class="remarks-container"><textarea class="remarks-area ajax-save" data-field="remarks" data-id="${item.id}">${item.remarks || ''}</textarea></div>`,
            `<div class="cell-padding"><span class="date-val ${overdueClass}" data-date="${item.target_date}">${new Date(item.target_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase()}</span></div>`,
            `<div class="cell-padding"><input type="date" class="form-control form-control-sm border-0 ajax-save" data-field="review_on" data-id="${item.id}" value="${reviewDateValue}" placeholder="Select date"></div>`,
            item.department,
            item.status,
            item.status === 'Open' ? 1 : 3,
            hasReviewDate ? 'REVIEW' : 'NO'
        ];
    }

    aggregateByInvolvedDepartment() {
        const deptMap = {};
        
        console.log('[Chart] Aggregating by involved departments...');
        
        this.filteredData.forEach(item => {
            const depts = item.involved_dept_codes || [];
            depts.forEach(dept => {
                if (!deptMap[dept]) {
                    deptMap[dept] = { code: dept, count: 0 };
                }
                deptMap[dept].count++;
            });
        });
        
        const sorted = Object.values(deptMap).sort((a, b) => b.count - a.count);
        
        console.log('[Chart] Aggregated by involved departments:', sorted.map(d => `${d.code}: ${d.count}`).join(', '));
        
        return {
            labels: sorted.map(d => d.code),
            values: sorted.map(d => d.count),
            colors: this.getBackgroundColors(sorted.map(d => d.code), 'department'),
            keys: sorted.map(d => d.code)
        };
    }

    renderInvolvedDeptChart() {
        if (!this.elements.involvedDeptChart) {
            console.warn('[Chart] Involved Dept chart canvas not found - skipping');
            return;
        }
        
        try {
            console.log('[Chart] Rendering Involved Departments chart...');
            const data = this.aggregateByInvolvedDepartment();
            
            if (this.charts.byInvolvedDept) {
                this.charts.byInvolvedDept.destroy();
            }
            
            const ctx = this.elements.involvedDeptChart.getContext('2d');
            const self = this;
            
            this.charts.byInvolvedDept = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: data.colors,
                        borderColor: data.colors.map(c => this.darkenColor(c)),
                        borderWidth: 2,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const dept = data.keys[index];
                            
                            if (this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed) {
                                if (this.activeFilters.involvedDepartment.includes(dept)) {
                                    this.activeFilters.involvedDepartment = this.activeFilters.involvedDepartment.filter(d => d !== dept);
                                } else {
                                    this.activeFilters.involvedDepartment.push(dept);
                                }
                            } else {
                                if (this.activeFilters.involvedDepartment.length === 1 && this.activeFilters.involvedDepartment[0] === dept) {
                                    this.activeFilters.involvedDepartment = [];
                                } else {
                                    this.activeFilters.involvedDepartment = [dept];
                                }
                            }
                            
                            console.log('[Chart] Involved dept:', this.activeFilters.involvedDepartment);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS by Involved Departments (Click: Single | Shift+Click: Multi)' },
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            font: { weight: 'bold', size: 11 },
                            color: '#333',
                            formatter: function(value) {
                                return value > 0 ? value : '';
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
            console.log('[Chart] ✓ Involved chart rendered');
        } catch (error) {
            console.error('[Chart] ❌ Involved error:', error);
            console.error('[Chart] Stack:', error.stack);
        }
    }

    /**
     * ===== UTILITY FUNCTIONS =====
     */
    getBackgroundColors(labels, filterType) {
        const colorMap = {
            'QA': '#0d6efd', 'QC': '#6610f2', 'PD': '#20c997',
            'TT': '#fd7e14', 'PM': '#e83e8c', 'HR': '#17a2b8',
            'SH': '#ffc107', 'FD': '#28a745', 'AM': '#6f42c1',
            'FN': '#e74c3c', 'BD': '#3498db', 'EN': '#1abc9c',
            'WH': '#95a5a6', 'PK': '#f39c12', 'RA': '#c0392b',
            'IT': '#2c3e50', 'SC': '#16a085', 'DA': '#8e44ad',
            'AD': '#27ae60', 'IP': '#2980b9', 'MK': '#e67e22',
            'PP': '#34495e'
        };
        
        return labels.map(label => {
            if (filterType === 'department') {
                return colorMap[label] || '#999';
            }
            return '#0d6efd';
        });
    }

    getBorderColors(labels, filterType) {
        const colors = this.getBackgroundColors(labels, filterType);
        return colors.map(c => this.darkenColor(c));
    }

    generateColors(count) {
        const colors = [
            '#0d6efd', '#6610f2', '#20c997', '#fd7e14', '#e83e8c',
            '#17a2b8', '#ffc107', '#28a745', '#6f42c1', '#e74c3c'
        ];
        
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(colors[i % colors.length]);
        }
        return result;
    }

    darkenColor(color) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 30);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 30);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 30);
        return `rgb(${r}, ${g}, ${b})`;
    }
}

// ===== INITIALIZE ON DOM READY =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Init] DOMContentLoaded - creating QMSCrossFilter instance');
    
    // Use config API URL or fallback
    const apiUrl = (typeof window.QMS_CONFIG !== 'undefined' && window.QMS_CONFIG.apiUrl) 
        ? window.QMS_CONFIG.apiUrl 
        : '/api/qms/';
    
    console.log('[Init] Using API URL:', apiUrl);
    
    window.qmsFilter = new QMSCrossFilter({
        apiUrl: apiUrl
    });
    
    console.log('[Init] Calling init()...');
    await window.qmsFilter.init();
    console.log('[Init] ✓ QMS Filter ready - window.qmsFilter is available');
});
