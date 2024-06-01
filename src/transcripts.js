#!/usr/bin/env node

import { DOMParser } from 'xmldom';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import fs from 'fs';
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

// Create a fetch client with cookie jar support
const fetchWithCookies = fetchCookie(fetch);

// Fetch the HTML content of a YouTube video page and handle consent cookie creation

async function fetchVideoHtml(videoId) {
    // Fetch the HTML content of the video page
    let html = await fetchHtml(videoId);
    // Check if consent cookie is required
    if (html.includes('action="https://consent.youtube.com/s"')) {
        await createConsentCookie(html, videoId);
        // Fetch the HTML content again after setting the consent cookie
        html = await fetchHtml(videoId);
        if (html.includes('action="https://consent.youtube.com/s"')) {
            throw new failedToCreateConsentCookie(videoId);
        }
    }
    return html;
}

// Fetch the raw HTML content of a YouTube video page
const watchURL = 'https://www.youtube.com/watch?v={video_id}';
async function fetchHtml(videoId) {
    // First attempt to fetch the video page without specifying a language
    let response = await fetchWithCookies(watchURL.replace('{video_id}', videoId));
    let text = await response.text();

    // Check if the response indicates a failure due to language settings
    if (text.includes('action="https://consent.youtube.com/s"') || text.includes('yt-uix-button')) {
        // Retry with a specific language header as a fallback
        response = await fetchWithCookies(watchURL.replace('{video_id}', videoId), {
            headers: { 'Accept-Language': 'en-US' }
        });
        text = await response.text();
    }

    return unescape(text);
}

// Create a consent cookie to bypass YouTube's consent page
async function createConsentCookie(html, videoId) {
    // Extract the consent value from the HTML content
    const match = html.match(/name="v" value="(.*?)"/);
    if (!match) {
        throw new failedToCreateConsentCookie(videoId);
    }
    // Set the consent cookie
    await fetchWithCookies('https://www.youtube.com', {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `CONSENT=YES+${match[1]}`,
        method: 'POST'
    });
}

// Extract captions JSON from the YouTube video HTML
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

// Build a list of transcripts from the captions JSON

function buildTranscriptList(videoId, captionsJson) {
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

// Iterate through transcript lists
function* transcriptListIterator(manuallyCreatedTranscripts, generatedTranscripts) {
    // Yield manually created transcripts
    yield* Object.values(manuallyCreatedTranscripts);
    // Yield generated transcripts
    yield* Object.values(generatedTranscripts);
}

// Find a transcript by language code
function findTranscript(transcriptList, languageCodes) {
    // Try to find a manually created or generated transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts, transcriptList.generatedTranscripts]);
}

// Find a generated transcript by language code
function findGeneratedTranscript(transcriptList, languageCodes) {
    // Try to find a generated transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.generatedTranscripts]);
}

// Find a manually created transcript by language code
function findManuallyCreatedTranscript(transcriptList, languageCodes) {
    // Try to find a manually created transcript in the preferred languages
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts]);
}

// Helper function to find a transcript by language code
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

// Convert transcript list to a string

function transcriptListToString(transcriptList) {
    // Build a string representation of the available transcripts
    return `For this video (${transcriptList.videoId}) transcripts are available in the following languages:\n\n(MANUALLY CREATED)\n${getLanguageDescription(Object.values(transcriptList.manuallyCreatedTranscripts))}\n\n(GENERATED)\n${getLanguageDescription(Object.values(transcriptList.generatedTranscripts))}\n\n(TRANSLATION LANGUAGES)\n${getLanguageDescription(transcriptList.translationLanguages)}`;
}

// Get a string description of available languages from a list of transcripts
function getLanguageDescription(transcripts) {
    // Return a formatted string of available languages or 'None' if empty
    return transcripts.length > 0 ? transcripts.map(t => ` - ${t.language} (${t.language_code})`).join('\n') : 'None';
}

/* Create a transcript object */
function createTranscript(videoId, url, language, languageCode, isGenerated, translationLanguages) {
    const translationLanguagesDict = translationLanguages.reduce((acc, lang) => {
        acc[lang.language_code] = lang.language;
        return acc;
    }, {});

    return {
        videoId,
        url,
        language,
        languageCode,
        isGenerated,
        translationLanguages,
        translationLanguagesDict,
        async fetch(preserveFormatting = false) {
            // Try fetching without specifying language first
            let response = await fetchWithCookies(url);
            let text = await response.text();

            // If the response is not successful, retry with 'en-US' language header
            if (!response.ok) {
                response = await fetchWithCookies(url, {
                    headers: { 'Accept-Language': 'en-US' }
                });
                text = await response.text();
            }

            const parser = createTranscriptParser(preserveFormatting);
            return parser.parse(unescape(text));
        },
        toString() {
            return `${languageCode} ("${language}")${this.isTranslatable ? '[TRANSLATABLE]' : ''}`;
        },
        get isTranslatable() {
            return this.translationLanguages.length > 0;
        },
        async translate(languageCode) {
            if (!this.isTranslatable) {
                throw new notTranslatable(this.videoId);
            }
            if (!this.translationLanguagesDict[languageCode]) {
                throw new translationLanguageNotAvailable(this.videoId);
            }
            return createTranscript(
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

// Create a transcript parser

function createTranscriptParser(preserveFormatting = false) {
    const htmlRegex = getHtmlRegex(preserveFormatting);
    return {
        parse(plainData) {
            const doc = new DOMParser().parseFromString(plainData, 'text/xml');
            return Array.from(doc.documentElement.getElementsByTagName('text')).map(el => ({
                text: el.textContent,
                start: parseFloat(el.getAttribute('start')),
                duration: parseFloat(el.getAttribute('dur') || '0.0')
            }));
        }
    };

    function getHtmlRegex(preserveFormatting) {
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
