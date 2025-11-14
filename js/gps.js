/**
 * gps.js - RunLite
 * ניהול GPS tracking והקלטת מסלול
 */

const GPS = (function() {
    'use strict';

    let watchId = null;
    let isTracking = false;
    let trackingPoints = [];
    let onLocationUpdate = null;
    let onGPSStatusChange = null;
    let highAccuracy = true;
    let wakeLock = null; // שמירת המסך דלוק

    // קבועים
    const SAMPLING_INTERVAL = 3000; // 3 שניות בין דגימות
    const MIN_ACCURACY = 50; // מטרים - דיוק מינימלי
    const TEMP_SAVE_INTERVAL = 30000; // 30 שניות - שמירה זמנית

    let tempSaveTimer = null;

    /**
     * בדיקה אם GPS זמין
     */
    function isGPSAvailable() {
        return 'geolocation' in navigator;
    }

    /**
     * בקשת הרשאת מיקום
     */
    async function requestPermission() {
        if (!isGPSAvailable()) {
            throw new Error('GPS לא זמין במכשיר זה');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                () => {
                    console.log('הרשאת מיקום ניתנה');
                    resolve(true);
                },
                (error) => {
                    console.error('הרשאת מיקום נדחתה:', error);
                    
                    let errorMessage = 'לא ניתן לגשת למיקום';
                    
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'הרשאת מיקום נדחתה. אנא אפשר גישה למיקום בהגדרות הדפדפן.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'המיקום לא זמין. ודא שה-GPS מופעל.';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'תם הזמן בבקשת מיקום. נסה שוב.';
                            break;
                    }
                    
                    reject(new Error(errorMessage));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    /**
     * שמירת המסך דלוק
     */
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('🔒 המסך יישאר דלוק במהלך הריצה');
                
                // מאזין לשחרור Wake Lock (למשל אם המשתמש עובר לכרטיסייה אחרת)
                wakeLock.addEventListener('release', () => {
                    console.log('⚠️ Wake Lock שוחרר');
                });
                
                return true;
            } else {
                console.log('⚠️ Wake Lock API לא זמין בדפדפן זה');
                return false;
            }
        } catch (err) {
            console.error('שגיאה ב-Wake Lock:', err);
            return false;
        }
    }

    /**
     * שחרור Wake Lock
     */
    async function releaseWakeLock() {
        if (wakeLock !== null) {
            try {
                await wakeLock.release();
                wakeLock = null;
                console.log('🔓 המסך יכול לכבות שוב');
            } catch (err) {
                console.error('שגיאה בשחרור Wake Lock:', err);
            }
        }
    }

    /**
     * התחלת מעקב GPS
     */
    async function startTracking(options = {}) {
        if (isTracking) {
            console.warn('GPS כבר במעקב');
            return;
        }

        // קבלת הגדרות
        highAccuracy = options.highAccuracy !== undefined ? options.highAccuracy : true;
        onLocationUpdate = options.onLocationUpdate || null;
        onGPSStatusChange = options.onGPSStatusChange || null;

        // איפוס נקודות
        trackingPoints = [];

        // בדיקת הרשאות
        try {
            await requestPermission();
        } catch (error) {
            throw error;
        }

        // בקשת Wake Lock - שמירת המסך דלוק
        await requestWakeLock();

        // התחלת מעקב
        const gpsOptions = {
            enableHighAccuracy: highAccuracy,
            timeout: 10000,
            maximumAge: 0
        };

        watchId = navigator.geolocation.watchPosition(
            handleLocationUpdate,
            handleLocationError,
            gpsOptions
        );

        isTracking = true;
        console.log('מעקב GPS החל');

        // שמירה זמנית תקופתית
        startTempSaving();
    }

    /**
     * טיפול בעדכון מיקום
     */
    function handleLocationUpdate(position) {
        const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
        };

        // בדיקת דיוק
        const gpsStatus = getGPSStatus(point.accuracy);
        
        if (onGPSStatusChange) {
            onGPSStatusChange(gpsStatus);
        }

        // הוספת נקודה לרשימה (גם אם הדיוק לא מושלם - הפילטור יהיה בחישובים)
        trackingPoints.push(point);

        console.log(`נקודה ${trackingPoints.length}:`, 
                    `lat: ${point.latitude.toFixed(6)}, `,
                    `lng: ${point.longitude.toFixed(6)}, `,
                    `acc: ${point.accuracy?.toFixed(1)}m`);

        // קריאה ל-callback
        if (onLocationUpdate) {
            onLocationUpdate(point);
        }
    }

    /**
     * טיפול בשגיאת GPS
     */
    function handleLocationError(error) {
        console.error('שגיאת GPS:', error);
        
        let errorMessage = 'שגיאת GPS';
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'הרשאת מיקום נדחתה';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'המיקום לא זמין - ודא ש-GPS מופעל';
                break;
            case error.TIMEOUT:
                errorMessage = 'תם הזמן לקבלת מיקום';
                break;
        }

        if (onGPSStatusChange) {
            onGPSStatusChange('error', errorMessage);
        }
    }

    /**
     * עצירת מעקב GPS
     */
    function stopTracking() {
        if (!isTracking) {
            console.warn('GPS לא במעקב');
            return trackingPoints;
        }

        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        isTracking = false;
        console.log('מעקב GPS הופסק');

        // עצירת שמירה זמנית
        stopTempSaving();

        // מחיקת מצב זמני
        Storage.clearTempRunState();

        // שחרור Wake Lock - אפשר למסך לכבות שוב
        releaseWakeLock();

        return trackingPoints;
    }

    /**
     * קבלת סטטוס GPS לפי דיוק
     */
    function getGPSStatus(accuracy) {
        if (!accuracy) return 'unknown';
        
        if (accuracy <= 10) return 'good';
        if (accuracy <= 30) return 'medium';
        return 'poor';
    }

    /**
     * קבלת כל הנקודות עד כה
     */
    function getPoints() {
        return trackingPoints;
    }

    /**
     * קבלת מספר הנקודות
     */
    function getPointsCount() {
        return trackingPoints.length;
    }

    /**
     * בדיקה אם במעקב
     */
    function isCurrentlyTracking() {
        return isTracking;
    }

    /**
     * איפוס נקודות (ללא עצירת מעקב)
     */
    function resetPoints() {
        trackingPoints = [];
        console.log('נקודות GPS אופסו');
    }

    /**
     * התחלת שמירה זמנית תקופתית
     */
    function startTempSaving() {
        stopTempSaving(); // וידוא שאין timer קיים
        
        tempSaveTimer = setInterval(() => {
            if (trackingPoints.length > 0) {
                const tempState = {
                    points: trackingPoints,
                    startTime: trackingPoints[0].timestamp,
                    lastUpdate: Date.now()
                };
                
                Storage.saveTempRunState(tempState);
                console.log('מצב זמני נשמר');
            }
        }, TEMP_SAVE_INTERVAL);
    }

    /**
     * עצירת שמירה זמנית
     */
    function stopTempSaving() {
        if (tempSaveTimer) {
            clearInterval(tempSaveTimer);
            tempSaveTimer = null;
        }
    }

    /**
     * שחזור ריצה מלא מצב זמני
     */
    async function recoverFromTempState() {
        const tempState = Storage.getTempRunState();
        
        if (!tempState || !tempState.points || tempState.points.length === 0) {
            return null;
        }

        // בדיקה אם הריצה לא ישנה מדי (לא יותר מ-24 שעות)
        const now = Date.now();
        const hoursSinceUpdate = (now - tempState.lastUpdate) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate > 24) {
            console.log('מצב זמני ישן מדי - מתעלם');
            Storage.clearTempRunState();
            return null;
        }

        console.log('נמצא מצב ריצה זמני:', tempState.points.length, 'נקודות');
        return tempState;
    }

    /**
     * המשך ריצה ממצב שמור
     */
    function continueFromState(tempState) {
        if (tempState && tempState.points) {
            trackingPoints = tempState.points;
            console.log('ריצה שוחזרה:', trackingPoints.length, 'נקודות');
        }
    }

    /**
     * קבלת מיקום נוכחי חד-פעמי (ללא מעקב)
     */
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!isGPSAvailable()) {
                reject(new Error('GPS לא זמין'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 5000
                }
            );
        });
    }

    // ייצוא ציבורי
    return {
        isGPSAvailable,
        requestPermission,
        startTracking,
        stopTracking,
        getPoints,
        getPointsCount,
        isCurrentlyTracking,
        resetPoints,
        getCurrentPosition,
        getGPSStatus,
        
        // שחזור
        recoverFromTempState,
        continueFromState
    };
})();
