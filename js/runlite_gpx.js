/**
 * gpx.js - RunLite
 * יצירה וייצוא של קבצי GPX
 */

const GPX = (function() {
    'use strict';

    /**
     * המרת timestamp ל-ISO 8601 format
     */
    function toISOString(timestamp) {
        return new Date(timestamp).toISOString();
    }

    /**
     * escape תווים מיוחדים ב-XML
     */
    function escapeXml(unsafe) {
        if (!unsafe) return '';
        
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * יצירת קובץ GPX מנתוני ריצה
     * @param {Object} runData - נתוני ריצה מלאים
     * @returns {string} תוכן GPX כ-XML string
     */
    function generateGPX(runData) {
        const {
            name = 'ריצה',
            date,
            route = [],
            distance,
            duration
        } = runData;

        if (!route || route.length === 0) {
            throw new Error('אין נקודות GPS ליצירת GPX');
        }

        // יצירת שם קובץ
        const dateStr = date ? new Date(date).toISOString().split('T')[0] : 'unknown';
        const safeName = escapeXml(name);

        // בניית XML
        let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
        gpx += '<gpx version="1.1" creator="RunLite" \n';
        gpx += '  xmlns="http://www.topografix.com/GPX/1/1" \n';
        gpx += '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n';
        gpx += '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
        
        // Metadata
        gpx += '  <metadata>\n';
        gpx += `    <name>${safeName}</name>\n`;
        if (date) {
            gpx += `    <time>${toISOString(date)}</time>\n`;
        }
        gpx += '    <author>\n';
        gpx += '      <name>RunLite</name>\n';
        gpx += '    </author>\n';
        gpx += '  </metadata>\n';

        // Track
        gpx += '  <trk>\n';
        gpx += `    <name>${safeName}</name>\n`;
        gpx += '    <type>running</type>\n';
        
        // Track Segment
        gpx += '    <trkseg>\n';
        
        // Track Points
        route.forEach(point => {
            gpx += `      <trkpt lat="${point.latitude.toFixed(7)}" lon="${point.longitude.toFixed(7)}">\n`;
            
            // Elevation (אם זמין)
            if (point.altitude != null) {
                gpx += `        <ele>${point.altitude.toFixed(1)}</ele>\n`;
            }
            
            // Time
            if (point.timestamp) {
                gpx += `        <time>${toISOString(point.timestamp)}</time>\n`;
            }
            
            gpx += '      </trkpt>\n';
        });
        
        gpx += '    </trkseg>\n';
        gpx += '  </trk>\n';
        gpx += '</gpx>';

        return gpx;
    }

    /**
     * הורדת קובץ GPX
     * @param {Object} runData - נתוני ריצה
     * @param {string} filename - שם קובץ (אופציונלי)
     */
    function downloadGPX(runData, filename = null) {
        try {
            const gpxContent = generateGPX(runData);
            
            // יצירת שם קובץ
            if (!filename) {
                const date = runData.date ? new Date(runData.date) : new Date();
                const dateStr = date.toISOString().split('T')[0];
                const name = runData.name ? runData.name.replace(/[^a-zA-Z0-9א-ת]/g, '-') : 'run';
                filename = `runlite_${dateStr}_${name}.gpx`;
            }

            // יצירת Blob
            const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
            
            // יצירת link להורדה
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            
            // trigger הורדה
            document.body.appendChild(a);
            a.click();
            
            // ניקוי
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log('GPX הורד בהצלחה:', filename);
            return true;

        } catch (error) {
            console.error('שגיאה ביצירת/הורדת GPX:', error);
            throw error;
        }
    }

    /**
     * ולידציה בסיסית של נתוני GPX
     */
    function validateRunData(runData) {
        const errors = [];

        if (!runData) {
            errors.push('אין נתוני ריצה');
            return errors;
        }

        if (!runData.route || !Array.isArray(runData.route)) {
            errors.push('חסר מסלול ריצה');
        } else if (runData.route.length < 2) {
            errors.push('מסלול קצר מדי (פחות משתי נקודות)');
        }

        // בדיקת תקינות נקודות
        if (runData.route) {
            const invalidPoints = runData.route.filter(p => 
                !p.latitude || !p.longitude ||
                typeof p.latitude !== 'number' ||
                typeof p.longitude !== 'number'
            );

            if (invalidPoints.length > 0) {
                errors.push(`${invalidPoints.length} נקודות לא תקינות`);
            }
        }

        return errors;
    }

    /**
     * המרת GPX string ל-route points (לייבוא עתידי)
     */
    function parseGPX(gpxString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(gpxString, 'text/xml');
            
            // חילוץ track points
            const trkpts = xmlDoc.getElementsByTagName('trkpt');
            const points = [];

            for (let i = 0; i < trkpts.length; i++) {
                const trkpt = trkpts[i];
                
                const point = {
                    latitude: parseFloat(trkpt.getAttribute('lat')),
                    longitude: parseFloat(trkpt.getAttribute('lon'))
                };

                // Elevation
                const ele = trkpt.getElementsByTagName('ele')[0];
                if (ele) {
                    point.altitude = parseFloat(ele.textContent);
                }

                // Time
                const time = trkpt.getElementsByTagName('time')[0];
                if (time) {
                    point.timestamp = new Date(time.textContent).getTime();
                }

                points.push(point);
            }

            return points;

        } catch (error) {
            console.error('שגיאה בניתוח GPX:', error);
            throw error;
        }
    }

    /**
     * יצירת תצוגה מקדימה של GPX (לבדיקה)
     */
    function previewGPX(runData) {
        try {
            const gpxContent = generateGPX(runData);
            
            // פתיחת חלון חדש עם התוכן
            const win = window.open('', '_blank');
            win.document.write('<pre>' + escapeHtml(gpxContent) + '</pre>');
            win.document.close();
            
        } catch (error) {
            console.error('שגיאה בתצוגה מקדימה:', error);
            throw error;
        }
    }

    /**
     * escape HTML לתצוגה
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * חישוב גודל קובץ GPX (באופן משוער)
     */
    function estimateFileSize(runData) {
        if (!runData || !runData.route) return 0;
        
        // כל נקודה ~150 bytes בממוצע
        const bytesPerPoint = 150;
        const overhead = 500; // metadata + headers
        
        return (runData.route.length * bytesPerPoint + overhead);
    }

    /**
     * המרת bytes לפורמט קריא
     */
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ייצוא ציבורי
    return {
        generateGPX,
        downloadGPX,
        validateRunData,
        parseGPX,
        previewGPX,
        estimateFileSize,
        formatFileSize
    };
})();
