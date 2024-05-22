#!/usr/bin/env node

import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs';

class YouTubeTranscriptApi {
    /**
     * List available transcripts for a YouTube video.
     * @param {string} videoId - The YouTube video ID.
     * @param {Object|null} proxies - Proxy configuration.
     * @param {string|null} cookies - Path to the cookies file.
     * @returns {Promise<Object>} The list of available transcripts.
     */
    static async listTranscripts(videoId, proxies = null, cookies = null) {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));

        if (cookies) {
            await this.loadCookies(jar, cookies);
        }

        if (proxies) {
            client.defaults.proxy = proxies;
        }

        // Assuming TranscriptListFetcher.fetch() returns a promise
        const transcriptListFetcher = new TranscriptListFetcher(client);
        return transcriptListFetcher.fetch(videoId);
    }

    /**
     * Get transcripts for a list of YouTube videos.
     * @param {Array<string>} videoIds - The list of YouTube video IDs.
     * @param {Array<string>} [languages=['en']] - Preferred languages for the transcripts.
     * @param {boolean} [continueAfterError=false] - Whether to continue fetching after an error.
     * @param {Object|null} proxies - Proxy configuration.
     * @param {string|null} cookies - Path to the cookies file.
     * @param {boolean} [preserveFormatting=false] - Whether to preserve HTML formatting in transcripts.
     * @returns {Promise<Object>} The fetched transcripts and any unretrievable video IDs.
     */
    static async getTranscripts(videoIds, languages = ['en'], continueAfterError = false, proxies = null, cookies = null, preserveFormatting = false) {
        if (!Array.isArray(videoIds)) {
            throw new Error('`videoIds` must be a list of strings');
        }

        const data = {};
        const unretrievableVideos = [];

        for (const videoId of videoIds) {
            try {
                data[videoId] = await this.getTranscript(videoId, languages, proxies, cookies, preserveFormatting);
            } catch (error) {
                if (!continueAfterError) {
                    throw error;
                }
                unretrievableVideos.push(videoId);
            }
        }

        return { data, unretrievableVideos };
    }

    /**
     * Get a transcript for a single YouTube video.
     * @param {string} videoId - The YouTube video ID.
     * @param {Array<string>} [languages=['en']] - Preferred languages for the transcript.
     * @param {Object|null} proxies - Proxy configuration.
     * @param {string|null} cookies - Path to the cookies file.
     * @param {boolean} [preserveFormatting=false] - Whether to preserve HTML formatting in the transcript.
     * @returns {Promise<Object>} The fetched transcript.
     */
    static async getTranscript(videoId, languages = ['en'], proxies = null, cookies = null, preserveFormatting = false) {
        if (typeof videoId !== 'string') {
            throw new Error('`videoId` must be a string');
        }
        const transcriptList = await this.listTranscripts(videoId, proxies, cookies);
        return transcriptList.findTranscript(languages).fetch({ preserveFormatting });
    }

    /**
     * Load cookies into the provided cookie jar from a file.
     * @param {CookieJar} jar - The cookie jar to load cookies into.
     * @param {string} cookiesPath - Path to the cookies file.
     * @returns {Promise<void>}
     */
    static async loadCookies(jar, cookiesPath) {
        return new Promise((resolve, reject) => {
            fs.readFile(cookiesPath, 'utf8', (err, data) => {
                if (err) {
                    return reject(new CookiePathInvalid());
                }

                try {
                    jar.setCookieSync(data, 'https://www.youtube.com');
                    resolve();
                } catch (e) {
                    reject(new CookiesInvalid());
                }
            });
        });
    }
}

// Placeholder for missing dependencies
class TranscriptListFetcher {
    constructor(client) {
        this.client = client;
    }

    /**
     * Fetch the transcript list for a video.
     * @param {string} videoId - The YouTube video ID.
     * @returns {Promise<Object>} The fetched transcript list.
     */
    fetch(videoId) {
        // Placeholder method
        return Promise.resolve({
            findTranscript: (languages) => ({
                fetch: ({ preserveFormatting }) => {
                    // Placeholder fetch implementation
                    return Promise.resolve([{
                        text: 'Example transcript text',
                        start: 0.0,
                        end: 10.0
                    }]);
                }
            })
        });
    }
}

// Custom error classes
class CookiePathInvalid extends Error {
    constructor() {
        super('The cookie path provided is invalid.');
        this.name = 'CookiePathInvalid';
    }
}

class CookiesInvalid extends Error {
    constructor() {
        super('The cookies provided are invalid.');
        this.name = 'CookiesInvalid';
    }
}

module.exports = YouTubeTranscriptApi;
