import { parse } from 'node-html-parser';


function unescapeParser(string) {
    return parse(string).innerText;
}

module.exports = unescapeParser;
