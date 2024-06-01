#!/usr/bin/env node

import util from 'util';
import color from 'chalk';



// Formats the given seconds into a timestamp

function formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}


// Formats the transcript in a pretty format using util.inspect

function formatPretty(transcript, options = {}) {
    return util.inspect(transcript, { compact: true, ...options, maxArrayLength: null, depth: null, breakLength: 120, colors: true, sorted: true, getters: true, showHidden: true, maxStringLength: null, maxObjectSize: null, customInspect: true });
}

// Formats the transcript as a JSON string

function formatJSON(transcript, options = {}) {
    return JSON.stringify(transcript, ["start", "text", "duration"], 2);
}


// Formats the transcript as plain text
function formatPlainText(transcript) {
    

    return transcript.map(line => `${color.blue(line.start)}: ${color.yellow(line.text)}. ${color.green(line.duration)}`).join('\n');

}

//Formats multiple transcripts as plain text

function formatPlainTextMultiple(transcripts) {
    return transcripts.map(transcript => formatPlainText(transcript)).join('\n\n\n');
}

// Helper function to format a transcript
function formatTranscriptHelper(transcript, getTimestampFunc, formatHeaderFunc, formatLineFunc, options = {}) {
    const lines = transcript.map((line, index) => {
        const end = line.start + (options.duration ? line.duration : 0);
        const nextStart = transcript[index + 1]?.start || end;
        const timecode = `${formatTimestamp(line.start)} --> ${formatTimestamp(nextStart)}`;
        return formatLineFunc(index, timecode, line, options);
    });

    return formatHeaderFunc(lines);
}

// Factory function to get the appropriate formatter
function FormatterFactory(format = 'text', options = {}) {
    const formats = {
        json: (transcript) => formatJSON(transcript, options),
        pretty: (transcript) => formatPretty(transcript, options),
        text: (transcripts) => formatPlainTextMultiple(transcripts, options),
    };

    const formatter = formats[format];
    if (!formatter) {
        throw new Error(`The format '${format}' is not supported. Supported formats: ${Object.keys(formats).join(', ')}`);
        
    }
    return formatter;
}

export {
    formatTimestamp,
    formatPretty,
    formatJSON,
    formatPlainText,
    formatPlainTextMultiple,
    formatTranscriptHelper,
    FormatterFactory
};
