import util from 'util';


function formatPretty(transcript, options = {}) {
    return util.inspect(transcript, { compact: false, ...options });
}

function formatJSON(transcript, options = {}) {
    return JSON.stringify(transcript, null, options.space);
}

function formatPlainText(transcript) {
    return transcript.map(line => line.text).join('\n');
}

function formatPlainTextMultiple(transcripts) {
    return transcripts.map(transcript => formatPlainText(transcript)).join('\n\n\n');
}

function formatTimestamp(seconds, format) {
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.round((seconds % 1) * 1000);

    return format(hours, minutes, secs, milliseconds);
}

function getSRTTimestamp(hours, minutes, seconds, milliseconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function getWebVTTTimestamp(hours, minutes, seconds, milliseconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function formatTranscriptHelper(transcript, getTimestampFunc, formatHeaderFunc, formatLineFunc) {
    const lines = transcript.map((line, index) => {
        const end = line.start + line.duration;
        const nextStart = transcript[index + 1]?.start || end;
        const timecode = `${formatTimestamp(line.start, getTimestampFunc)} --> ${formatTimestamp(nextStart, getTimestampFunc)}`;
        return formatLineFunc(index, timecode, line);
    });

    return formatHeaderFunc(lines);
}

function formatSRT(transcript) {
    return formatTranscriptHelper(transcript, getSRTTimestamp, lines => lines.join('\n\n') + '\n', (index, timecode, line) => `${index + 1}\n${timecode}\n${line.text}`);
}

function formatWebVTT(transcript) {
    return formatTranscriptHelper(transcript, getWebVTTTimestamp, lines => `WEBVTT\n\n${lines.join('\n\n')}\n`, (index, timecode, line) => `${timecode}\n${line.text}`);
}

function FormatterFactory(format = 'pretty') {
    const formats = {
        json: formatJSON,
        pretty: formatPretty,
        text: formatPlainText,
        textMultiple: formatPlainTextMultiple,
        webvtt: formatWebVTT,
        srt: formatSRT
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
    formatSRT,
    formatWebVTT,
    FormatterFactory
};
