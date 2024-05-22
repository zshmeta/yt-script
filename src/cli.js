#!/usr/bin/env node

import { Command } from 'commander'; 
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
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
    FormatterFactory,
    formatTimestamp // Import the formatTimestamp function
} from './formatter.js';
import { watchURL } from './settings.js';

// Create a fetch client with cookie jar support
const fetchWithCookies = fetchCookie(fetch);

// Function to format the start and duration fields
function formatTranscriptTimestamps(transcript) {
    return transcript.map(line => ({
        ...line,
        start: formatTimestamp(line.start),
        duration: `${line.duration}s`
    }));
}

// Main function to run the YouTube transcript fetching script
const ytScript = async () => {
    // Function to parse command line arguments
    function parseArguments() {
        const program = new Command();

        // Defining command line arguments and options
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

    // Function to fetch and format transcripts based on options
    async function fetchAndFormatTranscripts(options) {
        // Destructuring options
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

        // Error handling for mutually exclusive options
        if (excludeGenerated && excludeManuallyCreated) {
            return 'Error: Both --exclude-generated and --exclude-manually-created options cannot be used together.';
        }

        // Setting up proxies if provided
        const proxies = (httpProxy || httpsProxy) ? { http: httpProxy, https: httpsProxy } : null;
        // Reading cookies file if provided
        if (cookies) {
            const cookiesData = fs.readFileSync(cookies, 'utf8').split('\n');
            cookiesData.forEach(cookie => {
                fetchWithCookies.defaults.headers.cookie = (fetchWithCookies.defaults.headers.cookie || '') + `; ${cookie}`;
            });
        }

        const transcripts = [];
        const exceptions = [];

        // Fetching transcripts for each video ID
        for (const videoId of video_ids) {
            try {
                const transcript = await fetchTranscript(videoId, proxies, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate);
                const formattedTranscript = formatTranscriptTimestamps(transcript); // Format timestamps
                transcripts.push(formattedTranscript);
            } catch (exception) {
                exceptions.push(exception);
            }
        }

        // Formatting the transcripts
        const formatter = FormatterFactory(format);
        return [...exceptions.map(e => e.toString()), transcripts.length ? formatter(transcripts) : ''].join('\n\n');
    }

    // Function to fetch transcript for a specific video ID
    async function fetchTranscript(videoId, proxies, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate) {
        // Setting up fetch options
        const fetchOptions = {
            headers: {
                'Accept-Language': 'en-US'
            }
        };

        if (proxies) {
            fetchOptions.agent = proxies;
        }

        // Fetching video HTML and extracting captions JSON
        const html = await fetchVideoHtml(videoId, fetchOptions);
        const captionsJson = extractCaptionsJson(html, videoId);
        const transcriptList = buildTranscriptList(videoId, captionsJson);

        // If listTranscripts option is provided, return the list of available transcripts
        if (listTranscripts) {
            return transcriptListToString(transcriptList);
        }

        // Finding the appropriate transcript based on options
        let transcript;
        if (excludeGenerated) {
            transcript = findManuallyCreatedTranscript(transcriptList, languages);
        } else if (excludeManuallyCreated) {
            transcript = findGeneratedTranscript(transcriptList, languages);
        } else {
            transcript = findTranscript(transcriptList, languages);
        }

        // If translate option is provided, translate the transcript
        if (translate) {
            transcript = await transcript.translate(translate);
        }

        // Fetching the transcript
        return await transcript.fetch();
    }

    // Function to convert transcript list to a string
    function transcriptListToString(transcriptList) {
        return `For this video (${transcriptList.videoId}) transcripts are available in the following languages:\n\n(MANUALLY CREATED)\n${getLanguageDescription(Object.values(transcriptList.manuallyCreatedTranscripts))}\n\n(GENERATED)\n${getLanguageDescription(Object.values(transcriptList.generatedTranscripts))}\n\n(TRANSLATION LANGUAGES)\n${getLanguageDescription(transcriptList.translationLanguages)}`;
    }

    // Function to get language description from transcript array
    function getLanguageDescription(transcripts) {
        return transcripts.length > 0 ? transcripts.map(t => ` - ${t}`).join('\n') : 'None';
    }

    // Function to run the main script
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

    // Function to fetch HTML content of a YouTube video page
    async function fetchVideoHtml(videoId, fetchOptions) {
        const response = await fetchWithCookies(watchURL.replace('{video_id}', videoId), fetchOptions);
        const text = await response.text();
        return unescape(text);
    }

    run();
};

export default ytScript;
