#!/usr/bin/env node
import { DOMParser } from 'xmldom';
import axios from 'axios';
import tough from 'tough-cookie';
import fs from 'fs';
import {
    watchURL
} from './settings.js';
import {
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
} from './error.js';
import { parseHtml } from './htmlParser.js';

/**
 * Fetch the HTML content of a YouTube video page and handle consent cookie creation
 * @param {Object} httpClient - Axios HTTP client instance
 * @param {string} videoId - YouTube video ID
 * @returns {string} HTML content of the video page
 * @throws {Error} If consent cookie creation fails
 */
async function fetchVideoHtml(httpClient, videoId) {
    // Fetch the HTML content of the video page
    let html = await fetchHtml(httpClient, videoId);
    // Check if consent cookie is required
    if (html.includes('action="https://consent.youtube.com/s"')) {
        await createConsentCookie(httpClient, html, videoId);
        // Fetch the HTML content again after setting the consent cookie
        html = await fetchHtml(httpClient, videoId);
        if (html.includes('action="https://consent.youtube.com/s"')) {
            throw new failedToCreateConsentCookie(videoId);
        }
    }
    return html;
}

/**
 * Fetch the raw HTML content of a YouTube video page
 * @param {Object} httpClient - Axios HTTP client instance
 * @param {string} videoId - YouTube video ID
 * @returns {string} HTML content of the video page
 */
async function fetchHtml(httpClient, videoId) {
    // Make a request to the YouTube video page and return the HTML content
    const response = await httpClient.get(watchURL.replace('{video_id}', videoId), {
        headers: { 'Accept-Language': 'en-US' }
    });
    return unescape(response.data);
}

/**
 * Create a consent cookie to bypass YouTube's consent page
 * @param {Object} httpClient - Axios HTTP client instance
 * @param {string} html - HTML content of the consent page
 * @param {string} videoId - YouTube video ID
 * @throws {Error} If the consent cookie creation fails
 */
async function createConsentCookie(httpClient, html, videoId) {
    // Extract the consent value from the HTML content
    const match = html.match(/name="v" value="(.*?)"/);
    if (!match) {
        throw new failedToCreateConsentCookie(videoId);
    }
    // Set the consent cookie
    httpClient.defaults.jar.setCookieSync(`CONSENT=YES+${match[1]}`, 'https://www.youtube.com');
}

/**
 * Extract captions JSON from the YouTube video HTML
 * @param {string} html - HTML content of the video page
 * @param {string} videoId - YouTube video ID
 * @returns {Object} Captions JSON
 * @throws {Error} If no captions are found or an error occurs
 */
function extractCaptionsJson(html, videoId) {
    // Split the HTML content to find the captions JSON
    const splittedHtml = html.split('"captions":');

    if (splittedHtml.length <= 1) {
        // Handle various error cases based on the HTML content
        if (videoId.startsWith('http://') || videoId.startsWith('https://')) {
            throw new invalidVideoId(videoId);
        }
        if (html.includes('class="g-recaptcha"')) {
            throw new tooManyRequests(videoId);
        }
        if (!html.includes('"playabilityStatus":')) {
            throw new videoUnavailable(videoId);
        }
        throw new transcriptsDisabled(videoId);
    }

    // Parse the captions JSON from the HTML content
    const captionsJson = JSON.parse(
        splittedHtml[1].split(',"videoDetails')[0].replace('\n', '')
    ).playerCaptionsTracklistRenderer;

    if (!captionsJson) {
        throw new transcriptsDisabled(videoId);
    }

    if (!captionsJson.captionTracks) {
        throw new noTranscriptAvailable(videoId);
    }

    return captionsJson;
}

/**
 * Build a list of transcripts from the captions JSON
 * @param {Object} httpClient - Axios HTTP client instance
 * @param {string} videoId - YouTube video ID
 * @param {Object} captionsJson - Captions JSON object
 * @returns {Object} Transcript list object
 */
