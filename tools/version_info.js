// Reads the version number in package.json
// Reads the most recent git commit hash.
// Returns the current timestamp.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let VEXFLOW_VERSION;
let GIT_COMMIT_ID;
let DATE;

function readGitCommitId() {
  const packagedCommitId = process.env.VEXFLOW_GIT_COMMIT_ID || process.env.npm_package_gitHead;
  if (packagedCommitId) {
    return packagedCommitId.trim();
  }

  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_error) {
    // npm prepares Git dependencies from a source snapshot without repository
    // metadata. The build must remain usable even when npm does not expose the
    // pinned revision through npm_package_gitHead.
    return 'unknown';
  }
}

function updateInfo() {
  VEXFLOW_VERSION = JSON.parse(fs.readFileSync('package.json')).version;
  GIT_COMMIT_ID = readGitCommitId();
  DATE = new Date().toISOString();
}

updateInfo();

module.exports = {
  VERSION: VEXFLOW_VERSION,
  ID: GIT_COMMIT_ID,
  DATE: DATE,

  // Save the build information to build/esm/src/version.js
  saveESMVersionFile() {
    const parentDir = path.join(__dirname, '..', 'build', 'esm', 'src');
    const outputFile = path.join(parentDir, 'version.js');

    const V = `export const VERSION = '${VEXFLOW_VERSION}';`;
    const I = `export const ID = '${GIT_COMMIT_ID}';`;
    const D = `export const DATE = '${DATE}';`;

    console.log(`Writing ESM version data to ${outputFile}`);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(outputFile, `${V}\n${I}\n${D}`);
  },

  update: updateInfo,
};
