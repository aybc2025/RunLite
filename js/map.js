/**
 * map.js - RunLite
 * אינטגרציית Leaflet - הצגת מפות ומסלולים
 */

const MapManager = (function() {
    'use strict';

    let maps = {}; // אחסון instances של מפות

    /**
     * יצירת מפה חדשה
     * @param {string} containerId - ID של ה-div להציג בו את המפה
     * @param {Array} points - נקודות GPS להצגה
     * @param {Object} options - אופציות נוספות
     */
    function createMap(containerId, points = [], options = {}) {
        // ניקוי מפה קיימת אם יש
        if (maps[containerId]) {
            maps[containerId].remove();
            delete maps[containerId];
        }

        // יצירת מפה
        const map = L.map(containerId, {
            zoomControl: true,
            attributionControl: true
        });

        // הוספת tiles מ-OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // שמירת instance
        maps[containerId] = map;

        // הצגת מסלול אם יש נקודות
        if (points && points.length > 0) {
            drawRoute(containerId, points, options);
        } else {
            // מפה ריקה - מיקוד למיקום ברירת מחדל (תל אביב)
            map.setView([32.0853, 34.7818], 13);
        }

        return map;
    }

    /**
     * ציור מסלול על המפה
     * @param {string} containerId - ID של המפה
     * @param {Array} points - נקודות GPS
     * @param {Object} options - אופציות נוספות
     */
    function drawRoute(containerId, points, options = {}) {
        const map = maps[containerId];
        if (!map || !points || points.length === 0) {
            console.warn('לא ניתן לצייר מסלול - אין מפה או נקודות');
            return;
        }

        // המרת נקודות לפורמט Leaflet
        const latLngs = points.map(p => [p.latitude, p.longitude]);

        // ציור polyline
        const polyline = L.polyline(latLngs, {
            color: options.color || '#2196F3',
            weight: options.weight || 4,
            opacity: options.opacity || 0.8,
            smoothFactor: 1
        }).addTo(map);

        // סימון התחלה
        if (options.showStartEnd !== false) {
            const startPoint = points[0];
            L.marker([startPoint.latitude, startPoint.longitude], {
                icon: createCustomIcon('🏁', '#4CAF50')
            })
            .addTo(map)
            .bindPopup('התחלה');

            // סימון סיום
            const endPoint = points[points.length - 1];
            L.marker([endPoint.latitude, endPoint.longitude], {
                icon: createCustomIcon('🏁', '#F44336')
            })
            .addTo(map)
            .bindPopup('סיום');
        }

        // התאמת תצוגה למסלול
        map.fitBounds(polyline.getBounds(), {
            padding: [20, 20]
        });
    }

    /**
     * יצירת אייקון מותאם אישית
     */
    function createCustomIcon(emoji, color) {
        return L.divIcon({
            html: `<div style="background-color: ${color}; 
                              border-radius: 50%; 
                              width: 30px; 
                              height: 30px; 
                              display: flex; 
                              align-items: center; 
                              justify-content: center; 
                              font-size: 16px;
                              box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                      ${emoji}
                   </div>`,
            className: 'custom-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
    }

    /**
     * עדכון מסלול במפה קיימת
     * @param {string} containerId - ID של המפה
     * @param {Array} points - נקודות GPS חדשות
     */
    function updateRoute(containerId, points) {
        const map = maps[containerId];
        if (!map) {
            console.warn('מפה לא קיימת:', containerId);
            return;
        }

        // ניקוי layers קיימים (מלבד tile layer)
        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline || layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // ציור מסלול מחדש
        drawRoute(containerId, points);
    }

    /**
     * ניקוי מפה
     */
    function clearMap(containerId) {
        const map = maps[containerId];
        if (!map) return;

        // הסרת כל ה-layers מלבד tile layer
        map.eachLayer((layer) => {
            if (!(layer instanceof L.TileLayer)) {
                map.removeLayer(layer);
            }
        });
    }

    /**
     * הסרת מפה לחלוטין
     */
    function removeMap(containerId) {
        const map = maps[containerId];
        if (map) {
            map.remove();
            delete maps[containerId];
        }
    }

    /**
     * מיקוד למיקום ספציפי
     */
    function focusOnLocation(containerId, lat, lng, zoom = 15) {
        const map = maps[containerId];
        if (!map) return;

        map.setView([lat, lng], zoom);
    }

    /**
     * הוספת marker למפה
     */
    function addMarker(containerId, lat, lng, options = {}) {
        const map = maps[containerId];
        if (!map) return null;

        const marker = L.marker([lat, lng], {
            icon: options.icon || L.Icon.Default()
        }).addTo(map);

        if (options.popup) {
            marker.bindPopup(options.popup);
        }

        return marker;
    }

    /**
     * קבלת center של מפה
     */
    function getCenter(containerId) {
        const map = maps[containerId];
        if (!map) return null;

        const center = map.getCenter();
        return {
            latitude: center.lat,
            longitude: center.lng
        };
    }

    /**
     * קבלת zoom level
     */
    function getZoom(containerId) {
        const map = maps[containerId];
        return map ? map.getZoom() : null;
    }

    /**
     * שינוי גודל מפה (שימושי כאשר container משנה גודל)
     */
    function invalidateSize(containerId) {
        const map = maps[containerId];
        if (map) {
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }
    }

    /**
     * בדיקה אם מפה קיימת
     */
    function hasMap(containerId) {
        return containerId in maps;
    }

    /**
     * יצירת thumbnail (מפה קטנה) לתצוגה בלבד
     */
    function createThumbnail(containerId, points) {
        return createMap(containerId, points, {
            showStartEnd: false,
            color: '#2196F3',
            weight: 3
        });
    }

    /**
     * ניקוי כל המפות
     */
    function removeAllMaps() {
        Object.keys(maps).forEach(id => {
            removeMap(id);
        });
    }

    // ייצוא ציבורי
    return {
        createMap,
        drawRoute,
        updateRoute,
        clearMap,
        removeMap,
        removeAllMaps,
        focusOnLocation,
        addMarker,
        getCenter,
        getZoom,
        invalidateSize,
        hasMap,
        createThumbnail
    };
})();
