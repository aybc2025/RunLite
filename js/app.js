/**
 * app.js - RunLite
 * Application Main Controller
 */

const App = (function() {
    'use strict';

    // State
    let currentScreen = 'home';
    let isRunning = false;
    let runStartTime = null;
    let timerInterval = null;
    let currentRunData = null;
    let currentViewingRun = null;
    let units = 'km'; // ברירת מחדל

    /**
     * אתחול אפליקציה
     */
    async function init() {
        console.log('RunLite מתחיל...');

        // טעינת הגדרות
        await loadSettings();

        // הרשמה ל-Service Worker
        registerServiceWorker();

        // בדיקת ריצה לא גמורה
        await checkUnfinishedRun();

        // אתחול Event Listeners
        initEventListeners();

        // הצגת ריצה אחרונה
        await displayLastRun();

        // מעבר למסך הבית
        showScreen('home');

        console.log('RunLite מוכן!');
    }

    /**
     * טעינת הגדרות משתמש
     */
    async function loadSettings() {
        units = Storage.getUnits();
        const highAccuracy = Storage.getHighAccuracy();

        // עדכון UI
        const unitsSelect = document.getElementById('unitsSelect');
        const highAccuracyToggle = document.getElementById('highAccuracyToggle');
        
        if (unitsSelect) unitsSelect.value = units;
        if (highAccuracyToggle) highAccuracyToggle.checked = highAccuracy;
    }

    /**
     * בדיקת ריצה לא גמורה
     */
    async function checkUnfinishedRun() {
        const tempState = await GPS.recoverFromTempState();
        
        if (tempState && tempState.points && tempState.points.length > 10) {
            const shouldContinue = confirm(
                'נמצאה ריצה שלא הסתיימה.\n' +
                `נקודות: ${tempState.points.length}\n` +
                'האם להמשיך ריצה זו?'
            );

            if (shouldContinue) {
                GPS.continueFromState(tempState);
                // TODO: המשך ריצה
                showToast('ריצה שוחזרה בהצלחה');
            } else {
                Storage.clearTempRunState();
            }
        }
    }

    /**
     * הצגת ריצה אחרונה
     */
    async function displayLastRun() {
        const lastRun = await Storage.getLastRun();
        const lastRunInfo = document.getElementById('lastRunInfo');
        const lastRunText = document.getElementById('lastRunText');

        if (lastRun && lastRunInfo && lastRunText) {
            const distance = Compute.formatDistance(lastRun.distance, units);
            const unitLabel = units === 'km' ? 'ק״מ' : 'מייל';
            
            const daysAgo = Math.floor((Date.now() - new Date(lastRun.date).getTime()) / (1000 * 60 * 60 * 24));
            const timeAgo = daysAgo === 0 ? 'היום' : daysAgo === 1 ? 'אתמול' : `לפני ${daysAgo} ימים`;

            lastRunText.textContent = `${distance} ${unitLabel}, ${timeAgo}`;
            lastRunInfo.style.display = 'block';
        }
    }

    /**
     * ניווט בין מסכים
     */
    function showScreen(screenName) {
        // הסתרת כל המסכים
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // הצגת מסך נבחר
        const screen = document.getElementById(screenName + 'Screen');
        if (screen) {
            screen.classList.add('active');
            currentScreen = screenName;

            // פעולות ספציפיות למסך
            onScreenShow(screenName);
        }
    }

    /**
     * פעולות בעת הצגת מסך
     */
    function onScreenShow(screenName) {
        switch(screenName) {
            case 'history':
                loadHistory();
                break;
            case 'settings':
                loadSettings();
                break;
        }
    }

    /**
     * אתחול Event Listeners
     */
    function initEventListeners() {
        // ===== מסך בית =====
        document.getElementById('startRunBtn')?.addEventListener('click', startRun);
        document.getElementById('viewHistoryBtn')?.addEventListener('click', () => showScreen('history'));
        document.getElementById('viewSettingsBtn')?.addEventListener('click', () => showScreen('settings'));
        document.getElementById('startFirstRunBtn')?.addEventListener('click', startRun);

        // ===== מסך ריצה =====
        document.getElementById('stopRunBtn')?.addEventListener('click', stopRun);

        // ===== מסך סיכום =====
        document.getElementById('backFromSummaryBtn')?.addEventListener('click', () => showScreen('home'));
        document.getElementById('saveRunBtn')?.addEventListener('click', saveRun);
        document.getElementById('exportGpxBtn')?.addEventListener('click', exportCurrentRunGPX);

        // ===== מסך היסטוריה =====
        document.getElementById('backFromHistoryBtn')?.addEventListener('click', () => showScreen('home'));

        // ===== מסך פרטים =====
        document.getElementById('backFromDetailBtn')?.addEventListener('click', () => showScreen('history'));
        document.getElementById('deleteRunBtn')?.addEventListener('click', deleteCurrentRun);
        document.getElementById('exportDetailGpxBtn')?.addEventListener('click', exportDetailRunGPX);

        // ===== מסך הגדרות =====
        document.getElementById('backFromSettingsBtn')?.addEventListener('click', () => showScreen('home'));
        document.getElementById('unitsSelect')?.addEventListener('change', handleUnitsChange);
        document.getElementById('highAccuracyToggle')?.addEventListener('change', handleHighAccuracyChange);

        // ===== Modal מחיקה =====
        document.getElementById('cancelDeleteBtn')?.addEventListener('click', hideDeleteModal);
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
    }

    // ==========================================
    // ריצה פעילה
    // ==========================================

    /**
     * התחלת ריצה
     */
    async function startRun() {
        // בדיקת תמיכה ב-GPS
        if (!GPS.isGPSAvailable()) {
            showToast('GPS לא זמין במכשיר זה', 'error');
            return;
        }

        showLoadingSpinner('מתחיל GPS...');

        try {
            // בקשת הרשאות
            await GPS.requestPermission();

            // מעבר למסך ריצה
            showScreen('run');
            hideLoadingSpinner();

            // התחלת מעקב GPS
            const highAccuracy = Storage.getHighAccuracy();
            
            await GPS.startTracking({
                highAccuracy: highAccuracy,
                onLocationUpdate: handleLocationUpdate,
                onGPSStatusChange: handleGPSStatusChange
            });

            // התחלת טיימר
            runStartTime = Date.now();
            isRunning = true;
            startTimer();

            showToast('ריצה החלה!');

        } catch (error) {
            console.error('שגיאה בהתחלת ריצה:', error);
            showToast(error.message || 'שגיאה בהתחלת ריצה', 'error');
            hideLoadingSpinner();
            showScreen('home');
        }
    }

    /**
     * עצירת ריצה
     */
    function stopRun() {
        // אישור
        const confirmed = confirm('האם לסיים את הריצה?');
        if (!confirmed) return;

        // עצירת GPS
        const points = GPS.stopTracking();

        // עצירת טיימר
        stopTimer();
        isRunning = false;

        // בדיקה אם הריצה קצרה מדי
        if (Compute.isTooShort(points)) {
            const shouldSave = confirm(
                'הריצה קצרה מדי (פחות מ-100 מטר או 30 שניות).\n' +
                'האם לשמור בכל זאת?'
            );

            if (!shouldSave) {
                showScreen('home');
                showToast('הריצה לא נשמרה');
                return;
            }
        }

        // חישוב סטטיסטיקות
        showLoadingSpinner('מחשב נתונים...');
        
        setTimeout(() => {
            const stats = Compute.calculateAllStats(points, units);
            
            currentRunData = {
                date: runStartTime,
                duration: stats.duration,
                distance: stats.distance,
                avgPace: stats.avgPace,
                maxSpeed: stats.maxSpeed,
                splits: stats.splits,
                elevation: stats.elevation,
                route: points,
                settings: { units: units }
            };

            // הצגת סיכום
            displayRunSummary(currentRunData);
            hideLoadingSpinner();
            showScreen('summary');
        }, 500);
    }

    /**
     * טיפול בעדכון מיקום
     */
    function handleLocationUpdate(point) {
        // כרגע לא עושים כלום - רק אוספים נקודות
        // בעתיד אפשר להציג מרחק חי
    }

    /**
     * טיפול בשינוי סטטוס GPS
     */
    function handleGPSStatusChange(status, message) {
        const indicator = document.getElementById('gpsIndicator');
        if (!indicator) return;

        indicator.className = 'gps-indicator ' + status;

        const dots = indicator.querySelector('.gps-dots');
        if (dots) {
            switch(status) {
                case 'good':
                    dots.textContent = '●●●';
                    break;
                case 'medium':
                    dots.textContent = '●●○';
                    break;
                case 'poor':
                    dots.textContent = '●○○';
                    break;
                case 'error':
                    dots.textContent = '○○○';
                    if (message) showToast(message, 'warning');
                    break;
            }
        }
    }

    /**
     * התחלת טיימר
     */
    function startTimer() {
        updateTimerDisplay();
        timerInterval = setInterval(updateTimerDisplay, 1000);
    }

    /**
     * עצירת טיימר
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /**
     * עדכון תצוגת טיימר
     */
    function updateTimerDisplay() {
        if (!isRunning || !runStartTime) return;

        const elapsed = Math.floor((Date.now() - runStartTime) / 1000);
        const timerDisplay = document.getElementById('runTimer');
        
        if (timerDisplay) {
            timerDisplay.textContent = Compute.formatTime(elapsed);
        }
    }

    // ==========================================
    // סיכום ריצה
    // ==========================================

    /**
     * הצגת סיכום ריצה
     */
    function displayRunSummary(runData) {
        const unitLabel = units === 'km' ? 'ק״מ' : units === 'mi' ? 'מייל' : '';
        const paceLabel = units === 'km' ? '/ק״מ' : '/מייל';

        // מרחק
        document.getElementById('statDistance').textContent = 
            Compute.formatDistance(runData.distance, units) + ' ' + unitLabel;

        // זמן
        document.getElementById('statTime').textContent = 
            Compute.formatTime(runData.duration);

        // קצב ממוצע
        document.getElementById('statPace').textContent = 
            Compute.formatPace(runData.avgPace) + paceLabel;

        // מהירות שיא
        document.getElementById('statMaxSpeed').textContent = 
            Compute.formatSpeed(runData.maxSpeed, units) + ' ' + (units === 'km' ? 'קמ״ש' : 'mph');

        // עלייה/ירידה
        const elevationEl = document.getElementById('statElevation');
        if (runData.elevation) {
            elevationEl.textContent = 
                `↗${runData.elevation.ascent}מ / ↘${runData.elevation.descent}מ`;
        } else {
            elevationEl.textContent = 'לא זמין';
        }

        // Splits
        displaySplits(runData.splits, 'splitsList');

        // מפה
        if (runData.route && runData.route.length > 0) {
            setTimeout(() => {
                MapManager.createMap('summaryMap', runData.route);
            }, 100);
        }

        // ניקוי שדות
        document.getElementById('runName').value = '';
        document.getElementById('runNotes').value = '';
    }

    /**
     * הצגת splits
     */
    function displaySplits(splits, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (!splits || splits.length === 0) {
            container.innerHTML = '<p style="color: #757575;">אין splits</p>';
            return;
        }

        splits.forEach(split => {
            const unitLabel = split.unit === 'km' ? 'ק״מ' : 'מייל';
            const kmLabel = split.partial 
                ? `${unitLabel} ${split.number} (${split.distance.toFixed(2)} ${unitLabel})`
                : `${unitLabel} ${split.number}`;

            const splitEl = document.createElement('div');
            splitEl.className = 'split-item';
            splitEl.innerHTML = `
                <span class="split-km">${kmLabel}</span>
                <span class="split-time">${Compute.formatTime(split.time)}</span>
                <span class="split-pace">${Compute.formatPace(split.pace)}</span>
            `;
            container.appendChild(splitEl);
        });
    }

    /**
     * שמירת ריצה
     */
    async function saveRun() {
        if (!currentRunData) {
            showToast('אין נתוני ריצה לשמירה', 'error');
            return;
        }

        // קבלת שם והערות
        const name = document.getElementById('runName').value.trim() || null;
        const notes = document.getElementById('runNotes').value.trim() || null;

        // הוספת שם והערות
        currentRunData.name = name;
        currentRunData.notes = notes;

        showLoadingSpinner('שומר ריצה...');

        try {
            await Storage.saveRun(currentRunData);
            hideLoadingSpinner();
            
            showToast('הריצה נשמרה בהצלחה! ✓');
            
            // ניקוי
            currentRunData = null;
            
            // חזרה לבית
            setTimeout(() => {
                showScreen('home');
                displayLastRun();
            }, 1000);

        } catch (error) {
            console.error('שגיאה בשמירת ריצה:', error);
            hideLoadingSpinner();
            showToast('שגיאה בשמירת ריצה', 'error');
        }
    }

    /**
     * ייצוא GPX של ריצה נוכחית
     */
    function exportCurrentRunGPX() {
        if (!currentRunData) {
            showToast('אין נתוני ריצה', 'error');
            return;
        }

        try {
            GPX.downloadGPX(currentRunData);
            showToast('GPX יוצא בהצלחה! ✓');
        } catch (error) {
            console.error('שגיאה בייצוא GPX:', error);
            showToast('שגיאה בייצוא GPX', 'error');
        }
    }

    // ==========================================
    // יומן ריצות
    // ==========================================

    /**
     * טעינת היסטוריה
     */
    async function loadHistory() {
        const runsList = document.getElementById('runsList');
        const emptyHistory = document.getElementById('emptyHistory');

        if (!runsList) return;

        showLoadingSpinner('טוען ריצות...');

        try {
            const runs = await Storage.getAllRuns();
            
            hideLoadingSpinner();

            if (runs.length === 0) {
                runsList.innerHTML = '';
                if (emptyHistory) emptyHistory.style.display = 'block';
                return;
            }

            if (emptyHistory) emptyHistory.style.display = 'none';

            // יצירת כרטיסי ריצות
            runsList.innerHTML = runs.map(run => createRunCard(run)).join('');

            // Event listeners לכרטיסים
            document.querySelectorAll('.run-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('.run-actions-row')) {
                        viewRunDetail(card.dataset.runId);
                    }
                });
            });

            // Event listeners לכפתורי פעולה
            document.querySelectorAll('.view-run-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    viewRunDetail(btn.dataset.runId);
                });
            });

            document.querySelectorAll('.export-run-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const run = await Storage.getRun(btn.dataset.runId);
                    if (run) {
                        GPX.downloadGPX(run);
                        showToast('GPX יוצא בהצלחה! ✓');
                    }
                });
            });

        } catch (error) {
            console.error('שגיאה בטעינת היסטוריה:', error);
            hideLoadingSpinner();
            showToast('שגיאה בטעינת ריצות', 'error');
        }
    }

    /**
     * יצירת כרטיס ריצה
     */
    function createRunCard(run) {
        const date = new Date(run.date);
        const dateStr = date.toLocaleDateString('he-IL', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('he-IL', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const runUnits = run.settings?.units || 'km';
        const unitLabel = runUnits === 'km' ? 'ק״מ' : 'מייל';
        const paceLabel = runUnits === 'km' ? '/ק״מ' : '/מייל';

        const distance = Compute.formatDistance(run.distance, runUnits);
        const time = Compute.formatTime(run.duration);
        const pace = Compute.formatPace(run.avgPace);

        const runName = run.name || 'ריצה ללא שם';

        return `
            <div class="run-card" data-run-id="${run.id}">
                <div class="run-card-header">
                    <span class="run-date">🗓️ ${dateStr} - ${timeStr}</span>
                </div>
                <h3 class="run-name">${runName}</h3>
                <div class="run-stats">
                    <span class="run-stat">🏃 ${distance} ${unitLabel}</span>
                    <span class="run-stat">⏱️ ${time}</span>
                    <span class="run-stat">📈 ${pace}${paceLabel}</span>
                </div>
                <div class="run-actions-row">
                    <button class="btn btn-secondary view-run-btn" data-run-id="${run.id}">
                        👁️ פרטים
                    </button>
                    <button class="btn btn-secondary export-run-btn" data-run-id="${run.id}">
                        📤 GPX
                    </button>
                </div>
            </div>
        `;
    }

    // ==========================================
    // פרטי ריצה
    // ==========================================

    /**
     * צפייה בפרטי ריצה
     */
    async function viewRunDetail(runId) {
        showLoadingSpinner('טוען ריצה...');

        try {
            const run = await Storage.getRun(runId);
            
            if (!run) {
                hideLoadingSpinner();
                showToast('ריצה לא נמצאה', 'error');
                return;
            }

            currentViewingRun = run;
            displayRunDetail(run);
            hideLoadingSpinner();
            showScreen('detail');

        } catch (error) {
            console.error('שגיאה בטעינת פרטי ריצה:', error);
            hideLoadingSpinner();
            showToast('שגיאה בטעינת ריצה', 'error');
        }
    }

    /**
     * הצגת פרטי ריצה
     */
    function displayRunDetail(run) {
        const runUnits = run.settings?.units || 'km';
        const unitLabel = runUnits === 'km' ? 'ק״מ' : 'מייל';
        const paceLabel = runUnits === 'km' ? '/ק״מ' : '/מייל';

        // שם ותאריך
        document.getElementById('detailRunName').textContent = 
            run.name || 'ריצה ללא שם';
        
        const date = new Date(run.date);
        document.getElementById('detailRunDate').textContent = 
            date.toLocaleDateString('he-IL', { 
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

        // סטטיסטיקות
        document.getElementById('detailDistance').textContent = 
            Compute.formatDistance(run.distance, runUnits) + ' ' + unitLabel;
        
        document.getElementById('detailTime').textContent = 
            Compute.formatTime(run.duration);
        
        document.getElementById('detailPace').textContent = 
            Compute.formatPace(run.avgPace) + paceLabel;
        
        document.getElementById('detailMaxSpeed').textContent = 
            Compute.formatSpeed(run.maxSpeed, runUnits) + ' ' + (runUnits === 'km' ? 'קמ״ש' : 'mph');

        // עלייה/ירידה
        const elevationEl = document.getElementById('detailElevation');
        if (run.elevation) {
            elevationEl.textContent = 
                `↗${run.elevation.ascent}מ / ↘${run.elevation.descent}מ`;
        } else {
            elevationEl.textContent = 'לא זמין';
        }

        // Splits
        displaySplits(run.splits, 'detailSplitsList');

        // הערות
        const notesSection = document.getElementById('detailNotes');
        const notesText = document.getElementById('detailNotesText');
        
        if (run.notes) {
            notesText.textContent = run.notes;
            notesSection.style.display = 'block';
        } else {
            notesSection.style.display = 'none';
        }

        // מפה
        if (run.route && run.route.length > 0) {
            setTimeout(() => {
                MapManager.createMap('detailMap', run.route);
            }, 100);
        }
    }

    /**
     * מחיקת ריצה נוכחית
     */
    function deleteCurrentRun() {
        showDeleteModal();
    }

    /**
     * אישור מחיקה
     */
    async function confirmDelete() {
        if (!currentViewingRun) return;

        hideDeleteModal();
        showLoadingSpinner('מוחק ריצה...');

        try {
            await Storage.deleteRun(currentViewingRun.id);
            hideLoadingSpinner();
            
            showToast('הריצה נמחקה');
            currentViewingRun = null;
            
            showScreen('history');

        } catch (error) {
            console.error('שגיאה במחיקת ריצה:', error);
            hideLoadingSpinner();
            showToast('שגיאה במחיקת ריצה', 'error');
        }
    }

    /**
     * ייצוא GPX של ריצה בפרטים
     */
    function exportDetailRunGPX() {
        if (!currentViewingRun) {
            showToast('אין נתוני ריצה', 'error');
            return;
        }

        try {
            GPX.downloadGPX(currentViewingRun);
            showToast('GPX יוצא בהצלחה! ✓');
        } catch (error) {
            console.error('שגיאה בייצוא GPX:', error);
            showToast('שגיאה בייצוא GPX', 'error');
        }
    }

    // ==========================================
    // הגדרות
    // ==========================================

    /**
     * שינוי יחידות
     */
    function handleUnitsChange(e) {
        units = e.target.value;
        Storage.saveUnits(units);
        showToast('יחידות עודכנו');
    }

    /**
     * שינוי דיוק GPS
     */
    function handleHighAccuracyChange(e) {
        const enabled = e.target.checked;
        Storage.saveHighAccuracy(enabled);
        showToast(enabled ? 'דיוק GPS גבוה הופעל' : 'דיוק GPS רגיל הופעל');
    }

    // ==========================================
    // UI Helpers
    // ==========================================

    /**
     * הצגת Toast
     */
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = 'toast show';

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    /**
     * הצגת Loading Spinner
     */
    function showLoadingSpinner(message = 'טוען...') {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            const text = spinner.querySelector('p');
            if (text) text.textContent = message;
            spinner.style.display = 'flex';
        }
    }

    /**
     * הסתרת Loading Spinner
     */
    function hideLoadingSpinner() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

    /**
     * הצגת Modal מחיקה
     */
    function showDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * הסתרת Modal מחיקה
     */
    function hideDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // ==========================================
    // Service Worker
    // ==========================================

    /**
     * רישום Service Worker
     */
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker נרשם בהצלחה:', registration);
                })
                .catch(error => {
                    console.log('רישום Service Worker נכשל:', error);
                });
        }
    }

    // אתחול כאשר ה-DOM מוכן
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ייצוא פונקציות (לדיבאג)
    return {
        showScreen,
        showToast,
        init
    };
})();
