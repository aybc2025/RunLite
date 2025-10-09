/**
 * compute.js - RunLite
 * חישובים: מרחק, קצב, מהירות, splits, elevation
 */

const Compute = (function() {
    'use strict';

    const EARTH_RADIUS_KM = 6371; // רדיוס כדור הארץ בק"מ
    const MAX_REASONABLE_SPEED = 25; // ק"מ/שעה - מהירות מקסימלית סבירה
    const MIN_ACCURACY = 50; // מטרים - דיוק GPS מינימלי
    const ELEVATION_THRESHOLD = 3; // מטרים - סף לחישוב עלייה/ירידה
    const KM_TO_MI = 0.621371; // המרת ק"מ למייל

    /**
     * המרת מעלות לרדיאנים
     */
    function toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * חישוב מרחק בין שתי נקודות GPS (Haversine formula)
     * @returns {number} מרחק בק"מ
     */
    function haversine(lat1, lon1, lat2, lon2) {
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return EARTH_RADIUS_KM * c;
    }

    /**
     * חישוב מרחק כולל מרשימת נקודות
     * @param {Array} points - רשימת נקודות GPS
     * @returns {number} מרחק בק"מ
     */
    function calculateTotalDistance(points) {
        if (!points || points.length < 2) {
            return 0;
        }

        let totalDistance = 0;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // דילוג על נקודות עם דיוק נמוך
            if (prev.accuracy && prev.accuracy > MIN_ACCURACY) continue;
            if (curr.accuracy && curr.accuracy > MIN_ACCURACY) continue;

            const distance = haversine(
                prev.latitude,
                prev.longitude,
                curr.latitude,
                curr.longitude
            );

            // בדיקת מהירות סבירה
            const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // שניות
            if (timeDiff > 0) {
                const speed = (distance / timeDiff) * 3600; // ק"מ/שעה
                if (speed <= MAX_REASONABLE_SPEED) {
                    totalDistance += distance;
                }
            }
        }

        return totalDistance;
    }

    /**
     * חישוב זמן ריצה בשניות
     */
    function calculateDuration(points) {
        if (!points || points.length < 2) {
            return 0;
        }

        const startTime = points[0].timestamp;
        const endTime = points[points.length - 1].timestamp;
        
        return Math.floor((endTime - startTime) / 1000);
    }

    /**
     * חישוב קצב ממוצע (דקות לק"מ)
     * @param {number} distance - מרחק בק"מ
     * @param {number} duration - זמן בשניות
     * @returns {number} קצב בשניות לק"מ
     */
    function calculateAvgPace(distance, duration) {
        if (distance === 0) return 0;
        return duration / distance; // שניות לק"מ
    }

    /**
     * חישוב מהירות שיא
     * @param {Array} points - רשימת נקודות GPS
     * @returns {number} מהירות בק"מ/שעה
     */
    function calculateMaxSpeed(points) {
        if (!points || points.length < 2) {
            return 0;
        }

        let maxSpeed = 0;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // דילוג על נקודות עם דיוק נמוך
            if (prev.accuracy && prev.accuracy > MIN_ACCURACY) continue;
            if (curr.accuracy && curr.accuracy > MIN_ACCURACY) continue;

            const distance = haversine(
                prev.latitude,
                prev.longitude,
                curr.latitude,
                curr.longitude
            );

            const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // שניות
            
            if (timeDiff > 0) {
                const speed = (distance / timeDiff) * 3600; // ק"מ/שעה
                
                if (speed <= MAX_REASONABLE_SPEED && speed > maxSpeed) {
                    maxSpeed = speed;
                }
            }
        }

        return maxSpeed;
    }

    /**
     * חישוב splits (לכל ק"מ או מייל)
     * @param {Array} points - רשימת נקודות GPS
     * @param {string} units - 'km' או 'mi'
     * @returns {Array} רשימת splits
     */
    function calculateSplits(points, units = 'km') {
        if (!points || points.length < 2) {
            return [];
        }

        const splitDistance = units === 'km' ? 1.0 : 1.0 * KM_TO_MI;
        const splits = [];
        
        let currentDistance = 0;
        let splitStartTime = points[0].timestamp;
        let splitStartIndex = 0;
        let splitNumber = 1;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // דילוג על נקודות עם דיוק נמוך
            if (prev.accuracy && prev.accuracy > MIN_ACCURACY) continue;
            if (curr.accuracy && curr.accuracy > MIN_ACCURACY) continue;

            const segmentDistance = haversine(
                prev.latitude,
                prev.longitude,
                curr.latitude,
                curr.longitude
            );

            // בדיקת מהירות סבירה
            const timeDiff = (curr.timestamp - prev.timestamp) / 1000;
            if (timeDiff > 0) {
                const speed = (segmentDistance / timeDiff) * 3600;
                if (speed > MAX_REASONABLE_SPEED) continue;
            }

            currentDistance += segmentDistance;

            // בדיקה אם עברנו ק"מ/מייל שלם
            if (currentDistance >= splitDistance) {
                const splitTime = Math.floor((curr.timestamp - splitStartTime) / 1000);
                const splitPace = splitTime / splitDistance;

                splits.push({
                    number: splitNumber,
                    distance: splitDistance,
                    time: splitTime,
                    pace: splitPace,
                    unit: units
                });

                splitNumber++;
                currentDistance = currentDistance - splitDistance;
                splitStartTime = curr.timestamp;
                splitStartIndex = i;
            }
        }

        // Split אחרון (חלקי)
        if (currentDistance > 0.1) {
            const lastPoint = points[points.length - 1];
            const splitTime = Math.floor((lastPoint.timestamp - splitStartTime) / 1000);
            const splitPace = currentDistance > 0 ? splitTime / currentDistance : 0;

            splits.push({
                number: splitNumber,
                distance: currentDistance,
                time: splitTime,
                pace: splitPace,
                unit: units,
                partial: true
            });
        }

        return splits;
    }

    /**
     * חישוב עלייה וירידה מצטברת
     * @param {Array} points - רשימת נקודות GPS (עם altitude)
     * @returns {Object} {ascent, descent} במטרים, או null אם אין נתונים
     */
    function calculateElevation(points) {
        if (!points || points.length < 2) {
            return null;
        }

        // בדיקה אם יש נתוני גובה
        const hasAltitude = points.some(p => p.altitude != null);
        if (!hasAltitude) {
            return null;
        }

        let totalAscent = 0;
        let totalDescent = 0;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            if (prev.altitude == null || curr.altitude == null) continue;

            const elevChange = curr.altitude - prev.altitude;

            if (elevChange > ELEVATION_THRESHOLD) {
                totalAscent += elevChange;
            } else if (elevChange < -ELEVATION_THRESHOLD) {
                totalDescent += Math.abs(elevChange);
            }
        }

        // עיגול לשני מקומות אחרי הנקודה
        return {
            ascent: Math.round(totalAscent * 10) / 10,
            descent: Math.round(totalDescent * 10) / 10
        };
    }

    /**
     * חישוב כל הסטטיסטיקות בבת אחת
     */
    function calculateAllStats(points, units = 'km') {
        const distance = calculateTotalDistance(points);
        const duration = calculateDuration(points);
        const avgPace = calculateAvgPace(distance, duration);
        const maxSpeed = calculateMaxSpeed(points);
        const splits = calculateSplits(points, units);
        const elevation = calculateElevation(points);

        return {
            distance,
            duration,
            avgPace,
            maxSpeed,
            splits,
            elevation,
            points: points.length
        };
    }

    /**
     * המרת שניות לפורמט זמן קריא (HH:MM:SS או MM:SS)
     */
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        } else {
            return `${minutes}:${String(secs).padStart(2, '0')}`;
        }
    }

    /**
     * המרת קצב לפורמט קריא (MM:SS לק"מ)
     */
    function formatPace(secondsPerKm) {
        if (!secondsPerKm || secondsPerKm === 0) return '-';
        
        const minutes = Math.floor(secondsPerKm / 60);
        const seconds = Math.floor(secondsPerKm % 60);
        
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    /**
     * המרת מרחק לפורמט קריא
     */
    function formatDistance(km, units = 'km') {
        const distance = units === 'km' ? km : km * KM_TO_MI;
        return distance.toFixed(2);
    }

    /**
     * המרת מהירות לפורמט קריא
     */
    function formatSpeed(kmh, units = 'km') {
        const speed = units === 'km' ? kmh : kmh * KM_TO_MI;
        return speed.toFixed(1);
    }

    /**
     * המרת יחידות - ק"מ למייל
     */
    function convertDistance(km, toUnit) {
        return toUnit === 'mi' ? km * KM_TO_MI : km;
    }

    /**
     * המרת קצב - דקות/ק"מ לדקות/מייל
     */
    function convertPace(paceKm, toUnit) {
        return toUnit === 'mi' ? paceKm / KM_TO_MI : paceKm;
    }

    /**
     * בדיקה אם ריצה קצרה מדי (פחות מ-100 מטר או 30 שניות)
     */
    function isTooShort(points) {
        if (!points || points.length < 2) return true;
        
        const distance = calculateTotalDistance(points);
        const duration = calculateDuration(points);
        
        return distance < 0.1 || duration < 30;
    }

    // ייצוא ציבורי
    return {
        // חישובים בסיסיים
        haversine,
        calculateTotalDistance,
        calculateDuration,
        calculateAvgPace,
        calculateMaxSpeed,
        calculateSplits,
        calculateElevation,
        
        // חישוב מאוחד
        calculateAllStats,
        
        // פורמט
        formatTime,
        formatPace,
        formatDistance,
        formatSpeed,
        
        // המרות
        convertDistance,
        convertPace,
        
        // כלים
        isTooShort,
        
        // קבועים
        KM_TO_MI,
        MAX_REASONABLE_SPEED
    };
})();
