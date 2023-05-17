import { context} from "@actions/github";

const leaveComment = async ({
    octokit,
    owner = context.repo.owner,
    repo = context.repo.repo,
    pull_number,
    body,
  }) => {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body,
  });
}

export default leaveComment;
