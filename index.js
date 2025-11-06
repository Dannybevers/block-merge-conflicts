import * as fs from "fs/promises";
import * as core from "@actions/core";
import * as github from "@actions/github";

import leaveComment from "./lib/comment";

const commentTpl = `This Pull Request may conflict if the Pull Requests below are merged first.\n\n`;

async function run() {
  const token = core.getInput("token", { required: true });
  if (!github.context.payload.pull_request) {
    return;
  }
  const pr = github.context.payload.pull_request.number;
  const octokit = github.getOctokit(token);
  const files = [];

  core.startGroup(
    `Fetching list of changed files for PR#${pr} from Github API`,
  );
  try {
    for await (const response of octokit.paginate.iterator(
      octokit.rest.pulls.listFiles.endpoint.merge({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr,
      }),
    )) {
      if (response.status !== 200) {
        throw new Error(
          `Fetching list of changed files from GitHub API failed with error code ${response.status}`,
        );
      }
      core.info(`Received ${response.data.length} items`);
      for (const row of response.data) {
        core.info(`[${row.status}] ${row.filename}`);
        if (row.status === "removed") {
          continue;
        }
        files.push(row.filename);
      }
    }
  } finally {
    core.endGroup();
  }

  let conflictFound = false;
  let conflictBody = commentTpl;
  let debugFound = false;
  let debugBody =
    "Heads up! Found leftover debugging functions in this Pull Request:\n\n";

  core.startGroup(
    `Searching for conflict markers and debug calls in changed files`,
  );
  try {
    const debugRegex = /@?(showe|show|dump|dumps)\s*\(/i;

    const promises = files.map(async (filename) => {
      try {
        const buf = await fs.readFile(filename);
        core.info(`Analyzing the "${filename}" file`);
        const fileContent = buf.toString();
        const lines = fileContent.split(/\r?\n/);

        let idx1 = -1;
        let idx2 = -1;
        let conflictLines = [];

        lines.forEach((line, i) => {
          if (idx1 === -1) {
            if (line.startsWith("<<<<<<<")) idx1 = i;
          } else if (idx2 === -1) {
            if (line.startsWith("=======")) idx2 = i;
          } else {
            if (line.startsWith(">>>>>>>")) {
              conflictLines.push(idx1 + 1);

              idx1 = -1;
              idx2 = -1;
            }
          }
        });

        let debugLinesFound = [];
        lines.forEach((line, i) => {
          if (debugRegex.test(line)) {
            debugLinesFound.push({ line: i + 1, content: line.trim() });
          }
        });

        return { filename, conflictLines, debugLinesFound };
      } catch (err) {
        core.warning(
          `Could not read or process file ${filename}: ${err.message}`,
        );
        return null;
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (!result) continue;

      if (result.conflictLines.length > 0) {
        conflictFound = true;
        conflictBody += `**File:** \`${result.filename}\`\n`;
        conflictBody += result.conflictLines
          .map((lineNum) => `  - Conflict marker starting at line #${lineNum}`)
          .join("\n");
        conflictBody += "\n\n";
      }

      if (result.debugLinesFound.length > 0) {
        debugFound = true;
        debugBody += `**File:** \`${result.filename}\`\n`;
        debugBody += result.debugLinesFound
          .map((debug) => `  - Line #${debug.line}: \`${debug.content}\``)
          .join("\n");
        debugBody += "\n\n";
      }
    }
  } finally {
    core.endGroup();
  }

  if (conflictFound) {
    await leaveComment({
      octokit,
      pull_number: pr,
      body: conflictBody,
    });
  }

  if (debugFound) {
    await leaveComment({
      octokit,
      pull_number: pr,
      body: debugBody,
    });
  }

  if (conflictFound && debugFound) {
    throw Error(
      "Found merge conflict markers AND leftover debug calls. Please fix both.",
    );
  } else if (conflictFound) {
    throw Error("Found merge conflict markers. Please resolve them.");
  } else if (debugFound) {
    throw Error("Found leftover debug calls. Please remove them.");
  }
}
