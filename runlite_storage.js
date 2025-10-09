/**
 * storage.js - RunLite
 * ניהול אחסון מקומי עם IndexedDB ו-localStorage
 */

const Storage = (function() {
    'use strict';

    const DB_NAME = 'RunLiteDB';
    const DB_VERSION = 1;
    const STORE_RUNS = 'runs';
    const STORE_SETTINGS = 'settings';
    
    let db = null;

    /**
     * אתחול מסד הנתונים
     */
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('שגיאה בפתיחת IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('IndexedDB נפתח בהצלחה');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // יצירת object store לריצות
                if (!db.objectStoreNames.contains(STORE_RUNS)) {
                    const runsStore = db.createObjectStore(STORE_RUNS, { 
                        keyPath: 'id', 
                        autoIncrement: false 
                    });
                    runsStore.createIndex('date', 'date', { unique: false });
                    console.log('Object store לריצות נוצר');
                }

                // יצירת object store להגדרות (לעתיד - כרגע נשתמש ב-localStorage)
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                    console.log('Object store להגדרות נוצר');
                }
            };
        });
    }

    /**
     * שמירת ריצה חדשה
     */
    async function saveRun(runData) {
        if (!db) {
            await initDB();
        }

        return new Promise((resolve, reject) => {
            // הוספת ID ייחודי אם אין
            if (!runData.id) {
                runData.id = 'run_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }

            const transaction = db.transaction([STORE_RUNS], 'readwrite');
            const store = transaction.objectStore(STORE_RUNS);
            const request = store.add(runData);

            request.onsuccess = () => {
                console.log('ריצה נשמרה בהצלחה:', runData.id);
                resolve(runData.id);
            };

            request.onerror = () => {
                console.error('שגיאה בשמירת ריצה:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * קבלת כל הריצות (ממוינות לפי תאריך - מהחדש לישן)
     */
    async function getAllRuns() {
        if (!db) {
            await initDB();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RUNS], 'readonly');
            const store = transaction.objectStore(STORE_RUNS);
            const request = store.getAll();

            request.onsuccess = () => {
                const runs = request.result;
                // מיון לפי תאריך - מהחדש לישן
                runs.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(runs);
            };

            request.onerror = () => {
                console.error('שגיאה בקריאת ריצות:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * קבלת ריצה בודדת לפי ID
     */
    async function getRun(runId) {
        if (!db) {
            await initDB();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RUNS], 'readonly');
            const store = transaction.objectStore(STORE_RUNS);
            const request = store.get(runId);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('שגיאה בקריאת ריצה:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * מחיקת ריצה
     */
    async function deleteRun(runId) {
        if (!db) {
            await initDB();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RUNS], 'readwrite');
            const store = transaction.objectStore(STORE_RUNS);
            const request = store.delete(runId);

            request.onsuccess = () => {
                console.log('ריצה נמחקה בהצלחה:', runId);
                resolve();
            };

            request.onerror = () => {
                console.error('שגיאה במחיקת ריצה:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * קבלת הריצה האחרונה
     */
    async function getLastRun() {
        const runs = await getAllRuns();
        return runs.length > 0 ? runs[0] : null;
    }

    /**
     * ============================================
     * localStorage - הגדרות משתמש
     * ============================================
     */

    /**
     * שמירת הגדרת יחידות
     */
    function saveUnits(units) {
        try {
            localStorage.setItem('runlite_units', units);
            return true;
        } catch (e) {
            console.error('שגיאה בשמירת יחידות:', e);
            return false;
        }
    }

    /**
     * קבלת הגדרת יחידות
     */
    function getUnits() {
        try {
            return localStorage.getItem('runlite_units') || 'km';
        } catch (e) {
            console.error('שגיאה בקריאת יחידות:', e);
            return 'km';
        }
    }

    /**
     * שמירת הגדרת דיוק GPS
     */
    function saveHighAccuracy(enabled) {
        try {
            localStorage.setItem('runlite_high_accuracy', enabled ? 'true' : 'false');
            return true;
        } catch (e) {
            console.error('שגיאה בשמירת הגדרת GPS:', e);
            return false;
        }
    }

    /**
     * קבלת הגדרת דיוק GPS
     */
    function getHighAccuracy() {
        try {
            const value = localStorage.getItem('runlite_high_accuracy');
            return value === null ? true : value === 'true';
        } catch (e) {
            console.error('שגיאה בקריאת הגדרת GPS:', e);
            return true;
        }
    }

    /**
     * שמירת מצב ריצה זמני (למקרה של כיבוי לא צפוי)
     */
    function saveTempRunState(runState) {
        try {
            localStorage.setItem('runlite_temp_run', JSON.stringify(runState));
            return true;
        } catch (e) {
            console.error('שגיאה בשמירת מצב זמני:', e);
            return false;
        }
    }

    /**
     * קבלת מצב ריצה זמני
     */
    function getTempRunState() {
        try {
            const data = localStorage.getItem('runlite_temp_run');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('שגיאה בקריאת מצב זמני:', e);
            return null;
        }
    }

    /**
     * מחיקת מצב ריצה זמני
     */
    function clearTempRunState() {
        try {
            localStorage.removeItem('runlite_temp_run');
            return true;
        } catch (e) {
            console.error('שגיאה במחיקת מצב זמני:', e);
            return false;
        }
    }

    /**
     * בדיקה אם יש ריצות שמורות
     */
    async function hasRuns() {
        const runs = await getAllRuns();
        return runs.length > 0;
    }

    /**
     * קבלת סטטיסטיקות כלליות (לעתיד)
     */
    async function getStats() {
        const runs = await getAllRuns();
        
        if (runs.length === 0) {
            return {
                totalRuns: 0,
                totalDistance: 0,
                totalTime: 0,
                avgPace: 0
            };
        }

        const totalDistance = runs.reduce((sum, run) => sum + (run.distance || 0), 0);
        const totalTime = runs.reduce((sum, run) => sum + (run.duration || 0), 0);
        
        return {
            totalRuns: runs.length,
            totalDistance: totalDistance,
            totalTime: totalTime,
            avgPace: totalDistance > 0 ? (totalTime / 60) / totalDistance : 0
        };
    }

    /**
     * מחיקת כל הנתונים (לבדיקות)
     */
    async function clearAllData() {
        if (!db) {
            await initDB();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_RUNS], 'readwrite');
            const store = transaction.objectStore(STORE_RUNS);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('כל הריצות נמחקו');
                
                // מחיקת localStorage
                try {
                    localStorage.removeItem('runlite_units');
                    localStorage.removeItem('runlite_high_accuracy');
                    localStorage.removeItem('runlite_temp_run');
                } catch (e) {
                    console.error('שגיאה במחיקת localStorage:', e);
                }
                
                resolve();
            };

            request.onerror = () => {
                console.error('שגיאה במחיקת נתונים:', request.error);
                reject(request.error);
            };
        });
    }

    // ייצוא ציבורי
    return {
        init: initDB,
        saveRun,
        getAllRuns,
        getRun,
        deleteRun,
        getLastRun,
        hasRuns,
        getStats,
        
        // הגדרות
        saveUnits,
        getUnits,
        saveHighAccuracy,
        getHighAccuracy,
        
        // מצב זמני
        saveTempRunState,
        getTempRunState,
        clearTempRunState,
        
        // כלים
        clearAllData
    };
})();

// אתחול אוטומטי
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Storage.init().catch(err => {
            console.error('שגיאה באתחול Storage:', err);
        });
    });
} else {
    Storage.init().catch(err => {
        console.error('שגיאה באתחול Storage:', err);
    });
}
