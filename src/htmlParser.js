#!/usr/bin/env node
import { parse } from 'node-html-parser';


export function parseHtml(string) {
    return parse(string).innerText;
}

