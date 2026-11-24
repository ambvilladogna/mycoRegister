#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

/**
 * Unified Exception Handler for Database Integrity Scripts
 * 
 * This class provides consistent exception logging, anomaly marking,
 * and reporting across all database maintenance scripts.
 */
class DatabaseExceptionHandler {
    constructor(options = {}) {
        this.scriptName = options.scriptName || 'unknown-script';
        this.logDirectory = options.logDirectory || './logs';
        this.sessionId = this.generateSessionId();
        this.exceptions = [];
        this.anomalies = [];
        this.startTime = new Date();
        
        // Ensure log directory exists
        this.ensureLogDirectory();
    }

    /**
     * Generate a unique session ID for this script run
     */
    generateSessionId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substring(2, 8);
        return `${this.scriptName}-${timestamp}-${random}`;
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        try {
            await fs.mkdir(this.logDirectory, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }

    /**
     * Log an exception with context
     * 
     * @param {Object} params - Exception parameters
     * @param {string} params.type - Type of exception (e.g., 'API_ERROR', 'VALIDATION_ERROR')
     * @param {string} params.message - Error message
     * @param {Object} params.context - Additional context (document ID, operation, etc.)
     * @param {Error} params.error - Original error object (optional)
     * @param {string} params.severity - 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
     */
    logException({ type, message, context = {}, error = null, severity = 'MEDIUM' }) {
        const exception = {
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            scriptName: this.scriptName,
            type,
            message,
            context,
            severity,
            stackTrace: error ? error.stack : null,
            errorCode: error ? error.code : null
        };

        this.exceptions.push(exception);
        
        // Console output with appropriate formatting
        const severityEmoji = {
            'LOW': '⚠️',
            'MEDIUM': '🔶',
            'HIGH': '🔸',
            'CRITICAL': '🚨'
        };

        console.log(`${severityEmoji[severity]} [${severity}] ${type}: ${message}`);
        
        if (context.documentId) {
            console.log(`  Document: ${context.documentId}`);
        }
        
        if (context.operation) {
            console.log(`  Operation: ${context.operation}`);
        }

        return exception;
    }

    /**
     * Mark a document with an anomaly and log it
     * 
     * @param {Object} document - The document to mark
     * @param {string} anomalyType - Type of anomaly
     * @param {string} message - Anomaly message
     * @param {Object} additionalData - Additional data to store
     */
    markDocumentAnomaly(document, anomalyType, message, additionalData = {}) {
        const anomaly = {
            type: anomalyType,
            message,
            timestamp: new Date().toISOString(),
            scriptName: this.scriptName,
            sessionId: this.sessionId,
            ...additionalData
        };

        const markedDocument = {
            ...document,
            anomaly: anomaly,
            updatedAt: new Date().toISOString()
        };

        this.anomalies.push({
            documentId: document._id,
            anomaly,
            originalDocument: document
        });

        this.logException({
            type: 'DOCUMENT_ANOMALY',
            message: `Document marked with anomaly: ${message}`,
            context: {
                documentId: document._id,
                anomalyType,
                operation: 'mark_anomaly'
            },
            severity: 'MEDIUM'
        });

        return markedDocument;
    }

    /**
     * Create a standardized error result for failed operations
     */
    createErrorResult(document, error, operation = 'unknown') {
        const errorMessage = error.message || error.toString();
        const markedDoc = this.markDocumentAnomaly(
            document,
            'PROCESSING_ERROR',
            errorMessage,
            { operation, errorCode: error.code }
        );

        return {
            success: false,
            doc: markedDoc,
            error: errorMessage,
            anomaly: markedDoc.anomaly
        };
    }

    /**
     * Write exception log to file
     */
    async writeExceptionLog() {
        const logData = {
            sessionId: this.sessionId,
            scriptName: this.scriptName,
            startTime: this.startTime,
            endTime: new Date(),
            duration: new Date() - this.startTime,
            totalExceptions: this.exceptions.length,
            totalAnomalies: this.anomalies.length,
            exceptions: this.exceptions,
            anomalies: this.anomalies,
            summary: this.generateSummary()
        };

        const fileName = `${this.scriptName}-${this.startTime.toISOString().split('T')[0]}.json`;
        const filePath = path.join(this.logDirectory, fileName);

        try {
            await fs.writeFile(filePath, JSON.stringify(logData, null, 2));
            console.log(`\n📋 Exception log written to: ${filePath}`);
        } catch (error) {
            console.error('Failed to write exception log:', error);
        }
    }

    /**
     * Write a human-readable summary report
     */
    async writeSummaryReport() {
        const summary = this.generateSummary();
        const fileName = `${this.scriptName}-summary-${this.startTime.toISOString().split('T')[0]}.txt`;
        const filePath = path.join(this.logDirectory, fileName);

        const report = `
=== DATABASE INTEGRITY SCRIPT REPORT ===
Script: ${this.scriptName}
Session: ${this.sessionId}
Start Time: ${this.startTime.toISOString()}
End Time: ${new Date().toISOString()}
Duration: ${Math.round((new Date() - this.startTime) / 1000)}s

=== SUMMARY ===
Total Exceptions: ${this.exceptions.length}
Total Anomalies: ${this.anomalies.length}

Exception Types:
${Object.entries(summary.exceptionTypes).map(([type, count]) => `  - ${type}: ${count}`).join('\n')}

Severity Distribution:
${Object.entries(summary.severityDistribution).map(([severity, count]) => `  - ${severity}: ${count}`).join('\n')}

Anomaly Types:
${Object.entries(summary.anomalyTypes).map(([type, count]) => `  - ${type}: ${count}`).join('\n')}

=== RECENT EXCEPTIONS ===
${this.exceptions.slice(-10).map(ex => `
${ex.timestamp} [${ex.severity}] ${ex.type}
Message: ${ex.message}
Context: ${JSON.stringify(ex.context, null, 2)}
`).join('\n')}

=== RECOMMENDATIONS ===
${this.generateRecommendations()}
`;

        try {
            await fs.writeFile(filePath, report);
            console.log(`📊 Summary report written to: ${filePath}`);
        } catch (error) {
            console.error('Failed to write summary report:', error);
        }
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        const exceptionTypes = {};
        const severityDistribution = {};
        const anomalyTypes = {};

        this.exceptions.forEach(ex => {
            exceptionTypes[ex.type] = (exceptionTypes[ex.type] || 0) + 1;
            severityDistribution[ex.severity] = (severityDistribution[ex.severity] || 0) + 1;
        });

        this.anomalies.forEach(an => {
            anomalyTypes[an.anomaly.type] = (anomalyTypes[an.anomaly.type] || 0) + 1;
        });

        return {
            exceptionTypes,
            severityDistribution,
            anomalyTypes,
            totalExceptions: this.exceptions.length,
            totalAnomalies: this.anomalies.length
        };
    }

    /**
     * Generate recommendations based on exception patterns
     */
    generateRecommendations() {
        const recommendations = [];
        const summary = this.generateSummary();

        if (summary.totalExceptions > 50) {
            recommendations.push("- High exception count detected. Consider reviewing data quality or API reliability.");
        }

        if (summary.severityDistribution.CRITICAL > 0) {
            recommendations.push("- Critical exceptions found. Immediate investigation required.");
        }

        if (summary.exceptionTypes.API_ERROR > 10) {
            recommendations.push("- Multiple API errors detected. Check network connectivity and API status.");
        }

        if (summary.anomalyTypes.PROCESSING_ERROR > 20) {
            recommendations.push("- High number of processing errors. Review data validation logic.");
        }

        if (recommendations.length === 0) {
            recommendations.push("- No specific issues detected. Monitor trends over time.");
        }

        return recommendations.join('\n');
    }

    /**
     * Get all documents marked with anomalies for review
     */
    getAnomalousDocuments() {
        return this.anomalies.map(a => ({
            documentId: a.documentId,
            anomalyType: a.anomaly.type,
            message: a.anomaly.message,
            timestamp: a.anomaly.timestamp
        }));
    }

    /**
     * Finalize the session and write all logs
     */
    async finalize() {
        console.log('\n=== EXCEPTION HANDLER SUMMARY ===');
        console.log(`Total exceptions logged: ${this.exceptions.length}`);
        console.log(`Total anomalies marked: ${this.anomalies.length}`);
        console.log(`Session ID: ${this.sessionId}`);

        await this.writeExceptionLog();
        await this.writeSummaryReport();

        // Return summary for script use
        return this.generateSummary();
    }
}

module.exports = { DatabaseExceptionHandler };