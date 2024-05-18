# yt-script

**yt-script** is a command-line tool for fetching and formatting YouTube video transcripts. It supports multiple languages, various output formats, and optional translation of transcripts.

## Table of Contents

- [yt-script](#yt-script)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
    - [Global Installation](#global-installation)
    - [Local Installation](#local-installation)
  - [Usage](#usage)
    - [Fetching Transcripts](#fetching-transcripts)
    - [Options](#options)
    - [Examples](#examples)
  - [Development](#development)

## Features

- Fetches transcripts for YouTube videos.
- Supports multiple languages.
- Outputs transcripts in various formats (pretty, JSON, plain text, SRT, WebVTT).
- Option to translate transcripts to different languages.
- Lists available languages for transcripts.

## Installation

### Global Installation

To install `yt-script` globally, run:

```sh
npm install -g .
```

### Local Installation

To install `yt-script` locally for development or testing, run:

```sh
npm install .
```

## Usage

### Fetching Transcripts

The basic command to fetch a transcript is:

```sh
yt-script <video_id_or_url>
```

### Options

- `--list-transcripts`: List available languages for the given videos.
- `--languages <languages...>`: List of languages in descending priority (default: `['en']`).
- `--format <format>`: Output format (`pretty`, `json`, `text`, `srt`, `webvtt`; default: `pretty`).
- `--translate <language>`: Language to translate the transcript to.

### Examples

1. **Fetch transcript in default format (pretty):**

    ```sh
    yt-script https://www.youtube.com/watch?v=abcd1234EFG
    ```

2. **Fetch transcript in JSON format:**

    ```sh
    yt-script https://www.youtube.com/watch?v=abcd1234EFG --format json
    ```

3. **Fetch transcript and translate to French:**

    ```sh
    yt-script https://www.youtube.com/watch?v=abcd1234EFG --translate fr
    ```

4. **List available languages for a video:**

    ```sh
    yt-script https://www.youtube.com/watch?v=abcd1234EFG --list-transcripts
    ```

5. **Fetch transcript with multiple languages prioritized:**

    ```sh
    yt-script https://www.youtube.com/watch?v=abcd1234EFG --languages en fr de
    ```

## Development

For development, clone the repository and install the dependencies:

```sh
git clone https://github.com/zshmeta/ytScript.git
cd ytScript
npm install
```

Run the script locally:

```sh
node index.js <video_id_or_url>
```