function buildTranscriptList(httpClient, videoId, captionsJson) {
    // Create a list of available translation languages
    const translationLanguages = captionsJson.translationLanguages.map(lang => ({
        language: lang.languageName.simpleText,
        language_code: lang.languageCode
    }));

    // Initialize dictionaries for manually created and generated transcripts
    const manuallyCreatedTranscripts = {};
    const generatedTranscripts = {};

    // Populate the transcript dictionaries
    captionsJson.captionTracks.forEach(caption => {
        const transcriptDict = caption.kind === 'asr' ? generatedTranscripts : manuallyCreatedTranscripts;
        transcriptDict[caption.languageCode] = createTranscript(
            httpClient,
            videoId,
            caption.baseUrl,
            caption.name.simpleText,
            caption.languageCode,
            caption.kind === 'asr',
            caption.isTranslatable ? translationLanguages : []
        );
    });

    return {
        videoId,
        manuallyCreatedTranscripts,
        generatedTranscripts,
        translationLanguages
    };
}

/**
 * Iterate through transcript lists
 * @param {Object} manuallyCreatedTranscripts - Manually created transcripts
 * @param {Object} generatedTranscripts - Generated transcripts
 * @returns {Generator} Iterator for transcripts
 */
function* transcriptListIterator(manuallyCreatedTranscripts, generatedTranscripts) {
    // Yield manually created transcripts
    yield* Object.values(manuallyCreatedTranscripts);
    // Yield generated transcripts
    yield* Object.values(generatedTranscripts);
}

/**
 * Find a transcript by language code
 * @param {Object} transcriptList - Transcript list object
 * @param {Array} languageCodes - List of preferred language codes
 * @returns {Object} Found transcript
 * @throws {Error} If no transcript is found
 */
function findTranscript(transcriptList, languageCodes) {
    // Try to find a manually created or generated transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts, transcriptList.generatedTranscripts]);
}

/**
 * Find a generated transcript by language code
 * @param {Object} transcriptList - Transcript list object
 * @param {Array} languageCodes - List of preferred language codes
 * @returns {Object} Found generated transcript
 * @throws {Error} If no generated transcript is found
 */
function findGeneratedTranscript(transcriptList, languageCodes) {
    // Try to find a generated transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.generatedTranscripts]);
}

/**
 * Find a manually created transcript by language code
 * @param {Object} transcriptList - Transcript list object
 * @param {Array} languageCodes - List of preferred language codes
 * @returns {Object} Found manually created transcript
 * @throws {Error} If no manually created transcript is found
 */
function findManuallyCreatedTranscript(transcriptList, languageCodes) {
    // Try to find a manually created transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts]);
}

/**
 * Helper function to find a transcript by language code
 * @param {Object} transcriptList - Transcript list object
 * @param {Array} languageCodes - List of preferred language codes
 * @param {Array} transcriptDicts - Array of transcript dictionaries
 * @returns {Object} Found transcript
 * @throws {Error} If no transcript is found
 */
function findTranscriptHelper(transcriptList, languageCodes, transcriptDicts) {
    // Iterate over preferred language codes and transcript dictionaries to find a match
    for (const code of languageCodes) {
        for (const dict of transcriptDicts) {
            if (dict[code]) {
                return dict[code];
            }
        }
    }
    throw new noTranscriptFound(transcriptList.videoId, languageCodes);
}

/**
 * Convert transcript list to a string
 * @param {Object} transcriptList - Transcript list object
 * @returns {string} String representation of available transcripts
 */
function transcriptListToString(transcriptList) {
    // Build a string representation of the available transcripts
    return `For this video (${transcriptList.videoId}) transcripts are available in the following languages:\n\n(MANUALLY CREATED)\n${getLanguageDescription(Object.values(transcriptList.manuallyCreatedTranscripts))}\n\n(GENERATED)\n${getLanguageDescription(Object.values(transcriptList.generatedTranscripts))}\n\n(TRANSLATION LANGUAGES)\n${getLanguageDescription(transcriptList.translationLanguages)}`;
}

