import settings from './settings.js';


function createCouldNotRetrieveTranscript(videoId) {
    const error = new Error();
    error.videoId = videoId;
    error.message = buildErrorMessage(videoId, error.cause);
    error.name = 'CouldNotRetrieveTranscript';
    return error;
}

function buildErrorMessage(videoId, cause) {
    let errorMessage = `\nCould not retrieve a transcript for the video ${settings.WATCH_URL.replace('{video_id}', videoId)}!`;
    if (cause) {
        errorMessage += ` This is most likely caused by:\n\n${cause}`;
        errorMessage += `\n\nIf you are sure that the described cause is not responsible for this error and that a transcript should be retrievable, please create an issue at https://github.com/jdepoix/youtube-transcript-api/issues. Please add which version of youtube-transcript-api you are using and provide the information needed to replicate the error. Also make sure that there are no open issues which already describe your problem!`;
    }
    return errorMessage;
}

function createYouTubeRequestFailed(videoId, httpError) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.reason = httpError.message;
    error.cause = `Request to YouTube failed: ${error.reason}`;
    error.name = 'YouTubeRequestFailed';
    return error;
}

function createVideoUnavailable(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'The video is no longer available';
    error.name = 'VideoUnavailable';
    return error;
}

function createInvalidVideoId(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'You provided an invalid video id. Make sure you are using the video id and NOT the url!\n\nDo NOT run: `YouTubeTranscriptApi.getTranscript("https://www.youtube.com/watch?v=1234")`\nInstead run: `YouTubeTranscriptApi.getTranscript("1234")`';
    error.name = 'InvalidVideoId';
    return error;
}

function createTooManyRequests(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'YouTube is receiving too many requests from this IP and now requires solving a captcha to continue. One of the following things can be done to work around this:\n- Manually solve the captcha in a browser and export the cookie. Read here how to use that cookie with youtube-transcript-api: https://github.com/jdepoix/youtube-transcript-api#cookies\n- Use a different IP address\n- Wait until the ban on your IP has been lifted';
    error.name = 'TooManyRequests';
    return error;
}

function createTranscriptsDisabled(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'Subtitles are disabled for this video';
    error.name = 'TranscriptsDisabled';
    return error;
}

function createNoTranscriptAvailable(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'No transcripts are available for this video';
    error.name = 'NoTranscriptAvailable';
    return error;
}

function createNotTranslatable(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'The requested language is not translatable';
    error.name = 'NotTranslatable';
    return error;
}

function createTranslationLanguageNotAvailable(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'The requested translation language is not available';
    error.name = 'TranslationLanguageNotAvailable';
    return error;
}

function createCookiePathInvalid(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'The provided cookie file was unable to be loaded';
    error.name = 'CookiePathInvalid';
    return error;
}

function createCookiesInvalid(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'The cookies provided are not valid (may have expired)';
    error.name = 'CookiesInvalid';
    return error;
}

function createFailedToCreateConsentCookie(videoId) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error.cause = 'Failed to automatically give consent to saving cookies';
    error.name = 'FailedToCreateConsentCookie';
    return error;
}

function createNoTranscriptFound(videoId, requestedLanguageCodes, transcriptData) {
    const error = createCouldNotRetrieveTranscript(videoId);
    error._requestedLanguageCodes = requestedLanguageCodes;
    error._transcriptData = transcriptData;
    error.cause = `No transcripts were found for any of the requested language codes: ${requestedLanguageCodes.join(', ')}\n\n${transcriptData}`;
    error.name = 'NoTranscriptFound';
    return error;
}

module.exports = {
    createCouldNotRetrieveTranscript,
    createYouTubeRequestFailed,
    createVideoUnavailable,
    createInvalidVideoId,
    createTooManyRequests,
    createTranscriptsDisabled,
    createNoTranscriptAvailable,
    createNotTranslatable,
    createTranslationLanguageNotAvailable,
    createCookiePathInvalid,
    createCookiesInvalid,
    createFailedToCreateConsentCookie,
    createNoTranscriptFound
};
