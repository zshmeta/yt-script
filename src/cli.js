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

// Create a fetch client with cookie jar support
const fetchWithCookies = fetchCookie(fetch);

/**
 * Helper function to format the start time and duration of each transcript line.
 */
function transformTranscriptData(transcript, format) {
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
            .argument('<video_id>', 'YouTube video ID.')
            .option('--list-transcripts', 'List available languages for the given videos.')
            .option('--languages <languages...>', 'List of languages in descending priority', ['en'])
            .option('--format <format>', 'Output format', 'text')
            .option('--translate <language>', 'Language to translate the transcript to.')
            .option('--exclude-generated', 'Exclude automatically generated transcripts.')
            .option('--exclude-manually-created', 'Exclude manually created transcripts.')
            
    
        program.parse(process.argv);
    
        const options = program.opts();

        options.video_id = program.args[0]

        function getVideoId(target) {
            // if target is not a url return target
            if (!target.includes('http')) {
                return target;
            }
            // regex to get video id from url
            const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
            const matches = target.match(regex);
            return matches ? matches[1] : null;
            return target;
        }
        options.video_id = getVideoId(options.video_id);
        console.log(options.video_id);

        // Display help if no video_id is provided
        if (!options.video_id) {
            program.help();
        }

    
        return options;
    }


    // Function to fetch and format transcripts based on options
    async function fetchAndFormatTranscripts(options) {
        // Destructuring options
        const {
            video_id,https:
            listTranscripts,
            languages,
            excludeGenerated,
            excludeManuallyCreated,
            format,
            translate,
        } = options;

        // Fetching the transcript
        const transcripts = [];
        const exceptions = [];

        try {
            const transcript = await fetchTranscript(video_id, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate);
            // Transforming the transcript data
            const formattedTranscript = transformTranscriptData(transcript);
            transcripts.push(formattedTranscript);
        } catch (exception) {
            exceptions.push(exception);
        }

        // Formatting the transcripts
        const formatter = FormatterFactory(format);
        return [...exceptions.map(e => e.toString()), transcripts.length ? formatter(transcripts) : ''].join('\n\n');
    }

    // Function to fetch transcript for a specific video ID
    async function fetchTranscript(videoId, languages, listTranscripts, excludeGenerated, excludeManuallyCreated, translate) {
        // Setting up fetch options
        const fetchOptions = {
            headers: {
                'Accept-Language': 'en-US'
            }
        };

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
            program.help();
        }
    }
    const watchURL = 'https://www.youtube.com/watch?v={video_id}';

    // Function to fetch HTML content of a YouTube video page
    async function fetchVideoHtml(videoId, fetchOptions) {
        const response = await fetchWithCookies(watchURL.replace('{video_id}', videoId), fetchOptions);
        const text = await response.text();
        return unescape(text);
    }

    run();
};

export default ytScript;

ytScript();
