#!/usr/bin/env node
import util from 'util';

/**
 * Formats the transcript in a pretty format using util.inspect
 * @param {Object} transcript - The transcript object
 * @param {Object} [options={}] - Optional formatting options
 * @returns {string} - The formatted transcript
 */
function formatPretty(transcript, options = {}) {
    return util.inspect(transcript, { compact: true, ...options, maxArrayLength: null, depth: null });
}

/**
 * Formats the transcript as a JSON string
 * @param {Object} transcript - The transcript object
 * @param {Object} [options={}] - Optional formatting options
 * @returns {string} - The JSON formatted transcript
 */
function formatJSON(transcript, options = {}) {
    return JSON.stringify(transcript, null, options.space);
}

/**
 * Formats the transcript as plain text
 * @param {Array} transcript - The transcript array
 * @returns {string} - The plain text formatted transcript
 */
function formatPlainText(transcript) {
    return transcript.map(line => line.text).join('\n');
}

/**
 * Formats multiple transcripts as plain text
 * @param {Array} transcripts - An array of transcript arrays
 * @returns {string} - The plain text formatted transcripts
 */
function formatPlainTextMultiple(transcripts) {
    return transcripts.map(transcript => formatPlainText(transcript)).join('\n\n\n');
}

/**
 * Formats the given seconds into a timestamp using the provided format function
 * @param {number} seconds - The number of seconds
 * @param {Function} format - The format function
 * @returns {string} - The formatted timestamp
 */
function formatTimestamp(seconds, format) {
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.round((seconds % 1) * 1000);

    return format(hours, minutes, secs, milliseconds);
}


/**
 * Helper function to format a transcript
 * @param {Array} transcript - The transcript array
 * @param {Function} getTimestampFunc - Function to get the timestamp
 * @param {Function} formatHeaderFunc - Function to format the header
 * @param {Function} formatLineFunc - Function to format a line
 * @param {Object} [options={}] - Optional formatting options
 * @returns {string} - The formatted transcript
 */
function formatTranscriptHelper(transcript, getTimestampFunc, formatHeaderFunc, formatLineFunc, options = {}) {
    const lines = transcript.map((line, index) => {
        const end = line.start + (options.duration ? line.duration : 0);
        const nextStart = transcript[index + 1]?.start || end;
        const timecode = `${formatTimestamp(line.start, getTimestampFunc)} --> ${formatTimestamp(nextStart, getTimestampFunc)}`;
        return formatLineFunc(index, timecode, line, options);
    });

    return formatHeaderFunc(lines);
}


/**
 * Factory function to get the appropriate formatter
 * @param {string} [format='pretty'] - The desired format
 * @param {Object} [options={}] - Optional formatting options
 * @returns {Function} - The formatter function
 * @throws {Error} - If the format is not supported
 */
function FormatterFactory(format = 'pretty', options = {}) {
    const formats = {
        json: (transcript) => formatJSON(transcript, options),
        pretty: (transcript) => formatPretty(transcript, options),
        text: (transcript) => formatPlainText(transcript, options),
        textMultiple: (transcripts) => formatPlainTextMultiple(transcripts, options),
        // webvtt: (transcript) => formatWebVTT(transcript, options),
        // srt: (transcript) => formatSRT(transcript, options)
    };

    const formatter = formats[format];
    if (!formatter) {
        throw new Error(`The format '${format}' is not supported. Supported formats: ${Object.keys(formats).join(', ')}`);
    }
    return formatter;
}

export {
    formatPretty,
    formatJSON,
    formatPlainText,
    formatPlainTextMultiple,
    FormatterFactory
};
