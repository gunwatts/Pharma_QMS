/**
 * QMS Cross-Filter & Analytics Module
 * Powers BI-style filtering with charts and dynamic table updates
 */

class QMSCrossFilter {
    constructor(config = {}) {
        // ===== DATA STORAGE =====
        this.allData = [];
        this.filteredData = [];
        this.reviewBlankOnly = false;
        this.reviewToggleBtn = null;
        this.searchQuery = '';

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

        // ===== CONFIG (Use pre-loaded data from view, not API) =====
        this.config = {
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
            resetBtn: document.getElementById('resetFilters'),
            // Drill controls for Target Date chart
            drillUpBtn: document.getElementById('drillUpBtn'),
            drillDownBtn: document.getElementById('drillDownBtn'),
            targetDateDrillControls: document.getElementById('targetDateDrillControls')
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

            // Update target date drill button visibility
            this.updateTargetDateDrillButtons();

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
     * Fetch all QMS data from pre-loaded view data (NOT from API)
     */
    async fetchData() {
        try {
            // Use pre-filtered data from Django view instead of API
            if (typeof window.QMS_CONFIG !== 'undefined' && window.QMS_CONFIG.qmsData) {
                console.log('[QMS Cross-Filter] Using pre-loaded data from view');
                this.allData = Array.isArray(window.QMS_CONFIG.qmsData) ? window.QMS_CONFIG.qmsData : [];
            } else {
                throw new Error('QMS data not found in window.QMS_CONFIG.qmsData. Make sure qms_list_json is passed from Django view.');
            }

            this.filteredData = [...this.allData];

            console.log(`[QMS Cross-Filter] Loaded ${this.allData.length} QMS records from view`);

            if (this.allData.length === 0) {
                console.warn('[QMS Cross-Filter] Warning: View returned empty data');
            }

            // Log first record structure to verify fields
            if (this.allData.length > 0) {
                console.log('[QMS Cross-Filter] ✓ First record structure:', this.allData[0]);
                console.log('[QMS Cross-Filter] Target date sample:', this.allData[0].target_date);
                console.log('[QMS Cross-Filter] Review on sample:', this.allData[0].review_on);
            }
        } catch (error) {
            console.error('[QMS Cross-Filter] Failed to load data:', error);
            throw error;
        }
    }

    /**
     * Bind event listeners for filters and reset button
     */
    bindEvents() {
        // ===== KEYBOARD STATE TRACKING (for Shift+Click detection) =====
        document.addEventListener('keydown', (e) => {
            const previousState = { ...this.keyboardState };
            if (e.shiftKey) this.keyboardState.shiftPressed = true;
            if (e.ctrlKey || e.metaKey) this.keyboardState.ctrlPressed = true;
            console.log('[DEBUG-Keyboard] keydown event - key:', e.code, '- Shift:', this.keyboardState.shiftPressed, ', Ctrl:', this.keyboardState.ctrlPressed);
            if (JSON.stringify(previousState) !== JSON.stringify(this.keyboardState)) {
                console.log('[DEBUG-Keyboard] ✓ KEY STATE CHANGED TO:', this.keyboardState);
            }
        });

        document.addEventListener('keyup', (e) => {
            const previousState = { ...this.keyboardState };
            this.keyboardState.shiftPressed = false;
            this.keyboardState.ctrlPressed = false;
            console.log('[DEBUG-Keyboard] keyup event - key:', e.code, '- ALL KEYS RELEASED');
            console.log('[DEBUG-Keyboard] State before:', previousState, '- After:', this.keyboardState);
        });

        // Reset button
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => this.resetFilters());
        }

        // Target Date drill controls
        if (this.elements.drillUpBtn) {
            this.elements.drillUpBtn.addEventListener('click', () => this.drillUpTargetDate());
        }
        if (this.elements.drillDownBtn) {
            this.elements.drillDownBtn.addEventListener('click', () => this.drillDownTargetDate());
        }

        // Existing filter UI controls (status buttons, dept filter, etc.)
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleStatusFilterClick(e));
        });

        const deptFilterEl = document.getElementById('deptFilter');
        if (deptFilterEl) {
            deptFilterEl.addEventListener('change', (e) => {
                this.handleDepartmentFilterChange(e);
            });
        }

        const globalSearchEl = document.getElementById('globalSearch');
        if (globalSearchEl) {
            globalSearchEl.addEventListener('keyup', (e) => {
                this.handleGlobalSearch(e);
            });
        }
    }

    /**
     * ===== TIMELINE CALCULATION =====
     */
    getDaysDifference(date) {
        if (!date) return NaN;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const initDate = new Date(date);

        if (isNaN(initDate.getTime())) return NaN;

        return Math.floor((today - initDate) / (1000 * 60 * 60 * 24));
    }

    getAgeRange(days) {
        if (typeof days !== 'number' || isNaN(days)) return null;
        if (days > 365) return '1_year_plus';
        if (days > 180) return '6_months_plus';
        if (days > 90) return '3_months_plus';
        if (days > 60) return '2_months_plus';
        if (days > 30) return '1_month_plus';
        return 'less_1_month';
    }

    /**
     * ===== FILTER APPLICATION =====
     */
    applyFilters() {
        console.log('[DEBUG-Filter] === applyFilters START ===');
        console.log('[DEBUG-Filter] Active filters:', this.activeFilters);
        console.log('[DEBUG-Filter] Search query:', this.searchQuery);

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

            const searchMatch = this.checkSearchFilter(item);

            return deptMatch && statusMatch && typeMatch && ageMatch && targetDateMatch && involvedDeptMatch && searchMatch;
        });

        console.log(`[DEBUG-Filter] RESULT: ${this.filteredData.length} records match from ${this.allData.length} total`);
        console.log('[DEBUG-Filter] === applyFilters COMPLETE ===');
    }

    /**
     * Get filtered data WITH a specific dimension excluded (for cross-filtering aggregations)
     * This allows charts to show all categories with counts from other filter dimensions
     */
    getFilteredDataWithoutDimension(excludeDimension) {
        return this.allData.filter(item => {
            // Apply all filters EXCEPT the excluded dimension

            if (excludeDimension !== 'department') {
                const deptMatch =
                    this.activeFilters.department.length === 0 ||
                    this.activeFilters.department.includes(item.department);
                if (!deptMatch) return false;
            }

            if (excludeDimension !== 'status') {
                const statusMatch = this.checkStatusFilter(item);
                if (!statusMatch) return false;
            }

            if (excludeDimension !== 'type') {
                const typeMatch =
                    this.activeFilters.type.length === 0 ||
                    this.activeFilters.type.includes(item.type);
                if (!typeMatch) return false;
            }

            if (excludeDimension !== 'ageRange') {
                const ageMatch = this.checkAgeFilter(item);
                if (!ageMatch) return false;
            }

            if (excludeDimension !== 'targetMonth') {
                const targetDateMatch = this.checkTargetDateFilter(item);
                if (!targetDateMatch) return false;
            }

            if (excludeDimension !== 'involvedDepartment') {
                const involvedDeptMatch = this.checkInvolvedDeptFilter(item);
                if (!involvedDeptMatch) return false;
            }

            if (!this.checkSearchFilter(item)) return false;

            return true;
        });
    }

    checkSearchFilter(item) {
        if (!this.searchQuery) return true;

        const searchableText = `
            ${item.qms_number || ''}
            ${item.description || ''}
            ${item.background || ''}
            ${item.remarks || ''}
            ${item.department || ''}
            ${item.status || ''}
            ${item.type || ''}
        `.toLowerCase();

        return searchableText.includes(this.searchQuery);
    }

    checkAgeFilter(item) {
        if (this.activeFilters.ageRange.length === 0) return true;

        const days = this.getDaysDifference(item.initiated_date);
        if (isNaN(days)) return false;

        const ageRange = this.getAgeRange(days);
        if (!ageRange) return false;

        return this.activeFilters.ageRange.includes(ageRange);
    }

    checkStatusFilter(item) {
        if (this.activeFilters.status.length === 0) return true;

        // Check each active status filter
        return this.activeFilters.status.some(filterStatus => {
            if (filterStatus === 'Overdue') {
                // Overdue: target_date < today AND status is Open
                if (!item.target_date) return false;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const targetDate = new Date(item.target_date);
                if (isNaN(targetDate.getTime())) return false;

                return targetDate < today && item.status === 'Open';
            } else if (filterStatus === 'Review') {
                // Review: review_on is set AND review_on <= today + 7 days
                if (!item.review_on) return false;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const reviewDate = new Date(item.review_on);
                if (isNaN(reviewDate.getTime())) return false;

                reviewDate.setHours(0, 0, 0, 0);

                const sevenDaysFromNow = new Date(today);
                sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

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
        if (isNaN(date.getTime())) return false;

        const monthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');

        // Support both single selection (string) and multi-selection (array)
        if (Array.isArray(this.activeFilters.targetMonth)) {
            return this.activeFilters.targetMonth.includes(monthKey);
        }

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
        this.searchQuery = (e.target.value || '').trim().toLowerCase();
        this.applyFilters();
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
                console.log('[DEBUG-Render] === renderCharts START ===');
                console.log('[DEBUG-Render] Rendering all 6 charts...');
                console.log('[DEBUG-Render] activeFilters.department:', this.activeFilters.department);
                console.log('[DEBUG-Render] filteredData count:', this.filteredData.length);

                console.log('[DEBUG-Render] Rendering Department chart...');
                this.renderDepartmentChart();

                console.log('[DEBUG-Render] Rendering Type chart...');
                this.renderTypeChart();

                console.log('[DEBUG-Render] Rendering Status chart...');
                this.renderStatusChart();

                console.log('[DEBUG-Render] Rendering Timeline chart...');
                this.renderTimelineChart();

                console.log('[DEBUG-Render] Rendering Target Date chart...');
                this.renderTargetDateChart();

                console.log('[DEBUG-Render] Rendering Involved Department chart...');
                this.renderInvolvedDeptChart();

                console.log('[Chart Render] ✓ All 6 charts rendered successfully');
                console.log('[DEBUG-Render] === renderCharts COMPLETE ===');
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
            console.log('[DEBUG-Chart] === renderDepartmentChart START ===');
            console.log('[Chart] Rendering Department chart...');
            const data = this.aggregateByDepartment();
            console.log('[DEBUG-Chart] aggregated data:', data);

            if (this.charts.byDepartment) {
                this.charts.byDepartment.destroy();
            }

            const ctx = this.elements.deptChart.getContext('2d');
            console.log('[DEBUG-Chart] Canvas context:', ctx ? 'OK' : 'NULL');

            // Get colors with visual selection feedback (Power BI style)
            console.log('[DEBUG-Chart] activeFilters.department:', this.activeFilters.department);
            const displayColors = this.getColorsWithSelection(data.labels, this.activeFilters.department, 'department');
            console.log('[DEBUG-Chart] displayColors returned:', displayColors);

            this.charts.byDepartment = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: displayColors,
                        borderColor: this.getBorderColors(data.labels, 'department'),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        console.log('[DEBUG-Click] === Department onClick triggered ===');
                        console.log('[DEBUG-Click] event object:', event);
                        console.log('[DEBUG-Click] event.native:', event?.native);
                        console.log('[DEBUG-Click] event.native.shiftKey:', event?.native?.shiftKey);
                        console.log('[DEBUG-Click] event.native.ctrlKey:', event?.native?.ctrlKey);
                        console.log('[DEBUG-Click] keyboardState:', this.keyboardState);
                        console.log('[DEBUG-Click] elements:', elements);

                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const department = data.labels[index];
                            console.log('[DEBUG-Click] Clicked bar index:', index, ', department:', department);

                            // Check shift/ctrl from the NATIVE browser event (Chart.js wraps it in event.native)
                            const isMultiSelect = ((event?.native?.shiftKey || event?.native?.ctrlKey) ||
                                (event && (event.shiftKey || event.ctrlKey))) ||
                                this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed;

                            console.log('[DEBUG-Click] isMultiSelect:', isMultiSelect);
                            console.log('[DEBUG-Click] Current activeFilters.department BEFORE:', this.activeFilters.department);

                            if (isMultiSelect) {
                                // Multi-select toggle (Power BI style)
                                console.log('[DEBUG-Click] MULTI-SELECT MODE');
                                if (this.activeFilters.department.includes(department)) {
                                    console.log('[DEBUG-Click] Removing:', department);
                                    this.activeFilters.department = this.activeFilters.department.filter(d => d !== department);
                                } else {
                                    console.log('[DEBUG-Click] Adding:', department);
                                    this.activeFilters.department.push(department);
                                }
                            } else {
                                // Single select
                                console.log('[DEBUG-Click] SINGLE-SELECT MODE');
                                if (this.activeFilters.department.length === 1 && this.activeFilters.department[0] === department) {
                                    console.log('[DEBUG-Click] Clearing selection');
                                    this.activeFilters.department = [];
                                } else {
                                    console.log('[DEBUG-Click] Setting single selection:', department);
                                    this.activeFilters.department = [department];
                                }
                            }

                            console.log('[DEBUG-Click] activeFilters.department AFTER:', this.activeFilters.department);
                            console.log('[DEBUG-Click] Calling applyFilters()...');
                            this.applyFilters();
                            console.log('[DEBUG-Click] Calling updateUI()...');
                            this.updateUI();
                            console.log('[DEBUG-Click] === Department onClick COMPLETE ===');
                        } else {
                            console.log('[DEBUG-Click] No elements found');
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS by Department (Click: Single | Shift+Click: Multi-Select)' },
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
            console.log('[DEBUG-Chart] Chart object created:', this.charts.byDepartment ? 'EXISTS' : 'NULL');
            console.log('[DEBUG-Chart] Chart canvas element:', this.elements.deptChart);
            console.log('[DEBUG-Chart] Chart.data.datasets[0].backgroundColor === displayColors?',
                JSON.stringify(this.charts.byDepartment.data.datasets[0].backgroundColor) === JSON.stringify(displayColors));
            console.log('[Chart] ✓ Department chart rendered');
            console.log('[DEBUG-Chart] === renderDepartmentChart END ===');
        } catch (error) {
            console.error('[Chart] ❌ Department chart error:', error);
            console.error('[DEBUG-Chart] Stack trace:', error.stack);
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

            // Get colors with visual selection feedback
            const displayColors = data.labels.map((label, index) => {
                const isSelected = this.activeFilters.type.length === 0 || this.activeFilters.type.includes(label);
                const baseColor = data.colors[index];
                return isSelected ? baseColor : this.fadeColor(baseColor, 0.3);
            });

            this.charts.byType = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: displayColors,
                        borderColor: data.colors.map(c => this.darkenColor(c)),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    indexAxis: undefined,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const type = data.labels[index];

                            // Check shift/ctrl from the NATIVE browser event (Chart.js wraps it in event.native)
                            const isMultiSelect = ((event?.native?.shiftKey || event?.native?.ctrlKey) ||
                                (event && (event.shiftKey || event.ctrlKey))) ||
                                this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed;

                            if (isMultiSelect) {
                                if (this.activeFilters.type.includes(type)) {
                                    this.activeFilters.type = this.activeFilters.type.filter(t => t !== type);
                                } else {
                                    this.activeFilters.type.push(type);
                                }
                            } else {
                                if (this.activeFilters.type.length === 1 && this.activeFilters.type[0] === type) {
                                    this.activeFilters.type = [];
                                } else {
                                    this.activeFilters.type = [type];
                                }
                            }

                            console.log('[Chart] Type selected:', this.activeFilters.type);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'QMS by Type (Click: Single | Shift+Click: Multi-Select)' },
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

            // Get colors with visual selection feedback
            const displayColors = data.labels.map((label, index) => {
                const isSelected = this.activeFilters.status.length === 0 || this.activeFilters.status.includes(label);
                const baseColor = data.colors[index];
                return isSelected ? baseColor : this.fadeColor(baseColor, 0.3);
            });

            this.charts.byStatus = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Count',
                        data: data.values,
                        backgroundColor: displayColors
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const status = data.labels[index];

                            // Check shift/ctrl from the NATIVE browser event (Chart.js wraps it in event.native)
                            const isMultiSelect = ((event?.native?.shiftKey || event?.native?.ctrlKey) ||
                                (event && (event.shiftKey || event.ctrlKey))) ||
                                this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed;

                            if (isMultiSelect) {
                                if (this.activeFilters.status.includes(status)) {
                                    this.activeFilters.status = this.activeFilters.status.filter(s => s !== status);
                                } else {
                                    this.activeFilters.status.push(status);
                                }
                            } else {
                                if (this.activeFilters.status.length === 1 && this.activeFilters.status[0] === status) {
                                    this.activeFilters.status = [];
                                } else {
                                    this.activeFilters.status = [status];
                                }
                            }

                            console.log('[Chart] Status selected:', this.activeFilters.status);
                            this.applyFilters();
                            this.updateUI();
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'bottom' },
                        title: { display: true, text: 'QMS by Status (Click: Single | Shift+Click: Multi-Select)' },
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

            // Get colors with visual selection feedback
            const displayColors = data.ageRanges.map((ageRange) => {
                const isSelected = this.activeFilters.ageRange.length === 0 || this.activeFilters.ageRange.includes(ageRange);
                const baseColor = '#ff7300';
                return isSelected ? baseColor : this.fadeColor(baseColor, 0.3);
            });

            this.charts.byTimeline = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: displayColors,
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

                            // Check shift/ctrl from the NATIVE browser event (Chart.js wraps it in event.native)
                            const isMultiSelect = ((event?.native?.shiftKey || event?.native?.ctrlKey) ||
                                (event && (event.shiftKey || event.ctrlKey))) ||
                                this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed;

                            if (isMultiSelect) {
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
                        title: { display: true, text: 'QMS Aging Timeline (Click: Single | Shift+Click: Multi-Select)' },
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
            let chartTitle = 'QMS Target Dates by Year';

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
                chartTitle = 'Months in ' + this.chartState.selectedYear;
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

            // Apply visual selection feedback for Target Date chart
            const displayColors = chartColors.map((color, index) => {
                // For months view, highlight selected months (support both single and multi-select)
                if (this.chartState.targetDateMode === 'months' && this.activeFilters.targetMonth) {
                    const monthKey = drillDownData[index];
                    let isSelected = false;

                    if (Array.isArray(this.activeFilters.targetMonth)) {
                        isSelected = this.activeFilters.targetMonth.includes(monthKey);
                    } else {
                        isSelected = monthKey === this.activeFilters.targetMonth;
                    }

                    return isSelected ? color : this.fadeColor(color, 0.3);
                }
                // For years view, show all normally (no selection highlighting for drill-down)
                return color;
            });

            this.charts.byTargetDate = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'QMS Count',
                        data: chartValues,
                        backgroundColor: displayColors,
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
                        // Check if Ctrl key is pressed for drill-up (Chart.js wraps native event in event.native)
                        const isCtrlClick = ((event?.native?.ctrlKey) || (event && event.ctrlKey)) || this.keyboardState.ctrlPressed;
                        // Check if Shift key is pressed for multi-select
                        const isShiftClick = ((event?.native?.shiftKey) || (event && event.shiftKey)) || this.keyboardState.shiftPressed;

                        if (isCtrlClick && this.chartState.targetDateMode === 'months') {
                            // Drill up from months to years (using Ctrl+Click)
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
                                // Multi-select months with Shift+Click or single-select
                                const monthKey = drillValue;
                                console.log('[Chart] Month filter - isShiftClick:', isShiftClick, 'monthKey:', monthKey);

                                if (isShiftClick) {
                                    // Multi-select: toggle month in selection
                                    if (Array.isArray(this.activeFilters.targetMonth) && this.activeFilters.targetMonth.includes(monthKey)) {
                                        // Remove from selection
                                        this.activeFilters.targetMonth = this.activeFilters.targetMonth.filter(m => m !== monthKey);
                                    } else {
                                        // Add to selection
                                        if (!Array.isArray(this.activeFilters.targetMonth)) {
                                            this.activeFilters.targetMonth = this.activeFilters.targetMonth ? [this.activeFilters.targetMonth] : [];
                                        }
                                        this.activeFilters.targetMonth.push(monthKey);
                                    }
                                    console.log('[Chart] Multi-selected months:', this.activeFilters.targetMonth);
                                } else {
                                    // Single select: replace selection
                                    this.activeFilters.targetMonth = monthKey;
                                    console.log('[Chart] Single selected month:', monthKey);
                                }

                                this.applyFilters();
                                this.updateUI();
                            }
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: chartTitle, font: { size: 13, weight: 'bold' } },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            padding: 8,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + context.parsed.y;
                                }
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

            // Update drill button visibility
            this.updateTargetDateDrillButtons();
        } catch (error) {
            console.error('[Chart] Target Date chart error:', error);
            console.error('[Chart] Stack:', error.stack);
        }
    }

    /**
     * ===== DATA AGGREGATION =====
     */
    aggregateByDepartment() {
        console.log('[DEBUG-Aggregate] === aggregateByDepartment START (Power BI Cross-Filter) ===');

        // Get data filtered by ALL OTHER dimensions (excluding department)
        const crossFilteredData = this.getFilteredDataWithoutDimension('department');
        console.log('[DEBUG-Aggregate] Cross-filtered data count:', crossFilteredData.length);

        // Get all possible departments from allData
        const allDepts = {};
        this.allData.forEach(item => {
            allDepts[item.department] = 0;  // Initialize with 0
        });

        // Count records by department from cross-filtered data
        crossFilteredData.forEach(item => {
            allDepts[item.department] = (allDepts[item.department] || 0) + 1;
        });

        console.log('[DEBUG-Aggregate] Department counts:', allDepts);

        const labels = Object.keys(allDepts).sort();
        const values = labels.map(k => allDepts[k]);

        console.log('[DEBUG-Aggregate] === aggregateByDepartment END ===');
        return { labels, values };
    }

    aggregateByType() {
        console.log('[DEBUG-Aggregate] === aggregateByType START (Power BI Cross-Filter) ===');

        // Get data filtered by ALL OTHER dimensions (excluding type)
        const crossFilteredData = this.getFilteredDataWithoutDimension('type');
        console.log('[DEBUG-Aggregate] Cross-filtered data count:', crossFilteredData.length);

        // Get all possible types from allData
        const allTypes = {};
        this.allData.forEach(item => {
            allTypes[item.type] = 0;  // Initialize with 0
        });

        // Count records by type from cross-filtered data
        crossFilteredData.forEach(item => {
            allTypes[item.type] = (allTypes[item.type] || 0) + 1;
        });

        console.log('[DEBUG-Aggregate] Type counts:', allTypes);

        const labels = Object.keys(allTypes).sort();
        const values = labels.map(k => allTypes[k]);
        const colors = this.generateColors(labels.length);

        console.log('[DEBUG-Aggregate] === aggregateByType END ===');
        return { labels, values, colors };
    }

    aggregateByStatus() {
        console.log('[DEBUG-Aggregate] === aggregateByStatus START (Power BI Cross-Filter) ===');

        // Get data filtered by ALL OTHER dimensions (excluding status)
        const crossFilteredData = this.getFilteredDataWithoutDimension('status');
        console.log('[DEBUG-Aggregate] Cross-filtered data count:', crossFilteredData.length);

        // Get all possible statuses from allData
        const allStatuses = {};
        this.allData.forEach(item => {
            allStatuses[item.status] = 0;  // Initialize with 0
        });

        // Count records by status from cross-filtered data
        crossFilteredData.forEach(item => {
            allStatuses[item.status] = (allStatuses[item.status] || 0) + 1;
        });

        console.log('[DEBUG-Aggregate] Status counts:', allStatuses);

        const labels = Object.keys(allStatuses).sort();
        const values = labels.map(k => allStatuses[k]);
        const colorMap = { 'Open': '#0d6efd', 'CFT': '#20c997', 'EM': '#6610f2', 'Closed': '#6c757d' };
        const colors = labels.map(l => colorMap[l] || '#999');

        console.log('[DEBUG-Aggregate] === aggregateByStatus END ===');
        return { labels, values, colors };
    }

    aggregateByTimeline() {
        console.log('[DEBUG-Aggregate] === aggregateByTimeline START (Power BI Cross-Filter) ===');

        const crossFilteredData = this.getFilteredDataWithoutDimension('ageRange');
        console.log('[DEBUG-Aggregate] Cross-filtered data count:', crossFilteredData.length);

        const buckets = {
            'less_1_month': 0,
            '1_month_plus': 0,
            '2_months_plus': 0,
            '3_months_plus': 0,
            '6_months_plus': 0,
            '1_year_plus': 0
        };

        crossFilteredData.forEach(item => {
            if (!item.initiated_date) return;

            const days = this.getDaysDifference(item.initiated_date);
            const bucket = this.getAgeRange(days);

            if (bucket && buckets.hasOwnProperty(bucket)) {
                buckets[bucket]++;
            }
        });

        const labelMap = {
            'less_1_month': '< 1 Month',
            '1_month_plus': '1-2 Months',
            '2_months_plus': '2-3 Months',
            '3_months_plus': '3-6 Months',
            '6_months_plus': '6-12 Months',
            '1_year_plus': '> 1 Year'
        };

        const ageRanges = [
            'less_1_month',
            '1_month_plus',
            '2_months_plus',
            '3_months_plus',
            '6_months_plus',
            '1_year_plus'
        ];

        const labels = ageRanges.map(k => labelMap[k]);
        const values = ageRanges.map(k => buckets[k]);

        return { labels, values, ageRanges };
    }

    aggregateByTargetDateHierarchy() {
        const yearMap = {};
        let itemsWithTargetDate = 0;

        console.log('[Chart] Aggregating target dates by year and month (Power BI Cross-Filter)...');

        // Get data filtered by ALL OTHER dimensions (excluding targetMonth)
        const crossFilteredData = this.getFilteredDataWithoutDimension('targetMonth');
        console.log('[Chart] Cross-filtered data count for target dates:', crossFilteredData.length);

        // Count records by target date from cross-filtered data
        crossFilteredData.forEach(item => {
            if (!item.target_date) return;

            const date = new Date(item.target_date);
            if (isNaN(date.getTime())) {
                console.warn('[Chart] Invalid date for item', item.id, ':', item.target_date);
                return;
            }

            itemsWithTargetDate++;

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
        console.log('  - Total all records:', this.allData.length);
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
            this.activeFilters.department = [dept];
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
            this.activeFilters.status = [status];
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
        console.log('[DEBUG-UI] === updateUI called ===');
        console.log('[DEBUG-UI] Calling renderCharts()...');
        this.renderCharts();
        console.log('[DEBUG-UI] Calling updateTableFromFilters()...');
        this.updateTableFromFilters();
        console.log('[DEBUG-UI] Calling updateFilterIndicators()...');
        this.updateFilterIndicators();
        console.log('[DEBUG-UI] === updateUI COMPLETE ===');
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

        this.searchQuery = '';

        // Also reset target date drill state
        if (this.chartState) {
            this.chartState.targetDateMode = 'years';
            this.chartState.selectedYear = null;
        }

        this.applyFilters();
        this.updateUI();

        // Reset form inputs
        const searchEl = document.getElementById('globalSearch');
        if (searchEl) searchEl.value = '';

        const deptEl = document.getElementById('deptFilter');
        if (deptEl) deptEl.value = '';

        console.log('[QMS Cross-Filter] All filters reset');
    }

    /**
     * Drill down in Target Date chart (Years → Months)
     */
    drillDownTargetDate() {
        if (this.chartState && this.chartState.targetDateMode === 'years') {
            // Find first year with data
            if (this.chartState.hierarchy && this.chartState.hierarchy.years.length > 0) {
                this.chartState.selectedYear = this.chartState.hierarchy.years[0];
                this.chartState.targetDateMode = 'months';
                console.log('[Chart] Drill down to:', this.chartState.selectedYear);
                this.renderTargetDateChart();
            }
        }
    }

    /**
     * Drill up in Target Date chart (Months → Years)
     */
    drillUpTargetDate() {
        if (this.chartState && this.chartState.targetDateMode === 'months') {
            this.chartState.targetDateMode = 'years';
            this.chartState.selectedYear = null;
            console.log('[Chart] Drill up to years view');
            this.renderTargetDateChart();
        }
    }

    /**
     * Update Target Date drill button visibility
     */
    updateTargetDateDrillButtons() {
        if (!this.elements.drillUpBtn || !this.elements.drillDownBtn) return;

        if (this.chartState && this.chartState.targetDateMode === 'months') {
            this.elements.drillUpBtn.style.display = 'inline-block';
            this.elements.drillDownBtn.style.display = 'none';
        } else {
            this.elements.drillUpBtn.style.display = 'none';
            this.elements.drillDownBtn.style.display = 'inline-block';
        }
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
            const isDataTable = !!(window.jQuery && jQuery.fn && jQuery.fn.dataTable && jQuery.fn.dataTable.isDataTable(this.elements.table));
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
            table.clear();
            console.log('[Table] ✓ Table cleared');

            // Apply review blank toggle after normal filtering
            const rowsToShow = this.reviewBlankOnly
                ? this.filteredData.filter(item => !item.review_on || String(item.review_on).trim() === '')
                : this.filteredData;

            console.log('[Table] Adding', rowsToShow.length, 'rows to table...');
            let rowsAdded = 0;
            let rowsErrored = 0;

            rowsToShow.forEach((item) => {
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

            table.draw();
            console.log('[Table] ✓ Table redrawn');
            console.log('[Table] ✓ Table update complete - showing', rowsAdded, 'records');

            this.bindTableHandlers();
        } catch (error) {
            console.error('[Table] ❌ Error updating table:', error);
            console.error('[Table] Stack:', error.stack);
        }

        this.createReviewOnToggleButton();
    }

    bindTableHandlers() {
        // This will be called from template's bindAjaxSaveHandlers
        console.log('[Table] Handlers rebinding after data update');
    }

    createTableRow(item) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);  // remove time

        let targetDate = null;
        if (item.target_date) {
            const parsedTarget = new Date(item.target_date);
            if (!isNaN(parsedTarget.getTime())) {
                targetDate = parsedTarget;
            }
        }

        const isOverdue = targetDate ? (targetDate < today && item.status === 'Open') : false;
        const overdueClass = isOverdue ? 'overdue-text' : '';

        // Format review_on date for input field (YYYY-MM-DD)
        let reviewDateValue = '';
        let hasReviewDate = false;
        if (item.review_on) {
            const reviewDate = new Date(item.review_on);
            if (!isNaN(reviewDate.getTime())) {
                reviewDateValue = reviewDate.toISOString().split('T')[0];
                hasReviewDate = true;
            }
        }

        // Get the detail URL from config if available
        const detailUrl = (typeof window.QMS_CONFIG !== 'undefined' && window.QMS_CONFIG.detailUrl)
            ? window.QMS_CONFIG.detailUrl(item.id)
            : `/qms/${item.id}/`;

        console.log('[Table] Row', item.id, 'review_on:', item.review_on, '-> formatted:', reviewDateValue);

        return [
            `<div class="cell-padding"><a href="${detailUrl}">${item.qms_number || ''}</a></div>`,
            `<div class="cell-padding">${item.description || ''}</div>`,
            `<div class="cell-padding">${item.background || ''}</div>`,
            `<div class="remarks-container"><textarea class="remarks-area ajax-save" data-field="remarks" data-id="${item.id}">${item.remarks || ''}</textarea></div>`,
            `<div class="cell-padding"><span class="date-val ${overdueClass}" data-date="${item.target_date || ''}">${item.target_date && targetDate ? targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase() : ''}</span></div>`,
            `<div class="cell-padding"><input type="date" class="form-control form-control-sm border-0 ajax-save" data-field="review_on" data-id="${item.id}" value="${reviewDateValue}" placeholder="Select date"></div>`,
            item.department || '',
            item.status || '',
            item.status === 'Open' ? 1 : 3,
            hasReviewDate ? 'REVIEW' : 'NO'
        ];
    }

    aggregateByInvolvedDepartment() {
        const deptMap = {};

        console.log('[Chart] Aggregating by involved departments (Power BI Cross-Filter)...');

        // Get data filtered by ALL OTHER dimensions (excluding involvedDepartment)
        const crossFilteredData = this.getFilteredDataWithoutDimension('involvedDepartment');
        console.log('[Chart] Cross-filtered data count for involved depts:', crossFilteredData.length);

        crossFilteredData.forEach(item => {
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

            // Get colors with visual selection feedback
            const displayColors = data.labels.map((label, index) => {
                const isSelected = this.activeFilters.involvedDepartment.length === 0 || this.activeFilters.involvedDepartment.includes(data.keys[index]);
                const baseColor = data.colors[index];
                return isSelected ? baseColor : this.fadeColor(baseColor, 0.3);
            });

            this.charts.byInvolvedDept = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'QMS Count',
                        data: data.values,
                        backgroundColor: displayColors,
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

                            // Check shift/ctrl from the NATIVE browser event (Chart.js wraps it in event.native)
                            const isMultiSelect = ((event?.native?.shiftKey || event?.native?.ctrlKey) ||
                                (event && (event.shiftKey || event.ctrlKey))) ||
                                this.keyboardState.shiftPressed || this.keyboardState.ctrlPressed;

                            if (isMultiSelect) {
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
                        title: { display: true, text: 'QMS by Involved Departments (Click: Single | Shift+Click: Multi-Select)' },
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

    /**
     * Get colors with visual feedback (highlight selected, fade unselected)
     * This implements Power BI-style visual filtering
     */
    getColorsWithSelection(labels, activeSelections, filterType) {
        try {
            console.log('[DEBUG-Selection] === getColorsWithSelection called ===');
            console.log('[DEBUG-Selection] filterType:', filterType);
            console.log('[DEBUG-Selection] labels:', labels);
            console.log('[DEBUG-Selection] activeSelections:', activeSelections);

            const baseColors = this.getBackgroundColors(labels, filterType);
            console.log('[DEBUG-Selection] baseColors:', baseColors);

            // If nothing is selected, show all colors normally
            if (activeSelections.length === 0) {
                console.log('[DEBUG-Selection] No active selections - returning base colors');
                return baseColors;
            }

            // Otherwise, highlight selected and fade unselected
            const displayColors = baseColors.map((color, index) => {
                const label = labels[index];
                const isSelected = activeSelections.includes(label);

                console.log('[DEBUG-Selection] Index', index, '- Label:', label, '- isSelected:', isSelected, '- baseColor:', color);

                if (isSelected) {
                    console.log('[DEBUG-Selection] ✓ SELECTED:', label, '- returning full color');
                    return color;
                } else {
                    const faded = this.fadeColor(color, 0.3);
                    console.log('[DEBUG-Selection] ✗ FADED:', label, '- from', color, 'to', faded);
                    return faded;
                }
            });

            console.log('[DEBUG-Selection] Final displayColors:', displayColors);
            return displayColors;
        } catch (error) {
            console.error('[DEBUG-Selection] ERROR:', error);
            console.error('[DEBUG-Selection] Stack:', error.stack);
            return this.getBackgroundColors(labels, filterType);
        }
    }

    /**
     * Fade a color by reducing opacity
     */
    fadeColor(color, opacity) {
        try {
            console.log('[DEBUG-Color] fadeColor called - color:', color, 'opacity:', opacity);
            const rgb = this.hexToRgb(color);
            console.log('[DEBUG-Color] RGB result:', rgb);
            const faded = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
            console.log('[DEBUG-Color] Faded result:', faded);
            return faded;
        } catch (error) {
            console.error('[DEBUG-Color] ERROR in fadeColor:', color, error);
            return 'rgba(0, 0, 0, 0.3)';
        }
    }

    /**
     * Convert hex color to RGB
     */
    hexToRgb(hex) {
        try {
            console.log('[DEBUG-Color] hexToRgb called - hex:', hex);
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) {
                console.warn('[DEBUG-Color] ⚠️ INVALID HEX FORMAT:', hex);
                return { r: 0, g: 0, b: 0 };
            }
            const rgb = {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            };
            console.log('[DEBUG-Color] Conversion result:', rgb);
            return rgb;
        } catch (error) {
            console.error('[DEBUG-Color] ERROR in hexToRgb:', hex, error);
            return { r: 0, g: 0, b: 0 };
        }
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
        const hex = String(color || '#000000').replace('#', '');
        const safeHex = hex.length === 6 ? hex : '000000';
        const r = Math.max(0, parseInt(safeHex.substr(0, 2), 16) - 30);
        const g = Math.max(0, parseInt(safeHex.substr(2, 2), 16) - 30);
        const b = Math.max(0, parseInt(safeHex.substr(4, 2), 16) - 30);
        return `rgb(${r}, ${g}, ${b})`;
    }

    createReviewOnToggleButton() {
        const table = document.getElementById('qmsTable');
        if (!table || !table.tHead || !table.tHead.rows.length) return;

        const headerRow = table.tHead.rows[0];
        const cells = headerRow.cells;

        let reviewCell = null;

        for (let i = 0; i < cells.length; i++) {
            const text = (cells[i].textContent || cells[i].innerText || '').trim().toLowerCase();
            if (text.includes('review')) {
                reviewCell = cells[i];
                break;
            }
        }

        if (!reviewCell) {
            console.warn('[Review Toggle] Review header not found');
            return;
        }

        if (this.reviewToggleBtn && document.contains(this.reviewToggleBtn)) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-primary';
        btn.textContent = 'Blank Only: OFF';
        btn.style.marginTop = '4px';
        btn.style.fontSize = '11px';
        btn.style.padding = '2px 8px';
        btn.style.display = 'block';

        btn.addEventListener('click', () => {
            this.reviewBlankOnly = !this.reviewBlankOnly;
            btn.textContent = this.reviewBlankOnly ? 'Blank Only: ON' : 'Blank Only: OFF';
            this.updateTableFromFilters();
        });

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '4px';

        const title = document.createElement('div');
        title.textContent = reviewCell.textContent.trim();
        title.style.fontWeight = '600';

        reviewCell.textContent = '';
        wrapper.appendChild(title);
        wrapper.appendChild(btn);
        reviewCell.appendChild(wrapper);

        this.reviewToggleBtn = btn;
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