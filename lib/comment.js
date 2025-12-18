import {context} from "@actions/github";
import * as core from "@actions/core";

const leaveComment = async ({
    octokit,
    owner = context.repo.owner,
    repo = context.repo.repo,
    pull_number,
    body,
}) => {
    try {
        if (!body) {
            throw new Error("There's no body for the comment.");
        }

        const {data} = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pull_number,
            body,
        });

        core.info(`Leaving comment on URL: ${data.html_url}`);

    } catch (error) {
        core.setFailed(`Error on leave comment: ${error.message}`);
        throw error;
    }
}

export default leaveComment;