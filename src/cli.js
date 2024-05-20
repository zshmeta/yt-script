#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';
import tough from 'tough-cookie';
import fs from 'fs';
import {
    fetchVideoHtml,
    extractCaptionsJson,
    buildTranscriptList,
    findTranscript,
    findGeneratedTranscript,
    findManuallyCreatedTranscript
} from './transcripts.js';
import {
    formatPretty,
    formatJSON,
    formatPlainText,
    FormatterFactory
} from './formatter.js';
import { watchURL } from './settings.js';

/**
 * Main function to run the YouTube transcript fetching script
 */
const ytScript = async () => {
    /**
     * Parse command line arguments
     * @returns {Object} Parsed options and arguments
     */
    function parseArguments() {
        const program = new Command();

        program
            .name('yt-script')
            .description('Fetch YouTube video transcripts.')
            .argument('<video_ids...>', 'List of YouTube video IDs.')
            .option('--list-transcripts', 'List available languages for the given videos.')
            .option('--languages <languages...>', 'List of languages in descending priority', ['en'])
            .option('--exclude-generated', 'Exclude automatically generated transcripts.')
            .option('--exclude-manually-created', 'Exclude manually created transcripts.')
            .option('--format <format>', 'Output format', 'pretty')
            .option('--translate <language>', 'Language to translate the transcript to.')
            .option('--http-proxy <url>', 'HTTP proxy URL.')
            .option('--https-proxy <url>', 'HTTPS proxy URL.')
            .option('--cookies <file>', 'Path to cookies file.');

        program.parse(process.argv);

        // Display help if no arguments are provided
        if (process.argv.length <= 2) {
            program.help();
        }

        const options = program.opts();
        options.video_ids = program.args; // Extract video_ids from arguments
        return options;
    }

    /**
     * Fetch and format transcripts based on options
     * @param {Object} options - Parsed options from command line arguments
     * @returns {string} Formatted transcripts or error messages
     */
    async function fetchAndFormatTranscripts(options) {
        const {
            video_ids,
            listTranscripts,
            languages,
            excludeGenerated,
            excludeManuallyCreated,
            format,
            translate,
            httpProxy,
            httpsProxy,
            cookies
        } = options;

        if (excludeGenerated && excludeManuallyCreated) {
            return 'Error: Both --exclude-generated and --exclude-manually-created options cannot be used together.';
        }

        const proxies = (httpProxy || httpsProxy) ? { http: httpProxy, https: httpsProxy } : null;
        const cookiesData = cookies ? fs.readFileSync(cookies, 'utf8') : null;
        const transcripts = [];
        const exceptions = [];

        for (const videoId of video_ids) {
            try {
                const transcript = await fetchTranscript(videoId, proxies, cookiesData, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate);
                transcripts.push(transcript);
            } catch (exception) {
                exceptions.push(exception);
            }
        }

        const formatter = FormatterFactory(format);
        return [...exceptions.map(e => e.toString()), transcripts.length ? formatter(transcripts) : ''].join('\n\n');
    }

    /**
     * Fetch transcript for a specific video ID
     * @param {string} videoId - YouTube video ID
     * @param {Object|null} proxies - Proxy configuration
     * @param {string|null} cookiesData - Cookies data
     * @param {Array} languages - Preferred languages
     * @param {boolean} listTranscripts - Flag to list available transcripts
     * @param {boolean} excludeGenerated - Flag to exclude generated transcripts
     * @param {boolean} excludeManuallyCreated - Flag to exclude manually created transcripts
     * @param {string} translate - Language to translate the transcript to
     * @returns {string} Formatted transcript or transcript list
     */
    async function fetchTranscript(videoId, proxies, cookiesData, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate) {
        const httpClient = axios.create({ proxy: proxies });
        httpClient.defaults.jar = new tough.CookieJar();

        if (cookiesData) {
            cookiesData.split('\n').forEach(cookie => {
                if (cookie.trim()) {
                    httpClient.defaults.jar.setCookieSync(cookie, 'https://www.youtube.com');
                }
            });
        }

        const html = await fetchVideoHtml(httpClient, videoId);
        const captionsJson = extractCaptionsJson(html, videoId);
        const transcriptList = buildTranscriptList(httpClient, videoId, captionsJson);

        if (listTranscripts) {
            return transcriptListToString(transcriptList);
        }

        let transcript;
        if (excludeGenerated) {
            transcript = findManuallyCreatedTranscript(transcriptList, languages);
        } else if (excludeManuallyCreated) {
            transcript = findGeneratedTranscript(transcriptList, languages);
        } else {
            transcript = findTranscript(transcriptList, languages);
        }

        if (translate) {
            transcript = await transcript.translate(translate);
        }

        return await transcript.fetch();
    }

    /**
     * Convert transcript list to a string
     * @param {Object} transcriptList - Transcript list object
     * @returns {string} String representation of available transcripts
     */
    function transcriptListToString(transcriptList) {
        return `For this video (${transcriptList.videoId}) transcripts are available in the following languages:\n\n(MANUALLY CREATED)\n${getLanguageDescription(Object.values(transcriptList.manuallyCreatedTranscripts))}\n\n(GENERATED)\n${getLanguageDescription(Object.values(transcriptList.generatedTranscripts))}\n\n(TRANSLATION LANGUAGES)\n${getLanguageDescription(transcriptList.translationLanguages)}`;
    }

    /**
     * Get language description from transcript array
     * @param {Array} transcripts - Array of transcripts
     * @returns {string} String representation of languages
     */
    function getLanguageDescription(transcripts) {
        return transcripts.length > 0 ? transcripts.map(t => ` - ${t}`).join('\n') : 'None';
    }

    /**
     * Run the main script
     */
    async function run() {
        try {
            const options = parseArguments();
            const output = await fetchAndFormatTranscripts(options);
            console.log(output);
        } catch (err) {
            console.error('An error occurred:', err);
            parseArguments().help();
        }
    }

    /**
     * Fetch HTML content of a YouTube video page
     * @param {Object} httpClient - Axios HTTP client instance
     * @param {string} videoId - YouTube video ID
     * @returns {string} HTML content of the video page
     */
    async function fetchVideoHtml(httpClient, videoId) {
        const response = await httpClient.get(watchURL.replace('{video_id}', videoId), {
            headers: { 'Accept-Language': 'en-US' }
        });
        return unescape(response.data);
    }

    run();
};

export default ytScript;
