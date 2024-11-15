const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

// API keys and file path
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const FILE_PATH = './misc/gameAbbreviations.json';

/**
 * Logs a message if LOG_COMMANDS is enabled.
 * @param {string} message - The message to log.
 */
function logOperation(message) {
    if (process.env.LOG_COMMANDS === 'true') {
        console.log(`[INFO] ${message}`);
    }
}

/**
 * Validates if the subreddit name is a suitable match for the game name based on character sequence.
 * @param {string} subredditName - The name found in the subreddit.
 * @param {string} gameName - The full game name to compare against.
 * @param {number} threshold - Percentage threshold for a valid match.
 * @returns {boolean} - True if match is valid.
 */
function isValidMatch(subredditName, gameName, threshold = 0.8) {
    let subredditIndex = 0;
    let matchCount = 0;
    const normalizedSubreddit = subredditName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const normalizedGameName = gameName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    for (const char of normalizedGameName) {
        if (char === normalizedSubreddit[subredditIndex]) {
            matchCount++;
            subredditIndex++;
            if (subredditIndex >= normalizedSubreddit.length) break;
        }
    }

    const matchPercentage = matchCount / normalizedSubreddit.length;
    return matchPercentage >= threshold;
}

/**
 * Queries Google to find subreddit abbreviations for a game name.
 * @param {string} gameName - The name of the game.
 * @returns {Promise<string|null>} - The best-matching subreddit name or null if not found.
 */
async function queryGoogleForAbbreviation(gameName) {
    let abbreviations = loadAbbreviationsFromFile();
    if (abbreviations[gameName]) return abbreviations[gameName];

    const query = `"${gameName}"`;
    const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}`;
    try {
        logOperation(`Querying Google for abbreviation: ${gameName}`);
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const url = item.link;
                const subredditMatch = url.match(/reddit\.com\/r\/(\w+)/);
                if (subredditMatch) {
                    let subredditName = subredditMatch[1];
                    subredditName = subredditName.charAt(0).toUpperCase() + subredditName.slice(1); // Capitalize first letter

                    if (isValidMatch(subredditName, gameName)) {
                        abbreviations[gameName] = subredditName;
                        saveAbbreviationsToFile(abbreviations);
                        logOperation(`Found valid subreddit match for "${gameName}": ${subredditName}`);
                        return subredditName;
                    }
                }
            }
        }
        logOperation(`No subreddit match found for "${gameName}"`);
        return null;
    } catch (error) {
        console.error('[ERROR] Error querying Google for abbreviation:', error);
        return null;
    }
}

/**
 * Loads game abbreviations from a JSON file.
 * @returns {Object} - The abbreviations object.
 */
function loadAbbreviationsFromFile() {
    if (fs.existsSync(FILE_PATH)) {
        try {
            logOperation('Loading abbreviations from file.');
            const data = fs.readFileSync(FILE_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[ERROR] Error loading abbreviations file:', error);
            return {};
        }
    }
    logOperation('No abbreviations file found. Returning empty object.');
    return {};
}

/**
 * Saves game abbreviations to a JSON file.
 * @param {Object} abbreviations - Abbreviations to save.
 */
function saveAbbreviationsToFile(abbreviations) {
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(abbreviations, null, 2));
        logOperation('Abbreviations successfully saved to file.');
    } catch (error) {
        console.error('[ERROR] Error saving abbreviations file:', error);
    }
}

module.exports = {
    queryGoogleForAbbreviation,
    loadAbbreviationsFromFile,
    saveAbbreviationsToFile
};