/**
 * Get a string description of available languages from a list of transcripts
 * @param {Array} transcripts - List of transcripts
 * @returns {string} String representation of languages
 */
function getLanguageDescription(transcripts) {
    // Return a formatted string of available languages or 'None' if empty
    return transcripts.length > 0 ? transcripts.map(t => ` - ${t}`).join('\n') : 'None';
}

/**
 * Create a transcript object
 * @param {Object} httpClient - Axios HTTP client instance
 * @param {string} videoId - YouTube video ID
 * @param {string} url - Transcript URL
 * @param {string} language - Language of the transcript
 * @param {string} languageCode - Language code of the transcript
 * @param {boolean} isGenerated - Whether the transcript is generated
 * @param {Array} translationLanguages - List of translatable languages
 * @returns {Object} Transcript object
 */
function createTranscript(httpClient, videoId, url, language, languageCode, isGenerated, translationLanguages) {
    // Build a dictionary of translation languages
    const translationLanguagesDict = translationLanguages.reduce((acc, lang) => {
        acc[lang.language_code] = lang.language;
        return acc;
    }, {});

    return {
        httpClient,
        videoId,
        url,
        language,
        languageCode,
        isGenerated,
        translationLanguages,
        translationLanguagesDict,
        async fetch(preserveFormatting = false) {
            // Fetch and parse the transcript data
            const response = await httpClient.get(url, {
                headers: { 'Accept-Language': 'en-US' }
            });
            const parser = createTranscriptParser(preserveFormatting);
            return parser.parse(unescape(response.data));
        },
        toString() {
            // Return a string representation of the transcript
            return `${languageCode} ("${language}")${this.isTranslatable ? '[TRANSLATABLE]' : ''}`;
        },
        get isTranslatable() {
            // Check if the transcript is translatable
            return this.translationLanguages.length > 0;
        },
        async translate(languageCode) {
            // Translate the transcript to another language if possible
            if (!this.isTranslatable) {
                throw new notTranslatable(this.videoId);
            }
            if (!this.translationLanguagesDict[languageCode]) {
                throw new translationLanguageNotAvailable(this.videoId);
            }
            return createTranscript(
                httpClient,
                videoId,
                `${url}&tlang=${languageCode}`,
                this.translationLanguagesDict[languageCode],
                languageCode,
                true,
                []
            );
        }
    };
}

/**
 * Create a transcript parser
 * @param {boolean} [preserveFormatting=false] - Whether to preserve HTML formatting
 * @returns {Object} Transcript parser object
 */
function createTranscriptParser(preserveFormatting = false) {
    // Define a regex to remove or preserve HTML tags
    const htmlRegex = getHtmlRegex(preserveFormatting);
    return {
        parse(plainData) {
            // Parse the XML data into transcript objects
            const doc = new DOMParser().parseFromString(plainData, 'text/xml');
            return Array.from(doc.documentElement.getElementsByTagName('text')).map(el => ({
                text: el.textContent,
                start: parseFloat(el.getAttribute('start')),
                duration: parseFloat(el.getAttribute('dur') || '0.0')
            }));
        }
    };

    function getHtmlRegex(preserveFormatting) {
        // Return the appropriate regex for removing HTML tags
        if (preserveFormatting) {
            const formattingTags = ['strong', 'em', 'b', 'i', 'mark', 'small', 'del', 'ins', 'sub', 'sup'].join('|');
            return new RegExp(`<\/?(?!\/?(${formattingTags})\b).*?\b>`, 'gi');
        } else {
            return /<[^>]*>/gi;
        }
    }
}

export {
    fetchVideoHtml,
    fetchHtml,
    createConsentCookie,
    extractCaptionsJson,
    buildTranscriptList,
    transcriptListIterator,
    findTranscript,
    findGeneratedTranscript,
    findManuallyCreatedTranscript,
    transcriptListToString,
    createTranscript,
    createTranscriptParser
};
