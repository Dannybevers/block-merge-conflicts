import * as fs from "fs/promises";
import * as core from "@actions/core";
import * as github from "@actions/github";

import leaveComment from './lib/comment';

const commentTpl = `This Pull Request may conflict if the Pull Requests below are merged first.\n\n`;

async function run() {
  const token = core.getInput("token", { required: true });
  // skip if the check triggered by a non pull request
  if (!github.context.payload.pull_request) {
    return;
  }
  const pr = github.context.payload.pull_request.number;
  const octokit = github.getOctokit(token);
  const files = [];

  core.startGroup(
    `Fetching list of changed files for PR#${pr} from Github API`
  );
  try {
    for await (const response of octokit.paginate.iterator(
      octokit.rest.pulls.listFiles.endpoint.merge({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr,
      })
    )) {
      if (response.status !== 200) {
        throw new Error(
          `Fetching list of changed files from GitHub API failed with error code ${response.status}`
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
  let found = false;
  core.startGroup(`Searching for the conflict markers in changed files`);
  try {
    let body = commentTpl;
    const promises = files.map((filename) => {
      return fs.readFile(filename).then((buf) => {
        core.info(`Analyzing the "${filename}" file`);
        let idx1 = -1;
        let idx2 = -1;
        let idx3 = -1;
        buf
          .toString()
          .split(/\r?\n/)
          .every((line, i) => {
            if (idx1 === -1) {
              if (line.startsWith("<<<<<<<")) {
                idx1 = i;
              }
              return true;
            }
            if (idx2 === -1) {
              if (line.startsWith("=======")) {
                idx2 = i;
              }
              return true;
            }
            if (line.startsWith(">>>>>>>")) {
              idx3 = i;
              found = true;
              return false;
            }
            return true;
          });

        if (idx1 !== -1 && idx2 !== -1 && idx3 !== -1) {
          core.info(`Conflict in "${filename}" file`);
          body += `#${idx1 + 1}\nConflictable file: ${filename}`;
        }
      });
    });

    if(found) {
      // leave comment on current PR
      await leaveComment({
        octokit,
        pull_number: pr,
        body,
      });
    }

    await Promise.all(promises);
  } finally {
    core.endGroup();
  }
  if (found) {
    throw Error("Found merge conflict markers");
  }
}

try {
  await run();
} catch (error) {
  core.setFailed(error.message);
}
