#!/usr/bin/env node


const watchURL = 'https://www.youtube.com/watch?v={video_id}';


function couldNotRetrieveTranscript(videoId) {
    const error = new Error();
    error.videoId = videoId;
    error.message = buildErrorMessage(videoId, error.cause);
    error.name = 'CouldNotRetrieveTranscript';
    return error;
}

function buildErrorMessage(videoId, cause) {
    let errorMessage = `\nCould not retrieve a transcript for the video ${watchURL.replace('{video_id}', videoId)}!`;
    if (cause) {
        errorMessage += ` This is most likely caused by:\n\n${cause}`;
        errorMessage += `\n\nIf you are sure that the described cause is not responsible for this error and that a transcript should be retrievable, please create an issue at https://github.com/jdepoix/youtube-transcript-api/issues. Please add which version of youtube-transcript-api you are using and provide the information needed to replicate the error. Also make sure that there are no open issues which already describe your problem!`;
    }
    return errorMessage;
}

function youTubeRequestFailed(videoId, httpError) {
    const error = couldNotRetrieveTranscript(videoId);
    error.reason = httpError.message;
    error.cause = `Request to YouTube failed: ${error.reason}`;
    error.name = 'YouTubeRequestFailed';
    return error;
}

function videoUnavailable(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'The video is no longer available';
    error.name = 'VideoUnavailable';
    return error;
}

function invalidVideoId(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'You provided an invalid video id. Make sure you are using the video id and NOT the url!\n\nDo NOT run: `YouTubeTranscriptApi.getTranscript("https://www.youtube.com/watch?v=1234")`\nInstead run: `YouTubeTranscriptApi.getTranscript("1234")`';
    error.name = 'InvalidVideoId';
    return error;
}

function tooManyRequests(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'YouTube is receiving too many requests from this IP and now requires solving a captcha to continue. One of the following things can be done to work around this:\n- Manually solve the captcha in a browser and export the cookie. Read here how to use that cookie with youtube-transcript-api: https://github.com/jdepoix/youtube-transcript-api#cookies\n- Use a different IP address\n- Wait until the ban on your IP has been lifted';
    error.name = 'TooManyRequests';
    return error;
}

function transcriptsDisabled(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'Subtitles are disabled for this video';
    error.name = 'TranscriptsDisabled';
    return error;
}

function noTranscriptAvailable(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'No transcripts are available for this video';
    error.name = 'NoTranscriptAvailable';
    return error;
}

function notTranslatable(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'The requested language is not translatable';
    error.name = 'NotTranslatable';
    return error;
}

function translationLanguageNotAvailable(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'The requested translation language is not available';
    error.name = 'TranslationLanguageNotAvailable';
    return error;
}

function cookiePathInvalid(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'The provided cookie file was unable to be loaded';
    error.name = 'CookiePathInvalid';
    return error;
}

function cookiesInvalid(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'The cookies provided are not valid (may have expired)';
    error.name = 'CookiesInvalid';
    return error;
}

function failedToCreateConsentCookie(videoId) {
    const error = couldNotRetrieveTranscript(videoId);
    error.cause = 'Failed to automatically give consent to saving cookies';
    error.name = 'FailedToCreateConsentCookie';
    return error;
}

function noTranscriptFound(videoId, requestedLanguageCodes, transcriptData) {
    const error = couldNotRetrieveTranscript(videoId);
    error._requestedLanguageCodes = requestedLanguageCodes;
    error._transcriptData = transcriptData;
    error.cause = `No transcripts were found for any of the requested language codes: ${requestedLanguageCodes.join(', ')}\n\n${transcriptData}`;
    error.name = 'NoTranscriptFound';
    return error;
}

export {
    couldNotRetrieveTranscript,
    youTubeRequestFailed,
    videoUnavailable,
    invalidVideoId,
    tooManyRequests,
    transcriptsDisabled,
    noTranscriptAvailable,
    notTranslatable,
    translationLanguageNotAvailable,
    cookiePathInvalid,
    cookiesInvalid,
    failedToCreateConsentCookie,
    noTranscriptFound
};
