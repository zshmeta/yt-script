#!/usr/bin/env node
import { DOMParser } from 'xmldom';
import { watchURL} from './settings.js';
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
import axios from 'axios';
import tough from 'tough-cookie';
import fs from 'fs';


// Fetch video HTML and extract captions JSON
async function fetchVideoHtml(httpClient, videoId) {
    let html = await fetchHtml(httpClient, videoId);
    if (html.includes('action="https://consent.youtube.com/s"')) {
        await createConsentCookie(httpClient, html, videoId);
        html = await fetchHtml(httpClient, videoId);
        if (html.includes('action="https://consent.youtube.com/s"')) {
            throw new errors.FailedToCreateConsentCookie(videoId);
        }
    }
    return html;
}

async function fetchHtml(httpClient, videoId) {
    const response = await httpClient.get(settings.watchURL.replace('{video_id}', videoId), {
        headers: { 'Accept-Language': 'en-US' }
    });
    return unescape(response.data);
}

async function createConsentCookie(httpClient, html, videoId) {
    const match = html.match(/name="v" value="(.*?)"/);
    if (!match) {
        throw new errors.FailedToCreateConsentCookie(videoId);
    }
    httpClient.defaults.jar.setCookieSync(`CONSENT=YES+${match[1]}`, 'https://www.youtube.com');
}

function extractCaptionsJson(html, videoId) {
    const splittedHtml = html.split('"captions":');

    if (splittedHtml.length <= 1) {
        if (videoId.startsWith('http://') || videoId.startsWith('https://')) {
            throw new errors.InvalidVideoId(videoId);
        }
        if (html.includes('class="g-recaptcha"')) {
            throw new errors.TooManyRequests(videoId);
        }
        if (!html.includes('"playabilityStatus":')) {
            throw new errors.VideoUnavailable(videoId);
        }
        throw new errors.TranscriptsDisabled(videoId);
    }

    const captionsJson = JSON.parse(
        splittedHtml[1].split(',"videoDetails')[0].replace('\n', '')
    ).playerCaptionsTracklistRenderer;

    if (!captionsJson) {
        throw new errors.TranscriptsDisabled(videoId);
    }

    if (!captionsJson.captionTracks) {
        throw new errors.NoTranscriptAvailable(videoId);
    }

    return captionsJson;
}

// Build transcript list
function buildTranscriptList(httpClient, videoId, captionsJson) {
    const translationLanguages = captionsJson.translationLanguages.map(lang => ({
        language: lang.languageName.simpleText,
        language_code: lang.languageCode
    }));

    const manuallyCreatedTranscripts = {};
    const generatedTranscripts = {};

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

function* transcriptListIterator(manuallyCreatedTranscripts, generatedTranscripts) {
    yield* Object.values(manuallyCreatedTranscripts);
    yield* Object.values(generatedTranscripts);
}

function findTranscript(transcriptList, languageCodes) {
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts, transcriptList.generatedTranscripts]);
}

function findGeneratedTranscript(transcriptList, languageCodes) {
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.generatedTranscripts]);
}

function findManuallyCreatedTranscript(transcriptList, languageCodes) {
    return findTranscriptHelper(transcriptList, languageCodes, [transcriptList.manuallyCreatedTranscripts]);
}

function findTranscriptHelper(transcriptList, languageCodes, transcriptDicts) {
    for (const code of languageCodes) {
        for (const dict of transcriptDicts) {
            if (dict[code]) {
                return dict[code];
            }
        }
    }
    throw new errors.NoTranscriptFound(transcriptList.videoId, languageCodes);
}

function transcriptListToString(transcriptList) {
    return `For this video (${transcriptList.videoId}) transcripts are available in the following languages:\n\n(MANUALLY CREATED)\n${getLanguageDescription(Object.values(transcriptList.manuallyCreatedTranscripts))}\n\n(GENERATED)\n${getLanguageDescription(Object.values(transcriptList.generatedTranscripts))}\n\n(TRANSLATION LANGUAGES)\n${getLanguageDescription(transcriptList.translationLanguages)}`;
}

function getLanguageDescription(transcripts) {
    return transcripts.length > 0 ? transcripts.map(t => ` - ${t}`).join('\n') : 'None';
}

// Transcript creation
function createTranscript(httpClient, videoId, url, language, languageCode, isGenerated, translationLanguages) {
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
            const response = await httpClient.get(url, {
                headers: { 'Accept-Language': 'en-US' }
            });
            const parser = createTranscriptParser(preserveFormatting);
            return parser.parse(unescape(response.data));
        },
        toString() {
            return `${languageCode} ("${language}")${this.isTranslatable ? '[TRANSLATABLE]' : ''}`;
        },
        get isTranslatable() {
            return this.translationLanguages.length > 0;
        },
        async translate(languageCode) {
            if (!this.isTranslatable) {
                throw new errors.NotTranslatable(this.videoId);
            }
            if (!this.translationLanguagesDict[languageCode]) {
                throw new errors.TranslationLanguageNotAvailable(this.videoId);
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

// Transcript parser
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
